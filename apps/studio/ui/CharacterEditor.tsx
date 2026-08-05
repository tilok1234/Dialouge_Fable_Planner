// Character profile editor (right panel).
//
// Edits the full CharacterProfile: identity, core, opinions, knowledge (six
// buckets), voice (samples + anti-samples + metaphor domain). On every change,
// the whole character is re-validated via CharacterProfile.safeParse and
// problems are surfaced inline. The Save button (in App) is only meaningful
// when validation passes; this editor reports whether the current shape parses.

import { CharacterProfile, type CharacterProfile as CharacterProfileType } from "@df/schemas";
import { useMemo } from "react";

import type { IntegrityIssue } from "./api.js";

interface Props {
  character: CharacterProfileType;
  integrity: IntegrityIssue[];
  knownFactionIds: string[];
  onChange: (patch: (c: CharacterProfileType) => CharacterProfileType) => void;
}

export function CharacterEditor({ character, integrity, knownFactionIds, onChange }: Props) {
  // Re-validate the whole character on every render; show the first few issues.
  const validation = useMemo(() => CharacterProfile.safeParse(character), [character]);
  const issues = validation.success ? [] : validation.error.issues.slice(0, 8);

  // Helpers to update nested fields immutably.
  const setIdentity = (k: keyof CharacterProfileType["identity"], v: unknown) =>
    onChange((c) => ({ ...c, identity: { ...c.identity, [k]: v } }));
  const setCore = (k: keyof CharacterProfileType["core"], v: string) =>
    onChange((c) => ({ ...c, core: { ...c.core, [k]: { value: v } } }));
  const setVoice = (patch: Partial<CharacterProfileType["voice"]>) =>
    onChange((c) => ({ ...c, voice: { ...c.voice, ...patch } }));

  const c = character;

  return (
    <div className="editor-inner">
      <header className="ed-head">
        <h2>{c.identity.name}</h2>
        <code className="muted">{c.id}</code>
        <span className="muted">v{c.version}</span>
        {!validation.success && <span className="badge bad">invalid — Save blocked</span>}
        {validation.success && <span className="badge ok">valid</span>}
      </header>

      {integrity.length > 0 && (
        <div className="integrity-inline">
          <strong>Integrity issues on this character:</strong>
          <ul>
            {integrity.map((i, idx) => (
              <li key={idx}>
                <code>{i.field}</code> → <code>{i.ref}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {issues.length > 0 && (
        <div className="validation">
          <strong>Schema problems:</strong>
          <ul>
            {issues.map((i, idx) => (
              <li key={idx}>
                <code>{i.path.join(".")}</code>: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Identity */}
      <fieldset>
        <legend>Identity & role</legend>
        <label>
          Name
          <input value={c.identity.name} onChange={(e) => setIdentity("name", e.target.value)} />
        </label>
        <label>
          Gameplay role
          <select value={c.identity.gameplayRole} onChange={(e) => setIdentity("gameplayRole", e.target.value)}>
            {["boss", "elite", "quest-giver", "merchant", "companion", "ambient-npc", "narrator", "other"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Narrative function
          <select value={c.identity.narrativeFunction} onChange={(e) => setIdentity("narrativeFunction", e.target.value)}>
            {["introduce-region", "represent-faction-worldview", "mislead-player", "deliver-emotional-relief", "recurring-rival", "test-moral-compromise", "quest-giver", "merchant", "lore-keeper", "boss", "companion", "ambient", "other"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Faction(s)
          <select
            multiple
            value={c.identity.factions}
            onChange={(e) => setIdentity("factions", Array.from(e.target.selectedOptions).map((o) => o.value))}
          >
            {knownFactionIds.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </fieldset>

      {/* Core */}
      <fieldset>
        <legend>Character core</legend>
        {(Object.keys(c.core) as (keyof typeof c.core)[]).map((k) => (
          <label key={k}>
            {k}
            <textarea
              rows={2}
              value={c.core[k]?.value ?? ""}
              onChange={(e) => setCore(k, e.target.value)}
            />
          </label>
        ))}
      </fieldset>

      {/* Knowledge (six buckets) */}
      <fieldset>
        <legend>Knowledge model (refs per bucket)</legend>
        <div className="buckets">
          {(["knows", "believesFalse", "suspects", "secrets", "lies", "unknown"] as const).map((bucket) => (
            <BucketEditor
              key={bucket}
              label={bucket}
              values={c.knowledge[bucket]}
              onChange={(next) => onChange((cc) => ({ ...cc, knowledge: { ...cc.knowledge, [bucket]: next } }))}
            />
          ))}
        </div>
      </fieldset>

      {/* Voice: samples + anti-samples + metaphor */}
      <fieldset>
        <legend>Voice</legend>
        <LineListEditor
          label="Sample lines (must have ≥1)"
          lines={c.voice.sampleLines}
          onChange={(next) => setVoice({ sampleLines: next })}
        />
        <LineListEditor
          label="Anti-sample lines"
          lines={c.voice.antiSampleLines}
          onChange={(next) => setVoice({ antiSampleLines: next })}
        />
        <label>
          Metaphor domain source
          <input
            value={c.voice.metaphorDomain?.source ?? ""}
            placeholder="e.g. stone, weight, erosion"
            onChange={(e) =>
              setVoice({
                metaphorDomain: e.target.value
                  ? { source: e.target.value, examples: c.voice.metaphorDomain?.examples ?? [] }
                  : undefined,
              })
            }
          />
        </label>
      </fieldset>
    </div>
  );
}

/** Comma-separated ref editor for a single knowledge bucket. */
function BucketEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (next: string[]) => void }) {
  return (
    <label className="bucket">
      {label}
      <input
        value={values.join(", ")}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
    </label>
  );
}

/** A LocalizedText line item, with lang defaulting to "en". */
type Line = { value: string; lang: string; key?: string };

/** List editor for LocalizedText[] (sample/anti-sample lines). */
function LineListEditor({ label, lines, onChange }: { label: string; lines: Line[]; onChange: (next: Line[]) => void }) {
  return (
    <div className="line-list">
      <div className="line-list-head">
        <span>{label}</span>
        <button type="button" onClick={() => onChange([...lines, { value: "", lang: "en" }])}>+ add</button>
      </div>
      <ul>
        {lines.map((line, i) => (
          <li key={i}>
            <input
              value={line.value}
              onChange={(e) => onChange(lines.map((l, idx) => (idx === i ? { ...l, value: e.target.value } : l)))}
            />
            <button type="button" className="rm" onClick={() => onChange(lines.filter((_, idx) => idx !== i))}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
