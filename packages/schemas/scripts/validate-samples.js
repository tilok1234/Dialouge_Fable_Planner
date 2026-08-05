// Validate every JSON file in samples/quarry-project against its schema.
// Run after `tsc`:  node scripts/validate-samples.js
//
// Each file is matched to a schema by its directory (and, for the special
// pipeline artifacts, by filename suffix). A validation failure is a hard stop.
//
// Platform note: all path comparisons use posix-normalized relative paths
// (forward slashes) so behaviour is identical on Windows and Linux. The CI
// matrix caught an earlier version using a hardcoded backslash that silently
// skipped canon/world-facts.json on Windows.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as S from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..");
const samples = join(root, "samples", "quarry-project");

/** Normalize any path to forward slashes for cross-platform comparison. */
const posix = (p) => p.split("\\").join("/");

// Map a top-level directory name to a top-level schema.
// `null` means "skip / handled elsewhere".
const dirToSchema = {
  factions: S.FactionProfile,
  characters: S.CharacterProfile,
  relationships: S.RelationshipState,
  quests: S.Quest,
  scenes: S.SceneSpecification,
  beats: S.DialogueBeatPlan,
  dialogue: S.DialogueArtifact,
  reviews: S.DialogueReview,
  proposals: S.CanonProposal,
  // canon/, states/, context/ handled specially below
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

function check(file, schema, label, valueOverride) {
  const raw = valueOverride ?? JSON.parse(readFileSync(file, "utf8"));
  const res = schema.safeParse(raw);
  const rel = posix(relative(samples, file));
  if (res.success) {
    checked++;
    console.log(`ok   ${label}  ${rel}`);
  } else {
    failures.push({ file: rel, label, error: res.error });
    console.log(`FAIL ${label}  ${rel}`);
    for (const issue of res.error.issues) {
      console.log(`       -> [${issue.code}] ${issue.path.join(".")}: ${issue.message}`);
    }
  }
}

walk(samples, (file) => {
  const rel = posix(relative(samples, file)); // e.g. "canon/world-facts.json"
  const parts = rel.split("/");
  const topDir = parts[0];
  const leaf = parts[parts.length - 1];

  // project.json at root
  if (rel === "project.json") {
    return check(file, S.Project, "Project");
  }

  // canon/ : only world-facts.json is contract-validated (CanonFact[]).
  // terminology.json + timeline.json are loose helper arrays (no schema yet).
  if (topDir === "canon") {
    if (rel === "canon/world-facts.json") {
      const arr = JSON.parse(readFileSync(file, "utf8"));
      if (!Array.isArray(arr)) {
        failures.push({ file: rel, label: "CanonFact[]", error: "not an array" });
        console.log(`FAIL CanonFact[]  ${rel} (not an array)`);
        return;
      }
      arr.forEach((item, i) => check(file, S.CanonFact, `CanonFact[${i}]`, item));
    }
    return; // terminology/timeline skipped
  }

  // states/ has per-character subfolders; each leaf is a CharacterState.
  if (topDir === "states") {
    return check(file, S.CharacterState, "CharacterState");
  }

  // context/ : ContextPackage has no contract schema yet (flagged Q-F1); skip.
  if (topDir === "context") return;

  const schema = dirToSchema[topDir];
  if (schema) return check(file, schema, topDir);

  // Unknown location: fail loudly rather than silently skip.
  failures.push({ file: rel, label: "unknown", error: "no schema mapping" });
  console.log(`FAIL unknown  ${rel} (no schema mapping for dir "${topDir}", leaf "${leaf}")`);
});

console.log(`\n${checked} artifact(s) validated.`);
if (failures.length) {
  console.error(`${failures.length} file(s) failed validation.`);
  process.exit(1);
} else {
  console.log("All sample artifacts conform to the contract.");
}
