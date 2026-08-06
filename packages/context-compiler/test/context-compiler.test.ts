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

describe("compileContext — knowledge enforcement (M11)", () => {
  it("warns when no participant knows a required fact", () => {
    const badScene = { ...scene, requiredFacts: ["fact_golem_created_by_miners"], forbiddenRevelations: [] };
    const { warnings } = compileContext(source, badScene);
    expect(warnings.some((w) => w.ref === "fact_golem_created_by_miners" && w.reason.includes("not in any participant's knowledge"))).toBe(true);
  });

  it("accepts a required fact held as a secret", () => {
    const golem = source.characters.find((c) => c.id === "char_hornblende_golem")!;
    const secretive = {
      ...source,
      characters: source.characters.map((c) =>
        c.id === golem.id
          ? { ...c, knowledge: { ...c.knowledge, knows: [], secrets: ["fact_seals_prevent_excavation"] } }
          : c,
      ),
    };
    const { warnings } = compileContext(secretive, scene);
    expect(warnings).toEqual([]);
  });

  it("accepts a required fact learned in the participant's scene state", () => {
    const stripped = {
      ...source,
      characters: source.characters.map((c) =>
        c.id === "char_hornblende_golem" ? { ...c, knowledge: { ...c.knowledge, knows: [] } } : c,
      ),
      states: source.states.map((s) =>
        s.id === "state_hornblende_golem__pre_encounter" ? { ...s, factsLearned: ["fact_seals_prevent_excavation"] } : s,
      ),
    };
    const { warnings } = compileContext(stripped, scene);
    expect(warnings).toEqual([]);
  });

  it("names the misbeliever when the fact is only in believesFalse", () => {
    const deluded = {
      ...source,
      characters: source.characters.map((c) =>
        c.id === "char_hornblende_golem"
          ? { ...c, knowledge: { ...c.knowledge, knows: [], believesFalse: ["fact_seals_prevent_excavation"] } }
          : c,
      ),
    };
    const { warnings } = compileContext(deluded, scene);
    expect(warnings.some((w) => w.reason.includes("char_hornblende_golem") && w.reason.includes("believesFalse"))).toBe(true);
  });
});

describe("compileContext — terminology (M11)", () => {
  const terms = [
    { version: 1, contentHash: "sha256:t1", term: "vein-seal", meaning: { value: "a stoneborn ward", lang: "en" }, factions: ["fac_stoneborn"], tags: [] },
    { version: 1, contentHash: "sha256:t2", term: "the Taking", meaning: { value: "the industrial mining era", lang: "en" }, factions: [], tags: [] },
    { version: 1, contentHash: "sha256:t3", term: "ledger-day", meaning: { value: "ash kingdom tax day", lang: "en" }, factions: ["fac_nowhere"], tags: [] },
  ];

  it("includes global terms and terms of the participants' factions only", () => {
    const { snapshot } = compileContext({ ...source, terminology: terms }, scene);
    const picked = snapshot.terminology.map((t) => t.term);
    expect(picked).toContain("vein-seal"); // golem is stoneborn
    expect(picked).toContain("the Taking"); // factionless = global
    expect(picked).not.toContain("ledger-day"); // unrelated faction
  });
});
