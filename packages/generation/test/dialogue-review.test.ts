/**
 * Dialogue review + repair orchestration tests (M6).
 *
 * Proves:
 *  - the merged review surfaces BOTH deterministic + AI findings
 *  - the leak detector fires on a planted forbidden-fact reference (headline)
 *  - required-fact-missing fires
 *  - repair preserves locked lines byte-for-byte
 *  - invalid provider output is rejected (constraint #12)
 */
import { MockProvider } from "@df/providers";
import type { DialogueArtifact, SceneSpecification } from "@df/schemas";
import { describe, expect, it } from "vitest";


import { reviewDraft, repairDraft, GenerationError } from "../src/index.js";

const mock = new MockProvider();

const scene: SceneSpecification = {
  id: "scene_test",
  version: 1,
  contentHash: "sha256:test",
  label: "Test",
  sceneType: "boss-first-encounter",
  participants: [{ characterId: "char_boss", stateId: "state_boss__pre", role: "speaker" }],
  purpose: { value: "Test", lang: "en" },
  requiredFacts: ["fact_required"],
  forbiddenRevelations: ["fact_secret"],
  emotionalProgression: [{ order: 1, emotion: "judgement" }],
  maxLength: "short",
};

function makeDraft(lines: { id: string; value: string; locked?: boolean }[]): DialogueArtifact {
  return {
    id: "dlg_test",
    version: 1,
    contentHash: "sha256:test-draft",
    sceneId: "scene_test",
    beatPlanId: "beat_test",
    contextPackageId: "ctx_test",
    approvalStatus: "draft",
    lines: lines.map((l) => ({
      id: l.id,
      speakerId: "char_boss",
      text: { value: l.value, lang: "en" },
      humanEdited: false,
      ...(l.locked ? { lock: { state: "hard-locked" as const } } : {}),
    })),
    provenance: {
      scene: { id: "scene_test", version: 1 },
      characterProfiles: [], characterStates: [], relationships: [], factions: [], canonSnapshot: [],
      schemaVersion: "1.0.0", promptTemplateVersion: "mock-1.0.0",
      provider: "mock", model: "mock", reasoningEffort: "normal", generatedAt: "2026-08-06T00:00:00.000Z",
    },
    stale: false,
  };
}

describe("reviewDraft — merged findings (deterministic + AI)", () => {
  it("surfaces BOTH a deterministic leak AND an AI voice-drift finding", async () => {
    const draft = makeDraft([
      { id: "l1", value: "You seek fact_secret, the hidden origin." }, // forbidden + generic-ish
      { id: "l2", value: "Foolish mortal! You dare challenge my immense power?" }, // generic-fantasy
    ]);
    const { review } = await reviewDraft(mock, { draft, scene, contextPackage: {} });
    const types = review.findings.map((f) => f.type);
    // Deterministic: forbidden leak
    expect(types.some((t) => t === "forbiddenRevelations")).toBe(true);
    // AI: generic-fantasy
    expect(types.some((t) => t === "generic-fantasy-phrasing")).toBe(true);
    expect(review.passed).toBe(false); // blocker from the leak
  });
});

describe("reviewDraft — headline deterministic checks", () => {
  it("flags a missing required fact", async () => {
    const draft = makeDraft([{ id: "l1", value: "Some line with no required content." }]);
    const { review } = await reviewDraft(mock, { draft, scene, contextPackage: {} });
    expect(review.findings.some((f) => f.type === "requiredFacts")).toBe(true);
  });

  it("passes when required facts present and no forbidden leaks", async () => {
    const draft = makeDraft([{ id: "l1", value: "We must discuss fact_required here." }]);
    const { review } = await reviewDraft(mock, { draft, scene, contextPackage: {} });
    // No deterministic blockers. (AI may still flag minor voice issues.)
    const blockers = review.findings.filter((f) => f.severity === "blocker");
    expect(blockers).toEqual([]);
  });
});

describe("repairDraft — preserves locked lines", () => {
  it("does not alter a hard-locked line even if a finding targets it", async () => {
    const draft = makeDraft([
      { id: "l1", value: "Foolish mortal! You dare challenge my immense power?", locked: true },
    ]);
    const { review } = await reviewDraft(mock, { draft, scene, contextPackage: {} });
    const { draft: repaired } = await repairDraft(mock, { draft, review, lockedLineIds: ["l1"] });
    expect(repaired.lines[0]!.text.value).toBe("Foolish mortal! You dare challenge my immense power?");
  });

  it("throws GenerationError if the provider breaks a lock (defence-in-depth)", async () => {
    const draft = makeDraft([{ id: "l1", value: "locked original", locked: true }]);
    // Adversarial provider that ignores locks.
    const adversarial = new MockProvider();
    const original = adversarial.repairDialogue.bind(adversarial);
    adversarial.repairDialogue = async (req) => {
      const res = await original(req);
      // Corrupt the locked line.
      res.draft.lines[0]!.text = { ...res.draft.lines[0]!.text, value: "BROKEN LOCK" };
      return res;
    };
    const { review } = await reviewDraft(mock, { draft, scene: { ...scene, requiredFacts: [], forbiddenRevelations: [] }, contextPackage: {} });
    await expect(
      repairDraft(adversarial, { draft, review, lockedLineIds: ["l1"] }),
    ).rejects.toBeInstanceOf(GenerationError);
  });
});
