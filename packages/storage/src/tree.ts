/**
 * @df/storage — on-disk project reader/writer.
 *
 * The ONLY package allowed to touch `node:fs` (enforced by ESLint boundary
 * rule, constraint #9). Reads/writes the REPO_LAYOUT §4 tree:
 *
 *   <project>/
 *     project.json
 *     canon/{world-facts,terminology,timeline}.json   (arrays)
 *     factions/<slug>.json
 *     characters/<slug>.json
 *     states/<char-slug>/<state-slug>.json
 *     relationships/<a__b>.json
 *     quests/<slug>.json
 *     scenes/<slug>.json
 *     context/<slug>.ctx.json
 *     beats/<slug>.beat.json
 *     dialogue/<slug>.dialogue.json
 *     reviews/<slug>.review.json
 *     proposals/<slug>.proposal.json
 *
 * Round-trip invariant: `writeProject(dir, readProject(dir))` is a no-op up to
 * formatting. Every file is schema-validated on read (constraint #12); a file
 * that fails validation is reported, not silently coerced.
 */

import { promises as fs } from "node:fs";
import { dirname, join, sep } from "node:path";

import {
  CanonFact,
  CanonProposal,
  CharacterProfile,
  CharacterState,
  ContextPackage,
  DialogueArtifact,
  DialogueBeatPlan,
  DialogueReview,
  FactionProfile,
  Project,
  Quest,
  RelationshipState,
  SceneSpecification,
  Terminology,
  TimelineEvent,
} from "@df/schemas";
import { z } from "zod";

type ZodTypeAny = z.ZodTypeAny;

/** All artifacts of a project, keyed for O(1) lookup by id (referential integrity). */
export interface ProjectData {
  project: Project;
  canonFacts: CanonFact[];
  terminology: Terminology[];
  timeline: TimelineEvent[];
  factions: FactionProfile[];
  characters: CharacterProfile[];
  states: CharacterState[];
  relationships: RelationshipState[];
  quests: Quest[];
  scenes: SceneSpecification[];
  contextPackages: ContextPackage[];
  beatPlans: DialogueBeatPlan[];
  dialogues: DialogueArtifact[];
  reviews: DialogueReview[];
  proposals: CanonProposal[];
}

const empty = (): ProjectData => ({
  project: undefined as unknown as Project, // set explicitly on read
  canonFacts: [],
  terminology: [],
  timeline: [],
  factions: [],
  characters: [],
  states: [],
  relationships: [],
  quests: [],
  scenes: [],
  contextPackages: [],
  beatPlans: [],
  dialogues: [],
  reviews: [],
  proposals: [],
});

/* -------------------------------------------------------------------------- */
/* Low-level file helpers                                                     */
/* -------------------------------------------------------------------------- */

async function readJson<T>(file: string, schema: ZodTypeAny, errors: string[]): Promise<T | undefined> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    errors.push(`read error ${file}: ${(e as Error).message}`);
    return undefined;
  }
  const res = schema.safeParse(raw);
  if (!res.success) {
    const first = res.error.issues[0];
    errors.push(`schema error ${file}: [${first?.code}] ${first?.path.join(".")}: ${first?.message}`);
    return undefined;
  }
  return res.data as T;
}

async function readJsonArray<T>(file: string, schema: ZodTypeAny, errors: string[]): Promise<T[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    errors.push(`read error ${file}: ${(e as Error).message}`);
    return [];
  }
  if (!Array.isArray(raw)) {
    errors.push(`schema error ${file}: expected an array`);
    return [];
  }
  const out: T[] = [];
  raw.forEach((item, i) => {
    const res = schema.safeParse(item);
    if (!res.success) {
      const first = res.error.issues[0];
      errors.push(`schema error ${file}[${i}]: [${first?.code}] ${first?.path.join(".")}: ${first?.message}`);
    } else {
      out.push(res.data as T);
    }
  });
  return out;
}

async function listJson(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return []; // missing dir = empty collection (not an error)
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const full = join(dir, entry);
    const stat = await fs.stat(full);
    if (stat.isFile()) files.push(full);
  }
  return files;
}

/** Recursively list .json files under a dir (e.g. states/<char>/*.json). */
async function listJsonDeep(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) files.push(...(await listJsonDeep(full)));
    else if (entry.endsWith(".json")) files.push(full);
  }
  return files;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  // Atomic write: write temp then rename, so a crash mid-write never leaves a
  // half-written file on disk.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

/* -------------------------------------------------------------------------- */
/* readProject                                                                */
/* -------------------------------------------------------------------------- */

export interface ReadResult {
  data: ProjectData;
  /** Non-fatal read/validation errors (per file). Empty when fully clean. */
  errors: string[];
}

export async function readProject(rootDir: string): Promise<ReadResult> {
  const errors: string[] = [];
  const data = empty();
  const j = (...p: string[]) => join(rootDir, ...p);

  // project.json (required)
  const project = await readJson<Project>(j("project.json"), Project, errors);
  if (!project) {
    errors.push("fatal: missing or invalid project.json");
    return { data, errors };
  }
  data.project = project;

  // canon arrays
  data.canonFacts = await readJsonArray<CanonFact>(j("canon", "world-facts.json"), CanonFact, errors);
  data.terminology = await readJsonArray<Terminology>(j("canon", "terminology.json"), Terminology, errors);
  data.timeline = await readJsonArray<TimelineEvent>(j("canon", "timeline.json"), TimelineEvent, errors);

  // collection dirs (one artifact per file)
  const collections: [keyof ProjectData, string, ZodTypeAny][] = [
    ["factions", "factions", FactionProfile],
    ["characters", "characters", CharacterProfile],
    ["relationships", "relationships", RelationshipState],
    ["quests", "quests", Quest],
    ["scenes", "scenes", SceneSpecification],
    ["contextPackages", "context", ContextPackage],
    ["beatPlans", "beats", DialogueBeatPlan],
    ["dialogues", "dialogue", DialogueArtifact],
    ["reviews", "reviews", DialogueReview],
    ["proposals", "proposals", CanonProposal],
  ];
  for (const [field, dir, schema] of collections) {
    for (const file of await listJson(j(dir))) {
      const item = await readJson(file, schema, errors);
      if (item) (data[field] as unknown[]).push(item);
    }
  }

  // states/ : nested per-character subfolders
  for (const file of await listJsonDeep(j("states"))) {
    const item = await readJson<CharacterState>(file, CharacterState, errors);
    if (item) data.states.push(item);
  }

  return { data, errors };
}

/* -------------------------------------------------------------------------- */
/* writeProject                                                               */
/* -------------------------------------------------------------------------- */

/** Slugify a stable id for filenames: strip the kind prefix, keep `__` subsegment. */
function idToFilename(id: string): string {
  const sep = id.indexOf("__");
  const main = sep === -1 ? id : id.slice(0, sep);
  const underscore = main.indexOf("_");
  const slug = underscore === -1 ? main : main.slice(underscore + 1);
  return sep === -1 ? slug : `${slug}.${id.slice(sep + 2).replace(/__/g, "--")}`;
}

export async function writeProject(rootDir: string, data: ProjectData): Promise<void> {
  const j = (...p: string[]) => join(rootDir, ...p);

  await writeJson(j("project.json"), data.project);
  await writeJson(j("canon", "world-facts.json"), data.canonFacts);
  await writeJson(j("canon", "terminology.json"), data.terminology);
  await writeJson(j("canon", "timeline.json"), data.timeline);

  const single: [unknown[], string, (item: { id: string }) => string][] = [
    [data.factions, "factions", (i) => idToFilename(i.id)],
    [data.characters, "characters", (i) => idToFilename(i.id)],
    [data.relationships, "relationships", (i) => idToFilename(i.id)],
    [data.quests, "quests", (i) => idToFilename(i.id)],
    [data.scenes, "scenes", (i) => idToFilename(i.id)],
    [data.contextPackages, "context", (i) => `${idToFilename(i.id)}.ctx`],
    [data.beatPlans, "beats", (i) => `${idToFilename(i.id)}.beat`],
    [data.dialogues, "dialogue", (i) => `${idToFilename(i.id)}.dialogue`],
    [data.reviews, "reviews", (i) => `${idToFilename(i.id)}.review`],
    [data.proposals, "proposals", (i) => `${idToFilename(i.id)}.proposal`],
  ];
  for (const [items, dir, name] of single) {
    for (const item of items as { id: string }[]) {
      await writeJson(j(dir, `${name(item)}.json`), item);
    }
  }

  // states/ : states/<char-slug>/<state-slug>.json
  for (const state of data.states) {
    const charSlug = idToFilename(state.characterId);
    await writeJson(j("states", charSlug, `${idToFilename(state.id)}.json`), state);
  }
}

// Re-export for callers/tests.
export { sep };
