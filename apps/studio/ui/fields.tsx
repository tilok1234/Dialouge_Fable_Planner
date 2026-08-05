// Shared field-editor components.
//
// Extracted from CharacterEditor so every artifact editor (canon, faction,
// state, quest, scene) can compose small, consistent fields without duplicating
// markup. Each is a controlled component — value in, onChange out.

import type { ReactNode } from "react";

/** A LocalizedText line item (lang defaults to "en"). */
export type Line = { value: string; lang: string; key?: string };

/** Text input bound to a string field. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={mono ? { fontFamily: "ui-monospace, monospace" } : undefined}
        spellCheck={false}
      />
    </label>
  );
}

/** Textarea bound to a string field. */
export function TextArea({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label>
      {label}
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Select bound to an enum-style string field. */
export function EnumSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

/** Comma-separated editor for a string[] of refs (knowledge buckets, lists). */
export function RefListField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <label>
      {label}
      <input
        value={values.join(", ")}
        spellCheck={false}
        style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px" }}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
    </label>
  );
}

/** List editor for LocalizedText[] (sample lines, opinions, etc.). */
export function LineListField({
  label,
  lines,
  onChange,
}: {
  label: string;
  lines: Line[];
  onChange: (next: Line[]) => void;
}) {
  return (
    <div className="line-list">
      <div className="line-list-head">
        <span>{label}</span>
        <button type="button" onClick={() => onChange([...lines, { value: "", lang: "en" }])}>
          + add
        </button>
      </div>
      <ul>
        {lines.map((line, i) => (
          <li key={i}>
            <input
              value={line.value}
              onChange={(e) =>
                onChange(lines.map((l, idx) => (idx === i ? { ...l, value: e.target.value } : l)))
              }
            />
            <button
              type="button"
              className="rm"
              onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A bordered section with a legend, for grouping fields. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

/** The standard editor header: name, id, version, validity badge. */
export function EditorHeader({
  name,
  id,
  version,
  valid,
}: {
  name: string;
  id: string;
  version: number;
  valid: boolean;
}) {
  return (
    <header className="ed-head">
      <h2>{name}</h2>
      <code className="muted">{id}</code>
      <span className="muted">v{version}</span>
      {!valid && <span className="badge bad">invalid — Save blocked</span>}
      {valid && <span className="badge ok">valid</span>}
    </header>
  );
}

/** Inline validation issue list. */
export function ValidationIssues({ issues }: { issues: { path: (string | number)[]; message: string }[] }) {
  if (issues.length === 0) return null;
  return (
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
  );
}
