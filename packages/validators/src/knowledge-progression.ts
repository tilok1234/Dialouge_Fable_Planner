/**
 * Knowledge-progression validator (M5).
 *
 * Cross-checks scene bindings against the quest's per-stage reveal schedule.
 * A scene bound to stage N may only require/hint facts that the player has been
 * told by stage N (the union of factsRevealedToPlayer for stages 0..N). If a
 * scene requires a fact that isn't revealed until later, that's an early-
 * revelation leak — the dialogue would have to reference knowledge the player
 * doesn't have, or worse, reveal a secret ahead of schedule.
 *
 * Pure, no I/O. Works against the Quest's `factsRevealedToPlayer` per stage,
 * which the author controls (the design doc's "information gating").
 */

import type { Quest, SceneSpecification } from "@df/schemas";

import { result, type ValidationIssue } from "./types.js";

/**
 * For each scene, check that its required/hintable facts are available by the
 * latest stage it's bound to. A scene bound to multiple stages uses the EARLIEST
 * (the earliest point the dialogue could fire).
 */
export function validateKnowledgeProgression(
  quest: Quest,
  scenes: SceneSpecification[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build a cumulative reveal map: stage order -> set of facts known by then.
  const stagesByOrder = [...quest.stages].sort((a, b) => a.order - b.order);
  const cumulative = new Map<number, Set<string>>();
  const known = new Set<string>();
  for (const stage of stagesByOrder) {
    for (const f of stage.factsRevealedToPlayer) known.add(f);
    cumulative.set(stage.order, new Set(known));
  }

  // Also include playerInitialKnowledge as always-known.
  const alwaysKnown = new Set(quest.playerInitialKnowledge);

  for (const scene of scenes) {
    if (scene.boundQuestStages.length === 0) continue;
    // The earliest bound stage determines the knowledge cutoff.
    const boundOrders = scene.boundQuestStages
      .map((id) => quest.stages.find((s) => s.id === id)?.order)
      .filter((o): o is number => o !== undefined);
    if (boundOrders.length === 0) continue;
    const earliest = Math.min(...boundOrders);

    // Facts available at the earliest bound stage.
    const available = new Set([...alwaysKnown, ...(cumulative.get(earliest) ?? new Set<string>())]);

    for (const fact of [...scene.requiredFacts, ...scene.hintableFacts]) {
      if (!available.has(fact)) {
        // When is it actually revealed?
        const revealedAt = stagesByOrder.find((s) => s.factsRevealedToPlayer.includes(fact))?.order;
        issues.push({
          from: scene.id,
          field: "requiredFacts/hintableFacts",
          value: fact,
          severity: "major",
          reason: `scene bound to stage order ${earliest} references "${fact}", which is not revealed to the player until stage ${revealedAt ?? "??"}`,
        });
      }
    }
  }

  return issues;
}

/** Convenience envelope. */
export function validateKnowledge(quest: Quest, scenes: SceneSpecification[]) {
  return result(validateKnowledgeProgression(quest, scenes));
}
