/**
 * Deterministic content hashing (Q-F3).
 *
 * `contentHash` is over MEANINGFUL content only — the fields that determine
 * behaviour and identity. It deliberately EXCLUDES `version`, `createdAt`,
 * `updatedAt`, and the `contentHash` field itself, so that:
 *   - bumping `version` alone does NOT change the hash (provenance detects
 *     "only metadata changed"), and
 *   - any real content edit DOES change the hash (staleness flags fire).
 *
 * Determinism: object keys are sorted recursively; arrays preserve order
 * (order is meaningful for beats, lines, quest stages); no insignificant
 * whitespace. The same logical content always yields the same hash, across
 * machines and Node versions.
 */

import { createHash } from "node:crypto";

/** Fields excluded from content hashing across every artifact. */
export const HASH_EXCLUDED_FIELDS = new Set(["version", "contentHash", "createdAt", "updatedAt"]);

/**
 * Canonicalize a value for hashing. Objects get sorted keys; arrays keep order;
 * primitives stringify directly. Excluded fields are dropped from objects.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(stripAndSort(value));
}

function stripAndSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripAndSort);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (HASH_EXCLUDED_FIELDS.has(key)) continue;
      out[key] = stripAndSort(obj[key]);
    }
    return out;
  }
  return value;
}

/**
 * SHA-256 over the canonical form of `value`, prefixed `sha256:`.
 * Deterministic: same content → same hash. Stable across processes/machines.
 */
export function contentHash(value: unknown): string {
  const canon = canonicalize(value);
  const digest = createHash("sha256").update(canon, "utf8").digest("hex");
  return `sha256:${digest}`;
}

/** Constant-time-ish equality of two hex digests (lengths are equal for sha256). */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
