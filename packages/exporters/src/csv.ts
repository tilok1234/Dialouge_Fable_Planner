/**
 * CSV export (M7).
 *
 * A flat spreadsheet of dialogue lines — one row per line. Intended for
 * translators, QA review in a spreadsheet app, or quick inspection. Same
 * accepted-only + stable-loc-key rules as the JSON export.
 *
 * CSV quoting follows RFC 4180: fields containing comma/quote/newline are
 * double-quoted and embedded quotes doubled. Pure, no I/O.
 */

import type { ProjectData } from "@df/storage";

import { exportJson, type ExportedLine } from "./json.js";

const COLUMNS = ["locKey", "artifactId", "sceneId", "lineId", "speakerId", "lang", "beatOrder", "text"] as const;

/** RFC 4180 CSV-quote a single field. */
function csvField(value: string | number | undefined): string {
  const s = value === undefined || value === null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build the CSV string from a loaded project. */
export function exportCsv(project: ProjectData): string {
  const exported = exportJson(project);
  const rows: string[] = [];

  rows.push(COLUMNS.map(csvField).join(","));

  for (const line of exported.lines as ExportedLine[]) {
    rows.push(
      [
        line.locKey,
        line.artifactId,
        line.sceneId,
        line.lineId,
        line.speakerId,
        line.lang,
        line.beatOrder,
        line.text,
      ]
        .map(csvField)
        .join(","),
    );
  }

  return rows.join("\n") + "\n";
}
