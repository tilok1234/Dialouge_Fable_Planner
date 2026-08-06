/**
 * Deterministic dialogue checks (M6, Stage 4 — code tier).
 *
 * Reviews a draft DialogueArtifact against its scene spec. Pure, no I/O. Uses
 * the same issue shape as the M5 quest validators. Report-don't-rewrite: the
 * repair stage (in @df/generation) is what fixes flagged lines.
 *
 * Checks (from ARCHITECTURE §6.1):
 *  - required-fact-missing: every scene.requiredFacts must appear in the draft
 *    (in some line's text, id or readable form).
 *  - forbidden-term-present: no line contains a forbiddenRevelations fact id
 *    literally (id or underscores-as-spaces form). An id-echo tripwire, not a
 *    semantic leak detector — paraphrased leaks are the AI review tier's and
 *    the human gate's job.
 *  - locked-text-changed: a line marked hard-locked must be byte-identical to
 *    its previous value (the caller passes the previous draft for comparison).
 *  - duplicate-dialogue-id: line ids unique within the artifact.
 *  - line-length-exceeded: no line exceeds the scene's max-length band.
 */

import type { DialogueArtifact, SceneSpecification } from "@df/schemas";

import { result, type ValidationIssue } from "./types.js";

/** Length cap per band (words). */
const LENGTH_CAP: Record<SceneSpecification["maxLength"], number> = {
  "single-line": 20,
  "very-short": 40,
  short: 80,
  medium: 160,
  long: 320,
};

export interface DialogueReviewInput {
  draft: DialogueArtifact;
  scene: SceneSpecification;
  /** The previously-accepted draft, for locked-text comparison. Optional. */
  previousDraft?: DialogueArtifact;
}

export function validateDialogue(input: DialogueReviewInput): ValidationIssue[] {
  const { draft, scene, previousDraft } = input;
  const issues: ValidationIssue[] = [];
  const allText = draft.lines.map((l) => l.text.value.toLowerCase()).join("\n");

  // required-fact-missing
  for (const fact of scene.requiredFacts) {
    const id = fact.toLowerCase();
    const readable = id.replace(/_/g, " ");
    if (!allText.includes(id) && !allText.includes(readable)) {
      issues.push({ from: draft.id, field: "requiredFacts", value: fact, severity: "blocker", reason: `required fact "${fact}" does not appear in any line` });
    }
  }

  // forbidden-term-present (literal id echoes only)
  for (const fact of scene.forbiddenRevelations) {
    const id = fact.toLowerCase();
    const readable = id.replace(/_/g, " ");
    for (const line of draft.lines) {
      const t = line.text.value.toLowerCase();
      if (t.includes(id) || t.includes(readable)) {
        issues.push({ from: draft.id, field: "forbiddenRevelations", value: fact, severity: "blocker", reason: `line ${line.id} references forbidden fact "${fact}"` });
      }
    }
  }

  // duplicate-dialogue-id
  const ids = draft.lines.map((l) => l.id);
  const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const id of new Set(dups)) {
    issues.push({ from: draft.id, field: "lines.id", value: id, severity: "major", reason: `duplicate line id "${id}"` });
  }

  // line-length-exceeded
  const cap = LENGTH_CAP[scene.maxLength];
  for (const line of draft.lines) {
    const words = line.text.value.trim().split(/\s+/).filter(Boolean).length;
    if (words > cap) {
      issues.push({ from: draft.id, field: "lines.text", value: line.id, severity: "minor", reason: `line ${line.id} has ${words} words; max-length band "${scene.maxLength}" caps at ${cap}` });
    }
  }

  // locked-text-changed
  if (previousDraft) {
    const prevById = new Map(previousDraft.lines.map((l) => [l.id, l]));
    for (const line of draft.lines) {
      if (line.lock?.state === "hard-locked") {
        const prev = prevById.get(line.id);
        if (prev && prev.text.value !== line.text.value) {
          issues.push({ from: draft.id, field: "lines.lock", value: line.id, severity: "blocker", reason: `hard-locked line ${line.id} was changed (locked text must survive regeneration byte-for-byte)` });
        }
      }
    }
  }

  return issues;
}

/** Convenience envelope. */
export function reviewDialogue(input: DialogueReviewInput) {
  return result(validateDialogue(input));
}
