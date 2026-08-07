// ClaudeCliProvider tests — fully offline. The CLI runner is injected; no
// subprocess is ever spawned, no network touched. What IS exercised for real:
// argv construction, envelope parsing, fence stripping, Zod validation,
// the retry-with-error-feedback loop, and prompt content (forbidden rules,
// locked-line rules, schema embedding).
import { describe, expect, it } from "vitest";

import { ClaudeCliProvider, CliProviderError, extractJsonObject, type CliRunner } from "../src/cli-provider.js";
import { MockProvider } from "../src/mock-provider.js";

/** Wrap model text in the `--output-format json` envelope. */
const envelope = (result: string) => JSON.stringify({ type: "result", subtype: "success", result });

/** A runner that replays canned replies and records every call. */
function fakeRunner(replies: string[]) {
  const calls: { args: string[]; stdin: string }[] = [];
  const runner: CliRunner = async (args, stdin) => {
    calls.push({ args, stdin });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply === undefined) throw new Error("fake runner exhausted");
    return reply;
  };
  return { runner, calls };
}

/** A guaranteed-valid profile, straight from the mock's own templates. */
async function validProfile() {
  const { profile } = await new MockProvider().generateProfile({ brief: "ancient stone boss", idSlug: "cli_test" });
  return profile;
}

const scene = {
  id: "scene_cli_test",
  version: 1,
  contentHash: "sha256:t",
  label: "CLI test",
  sceneType: "boss-first-encounter",
  participants: [{ characterId: "char_b", stateId: "state_b__pre", role: "speaker" }],
  purpose: { value: "test", lang: "en" },
  requiredFacts: ["fact_alpha"],
  forbiddenRevelations: ["fact_hidden_truth"],
  emotionalProgression: [{ order: 1, emotion: "judgement" }],
  maxLength: "short",
} as const;

describe("ClaudeCliProvider — construction", () => {
  it("defaults to claude-opus-5", () => {
    expect(new ClaudeCliProvider().model).toBe("claude-opus-5");
  });

  it("rejects a model id with shell-hostile characters", () => {
    expect(() => new ClaudeCliProvider({ model: "opus; rm -rf /" })).toThrow(/invalid model id/);
  });
});

describe("ClaudeCliProvider — generateProfile", () => {
  it("passes -p/--output-format json/--model and returns the validated profile", async () => {
    const profile = await validProfile();
    const { runner, calls } = fakeRunner([envelope(JSON.stringify(profile))]);
    const provider = new ClaudeCliProvider({ runner });

    const result = await provider.generateProfile({ brief: "ancient stone boss", idSlug: "cli_test" });

    expect(result.profile.id).toBe(profile.id);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual(["-p", "--output-format", "json", "--model", "claude-opus-5"]);
    expect(calls[0]!.stdin).toContain("CharacterProfile");
    expect(calls[0]!.stdin).toContain("ancient stone boss");
  });

  it("tolerates markdown fences around the JSON", async () => {
    const profile = await validProfile();
    const { runner } = fakeRunner([envelope("Here you go:\n```json\n" + JSON.stringify(profile) + "\n```")]);
    const result = await new ClaudeCliProvider({ runner }).generateProfile({ brief: "boss" });
    expect(result.profile.identity.name).toBe(profile.identity.name);
  });

  it("retries once with the validation error, then succeeds", async () => {
    const profile = await validProfile();
    const invalid = JSON.stringify({ ...profile, id: "NOT A VALID ID" });
    const { runner, calls } = fakeRunner([envelope(invalid), envelope(JSON.stringify(profile))]);

    const result = await new ClaudeCliProvider({ runner }).generateProfile({ brief: "boss" });

    expect(result.profile.id).toBe(profile.id);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.stdin).toContain("failed schema validation");
  });

  it("throws CliProviderError after two invalid replies", async () => {
    const { runner, calls } = fakeRunner([envelope("{}")]);
    await expect(new ClaudeCliProvider({ runner }).generateProfile({ brief: "boss" })).rejects.toThrow(CliProviderError);
    expect(calls).toHaveLength(2); // initial + one retry, then gave up
  });

  it("honours a model override", async () => {
    const profile = await validProfile();
    const { runner, calls } = fakeRunner([envelope(JSON.stringify(profile))]);
    await new ClaudeCliProvider({ runner, model: "claude-sonnet-5" }).generateProfile({ brief: "boss" });
    expect(calls[0]!.args).toContain("claude-sonnet-5");
  });

  it("adds --bare only when a custom endpoint env is set (M16 auth-conflict fix)", async () => {
    const profile = await validProfile();
    const withEnv = fakeRunner([envelope(JSON.stringify(profile))]);
    await new ClaudeCliProvider({ runner: withEnv.runner, env: { ANTHROPIC_BASE_URL: "https://x.example" } }).generateProfile({ brief: "boss" });
    expect(withEnv.calls[0]!.args).toContain("--bare");

    const withoutEnv = fakeRunner([envelope(JSON.stringify(profile))]);
    await new ClaudeCliProvider({ runner: withoutEnv.runner }).generateProfile({ brief: "boss" });
    expect(withoutEnv.calls[0]!.args).not.toContain("--bare");
  });
});

describe("ClaudeCliProvider — planScene / generateDialogue", () => {
  const beatPlan = {
    id: "beat_cli_test",
    version: 1,
    contentHash: "sha256:uncommitted",
    sceneId: "scene_cli_test",
    contextPackageId: "ctx_cli_test",
    beats: [{ order: 1, speakerId: "char_b", intent: "Convey fact_alpha.", landsOn: ["fact_alpha"], emotion: "judgement" }],
    avoids: [],
  };

  it("planScene states the forbidden facts as hard rules in the prompt", async () => {
    const { runner, calls } = fakeRunner([envelope(JSON.stringify(beatPlan))]);
    const result = await new ClaudeCliProvider({ runner }).planScene({ scene, contextPackage: {} });
    expect(result.beatPlan.id).toBe("beat_cli_test");
    expect(calls[0]!.stdin).toContain("HARD RULE — forbidden revelations");
    expect(calls[0]!.stdin).toContain("fact_hidden_truth");
    expect(calls[0]!.stdin).toContain("hidden truth"); // readable form too
  });

  it("generateDialogue validates the draft and embeds provenance instructions", async () => {
    const draft = {
      id: "dlg_cli_test",
      version: 1,
      contentHash: "sha256:uncommitted",
      sceneId: "scene_cli_test",
      beatPlanId: "beat_cli_test",
      contextPackageId: "ctx_cli_test",
      approvalStatus: "draft",
      lines: [{ id: "l1", beatOrder: 1, speakerId: "char_b", text: { value: "So. fact alpha. Weigh it.", lang: "en" }, humanEdited: false }],
      provenance: {
        scene: { id: "scene_cli_test", version: 1 },
        characterProfiles: [], characterStates: [], relationships: [], factions: [], canonSnapshot: [],
        schemaVersion: "1.0.0", promptTemplateVersion: "claude-cli-1.0.0",
        provider: "claude-cli", model: "claude-opus-5", reasoningEffort: "normal",
        generatedAt: "2026-08-06T00:00:00.000Z",
      },
      stale: false,
    };
    const { runner, calls } = fakeRunner([envelope(JSON.stringify(draft))]);
    const result = await new ClaudeCliProvider({ runner }).generateDialogue({ scene, beatPlan, contextPackage: {} } as never);
    expect(result.draft.lines).toHaveLength(1);
    expect(calls[0]!.stdin).toContain('"provider":"claude-cli"');
    expect(calls[0]!.stdin).toContain("antiSampleLines");
  });
});

describe("ClaudeCliProvider — repairDialogue prompt safety", () => {
  it("names locked line ids as byte-for-byte immutable", async () => {
    const draft = {
      id: "dlg_lock", version: 1, contentHash: "sha256:x",
      sceneId: "scene_x", beatPlanId: "beat_x", contextPackageId: "ctx_x",
      approvalStatus: "draft",
      lines: [
        { id: "l1", speakerId: "char_b", text: { value: "Keep me.", lang: "en" }, humanEdited: true, lock: { state: "hard-locked", by: "human", at: "2026-08-06T00:00:00.000Z" } },
        { id: "l2", speakerId: "char_b", text: { value: "Fix me.", lang: "en" }, humanEdited: false },
      ],
      provenance: {
        scene: { id: "scene_x", version: 1 },
        characterProfiles: [], characterStates: [], relationships: [], factions: [], canonSnapshot: [],
        schemaVersion: "1", promptTemplateVersion: "1", provider: "claude-cli", model: "m",
        reasoningEffort: "normal", generatedAt: "2026-08-06T00:00:00.000Z",
      },
      stale: false,
    };
    const review = {
      id: "review_lock", version: 1, contentHash: "sha256:r",
      artifactId: "dlg_lock", sceneId: "scene_x", passed: false,
      findings: [{ id: "af1", tier: "ai-assisted", type: "voice-drift", severity: "minor", lineId: "l2", reason: "flat", suggestedRepair: { value: "Mend me, then.", lang: "en" } }],
      aiTierRan: true, reviewedAt: "2026-08-06T00:00:00.000Z",
    };
    const { runner, calls } = fakeRunner([envelope(JSON.stringify({ ...draft, lines: [draft.lines[0], { ...draft.lines[1], text: { value: "Mend me, then.", lang: "en" } }] }))]);

    const result = await new ClaudeCliProvider({ runner }).repairDialogue({ draft, review, lockedLineIds: ["l2"] } as never);

    expect(result.draft.lines[0]!.text.value).toBe("Keep me.");
    // Both the hard-locked line and the explicitly-passed one are named.
    expect(calls[0]!.stdin).toContain("LOCKED");
    expect(calls[0]!.stdin).toContain("l1");
    expect(calls[0]!.stdin).toMatch(/LOCKED[\s\S]*l2/);
  });
});

describe("extractJsonObject", () => {
  it("parses bare JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses fenced JSON with surrounding prose", () => {
    expect(extractJsonObject('Sure!\n```json\n{"a":1}\n```\nDone.')).toEqual({ a: 1 });
  });
  it("throws CliProviderError when no object exists", () => {
    expect(() => extractJsonObject("no json here")).toThrow(CliProviderError);
  });
});
