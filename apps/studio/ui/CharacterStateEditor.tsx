// CharacterState editor. Mutable per-state: mood, location, injuries, phase,
// facts learned, promises, etc. Identity (characterId) is read-only.

import { CharacterState, type CharacterState as CharacterStateType } from "@df/schemas";
import { useMemo } from "react";

import { EditorHeader, LineListField, RefListField, Section, TextArea, TextField, ValidationIssues } from "./fields.js";

interface Props {
  state: CharacterStateType;
  integrity: { field: string; ref: string }[];
  onChange: (patch: (s: CharacterStateType) => CharacterStateType) => void;
}

export function CharacterStateEditor({ state, onChange }: Props) {
  const validation = useMemo(() => CharacterState.safeParse(state), [state]);
  const issues = validation.success ? [] : validation.error.issues.slice(0, 8);
  const s = state;

  return (
    <div className="editor-inner">
      <EditorHeader name={s.label} id={s.id} version={s.version} valid={validation.success} />
      <ValidationIssues issues={issues} />

      <Section title="State">
        <TextField label="Label" value={s.label} onChange={(v) => onChange((x) => ({ ...x, label: v }))} />
        <TextField label="Character (read-only)" value={s.characterId} onChange={() => {}} mono />
        <TextField label="Mood" value={s.mood} onChange={(v) => onChange((x) => ({ ...x, mood: v }))} />
        <TextField label="Location" value={s.location ?? ""} onChange={(v) => onChange((x) => ({ ...x, location: v }))} />
        <TextField label="Phase" value={s.phase ?? ""} onChange={(v) => onChange((x) => ({ ...x, phase: v }))} />
        <TextArea
          label="Temporary objective"
          value={s.temporaryObjective?.value ?? ""}
          onChange={(v) =>
            onChange((x) => ({
              ...x,
              temporaryObjective: { value: v, lang: x.temporaryObjective?.lang ?? "en", key: x.temporaryObjective?.key },
            }))
          }
        />
      </Section>

      <Section title="Game-time state">
        <RefListField label="Active quest stages" values={s.activeQuestStages} onChange={(v) => onChange((x) => ({ ...x, activeQuestStages: v }))} />
        <RefListField label="Facts learned" values={s.factsLearned} onChange={(v) => onChange((x) => ({ ...x, factsLearned: v }))} />
        <label>
          Player betrayed
          <input type="checkbox" checked={s.playerBetrayed} onChange={(e) => onChange((x) => ({ ...x, playerBetrayed: e.target.checked }))} />
        </label>
      </Section>

      <Section title="Recent events">
        <LineListField label="Recent events" lines={s.recentEvents} onChange={(next) => onChange((x) => ({ ...x, recentEvents: next }))} />
        <LineListField label="Unresolved conflicts" lines={s.unresolvedConflicts} onChange={(next) => onChange((x) => ({ ...x, unresolvedConflicts: next }))} />
      </Section>
    </div>
  );
}
