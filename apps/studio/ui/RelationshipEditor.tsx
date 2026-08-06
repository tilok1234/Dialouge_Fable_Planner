// Relationship editor. Multi-dimensional state between two parties — NOT a
// friendship score. The raw numbers steer which named state applies; only the
// named state ever reaches prompts (Q-E2), so name it well.

import { RelationshipState, type RelationshipState as RelType } from "@df/schemas";
import { useMemo } from "react";

import { EditorHeader, EnumSelect, Section, TextArea, TextField, ValidationIssues } from "./fields.js";

const DIMENSIONS = ["trust", "respect", "affection", "fear", "suspicion", "debt"] as const;

interface Props {
  rel: RelType;
  characterIds: string[];
  integrity: { field: string; ref: string }[];
  onChange: (patch: (r: RelType) => RelType) => void;
}

export function RelationshipEditor({ rel, characterIds, onChange }: Props) {
  const validation = useMemo(() => RelationshipState.safeParse(rel), [rel]);
  const issues = validation.success ? [] : validation.error.issues.slice(0, 8);
  const partyOptions = (current: string) => {
    const opts = [...characterIds, "player"];
    if (!opts.includes(current)) opts.push(current);
    return opts;
  };

  return (
    <div className="editor-inner">
      <EditorHeader name={`${rel.partyA} ↔ ${rel.partyB}`} id={rel.id} version={rel.version} valid={validation.success} />
      <ValidationIssues issues={issues} />

      <Section title="Parties">
        <EnumSelect label="Party A" value={rel.partyA} options={partyOptions(rel.partyA)} onChange={(v) => onChange((r) => ({ ...r, partyA: v }))} />
        <EnumSelect label="Party B" value={rel.partyB} options={partyOptions(rel.partyB)} onChange={(v) => onChange((r) => ({ ...r, partyB: v }))} />
      </Section>

      <Section title="Named state (what the writer sees)">
        <TextField
          label="Named state"
          value={rel.namedState ?? ""}
          onChange={(v) => onChange((r) => ({ ...r, namedState: v || undefined }))}
        />
        <p className="muted">e.g. "wary-respect", "hostile-but-indebted". This phrase — never the numbers — reaches the prompt.</p>
      </Section>

      <Section title="Dimensions (−100 … 100, steer the named state)">
        {DIMENSIONS.map((d) => (
          <label key={d} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 80 }}>{d}</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={rel.dimensions[d]}
              onChange={(e) => onChange((r) => ({ ...r, dimensions: { ...r.dimensions, [d]: Number(e.target.value) } }))}
              style={{ flex: 1, maxWidth: 260 }}
            />
            <input
              type="number"
              min={-100}
              max={100}
              value={rel.dimensions[d]}
              onChange={(e) => onChange((r) => ({ ...r, dimensions: { ...r.dimensions, [d]: Math.max(-100, Math.min(100, Number(e.target.value) || 0)) } }))}
              style={{ width: 64 }}
            />
          </label>
        ))}
      </Section>

      <Section title="History">
        {rel.history.length === 0 ? (
          <p className="muted">No history entries yet. Entries record events that shifted the dimensions.</p>
        ) : (
          <ul>
            {rel.history.map((h, i) => (
              <li key={i}>
                {h.event.value}
                <button className="rm" style={{ marginLeft: 8 }} onClick={() => onChange((r) => ({ ...r, history: r.history.filter((_, j) => j !== i) }))}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={() =>
            onChange((r) => ({ ...r, history: [...r.history, { event: { value: "Describe what happened.", lang: "en" } }] }))
          }
        >
          ＋ add history entry
        </button>
      </Section>

      <Section title="Notes">
        <TextArea label="Notes" value={rel.notes ?? ""} onChange={(v) => onChange((r) => ({ ...r, notes: v || undefined }))} />
      </Section>
    </div>
  );
}
