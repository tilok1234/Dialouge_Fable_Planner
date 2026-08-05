/**
 * Terminology + TimelineEvent — canon helper schemas (resolves Q-F2).
 *
 * These were loose arrays in the sample; now they're contract-validated like
 * world-facts. Both are first-class Context Compiler inputs: terminology
 * grounds the writer in faction-specific terms (so the golem says "vein-seal",
 * not "magic door"); timeline drives in-world ordering of canon facts.
 */

import { z } from "zod";

import { LocalizedText, Ref, TagList, Versioned } from "./common.js";

export const Terminology = Versioned.extend({
  /** The term itself, e.g. "Hornblende". */
  term: z.string().min(1).max(64),
  /** What it means. */
  meaning: LocalizedText,
  /** Faction(s) whose idiom this term belongs to, if any. */
  factions: z.array(Ref).default([]),
  tags: TagList,
  notes: z.string().max(1000).optional(),
});

export const TimelineEvent = Versioned.extend({
  /** In-world date or epoch label, e.g. "~60 years BP", "present". */
  date: z.string().min(1).max(64),
  /** What happened. */
  event: LocalizedText,
  /** Canon facts this event anchors/establishes. */
  establishes: z.array(Ref).default([]),
  /** Optional absolute ordering hint when dates are fuzzy, for sorting. */
  order: z.number().int().optional(),
  tags: TagList,
  notes: z.string().max(1000).optional(),
});

export type Terminology = z.infer<typeof Terminology>;
export type TimelineEvent = z.infer<typeof TimelineEvent>;
