// Quest editor. Quests carry the state machine: stages (id/order/conditions/
// transitions) and choices. This editor edits the quest-level fields plus the
// stages list; full stage-condition editing is a follow-up (the schema keeps
// conditions as natural language for v1 per Q-E1).

import { Quest, type Quest as QuestType } from "@df/schemas";
import { useMemo } from "react";

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

  function patchStage(idx: number, patch: Partial<QuestType["stages"][number]>) {
    onChange((x) => ({ ...x, stages: x.stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));
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
    </div>
  );
}
