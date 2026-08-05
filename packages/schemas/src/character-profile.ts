/**
 * CharacterProfile — permanent identity (ARCHITECTURE §3.3).
 *
 * The source-code analogue: "the character profile is source code; the dialogue
 * is compiled output" (PRODUCT_CONTRACT §1). Changes only during a deliberate
 * arc, and even then via a reviewable patch.
 *
 * Per contract §7: permanent profile vs. mutable state are separate objects;
 * knowledge is six disjoint buckets; opinions are first-class and versioned;
 * voice is structural.
 */

import { z } from "zod";
import { LocalizedText, Ref, StableId, TagList, Versioned } from "./common.js";
import { KnowledgeModel } from "./common.js";
import { CharacterCore } from "./character-core.js";
import { Opinion } from "./opinion.js";
import { VoiceProfile } from "./voice.js";
import { PressureProfile } from "./pressure.js";

export const NarrativeFunction = z.enum([
  "introduce-region",
  "represent-faction-worldview",
  "mislead-player",
  "deliver-emotional-relief",
  "recurring-rival",
  "test-moral-compromise",
  "quest-giver",
  "merchant",
  "lore-keeper",
  "boss",
  "companion",
  "ambient",
  "other",
]);

export const GameplayRole = z.enum([
  "boss",
  "elite",
  "quest-giver",
  "merchant",
  "companion",
  "ambient-npc",
  "narrator",
  "other",
]);

export const IdentityAndRole = z.object({
  name: z.string().min(1).max(120),
  species: z.string().max(80).optional(),
  culture: z.string().max(80).optional(),
  /** Faction refs. Voice/metaphor may inherit from the first by default. */
  factions: z.array(Ref).default([]),
  occupation: z.string().max(120).optional(),
  gameplayRole: GameplayRole.default("ambient-npc"),
  narrativeFunction: NarrativeFunction.default("other"),
  /** What the world generally believes about them. */
  publicReputation: LocalizedText.optional(),
  /** What is actually true, possibly at odds with reputation. */
  privateReality: LocalizedText.optional(),
  /** Quests, regions, characters this one connects to. */
  connections: z.array(Ref).default([]),
});

export const CharacterProfile = Versioned.extend({
  /** e.g. char_hornblende_golem */
  id: StableId,
  identity: IdentityAndRole,
  core: CharacterCore,
  opinions: z.array(Opinion).default([]),
  knowledge: KnowledgeModel,
  voice: VoiceProfile,
  pressure: PressureProfile.default([]),
  tags: TagList,
  notes: z.string().max(4000).optional(),
});

export type CharacterProfile = z.infer<typeof CharacterProfile>;
export type IdentityAndRole = z.infer<typeof IdentityAndRole>;
