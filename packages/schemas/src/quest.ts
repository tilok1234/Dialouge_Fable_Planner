/**
 * Quest + QuestStage (ARCHITECTURE §3.6).
 *
 * A character profile alone cannot keep a quest consistent. The quest carries a
 * state machine: stages, entry/completion/failure conditions, info gating per
 * stage, choices, consequences, variables changed, characters affected, scenes
 * triggered. Every dialogue scene attaches to one or more quest stages.
 *
 * Step H flag Q-E3: condition/transition fields are natural-language in v1
 * (like Opinion.canChangeCondition). The compiler surfaces them; it does not
 * evaluate a formal DSL. A formal state-machine DSL is a post-MVP decision
 * (NON_GOALS §3 — no procedural quest chains).
 */

import { z } from "zod";

import { LocalizedText, Ref, StableId, TagList, Versioned } from "./common.js";

export const QuestObjective = z.object({
  id: StableId,
  label: LocalizedText,
  /** Canon facts the player is told/learns when this objective is met. */
  reveals: z.array(Ref).default([]),
});

export const QuestStage = z.object({
  /** e.g. quest_quarry_seals__stage_2 */
  id: StableId,
  /** Integer ordinal for ordering; ids stay stable when stages insert. */
  order: z.number().int().min(0),
  label: z.string().min(1).max(120),
  /** What must be true to enter this stage. Natural language in v1. */
  entryCondition: z.string().max(280).optional(),
  /** Natural-language completion and failure conditions. */
  completionCondition: z.string().max(280).optional(),
  failureCondition: z.string().max(280).optional(),
  /** Information that becomes available to the player at this stage. */
  factsRevealedToPlayer: z.array(Ref).default([]),
  /** Stage ids this one can transition to. */
  transitionsTo: z.array(Ref).default([]),
  /** Scenes bound to this stage (SceneSpecification ids). */
  scenes: z.array(Ref).default([]),
  notes: z.string().max(1000).optional(),
});

export const QuestChoice = z.object({
  id: StableId,
  label: LocalizedText,
  /** Stage the choice leads into. */
  resultingStage: Ref,
  /** Natural-language consequences. */
  consequences: z.array(LocalizedText).default([]),
  /** Variables mutated, as stable key/value-ish notes for v1. */
  variablesChanged: z
    .array(z.object({ key: z.string().max(64), from: z.string().max(120).optional(), to: z.string().max(120).optional() }))
    .default([]),
  /** Characters whose relationship/state shifts because of this choice. */
  affectsCharacters: z.array(Ref).default([]),
});

export const Quest = Versioned.extend({
  /** e.g. quest_quarry_seals */
  id: StableId,
  name: z.string().min(1).max(120),
  premise: LocalizedText,
  /** The objective canon truth the quest turns on. */
  objectiveTruth: Ref.optional(),
  /** What the player knows when the quest becomes available. */
  playerInitialKnowledge: z.array(Ref).default([]),
  /** What each participating character knows (characterId -> canon refs). */
  characterKnowledge: z
    .array(z.object({ characterId: Ref, knows: z.array(Ref).default([]) }))
    .default([]),
  stages: z.array(QuestStage).min(1),
  /** Choices available across stages; each names its resulting stage. */
  choices: z.array(QuestChoice).default([]),
  /** Characters involved. */
  participatingCharacters: z.array(Ref).default([]),
  tags: TagList,
  notes: z.string().max(4000).optional(),
});

export type Quest = z.infer<typeof Quest>;
export type QuestStage = z.infer<typeof QuestStage>;
export type QuestChoice = z.infer<typeof QuestChoice>;
export type QuestObjective = z.infer<typeof QuestObjective>;
