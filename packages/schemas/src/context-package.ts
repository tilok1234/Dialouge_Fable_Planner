/**
 * ContextPackage — Stage 1 output, the Context Compiler's product
 * (ARCHITECTURE §5). Resolves Q-F1.
 *
 * This is the single most-inspected artifact when a generation goes wrong: you
 * read the context package first, not the prompt. It is the small, precise
 * package the writer/reviewer consume — NOT a dump of the whole project
 * (contract principle: files are truth, context is assembled per request).
 *
 * Provenance: it references the scene + quest stage it was compiled for, plus
 * the participants (with their resolved states and relationships). The facts it
 * marks `factsPermittedInDialogue` vs `factsForbiddenInDialogue` are what the
 * knowledge-leak detector checks draft lines against (M6).
 */

import { z } from "zod";

import { LocalizedText, Ref, StableId, Versioned } from "./common.js";

export const ContextParticipant = z.object({
  characterId: Ref,
  /** The CharacterState resolved for this participant in this scene. */
  stateId: Ref,
  /** Relationship file(s) relevant to the other participant(s). */
  relationshipId: Ref.optional(),
});

export const RelationshipSnapshot = z.object({
  /** The resolved named state — what surfaces in prompts, never raw numbers. */
  namedState: z.string().min(1).max(64).optional(),
  /** Optional dimensions echoed for the reviewer/UI; NOT for prompts (Q-E2). */
  trust: z.number().int().min(-100).max(100).optional(),
  respect: z.number().int().min(-100).max(100).optional(),
  affection: z.number().int().min(-100).max(100).optional(),
  fear: z.number().int().min(-100).max(100).optional(),
  suspicion: z.number().int().min(-100).max(100).optional(),
  debt: z.number().int().min(-100).max(100).optional(),
});

export const ContextPackage = Versioned.extend({
  /** e.g. ctx_golem_first_encounter */
  id: StableId,
  /** Scene this package was compiled for. */
  sceneId: Ref,
  /** Quest stage(s) this compilation is grounded in. */
  questStageIds: z.array(Ref).default([]),
  /** When the compiler produced this package. */
  compiledAt: z.string().datetime(),
  participants: z.array(ContextParticipant).min(1),
  /** Canon facts the compiler selected as relevant (a subset of all canon). */
  selectedCanon: z.array(Ref).default([]),
  /** Factions the compiler selected. */
  selectedFactions: z.array(Ref).default([]),
  /** Facts the dialogue MAY use — the union of what each participant is
   * permitted to know at this quest stage, intersected with scene requirements. */
  factsPermittedInDialogue: z.array(Ref).default([]),
  /** Facts the dialogue MUST NOT use — the gate the leak detector enforces. */
  factsForbiddenInDialogue: z.array(Ref).default([]),
  /** Compact memory summaries, NOT raw prior lines (contract §5.5 / non-goal). */
  memorySummaries: z.array(LocalizedText).default([]),
  /** Echoed relationship state for the primary participant ↔ player. */
  relationshipSnapshot: RelationshipSnapshot.optional(),
  notes: z.string().max(2000).optional(),
});

export type ContextPackage = z.infer<typeof ContextPackage>;
export type ContextParticipant = z.infer<typeof ContextParticipant>;
export type RelationshipSnapshot = z.infer<typeof RelationshipSnapshot>;
