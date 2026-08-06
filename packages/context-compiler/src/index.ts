/**
 * @df/context-compiler — Stage 1 of the pipeline (ARCHITECTURE §5).
 *
 * Compiles the small, precise context a generation request needs from the
 * project's artifacts. NOT a dump of the whole project: only the participants'
 * profiles/states, the canon facts the scene touches, the participants'
 * factions, and resolved relationship NAMED STATES (never raw dimension
 * numbers — Q-E2: numbers steer resolution, words steer prompts).
 *
 * Two outputs per compile:
 *  - `contextPackage`: the schema-valid, ref-only ContextPackage artifact —
 *    the inspectable record of WHAT was selected (read this first when a
 *    generation goes wrong).
 *  - `snapshot`: the resolved content handed to providers — profiles, states,
 *    fact statements. Forbidden facts appear as IDS ONLY: the drafting call
 *    gets told what to conceal, not handed the secret's wording to leak.
 *
 * Pure: no I/O, no provider imports. Missing refs are reported as warnings,
 * never thrown — a half-wired project should still compile a usable context.
 */

import { contentHash } from "@df/core";
import {
  ContextPackage,
  type CanonFact,
  type CharacterProfile,
  type CharacterState,
  type ContextPackage as ContextPackageType,
  type FactionProfile,
  type RelationshipState,
  type SceneSpecification,
  type Terminology,
} from "@df/schemas";

/** The slice of a project the compiler resolves against. */
export interface ContextSource {
  characters: CharacterProfile[];
  states: CharacterState[];
  canonFacts: CanonFact[];
  factions: FactionProfile[];
  relationships: RelationshipState[];
  /** Project-wide terminology; the writer grounds in faction idiom (Q-F2). */
  terminology?: Terminology[];
}

/** A participant with everything the writer needs resolved. */
export interface ResolvedParticipant {
  characterId: string;
  stateId: string;
  role: string;
  profile?: CharacterProfile;
  state?: CharacterState;
}

/** Relationship view for prompts: named state + history text, no numbers.
 * id/version ride along for provenance pinning, not for the prompt. */
export interface RelationshipView {
  id: string;
  version: number;
  partyA: string;
  partyB: string;
  namedState?: string;
  recentHistory: string[];
}

/** The resolved content handed to providers as the context package snapshot. */
export interface ContextSnapshot {
  sceneId: string;
  participants: ResolvedParticipant[];
  /** Full facts the dialogue MAY use (required + hintable), with statements. */
  permittedFacts: CanonFact[];
  /** Ids the dialogue MUST NOT reveal. Ids only — never the statement text. */
  forbiddenRevelations: string[];
  factions: FactionProfile[];
  relationships: RelationshipView[];
  /** Faction idiom the writer should ground in ("vein-seal", not "magic door"). */
  terminology: Terminology[];
}

export interface CompileWarning {
  ref: string;
  reason: string;
}

export interface CompileResult {
  contextPackage: ContextPackageType;
  snapshot: ContextSnapshot;
  warnings: CompileWarning[];
}

/** Compile the context for one scene against the given project slice. */
export function compileContext(source: ContextSource, scene: SceneSpecification): CompileResult {
  const warnings: CompileWarning[] = [];
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const characters = byId(source.characters);
  const states = byId(source.states);
  const canon = byId(source.canonFacts);
  const factions = byId(source.factions);

  // Participants: resolve profile + state; missing ones become warnings.
  const participants: ResolvedParticipant[] = scene.participants.map((p) => {
    const profile = characters.get(p.characterId);
    if (!profile) warnings.push({ ref: p.characterId, reason: "participant profile not found in project" });
    const state = states.get(p.stateId);
    if (!state) warnings.push({ ref: p.stateId, reason: "participant state not found in project" });
    return { characterId: p.characterId, stateId: p.stateId, role: p.role, profile, state };
  });
  const participantIds = new Set(participants.map((p) => p.characterId));

  // Permitted facts: required + hintable, resolved to full statements.
  const permittedIds = [...new Set([...scene.requiredFacts, ...scene.hintableFacts])];
  const permittedFacts: CanonFact[] = [];
  for (const id of permittedIds) {
    const fact = canon.get(id);
    if (fact) permittedFacts.push(fact);
    else warnings.push({ ref: id, reason: "permitted fact not found in canon" });
  }

  // Forbidden facts stay ids-only in the snapshot; unknown ids are fine to
  // forbid (the gate is a string check), but flag them for the author.
  for (const id of scene.forbiddenRevelations) {
    if (!canon.has(id)) warnings.push({ ref: id, reason: "forbidden fact not found in canon (gate still enforces the id)" });
  }

  // Factions: every faction any participant belongs to.
  const selectedFactions: FactionProfile[] = [];
  for (const p of participants) {
    for (const fid of p.profile?.identity.factions ?? []) {
      const f = factions.get(fid);
      if (f && !selectedFactions.some((x) => x.id === f.id)) selectedFactions.push(f);
      if (!f) warnings.push({ ref: fid, reason: `faction of ${p.characterId} not found in project` });
    }
  }

  // Relationships: any edge touching a participant (the player counts as a
  // party even though it has no profile). Named state + history only.
  const relevantRels = source.relationships.filter(
    (r) => participantIds.has(r.partyA) || participantIds.has(r.partyB),
  );
  const relationships: RelationshipView[] = relevantRels.map((r) => ({
    id: r.id,
    version: r.version,
    partyA: r.partyA,
    partyB: r.partyB,
    namedState: r.namedState,
    recentHistory: r.history.slice(-3).map((h) => h.event.value),
  }));

  // Knowledge enforcement (M11): a required fact someone must SAY has to be
  // genuinely known by at least one participant — profile `knows`, `secrets`
  // (they may choose to reveal), or learned during play in their scene state.
  // Only checked once at least one participant profile resolved; dangling
  // profiles already warned above.
  if (participants.some((p) => p.profile)) {
    for (const factId of scene.requiredFacts) {
      const knownBySomeone = participants.some((p) => {
        if (!p.profile) return false;
        const k = p.profile.knowledge;
        const learned = p.state?.factsLearned ?? [];
        return k.knows.includes(factId) || k.secrets.includes(factId) || learned.includes(factId);
      });
      if (!knownBySomeone) {
        const misbeliever = participants.find(
          (p) => p.profile && (p.profile.knowledge.believesFalse.includes(factId) || p.profile.knowledge.lies.includes(factId)),
        );
        warnings.push({
          ref: factId,
          reason: misbeliever
            ? `required fact is only in ${misbeliever.characterId}'s believesFalse/lies — no participant can state it truthfully`
            : "required fact is not in any participant's knowledge (knows / secrets / state.factsLearned)",
        });
      }
    }
  }

  // Terminology: faction idiom for the participants' factions + factionless
  // global terms. Small by construction; the writer grounds vocabulary in it.
  const selectedFactionIds = new Set(selectedFactions.map((f) => f.id));
  const terminology = (source.terminology ?? []).filter(
    (t) => t.factions.length === 0 || t.factions.some((f) => selectedFactionIds.has(f)),
  );

  const snapshot: ContextSnapshot = {
    sceneId: scene.id,
    participants,
    permittedFacts,
    forbiddenRevelations: [...scene.forbiddenRevelations],
    factions: selectedFactions,
    relationships,
    terminology,
  };

  // The ref-only artifact. Its contentHash is real (Q-F3) so provenance can
  // detect when a re-compile actually selected different context.
  const primary = relevantRels.find(
    (r) => r.partyA === participants[0]?.characterId || r.partyB === participants[0]?.characterId,
  );
  const pkgCandidate = {
    id: `ctx_${stripPrefix(scene.id, "scene_")}`,
    version: 1,
    contentHash: "sha256:pending",
    sceneId: scene.id,
    questStageIds: [...scene.boundQuestStages],
    compiledAt: new Date().toISOString(),
    participants: scene.participants.map((p) => ({
      characterId: p.characterId,
      stateId: p.stateId,
      relationshipId: relevantRels.find((r) => r.partyA === p.characterId || r.partyB === p.characterId)?.id,
    })),
    selectedCanon: permittedFacts.map((f) => f.id),
    selectedFactions: selectedFactions.map((f) => f.id),
    factsPermittedInDialogue: permittedIds,
    factsForbiddenInDialogue: [...scene.forbiddenRevelations],
    memorySummaries: [],
    relationshipSnapshot: primary
      ? { namedState: primary.namedState, ...primary.dimensions }
      : undefined,
  };
  // Hash the SELECTION, not the timestamp: exclude compiledAt so an identical
  // re-compile yields an identical hash (staleness detection stays meaningful).
  pkgCandidate.contentHash = contentHash({ ...pkgCandidate, compiledAt: undefined });

  const parsed = ContextPackage.safeParse(pkgCandidate);
  if (!parsed.success) {
    // Compiler bug, not author error: our own output must satisfy the schema.
    throw new Error(`compileContext produced an invalid ContextPackage: ${parsed.error.issues[0]?.message}`);
  }

  return { contextPackage: parsed.data, snapshot, warnings };
}

function stripPrefix(id: string, prefix: string): string {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}
