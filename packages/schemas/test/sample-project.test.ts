/**
 * Ensures the sample project at samples/quarry-project always conforms to the
 * contract schemas. This is the gate for Phase 0 Step F and milestone M1:
 * "the schemas can represent a boss, quest giver and ordinary NPC without
 * awkward workarounds."
 *
 * The validator script is the single source of truth; this test just invokes
 * it and asserts a zero exit. Keeps the JSON files honest under CI.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

describe("sample project conforms to the contract", () => {
  it("validate-samples.js exits 0 (all artifacts parse)", () => {
    // The script runs `tsc` then validates; we call the built dist directly to
    // avoid a slow compile on every test run. If dist is missing, this fails
    // loudly — which is what we want.
    const script = resolve(here, "..", "scripts", "validate-samples.js");
    expect(() => {
      execFileSync(process.execPath, [script], { cwd: repoRoot, stdio: "pipe" });
    }).not.toThrow();
  });

  it("the sample project contains the required MVP cast", () => {
    // Smoke-check the directory shape mandated by REPO_LAYOUT §4.
    const join = (...p: string[]) => resolve(repoRoot, "samples", "quarry-project", ...p);
    const must = [
      "project.json",
      "characters/hornblende-golem.json",
      "characters/quarry-foreman.json",
      "characters/wandering-prospector.json",
      "quests/quarry-seals.json",
      "scenes/golem-first-encounter.json",
      "scenes/golem-defeated.json",
      "scenes/foreman-offer.json",
      "dialogue/golem-first-encounter.dialogue.json",
    ];
    for (const rel of must) {
      expect(existsSync(join(rel)), `missing ${rel}`).true;
    }
  });
});
