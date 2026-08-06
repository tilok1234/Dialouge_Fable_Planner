// Context-compiler tests, run against the REAL quarry sample project (tests
// may use node:fs — lint override). The golem first-encounter scene is the
// contract's showcase: its central secret must come through as a forbidden id
// while the golem's full profile and phase state are resolved for the writer.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileContext, type ContextSource } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const sample = join(here, "..", "..", "..", "samples", "quarry-project");

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const readDir = (dir: string) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => readJson(join(dir, e.name)));

function loadSource(): ContextSource {
  const statesRoot = join(sample, "states");
  const states = readdirSync(statesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => readDir(join(statesRoot, e.name)));
  return {
    characters: readDir(join(sample, "characters")),
    states,
    canonFacts: readJson(join(sample, "canon", "world-facts.json")),
    factions: readDir(join(sample, "factions")),
    relationships: readDir(join(sample, "relationships")),
  };
}

const source = loadSource();
const scene = readJson(join(sample, "scenes", "golem-first-encounter.json"));

describe("compileContext — quarry sample, golem first encounter", () => {
  const { contextPackage, snapshot, warnings } = compileContext(source, scene);

  it("compiles the fully-wired sample without warnings", () => {
    expect(warnings).toEqual([]);
  });

  it("resolves every participant to a full profile and state", () => {
    expect(snapshot.participants.length).toBeGreaterThan(0);
    for (const p of snapshot.participants) {
      expect(p.profile, `profile for ${p.characterId}`).toBeDefined();
      expect(p.state, `state for ${p.stateId}`).toBeDefined();
      expect(p.profile!.voice.sampleLines.length).toBeGreaterThan(0);
    }
  });

  it("resolves permitted facts to full statements and keeps forbidden as ids only", () => {
    for (const f of snapshot.permittedFacts) {
      expect(f.statement.value.length).toBeGreaterThan(0);
    }
    expect(snapshot.forbiddenRevelations).toEqual(scene.forbiddenRevelations);
    expect(scene.forbiddenRevelations.length).toBeGreaterThan(0);
    // The secret's TEXT must not ride along in the snapshot's permitted set.
    const permittedIds = snapshot.permittedFacts.map((f) => f.id);
    for (const forbidden of snapshot.forbiddenRevelations) {
      expect(permittedIds).not.toContain(forbidden);
    }
  });

  it("passes relationship named states without raw dimension numbers (Q-E2)", () => {
    expect(snapshot.relationships.length).toBeGreaterThan(0);
    for (const r of snapshot.relationships) {
      expect(r).not.toHaveProperty("trust");
      expect(r).not.toHaveProperty("dimensions");
    }
  });

  it("emits a schema-valid ref-only ContextPackage with the scene's gating", () => {
    expect(contextPackage.id).toBe("ctx_golem_first_encounter");
    expect(contextPackage.sceneId).toBe(scene.id);
    expect(contextPackage.factsForbiddenInDialogue).toEqual(scene.forbiddenRevelations);
    // Ref-only: no embedded profile objects anywhere in the artifact.
    expect(JSON.stringify(contextPackage)).not.toContain("sampleLines");
  });

  it("hashes the selection deterministically (compiledAt excluded)", () => {
    const again = compileContext(source, scene);
    expect(again.contextPackage.contentHash).toBe(contextPackage.contentHash);
  });
});

describe("compileContext — degraded input", () => {
  it("warns (not throws) on dangling refs and still compiles", () => {
    const broken = { ...source, characters: [], factions: [] };
    const { contextPackage, snapshot, warnings } = compileContext(broken, scene);
    expect(contextPackage.sceneId).toBe(scene.id);
    expect(snapshot.participants[0]!.profile).toBeUndefined();
    expect(warnings.some((w) => w.reason.includes("profile not found"))).toBe(true);
  });
});
