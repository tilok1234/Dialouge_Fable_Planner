// Project browser (left panel).
//
// Lists every artifact by type. All collections are selectable now (M2
// follow-up). Integrity issues are flagged inline so dangling refs are visible
// before you edit.

import type { ProjectData } from "@df/storage";

import type { IntegrityIssue } from "./api.js";

/** Selection shared with App. */
type Selection =
  | { kind: "character"; id: string }
  | { kind: "faction"; id: string }
  | { kind: "state"; id: string }
  | { kind: "quest"; id: string }
  | { kind: "scene"; id: string }
  | { kind: "relationship"; id: string }
  | { kind: "canon"; id: "__list__" }
  | { kind: "terminology"; id: "__list__" };

interface Props {
  project: ProjectData;
  integrity: IntegrityIssue[];
  selection: Selection | null;
  /** null clears the selection, which shows the generate-character panel. */
  onSelect: (sel: Selection | null) => void;
  /** Create a blank artifact of the given kind (App owns the templates). */
  onAdd: (kind: Selection["kind"]) => void;
}

export function Browser({ project, integrity, selection, onSelect, onAdd }: Props) {
  const issueFromIds = new Set(integrity.map((i) => i.from));
  const isSel = (kind: Selection["kind"], id: string) => selection?.kind === kind && selection?.id === id;

  // Generic selectable collection renderer.
  function collection(
    title: string,
    kind: Selection["kind"],
    items: { id: string; label: string; sub?: string }[],
  ) {
    return (
      <>
        <h2>
          {title} ({items.length})
          <button className="add" title={`add ${title.toLowerCase()}`} onClick={() => onAdd(kind)} style={{ marginLeft: 8 }}>
            ＋
          </button>
        </h2>
        <ul className="char-list">
          {items.map((it) => (
            <li key={it.id}>
              <button className={isSel(kind, it.id) ? "sel" : ""} onClick={() => onSelect({ kind, id: it.id } as Selection)}>
                <span className="char-name">{it.label}</span>
                {it.sub && <span className="muted">{it.sub}</span>}
                {issueFromIds.has(it.id) && <span className="flag" title="integrity issue">⚠</span>}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="browser-inner">
      <div className="proj-head">
        <strong>{project.project.name}</strong>
        <span className="muted">{project.project.id}</span>
      </div>

      <button className="gen-new" onClick={() => onSelect(null)} disabled={selection === null}>
        ＋ New character (generate)
      </button>

      {collection("Canon facts", "canon", [{ id: "__list__", label: "world-facts.json", sub: `${project.canonFacts.length} facts` }])}
      {collection(
        "Factions",
        "faction",
        project.factions.map((f) => ({ id: f.id, label: f.name })),
      )}
      {collection(
        "Characters",
        "character",
        project.characters.map((c) => ({ id: c.id, label: c.identity.name, sub: c.identity.gameplayRole })),
      )}
      {collection(
        "States",
        "state",
        project.states.map((s) => ({ id: s.id, label: s.label, sub: s.phase })),
      )}
      {collection(
        "Quests",
        "quest",
        project.quests.map((q) => ({ id: q.id, label: q.name, sub: `${q.stages.length} stages` })),
      )}
      {collection(
        "Scenes",
        "scene",
        project.scenes.map((s) => ({ id: s.id, label: s.label, sub: s.sceneType })),
      )}
      {collection(
        "Relationships",
        "relationship",
        project.relationships.map((r) => ({ id: r.id, label: `${r.partyA} ↔ ${r.partyB}`, sub: r.namedState })),
      )}
      {collection("Terminology", "terminology", [
        { id: "__list__", label: "terminology.json", sub: `${project.terminology.length} terms` },
      ])}

      <h2>Pipeline output (read-only)</h2>
      <ul className="ro-list">
        <li>timeline ({project.timeline.length})</li>
        <li>context ({project.contextPackages.length})</li>
        <li>beats ({project.beatPlans.length})</li>
        <li>dialogues ({project.dialogues.length})</li>
        <li>reviews ({project.reviews.length})</li>
        <li>proposals ({project.proposals.length})</li>
      </ul>

      {integrity.length > 0 && (
        <div className="integrity">
          <h3>Integrity issues ({integrity.length})</h3>
          <ul>
            {integrity.slice(0, 20).map((i, idx) => (
              <li key={idx}>
                <code>{i.from}</code> → <code>{i.field}</code>: <code>{i.ref}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
