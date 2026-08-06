/**
 * Dialogue-generation orchestration tests (M4).
 *
 * Proves:
 *  - planSceneDraft returns a schema-valid beat plan
 *  - generateDialogueDraft returns a schema-valid draft that realizes every beat
 *  - the KNOWLEDGE GATE: a draft referencing a forbidden fact is rejected
 *    (this is the contract's headline correctness check, tested adversarially)
 *  - invalid provider output is rejected (constraint #12)
 */
import type {
  DialogueAIProvider,
  DialogueRequest,
  DialogueResult,
  ScenePlanRequest,
  ScenePlanResult,
} from "@df/providers";
import { MockProvider } from "@df/providers";
import type { DialogueArtifact, SceneSpecification } from "@df/schemas";
import { describe, expect, it } from "vitest";

import { generateProfileDraft , planSceneDraft, generateDialogueDraft, planAndDraft, GenerationError } from "../src/index.js";


const mock = new MockProvider();

const scene: SceneSpecification = {
  id: "scene_test",
  version: 1,
  contentHash: "sha256:test",
  label: "Test",
  sceneType: "boss-first-encounter",
  participants: [{ characterId: "char_boss", stateId: "state_boss__pre", role: "speaker" }],
  purpose: { value: "Test purpose", lang: "en" },
  requiredFacts: ["fact_required"],
  forbiddenRevelations: ["fact_forbidden"],
  emotionalProgression: [{ order: 1, emotion: "judgement" }],
  maxLength: "short",
};

describe("planSceneDraft", () => {
  it("returns a schema-valid beat plan", async () => {
    const { beatPlan } = await planSceneDraft(mock, { scene, contextPackage: {} });
    expect(beatPlan.beats.length).toBeGreaterThan(0);
    expect(beatPlan.sceneId).toBe("scene_test");
  });
});

describe("generateDialogueDraft — happy path with the mock", () => {
  it("produces a draft realizing every beat, no forbidden leak", async () => {
    const { beatPlan } = await planSceneDraft(mock, { scene, contextPackage: {} });
    const { draft } = await generateDialogueDraft(mock, { scene, beatPlan, contextPackage: {} });
    expect(draft.lines.length).toBe(beatPlan.beats.length);
    expect(draft.approvalStatus).toBe("draft");
  });
});

describe("generateDialogueDraft — the knowledge gate (headline check)", () => {
  // An adversarial provider that deliberately names the forbidden fact.
  const adversarial: DialogueAIProvider = {
    id: "adversarial",
    async generateProfile() {
      throw new Error("unused");
    },
    async planScene(request: ScenePlanRequest): Promise<ScenePlanResult> {
      // delegate to mock for the beat plan
      return mock.planScene(request);
    },
    async generateDialogue(request: DialogueRequest): Promise<DialogueResult> {
      const real = await mock.generateDialogue(request);
      // Corrupt: inject the forbidden fact into the first line.
      real.draft.lines[0]!.text = {
        ...real.draft.lines[0]!.text,
        value: `You seek fact_forbidden, do you not?`,
      };
      return real;
    },
    reviewDialogue: () => Promise.reject(new Error("unused")),
    repairDialogue: () => Promise.reject(new Error("unused")),
  };

  it("rejects a draft that names a forbidden fact (id form)", async () => {
    const { beatPlan } = await planSceneDraft(adversarial, { scene, contextPackage: {} });
    await expect(
      generateDialogueDraft(adversarial, { scene, beatPlan, contextPackage: {} }),
    ).rejects.toBeInstanceOf(GenerationError);
  });

  it("rejects a draft that names a forbidden fact (readable form)", async () => {
    const { beatPlan } = await planSceneDraft(adversarial, { scene, contextPackage: {} });
    // Swap the forbidden list to a readable-form-sensitive check by using a fresh
    // provider that names the readable form.
    const readableAdversarial: DialogueAIProvider = {
      ...adversarial,
      async generateDialogue(request: DialogueRequest): Promise<DialogueResult> {
        const real = await mock.generateDialogue(request);
        real.draft.lines[0]!.text = {
          ...real.draft.lines[0]!.text,
          value: `The fact forbidden is mine to keep.`,
        };
        return real;
      },
    };
    await expect(
      generateDialogueDraft(readableAdversarial, { scene, beatPlan, contextPackage: {} }),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("generateDialogueDraft — invalid provider output rejected (constraint #12)", () => {
  it("throws GenerationError on a malformed draft", async () => {
    const broken: DialogueAIProvider = {
      ...mock,
      async generateDialogue(): Promise<DialogueResult> {
        return { draft: { no: "good" } as unknown as DialogueArtifact, canonProposals: [] };
      },
    };
    const { beatPlan } = await planSceneDraft(mock, { scene, contextPackage: {} });
    await expect(
      generateDialogueDraft(broken, { scene, beatPlan, contextPackage: {} }),
    ).rejects.toBeInstanceOf(GenerationError);
  });
});

describe("planAndDraft — full two-call pipeline", () => {
  it("produces both a beat plan and a draft in one call", async () => {
    const { beatPlan, draft } = await planAndDraft(mock, scene, {});
    expect(beatPlan.beats.length).toBeGreaterThan(0);
    expect(draft.lines.length).toBe(beatPlan.beats.length);
  });
});

describe("provenance pinning (M11, constraint #6)", () => {
  const snapshot = {
    sceneId: "scene_test",
    participants: [
      {
        characterId: "char_boss",
        stateId: "state_boss__pre",
        role: "speaker",
        profile: { id: "char_boss", version: 3 },
        state: { id: "state_boss__pre", version: 2 },
      },
    ],
    permittedFacts: [{ id: "fact_required", version: 5 }],
    factions: [{ id: "fac_stone", version: 1 }],
    relationships: [{ id: "rel_boss__player", version: 4, partyA: "char_boss", partyB: "player" }],
  };

  it("pins profile/state/canon/faction/relationship versions from the snapshot", async () => {
    const { beatPlan } = await planSceneDraft(mock, { scene, contextPackage: snapshot });
    const { draft } = await generateDialogueDraft(mock, { scene, beatPlan, contextPackage: snapshot });
    expect(draft.provenance.characterProfiles).toEqual([{ id: "char_boss", version: 3 }]);
    expect(draft.provenance.characterStates).toEqual([{ id: "state_boss__pre", version: 2 }]);
    expect(draft.provenance.canonSnapshot).toEqual([{ id: "fact_required", version: 5 }]);
    expect(draft.provenance.factions).toEqual([{ id: "fac_stone", version: 1 }]);
    expect(draft.provenance.relationships).toEqual([{ id: "rel_boss__player", version: 4 }]);
  });

  it("leaves provenance untouched when no compiled snapshot was provided", async () => {
    const { beatPlan } = await planSceneDraft(mock, { scene, contextPackage: {} });
    const { draft } = await generateDialogueDraft(mock, { scene, beatPlan, contextPackage: {} });
    expect(draft.provenance.characterProfiles).toEqual([]);
  });
});

// Ensure generateProfileDraft still works (M3 regression — it shares GenerationError).
describe("M3 regression", () => {
  it("generateProfileDraft still works", async () => {
    const draft = await generateProfileDraft(mock, { brief: "ancient stone boss", idSlug: "x" });
    expect(draft.profile.identity.gameplayRole).toBe("boss");
  });
});
