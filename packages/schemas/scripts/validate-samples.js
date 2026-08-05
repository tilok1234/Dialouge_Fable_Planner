// Validate every JSON file in samples/quarry-project against its schema.
// Run after `tsc`:  node scripts/validate-samples.js
//
// Each file is matched to a schema by its directory (and, for the special
// pipeline artifacts, by filename suffix). A validation failure is a hard stop.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as S from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..");
const samples = join(root, "samples", "quarry-project");

// Map a directory name to a top-level schema. `null` means "skip / handled elsewhere".
const dirToSchema = {
  canon: null, // handled per-file below (world-facts, terminology, timeline are loose arrays)
  factions: S.FactionProfile,
  characters: S.CharacterProfile,
  states: null, // nested per-character; each leaf file is a CharacterState
  relationships: S.RelationshipState,
  quests: S.Quest,
  scenes: S.SceneSpecification,
  beats: S.DialogueBeatPlan,
  dialogue: S.DialogueArtifact,
  reviews: S.DialogueReview,
  proposals: S.CanonProposal,
  context: null, // ContextPackage has no contract schema yet (flagged Step H) — skip
};

function walk(dir, fn) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, fn);
    else if (entry.endsWith(".json")) fn(p);
  }
}

let checked = 0;
const failures = [];

function check(file, schema, label) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const res = schema.safeParse(raw);
  if (res.success) {
    checked++;
    console.log(`ok   ${label}  ${file.split("quarry-project")[1]}`);
  } else {
    failures.push({ file, label, error: res.error });
    console.log(`FAIL ${label}  ${file.split("quarry-project")[1]}`);
    for (const issue of res.error.issues) {
      console.log(`       -> [${issue.code}] ${issue.path.join(".")}: ${issue.message}`);
    }
  }
}

walk(samples, (file) => {
  const rel = file.split("quarry-project")[1].replace(/^[\\/]/, "");
  const parts = rel.split(/[\\/]/);
  const topDir = parts[0];

  // Special cases inside canon/
  if (topDir === "canon") {
    if (rel === "canon/world-facts.json") {
      // array of CanonFact
      const arr = JSON.parse(readFileSync(file, "utf8"));
      if (!Array.isArray(arr)) return failures.push({ file, label: "CanonFact[]", error: "not an array" });
      arr.forEach((item, i) => check(file, S.CanonFact, `CanonFact[${i}]`));
    }
    // terminology.json and timeline.json are loose helper arrays (not contract schemas); skip.
    return;
  }

  // states/ has per-character subfolders; each leaf is a CharacterState
  if (topDir === "states") {
    return check(file, S.CharacterState, "CharacterState");
  }

  // project.json at root
  if (rel === "project.json") {
    return check(file, S.Project, "Project");
  }

  const schema = dirToSchema[topDir];
  if (schema) return check(file, schema, schema.description ?? topDir);
  // context/ skipped on purpose (no schema yet)
});

console.log(`\n${checked} artifact(s) validated.`);
if (failures.length) {
  console.error(`${failures.length} file(s) failed validation.`);
  process.exit(1);
} else {
  console.log("All sample artifacts conform to the contract.");
}
