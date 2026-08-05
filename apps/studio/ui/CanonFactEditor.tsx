// CanonFact editor. Canon facts are edited as an array (world-facts.json),
// so this editor manages the whole list: add/remove/edit individual facts.

import { CanonFact, type CanonFact as CanonFactType } from "@df/schemas";
import { useMemo, useState } from "react";

import {
  EditorHeader,
  EnumSelect,
  RefListField,
  Section,
  TextArea,
  TextField,
  ValidationIssues,
} from "./fields.js";

interface Props {
  facts: CanonFactType[];
  integrityRefs: Set<string>;
  onChange: (next: CanonFactType[]) => void;
}

const VERACITY = ["objective-truth", "established-fact", "world-rule"] as const;
const VISIBILITY = ["public", "known-to-faction", "known-to-few", "secret"] as const;

export function CanonFactEditor({ facts, onChange }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const fact = facts[selectedIdx];

  const validation = useMemo(
    () => (fact ? CanonFact.safeParse(fact) : { success: true as const, data: fact }),
    [fact],
  );
  const issues = validation.success ? [] : validation.error.issues.slice(0, 8);

  function patch(next: Partial<CanonFactType>) {
    if (!fact) return;
    const updated = facts.map((f, i) => (i === selectedIdx ? { ...f, ...next } : f));
    onChange(updated);
  }

  if (!fact) {
    return (
      <div className="editor-inner">
        <p className="hint">No canon fact selected.</p>
        <button onClick={() => onChange([...facts, newFact()])}>+ add fact</button>
      </div>
    );
  }

  return (
    <div className="editor-inner">
      <div className="tabs">
        <select value={selectedIdx} onChange={(e) => setSelectedIdx(Number(e.target.value))}>
          {facts.map((f, i) => (
            <option key={i} value={i}>
              {f.label}
            </option>
          ))}
        </select>
        <button onClick={() => onChange([...facts, newFact()])}>+ add</button>
        <button className="rm" onClick={() => onChange(facts.filter((_, i) => i !== selectedIdx))}>
          remove current
        </button>
      </div>

      <EditorHeader name={fact.label} id={fact.id} version={fact.version} valid={validation.success} />
      <ValidationIssues issues={issues} />

      <Section title="Statement">
        <TextField label="Label" value={fact.label} onChange={(v) => patch({ label: v })} />
        <TextArea label="Statement" value={fact.statement.value} onChange={(v) => patch({ statement: { ...fact.statement, value: v } })} />
        <EnumSelect label="Veracity" value={fact.veracity} options={VERACITY} onChange={(v) => patch({ veracity: v as CanonFactType["veracity"] })} />
        <EnumSelect label="Visibility" value={fact.visibility} options={VISIBILITY} onChange={(v) => patch({ visibility: v as CanonFactType["visibility"] })} />
        <TextField label="In-world date" value={fact.inWorldDate ?? ""} onChange={(v) => patch({ inWorldDate: v })} />
      </Section>

      <Section title="References & tags">
        <RefListField label="References (canon refs)" values={fact.references} onChange={(v) => patch({ references: v })} />
        <RefListField label="Tags" values={fact.tags} onChange={(v) => patch({ tags: v })} />
      </Section>
    </div>
  );
}

let factCounter = 0;
function newFact(): CanonFactType {
  factCounter += 1;
  return {
    id: `fact_new_${Date.now().toString(36)}_${factCounter}`,
    label: "New canon fact",
    statement: { value: "", lang: "en" },
    veracity: "established-fact",
    visibility: "known-to-few",
    references: [],
    tags: [],
    version: 1,
    contentHash: "sha256:uncommitted",
  };
}
