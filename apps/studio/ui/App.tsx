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
import { FieldGuide } from "./FieldGuide.js";
import { GeneratePanel } from "./GeneratePanel.js";
import { PreviewRoom } from "./PreviewRoom.js";
import { QuestEditor } from "./QuestEditor.js";
import { SceneEditor } from "./SceneEditor.js";

// Relative dirs are resolved by the backend against the repo root (its first
// allowed root), regardless of where the server process was launched from.
const DEFAULT_DIR = "samples/quarry-project";

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
  const [preview, setPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [browse, setBrowse] = useState<{ dir: string; id: string; name: string }[] | null>(null);

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

  // Create a brand-new empty project on disk under projects/<slug> (relative
  // dirs resolve against the repo root server-side), then load it.
  async function createProject() {
    const name = newName.trim() || "Untitled project";
    const slug =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "untitled";
    if (dirty && !window.confirm("Discard unsaved changes and create a new project?")) return;
    const target = `projects/${slug}`;
    const fresh: ProjectData = {
      project: {
        id: `project_${slug}`,
        version: 1,
        contentHash: "sha256:uncommitted",
        name,
        summary: { value: `${name} — a Dialogue Foundry project.`, lang: "en" },
        schemaVersion: "1.0.0",
        promptTemplateVersion: "1.0.0",
        defaultProvider: "claude-cli",
        defaultModel: "claude-opus-5",
        defaultReasoningEffort: "normal",
        locks: { characterProfileFields: {}, dialogueLines: {}, canonFacts: [], questFacts: {} },
        locKeyPrefix: slug,
      },
      canonFacts: [], terminology: [], timeline: [], factions: [], characters: [], states: [],
      relationships: [], quests: [], scenes: [], contextPackages: [], beatPlans: [], dialogues: [],
      reviews: [], proposals: [],
    };
    setSaveError(null);
    try {
      await api.save(target, fresh);
      setCreating(false);
      setNewName("");
      setDirInput(target);
      setDir(target); // triggers the load effect
    } catch (e) {
      setSaveError(`new project: ${(e as Error).message}`);
    }
  }

  // ---- Hand-authoring: create a blank, schema-valid artifact of any kind ----

  /** Smallest unused `<prefix>_new_<n>` id across the given collection. */
  function nextId(prefix: string, existing: { id: string }[]): string {
    for (let n = 1; ; n++) {
      const id = `${prefix}_new_${n}`;
      if (!existing.some((x) => x.id === id)) return id;
    }
  }

  const loc = (value: string) => ({ value, lang: "en" });
  const versioned = { version: 1, contentHash: "sha256:uncommitted" };

  function createArtifact(kind: Kind) {
    if (!project) return;
    const p = project;
    switch (kind) {
      case "canon": {
        const fact: ProjectData["canonFacts"][number] = {
          ...versioned,
          id: nextId("canon", p.canonFacts),
          label: "New fact",
          statement: loc("State the fact here."),
          veracity: "established-fact",
          visibility: "public",
          references: [],
          tags: [],
        };
        setProject({ ...p, canonFacts: [...p.canonFacts, fact] });
        setSelection({ kind: "canon", id: "__list__" });
        break;
      }
      case "faction": {
        const faction: ProjectData["factions"][number] = {
          ...versioned,
          id: nextId("fac", p.factions),
          name: "New faction",
          summary: loc("Describe the faction's identity."),
          sharedBeliefs: [],
          sharedOpinions: [],
          terminology: [],
          customs: [],
          taboos: [],
          tags: [],
        };
        setProject({ ...p, factions: [...p.factions, faction] });
        setSelection({ kind: "faction", id: faction.id });
        break;
      }
      case "character": {
        const character: ProjectData["characters"][number] = {
          ...versioned,
          id: nextId("char", p.characters),
          identity: {
            name: "New character",
            factions: [],
            gameplayRole: "ambient-npc",
            narrativeFunction: "other",
            connections: [],
          },
          core: {
            primaryDesire: loc("What do they want most?"),
            primaryFear: loc("What do they fear most?"),
            centralValue: loc("What do they hold sacred?"),
            mainFlaw: loc("How does that value turn harmful?"),
            centralContradiction: loc("What tension makes them human?"),
            moralBoundary: loc("What will they refuse to do?"),
          },
          opinions: [],
          knowledge: { knows: [], believesFalse: [], suspects: [], secrets: [], lies: [], unknown: [] },
          voice: {
            formality: "neutral",
            directness: "balanced",
            typicalSentenceLength: "medium",
            vocabularyComplexity: "common",
            usesContractions: true,
            usesHumor: "rare",
            emotionalRestraint: "measured",
            declarationStyle: "balanced",
            namesEmotionsDirectly: true,
            addressMode: "by-name",
            avoids: [],
            sampleLines: [loc("Write one line the way this character would say it.")],
            antiSampleLines: [],
          },
          pressure: [],
          tags: [],
        };
        setProject({ ...p, characters: [...p.characters, character] });
        setSelection({ kind: "character", id: character.id });
        break;
      }
      case "state": {
        const owner =
          (selection?.kind === "character" && p.characters.find((c) => c.id === selection.id)) || p.characters[0];
        if (!owner) {
          setSaveError("create a character first — a state belongs to one");
          return;
        }
        const slug = owner.id.replace(/^char_/, "");
        const state: ProjectData["states"][number] = {
          ...versioned,
          id: nextId(`state_${slug}`, p.states),
          characterId: owner.id,
          label: `${owner.identity.name} — new state`,
          mood: "neutral",
          injuries: [],
          activeQuestStages: [],
          recentEvents: [],
          factsLearned: [],
          promises: [],
          playerBetrayed: false,
          unresolvedConflicts: [],
        };
        setProject({ ...p, states: [...p.states, state] });
        setSelection({ kind: "state", id: state.id });
        break;
      }
      case "quest": {
        const id = nextId("quest", p.quests);
        const quest: ProjectData["quests"][number] = {
          ...versioned,
          id,
          name: "New quest",
          premise: loc("What is this quest about?"),
          playerInitialKnowledge: [],
          characterKnowledge: [],
          stages: [
            {
              id: `${id}__stage_0`,
              order: 0,
              label: "Opening stage",
              factsRevealedToPlayer: [],
              transitionsTo: [],
              scenes: [],
            },
          ],
          choices: [],
          participatingCharacters: [],
          tags: [],
        };
        setProject({ ...p, quests: [...p.quests, quest] });
        setSelection({ kind: "quest", id });
        break;
      }
      case "scene": {
        const speaker = p.characters[0];
        const speakerState = speaker && p.states.find((s) => s.characterId === speaker.id);
        const scene: ProjectData["scenes"][number] = {
          ...versioned,
          id: nextId("scene", p.scenes),
          label: "New scene",
          sceneType: "npc-first-greeting",
          participants: [
            {
              characterId: speaker?.id ?? "char_todo",
              stateId: speakerState?.id ?? "state_todo",
              relationshipIds: [],
              role: "speaker",
            },
          ],
          boundQuestStages: [],
          purpose: loc("Why does this scene exist?"),
          requiredFacts: [],
          hintableFacts: [],
          forbiddenRevelations: [],
          emotionalProgression: [{ order: 1, emotion: "neutral" }],
          maxLength: "short",
          availableChoices: [],
          templateDefaults: {},
        };
        setProject({ ...p, scenes: [...p.scenes, scene] });
        setSelection({ kind: "scene", id: scene.id });
        break;
      }
    }
    setDirty(true);
  }

  // Export the project (M7). Fetches JSON or CSV and triggers a download.
  async function exportFormat(format: "json" | "csv") {
    if (!project) return;
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, format }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `export failed (${res.status})`);
      const content = format === "csv" ? body.csv : JSON.stringify(body.json, null, 2) + "\n";
      const mime = format === "csv" ? "text/csv" : "application/json";
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.project.id}.${format === "csv" ? "csv" : "export.json"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setSaveError(`export: ${(e as Error).message}`);
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
          <button
            type="button"
            onClick={() => {
              if (browse) return setBrowse(null);
              void fetch("/api/projects")
                .then(async (r) => setBrowse((await r.json()).projects ?? []))
                .catch(() => setBrowse([]));
            }}
          >
            {browse ? "Hide saves" : "Browse saves…"}
          </button>
        </form>
        <button className="save" onClick={() => void save()} disabled={!project || saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save*" : "Saved"}
        </button>
        <button onClick={() => void exportFormat("json")} disabled={!project}>Export JSON</button>
        <button onClick={() => void exportFormat("csv")} disabled={!project}>Export CSV</button>
        <button onClick={() => setPreview((p) => !p)} disabled={!project}>
          {preview ? "Close preview" : "Preview room"}
        </button>
        <button onClick={() => setCreating((c) => !c)}>New project</button>
        {saveError && <span className="err">save: {saveError}</span>}
      </header>

      {browse && (
        <div className="banner">
          {browse.length === 0 ? (
            <span className="muted">No saved projects found under the allowed roots.</span>
          ) : (
            <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
              {browse.map((p) => (
                <li key={p.dir}>
                  <button
                    onClick={() => {
                      if (dirty && !window.confirm("Discard unsaved changes and load this project?")) return;
                      setBrowse(null);
                      setDirInput(p.dir);
                      setDir(p.dir);
                    }}
                    title={p.dir}
                  >
                    {p.name} <span className="muted">({p.dir})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {creating && (
        <div className="banner">
          <form
            style={{ display: "flex", gap: 8, alignItems: "center" }}
            onSubmit={(e) => {
              e.preventDefault();
              void createProject();
            }}
          >
            <label>New project name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Harbor of Glass" size={30} autoFocus />
            <span className="muted">→ projects/{(newName.trim() || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "untitled"}</span>
            <button type="submit" className="save">Create</button>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        </div>
      )}

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

      {preview && project ? (
        <PreviewRoom project={project} onClose={() => setPreview(false)} />
      ) : (
      <main className="layout">
        <aside className="browser">
          {project ? (
            <Browser project={project} integrity={integrity} selection={selection} onSelect={setSelection} onAdd={createArtifact} />
          ) : loading ? (
            <p>Loading…</p>
          ) : (
            <p>No project.</p>
          )}
        </aside>

        <section className="editor">
          {project && selection ? (
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {renderEditor(project, selection, integrityFor, patch, patchCanonFacts)}
              </div>
              <FieldGuide kind={selection.kind} />
            </div>
          ) : project ? (
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <GeneratePanel
                  onAccept={(profile) => {
                    setProject({ ...project, characters: [...project.characters, profile] });
                    setSelection({ kind: "character", id: profile.id });
                    setDirty(true);
                  }}
                />
              </div>
              <FieldGuide kind="generate" />
            </div>
          ) : (
            <p className="hint">Select an artifact to edit.</p>
          )}
        </section>
      </main>
      )}
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
      return <SceneEditor key={sc.id} scene={sc} integrity={integrityFor(sc.id)} project={project} onChange={(fn) => patch(sel.kind, sel.id, fn)} />;
    }
    case "canon": {
      return <CanonFactEditor key="canon" facts={project.canonFacts} integrityRefs={new Set()} onChange={patchCanonFacts} />;
    }
  }
}
