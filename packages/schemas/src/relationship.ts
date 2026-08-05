/**
 * RelationshipState — multi-dimensional state between two parties
 * (ARCHITECTURE §3.5). NOT a single friendship score.
 *
 * A character may trust but dislike, respect but fear, love but believe
 * dangerous. The raw values need not surface in dialogue; they determine which
 * named relationship STATE applies (the Context Compiler resolves that).
 *
 * File naming: ordered pair a__b (REPO_LAYOUT §4.1).
 *
 * Step H flag Q-E2: dimensions are -100..100 integers. We do NOT prescribe a
 * threshold model in the schema; named states are authored separately and the
 * compiler matches them. Keeping numbers out of the dialogue is intentional.
 */

import { z } from "zod";

import { LocalizedText, Ref, StableId, Versioned } from "./common.js";

export const RelationshipDimension = z
  .number()
  .int()
  .min(-100)
  .max(100);

export const RelationshipDimensions = z.object({
  trust: RelationshipDimension.default(0),
  respect: RelationshipDimension.default(0),
  affection: RelationshipDimension.default(0),
  fear: RelationshipDimension.default(0),
  suspicion: RelationshipDimension.default(0),
  /** Positive = the other party owes this one; negative = owes them. */
  debt: RelationshipDimension.default(0),
});

export const RelationshipState = Versioned.extend({
  /** e.g. rel_hornblende_golem__player */
  id: StableId,
  /** First party (usually the character). */
  partyA: Ref,
  /** Second party (usually the player or another character). */
  partyB: Ref,
  dimensions: RelationshipDimensions,
  /** A resolved named state, e.g. "wary-respect", "hostile-but-indebted". */
  namedState: z.string().min(1).max(64).optional(),
  /** Compact history notes — NOT raw prior lines (contract §5.5 / non-goal). */
  history: z
    .array(
      z.object({
        at: z.string().datetime().optional(),
        event: LocalizedText,
        dimensionDeltas: RelationshipDimensions.partial().optional(),
      }),
    )
    .default([]),
  notes: z.string().max(2000).optional(),
});

export type RelationshipState = z.infer<typeof RelationshipState>;
