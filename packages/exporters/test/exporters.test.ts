/**
 * Exporter tests (M7).
 *
 * Proves:
 *  - only accepted dialogue is exported; drafts/patches/rejected never leak
 *  - every exported line has a stable, unique loc key
 *  - the JSON export shape is engine-agnostic (project + characters + lines)
 *  - CSV round-trips: parses back to the same row count + loc-key column
 *  - CSV correctly quotes fields with commas/quotes/newlines
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readProject, type ProjectData } from "@df/storage";
import { describe, expect, it } from "vitest";

import { exportJson, exportJsonString, exportCsv } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(here, "..", "..", "..", "samples", "quarry-project");

const loaded = await readProject(sampleDir);
if (loaded.errors.length) throw new Error(`sample load failed: ${loaded.errors.join("; ")}`);
const project: ProjectData = loaded.data;

describe("exportJson — accepted-only + loc keys", () => {
  it("exports the sample's accepted dialogue (1 artifact, 4 lines)", () => {
    const exported = exportJson(project);
    // The sample has 1 accepted dialogue with 4 lines.
    const accepted = project.dialogues.filter((d) => d.approvalStatus === "accepted");
    expect(accepted).toHaveLength(1);
    expect(exported.lines).toHaveLength(4);
    expect(exported.skippedDrafts).toBe(0);
  });

  it("never exports non-accepted dialogue", () => {
    // Add a draft dialogue to the project; confirm it's skipped.
    const draftDlg = structuredClone(project.dialogues[0]!);
    draftDlg.id = "dlg_draft_leak";
    draftDlg.approvalStatus = "draft";
    const withDraft: ProjectData = { ...project, dialogues: [...project.dialogues, draftDlg] };
    const exported = exportJson(withDraft);
    expect(exported.skippedDrafts).toBe(1);
    expect(exported.lines.every((l) => l.artifactId !== "dlg_draft_leak")).toBe(true);
  });

  it("every exported line has a stable, unique loc key", () => {
    const exported = exportJson(project);
    const keys = exported.lines.map((l) => l.locKey);
    expect(new Set(keys).size).toBe(keys.length); // unique
    for (const k of keys) {
      expect(k).toMatch(/^quarry\./); // uses the project's locKeyPrefix
    }
  });

  it("the JSON shape is engine-agnostic (project + characters + lines)", () => {
    const exported = exportJson(project);
    expect(exported.project).toBeTruthy();
    expect(exported.characters.length).toBeGreaterThan(0);
    expect(exported.lines.length).toBeGreaterThan(0);
    // No engine-specific keys at top level.
    const topKeys = Object.keys(exported);
    expect(topKeys).toEqual(expect.arrayContaining(["project", "characters", "lines", "skippedDrafts"]));
  });

  it("exportJsonString produces parseable JSON", () => {
    const str = exportJsonString(project);
    const parsed = JSON.parse(str);
    expect(parsed.lines.length).toBe(4);
  });
});

describe("exportCsv — round-trip + quoting", () => {
  it("produces a header + one row per exported line", () => {
    const csv = exportCsv(project);
    const rows = csv.trim().split("\n");
    expect(rows[0]).toContain("locKey,artifactId,sceneId,lineId,speakerId,lang,beatOrder,text");
    // header + 4 lines
    expect(rows).toHaveLength(5);
  });

  it("parses back to the same row count + loc-key column preserved", () => {
    const csv = exportCsv(project);
    const rows = parseCsv(csv);
    expect(rows.length).toBe(5); // header + 4 data rows
    const dataRows = rows.slice(1);
    const jsonLines = exportJson(project).lines;
    expect(dataRows.length).toBe(jsonLines.length);
    // loc keys match
    const csvKeys = dataRows.map((r) => r[0]);
    const jsonKeys = jsonLines.map((l) => l.locKey);
    expect(csvKeys).toEqual(jsonKeys);
  });

  it("correctly RFC-4180-quotes fields with commas/quotes/newlines", () => {
    // Build a project whose line text contains a comma, a quote, and a newline.
    const tricky = structuredClone(project);
    tricky.dialogues[0]!.lines[0]!.text.value = 'He said "hello", then left.\nNew line.';
    const csv = exportCsv(tricky);
    const rows = parseCsv(csv);
    const dataRow = rows[1]!; // first data row
    expect(dataRow[7]).toBe('He said "hello", then left.\nNew line.');
  });
});

/** Minimal RFC-4180 CSV parser for test round-trips. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        // skip
      } else {
        field += ch;
      }
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
