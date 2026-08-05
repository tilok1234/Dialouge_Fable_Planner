/**
 * DialogueBeatPlan — Stage 2 output (ARCHITECTURE §2.1, §2.2).
 *
 * A short structured outline produced BEFORE prose. Drafting from an approved
 * beat plan prevents attractive individual lines from displacing the scene's
 * actual narrative purpose, and gives the reviewer something structured to
 * check the draft against.
 */

import { z } from "zod";
import { LocalizedText, Ref, StableId, Versioned } from "./common.js";

export const DialogueBeat = z.object({
  /** 1-based order in the scene. */
  order: z.number().int().min(1),
  /** Who delivers this beat (character id). */
  speakerId: Ref,
  /** The communicative intent, e.g. "acknowledge the player broke the seals". */
  intent: z.string().min(1).max(200),
  /** Canon fact(s) this beat must land on, if any. */
  landsOn: z.array(Ref).default([]),
  /** Emotional posture for this beat, e.g. "offended warning". */
  emotion: z.string().max(64).optional(),
});

export const DialogueBeatPlan = Versioned.extend({
  /** e.g. beat_golem_first_encounter */
  id: StableId,
  /** Scene this plan was compiled for. */
  sceneId: Ref,
  /** Context package this plan was built from (inspectable provenance). */
  contextPackageId: Ref,
  beats: z.array(DialogueBeat).min(1),
  /** What the plan deliberately avoids doing. */
  avoids: z.array(z.string().min(1).max(200)).default([]),
});

export type DialogueBeatPlan = z.infer<typeof DialogueBeatPlan>;
export type DialogueBeat = z.infer<typeof DialogueBeat>;
