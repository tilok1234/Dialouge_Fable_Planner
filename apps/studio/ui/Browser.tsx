// Read-only project browser (left panel).
//
// Lists every artifact by type. Characters are selectable (the only editor in
// this slice); other types are shown read-only with counts. Integrity issues
// are flagged inline so dangling refs are visible before you edit.

import type { ProjectData } from "@df/storage";

import type { IntegrityIssue } from "./api.js";

interface Props {
  project: ProjectData;
  integrity: IntegrityIssue[];
  selectedCharId: string | null;
  onSelectChar: (id: string) => void;
}

export function Browser({ project, integrity, selectedCharId, onSelectChar }: Props) {
  const issueFromIds = new Set(integrity.map((i) => i.from));

  // Read-only collections: name, count, flag if any member has an integrity issue.
  // Note: terminology/timeline have no `id` field, so the entry type is loose.
  const ro: [string, unknown[], boolean][] = [
    ["canon facts", project.canonFacts, false],
    ["terminology", project.terminology, false],
    ["timeline", project.timeline, false],
    ["factions", project.factions, false],
    ["relationships", project.relationships, project.relationships.some((r: { id: string }) => issueFromIds.has(r.id))],
    ["quests", project.quests, false],
    ["scenes", project.scenes, project.scenes.some((s: { id: string }) => issueFromIds.has(s.id))],
    ["states", project.states, project.states.some((s: { id: string }) => issueFromIds.has(s.id))],
    ["context packages", project.contextPackages, project.contextPackages.some((c: { id: string }) => issueFromIds.has(c.id))],
    ["beat plans", project.beatPlans, false],
    ["dialogues", project.dialogues, false],
    ["reviews", project.reviews, false],
    ["proposals", project.proposals, false],
  ];

  return (
    <div className="browser-inner">
      <div className="proj-head">
        <strong>{project.project.name}</strong>
        <span className="muted">{project.project.id}</span>
      </div>

      <h2>Characters ({project.characters.length})</h2>
      <ul className="char-list">
        {project.characters.map((c) => (
          <li key={c.id}>
            <button
              className={c.id === selectedCharId ? "sel" : ""}
              onClick={() => onSelectChar(c.id)}
            >
              <span className="char-name">{c.identity.name}</span>
              <span className="muted">{c.identity.gameplayRole}</span>
              {issueFromIds.has(c.id) && <span className="flag" title="integrity issue">⚠</span>}
            </button>
          </li>
        ))}
      </ul>

      <h2>Other artifacts</h2>
      <ul className="ro-list">
        {ro.map(([label, items, flagged]) => (
          <li key={label} className={flagged ? "flagged" : ""}>
            {label} <span className="count">({items.length})</span>
            {flagged && <span className="flag" title="integrity issue">⚠</span>}
          </li>
        ))}
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
