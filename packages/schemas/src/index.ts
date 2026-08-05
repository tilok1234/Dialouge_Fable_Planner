/**
 * @df/schemas — barrel.
 *
 * The single import surface every other package uses. If a schema isn't here,
 * it isn't part of the contract.
 *
 * Schemas validate every artifact crossing a stage boundary (constraint #12).
 * Validation failure is a HARD STOP, not a warning.
 */

export * from "./common.js";
export * from "./project.js";
export * from "./canon.js";
export * from "./canon-helpers.js";
export * from "./context-package.js";
export * from "./faction.js";
export * from "./opinion.js";
export * from "./voice.js";
export * from "./pressure.js";
export * from "./character-core.js";
export * from "./character-profile.js";
export * from "./character-state.js";
export * from "./relationship.js";
export * from "./quest.js";
export * from "./scene.js";
export * from "./dialogue-beat-plan.js";
export * from "./dialogue-artifact.js";
export * from "./dialogue-review.js";
export * from "./canon-proposal.js";
