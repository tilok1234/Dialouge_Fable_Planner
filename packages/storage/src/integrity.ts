/**
 * Referential-integrity checker (Q-E5).
 *
 * The schema layer can't know which ids exist — only the storage layer, after
 * loading the whole project, can. This module walks a loaded ProjectData,
 * collects every known id, and reports refs that dangle.
 *
 * Each finding is `{ from, ref, field }`: the artifact that referenced it, the
 * dangling ref, and where. Reported, not silently accepted (constraint #12
 * spirit). The caller decides whether to block.
 *
 * Only refs that SHOULD resolve to a project artifact are checked. Free-form
 * targets (e.g. Opinion.target labels like "concept_industrial_mining") are
 * intentionally not checked — they're a known v1 looseness (Q-E1).
 */

import type { ProjectData } from "./tree.js";

export interface IntegrityIssue {
  from: string; // artifact id doing the referencing
  field: string; // where in that artifact
  ref: string; // the dangling id
  kind: "dangling-ref";
}

/** Collect every known id in the project (for membership checks). */
function knownIds(data: ProjectData): Set<string> {
  const s = new Set<string>();
  const add = (id: string | undefined) => {
    if (id) s.add(id);
  };
  add(data.project.id);
  for (const x of data.canonFacts) add(x.id);
  for (const x of data.factions) add(x.id);
  for (const x of data.characters) add(x.id);
  for (const x of data.states) add(x.id);
  for (const x of data.relationships) add(x.id);
  for (const x of data.quests) {
    add(x.id);
    for (const st of x.stages) add(st.id);
    for (const ch of x.choices) add(ch.id);
  }
  for (const x of data.scenes) add(x.id);
  for (const x of data.contextPackages) add(x.id);
  for (const x of data.beatPlans) add(x.id);
  for (const x of data.dialogues) add(x.id);
  for (const x of data.reviews) add(x.id);
  for (const x of data.proposals) add(x.id);
  return s;
}

/** A reserved id that passes integrity without being a real artifact. */
const RESERVED = new Set(["player"]);

/**
 * Check referential integrity. Returns the list of issues (empty = clean).
 * Conservative: only checks refs that are *clearly* meant to resolve to a
 * project artifact (character ids, quest/stage ids, canon facts, etc.).
 */
export function checkIntegrity(data: ProjectData): IntegrityIssue[] {
  const known = knownIds(data);
  const ok = (id: string) => known.has(id) || RESERVED.has(id);
  const issues: IntegrityIssue[] = [];

  // characters -> factions, connections
  for (const c of data.characters) {
    for (const f of c.identity.factions) if (!ok(f)) issues.push({ from: c.id, field: "identity.factions", ref: f, kind: "dangling-ref" });
    for (const r of c.identity.connections) if (!ok(r)) issues.push({ from: c.id, field: "identity.connections", ref: r, kind: "dangling-ref" });
    for (const r of c.knowledge.knows) if (!ok(r)) issues.push({ from: c.id, field: "knowledge.knows", ref: r, kind: "dangling-ref" });
    for (const r of c.knowledge.believesFalse) if (!ok(r)) issues.push({ from: c.id, field: "knowledge.believesFalse", ref: r, kind: "dangling-ref" });
    for (const r of c.knowledge.suspects) if (!ok(r)) issues.push({ from: c.id, field: "knowledge.suspects", ref: r, kind: "dangling-ref" });
    for (const r of c.knowledge.secrets) if (!ok(r)) issues.push({ from: c.id, field: "knowledge.secrets", ref: r, kind: "dangling-ref" });
    for (const r of c.knowledge.lies) if (!ok(r)) issues.push({ from: c.id, field: "knowledge.lies", ref: r, kind: "dangling-ref" });
    for (const r of c.knowledge.unknown) if (!ok(r)) issues.push({ from: c.id, field: "knowledge.unknown", ref: r, kind: "dangling-ref" });
  }

  // states -> characterId
  for (const s of data.states) {
    if (!ok(s.characterId)) issues.push({ from: s.id, field: "characterId", ref: s.characterId, kind: "dangling-ref" });
    for (const r of s.activeQuestStages) if (!ok(r)) issues.push({ from: s.id, field: "activeQuestStages", ref: r, kind: "dangling-ref" });
    for (const r of s.factsLearned) if (!ok(r)) issues.push({ from: s.id, field: "factsLearned", ref: r, kind: "dangling-ref" });
  }

  // relationships -> partyA, partyB
  for (const r of data.relationships) {
    if (!ok(r.partyA)) issues.push({ from: r.id, field: "partyA", ref: r.partyA, kind: "dangling-ref" });
    if (!ok(r.partyB)) issues.push({ from: r.id, field: "partyB", ref: r.partyB, kind: "dangling-ref" });
  }

  // quests -> stages, choices, characterKnowledge
  for (const q of data.quests) {
    if (q.objectiveTruth && !ok(q.objectiveTruth)) issues.push({ from: q.id, field: "objectiveTruth", ref: q.objectiveTruth, kind: "dangling-ref" });
    for (const r of q.playerInitialKnowledge) if (!ok(r)) issues.push({ from: q.id, field: "playerInitialKnowledge", ref: r, kind: "dangling-ref" });
    const stageIds = new Set(q.stages.map((s) => s.id));
    for (const st of q.stages) {
      for (const t of st.transitionsTo) {
        if (!stageIds.has(t)) issues.push({ from: st.id, field: "transitionsTo", ref: t, kind: "dangling-ref" });
      }
    }
    for (const ch of q.choices) {
      if (!stageIds.has(ch.resultingStage)) issues.push({ from: ch.id, field: "resultingStage", ref: ch.resultingStage, kind: "dangling-ref" });
    }
    for (const ck of q.characterKnowledge) {
      if (!ok(ck.characterId)) issues.push({ from: q.id, field: `characterKnowledge.${ck.characterId}`, ref: ck.characterId, kind: "dangling-ref" });
      for (const r of ck.knows) if (!ok(r)) issues.push({ from: q.id, field: "characterKnowledge.knows", ref: r, kind: "dangling-ref" });
    }
  }

  // scenes -> participants, boundQuestStages, availableChoices, fact gates
  for (const sc of data.scenes) {
    for (const p of sc.participants) {
      if (!ok(p.characterId)) issues.push({ from: sc.id, field: "participants.characterId", ref: p.characterId, kind: "dangling-ref" });
      if (!ok(p.stateId)) issues.push({ from: sc.id, field: "participants.stateId", ref: p.stateId, kind: "dangling-ref" });
      for (const r of p.relationshipIds) if (!ok(r)) issues.push({ from: sc.id, field: "participants.relationshipIds", ref: r, kind: "dangling-ref" });
    }
    for (const r of sc.boundQuestStages) if (!ok(r)) issues.push({ from: sc.id, field: "boundQuestStages", ref: r, kind: "dangling-ref" });
    for (const r of sc.requiredFacts) if (!ok(r)) issues.push({ from: sc.id, field: "requiredFacts", ref: r, kind: "dangling-ref" });
    for (const r of sc.forbiddenRevelations) if (!ok(r)) issues.push({ from: sc.id, field: "forbiddenRevelations", ref: r, kind: "dangling-ref" });
    for (const r of sc.availableChoices) if (!ok(r)) issues.push({ from: sc.id, field: "availableChoices", ref: r, kind: "dangling-ref" });
  }

  // contextPackages -> scene, questStages, participants
  for (const ctx of data.contextPackages) {
    if (!ok(ctx.sceneId)) issues.push({ from: ctx.id, field: "sceneId", ref: ctx.sceneId, kind: "dangling-ref" });
    for (const r of ctx.questStageIds) if (!ok(r)) issues.push({ from: ctx.id, field: "questStageIds", ref: r, kind: "dangling-ref" });
    for (const p of ctx.participants) {
      if (!ok(p.characterId)) issues.push({ from: ctx.id, field: "participants.characterId", ref: p.characterId, kind: "dangling-ref" });
      if (!ok(p.stateId)) issues.push({ from: ctx.id, field: "participants.stateId", ref: p.stateId, kind: "dangling-ref" });
      if (p.relationshipId && !ok(p.relationshipId)) issues.push({ from: ctx.id, field: "participants.relationshipId", ref: p.relationshipId, kind: "dangling-ref" });
    }
  }

  return issues;
}
