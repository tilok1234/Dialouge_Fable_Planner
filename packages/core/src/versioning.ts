/**
 * Versioning helpers.
 *
 * An artifact's `version` is monotonic and bumps on any accepted change. The
 * `contentHash` (from hashing.ts) is computed over content excluding `version`
 * itself, so provenance can detect *semantic* drift, not just any byte change.
 */

import { contentHash } from "./hashing.js";

/** Fields shared by every versioned artifact (mirrors @df/schemas `Versioned`). */
export interface Versioned {
  version: number;
  contentHash: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Produce a freshly-hashed versioned envelope for new content.
 * Caller supplies version (usually 1 for new, or prev+1 for an edit).
 */
export function stamp<T extends Record<string, unknown>>(
  content: T,
  version: number,
  now: Date = new Date(),
): T & Versioned {
  const iso = now.toISOString();
  return {
    ...content,
    version,
    contentHash: contentHash(content),
    createdAt: iso,
    updatedAt: iso,
  };
}

/**
 * Produce the next versioned envelope from a previous one, preserving
 * `createdAt` and bumping `updatedAt`. Recomputes the hash from the new
 * content. Does NOT mutate the input.
 */
export function revise<T extends Record<string, unknown>>(
  prev: T & Versioned,
  nextContent: T,
  now: Date = new Date(),
): T & Versioned {
  return {
    ...nextContent,
    version: prev.version + 1,
    contentHash: contentHash(nextContent),
    createdAt: prev.createdAt,
    updatedAt: now.toISOString(),
  };
}

/** True iff `next` represents a real content change from `prev`. */
export function contentChanged(prev: Versioned, nextContent: unknown): boolean {
  return prev.contentHash !== contentHash(nextContent);
}
