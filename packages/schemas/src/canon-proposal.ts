/**
 * CanonProposal — the canon proposal inbox (ARCHITECTURE §6.4, contract §4).
 *
 * The AI NEVER silently creates world canon. When generation needs a fact that
 * doesn't exist, it submits a proposal here. Approval/edit/rejection is a human
 * action. This is the single biggest guard against silent lore drift.
 */

import { z } from "zod";
import { LocalizedText, Ref, StableId, Versioned } from "./common.js";
import { CanonFact, CanonVeracity, CanonVisibility } from "./canon.js";

export const ProposalStatus = z.enum(["pending", "accepted", "rejected", "superseded"]);

export const CanonProposal = Versioned.extend({
  /** e.g. prop_seals_built_by_miners */
  id: StableId,
  /** Candidate CanonFact payload, pre-validation. */
  proposedFact: CanonFact.partial({ version: true, contentHash: true, createdAt: true, updatedAt: true }),
  /** Why the fact was needed. */
  reason: z.string().min(1).max(400),
  /** Where it would be referenced. */
  affectedAssets: z
    .array(
      z.object({
        kind: z.enum(["character", "quest", "scene", "dialogue", "faction"]),
        id: Ref,
      }),
    )
    .default([]),
  status: ProposalStatus.default("pending"),
  /** If accepted, the resulting canon id and version. */
  acceptedAsCanonId: Ref.optional(),
  /** Free-text human decision note. */
  decision: z.string().max(400).optional(),
  decidedAt: z.string().datetime().optional(),
  /** Default visibility/veracity the human may keep or override. */
  suggestedVeracity: CanonVeracity.default("established-fact"),
  suggestedVisibility: CanonVisibility.default("known-to-few"),
});

export type CanonProposal = z.infer<typeof CanonProposal>;
export type ProposalStatus = z.infer<typeof ProposalStatus>;
