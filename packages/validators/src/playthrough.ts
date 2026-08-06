/**
 * Playthrough simulator (M5).
 *
 * Walks every branch of a quest from stage 0, following transitions and choices,
 * collecting the revelation trace per branch. Reports:
 *  - contradictions: a fact revealed at one stage that's then "unrevealed" by a
 *    later stage removing it from the player's knowledge (a state machine that
 *    goes backwards on knowledge — the schema doesn't model removal, so this is
 *    currently a forward-only check; reserved for future state-variable work).
 *  - dead-ends: a path that reaches a non-terminal stage with no way forward.
 *  - branch coverage: confirms every choice produces a distinct reachable path.
 *
 * The simulator is a graph walk, not a real game runtime. It's pure, no I/O.
 */

import type { Quest } from "@df/schemas";

import { result, type ValidationIssue } from "./types.js";

export interface BranchTrace {
  /** The stages visited, in order. */
  path: string[];
  /** Facts revealed to the player along this branch. */
  revealedFacts: string[];
  /** Terminal stage id (the last reachable stage on this branch). */
  terminal: string;
  /** Whether the terminal stage has a completion or failure condition. */
  resolves: boolean;
}

export interface PlaythroughResult {
  branches: BranchTrace[];
  issues: ValidationIssue[];
}

/**
 * Simulate every branch. Returns one BranchTrace per terminal path plus any
 * dead-end/contradiction issues found.
 */
export function simulatePlaythrough(quest: Quest): PlaythroughResult {
  const stagesByOrder = new Map(quest.stages.map((s) => [s.order, s]));
  const startOrder = Math.min(...quest.stages.map((s) => s.order));
  const start = stagesByOrder.get(startOrder);
  const issues: ValidationIssue[] = [];
  const branches: BranchTrace[] = [];

  if (!start) {
    issues.push({ from: quest.id, field: "stages", severity: "blocker", reason: "quest has no stages to simulate" });
    return { branches, issues };
  }

  // DFS over the stage graph. A "branch point" is a stage with >1 outgoing edge
  // (transition or choice). Each leaf becomes a BranchTrace.
  function walk(stageId: string, path: string[], revealed: Set<string>) {
    // Cycle guard: if this stage is already in the current path, we've looped.
    if (path.includes(stageId)) {
      branches.push({ path: [...path, stageId], revealedFacts: [...revealed], terminal: stageId, resolves: false });
      return;
    }
    const stage = quest.stages.find((s) => s.id === stageId);
    if (!stage) {
      issues.push({ from: stageId, field: "simulation", severity: "blocker", reason: "walk reached a nonexistent stage" });
      return;
    }
    const localRevealed = new Set([...revealed, ...stage.factsRevealedToPlayer]);
    const newPath = [...path, stageId];

    // Outgoing edges: transitions + choices whose source is ambiguous (the
    // schema attaches choices at quest level, not per-stage; for simulation we
    // let a choice fire from any stage that precedes its target by order).
    const outgoing = [...stage.transitionsTo];
    for (const c of quest.choices) {
      const targetOrder = quest.stages.find((s) => s.id === c.resultingStage)?.order ?? Infinity;
      if (targetOrder > stage.order && !outgoing.includes(c.resultingStage)) {
        outgoing.push(c.resultingStage);
      }
    }

    const resolves = !!(stage.completionCondition || stage.failureCondition);
    if (outgoing.length === 0) {
      // Terminal.
      branches.push({ path: newPath, revealedFacts: [...localRevealed], terminal: stageId, resolves });
      if (!resolves) {
        issues.push({ from: stageId, field: "terminal", severity: "major", reason: "branch ends at a stage with no completion/failure condition (the player is stuck)" });
      }
      return;
    }
    for (const next of outgoing) walk(next, newPath, localRevealed);
  }

  walk(start.id, [], new Set());

  // Branch coverage: every choice's target should appear in at least one branch.
  for (const c of quest.choices) {
    const reached = branches.some((b) => b.path.includes(c.resultingStage));
    if (!reached) {
      issues.push({ from: c.id, field: "resultingStage", value: c.resultingStage, severity: "major", reason: `choice target "${c.resultingStage}" is never reached in any simulated branch` });
    }
  }

  return { branches, issues };
}

/** Convenience: simulate + structural validate, returning a combined envelope. */
export function validatePlaythrough(quest: Quest) {
  const sim = simulatePlaythrough(quest);
  return result(sim.issues);
}
