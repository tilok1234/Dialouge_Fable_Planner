/**
 * Shared primitives used by every Dialogue Foundry schema.
 *
 * These encode the cross-cutting contracts from PRODUCT_CONTRACT.md:
 *  - stable IDs (§4, §7) and stable references (§3 — "by ID, never embedding")
 *  - versioning + provenance (§5, constraint #6)
 *  - locking (§6, constraint #7)
 *  - the six knowledge categories (§7.2, constraint #5)
 *
 * Nothing in this file imports another @df package, and it imports nothing but
 * zod. That keeps `@df/schemas` the trusted foundation.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Stable IDs                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Kind-prefixed stable IDs, snake_case. See REPO_LAYOUT.md §4.1.
 *   char_hornblende_golem, fac_stoneborn, quest_quarry_seals,
 *   scene_golem_first_encounter, canon_western_kingdom_collapse.
 *
 * Immutable once anything references them. The regex is deliberately strict so
 * IDs are filesystem-safe and diff-friendly.
 */
/**
 * Kind-prefixed stable IDs, snake_case. See REPO_LAYOUT.md §4.1.
 *   char_hornblende_golem, fac_stoneborn, quest_quarry_seals,
 *   scene_golem_first_encounter, canon_western_kingdom_collapse.
 *
 * A single `__` (double underscore) sub-segment is permitted once, after the
 * kind, to namespace derived artifacts — e.g. state_hornblende_golem__phase_two,
 * rel_hornblende_golem__player, quest_quarry_seals__stage_2.
 *
 * Immutable once anything references them. Strict on purpose so ids stay
 * filesystem-safe and diff-friendly.
 */
export const StableIdRegex = /^[a-z][a-z0-9]*_[a-z0-9]+(?:_[a-z0-9]+)*(?:__[a-z0-9]+(?:_[a-z0-9]+)*)?$/;
export const StableId = z
  .string()
  .min(3)
  .max(128)
  .regex(StableIdRegex, "stable id must be <kind>_<snake_case_slug>, e.g. char_hornblende_golem");

/** A reference to another artifact by stable ID. Never embed; always resolve. */
export const Ref = z.string().min(3).max(128);

/** A stable reference that also pins the version of the thing it points at. */
export const VersionedRef = z.object({
  id: Ref,
  /** Version of the referenced artifact at the time of reference. */
  version: z.number().int().min(1),
});

/* -------------------------------------------------------------------------- */
/* Versioning + provenance                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every artifact carries this. `version` is monotonic and bumps on any change.
 * `contentHash` is a stable hash of the meaningful content (excluding `version`
 * itself and timestamps) so provenance can detect *semantic* drift, not just
 * any byte change. Hashing algorithm is decided in @df/core; here we only
 * constrain the shape.
 */
export const Versioned = z.object({
  version: z.number().int().min(1),
  contentHash: z.string().min(8).max(128),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/** A field-level lock. See PRODUCT_CONTRACT §6 / constraint #7. */
export const LockState = z.enum(["unlocked", "soft-locked", "hard-locked"]);
export const Lock = z.object({
  state: LockState,
  /** Who set the lock and when; human locks must survive regeneration. */
  lockedBy: z.string().optional(),
  lockedAt: z.string().datetime().optional(),
  /** Free-text reason shown in the UI. */
  reason: z.string().max(280).optional(),
});

/**
 * A localized string. v1 authors in one language but emits stable localization
 * keys on export (NON_GOALS §2.3, contract §10). `key` is the stable id used by
 * external tooling; `value` is the authored text.
 */
export const LocalizedText = z.object({
  key: z.string().min(1).max(128).optional(),
  value: z.string().min(1),
  lang: z.string().min(2).max(16).default("en"),
});

/* -------------------------------------------------------------------------- */
/* The six knowledge categories (constraint #5)                               */
/* -------------------------------------------------------------------------- */

/**
 * Knowledge is modelled as six DISJOINT buckets. A character may only reference
 * information that `knows` or `secrets` permits; `believes_false` and `lies`
 * are explicitly tracked so the consistency engine can tell a sincere
 * falsehood from a deliberate one. This is the contract that makes
 * knowledge-leak detection possible (ARCHITECTURE §3.3 / §6.1).
 */
export const KnowledgeModel = z.object({
  /** Objectively true facts the character genuinely knows. */
  knows: z.array(Ref).default([]),
  /** Things the character believes but are objectively false. */
  believesFalse: z.array(Ref).default([]),
  /** Things the character suspects without certainty. */
  suspects: z.array(Ref).default([]),
  /** True facts the character knows but will not reveal. */
  secrets: z.array(Ref).default([]),
  /** Things the character willfully states as other than they are. */
  lies: z.array(Ref).default([]),
  /** Things the character has no awareness of (defensive: blocks leakage). */
  unknown: z.array(Ref).default([]),
});

/* -------------------------------------------------------------------------- */
/* Tag helper                                                                 */
/* -------------------------------------------------------------------------- */

/** Non-empty, trimmed string list with unique members. */
export const TagList = z
  .array(z.string().min(1).max(64))
  .min(0)
  .transform((arr) => Array.from(new Set(arr.map((s) => s.trim()))));
