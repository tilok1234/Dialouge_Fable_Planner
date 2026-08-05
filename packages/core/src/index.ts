/**
 * @df/core — barrel.
 *
 * Domain primitives consumed by every logic package:
 *  - stable IDs (construction + parsing)
 *  - deterministic content hashing (Q-F3)
 *  - versioning envelopes (stamp / revise / contentChanged)
 *  - provenance (versioned refs, staleness, integrity)
 *
 * Depends on @df/schemas for the StableId regex/validator only.
 */

export * from "./stable-id.js";
export * from "./hashing.js";
export * from "./versioning.js";
export * from "./provenance.js";
