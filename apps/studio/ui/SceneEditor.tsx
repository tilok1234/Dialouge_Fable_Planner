// Scene editor. The scene spec is the primary steering input to the Context
// Compiler — especially requiredFacts / forbiddenRevelations (the leak gate),
// purpose, emotional progression, and bound quest stages. Those are the focus.

import { SceneSpecification, type SceneSpecification as SceneType, type SceneType as SceneTypeEnum } from "@df/schemas";
import { useMemo } from "react";

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
    </div>
  );
}
