/**
 * MockProvider acceptance tests (M3).
 *
 * Proves the M3 criteria with zero network and zero API key (Q-A1):
 *  - generateProfile returns schema-valid CharacterProfile output
 *  - the brief classifier picks the right template
 *  - three distinct briefs produce three observably different characters
 *  - the provider is deterministic (same brief -> same profile)
 *  - not-yet-implemented methods throw clearly (M4/M6 land them)
 */
import { CharacterProfile, DialogueArtifact, DialogueBeatPlan } from "@df/schemas";
import { describe, expect, it } from "vitest";

import { MockProvider, mockProvider, type DialogueAIProvider } from "../src/index.js";

const provider: DialogueAIProvider = new MockProvider();

async function gen(brief: string, idSlug?: string) {
  const { profile } = await provider.generateProfile({ brief, idSlug });
  return profile;
}

describe("MockProvider.generateProfile — schema validity (constraint #12)", () => {
  it("returns a CharacterProfile that re-validates against the schema", async () => {
    const profile = await gen("Ancient stone golem boss, proud and judicial.", "hollow_king");
    const res = CharacterProfile.safeParse(profile);
    expect(res.success).toBe(true);
  });

  it("every canned template is schema-valid (the mock never emits garbage)", async () => {
    const briefs = [
      "undead lich boss, final boss of the ice dungeon",
      "tired foreman quest giver at the ridge-side inn",
      "chirpy wandering merchant who wants the seal broken",
      "a generic newcomer with no strong role",
    ];
    for (const brief of briefs) {
      const profile = await gen(brief);
      expect(CharacterProfile.safeParse(profile).success).toBe(true);
    }
  });

  it("produces a stable id from the slug", async () => {
    const profile = await gen("boss", "hornblende_golem");
    expect(profile.id).toBe("char_hornblende_golem");
  });
});

describe("MockProvider — brief classification", () => {
  it("boss keywords -> boss template", async () => {
    const p = await gen("ancient guardian golem boss", "x");
    expect(p.identity.gameplayRole).toBe("boss");
  });
  it("quest-giver keywords -> quest-giver template", async () => {
    const p = await gen("retired foreman quest giver", "y");
    expect(p.identity.gameplayRole).toBe("quest-giver");
  });
  it("merchant keywords -> merchant (ambient-npc) template", async () => {
    const p = await gen("wandering prospector merchant", "z");
    expect(p.identity.gameplayRole).toBe("ambient-npc");
  });
});

describe("MockProvider — three distinct characters (M3 human gate)", () => {
  it("boss / quest-giver / merchant are observably different", async () => {
    const boss = await gen("ancient stone boss", "b");
    const giver = await gen("retired foreman quest giver", "g");
    const merchant = await gen("wandering merchant", "m");

    // Different names
    const names = new Set([boss.identity.name, giver.identity.name, merchant.identity.name]);
    expect(names.size).toBe(3);

    // Different gameplay roles
    expect(boss.identity.gameplayRole).not.toBe(giver.identity.gameplayRole);
    expect(giver.identity.gameplayRole).not.toBe(merchant.identity.gameplayRole);

    // Different voice formality (the strongest contrast axis)
    const formalities = [boss.voice.formality, giver.voice.formality, merchant.voice.formality];
    expect(new Set(formalities).size).toBe(3);

    // Different sample-line text (no shared lines across the three)
    const allLines = [boss, giver, merchant].flatMap((p) => p.voice.sampleLines.map((l) => l.value));
    expect(new Set(allLines).size).toBe(allLines.length);
  });
});

describe("MockProvider — determinism", () => {
  it("same brief + slug -> identical profile", async () => {
    const a = await gen("ancient stone boss", "dup");
    const b = await gen("ancient stone boss", "dup");
    expect(a).toEqual(b);
  });
});

describe("MockProvider — planScene + generateDialogue (M4)", () => {
  // A minimal valid scene with two required facts and two emotional beats.
  const scene = {
    id: "scene_test_encounter",
    version: 1,
    contentHash: "sha256:test-scene",
    label: "Test encounter",
    sceneType: "boss-first-encounter" as const,
    participants: [{ characterId: "char_boss", stateId: "state_boss__pre", role: "speaker" as const }],
    purpose: { value: "Test purpose", lang: "en" },
    requiredFacts: ["fact_a", "fact_b"],
    forbiddenRevelations: ["fact_secret"],
    emotionalProgression: [
      { order: 1, emotion: "judgement" },
      { order: 2, emotion: "warning" },
    ],
    maxLength: "short" as const,
  };

  it("planScene produces a schema-valid beat plan with one beat per required fact + a closing beat", async () => {
    const { beatPlan } = await provider.planScene({ scene, contextPackage: {} });
    expect(DialogueBeatPlan.safeParse(beatPlan).success).toBe(true);
    // 2 required facts -> 2 content beats + 1 closing beat.
    expect(beatPlan.beats).toHaveLength(3);
    // Each content beat lands on exactly one required fact.
    expect(beatPlan.beats[0].landsOn).toEqual(["fact_a"]);
    expect(beatPlan.beats[1].landsOn).toEqual(["fact_b"]);
    // The closing beat lands on nothing.
    expect(beatPlan.beats[2].intent).toMatch(/Close/);
  });

  it("generateDialogue realizes every beat as a line, schema-valid", async () => {
    const { beatPlan } = await provider.planScene({ scene, contextPackage: {} });
    const { draft } = await provider.generateDialogue({ scene, beatPlan, contextPackage: {} });
    expect(DialogueArtifact.safeParse(draft).success).toBe(true);
    expect(draft.lines).toHaveLength(beatPlan.beats.length);
    // Every line maps to a beat order.
    expect(draft.lines.map((l) => l.beatOrder)).toEqual(beatPlan.beats.map((b) => b.order));
  });

  it("the draft references the permitted facts but NOT the forbidden one", async () => {
    const { beatPlan } = await provider.planScene({ scene, contextPackage: {} });
    const { draft } = await provider.generateDialogue({ scene, beatPlan, contextPackage: {} });
    const allText = draft.lines.map((l) => l.text.value).join(" ");
    // The mock renders fact ids as readable text (underscores -> spaces).
    expect(allText).toContain("fact a");
    expect(allText).toContain("fact b");
    expect(allText).not.toContain("fact secret"); // the mock never names forbidden facts
    expect(allText).not.toContain("fact_secret");
  });
});

describe("MockProvider — reviewDialogue + repairDialogue (M6)", () => {

  // A draft with one generic-fantasy line (voice drift) + a clean line.
  const draft = {
    id: "dlg_test_m6",
    version: 1,
    contentHash: "sha256:draft-m6",
    sceneId: "scene_test_m6",
    beatPlanId: "beat_test_m6",
    contextPackageId: "ctx_test_m6",
    approvalStatus: "draft" as const,
    lines: [
      { id: "l1", speakerId: "char_boss", text: { value: "Foolish mortal! You dare challenge my immense power?", lang: "en" }, humanEdited: false },
      { id: "l2", speakerId: "char_boss", text: { value: "The stone outlives the sculptor.", lang: "en" }, humanEdited: false },
    ],
    provenance: {
      scene: { id: "scene_test_m6", version: 1 },
      characterProfiles: [], characterStates: [], relationships: [], factions: [], canonSnapshot: [],
      schemaVersion: "1.0.0", promptTemplateVersion: "mock-1.0.0",
      provider: "mock", model: "mock", reasoningEffort: "normal" as const, generatedAt: "2026-08-06T00:00:00.000Z",
    },
    stale: false,
  };

  it("reviewDialogue flags the generic-fantasy line with a suggested repair", async () => {
    const { review } = await provider.reviewDialogue({ draft, contextPackage: {} });
    expect(review.findings.length).toBeGreaterThan(0);
    const voice = review.findings.find((f) => f.type === "generic-fantasy-phrasing");
    expect(voice).toBeTruthy();
    expect(voice!.lineId).toBe("l1");
    expect(voice!.suggestedRepair?.value).toBeTruthy();
  });

  it("repairDialogue applies the suggested repair to the flagged line", async () => {
    const { review } = await provider.reviewDialogue({ draft, contextPackage: {} });
    const { draft: repaired } = await provider.repairDialogue({ draft, review, lockedLineIds: [] });
    const l1 = repaired.lines.find((l) => l.id === "l1")!;
    expect(l1.text.value).not.toContain("Foolish mortal");
  });

  it("repairDialogue preserves locked lines byte-for-byte", async () => {
    // Mark l2 as hard-locked on the draft; also pass it in lockedLineIds.
    const lockedDraft = { ...draft, lines: draft.lines.map((l) => l.id === "l2" ? { ...l, lock: { state: "hard-locked" as const } } : l) };
    const { review } = await provider.reviewDialogue({ draft: lockedDraft, contextPackage: {} });
    const { draft: repaired } = await provider.repairDialogue({ draft: lockedDraft, review, lockedLineIds: ["l2"] });
    const l2 = repaired.lines.find((l) => l.id === "l2")!;
    expect(l2.text.value).toBe("The stone outlives the sculptor.");
  });
});

describe("mockProvider singleton", () => {
  it("is a DialogueAIProvider", () => {
    expect(mockProvider.id).toBe("mock");
  });
});
