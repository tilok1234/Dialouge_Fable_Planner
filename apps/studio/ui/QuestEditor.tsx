// Quest editor. Quests carry the state machine: stages (id/order/conditions/
// transitions) and choices. This editor edits the quest-level fields plus the
// stages list; full stage-condition editing is a follow-up (the schema keeps
// conditions as natural language for v1 per Q-E1).

import { Quest, type Quest as QuestType } from "@df/schemas";
import { useMemo, useState } from "react";

import { EditorHeader, RefListField, Section, TextArea, TextField, ValidationIssues } from "./fields.js";

interface Props {
  quest: QuestType;
  integrity: { field: string; ref: string }[];
  onChange: (patch: (q: QuestType) => QuestType) => void;
}

export function QuestEditor({ quest, onChange }: Props) {
  const validation = useMemo(() => Quest.safeParse(quest), [quest]);
  const issues = validation.success ? [] : validation.error.issues.slice(0, 8);
  const q = quest;
  const [questReport, setQuestReport] = useState<{ issues: { from: string; field: string; reason: string; severity: string }[]; branches: { path: string[]; terminal: string; resolves: boolean }[] } | null>(null);
  const [validating, setValidating] = useState(false);

  function patchStage(idx: number, patch: Partial<QuestType["stages"][number]>) {
    onChange((x) => ({ ...x, stages: x.stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));
  }

  async function validateQuestFull() {
    setValidating(true);
    try {
      const res = await fetch("/api/validate-quest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quest: q }),
      });
      setQuestReport(await res.json());
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="editor-inner">
      <EditorHeader name={q.name} id={q.id} version={q.version} valid={validation.success} />
      <ValidationIssues issues={issues} />

      <Section title="Premise">
        <TextField label="Name" value={q.name} onChange={(v) => onChange((x) => ({ ...x, name: v }))} />
        <TextArea label="Premise" value={q.premise.value} onChange={(v) => onChange((x) => ({ ...x, premise: { ...x.premise, value: v } }))} />
        <TextField label="Objective truth (canon ref)" value={q.objectiveTruth ?? ""} mono onChange={(v) => onChange((x) => ({ ...x, objectiveTruth: v || undefined }))} />
      </Section>

      <Section title="Knowledge gating">
        <RefListField label="Player initial knowledge" values={q.playerInitialKnowledge} onChange={(v) => onChange((x) => ({ ...x, playerInitialKnowledge: v }))} />
        <RefListField label="Participating characters" values={q.participatingCharacters} onChange={(v) => onChange((x) => ({ ...x, participatingCharacters: v }))} />
      </Section>

      <Section title={`Stages (${q.stages.length})`}>
        <div className="stages">
          {q.stages.map((st, i) => (
            <div className="stage" key={st.id}>
              <div className="stage-head">
                <strong>{st.label}</strong>
                <code className="muted">{st.id}</code>
                <span className="muted">order {st.order}</span>
              </div>
              <TextField label="Entry condition (NL)" value={st.entryCondition ?? ""} onChange={(v) => patchStage(i, { entryCondition: v })} />
              <TextField label="Completion condition (NL)" value={st.completionCondition ?? ""} onChange={(v) => patchStage(i, { completionCondition: v })} />
              <RefListField label="Transitions to" values={st.transitionsTo} onChange={(v) => patchStage(i, { transitionsTo: v })} />
              <RefListField label="Facts revealed to player" values={st.factsRevealedToPlayer} onChange={(v) => patchStage(i, { factsRevealedToPlayer: v })} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Validate quest (structure + knowledge + playthrough)">
        <button onClick={() => void validateQuestFull()} disabled={validating}>
          {validating ? "Validating…" : "Validate quest"}
        </button>
        {questReport && (
          <div className="quest-report">
            {questReport.issues.length === 0 ? (
              <p className="badge ok">Clean — no structural, knowledge, or playthrough issues.</p>
            ) : (
              <ul className="validation">
                {questReport.issues.map((i, idx) => (
                  <li key={idx}>
                    <span className={`sev ${i.severity}`}>{i.severity}</span>{" "}
                    <code>{i.from}.{i.field}</code>: {i.reason}
                  </li>
                ))}
              </ul>
            )}
            {questReport.branches.length > 0 && (
              <p className="muted">Simulated {questReport.branches.length} branch(es).</p>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
