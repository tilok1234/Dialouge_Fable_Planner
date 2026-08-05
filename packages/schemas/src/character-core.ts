/**
 * Character core (ARCHITECTURE §3.3.2).
 *
 * Deliberately short and strongly prioritized, not a pile of adjectives. The
 * central contradiction generates far more coherent dialogue than twenty
 * disconnected traits. The commander believes order protects ordinary people,
 * yet his obsession with order makes him treat those people as expendable.
 */

import { z } from "zod";

import { LocalizedText } from "./common.js";

export const CharacterCore = z.object({
  primaryDesire: LocalizedText,
  primaryFear: LocalizedText,
  centralValue: LocalizedText,
  /** How the central value becomes harmful. */
  mainFlaw: LocalizedText,
  /** What makes the character more than one-dimensional. */
  centralContradiction: LocalizedText,
  /** What they will refuse to do. */
  moralBoundary: LocalizedText,
  /** What could make them cross that boundary. */
  breakingPoint: LocalizedText.optional(),
});

export type CharacterCore = z.infer<typeof CharacterCore>;
