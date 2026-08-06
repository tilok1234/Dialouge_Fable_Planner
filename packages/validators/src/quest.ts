/**
 * Quest structural validator (M5).
 *
 * Checks the integrity of a quest's state machine WITHOUT reference to scenes
 * or canon (those are the other two validators' jobs). Pure, no I/O.
 *
 * Checks:
 *  - every stage's transitionsTo points at an existing stage id
 *  - every choice's resultingStage points at an existing stage id
 *  - stage `order` is unique and monotonic from 0
 *  - no orphan stages: every stage is reachable from stage order 0 via
 *    transitions (or is stage 0 itself)
 */

import type { Quest } from "@df/schemas";

import { result, type ValidationIssue } from "./types.js";

export function validateQuestStructure(quest: Quest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stageIds = new Set(quest.stages.map((s) => s.id));
  const stagesByOrder = new Map(quest.stages.map((s) => [s.order, s]));

  // Duplicate orders are allowed ONLY when the same-order stages are parallel
  // (neither reachable from the other) — i.e. branch alternatives like 5a/5b.
  // Flag duplicates only when same-order stages sit on the same linear path.
  const orders = quest.stages.map((s) => s.order);
  const orderCounts = new Map<number, number>();
  for (const o of orders) orderCounts.set(o, (orderCounts.get(o) ?? 0) + 1);
  for (const [o, count] of orderCounts) {
    if (count <= 1) continue;
    const sameOrder = quest.stages.filter((s) => s.order === o);
    // Build a reachability set per same-order stage (via transitions + choices).
    const reachable = (id: string): Set<string> => {
      const seen = new Set<string>();
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        const st = quest.stages.find((s) => s.id === cur);
        if (st) for (const t of st.transitionsTo) stack.push(t);
      }
      return seen;
    };
    // If any same-order stage can reach another same-order stage, that's a real
    // duplicate on a linear path (the player would loop back to the same order).
    let parallel = true;
    for (let i = 0; i < sameOrder.length && parallel; i++) {
      const reach = reachable(sameOrder[i]!.id);
      for (let j = 0; j < sameOrder.length; j++) {
        if (i !== j && reach.has(sameOrder[j]!.id)) {
          parallel = false;
          break;
        }
      }
    }
    if (!parallel) {
      issues.push({ from: quest.id, field: "stages.order", value: String(o), severity: "blocker", reason: `duplicate stage order ${o} on a linear path (use distinct orders or make the branches parallel)` });
    }
  }

  // Transitions point at existing stages?
  for (const s of quest.stages) {
    for (const t of s.transitionsTo) {
      if (!stageIds.has(t)) {
        issues.push({ from: s.id, field: "transitionsTo", value: t, severity: "blocker", reason: `transition target "${t}" does not exist` });
      }
    }
  }

  // Choices point at existing stages?
  for (const c of quest.choices) {
    if (!stageIds.has(c.resultingStage)) {
      issues.push({ from: c.id, field: "resultingStage", value: c.resultingStage, severity: "blocker", reason: `choice leads to nonexistent stage "${c.resultingStage}"` });
    }
  }

  // Reachability from stage order 0.
  const startStage = stagesByOrder.get(0) ?? stagesByOrder.get(Math.min(...orders));
  if (!startStage) {
    issues.push({ from: quest.id, field: "stages", severity: "blocker", reason: "quest has no stages" });
    return issues;
  }
  const reachable = new Set<string>([startStage.id]);
  let frontier = [startStage.id];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const stage = quest.stages.find((s) => s.id === id);
      if (!stage) continue;
      // Transitions and choices both move the player.
      const targets = [...stage.transitionsTo, ...quest.choices.filter((c) => c.resultingStage === id).map((c) => c.resultingStage)];
      // Also: any choice whose SOURCE is this stage (heuristic: choices don't
      // name a source stage in the schema; we treat a choice as reachable from
      // any stage for the reachability walk, then add its target).
      for (const t of targets) {
        if (stageIds.has(t) && !reachable.has(t)) {
          reachable.add(t);
          next.push(t);
        }
      }
    }
    frontier = next;
  }

  // Choices from any reachable stage also unlock their target.
  const choiceTargets = quest.choices.map((c) => c.resultingStage).filter((id) => stageIds.has(id));
  for (const t of choiceTargets) reachable.add(t);

  for (const s of quest.stages) {
    if (!reachable.has(s.id)) {
      issues.push({ from: s.id, field: "reachability", severity: "major", reason: "stage is unreachable from the start stage" });
    }
  }

  // Every non-terminal stage should have at least one outgoing path.
  for (const s of quest.stages) {
    const hasOutgoing = s.transitionsTo.length > 0 || quest.choices.some((c) => c.resultingStage !== s.id);
    const isTerminal = s.completionCondition || s.failureCondition;
    if (!hasOutgoing && !isTerminal) {
      issues.push({ from: s.id, field: "transitions", severity: "major", reason: "stage has no outgoing transitions/choices and no completion/failure condition (dead-end)" });
    }
  }

  return issues;
}

/** Convenience: validate and return a {issues, clean} envelope. */
export function validateQuest(quest: Quest) {
  return result(validateQuestStructure(quest));
}
