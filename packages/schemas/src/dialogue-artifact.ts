/**
 * DialogueArtifact — Stage 7 output (ARCHITECTURE §2.1, §7).
 *
 * The "compiled output." Stored SEPARATELY from profiles, and references the
 * EXACT versions of profile/quest/scene/canon/schema/prompt/model that produced
 * it (contract §5, constraint #6). When a source bumps version, this artifact
 * is flagged STALE — never auto-regenerated or erased.
 *
 * Approval status (constraint #8): nothing is "approved game content" until a
 * human accepts it. Drafts and unapproved patches never get exported.
 */

import { z } from "zod";

import { LocalizedText, Lock, Ref, StableId, Versioned, VersionedRef } from "./common.js";

export const ApprovalStatus = z.enum([
  "draft", // Stage 3 output, unchecked
  "reviewed", // Stage 4 passed
  "patched", // Stage 5 repair applied, awaiting accept
  "accepted", // human approved — eligible for export
  "rejected", // human rejected
]);

export const DialogueLine = z.object({
  /** Stable id unique within the artifact. */
  id: z.string().min(1).max(48),
  /** The beat this line realizes, if any (from DialogueBeatPlan). */
  beatOrder: z.number().int().min(1).optional(),
  speakerId: Ref,
  text: LocalizedText,
  /** Player choice attached to this line, if any. */
  choiceId: Ref.optional(),
  /** Per-line lock: locked lines survive regeneration. */
  lock: Lock.optional(),
  /** Whether this line was human-edited after generation. */
  humanEdited: z.boolean().default(false),
});

export const Provenance = z.object({
  /** Every source version + contentHash at generation time. */
  characterProfiles: z.array(VersionedRef).default([]),
  characterStates: z.array(VersionedRef).default([]),
  relationships: z.array(VersionedRef).default([]),
  factions: z.array(VersionedRef).default([]),
  quest: VersionedRef.optional(),
  questStage: VersionedRef.optional(),
  scene: VersionedRef,
  canonSnapshot: z.array(VersionedRef).default([]),
  /** Schema + prompt template versions. */
  schemaVersion: z.string().min(1).max(40),
  promptTemplateVersion: z.string().min(1).max(40),
  /** Provider identity. */
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(64),
  reasoningEffort: z.enum(["normal", "high", "max"]).default("normal"),
  generatedAt: z.string().datetime(),
});

export const DialogueArtifact = Versioned.extend({
  /** e.g. dlg_golem_first_encounter */
  id: StableId,
  sceneId: Ref,
  /** Beat plan this was drafted from. */
  beatPlanId: Ref,
  /** Context package snapshot used (for re-running the compiler deterministically). */
  contextPackageId: Ref,
  /** Review that this artifact passed (if reviewed/accepted). */
  reviewId: Ref.optional(),
  approvalStatus: ApprovalStatus.default("draft"),
  lines: z.array(DialogueLine).min(1),
  provenance: Provenance,
  /** Set when any source version is newer than provenance. Review prompt only. */
  stale: z.boolean().default(false),
  /** Patch lineage: parent artifact id this one patched, if any. */
  parentArtifactId: Ref.optional(),
  notes: z.string().max(2000).optional(),
});

export type DialogueArtifact = z.infer<typeof DialogueArtifact>;
export type DialogueLine = z.infer<typeof DialogueLine>;
export type Provenance = z.infer<typeof Provenance>;
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;
