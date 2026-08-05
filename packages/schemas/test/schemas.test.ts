/**
 * Contract smoke tests.
 *
 * These do NOT test pipeline behaviour — only that the schemas themselves
 * encode the contract correctly: valid fixtures parse, malformed data is
 * rejected, and the structural guarantees (six knowledge buckets, locking
 * fields present, provenance required, stable-id format) hold.
 *
 * Pipeline-level tests (knowledge-leak detection actually firing on a draft)
 * belong in @df/validators. The schema test only proves the SHAPE permits them.
 */
import { describe, expect, it } from "vitest";
import {
  CanonFact,
  CanonProposal,
  CharacterProfile,
  CharacterState,
  DialogueArtifact,
  DialogueBeatPlan,
  DialogueReview,
  FactionProfile,
  KnowledgeModel,
  Project,
  Quest,
  RelationshipState,
  SceneSpecification,
  StableId,
  VoiceProfile,
} from "../src/index.js";

const ok = {
  version: 1,
  contentHash: "sha256:abc",
  createdAt: "2026-08-05T12:00:00.000Z",
  updatedAt: "2026-08-05T12:00:00.000Z",
};

describe("StableId", () => {
  it("accepts kind-prefixed snake_case", () => {
    expect(StableId.parse("char_hornblende_golem")).toBe("char_hornblende_golem");
    expect(StableId.parse("quest_quarry_seals")).toBe("quest_quarry_seals");
  });
  it("rejects malformed ids", () => {
    expect(() => StableId.parse("Hornblende!")).toThrow();
    expect(() => StableId.parse("hornblende")).toThrow(); // missing kind prefix
    expect(() => StableId.parse("char_")).toThrow();
  });
  it("accepts a single __ sub-segment for derived artifacts", () => {
    expect(StableId.parse("state_hornblende_golem__phase_two")).toBe("state_hornblende_golem__phase_two");
    expect(StableId.parse("rel_hornblende_golem__player")).toBe("rel_hornblende_golem__player");
    expect(StableId.parse("quest_quarry_seals__stage_2")).toBe("quest_quarry_seals__stage_2");
  });
  it("rejects multiple __ sub-segments", () => {
    expect(() => StableId.parse("state_golem__phase__two")).toThrow();
  });
});

describe("knowledge model has six disjoint buckets", () => {
  it("defaults all six buckets to empty arrays", () => {
    const k = KnowledgeModel.parse({});
    expect(k.knows).toEqual([]);
    expect(k.believesFalse).toEqual([]);
    expect(k.suspects).toEqual([]);
    expect(k.secrets).toEqual([]);
    expect(k.lies).toEqual([]);
    expect(k.unknown).toEqual([]);
  });
  it("accepts all six populated", () => {
    const k = KnowledgeModel.parse({
      knows: ["canon_a"],
      believesFalse: ["canon_b"],
      suspects: ["canon_c"],
      secrets: ["canon_d"],
      lies: ["canon_e"],
      unknown: ["canon_f"],
    });
    expect(k.knows).toHaveLength(1);
    expect(k.unknown).toContain("canon_f");
  });
});

describe("voice profile requires sample lines and supports anti-samples", () => {
  it("requires at least one sample line", () => {
    expect(() => VoiceProfile.parse({})).toThrow();
  });
  it("accepts samples + anti-samples", () => {
    const v = VoiceProfile.parse({
      sampleLines: [{ value: "The mountain does not forgive. It merely outlives." }],
      antiSampleLines: [{ value: "Foolish mortal! You dare challenge my immense power?" }],
    });
    expect(v.sampleLines).toHaveLength(1);
    expect(v.antiSampleLines).toHaveLength(1);
  });
});

const characterProfileFixture = {
  ...ok,
  id: "char_hornblende_golem",
  identity: {
    name: "Hornblende Golem",
    factions: ["fac_stoneborn"],
    gameplayRole: "boss",
    narrativeFunction: "boss",
  },
  core: {
    primaryDesire: { value: "Prevent further theft of the earth" },
    primaryFear: { value: "Becoming what it was made to destroy" },
    centralValue: { value: "The earth is not property" },
    mainFlaw: { value: "Cannot distinguish miner from thief" },
    centralContradiction: { value: "Made by miners to guard against miners" },
    moralBoundary: { value: "Will not pursue the fleeing" },
  },
  knowledge: { knows: ["fact_seals_prevent_excavation"], unknown: ["fact_who_forged_retreat_order"] },
  voice: { sampleLines: [{ value: "You walk beneath stolen stone." }] },
  tags: ["boss", "stoneborn"],
};

describe("CharacterProfile", () => {
  it("accepts a well-formed boss profile", () => {
    const p = CharacterProfile.parse(characterProfileFixture);
    expect(p.identity.name).toBe("Hornblende Golem");
  });
  it("rejects missing core", () => {
    const bad = { ...characterProfileFixture, core: undefined };
    expect(() => CharacterProfile.parse(bad)).toThrow();
  });
});

describe("remaining schemas parse their fixtures", () => {
  it("Project, FactionProfile, CharacterState, RelationshipState, Quest, SceneSpecification, BeatPlan, Artifact, Review, Proposal, CanonFact", () => {
    expect(Project.parse({ ...ok, id: "project_quarry_module", name: "Quarry", summary: { value: "x" }, schemaVersion: "1", promptTemplateVersion: "1" })).toBeTruthy();

    expect(FactionProfile.parse({ ...ok, id: "fac_stoneborn", name: "Stoneborn", summary: { value: "x" }, tags: [] })).toBeTruthy();

    expect(CharacterState.parse({ ...ok, id: "state_hornblende_golem__phase_two", characterId: "char_hornblende_golem", label: "Phase two", mood: "offended" })).toBeTruthy();

    expect(RelationshipState.parse({ ...ok, id: "rel_hornblende_golem__player", partyA: "char_hornblende_golem", partyB: "player", dimensions: { trust: -20, respect: 30 } })).toBeTruthy();

    expect(Quest.parse({ ...ok, id: "quest_quarry_seals", name: "Quarry Seals", premise: { value: "x" }, stages: [{ id: "quest_quarry_seals__stage_0", order: 0, label: "Unavailable" }], tags: [] })).toBeTruthy();

    expect(SceneSpecification.parse({
      ...ok,
      id: "scene_golem_first_encounter",
      label: "Golem first encounter",
      sceneType: "boss-first-encounter",
      participants: [{ characterId: "char_hornblende_golem", stateId: "state_hornblende_golem__pre_encounter", role: "speaker" }],
      purpose: { value: "Explain why the golem sees the player as trespasser" },
    })).toBeTruthy();

    expect(DialogueBeatPlan.parse({ ...ok, id: "beat_golem_first_encounter", sceneId: "scene_golem_first_encounter", contextPackageId: "ctx_golem_first_encounter", beats: [{ order: 1, speakerId: "char_hornblende_golem", intent: "Acknowledge broken seals" }] })).toBeTruthy();

    expect(DialogueArtifact.parse({
      ...ok,
      id: "dlg_golem_first_encounter",
      sceneId: "scene_golem_first_encounter",
      beatPlanId: "beat_golem_first_encounter",
      contextPackageId: "ctx_golem_first_encounter",
      approvalStatus: "draft",
      lines: [{ id: "l1", speakerId: "char_hornblende_golem", text: { value: "You walk beneath stolen stone." } }],
      provenance: {
        scene: { id: "scene_golem_first_encounter", version: 1 },
        schemaVersion: "1",
        promptTemplateVersion: "1",
        provider: "glm",
        model: "glm-5.2",
        reasoningEffort: "normal",
        generatedAt: "2026-08-05T12:00:00.000Z",
      },
    })).toBeTruthy();

    expect(DialogueReview.parse({ ...ok, id: "review_golem_first_encounter", artifactId: "dlg_golem_first_encounter", sceneId: "scene_golem_first_encounter", passed: true, reviewedAt: "2026-08-05T12:00:00.000Z" })).toBeTruthy();

    expect(CanonProposal.parse({ ...ok, id: "prop_seals_built_by_miners", proposedFact: { id: "fact_seals_built_by_miners", label: "Seals built by miners", statement: { value: "x" }, tags: [] }, reason: "Explains why boss recognizes the design" })).toBeTruthy();

    expect(CanonFact.parse({ ...ok, id: "fact_seals_prevent_excavation", label: "Seals prevent excavation", statement: { value: "x" }, tags: [] })).toBeTruthy();
  });
});

describe("forbidden-revelation + knowledge-leak contracts are representable", () => {
  // The schema test only proves the SHAPE allows these; @df/validators enforces them.
  it("scene can declare forbiddenRevelations", () => {
    const s = SceneSpecification.parse({
      ...ok,
      id: "scene_golem_first_encounter",
      label: "x",
      sceneType: "boss-first-encounter",
      participants: [{ characterId: "char_hornblende_golem", stateId: "state_hornblende_golem__pre_encounter" }],
      purpose: { value: "x" },
      forbiddenRevelations: ["fact_golem_created_by_miners"],
    });
    expect(s.forbiddenRevelations).toContain("fact_golem_created_by_miners");
  });
  it("a character can have a fact in `unknown`, enabling leak detection", () => {
    const p = CharacterProfile.parse({ ...characterProfileFixture, knowledge: { unknown: ["fact_who_forged_retreat_order"] } });
    expect(p.knowledge.unknown).toContain("fact_who_forged_retreat_order");
  });
});
