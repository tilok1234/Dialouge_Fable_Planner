/**
 * Voice profile (ARCHITECTURE §3.3.5).
 *
 * Describes HOW the character converts thoughts into language. The metaphor
 * domain is especially powerful — a sailor speaks of storms, a smith of heat,
 * a stone golem of erosion. Sample AND anti-sample lines are both required
 * machinery: anti-samples prevent generic AI phrasing.
 */

import { z } from "zod";

import { LocalizedText } from "./common.js";
import { MetaphorDomain } from "./faction.js";

export const Formality = z.enum(["very-formal", "formal", "neutral", "casual", "very-casual"]);
export const Directness = z.enum(["very-direct", "direct", "balanced", "indirect", "evasive"]);
export const DeclarationStyle = z.enum(["declarative", "interrogative", "balanced"]);

export const VoiceProfile = z.object({
  formality: Formality.default("neutral"),
  directness: Directness.default("balanced"),
  /** Typical sentence length band. */
  typicalSentenceLength: z.enum(["terse", "short", "medium", "long", "rambling"]).default("medium"),
  /** Cadence descriptor, e.g. "measured, pauses before the verb". */
  rhythm: z.string().max(160).optional(),
  vocabularyComplexity: z.enum(["plain", "common", "educated", "archaic", "ornate"]).default("common"),
  usesContractions: z.boolean().default(true),
  usesHumor: z.enum(["never", "rare", "dry", "frequent"]).default("rare"),
  /** Preferred figurative ground. May be inherited from faction and overridden. */
  metaphorDomain: MetaphorDomain.optional(),
  /** How openly the character names their own emotions. */
  emotionalRestraint: z.enum(["open", "measured", "guarded", "impenetrable"]).default("measured"),
  declarationStyle: DeclarationStyle.default("balanced"),
  /** Names emotions directly, or only via behaviour/metaphor. */
  namesEmotionsDirectly: z.boolean().default(true),
  /** How they address others. */
  addressMode: z.enum(["by-name", "by-title", "by-insult", "impersonal", "mixed"]).default("by-name"),
  /** Words/phrasings they would never use. */
  avoids: z.array(z.string().min(1).max(80)).default([]),
  /** Canonical examples of how they sound. The single strongest consistency lever. */
  sampleLines: z.array(LocalizedText).min(1),
  /** Examples of how they should NOT sound. Powerful for suppressing generic AI voice. */
  antiSampleLines: z.array(LocalizedText).default([]),
});

export type VoiceProfile = z.infer<typeof VoiceProfile>;
