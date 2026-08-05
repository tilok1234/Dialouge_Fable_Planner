/**
 * Provenance helpers.
 *
 * Every accepted DialogueArtifact records the EXACT versions (and content
 * hashes) of every source that produced it (constraint #6). When a source
 * bumps version, dependent artifacts are flagged STALE — never auto-regenerated.
 *
 * These helpers build and query versioned references, and detect staleness
 * by comparing a recorded reference against a source's current version/hash.
 */

import { contentHash, hashesEqual } from "./hashing.js";

export interface VersionedRef {
  id: string;
  version: number;
  /** Optional recorded content hash for stronger staleness detection. */
  contentHash?: string;
}

export interface VersionedSource {
  id: string;
  version: number;
  contentHash: string;
}

export function ref(source: VersionedSource): VersionedRef {
  return { id: source.id, version: source.version, contentHash: source.contentHash };
}

/**
 * Staleness check. A reference is stale if:
 *   - the source version moved on, OR
 *   - (when both hashes are known) the source content hash differs.
 * Version drift is the primary signal; hash drift catches same-version edits.
 */
export function isStale(reference: VersionedRef, source: VersionedSource): boolean {
  if (reference.version !== source.version) return true;
  if (reference.contentHash !== undefined && reference.contentHash !== undefined) {
    return !hashesEqual(reference.contentHash, source.contentHash);
  }
  return false;
}

/**
 * Verify a value's stored hash still matches its content. Catches tampering
 * and "edited the file but forgot to re-stamp" cases.
 */
export function hashIntegrityValid(value: Record<string, unknown>): boolean {
  const stored = typeof value.contentHash === "string" ? (value.contentHash as string) : undefined;
  if (!stored) return false;
  return hashesEqual(stored, contentHash(value));
}
