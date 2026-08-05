/**
 * Dialogue generation flow (Stages 2 + 3).
 *
 * Two-call pattern (ARCHITECTURE §2.2): the beat plan is produced first, then
 * prose is drafted from it. Each stage validate-before-store (constraint #12).
 *
 * The forbidden-facts gate (the contract's headline correctness check): after
 * drafting, the orchestrator scans every line for any reference to a fact in
 * the scene's `forbiddenRevelations` and rejects the draft if found. The mock
 * provider never names forbidden facts, but a real (or adversarial) provider
 * might — this is the defence-in-depth that makes the gate trustworthy
 * regardless of provider.
 */

import type { DialogueAIProvider, DialogueRequest, ScenePlanRequest } from "@df/providers";
import {
  DialogueArtifact,
  DialogueBeatPlan,
  type DialogueArtifact as DialogueArtifactType,
  type DialogueBeatPlan as DialogueBeatPlanType,
  type SceneSpecification,
} from "@df/schemas";


import { GenerationError } from "./profile-generation.js";

export interface BeatPlanDraft {
  beatPlan: DialogueBeatPlanType;
}

export interface DialogueDraft {
  draft: DialogueArtifactType;
}

/** Stage 2: produce a validated beat plan. */
export async function planSceneDraft(
  provider: DialogueAIProvider,
  request: ScenePlanRequest,
): Promise<BeatPlanDraft> {
  const { beatPlan: raw } = await provider.planScene(request);
  const parsed = DialogueBeatPlan.safeParse(raw);
  if (!parsed.success) {
    throw new GenerationError(
      `provider returned an invalid DialogueBeatPlan: ${parsed.error.issues[0]?.message}`,
      raw,
    );
  }
  return { beatPlan: parsed.data };
}

/**
 * Stage 3: draft dialogue from a beat plan, then enforce the knowledge gate.
 *
 * Throws `GenerationError` if:
 *  - the provider's draft is schema-invalid (constraint #12), OR
 *  - any line references a fact in the scene's `forbiddenRevelations`.
 */
export async function generateDialogueDraft(
  provider: DialogueAIProvider,
  request: DialogueRequest,
): Promise<DialogueDraft> {
  const { draft: raw } = await provider.generateDialogue(request);
  const parsed = DialogueArtifact.safeParse(raw);
  if (!parsed.success) {
    throw new GenerationError(
      `provider returned an invalid DialogueArtifact: ${parsed.error.issues[0]?.message}`,
      raw,
    );
  }

  // Knowledge gate: no line may reference a forbidden fact (in any rendering —
  // id form `fact_x` or readable form `fact x`). This is the leak detector.
  const forbidden = request.scene.forbiddenRevelations;
  if (forbidden.length > 0) {
    const leaked = findForbiddenReferences(parsed.data, forbidden);
    if (leaked.length > 0) {
      throw new GenerationError(
        `dialogue draft leaked forbidden facts: ${leaked.join(", ")}`,
        raw,
      );
    }
  }

  return { draft: parsed.data };
}

/** Scan draft lines for any forbidden fact reference (id form or readable form). */
function findForbiddenReferences(draft: DialogueArtifactType, forbidden: string[]): string[] {
  const leaked: string[] = [];
  for (const line of draft.lines) {
    const text = line.text.value.toLowerCase();
    for (const fact of forbidden) {
      const idForm = fact.toLowerCase();
      const readableForm = idForm.replace(/_/g, " ");
      if (text.includes(idForm) || text.includes(readableForm)) {
        if (!leaked.includes(fact)) leaked.push(fact);
      }
    }
  }
  return leaked;
}

/** Convenience: the full two-call pipeline (plan then draft). */
export async function planAndDraft(
  provider: DialogueAIProvider,
  scene: SceneSpecification,
  contextPackage: unknown,
): Promise<{ beatPlan: DialogueBeatPlanType; draft: DialogueArtifactType }> {
  const { beatPlan } = await planSceneDraft(provider, { scene, contextPackage });
  const { draft } = await generateDialogueDraft(provider, { scene, beatPlan, contextPackage });
  return { beatPlan, draft };
}
