/**
 * SceneSpecification — the contract for one conversation
 * (ARCHITECTURE §3.7, §4).
 *
 * This is the primary steering input to the Context Compiler. It binds
 * participants to quest stages, declares what MUST be communicated, what MAY be
 * hinted, what MUST NOT yet be revealed, the emotional arc, the length band,
 * and the available player choices.
 *
 * SceneType comes from the typed template library (ARCHITECTURE §4). Each type
 * implies requirements/forbidden/length defaults that the compiler and reviewer
 * consult — they are NOT hardcoded prompts.
 */

import { z } from "zod";

import { LocalizedText, Ref, StableId, Versioned } from "./common.js";

export const SceneType = z.enum([
  // Quest
  "quest-introduction",
  "quest-offer",
  "quest-accept",
  "quest-decline",
  "quest-return-after-declining",
  "quest-progress-update",
  "quest-missing-requirement",
  "quest-success",
  "quest-partial-success",
  "quest-failure",
  "quest-betrayal-outcome",
  "quest-later-consequence",
  // Boss
  "boss-first-encounter",
  "boss-rematch",
  "boss-aggro",
  "boss-phase-transition",
  "boss-mechanic-warning",
  "boss-player-wounded",
  "boss-wounded",
  "boss-kills-player",
  "boss-victory",
  "boss-defeat",
  "boss-escape",
  "boss-post-defeat",
  // Ordinary NPC
  "npc-first-greeting",
  "npc-repeat-greeting",
  "npc-friendly-greeting",
  "npc-hostile-greeting",
  "npc-service",
  "npc-rumour",
  "npc-location-reaction",
  "npc-quest-state-reaction",
  "npc-ambient-bark",
  "npc-combat-reaction",
  "npc-farewell",
  // Longer-form
  "monologue",
  "sermon",
  "journal-entry",
  "letter",
  "historical-account",
  "companion-conversation",
  "ambient-two-npc-conversation",
]);

export const LengthBand = z.enum(["single-line", "very-short", "short", "medium", "long"]);

export const SceneParticipant = z.object({
  characterId: Ref,
  /** The CharacterState id to load for this participant in this scene. */
  stateId: Ref,
  /** Relationship file(s) relevant to the other participant(s). */
  relationshipIds: z.array(Ref).default([]),
  /** Speaker role in this scene. */
  role: z.enum(["speaker", "interlocutor", "player-proxy", "chorus"]).default("speaker"),
});

export const EmotionalBeat = z.object({
  /** Ordered beat within the scene, 1-based. */
  order: z.number().int().min(1),
  emotion: z.string().min(1).max(64),
  note: z.string().max(280).optional(),
});

export const SceneSpecification = Versioned.extend({
  /** e.g. scene_golem_first_encounter */
  id: StableId,
  /** Human label. */
  label: z.string().min(1).max(160),
  sceneType: SceneType,
  participants: z.array(SceneParticipant).min(1),
  /** Quest stage(s) this scene is bound to (grounds knowledge gating). */
  boundQuestStages: z.array(Ref).default([]),
  /** The single sentence describing why this scene exists. */
  purpose: LocalizedText,
  /** Facts that the dialogue MUST convey. */
  requiredFacts: z.array(Ref).default([]),
  /** Facts that MAY be hinted but must not be confirmed. */
  hintableFacts: z.array(Ref).default([]),
  /** Facts that MUST NOT be revealed at this point. The leak detector enforces. */
  forbiddenRevelations: z.array(Ref).default([]),
  /** Emotional progression, e.g. "controlled judgment → offended warning". */
  emotionalProgression: z.array(EmotionalBeat).default([]),
  /** Hard length cap for the writer. */
  maxLength: LengthBand.default("short"),
  /** Choices the player may take in this scene; each names a resulting stage. */
  availableChoices: z.array(Ref).default([]),
  /** Scene-type-derived defaults the compiler/ reviewer consult. */
  templateDefaults: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().max(2000).optional(),
});

export type SceneSpecification = z.infer<typeof SceneSpecification>;
export type SceneType = z.infer<typeof SceneType>;
