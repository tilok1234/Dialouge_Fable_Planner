// Studio App shell.
//
// Owns the loaded project state, the load/save lifecycle, and selection.
// The browser (left) lists artifacts by type; the editor (right) edits the
// selected character. Edits live in memory until Save (no autosave; NON_GOALS
// §3.1 — Git is history).

import type { ProjectData } from "@df/storage";
import { useEffect, useState } from "react";

import { api, type IntegrityIssue } from "./api.js";
import { Browser } from "./Browser.js";
import { CharacterEditor } from "./CharacterEditor.js";

const DEFAULT_DIR = "../../samples/quarry-project"; // relative to repo root from dev's POV

export function App() {
  const [dir, setDir] = useState(DEFAULT_DIR);
  const [dirInput, setDirInput] = useState(DEFAULT_DIR);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [integrity, setIntegrity] = useState<IntegrityIssue[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
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
      setSelectedCharId(result.data.characters[0]?.id ?? null);
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

  // Persist via Save. Blocked if any schema-invalid state exists (the editor
  // surfaces invalid fields; Save confirms the whole character parses).
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

  // Update one character in the in-memory project.
  function patchCharacter(id: string, patch: (c: ProjectData["characters"][number]) => ProjectData["characters"][number]) {
    if (!project) return;
    setProject({
      ...project,
      characters: project.characters.map((c) => (c.id === id ? patch(c) : c)),
    });
    setDirty(true);
  }

  const selected = project?.characters.find((c) => c.id === selectedCharId) ?? null;
  const integrityForSelected = integrity.filter((i) => i.from === selectedCharId);

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
            <Browser
              project={project}
              integrity={integrity}
              selectedCharId={selectedCharId}
              onSelectChar={setSelectedCharId}
            />
          ) : loading ? (
            <p>Loading…</p>
          ) : (
            <p>No project.</p>
          )}
        </aside>

        <section className="editor">
          {selected ? (
            <CharacterEditor
              key={selected.id}
              character={selected}
              integrity={integrityForSelected}
              knownFactionIds={project?.factions.map((f) => f.id) ?? []}
              onChange={(patch) => patchCharacter(selected.id, patch)}
            />
          ) : (
            <p className="hint">Select a character to edit.</p>
          )}
        </section>
      </main>
    </div>
  );
}
