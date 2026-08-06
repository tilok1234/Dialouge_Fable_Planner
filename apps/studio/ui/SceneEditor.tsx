// Scene editor. The scene spec is the primary steering input to the Context
// Compiler — especially requiredFacts / forbiddenRevelations (the leak gate),
// purpose, emotional progression, and bound quest stages. Those are the focus.

import { SceneSpecification, type SceneSpecification as SceneType, type SceneType as SceneTypeEnum } from "@df/schemas";
import { useMemo, useState } from "react";

import { EditorHeader, EnumSelect, RefListField, Section, TextArea, TextField, ValidationIssues } from "./fields.js";

const SCENE_TYPES: readonly SceneTypeEnum[] = [
  "quest-introduction", "quest-offer", "quest-accept", "quest-decline",
  "quest-return-after-declining", "quest-progress-update", "quest-missing-requirement",
  "quest-success", "quest-partial-success", "quest-failure", "quest-betrayal-outcome",
  "quest-later-consequence", "boss-first-encounter", "boss-rematch", "boss-aggro",
  "boss-phase-transition", "boss-mechanic-warning", "boss-player-wounded", "boss-wounded",
  "boss-kills-player", "boss-victory", "boss-defeat", "boss-escape", "boss-post-defeat",
  "npc-first-greeting", "npc-repeat-greeting", "npc-friendly-greeting", "npc-hostile-greeting",
  "npc-service", "npc-rumour", "npc-location-reaction", "npc-quest-state-reaction",
  "npc-ambient-bark", "npc-combat-reaction", "npc-farewell", "monologue", "sermon",
  "journal-entry", "letter", "historical-account", "companion-conversation",
  "ambient-two-npc-conversation",
] as const;

const LENGTH = ["single-line", "very-short", "short", "medium", "long"] as const;

interface Props {
  scene: SceneType;
  integrity: { field: string; ref: string }[];
  onChange: (patch: (s: SceneType) => SceneType) => void;
  /** The loaded project — sent with generate requests so the backend can
   * compile real context (profiles, states, fact statements) for the scene. */
  project?: unknown;
  /** Accept the generated bundle into the project (App upserts + marks dirty). */
  onAcceptDialogue?: (bundle: { dialogue: unknown; beatPlan?: unknown; contextPackage?: unknown; review?: unknown }) => void;
}

/** Loose artifact shapes — full schema-valid JSON from the backend. */
type DraftJson = { id?: string; lines: { text: { value: string }; speakerId: string }[]; [k: string]: unknown };
type ReviewJson = {
  id?: string;
  passed: boolean;
  findings: { id: string; type: string; severity: string; lineId?: string; reason: string; suggestedRepair?: { value: string } }[];
  [k: string]: unknown;
};

export function SceneEditor({ scene, onChange, project, onAcceptDialogue }: Props) {
  const validation = useMemo(() => SceneSpecification.safeParse(scene), [scene]);
  const issues = validation.success ? [] : validation.error.issues.slice(0, 8);
  const sc = scene;
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<DraftJson | null>(null);
  const [beatPlan, setBeatPlan] = useState<unknown>(null);
  const [contextPackage, setContextPackage] = useState<unknown>(null);
  const [review, setReview] = useState<ReviewJson | null>(null);
  const [repaired, setRepaired] = useState<DraftJson | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarnings, setGenWarnings] = useState<{ ref: string; reason: string }[]>([]);

  async function generateDialogue() {
    setGenerating(true);
    setGenError(null);
    setDraft(null);
    setBeatPlan(null);
    setContextPackage(null);
    setReview(null);
    setRepaired(null);
    setAccepted(false);
    setGenWarnings([]);
    try {
      const res = await fetch("/api/generate-dialogue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scene: sc, project }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `generate failed (${res.status})`);
      setDraft(body.draft);
      setBeatPlan(body.beatPlan ?? null);
      setContextPackage(body.contextPackage ?? null);
      setGenWarnings(body.warnings ?? []);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  // Accept: the reviewed/repaired draft becomes project content (constraint
  // #8's missing half — the human saying yes). Nothing touches disk until Save.
  function accept() {
    const finalDraft = repaired ?? draft;
    if (!finalDraft || !onAcceptDialogue) return;
    onAcceptDialogue({
      dialogue: { ...finalDraft, approvalStatus: "accepted", reviewId: review?.id },
      beatPlan,
      contextPackage,
      review,
    });
    setAccepted(true);
  }

  return (
    <div className="editor-inner">
      <EditorHeader name={sc.label} id={sc.id} version={sc.version} valid={validation.success} />
      <ValidationIssues issues={issues} />

      <Section title="Scene">
        <TextField label="Label" value={sc.label} onChange={(v) => onChange((x) => ({ ...x, label: v }))} />
        <EnumSelect label="Scene type" value={sc.sceneType} options={SCENE_TYPES} onChange={(v) => onChange((x) => ({ ...x, sceneType: v as SceneTypeEnum }))} />
        <EnumSelect label="Max length" value={sc.maxLength} options={LENGTH} onChange={(v) => onChange((x) => ({ ...x, maxLength: v as SceneType["maxLength"] }))} />
        <TextArea label="Purpose" value={sc.purpose.value} onChange={(v) => onChange((x) => ({ ...x, purpose: { ...x.purpose, value: v } }))} />
      </Section>

      <Section title="Knowledge gating (the leak-detector contract)">
        <RefListField label="Required facts (MUST appear)" values={sc.requiredFacts} onChange={(v) => onChange((x) => ({ ...x, requiredFacts: v }))} />
        <RefListField label="Forbidden revelations (MUST NOT appear)" values={sc.forbiddenRevelations} onChange={(v) => onChange((x) => ({ ...x, forbiddenRevelations: v }))} />
        <RefListField label="Hintable facts" values={sc.hintableFacts} onChange={(v) => onChange((x) => ({ ...x, hintableFacts: v }))} />
      </Section>

      <Section title="Binding">
        <RefListField label="Bound quest stages" values={sc.boundQuestStages} onChange={(v) => onChange((x) => ({ ...x, boundQuestStages: v }))} />
        <RefListField label="Available choices" values={sc.availableChoices} onChange={(v) => onChange((x) => ({ ...x, availableChoices: v }))} />
      </Section>

      <Section title="Generate dialogue (uses the configured provider; Claude takes minutes)">
        <p className="muted">
          The context compiler resolves the participants&apos; profiles, states, fact
          statements, and relationship states from the loaded project — the model
          writes from those, not from the scene alone.
        </p>
        <button onClick={() => void generateDialogue()} disabled={generating || !validation.success}>
          {generating ? "Generating…" : "Generate dialogue"}
        </button>
        {!validation.success && <p className="muted">Fix schema errors before generating.</p>}
        {genError && <div className="err">error: {genError}</div>}
        {genWarnings.length > 0 && (
          <div className="err">
            <strong>Context warnings (generation ran anyway):</strong>
            <ul>
              {genWarnings.map((w, i) => (
                <li key={i}>
                  <code>{w.ref}</code>: {w.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {draft && (
          <div className="draft">
            <h3>{repaired ? "Repaired draft" : "Generated draft"} ({(repaired ?? draft).lines.length} lines)</h3>
            <ul>
              {(repaired ?? draft).lines.map((l, i) => (
                <li key={i}>
                  <code className="muted">{l.speakerId}:</code> {l.text.value}
                </li>
              ))}
            </ul>
            <ReviewPanel
              draft={repaired ?? draft}
              scene={sc}
              review={review}
              onReview={(r) => {
                setReview(r);
                setRepaired(null);
                setAccepted(false);
              }}
              onRepaired={(d) => {
                setRepaired(d);
                setAccepted(false);
              }}
            />
            <div className="draft-actions" style={{ marginTop: 10 }}>
              {accepted ? (
                <span className="badge ok">accepted ✓ — press Save to persist it</span>
              ) : (
                <>
                  <button className="save" onClick={accept} disabled={!onAcceptDialogue}>
                    Accept into project
                  </button>
                  {!review && <span className="muted"> tip: run the review first — accept records its verdict</span>}
                </>
              )}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/** Inline review + repair panel beneath a generated draft (M6). State lives
 * in SceneEditor so Accept can bundle the review with the artifact. */
function ReviewPanel({
  draft,
  scene,
  review,
  onReview,
  onRepaired,
}: {
  draft: DraftJson;
  scene: SceneType;
  review: ReviewJson | null;
  onReview: (review: ReviewJson) => void;
  onRepaired: (draft: DraftJson) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runReview() {
    setReviewing(true);
    setErr(null);
    try {
      const res = await fetch("/api/review-dialogue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft, scene }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `review failed (${res.status})`);
      onReview(body.review);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  async function runRepair() {
    if (!review) return;
    setErr(null);
    try {
      const res = await fetch("/api/repair-dialogue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft, review, lockedLineIds: [] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `repair failed (${res.status})`);
      onRepaired(body.draft);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="review-panel">
      <button onClick={() => void runReview()} disabled={reviewing}>
        {reviewing ? "Reviewing…" : "Review (consistency check)"}
      </button>
      {err && <div className="err">{err}</div>}
      {review && (
        <>
          <p className={review.passed ? "badge ok" : "badge bad"}>
            {review.passed ? "PASSED — no blockers" : `${review.findings.length} finding(s)`}
          </p>
          {review.findings.length > 0 && (
            <ul className="validation">
              {review.findings.map((f) => (
                <li key={f.id}>
                  <span className={`sev ${f.severity}`}>{f.severity}</span>{" "}
                  <code>{f.type}</code>
                  {f.lineId && <span className="muted"> (line {f.lineId})</span>}: {f.reason}
                  {f.suggestedRepair && <div className="muted">→ suggested: <em>{f.suggestedRepair.value}</em></div>}
                </li>
              ))}
            </ul>
          )}
          {review.findings.some((f) => f.suggestedRepair) && (
            <button onClick={() => void runRepair()}>Apply suggested repairs</button>
          )}
        </>
      )}
    </div>
  );
}
