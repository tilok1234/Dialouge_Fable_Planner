/**
 * FactionProfile — shared beliefs, terminology, customs (ARCHITECTURE §3.2).
 * Characters reference their faction(s) by ID; faction provides default
 * terminology and a metaphor domain that a character's voice may inherit or
 * override.
 */

import { z } from "zod";
import { LocalizedText, Ref, StableId, TagList, Versioned } from "./common.js";

export const MetaphorDomain = z.object({
  /** Where this faction's figurative language comes from, e.g. "stone, weight, erosion". */
  source: z.string().min(1).max(120),
  /** Example metaphors in this domain. */
  examples: z.array(LocalizedText).default([]),
});

export const FactionProfile = Versioned.extend({
  /** e.g. fac_stoneborn */
  id: StableId,
  name: z.string().min(1).max(120),
  /** Short pitch of the faction's identity. */
  summary: LocalizedText,
  /** Shared beliefs held by most members. References canon facts. */
  sharedBeliefs: z.array(Ref).default([]),
  /** Shared opinions, mirroring CharacterProfile opinion shape (opinions.ts). */
  sharedOpinions: z
    .array(
      z.object({
        target: Ref,
        position: z.string().min(1).max(64),
        reason: z.string().max(280).optional(),
      }),
    )
    .default([]),
  /** Default figurative language; characters may inherit or override. */
  metaphorDomain: MetaphorDomain.optional(),
  /** Terms/idioms unique to this faction. */
  terminology: z
    .array(
      z.object({
        term: z.string().min(1).max(64),
        meaning: LocalizedText,
      }),
    )
    .default([]),
  /** Social customs that affect greeting, address, taboo subjects. */
  customs: z.array(LocalizedText).default([]),
  /** Things members of this faction typically will not say or do. */
  taboos: z.array(LocalizedText).default([]),
  tags: TagList,
  notes: z.string().max(2000).optional(),
});

export type FactionProfile = z.infer<typeof FactionProfile>;
