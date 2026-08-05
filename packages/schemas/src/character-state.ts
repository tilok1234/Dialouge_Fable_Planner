/**
 * CharacterState — MUTABLE current state (ARCHITECTURE §3.4).
 *
 * The counterpart to CharacterProfile. One profile → many states. A boss keeps
 * a single permanent profile but separate states for pre-encounter, phase one,
 * phase two, final phase, defeat, rematch, post-quest. This is the separation
 * mandated by contract §7.1 / constraint #4.
 *
 * Important: this object holds NO permanent identity. Identity lives in the
 * profile. State is transient game-time truth.
 */

import { z } from "zod";

import { LocalizedText, Ref, StableId, Versioned } from "./common.js";

export const CharacterState = Versioned.extend({
  /** e.g. state_hornblende_golem__phase_two */
  id: StableId,
  /** The character this state belongs to. */
  characterId: Ref,
  /** Human label, e.g. "Phase two — damaged". */
  label: z.string().min(1).max(120),
  /** Current emotional posture, e.g. "offended, escalating". */
  mood: z.string().min(1).max(120),
  /** Current in-world location. */
  location: z.string().max(120).optional(),
  /** Current injuries / physical status notes. */
  injuries: z.array(z.string().min(1).max(160)).default([]),
  /** Quest stage(s) this state is anchored to, if any. */
  activeQuestStages: z.array(Ref).default([]),
  /** Things witnessed recently that colour the next lines. */
  recentEvents: z.array(LocalizedText).default([]),
  /** Short-term goal overriding the core desire. */
  temporaryObjective: LocalizedText.optional(),
  /** Facts learned during play (added to the knowledge model for THIS state). */
  factsLearned: z.array(Ref).default([]),
  /** Outstanding promises (to or from the character). */
  promises: z
    .array(
      z.object({
        to: Ref.optional(),
        text: LocalizedText,
        kept: z.boolean().optional(),
      }),
    )
    .default([]),
  /** Whether the player has betrayed them in this branch of state. */
  playerBetrayed: z.boolean().default(false),
  /** Pointer to the last conversation that occurred in this state. */
  lastConversationId: Ref.optional(),
  /** Open threads the character is aware of. */
  unresolvedConflicts: z.array(LocalizedText).default([]),
  /** Boss/encounter phase marker, where applicable. */
  phase: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
});

export type CharacterState = z.infer<typeof CharacterState>;
