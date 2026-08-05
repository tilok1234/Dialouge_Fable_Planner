/**
 * Profile-generation flow tests (M3).
 *
 * Proves the orchestration's contracts:
 *  - valid provider output passes through as a schema-valid draft
 *  - INVALID provider output is rejected (validate-before-store, constraint #12)
 *    and never reaches the caller as a draft
 *  - canon proposals pass through for the inbox, never auto-applied
 *  - the flow is pure (no fs, no network — only the injected provider)
 */
import { MockProvider, type DialogueAIProvider, type ProfileResult } from "@df/providers";
import { CharacterProfile } from "@df/schemas";
import { describe, expect, it } from "vitest";

import { generateProfileDraft, GenerationError } from "../src/index.js";

const mock: DialogueAIProvider = new MockProvider();

describe("generateProfileDraft — happy path", () => {
  it("returns a schema-valid draft from a brief", async () => {
    const draft = await generateProfileDraft(mock, { brief: "ancient stone boss", idSlug: "hollow_king" });
    expect(CharacterProfile.safeParse(draft.profile).success).toBe(true);
    expect(draft.profile.id).toBe("char_hollow_king");
  });

  it("passes canon proposals through (the mock proposes none)", async () => {
    const draft = await generateProfileDraft(mock, { brief: "merchant" });
    expect(draft.canonProposals).toEqual([]);
  });
});

describe("generateProfileDraft — validate-before-store (constraint #12)", () => {
  it("rejects invalid provider output and throws GenerationError, never returns a draft", async () => {
    // A provider that returns a deliberately broken profile (missing required core).
    const broken: DialogueAIProvider = {
      id: "broken",
      async generateProfile(): Promise<ProfileResult> {
        // missing identity + core + voice -> safeParse will fail
        return {
          profile: { id: "char_x", version: 1, contentHash: "x" } as unknown as CharacterProfile,
          canonProposals: [],
        };
      },
      // unused here
      planScene: () => Promise.reject(new Error("no")),
      generateDialogue: () => Promise.reject(new Error("no")),
      reviewDialogue: () => Promise.reject(new Error("no")),
      repairDialogue: () => Promise.reject(new Error("no")),
    };

    await expect(generateProfileDraft(broken, { brief: "x" })).rejects.toBeInstanceOf(GenerationError);
    await expect(generateProfileDraft(broken, { brief: "x" })).rejects.toThrow(/invalid CharacterProfile/);
  });

  it("GenerationError carries the raw output for diagnostics", async () => {
    const broken: DialogueAIProvider = {
      id: "broken",
      async generateProfile(): Promise<ProfileResult> {
        return { profile: { no: "good" } as unknown as CharacterProfile, canonProposals: [] };
      },
      planScene: () => Promise.reject(new Error("no")),
      generateDialogue: () => Promise.reject(new Error("no")),
      reviewDialogue: () => Promise.reject(new Error("no")),
      repairDialogue: () => Promise.reject(new Error("no")),
    };
    try {
      await generateProfileDraft(broken, { brief: "x" });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationError);
      expect((e as GenerationError).raw).toEqual({ no: "good" });
    }
  });
});

describe("generateProfileDraft — purity (no fs / no network of its own)", () => {
  it("works with only the injected provider (mock = no key, no socket)", async () => {
    // If this completes, the flow introduced no hidden network/fs requirement.
    const draft = await generateProfileDraft(mock, { brief: "quest giver" });
    expect(draft.profile.identity.gameplayRole).toBe("quest-giver");
  });
});
