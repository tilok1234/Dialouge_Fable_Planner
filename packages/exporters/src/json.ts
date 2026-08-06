/**
 * Generic JSON export (M7).
 *
 * Produces an engine-agnostic JSON blob a real game can load. Per the contract:
 *  - only `approvalStatus === "accepted"` dialogue leaves the tool (drafts,
 *    patches, rejected never export)
 *  - every exported line carries a STABLE localization key so external tooling
 *    can localize later (`<locKeyPrefix>.<artifactId>.<lineId>`)
 *  - engine-agnostic: no Unity/Godot/Unreal-specific keys
 *
 * The shape is intentionally flat and self-describing: a game loader reads
 * `project`, `characters` (the voice/identity context), and `lines` (the actual
 * content, keyed by loc key). Pure, no I/O.
 */

import type { ProjectData } from "@df/storage";

/** A single exported dialogue line, engine-agnostic. */
export interface ExportedLine {
  locKey: string;
  artifactId: string;
  sceneId: string;
  lineId: string;
  speakerId: string;
  text: string;
  lang: string;
  beatOrder?: number;
}

/** A minimal voice/identity context for a character (so a loader can render). */
export interface ExportedCharacter {
  id: string;
  name: string;
  gameplayRole: string;
  formality: string;
}

export interface ExportedProject {
  project: { id: string; name: string; locKeyPrefix: string; schemaVersion: string };
  characters: ExportedCharacter[];
  lines: ExportedLine[];
  /** Count of dialogue artifacts that were skipped (not accepted). */
  skippedDrafts: number;
}

/** Build the generic-JSON export from a loaded project. */
export function exportJson(project: ProjectData): ExportedProject {
  const prefix = project.project.locKeyPrefix ?? "df";

  const characters: ExportedCharacter[] = project.characters.map((c) => ({
    id: c.id,
    name: c.identity.name,
    gameplayRole: c.identity.gameplayRole,
    formality: c.voice.formality,
  }));

  let skippedDrafts = 0;
  const lines: ExportedLine[] = [];

  for (const dlg of project.dialogues) {
    if (dlg.approvalStatus !== "accepted") {
      skippedDrafts++;
      continue;
    }
    for (const line of dlg.lines) {
      // Stable loc key: prefix.artifactId.lineId — survives rename only if the
      // ids stay stable (they do, per contract).
      const artifactSlug = dlg.id.replace(/^dlg_/, "");
      const locKey = `${prefix}.${artifactSlug}.${line.id}`;
      lines.push({
        locKey,
        artifactId: dlg.id,
        sceneId: dlg.sceneId,
        lineId: line.id,
        speakerId: line.speakerId,
        text: line.text.value,
        lang: line.text.lang ?? "en",
        beatOrder: line.beatOrder,
      });
    }
  }

  return {
    project: {
      id: project.project.id,
      name: project.project.name,
      locKeyPrefix: prefix,
      schemaVersion: project.project.schemaVersion,
    },
    characters,
    lines,
    skippedDrafts,
  };
}

/** Serialize to a pretty JSON string. */
export function exportJsonString(project: ProjectData): string {
  return JSON.stringify(exportJson(project), null, 2) + "\n";
}
