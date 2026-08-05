/**
 * DialogueReview — Stage 4 output (ARCHITECTURE §6).
 *
 * Two tiers: deterministic checks (code) and AI-assisted checks (provider).
 * The checker REPORTS problems; it does not silently rewrite. Each finding
 * carries issue type, offending line, reason, and a suggested repair. A failed
 * line is repaired in isolation (Stage 5), not by regenerating the whole scene.
 */

import { z } from "zod";
import { LocalizedText, Ref, StableId, Versioned } from "./common.js";

export const CheckTier = z.enum(["deterministic", "ai-assisted"]);

export const IssueSeverity = z.enum(["blocker", "major", "minor", "info"]);

export const DeterministicIssueType = z.enum([
  "referenced-entity-missing",
  "invalid-quest-state",
  "dangling-branch",
  "variable-misspelled",
  "required-fact-missing",
  "forbidden-term-present",
  "line-length-exceeded",
  "locked-text-changed",
  "knowledge-leak", // the big one — speaker referenced a fact not in their knowledge model
  "duplicate-dialogue-id",
  "choice-without-resulting-state",
  "unfilled-placeholder",
]);

export const AIIssueType = z.enum([
  "voice-drift",
  "implied-lore-contradiction",
  "emotional-inconsistency",
  "repetition",
  "excessive-exposition",
  "generic-fantasy-phrasing",
  "characters-too-similar",
  "scene-purpose-unmet",
  "lie-reads-as-narration",
  "inappropriate-phase-transition",
]);

export const ReviewFinding = z.object({
  id: z.string().min(1).max(48),
  tier: CheckTier,
  /** For deterministic findings, one of DeterministicIssueType; for AI, AIIssueType. */
  type: z.string().min(1).max(64),
  severity: IssueSeverity.default("minor"),
  /** The offending line id within the draft, if applicable. */
  lineId: z.string().max(48).optional(),
  /** The offending text span, quoted for the diff view. */
  excerpt: z.string().max(400).optional(),
  /** Why it's a problem, in plain language. */
  reason: z.string().min(1).max(400),
  /** Concrete suggested repair; the human may accept, edit, or reject. */
  suggestedRepair: LocalizedText.optional(),
});

export const DialogueReview = Versioned.extend({
  /** e.g. review_golem_first_encounter */
  id: StableId,
  /** Draft/artifact this review is for. */
  artifactId: Ref,
  sceneId: Ref,
  /** Overall pass/fail; blockers make this fail regardless of majors/minors. */
  passed: z.boolean(),
  findings: z.array(ReviewFinding).default([]),
  /** Whether the AI-assisted tier was run (optional in v1; deterministic always runs). */
  aiTierRan: z.boolean().default(false),
  reviewedAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});

export type DialogueReview = z.infer<typeof DialogueReview>;
export type ReviewFinding = z.infer<typeof ReviewFinding>;
