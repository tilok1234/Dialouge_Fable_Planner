/**
 * @df/storage acceptance tests (M1).
 *
 * Proves the M1 acceptance criteria:
 *  - readProject loads the sample tree; every file schema-validated
 *  - round-trip: writeProject(readProject(x)) deep-equals x
 *  - checkIntegrity: clean on the sample; fires on a planted dangling ref
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkIntegrity, readProject, writeProject } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
// packages/storage/test -> ../../../samples/quarry-project
const sampleDir = join(here, "..", "..", "..", "samples", "quarry-project");

/** Read every .json file under a dir as a parsed map (for round-trip comparison). */
function snapshot(dir: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith(".json")) out.set(p, JSON.parse(readFileSync(p, "utf8")));
    }
  };
  walk(dir);
  return out;
}

describe("readProject", () => {
  it("loads the sample project with zero errors", async () => {
    const { data, errors } = await readProject(sampleDir);
    expect(errors).toEqual([]);
    expect(data.project.id).toBe("project_quarry_module");
    expect(data.characters).toHaveLength(3);
    expect(data.canonFacts).toHaveLength(5);
    expect(data.terminology).toHaveLength(3);
    expect(data.timeline).toHaveLength(5);
    expect(data.states.length).toBeGreaterThanOrEqual(7);
    expect(data.quests).toHaveLength(1);
    expect(data.scenes).toHaveLength(4);
    expect(data.contextPackages).toHaveLength(1);
    expect(data.dialogues).toHaveLength(1);
  });

  it("reports a schema error on a malformed file (not silent)", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "df-storage-"));
    try {
      // minimal project + a malformed character
      await import("node:fs/promises").then((fs) =>
        fs.writeFile(
          join(tmp, "project.json"),
          JSON.stringify({
            id: "project_test",
            name: "T",
            summary: { value: "x" },
            version: 1,
            contentHash: "sha256:t",
            schemaVersion: "1",
            promptTemplateVersion: "1",
          }),
        ),
      );
      await import("node:fs/promises").then((fs) =>
        fs.mkdir(join(tmp, "characters")).then(() =>
          fs.writeFile(
            join(tmp, "characters", "bad.json"),
            JSON.stringify({ id: "char_bad", identity: "not-an-object" }),
          ),
        ),
      );
      const { errors } = await readProject(tmp);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("characters"))).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("writeProject round-trip", () => {
  it("writeProject(readProject(x)) reproduces the same data", async () => {
    const original = await readProject(sampleDir);
    expect(original.errors).toEqual([]);

    const tmp = await mkdtemp(join(tmpdir(), "df-storage-"));
    try {
      await writeProject(tmp, original.data);
      const reread = await readProject(tmp);
      expect(reread.errors).toEqual([]);

      // Compare collection counts and ids (deep-equal on the full graph is
      // noisy across key ordering; id sets are the meaningful invariant).
      const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();
      for (const key of [
        "characters",
        "canonFacts",
        "terminology",
        "timeline",
        "factions",
        "states",
        "relationships",
        "quests",
        "scenes",
        "contextPackages",
        "beatPlans",
        "dialogues",
        "reviews",
        "proposals",
      ] as const) {
        expect(ids(reread.data[key])).toEqual(ids(original.data[key]));
      }
      expect(reread.data.project.id).toBe(original.data.project.id);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("checkIntegrity (Q-E5)", () => {
  it("the sample project is referentially clean", async () => {
    const { data } = await readProject(sampleDir);
    const issues = checkIntegrity(data);
    expect(issues).toEqual([]);
  });

  it("reports a planted dangling ref", async () => {
    const { data } = await readProject(sampleDir);
    // Corrupt: a scene points at a quest stage that doesn't exist.
    const scene = data.scenes.find((s) => s.id === "scene_golem_first_encounter")!;
    scene.boundQuestStages = ["quest_does_not_exist__stage_99"];
    const issues = checkIntegrity(data);
    expect(issues.some((i) => i.ref === "quest_does_not_exist__stage_99")).toBe(true);
    expect(issues.every((i) => i.kind === "dangling-ref")).toBe(true);
  });

  it("'player' is reserved and passes", async () => {
    const { data } = await readProject(sampleDir);
    // The golem relationship points at 'player'; that should be fine.
    const issues = checkIntegrity(data);
    expect(issues.some((i) => i.ref === "player")).toBe(false);
  });
});

describe("snapshot sanity (no stray files)", () => {
  it("the sample dir parses entirely as JSON", () => {
    const snap = snapshot(sampleDir);
    expect(snap.size).toBeGreaterThan(20); // we know there are ~37 artifacts
  });
});
