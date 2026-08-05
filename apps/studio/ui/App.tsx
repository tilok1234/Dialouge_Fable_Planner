// Studio App shell.
//
// Owns the loaded project state, the load/save lifecycle, and selection.
// The browser (left) lists artifacts by type; the editor (right) edits the
// selected artifact of any type. Edits live in memory until Save (no autosave;
// NON_GOALS §3.1 — Git is history).

import type { ProjectData } from "@df/storage";
import { useEffect, useState } from "react";

import { api, type IntegrityIssue } from "./api.js";
import { Browser } from "./Browser.js";
import { CanonFactEditor } from "./CanonFactEditor.js";
import { CharacterEditor } from "./CharacterEditor.js";
import { CharacterStateEditor } from "./CharacterStateEditor.js";
import { FactionEditor } from "./FactionEditor.js";
import { QuestEditor } from "./QuestEditor.js";
import { SceneEditor } from "./SceneEditor.js";

const DEFAULT_DIR = "../../samples/quarry-project"; // relative to repo root from dev's POV

/** Which artifact is selected for editing. */
type Selection =
  | { kind: "character"; id: string }
  | { kind: "faction"; id: string }
  | { kind: "state"; id: string }
  | { kind: "quest"; id: string }
  | { kind: "scene"; id: string }
  | { kind: "canon"; id: "__list__" }; // canon facts are edited as a list

type Kind = Selection["kind"];

export function App() {
  const [dir, setDir] = useState(DEFAULT_DIR);
  const [dirInput, setDirInput] = useState(DEFAULT_DIR);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [integrity, setIntegrity] = useState<IntegrityIssue[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load project on mount and when dir changes.
  async function load(target = dir) {
    setLoading(true);
    setSaveError(null);
    try {
      const result = await api.load(target);
      setProject(result.data);
      setLoadErrors(result.errors);
      const { issues } = await api.integrity(result.data);
      setIntegrity(issues);
      setSelection(result.data.characters[0] ? { kind: "character", id: result.data.characters[0].id } : null);
      setDirty(false);
    } catch (e) {
      setLoadErrors([(e as Error).message]);
      setProject(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // `load` intentionally closes over the setter only; dep is [dir].
  }, [dir]);

  // Persist via Save.
  async function save() {
    if (!project) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { errors } = await api.save(dir, project);
      if (errors.length) setSaveError(errors.join("; "));
      else setDirty(false);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Generic patch: update one item in any collection by id.
  function patch<T extends { id: string }>(kind: Kind, id: string, fn: (item: T) => T) {
    if (!project) return;
    const field = collectionField(kind);
    const items = project[field] as unknown as T[];
    setProject({
      ...project,
      [field]: items.map((it: T) => (it.id === id ? fn(it) : it)),
    });
    setDirty(true);
  }

  // Canon facts are an array editor (no single-id selection).
  function patchCanonFacts(next: ProjectData["canonFacts"]) {
    if (!project) return;
    setProject({ ...project, canonFacts: next });
    setDirty(true);
  }

  const integrityFor = (id: string): IntegrityIssue[] => integrity.filter((i) => i.from === id);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Dialogue Foundry</h1>
        <form
          className="dir-form"
          onSubmit={(e) => {
            e.preventDefault();
            setDir(dirInput);
          }}
        >
          <label>Project dir</label>
          <input value={dirInput} onChange={(e) => setDirInput(e.target.value)} size={50} spellCheck={false} />
          <button type="submit">Load</button>
        </form>
        <button className="save" onClick={() => void save()} disabled={!project || saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save*" : "Saved"}
        </button>
        {saveError && <span className="err">save: {saveError}</span>}
      </header>

      {loadErrors.length > 0 && (
        <div className="banner err">
          <strong>Load errors:</strong>
          <ul>
            {loadErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <main className="layout">
        <aside className="browser">
          {project ? (
            <Browser project={project} integrity={integrity} selection={selection} onSelect={setSelection} />
          ) : loading ? (
            <p>Loading…</p>
          ) : (
            <p>No project.</p>
          )}
        </aside>

        <section className="editor">
          {project && selection ? renderEditor(project, selection, integrityFor, patch, patchCanonFacts) : (
            <p className="hint">Select an artifact to edit.</p>
          )}
        </section>
      </main>
    </div>
  );
}

/** Map a selection kind to the ProjectData collection field. */
function collectionField(kind: Kind): keyof ProjectData {
  switch (kind) {
    case "character": return "characters";
    case "faction": return "factions";
    case "state": return "states";
    case "quest": return "quests";
    case "scene": return "scenes";
    case "canon": return "canonFacts";
  }
}

/** Render the right editor for the current selection. */
function renderEditor(
  project: ProjectData,
  sel: Selection,
  integrityFor: (id: string) => IntegrityIssue[],
  patch: <T extends { id: string }>(kind: Kind, id: string, fn: (item: T) => T) => void,
  patchCanonFacts: (next: ProjectData["canonFacts"]) => void,
) {
  switch (sel.kind) {
    case "character": {
      const c = project.characters.find((x) => x.id === sel.id);
      if (!c) return <p className="hint">Character not found.</p>;
      return (
        <CharacterEditor
          key={c.id}
          character={c}
          integrity={integrityFor(c.id)}
          knownFactionIds={project.factions.map((f: ProjectData["factions"][number]) => f.id)}
          onChange={(fn) => patch(sel.kind, sel.id, fn)}
        />
      );
    }
    case "faction": {
      const f = project.factions.find((x) => x.id === sel.id);
      if (!f) return <p className="hint">Faction not found.</p>;
      return <FactionEditor key={f.id} faction={f} integrity={integrityFor(f.id)} onChange={(fn) => patch(sel.kind, sel.id, fn)} />;
    }
    case "state": {
      const s = project.states.find((x) => x.id === sel.id);
      if (!s) return <p className="hint">State not found.</p>;
      return <CharacterStateEditor key={s.id} state={s} integrity={integrityFor(s.id)} onChange={(fn) => patch(sel.kind, sel.id, fn)} />;
    }
    case "quest": {
      const q = project.quests.find((x) => x.id === sel.id);
      if (!q) return <p className="hint">Quest not found.</p>;
      return <QuestEditor key={q.id} quest={q} integrity={integrityFor(q.id)} onChange={(fn) => patch(sel.kind, sel.id, fn)} />;
    }
    case "scene": {
      const sc = project.scenes.find((x) => x.id === sel.id);
      if (!sc) return <p className="hint">Scene not found.</p>;
      return <SceneEditor key={sc.id} scene={sc} integrity={integrityFor(sc.id)} onChange={(fn) => patch(sel.kind, sel.id, fn)} />;
    }
    case "canon": {
      return <CanonFactEditor key="canon" facts={project.canonFacts} integrityRefs={new Set()} onChange={patchCanonFacts} />;
    }
  }
}
