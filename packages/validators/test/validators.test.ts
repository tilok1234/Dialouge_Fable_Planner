/**
 * M5 validator tests.
 *
 * Each validator is proven two ways:
 *  1. the Quarry Seals sample (clean) reports no issues of that kind
 *  2. a PLANTED defect is caught
 *
 * The sample is loaded via @df/storage (the real project reader) so the tests
 * exercise the validators against the canonical fixture.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readProject } from "@df/storage";
import { describe, expect, it } from "vitest";

import { validateKnowledge, validatePlaythrough, validateQuest, simulatePlaythrough } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(here, "..", "..", "..", "samples", "quarry-project");

const loaded = await readProject(sampleDir);
if (loaded.errors.length) throw new Error(`sample load failed: ${loaded.errors.join("; ")}`);
const quest = loaded.data.quests[0]!;
const scenes = loaded.data.scenes;

describe("validateQuest — structure (M5)", () => {
  it("the sample quest is structurally clean", () => {
    const { issues, clean } = validateQuest(quest);
    expect(issues).toEqual([]);
    expect(clean).toBe(true);
  });

  it("catches a dangling transition target", () => {
    const bad = structuredClone(quest);
    bad.stages[0]!.transitionsTo = ["quest_does_not_exist"];
    const { issues } = validateQuest(bad);
    expect(issues.some((i) => i.field === "transitionsTo" && i.value === "quest_does_not_exist")).toBe(true);
  });

  it("catches a choice leading nowhere", () => {
    const bad = structuredClone(quest);
    bad.choices[0]!.resultingStage = "quest_nowhere__stage_99";
    const { issues } = validateQuest(bad);
    expect(issues.some((i) => i.field === "resultingStage" && i.value === "quest_nowhere__stage_99")).toBe(true);
  });
});

describe("validateKnowledge — progression (M5)", () => {
  it("the sample scenes respect the reveal schedule", () => {
    const { issues, clean } = validateKnowledge(quest, scenes);
    expect(issues).toEqual([]);
    expect(clean).toBe(true);
  });

  it("flags a scene that references a fact revealed later", () => {
    // The defeat scene (scene_golem_defeated) is bound to stage 5a and requires
    // fact_golem_created_by_miners. Make a SECOND scene bound to an EARLIER
    // stage that references the same fact -> should flag.
    const earlyScene = structuredClone(scenes.find((s) => s.id === "scene_golem_defeated")!);
    earlyScene.id = "scene_early_leak";
    earlyScene.boundQuestStages = ["quest_quarry_seals__stage_1"]; // earlier than 5a
    const { issues } = validateKnowledge(quest, [...scenes, earlyScene]);
    expect(issues.some((i) => i.from === "scene_early_leak" && i.value === "fact_golem_created_by_miners")).toBe(true);
  });
});

describe("simulatePlaythrough + validatePlaythrough (M5)", () => {
  it("simulates the sample quest and reaches both branch terminals (5a + 5b)", () => {
    const { branches, issues } = simulatePlaythrough(quest);
    expect(issues).toEqual([]);
    const terminals = new Set(branches.map((b) => b.terminal));
    // Both choice targets should be reached.
    for (const c of quest.choices) {
      expect(terminals.has(c.resultingStage) || branches.some((b) => b.path.includes(c.resultingStage))).toBe(true);
    }
  });

  it("the sample playthrough is clean (no dead-ends, all choices reached)", () => {
    const { clean } = validatePlaythrough(quest);
    expect(clean).toBe(true);
  });

  it("flags a dead-end: a non-terminal stage with no outgoing edges", () => {
    const bad = structuredClone(quest);
    // Cripple stage 2 (mid-quest): remove its transitions and any choice that
    // could lead forward, and remove its completion/failure conditions.
    const mid = bad.stages.find((s) => s.order === 2)!;
    mid.transitionsTo = [];
    mid.completionCondition = undefined;
    mid.failureCondition = undefined;
    // Remove choices that would bypass it (so it truly dead-ends).
    bad.choices = [];
    const { issues } = validatePlaythrough(bad);
    // Some branch reaches the crippled stage and can't proceed.
    expect(issues.some((i) => i.field === "terminal" && i.reason.includes("stuck"))).toBe(true);
  });
});
