/**
 * Dialogue generation flow (Stages 2 + 3).
 *
 * Two-call pattern (ARCHITECTURE §2.2): the beat plan is produced first, then
 * prose is drafted from it. Each stage validate-before-store (constraint #12).
 *
 * The forbidden-facts gate: after drafting, the orchestrator scans every line
 * for a LITERAL reference to a fact in the scene's `forbiddenRevelations`
 * (the id, or the id with underscores as spaces). Be honest about what that
 * is: a tripwire for id echoes, NOT a semantic leak detector — a model that
 * paraphrases a secret ("the miners made me, long ago") passes this check.
 * Semantic leak detection is layered elsewhere: the provider prompt forbids
 * paraphrase/implication, the AI review tier is instructed to hunt for
 * paraphrased leaks, and the human accept gate is the final authority. This
 * gate is the cheap deterministic floor under those layers, nothing more.
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

  // Knowledge gate: no line may literally reference a forbidden fact id
  // (`fact_x` or "fact x"). Catches id echoes only — see the header note.
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

  // Provenance pinning (constraint #6): the provider can't know which source
  // versions the compiler selected, so the orchestrator pins them here from
  // the compiled snapshot. Staleness detection depends on these being real.
  const pinned = pinProvenance(parsed.data, request.contextPackage);

  return { draft: pinned };
}

/** VersionedRef pin from any snapshot object carrying id + version. */
type Pinnable = { id?: unknown; version?: unknown } | undefined;
function pin(x: Pinnable): { id: string; version: number } | null {
  return x && typeof x.id === "string" && typeof x.version === "number" ? { id: x.id, version: x.version } : null;
}

/** Fill the draft's provenance pins from a compiled context snapshot, if one
 * was provided. Re-validated before return (constraint #12). */
function pinProvenance(draft: DialogueArtifactType, contextPackage: unknown): DialogueArtifactType {
  const snap = contextPackage as
    | {
        participants?: { profile?: Pinnable; state?: Pinnable }[];
        permittedFacts?: Pinnable[];
        factions?: Pinnable[];
        relationships?: Pinnable[];
      }
    | null
    | undefined;
  if (!snap || !Array.isArray(snap.participants)) return draft;

  const pins = (xs: Pinnable[] | undefined) => (xs ?? []).map(pin).filter((p): p is { id: string; version: number } => p !== null);
  const candidate: DialogueArtifactType = {
    ...draft,
    provenance: {
      ...draft.provenance,
      characterProfiles: pins(snap.participants.map((p) => p.profile)),
      characterStates: pins(snap.participants.map((p) => p.state)),
      factions: pins(snap.factions),
      relationships: pins(snap.relationships),
      canonSnapshot: pins(snap.permittedFacts),
    },
  };
  const revalidated = DialogueArtifact.safeParse(candidate);
  if (!revalidated.success) {
    throw new GenerationError(
      `provenance pinning produced an invalid DialogueArtifact: ${revalidated.error.issues[0]?.message}`,
      candidate,
    );
  }
  return revalidated.data;
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
