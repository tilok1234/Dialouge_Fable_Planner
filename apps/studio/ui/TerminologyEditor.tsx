// Terminology editor — the project's in-world vocabulary, edited as a list
// (canon/terminology.json). Since M11 these terms reach the writer's context:
// faction-scoped terms go to scenes with that faction present, factionless
// terms go everywhere. This is how the golem says "vein-seal", not "magic door".

import { Terminology, type Terminology as TermType } from "@df/schemas";

import { RefListField, Section, TextArea, TextField } from "./fields.js";

interface Props {
  terms: TermType[];
  onChange: (next: TermType[]) => void;
}

export function TerminologyEditor({ terms, onChange }: Props) {
  const patch = (i: number, fn: (t: TermType) => TermType) => onChange(terms.map((t, j) => (j === i ? fn(t) : t)));

  return (
    <div className="editor-inner">
      <h2>Terminology ({terms.length})</h2>
      <p className="muted">
        In-world words and idioms. Faction-scoped terms reach scenes where that faction is present; terms with no
        faction are global.
      </p>
      {terms.map((t, i) => {
        const valid = Terminology.safeParse(t).success;
        return (
          <Section key={i} title={`${t.term || "(unnamed term)"}${valid ? "" : " ⚠"}`}>
            <TextField label="Term" value={t.term} onChange={(v) => patch(i, (x) => ({ ...x, term: v }))} />
            <TextArea label="Meaning" value={t.meaning.value} onChange={(v) => patch(i, (x) => ({ ...x, meaning: { ...x.meaning, value: v } }))} />
            <RefListField label="Factions (empty = global)" values={t.factions} onChange={(v) => patch(i, (x) => ({ ...x, factions: v }))} />
            <button className="rm" onClick={() => onChange(terms.filter((_, j) => j !== i))}>
              remove term
            </button>
          </Section>
        );
      })}
      <button
        onClick={() =>
          onChange([
            ...terms,
            { version: 1, contentHash: "sha256:uncommitted", term: "", meaning: { value: "What it means, in-world.", lang: "en" }, factions: [], tags: [] },
          ])
        }
      >
        ＋ add term
      </button>
    </div>
  );
}
