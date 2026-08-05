/**
 * Profile generation flow (Stage: profile creation).
 *
 * Orchestrates: brief -> provider.generateProfile -> validate-before-store
 * -> return a DRAFT for human review. The draft is never written to the
 * project until a human accepts fields (contract §4, constraint #12).
 *
 * Pure: depends on the injected provider (constraint #9), no fs, no network of
 * its own. The provider is the only thing that could ever touch a network, and
 * per Q-A1 the only shipped provider is the mock (no key, no socket).
 */

import type { DialogueAIProvider, ProfileRequest } from "@df/providers";
import { CharacterProfile, type CanonProposal, type CharacterProfile as CharacterProfileType } from "@df/schemas";


export interface ProfileDraft {
  /** The generated, schema-valid candidate profile. NOT yet part of any project. */
  profile: CharacterProfileType;
  /** New canon facts the provider needed (the mock proposes none; reviewed before adding). */
  canonProposals: CanonProposal[];
}

export class GenerationError extends Error {
  constructor(
    message: string,
    /** The raw, invalid output — for diagnostics only, never stored. */
    readonly raw: unknown,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/**
 * Generate a character profile draft from a brief.
 *
 * Guarantees:
 *  - The returned `profile` is schema-valid (re-validated here, defence in
 *    depth on top of whatever the provider did — constraint #12).
 *  - Nothing is written to disk; the caller stages the draft for human review.
 *  - Any `canonProposals` are returned for the inbox, never auto-applied.
 */
export async function generateProfileDraft(
  provider: DialogueAIProvider,
  request: ProfileRequest,
): Promise<ProfileDraft> {
  const { profile: rawProfile, canonProposals } = await provider.generateProfile(request);

  // Validate before store (constraint #12). The provider's own validation is
  // not trusted; we re-check here. On failure, throw with the raw output so the
  // caller can show diagnostics without ever persisting it.
  const parsed = CharacterProfile.safeParse(rawProfile);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new GenerationError(
      `provider returned an invalid CharacterProfile: [${first?.code}] ${first?.path.join(".")}: ${first?.message}`,
      rawProfile,
    );
  }

  return { profile: parsed.data, canonProposals };
}
