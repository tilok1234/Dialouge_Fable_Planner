/**
 * Beliefs & opinions sub-schema (ARCHITECTURE §3.3.3).
 *
 * Opinions are first-class and versioned: each tracks target, position, reason,
 * confidence, whether it's publicly admitted, and a *can-change condition*.
 * This lets opinions evolve without silently rewriting the character.
 *
 * Note (Step H flag Q-E1): `canChangeCondition` is intentionally free text in v1
 * rather than a formal predicate. The Context Compiler surfaces it; it does not
 * evaluate it. Formalizing it is a post-MVP decision.
 */

import { z } from "zod";
import { LocalizedText, Ref } from "./common.js";

export const OpinionPosition = z.enum([
  "devoted",
  "friendly",
  "sympathetic",
  "neutral",
  "wary",
  "hostile",
  "loathing",
]);

export const Confidence = z.enum(["absolute", "high", "moderate", "low", "rumor"]);

export const Opinion = z.object({
  /** A faction id, character id, region id, or a free label for abstract targets. */
  target: Ref,
  /** Human label for the target, for the editor UI. */
  targetLabel: z.string().max(120).optional(),
  position: OpinionPosition,
  /** Why they hold this position. */
  reason: z.string().max(280).optional(),
  confidence: Confidence.default("moderate"),
  /** Whether the character admits this opinion openly. */
  publiclyAdmitted: z.boolean().default(true),
  /** Natural-language condition under which this opinion may change. */
  canChangeCondition: z.string().max(280).optional(),
  /** Optional illustration of the opinion in the character's voice. */
  illustrativeLine: LocalizedText.optional(),
});

export type Opinion = z.infer<typeof Opinion>;
