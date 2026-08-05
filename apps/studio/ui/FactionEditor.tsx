// Faction editor. Single faction at a time; uses the shared field components.

import { FactionProfile, type FactionProfile as FactionProfileType } from "@df/schemas";
import { useMemo } from "react";

import { EditorHeader, LineListField, RefListField, Section, TextArea, TextField, ValidationIssues } from "./fields.js";

interface Props {
  faction: FactionProfileType;
  integrity: { field: string; ref: string }[];
  onChange: (patch: (f: FactionProfileType) => FactionProfileType) => void;
}

export function FactionEditor({ faction, onChange }: Props) {
  const validation = useMemo(() => FactionProfile.safeParse(faction), [faction]);
  const issues = validation.success ? [] : validation.error.issues.slice(0, 8);
  const f = faction;

  return (
    <div className="editor-inner">
      <EditorHeader name={f.name} id={f.id} version={f.version} valid={validation.success} />
      <ValidationIssues issues={issues} />

      <Section title="Identity">
        <TextField label="Name" value={f.name} onChange={(v) => onChange((x) => ({ ...x, name: v }))} />
        <TextArea label="Summary" value={f.summary.value} onChange={(v) => onChange((x) => ({ ...x, summary: { ...x.summary, value: v } }))} />
      </Section>

      <Section title="Beliefs & opinions">
        <RefListField label="Shared beliefs (canon refs)" values={f.sharedBeliefs} onChange={(v) => onChange((x) => ({ ...x, sharedBeliefs: v }))} />
      </Section>

      <Section title="Voice defaults">
        <TextField
          label="Metaphor domain source"
          value={f.metaphorDomain?.source ?? ""}
          placeholder="e.g. stone, weight, erosion"
          onChange={(v) =>
            onChange((x) => ({
              ...x,
              metaphorDomain: v ? { source: v, examples: x.metaphorDomain?.examples ?? [] } : undefined,
            }))
          }
        />
        <LineListField
          label="Customs"
          lines={f.customs}
          onChange={(next) => onChange((x) => ({ ...x, customs: next }))}
        />
        <LineListField
          label="Taboos"
          lines={f.taboos}
          onChange={(next) => onChange((x) => ({ ...x, taboos: next }))}
        />
      </Section>

      <Section title="Tags">
        <RefListField label="Tags" values={f.tags} onChange={(v) => onChange((x) => ({ ...x, tags: v }))} />
      </Section>
    </div>
  );
}
