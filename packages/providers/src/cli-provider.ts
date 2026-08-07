/**
 * ClaudeCliProvider — a real DialogueAIProvider backed by the Claude Code CLI.
 *
 * Runs `claude -p --output-format json --model <model>` as a subprocess, with
 * the prompt on stdin. Because the CLI is authenticated with the user's own
 * claude.ai subscription login, generation bills against that subscription's
 * usage limits — no API key, no per-token charges. This is for the tool
 * owner's individual use; anyone else running the app brings their own login
 * or API key (Anthropic ToS: subscription auth is for personal use only).
 *
 * Model policy: pinned to `claude-opus-5` unless overridden. The model id is
 * validated against a strict charset because it becomes a CLI argument.
 *
 * Contract discipline (same rules as the mock):
 *  - Every response is Zod-validated HERE before return; callers re-validate
 *    before storing (constraint #12, defence in depth).
 *  - On a validation failure the provider retries ONCE, feeding the model the
 *    validation error; a second failure throws with the raw output attached.
 *  - Forbidden facts are stated in the prompt as hard rules AND re-checked by
 *    the orchestrator's deterministic gate afterwards. The gate only catches
 *    literal id echoes; the semantic no-leak instruction lives here, in the
 *    prompt, and in the review pass (which is told to hunt for paraphrased
 *    leaks). No single layer is trusted alone.
 *
 * The subprocess runner is injectable so tests never spawn the real CLI.
 */

import { spawn } from "node:child_process";

import { CharacterProfile, DialogueArtifact, DialogueBeatPlan, DialogueReview } from "@df/schemas";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type {
  DialogueAIProvider,
  DialogueRequest,
  DialogueResult,
  ProfileRequest,
  ProfileResult,
  RepairRequest,
  RepairResult,
  ReviewRequest,
  ReviewResult,
  ScenePlanRequest,
  ScenePlanResult,
} from "./provider.js";

/** Runs the CLI: argv (after the command) + stdin, resolves with stdout. */
export type CliRunner = (args: string[], stdin: string, timeoutMs: number) => Promise<string>;

export interface ClaudeCliOptions {
  /** CLI command. Default "claude" (resolved via PATH). */
  command?: string;
  /** Model id. Default "claude-opus-5". */
  model?: string;
  /** Per-call timeout. Default 5 minutes (subscription CLI calls are slow). */
  timeoutMs?: number;
  /** Extra environment for the spawned CLI — how Anthropic-compatible
   * endpoints are selected (e.g. ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN
   * pointing the claude CLI at a GLM/Kimi coding-plan endpoint). Values are
   * held in memory only and never logged. */
  env?: Record<string, string>;
  /** Injectable subprocess runner (tests). Default spawns the real CLI. */
  runner?: CliRunner;
}

export class CliProviderError extends Error {
  constructor(
    message: string,
    /** Raw model/CLI output for diagnostics. Never stored as content. */
    readonly raw: unknown,
  ) {
    super(message);
    this.name = "CliProviderError";
  }
}

const MODEL_RE = /^[a-zA-Z0-9._:-]+$/;

export class ClaudeCliProvider implements DialogueAIProvider {
  readonly id = "claude-cli";
  readonly model: string;
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly runner: CliRunner;
  private readonly baseArgs: string[];

  constructor(options: ClaudeCliOptions = {}) {
    this.model = options.model ?? "claude-opus-5";
    if (!MODEL_RE.test(this.model)) {
      throw new Error(`invalid model id "${this.model}" (allowed: letters, digits, . _ : -)`);
    }
    this.command = options.command ?? "claude";
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.runner = options.runner ?? defaultRunner(this.command, options.env);
    // Custom endpoint (env override) → `--bare`: the CLI must never read the
    // saved claude.ai login, or it hangs on an interactive auth-conflict
    // prompt (headless can't answer it). Without an env override the saved
    // login IS the auth — no --bare there.
    this.baseArgs = ["-p", "--output-format", "json", "--model", this.model, ...(options.env ? ["--bare"] : [])];
  }

  async generateProfile(request: ProfileRequest): Promise<ProfileResult> {
    const slugNote = request.idSlug ? `Use the stable id "char_${request.idSlug}".` : `Derive a snake_case stable id from the brief, prefixed "char_".`;
    const profile = await this.callValidated(CharacterProfile, "CharacterProfile", [
      `Create a complete game-character profile from this author brief:`,
      JSON.stringify({ brief: request.brief, factionIds: request.factionIds ?? [] }, null, 2),
      slugNote,
      `Ground every field in the brief; invent supporting detail that stays consistent with it.`,
      `The voice section must be distinctive: concrete metaphor domain, 2+ sample lines in-register, 1+ anti-sample line showing what this character would NEVER say.`,
      `Set version to 1 and contentHash to "sha256:uncommitted".`,
    ]);
    return { profile, canonProposals: [] };
  }

  async planScene(request: ScenePlanRequest): Promise<ScenePlanResult> {
    const scene = request.scene;
    const beatPlan = await this.callValidated(DialogueBeatPlan, "DialogueBeatPlan", [
      `Plan the dialogue beats for this scene. A beat = one conversational move by one speaker with an intent and the fact ids it lands on.`,
      `Scene specification:`,
      JSON.stringify(scene, null, 2),
      `Compiled context (canon, participants, states — treat as the only truth):`,
      JSON.stringify(request.contextPackage ?? {}, null, 2),
      forbiddenRules(scene.forbiddenRevelations),
      `Every id in scene.requiredFacts must appear in some beat's landsOn. Follow the scene's emotionalProgression order.`,
      `Set id to "beat_${stripPrefix(scene.id, "scene_")}", sceneId to "${scene.id}", contextPackageId to "ctx_${stripPrefix(scene.id, "scene_")}", version to 1, contentHash to "sha256:uncommitted".`,
    ]);
    return { beatPlan, canonProposals: [] };
  }

  async generateDialogue(request: DialogueRequest): Promise<DialogueResult> {
    const { scene, beatPlan } = request;
    const draft = await this.callValidated(DialogueArtifact, "DialogueArtifact", [
      `Write the dialogue lines for this beat plan — one or more lines per beat, in beat order. Stay strictly in each speaker's voice as defined in the context's character profiles (register, metaphor domain, restraint). Never produce lines resembling any profile's antiSampleLines.`,
      `Scene:`,
      JSON.stringify(scene, null, 2),
      `Beat plan:`,
      JSON.stringify(beatPlan, null, 2),
      `Compiled context (the only truth — do not invent world facts; if a line would require a fact not in context, write around it):`,
      JSON.stringify(request.contextPackage ?? {}, null, 2),
      forbiddenRules(scene.forbiddenRevelations),
      `Set id to "dlg_${stripPrefix(scene.id, "scene_")}", sceneId to "${scene.id}", beatPlanId to "${beatPlan.id}", contextPackageId to "${beatPlan.contextPackageId}", approvalStatus to "draft", humanEdited false on every line, version 1, contentHash "sha256:uncommitted", stale false.`,
      `Set provenance to exactly: ${JSON.stringify(this.provenance(scene))}`,
    ]);
    return { draft, canonProposals: [] };
  }

  async reviewDialogue(request: ReviewRequest): Promise<ReviewResult> {
    const review = await this.callValidated(DialogueReview, "DialogueReview", [
      `Review this dialogue draft as a ruthless story editor. Emit findings (tier "ai-assisted") for:`,
      `- semantic-leak (severity "blocker"): a line STATES, PARAPHRASES, OR IMPLIES any forbidden fact from the context — even without using the fact's id or wording. This is the most important check; be suspicious of subtext.`,
      `- voice-drift (severity "minor"/"major"): a line breaks the speaker's register or resembles an antiSampleLine.`,
      `- repetition (severity "minor"): lines that repeat each other's wording or beats.`,
      `- canon-contradiction (severity "blocker"): a line contradicts a fact in the context.`,
      `Include a suggestedRepair for every finding where a better line exists. Empty findings array if the draft is clean.`,
      `Draft:`,
      JSON.stringify(request.draft, null, 2),
      `Context (includes forbidden facts if any):`,
      JSON.stringify(request.contextPackage ?? {}, null, 2),
      `Set id to "review_${stripPrefix(request.draft.id, "dlg_")}", artifactId "${request.draft.id}", sceneId "${request.draft.sceneId}", aiTierRan true, passed = (no blocker findings), reviewedAt "${new Date().toISOString()}", version 1, contentHash "sha256:uncommitted".`,
    ]);
    return { review };
  }

  async repairDialogue(request: RepairRequest): Promise<RepairResult> {
    const locked = new Set([
      ...request.lockedLineIds,
      ...request.draft.lines.filter((l) => l.lock?.state === "hard-locked").map((l) => l.id),
    ]);
    const draft = await this.callValidated(DialogueArtifact, "DialogueArtifact", [
      `Repair this dialogue draft: fix ONLY the lines named in the review's findings, guided by each finding's reason and suggestedRepair. Keep every other line byte-for-byte identical.`,
      locked.size > 0
        ? `HARD RULE: these line ids are LOCKED and must be returned byte-for-byte unchanged even if flagged: ${[...locked].join(", ")}.`
        : `No lines are locked.`,
      `Draft:`,
      JSON.stringify(request.draft, null, 2),
      `Review:`,
      JSON.stringify(request.review, null, 2),
      `Return the full artifact with identical ids/metadata (only line text may change).`,
    ]);
    return { draft };
  }

  /* ---------------------------------------------------------------- */

  private provenance(scene: { id: string; version: number }) {
    return {
      scene: { id: scene.id, version: scene.version },
      characterProfiles: [],
      characterStates: [],
      relationships: [],
      factions: [],
      canonSnapshot: [],
      schemaVersion: "1.0.0",
      promptTemplateVersion: "claude-cli-1.0.0",
      provider: this.id,
      model: this.model,
      reasoningEffort: "normal",
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * One prompt → CLI → JSON → Zod. On schema failure, retry once with the
   * validation error appended; then give up loudly.
   */
  private async callValidated<S extends z.ZodTypeAny>(
    schema: S,
    schemaName: string,
    sections: string[],
  ): Promise<z.infer<S>> {
    const jsonSchema = JSON.stringify(zodToJsonSchema(schema, schemaName));
    const basePrompt = [
      `You are the generation stage of Dialogue Foundry, a game-dialogue compiler. Your entire reply must be ONE JSON object — no markdown fences, no commentary before or after.`,
      ...sections,
      `The JSON object must validate against this JSON Schema (definition "${schemaName}"):`,
      jsonSchema,
    ].join("\n\n");

    let lastError = "";
    let lastRaw: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous reply failed schema validation: ${lastError}\nReturn ONLY the corrected JSON object.`;
      const stdout = await this.runner(this.baseArgs, prompt, this.timeoutMs);
      const raw = extractJsonObject(resultText(stdout));
      lastRaw = raw;
      const parsed = schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      const first = parsed.error.issues[0];
      lastError = `[${first?.code}] ${first?.path.join(".")}: ${first?.message}`;
    }
    throw new CliProviderError(`claude-cli returned an invalid ${schemaName} after retry: ${lastError}`, lastRaw);
  }
}

/* ------------------------------------------------------------------ */
/* Plumbing                                                           */
/* ------------------------------------------------------------------ */

function forbiddenRules(forbidden: string[]): string {
  if (forbidden.length === 0) return `This scene has no forbidden revelations.`;
  return [
    `HARD RULE — forbidden revelations. The following facts must NOT be stated, paraphrased, hinted at, or implied by any beat or line, in any wording:`,
    ...forbidden.map((f) => `  - ${f} ("${f.replace(/_/g, " ")}")`),
    `Characters who know these facts still conceal them; write the concealment, not the secret. A deterministic gate and a review pass will both check your output.`,
  ].join("\n");
}

/**
 * `--output-format json` wraps the reply in an envelope; the model's text is
 * in `.result`. Fall back to treating stdout as the text itself so a future
 * envelope change degrades gracefully instead of hard-failing.
 */
function resultText(stdout: string): string {
  try {
    const envelope = JSON.parse(stdout) as { result?: unknown };
    if (typeof envelope.result === "string") return envelope.result;
    if (envelope.result && typeof envelope.result === "object") return JSON.stringify(envelope.result);
  } catch {
    /* not an envelope — use stdout as-is */
  }
  return stdout;
}

/** Extract the first top-level JSON object from model text (fences tolerated). */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new CliProviderError("model reply contains no JSON object", text);
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    throw new CliProviderError(`model reply is not parseable JSON: ${(e as Error).message}`, text);
  }
}

/** Spawn the real CLI; prompt via stdin (no shell-quoting hazards). */
function defaultRunner(command: string, extraEnv?: Record<string, string>): CliRunner {
  return (args, stdin, timeoutMs) =>
    new Promise((fulfil, reject) => {
      // Windows: the npm `claude` shim is a .cmd, which Node refuses to spawn
      // without a shell. Build the command line ourselves (avoids the
      // DEP0190 args-with-shell warning); args are fixed flags + a
      // charset-validated model id, so quoting is safe.
      const win = process.platform === "win32";
      const env = extraEnv ? { ...process.env, ...extraEnv } : process.env;
      const cmdline = [command, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
      const child = win
        ? spawn(cmdline, { shell: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env })
        : spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new CliProviderError(`claude CLI timed out after ${timeoutMs}ms`, stderr));
      }, timeoutMs);
      child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
      child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new CliProviderError(`failed to spawn "${command}": ${e.message}`, stderr));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) fulfil(stdout);
        else {
          // In -p mode the CLI reports run failures (auth, endpoint errors)
          // on STDOUT; flag errors go to stderr. Surface both.
          const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join(" | ").slice(0, 500);
          reject(new CliProviderError(`${command} exited ${code}: ${detail || "(no output)"}`, { stdout, stderr }));
        }
      });
      child.stdin.end(stdin, "utf8");
    });
}

/** Strip a `<prefix>` from an id when present. */
function stripPrefix(id: string, prefix: string): string {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}
