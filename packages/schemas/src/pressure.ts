/**
 * Behaviour under pressure (ARCHITECTURE §3.3.6).
 *
 * A static voice profile is insufficient — especially for bosses. This maps
 * named pressure conditions to behavioural + emotional shifts, so the same
 * proud boss can be dismissive pre-combat, offended after damage, quietly
 * frightened in its final phase, and still unwilling to beg when defeated
 * (emotions change; the underlying pride does not).
 */

import { z } from "zod";

import { LocalizedText } from "./common.js";

export const PressureCondition = z.enum([
  "threatened",
  "praised",
  "embarrassed",
  "proven-wrong",
  "betrayed",
  "losing-control",
  "gaining-advantage",
  "facing-death",
  "speaking-to-weaker",
  "speaking-to-admired",
  "speaking-to-required-but-hated",
  "defeated",
  "victorious",
]);

export const PressureReaction = z.object({
  condition: PressureCondition,
  /** Emotional shift, e.g. "offended", "quietly frightened". */
  emotion: z.string().min(1).max(64),
  /** How their voice changes, e.g. "shorter sentences, lower register". */
  voiceShift: z.string().max(160).optional(),
  /** What they do or refrain from. */
  behaviour: z.string().max(280).optional(),
  /** Optional illustrative line in voice, post-shift. */
  illustrativeLine: LocalizedText.optional(),
});

export const PressureProfile = z.array(PressureReaction);

export type PressureCondition = z.infer<typeof PressureCondition>;
export type PressureReaction = z.infer<typeof PressureReaction>;
