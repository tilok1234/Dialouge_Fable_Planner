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
}

export function SceneEditor({ scene, onChange }: Props) {
  const validation = useMemo(() => SceneSpecification.safeParse(scene), [scene]);
  const issues = validation.success ? [] : validation.error.issues.slice(0, 8);
  const sc = scene;
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<{ lines: { text: { value: string }; speakerId: string }[] } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  async function generateDialogue() {
    setGenerating(true);
    setGenError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/generate-dialogue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scene: sc }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `generate failed (${res.status})`);
      setDraft(body.draft);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
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

      <Section title="Generate dialogue (mock — no key, no cost)">
        <button onClick={() => void generateDialogue()} disabled={generating || !validation.success}>
          {generating ? "Generating…" : "Generate dialogue"}
        </button>
        {!validation.success && <p className="muted">Fix schema errors before generating.</p>}
        {genError && <div className="err">error: {genError}</div>}
        {draft && (
          <div className="draft">
            <h3>Generated draft ({draft.lines.length} lines)</h3>
            <ul>
              {draft.lines.map((l, i) => (
                <li key={i}>
                  <code className="muted">{l.speakerId}:</code> {l.text.value}
                </li>
              ))}
            </ul>
            <p className="muted">Draft only — not saved. (Persistence + accept/reject lands in M5.)</p>
          </div>
        )}
      </Section>
    </div>
  );
}
