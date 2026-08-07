// Dialogue Foundry studio — local backend service.
//
// A deliberately tiny HTTP server (no framework) that exposes @df/storage over
// JSON endpoints. Local only: binds to 127.0.0.1, no auth. The UI reaches it
// through the Vite dev proxy (same origin), so the server sends NO CORS
// headers: a cross-origin page that fetches this port gets an opaque failure.
// The UI never imports node:fs; it talks to this service (constraint #9).
//
// Browser hardening (localhost binding alone does not stop the user's own
// browser from being used against them):
//  - Requests carrying an Origin header not in the allowlist are refused
//    (403) BEFORE the body is read — a drive-by page can't trigger side
//    effects even with a no-cors POST.
//  - POST bodies must be `application/json` (415 otherwise) — a cross-origin
//    page can't send that content-type without a CORS preflight, which fails.
//  - /api/load and /api/save resolve `dir` and refuse anything outside the
//    allowed roots (repo root by default; extend via DF_PROJECT_ROOT, which
//    accepts multiple paths joined with the OS path delimiter).
//
// Endpoints (all JSON in/out):
//   POST /api/load              { dir }                          -> { data, errors }
//   POST /api/save              { dir, project }                 -> { errors }
//   POST /api/integrity         { project }                      -> { issues }
//   POST /api/generate-profile  { brief, idSlug? }               -> { draft } | { error }
//   POST /api/generate-dialogue { scene, contextPackage? }       -> { beatPlan, draft } | { error }
//   POST /api/validate-quest   { quest, scenes? }                -> { issues, branches }
//   POST /api/review-dialogue  { draft, scene, contextPackage? } -> { review }
//   POST /api/repair-dialogue  { draft, review, lockedLineIds? } -> { draft }
//   POST /api/export           { project, format?: 'json'|'csv' } -> { json } | { csv }
//   GET  /api/health                                             -> { ok: true }
//
// Runs against the BUILT @df/storage dist. Start after `pnpm --filter
// @df/storage build`. Port defaults to 7317; override with DF_PORT.
//
// Provider selection: MockProvider by default (offline, deterministic).
// Set DF_PROVIDER=claude to use the Claude Code CLI on your subscription
// (model pinned to claude-opus-5 unless DF_CLAUDE_MODEL overrides it).

import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileContext } from "@df/context-compiler";
import { exportJson, exportCsv } from "@df/exporters";
import { generateProfileDraft, planAndDraft, reviewDraft, repairDraft } from "@df/generation";
import { mockProvider, ClaudeCliProvider } from "@df/providers";
import { readProject, writeProject, checkIntegrity } from "@df/storage";
import { validateKnowledge, validateQuest, simulatePlaythrough } from "@df/validators";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DF_PORT ?? 7317);
const VITE_PORT = Number(process.env.DF_VITE_PORT ?? 5317);

// Provider comes from `--provider claude` / `--provider=claude` (friendlier
// on Windows, where FOO=bar prefixes don't work) or the DF_PROVIDER env var.
const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

const providerName = flag("provider") ?? process.env.DF_PROVIDER ?? "mock";
if (!["mock", "claude"].includes(providerName)) {
  console.error(`[studio] unknown provider "${providerName}" (use mock or claude)`);
  process.exit(1);
}
// The CLI command is overridable (--claude-cmd / DF_CLAUDE_CMD) so any
// Claude-Code-compatible CLI (kimi, glm, etc. — same -p/--output-format
// flags) can sit behind the same provider. Pair it with --model.
//
// `provider` is MUTABLE: POST /api/provider switches it at runtime (the UI's
// provider picker). Flags/env only set the boot default; a restart reverts.
let provider =
  providerName === "claude"
    ? new ClaudeCliProvider({
        model: flag("model") ?? process.env.DF_CLAUDE_MODEL,
        command: flag("claude-cmd") ?? process.env.DF_CLAUDE_CMD,
      })
    : mockProvider;

// A CLI command becomes part of a spawned command line (shell:true on
// Windows) — keep it to path-ish characters, no shell metacharacters.
const CLI_CMD_RE = /^[a-zA-Z0-9 ._\\/:-]+$/;

// Origins allowed to make requests (the Vite dev UI, plus DF_ALLOW_ORIGIN).
// Requests with NO Origin header (curl, tests, local scripts) are allowed —
// they aren't a browser and can already do anything this server can.
const ALLOWED_ORIGINS = new Set(
  [
    `http://localhost:${VITE_PORT}`,
    `http://127.0.0.1:${VITE_PORT}`,
    process.env.DF_ALLOW_ORIGIN,
  ].filter(Boolean),
);

// Filesystem roots /api/load and /api/save may touch.
const ALLOWED_ROOTS = (process.env.DF_PROJECT_ROOT ?? "")
  .split(delimiter)
  .filter(Boolean)
  .map((p) => resolve(p));
if (ALLOWED_ROOTS.length === 0) ALLOWED_ROOTS.push(resolve(here, "..", "..", ".."));

function insideAllowedRoots(absolute) {
  return ALLOWED_ROOTS.some((root) => {
    const rel = relative(root, absolute);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
}

// Optional sprite-asset root for the preview room (--assets / DF_ASSET_DIR).
// The assets are NOT part of this repo (the user's packs carry a
// private-use license); the studio only reads them from local disk.
const ASSET_DIR = (() => {
  const dir = flag("assets") ?? process.env.DF_ASSET_DIR;
  return dir ? resolve(dir) : null;
})();

function insideAssetDir(absolute) {
  if (!ASSET_DIR) return false;
  const rel = relative(ASSET_DIR, absolute);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Build the preview sprite index from the packs under ASSET_DIR:
 *   assembler-pack/       players + 57 enemy families (24px sheets)
 *   assembler-boss-pack/  13 bosses (48px per-animation sheets)
 * Every `sheet` is a path relative to ASSET_DIR, served via /api/assets/.
 * Missing packs simply produce empty lists — the preview falls back to
 * placeholder rectangles, it never errors.
 */
async function buildAssetIndex() {
  if (!ASSET_DIR) return { available: false, players: [], enemies: [], bosses: [] };
  const index = { available: true, players: [], enemies: [], bosses: [] };

  const playersDir = join(ASSET_DIR, "assembler-pack", "players");
  if (existsSync(playersDir)) {
    for (const f of await readdir(playersDir)) {
      if (f.endsWith(".png")) {
        index.players.push({ id: f.replace(/^character-|\.png$/g, ""), sheet: `assembler-pack/players/${f}` });
      }
    }
  }

  const famIndex = join(ASSET_DIR, "assembler-pack", "indexes", "enemy-families.json");
  if (existsSync(famIndex)) {
    const parsed = JSON.parse(await readFile(famIndex, "utf8"));
    for (const fam of parsed.families ?? []) {
      const variant = fam.variants?.find((v) => v.id === fam.default_variant) ?? fam.variants?.[0];
      if (variant?.sheet) {
        index.enemies.push({ id: fam.id, name: fam.name ?? fam.id, sheet: `assembler-pack/${variant.sheet}` });
      }
    }
  }

  const bossesDir = join(ASSET_DIR, "assembler-boss-pack", "bosses");
  if (existsSync(bossesDir)) {
    for (const id of await readdir(bossesDir)) {
      const idle = `assembler-boss-pack/bosses/${id}/${id}-animation-v1-animation-idle.png`;
      if (existsSync(join(ASSET_DIR, idle))) {
        index.bosses.push({ id, sheet: idle });
      }
    }
  }
  return index;
}

const ASSET_TYPES = { ".png": "image/png", ".json": "application/json" };

/** Subdirectories of dir, skipping hidden/dependency folders. Never throws. */
async function safeSubdirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !["node_modules", "dist", "coverage"].includes(e.name))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

// Resolve a client-supplied dir. Relative paths resolve against the FIRST
// allowed root (the repo root by default), never against process.cwd() —
// the server must behave the same no matter which directory launched it.
function resolveDir(dir) {
  return isAbsolute(dir) ? resolve(dir) : resolve(ALLOWED_ROOTS[0], dir);
}

/** Read and parse a JSON request body. */
function readBody(req) {
  return new Promise((fulfil, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        fulfil(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  // Deliberately NO Access-Control-Allow-Origin: browser pages on other
  // origins must not be able to read responses. The UI is same-origin via
  // the Vite proxy and needs no CORS.
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

const server = createServer(async (req, res) => {
  // Refuse cross-origin browser requests before touching the body. A no-cors
  // POST from a web page always carries its Origin; requests without one
  // come from non-browser clients (curl, tests, the Vite proxy passes the
  // UI's own origin through).
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return send(res, 403, { error: `origin not allowed: ${origin}` });
  }
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "POST" && !/^application\/json\b/.test(req.headers["content-type"] ?? "")) {
    return send(res, 415, { error: "content-type must be application/json" });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/api/health") {
      return send(res, 200, {
        ok: true,
        service: "dialogue-foundry-studio",
        provider: provider.id,
        model: provider.model,
        assets: !!ASSET_DIR,
      });
    }

    if (req.method === "POST" && path === "/api/provider") {
      // Runtime provider switch (the UI picker). Local tool, origin-fenced;
      // the command charset check keeps the spawned command line boring.
      const { name, command, model } = await readBody(req);
      if (name === "mock") {
        provider = mockProvider;
        return send(res, 200, { provider: provider.id });
      }
      if (name === "claude") {
        if (command !== undefined && (typeof command !== "string" || !CLI_CMD_RE.test(command))) {
          return send(res, 400, { error: "command may only contain letters, digits, spaces, . _ / \\ : -" });
        }
        try {
          provider = new ClaudeCliProvider({ command, model });
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
        return send(res, 200, { provider: provider.id, model: provider.model, command: command ?? "claude" });
      }
      return send(res, 400, { error: `unknown provider "${name}" (mock | claude)` });
    }

    if (req.method === "GET" && path === "/api/assets-index") {
      return send(res, 200, await buildAssetIndex());
    }

    if (req.method === "GET" && path === "/api/projects") {
      // Discover loadable projects: any directory up to two levels below an
      // allowed root that contains a project.json. Shallow by design.
      const found = [];
      for (const root of ALLOWED_ROOTS) {
        const candidates = [root];
        for (const level1 of await safeSubdirs(root)) {
          candidates.push(level1);
          candidates.push(...(await safeSubdirs(level1)));
        }
        for (const dir of candidates) {
          try {
            const parsed = JSON.parse(await readFile(join(dir, "project.json"), "utf8"));
            const rel = relative(ALLOWED_ROOTS[0], dir);
            found.push({
              dir: rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.replaceAll("\\", "/") : dir,
              id: parsed.id ?? "?",
              name: parsed.name ?? dir,
            });
          } catch {
            /* not a project dir */
          }
        }
      }
      return send(res, 200, { projects: found });
    }

    if (req.method === "GET" && path.startsWith("/api/assets/")) {
      // Static sprite serving, fenced to ASSET_DIR. png/json only.
      if (!ASSET_DIR) return send(res, 404, { error: "no asset dir configured (set DF_ASSET_DIR or --assets)" });
      const relPath = decodeURIComponent(path.slice("/api/assets/".length));
      const absolute = resolve(ASSET_DIR, relPath);
      const type = ASSET_TYPES[extname(absolute).toLowerCase()];
      if (!insideAssetDir(absolute) || !type) {
        return send(res, 403, { error: "asset path not allowed" });
      }
      if (!existsSync(absolute)) return send(res, 404, { error: "asset not found" });
      res.writeHead(200, { "content-type": type, "cache-control": "max-age=3600" });
      createReadStream(absolute).pipe(res);
      return;
    }

    if (req.method === "POST" && path === "/api/load") {
      const { dir } = await readBody(req);
      if (typeof dir !== "string") return send(res, 400, { error: "missing dir" });
      const absolute = resolveDir(dir);
      if (!insideAllowedRoots(absolute)) {
        return send(res, 403, { error: "dir is outside the allowed project roots (set DF_PROJECT_ROOT to extend)" });
      }
      const result = await readProject(absolute);
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/save") {
      const { dir, project } = await readBody(req);
      if (typeof dir !== "string" || !project) return send(res, 400, { error: "missing dir or project" });
      const absolute = resolveDir(dir);
      if (!insideAllowedRoots(absolute)) {
        return send(res, 403, { error: "dir is outside the allowed project roots (set DF_PROJECT_ROOT to extend)" });
      }
      await writeProject(absolute, project);
      return send(res, 200, { errors: [] });
    }

    if (req.method === "POST" && path === "/api/integrity") {
      const { project } = await readBody(req);
      if (!project) return send(res, 400, { error: "missing project" });
      const issues = checkIntegrity(project);
      return send(res, 200, { issues });
    }

    if (req.method === "POST" && path === "/api/generate-profile") {
      // Returns a DRAFT for human review; nothing is persisted. The caller
      // (UI) stages it for accept/reject. Provider per DF_PROVIDER.
      const { brief, idSlug } = await readBody(req);
      if (typeof brief !== "string" || !brief.trim()) {
        return send(res, 400, { error: "missing or empty brief" });
      }
      const draft = await generateProfileDraft(provider, { brief, idSlug });
      return send(res, 200, { draft });
    }

    if (req.method === "POST" && path === "/api/generate-dialogue") {
      // Two-call pipeline (plan then draft) with the forbidden-facts gate.
      // Returns a beatPlan + draft for review; nothing persisted. Throws ->
      // 500 if the gate rejects (forbidden leak) or the output is invalid.
      //
      // When the caller sends the loaded `project`, Stage 1 runs first: the
      // context compiler resolves participants' profiles/states, permitted
      // fact statements, factions, and relationship named states, and the
      // provider writes from THAT — not from a bare scene. The ref-only
      // ContextPackage + compile warnings come back for inspection.
      const { scene, project, contextPackage } = await readBody(req);
      if (!scene) return send(res, 400, { error: "missing scene" });
      let snapshot = contextPackage ?? {};
      let compiled = null;
      let warnings = [];
      if (project) {
        const compileResult = compileContext(
          {
            characters: project.characters ?? [],
            states: project.states ?? [],
            canonFacts: project.canonFacts ?? [],
            factions: project.factions ?? [],
            relationships: project.relationships ?? [],
            terminology: project.terminology ?? [],
          },
          scene,
        );
        snapshot = compileResult.snapshot;
        compiled = compileResult.contextPackage;
        warnings = compileResult.warnings;

        // M11: quest gating runs automatically when the scene is stage-bound —
        // an early-revelation mistake surfaces here, not after the model call.
        const bound = scene.boundQuestStages ?? [];
        if (bound.length > 0) {
          for (const quest of project.quests ?? []) {
            if (!quest.stages.some((s) => bound.includes(s.id))) continue;
            for (const issue of validateKnowledge(quest, [scene]).issues) {
              warnings.push({ ref: String(issue.value ?? issue.from), reason: `quest gating (${quest.id}): ${issue.reason}` });
            }
          }
        }
      }
      const result = await planAndDraft(provider, scene, snapshot);
      return send(res, 200, { ...result, contextPackage: compiled, warnings });
    }

    if (req.method === "POST" && path === "/api/validate-quest") {
      // M5: run all three quest validators (structure, knowledge progression,
      // playthrough). Returns combined issues + branch traces. Pure, no I/O.
      const { quest, scenes } = await readBody(req);
      if (!quest) return send(res, 400, { error: "missing quest" });
      const structure = validateQuest(quest);
      const knowledge = validateKnowledge(quest, scenes ?? []);
      const playthrough = simulatePlaythrough(quest);
      return send(res, 200, {
        issues: [...structure.issues, ...knowledge.issues, ...playthrough.issues],
        branches: playthrough.branches,
      });
    }

    if (req.method === "POST" && path === "/api/review-dialogue") {
      // M6: deterministic + AI-assisted review of a draft. Returns a DialogueReview.
      const { draft, scene, contextPackage, previousDraft } = await readBody(req);
      if (!draft || !scene) return send(res, 400, { error: "missing draft or scene" });
      const result = await reviewDraft(provider, { draft, scene, contextPackage: contextPackage ?? {}, previousDraft });
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/repair-dialogue") {
      // M6: apply suggested repairs, preserving locked lines. Returns patched draft.
      const { draft, review, lockedLineIds } = await readBody(req);
      if (!draft || !review) return send(res, 400, { error: "missing draft or review" });
      const result = await repairDraft(provider, { draft, review, lockedLineIds: lockedLineIds ?? [] });
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/export") {
      // M7: generic JSON + CSV export. Only accepted dialogue leaves the tool.
      const { project, format } = await readBody(req);
      if (!project) return send(res, 400, { error: "missing project" });
      if (format === "csv") {
        return send(res, 200, { csv: exportCsv(project) });
      }
      return send(res, 200, { json: exportJson(project) });
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[studio] backend on http://127.0.0.1:${PORT}  provider=${provider.id}${provider.model ? ` model=${provider.model}` : ""}`);
});
