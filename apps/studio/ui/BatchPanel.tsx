// Batch generation queue — compile many scenes unattended.
//
// Works through the selected scenes sequentially: generate (with compiled
// context) → auto-review → store as approvalStatus "reviewed" → SAVE, so
// progress survives a tab reload and a crash mid-queue loses at most one
// scene. The human gate stays intact: nothing becomes "accepted" until the
// author sweeps the results — per-scene or "accept all that passed".
//
// Provider-agnostic: it calls the same backend endpoints as the scene editor,
// so it runs at mock speed (instant), Opus speed (~3 min/scene), or whatever
// CLI the backend was started with (--claude-cmd / DF_CLAUDE_CMD).

import type { ProjectData } from "@df/storage";
import { useRef, useState } from "react";

type Status = "pending" | "generating" | "reviewing" | "done" | "failed" | "skipped";

interface Item {
  sceneId: string;
  label: string;
  selected: boolean;
  status: Status;
  passed?: boolean;
  findings?: number;
  warnings?: number;
  error?: string;
}

export interface BatchBundle {
  dialogue: unknown;
  beatPlan?: unknown;
  contextPackage?: unknown;
  review?: unknown;
}

interface Props {
  project: ProjectData;
  /** Upsert the bundle (as reviewed) into the project AND persist to disk. */
  onBundleSaved: (bundle: BatchBundle) => Promise<void>;
  /** Mark every "reviewed" dialogue whose review passed as accepted + save.
   * Returns how many were accepted. */
  onAcceptAllPassed: () => Promise<number>;
  onClose: () => void;
}

export function BatchPanel({ project, onBundleSaved, onAcceptAllPassed, onClose }: Props) {
  const scenesWithDialogue = new Set(project.dialogues.map((d) => d.sceneId));
  const [items, setItems] = useState<Item[]>(() =>
    project.scenes.map((s) => ({
      sceneId: s.id,
      label: s.label,
      selected: !scenesWithDialogue.has(s.id),
      status: "pending" as Status,
    })),
  );
  const [running, setRunning] = useState(false);
  const [acceptedCount, setAcceptedCount] = useState<number | null>(null);
  const cancelRef = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  const patch = (sceneId: string, p: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.sceneId === sceneId ? { ...x, ...p } : x)));

  async function run() {
    setRunning(true);
    setAcceptedCount(null);
    cancelRef.current = false;
    for (const item of items) {
      if (cancelRef.current) break;
      if (!item.selected || item.status === "done") continue;
      const scene = projectRef.current.scenes.find((s) => s.id === item.sceneId);
      if (!scene) {
        patch(item.sceneId, { status: "skipped", error: "scene vanished" });
        continue;
      }
      try {
        patch(item.sceneId, { status: "generating", error: undefined });
        const genRes = await fetch("/api/generate-dialogue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scene, project: projectRef.current }),
        });
        const gen = await genRes.json();
        if (!genRes.ok) throw new Error(gen.error ?? `generate failed (${genRes.status})`);

        patch(item.sceneId, { status: "reviewing", warnings: (gen.warnings ?? []).length });
        const revRes = await fetch("/api/review-dialogue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft: gen.draft, scene }),
        });
        const rev = await revRes.json();
        if (!revRes.ok) throw new Error(rev.error ?? `review failed (${revRes.status})`);

        await onBundleSaved({
          dialogue: { ...gen.draft, approvalStatus: "reviewed", reviewId: rev.review?.id },
          beatPlan: gen.beatPlan,
          contextPackage: gen.contextPackage,
          review: rev.review,
        });
        patch(item.sceneId, { status: "done", passed: rev.review?.passed, findings: rev.review?.findings?.length ?? 0 });
      } catch (e) {
        // One bad scene never stops the queue — record and move on.
        patch(item.sceneId, { status: "failed", error: (e as Error).message });
      }
    }
    setRunning(false);
  }

  const selected = items.filter((i) => i.selected);
  const done = items.filter((i) => i.status === "done");
  const failed = items.filter((i) => i.status === "failed");
  const passedReviewed = projectRef.current.dialogues.filter((d) => {
    if (d.approvalStatus !== "reviewed") return false;
    const r = projectRef.current.reviews.find((x) => x.id === d.reviewId);
    return r?.passed === true;
  }).length;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Batch generate</h2>
        <span className="muted">
          {selected.length} selected · {done.length} done · {failed.length} failed
        </span>
        <button style={{ marginLeft: "auto" }} onClick={onClose} disabled={running}>
          Back to editor
        </button>
      </div>

      <p className="muted" style={{ maxWidth: 720 }}>
        Each scene runs generate → review and is saved as a REVIEWED draft immediately (progress survives reloads).
        Nothing is accepted automatically — sweep the results below when the queue finishes. With a real model each
        scene takes minutes; leave the tab open.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {!running ? (
          <button className="save" onClick={() => void run()} disabled={selected.every((i) => i.status === "done")}>
            Start queue ({selected.filter((i) => i.status !== "done").length} scenes)
          </button>
        ) : (
          <button className="rm" onClick={() => (cancelRef.current = true)}>
            Stop after current scene
          </button>
        )}
        <button
          onClick={() => void onAcceptAllPassed().then(setAcceptedCount)}
          disabled={running || passedReviewed === 0}
        >
          Accept all that passed review ({passedReviewed})
        </button>
        {acceptedCount !== null && <span className="badge ok">accepted {acceptedCount} ✓ (saved)</span>}
      </div>

      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          {items.map((i) => (
            <tr key={i.sceneId} style={{ borderBottom: "1px solid #2a2f3e" }}>
              <td style={{ padding: "4px 8px" }}>
                <input
                  type="checkbox"
                  checked={i.selected}
                  disabled={running}
                  onChange={(e) => patch(i.sceneId, { selected: e.target.checked })}
                />
              </td>
              <td style={{ padding: "4px 8px" }}>{i.label}</td>
              <td className="muted" style={{ padding: "4px 8px" }}>
                {scenesWithDialogue.has(i.sceneId) && i.status === "pending" ? "has dialogue" : ""}
              </td>
              <td style={{ padding: "4px 8px" }}>
                {i.status === "pending" && <span className="muted">pending</span>}
                {i.status === "generating" && <span>generating…</span>}
                {i.status === "reviewing" && <span>reviewing…</span>}
                {i.status === "done" && (
                  <span className={i.passed ? "badge ok" : "badge bad"}>
                    {i.passed ? "passed" : `${i.findings} finding(s)`}
                    {i.warnings ? ` · ${i.warnings} context warning(s)` : ""}
                  </span>
                )}
                {i.status === "failed" && <span className="err">failed: {i.error}</span>}
                {i.status === "skipped" && <span className="muted">skipped</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
