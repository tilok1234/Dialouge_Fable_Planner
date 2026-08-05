/**
 * The DialogueAIProvider interface (ARCHITECTURE §8).
 *
 * The single seam between core logic and any model — real or mock. Core logic
 * depends on this interface, never on a vendor client (constraint #9). Per
 * amendment Q-A1, the ONLY implementation in this repo is `MockProvider`: the
 * app never makes a real LLM call, reads no API key, opens no network socket.
 *
 * Every method returns schema-valid, already-validated output (the
 * implementation is responsible for parsing + validating before returning;
 * callers additionally re-validate before storing — constraint #12, defence in
 * depth). Output is always UNTRUSTED: it enters a review state, never an
 * accepted asset, until a human accepts it.
 */

import type {
  CanonProposal,
  CharacterProfile,
  DialogueArtifact,
  DialogueBeatPlan,
  DialogueReview,
  SceneSpecification,
} from "@df/schemas";

/** A profile-generation request: a free-text brief + optional hints. */
export interface ProfileRequest {
  /** The author's brief, e.g. "Ancient stone boss guarding a quarry; proud, judicial." */
  brief: string;
  /** Suggested stable id slug (without kind prefix), e.g. "hornblende_golem". */
  idSlug?: string;
  /** Faction ids the character should belong to, if known. */
  factionIds?: string[];
}

/** A scene-planning request: produce a beat plan from a compiled context. */
export interface ScenePlanRequest {
  scene: SceneSpecification;
  /** A context-package snapshot (permitted/forbidden facts, participants, etc.). */
  contextPackage: unknown;
}

/** A dialogue-drafting request: prose from a beat plan + context. */
export interface DialogueRequest {
  scene: SceneSpecification;
  beatPlan: DialogueBeatPlan;
  contextPackage: unknown;
}

/** A review request: run consistency checks on a draft. */
export interface ReviewRequest {
  draft: DialogueArtifact;
  contextPackage: unknown;
}

/** A repair request: fix specific findings on a draft, preserving locks. */
export interface RepairRequest {
  draft: DialogueArtifact;
  review: DialogueReview;
  /** Locked line ids that must survive the repair byte-for-byte. */
  lockedLineIds: string[];
}

/** Result of generation that needed a new world fact: the proposed canon. */
export interface GenerationSideEffects {
  /** Canon facts the generation needed but that don't exist yet (Q-A1: mock
   *  may emit none; a real provider might). Never written silently (contract §4). */
  canonProposals: CanonProposal[];
}

export interface ProfileResult extends GenerationSideEffects {
  profile: CharacterProfile;
}
export interface ScenePlanResult extends GenerationSideEffects {
  beatPlan: DialogueBeatPlan;
}
export interface DialogueResult extends GenerationSideEffects {
  draft: DialogueArtifact;
}
export interface ReviewResult {
  review: DialogueReview;
}
export interface RepairResult {
  /** Patched draft. Caller must re-validate and human-accept before storing. */
  draft: DialogueArtifact;
}

/**
 * The provider seam. The mock is the only implementation (Q-A1). The same
 * interface would be satisfied by a future GLM/Claude/local implementation
 * for anyone who opts in — core logic needs no changes.
 */
export interface DialogueAIProvider {
  readonly id: string;
  generateProfile(request: ProfileRequest): Promise<ProfileResult>;
  planScene(request: ScenePlanRequest): Promise<ScenePlanResult>;
  generateDialogue(request: DialogueRequest): Promise<DialogueResult>;
  reviewDialogue(request: ReviewRequest): Promise<ReviewResult>;
  repairDialogue(request: RepairRequest): Promise<RepairResult>;
}
