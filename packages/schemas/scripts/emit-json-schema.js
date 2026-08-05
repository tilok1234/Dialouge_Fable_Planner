// Emit JSON Schema from the BUILT dist/ (so .js import specifiers resolve).
// Run after `tsc`:  node scripts/emit-json-schema.js
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  Project,
  CanonFact,
  FactionProfile,
  CharacterProfile,
  CharacterState,
  RelationshipState,
  Quest,
  SceneSpecification,
  DialogueBeatPlan,
  DialogueArtifact,
  DialogueReview,
  CanonProposal,
} from "../dist/index.js";

const targets = {
  Project,
  CanonFact,
  FactionProfile,
  CharacterProfile,
  CharacterState,
  RelationshipState,
  Quest,
  SceneSpecification,
  DialogueBeatPlan,
  DialogueArtifact,
  DialogueReview,
  CanonProposal,
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "json-schema");
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(targets)) {
  const json = zodToJsonSchema(schema, { name });
  const file = resolve(outDir, `${name}.schema.json`);
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log(`wrote ${file}`);
}
