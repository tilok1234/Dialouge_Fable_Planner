/**
 * MockProvider — the only provider implementation in this repo (Q-A1).
 *
 * Deterministic, schema-valid, zero-network, zero-key. It picks one of three
 * pre-written profiles by brief keyword so the M3 human gate ("three distinct
 * characters") is demonstrable without a live model. The three voices are
 * deliberately incompatible (proud stone / weary human / chirpy merchant) so
 * voice-comparison tests have real contrast.
 *
 * Only `generateProfile` is fleshed out for M3; the other four methods throw
 * "not yet implemented" — they land in M4/M6 with the same mock pattern.
 */

import { CharacterProfile } from "@df/schemas";

import type {
  DialogueAIProvider,
  DialogueResult,
  ProfileRequest,
  ProfileResult,
  RepairResult,
  ReviewResult,
  ScenePlanResult,
} from "./provider.js";

/** A brief→keyword matcher decides which canned profile to return. */
type BriefKind = "boss" | "quest-giver" | "merchant" | "generic";

function classifyBrief(brief: string): BriefKind {
  const b = brief.toLowerCase();
  if (/\bboss\b|golem|lich|demon|warlord|ancient|guardian/.test(b)) return "boss";
  if (/quest|foreman|innkeeper|mayor|elder|giver/.test(b)) return "quest-giver";
  if (/merchant|trader|prospector|shopkeep|dealer/.test(b)) return "merchant";
  return "generic";
}

/** Build a schema-valid CharacterProfile from a partial template. */
function buildProfile(template: ProfileTemplate, idSlug: string): CharacterProfile {
  const candidate = {
    id: `char_${idSlug}`,
    version: 1,
    contentHash: "sha256:mock-uncommitted",
    identity: template.identity,
    core: template.core,
    opinions: template.opinions ?? [],
    knowledge: template.knowledge ?? { knows: [], believesFalse: [], suspects: [], secrets: [], lies: [], unknown: [] },
    voice: template.voice,
    pressure: template.pressure ?? [],
    tags: template.tags ?? [],
  };
  const parsed = CharacterProfile.safeParse(candidate);
  if (!parsed.success) {
    // The mock's own templates must be schema-valid; fail loudly if not.
    throw new Error(`MockProvider template "${template.identity.name}" failed its own schema: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}

export class MockProvider implements DialogueAIProvider {
  readonly id = "mock";

  async generateProfile(request: ProfileRequest): Promise<ProfileResult> {
    const kind = classifyBrief(request.brief);
    const slug = request.idSlug ?? slugFromBrief(request.brief, kind);
    const template = kind === "boss" ? BOSS : kind === "quest-giver" ? QUEST_GIVER : kind === "merchant" ? MERCHANT : GENERIC;
    const profile = buildProfile(template, slug);
    // Mock proposes no new canon (a real provider might).
    return { profile, canonProposals: [] };
  }

  // The remaining methods land in M4/M6 with the same mock pattern.
  async planScene(): Promise<ScenePlanResult> {
    throw new Error("MockProvider.planScene: not implemented until M4");
  }
  async generateDialogue(): Promise<DialogueResult> {
    throw new Error("MockProvider.generateDialogue: not implemented until M4");
  }
  async reviewDialogue(): Promise<ReviewResult> {
    throw new Error("MockProvider.reviewDialogue: not implemented until M6");
  }
  async repairDialogue(): Promise<RepairResult> {
    throw new Error("MockProvider.repairDialogue: not implemented until M6");
  }
}

/** Default singleton for app wiring. */
export const mockProvider: DialogueAIProvider = new MockProvider();

/* -------------------------------------------------------------------------- */
/* Templates — three distinct, schema-valid character profiles.               */
/* -------------------------------------------------------------------------- */

interface ProfileTemplate {
  identity: Partial<CharacterProfile["identity"]>;
  core: CharacterProfile["core"];
  voice: Partial<CharacterProfile["voice"]>;
  opinions?: CharacterProfile["opinions"];
  knowledge?: Partial<CharacterProfile["knowledge"]>;
  pressure?: CharacterProfile["pressure"];
  tags?: string[];
}

const BOSS: ProfileTemplate = {
  identity: {
    name: "The Hollow King",
    species: "animated stone",
    factions: [],
    occupation: "Guardian of the sealed deep",
    gameplayRole: "boss",
    narrativeFunction: "boss",
    publicReputation: { value: "A monument that walks; none who wake it return.", lang: "en" },
    privateReality: { value: "A guardian built to atone for a theft it cannot forgive.", lang: "en" },
    connections: [],
  },
  core: {
    primaryDesire: { value: "To keep the deep sealed until the world forgets it was wounded.", lang: "en" },
    primaryFear: { value: "That it is only another tool of the harm it was made to end.", lang: "en" },
    centralValue: { value: "What was taken must be returned in stillness.", lang: "en" },
    mainFlaw: { value: "It cannot tell a penitent from a thief.", lang: "en" },
    centralContradiction: { value: "Made by the very hands it now judges.", lang: "en" },
    moralBoundary: { value: "It will not strike one who kneels unarmed.", lang: "en" },
  },
  voice: {
    formality: "formal",
    directness: "direct",
    metaphorDomain: { source: "stone, weight, erosion, debt", examples: [{ value: "Your name will erode before this vein remembers it.", lang: "en" }] },
    emotionalRestraint: "impenetrable",
    usesHumor: "never",
    sampleLines: [
      { value: "You walk beneath stolen stone and call yourself its master.", lang: "en" },
      { value: "The mountain does not forgive. It merely outlives.", lang: "en" },
    ],
    antiSampleLines: [{ value: "Foolish mortal! You dare challenge my power?", lang: "en" }],
  },
  pressure: [{ condition: "defeated", emotion: "weary acknowledgement", behaviour: "Refuses to beg; names the vein one last time." }],
  tags: ["boss", "mock", "stone"],
};

const QUEST_GIVER: ProfileTemplate = {
  identity: {
    name: "Warden Brae",
    species: "human",
    factions: [],
    occupation: "Retired garrison warden",
    gameplayRole: "quest-giver",
    narrativeFunction: "quest-giver",
    publicReputation: { value: "A tired official who drinks alone and changes the subject.", lang: "en" },
    privateReality: { value: "She ordered a retreat that saved her garrison and has spent twenty years calling it duty.", lang: "en" },
    connections: [],
  },
  core: {
    primaryDesire: { value: "To die knowing the garrison's children are safe.", lang: "en" },
    primaryFear: { value: "That what she calls prudence, history will call cowardice.", lang: "en" },
    centralValue: { value: "A warden brings her people home. Everything else is negotiable.", lang: "en" },
    mainFlaw: { value: "She frames her own escape as leadership and refuses to look closely at that frame.", lang: "en" },
    centralContradiction: { value: "She saved her garrison by fleeing the thing they had built.", lang: "en" },
    moralBoundary: { value: "She will not send another soldier to die for her peace of mind.", lang: "en" },
  },
  voice: {
    formality: "casual",
    directness: "indirect",
    metaphorDomain: { source: "work, weight, pay, the road home", examples: [{ value: "Some debts you don't settle. You just keep making payments till you're dead.", lang: "en" }] },
    emotionalRestraint: "guarded",
    usesHumor: "dry",
    sampleLines: [
      { value: "You want the garrison story. Course you do. Everyone does, eventually.", lang: "en" },
      { value: "I got my people out that day. Don't ask me to feel right about it.", lang: "en" },
    ],
    antiSampleLines: [{ value: "By the gods! A hero has come at last to lift our curse!", lang: "en" }],
  },
  tags: ["quest-giver", "mock", "human"],
};

const MERCHANT: ProfileTemplate = {
  identity: {
    name: "Pell the Trader",
    species: "human",
    factions: [],
    occupation: "Itinerant dealer in rare goods",
    gameplayRole: "ambient-npc",
    narrativeFunction: "recurring-rival",
    publicReputation: { value: "A cheerful trader who always knows where the next strike is.", lang: "en" },
    privateReality: { value: "He wants the find of his career and has waited years for the right fool to open the door.", lang: "en" },
    connections: [],
  },
  core: {
    primaryDesire: { value: "To cut the deal that lets him retire remembered.", lang: "en" },
    primaryFear: { value: "Dying broke on a road nobody remembers his name.", lang: "en" },
    centralValue: { value: "Anything's for sale; the only sin is a bad price.", lang: "en" },
    mainFlaw: { value: "He reads every kindness as leverage.", lang: "en" },
    centralContradiction: { value: "He wants to be remembered, but his trade depends on never being noticed.", lang: "en" },
    moralBoundary: { value: "He won't kill, and won't sell someone into a death he saw coming.", lang: "en" },
  },
  voice: {
    formality: "very-casual",
    directness: "indirect",
    declarationStyle: "interrogative",
    metaphorDomain: { source: "coin, weight on a scale, the open road", examples: [{ value: "Everything's got a weight, friend. Even guilt. Especially guilt.", lang: "en" }] },
    emotionalRestraint: "open",
    usesHumor: "frequent",
    sampleLines: [
      { value: "Oh, the old dig? Friend, that place is a retirement plan with teeth.", lang: "en" },
      { value: "I like you. I say that to everyone. But I mean it maybe ten percent.", lang: "en" },
    ],
    antiSampleLines: [{ value: "By my honour, I shall see this sacred duty done.", lang: "en" }],
  },
  tags: ["merchant", "mock", "recurring"],
};

const GENERIC: ProfileTemplate = {
  ...QUEST_GIVER,
  identity: { ...QUEST_GIVER.identity, name: "A newcomer", narrativeFunction: "other" },
  tags: ["mock", "generic"],
};

/** Derive a filesystem-safe slug from the brief when none is supplied. */
function slugFromBrief(brief: string, kind: BriefKind): string {
  const words = brief.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 3).join("_");
  return words || `new_${kind}`;
}
