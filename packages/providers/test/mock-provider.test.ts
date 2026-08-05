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
import { CharacterProfile } from "@df/schemas";
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

describe("MockProvider — M4/M6 methods throw clearly", () => {
  it("planScene throws not-implemented-until-M4", async () => {
    await expect(provider.planScene({ scene: {} as never, contextPackage: {} })).rejects.toThrow(/M4/);
  });
  it("generateDialogue throws not-implemented-until-M4", async () => {
    await expect(
      provider.generateDialogue({ scene: {} as never, beatPlan: {} as never, contextPackage: {} }),
    ).rejects.toThrow(/M4/);
  });
  it("reviewDialogue / repairDialogue throw not-implemented-until-M6", async () => {
    await expect(provider.reviewDialogue({ draft: {} as never, contextPackage: {} })).rejects.toThrow(/M6/);
    await expect(provider.repairDialogue({ draft: {} as never, review: {} as never, lockedLineIds: [] })).rejects.toThrow(/M6/);
  });
});

describe("mockProvider singleton", () => {
  it("is a DialogueAIProvider", () => {
    expect(mockProvider.id).toBe("mock");
  });
});
