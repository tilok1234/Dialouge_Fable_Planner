/**
 * Dialogue review + repair orchestration (Stage 4 + 5).
 *
 * Combines the two reviewer tiers (ARCHITECTURE §6):
 *  1. deterministic checks (@df/validators) — leak, required-facts, length, locks
 *  2. AI-assisted checks (provider) — voice drift, repetition
 *
 * Both report into a single DialogueReview. The repair stage (5) applies
 * suggested fixes from the review to flagged lines, preserving hard-locked
 * lines byte-for-byte (constraint #7). Both validate-before-store (#12).
 */

import type { DialogueAIProvider, RepairRequest, ReviewRequest } from "@df/providers";
import { DialogueArtifact, DialogueReview, type DialogueArtifact as DialogueArtifactType, type DialogueReview as DialogueReviewType, type SceneSpecification } from "@df/schemas";
import { validateDialogue } from "@df/validators";

import { GenerationError } from "./profile-generation.js";

export interface ReviewDraftResult {
  review: DialogueReviewType;
}

/**
 * Stage 4: review a draft. Runs deterministic checks, then the provider's
 * AI-assisted pass, and merges both into one DialogueReview. The `passed` flag
 * is false if ANY blocker-severity finding exists (deterministic or AI).
 */
export async function reviewDraft(
  provider: DialogueAIProvider,
  request: ReviewRequest & { scene: SceneSpecification; previousDraft?: DialogueArtifactType },
): Promise<ReviewDraftResult> {
  const detIssues = validateDialogue({
    draft: request.draft,
    scene: request.scene,
    previousDraft: request.previousDraft,
  });

  // Deterministic findings → ReviewFinding shape.
  const detFindings = detIssues.map((issue, i) => ({
    id: `df${i + 1}`,
    tier: "deterministic" as const,
    type: issue.field,
    severity: issue.severity,
    value: issue.value,
    lineId: undefined as string | undefined,
    reason: issue.reason,
  }));

  // AI-assisted pass. The scene's forbidden facts are injected into the
  // context so the provider can hunt for SEMANTIC leaks (paraphrase,
  // implication) that the deterministic id-echo check above cannot see.
  const reviewContext = {
    ...(typeof request.contextPackage === "object" && request.contextPackage !== null ? request.contextPackage : {}),
    forbiddenRevelations: request.scene.forbiddenRevelations,
  };
  const aiResult = await provider.reviewDialogue({ draft: request.draft, contextPackage: reviewContext });
  const aiFindings = aiResult.review.findings.map((f) => ({
    id: f.id,
    tier: f.tier,
    type: f.type,
    severity: f.severity,
    lineId: f.lineId,
    excerpt: f.excerpt,
    reason: f.reason,
    suggestedRepair: f.suggestedRepair,
  }));

  const allFindings = [...detFindings, ...aiFindings];
  const passed = !allFindings.some((f) => f.severity === "blocker");

  const candidate: DialogueReviewType = {
    id: `review_${request.draft.id.replace(/^dlg_/, "")}`,
    version: 1,
    contentHash: "sha256:mock-review-uncommitted",
    artifactId: request.draft.id,
    sceneId: request.draft.sceneId,
    passed,
    findings: allFindings as DialogueReviewType["findings"],
    aiTierRan: true,
    reviewedAt: new Date().toISOString(),
  };

  const parsed = DialogueReview.safeParse(candidate);
  if (!parsed.success) {
    throw new GenerationError(`review produced an invalid DialogueReview: ${parsed.error.issues[0]?.message}`, candidate);
  }
  return { review: parsed.data };
}

/**
 * Stage 5: repair. Apply the review's suggested repairs to flagged, non-locked
 * lines via the provider's repairDialogue. Validates the patched draft before
 * returning (constraint #12). Locked lines survive byte-for-byte.
 */
export async function repairDraft(
  provider: DialogueAIProvider,
  request: RepairRequest,
): Promise<{ draft: DialogueArtifactType }> {
  const { draft: rawPatched } = await provider.repairDialogue(request);
  const parsed = DialogueArtifact.safeParse(rawPatched);
  if (!parsed.success) {
    throw new GenerationError(`repair produced an invalid DialogueArtifact: ${parsed.error.issues[0]?.message}`, rawPatched);
  }

  // Defence-in-depth: confirm locked lines were preserved.
  const locked = new Set(request.lockedLineIds);
  const prevById = new Map(request.draft.lines.map((l) => [l.id, l]));
  for (const line of parsed.data.lines) {
    if (line.lock?.state === "hard-locked" || locked.has(line.id)) {
      const prev = prevById.get(line.id);
      if (prev && prev.text.value !== line.text.value) {
        throw new GenerationError(`repair altered locked line ${line.id} (locked text must survive byte-for-byte)`, rawPatched);
      }
    }
  }

  return { draft: parsed.data };
}
