/**
 * CanonFact — an objective truth about the game world.
 * Author-owned. Addressable, versioned, lockable. See ARCHITECTURE §3.1.
 *
 * Per contract §4: the AI never silently writes canon. Canon only changes by
 * direct human edit or by accepting a CanonProposal (see proposals.ts).
 */

import { z } from "zod";
import { LocalizedText, Ref, StableId, TagList, Versioned } from "./common.js";

export const CanonVeracity = z.enum(["objective-truth", "established-fact", "world-rule"]);
export const CanonVisibility = z.enum(["public", "known-to-faction", "known-to-few", "secret"]);

export const CanonFact = Versioned.extend({
  /** e.g. canon_western_kingdom_collapse */
  id: StableId,
  /** Short human label, e.g. "Western Kingdom collapse". */
  label: z.string().min(1).max(120),
  /** The canonical statement of the fact, in-world. */
  statement: LocalizedText,
  /** How true this is inside the fiction. objective-truth is non-negotiable. */
  veracity: CanonVeracity.default("established-fact"),
  /** Who can plausibly know this. Constrains the knowledge model. */
  visibility: CanonVisibility.default("public"),
  /** When the fact occurred in-world, for timeline ordering. */
  inWorldDate: z.string().max(64).optional(),
  /** Other canon facts this one depends on / refines / contradicts. */
  references: z.array(Ref).default([]),
  /** Free-form tags for retrieval by the Context Compiler. */
  tags: TagList,
  /** Author notes; never injected into prompts. */
  notes: z.string().max(2000).optional(),
});

export type CanonFact = z.infer<typeof CanonFact>;
