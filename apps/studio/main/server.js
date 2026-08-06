// Dialogue Foundry studio — local backend service.
//
// A deliberately tiny HTTP server (no framework) that exposes @df/storage over
// JSON endpoints. Local only: binds to 127.0.0.1, no auth. The UI reaches it
// through the Vite dev proxy (same origin), so the server sends NO CORS
// headers: a cross-origin page that fetches this port gets an opaque failure.
// The UI never imports node:fs; it talks to this service (constraint #9).
//
// Browser hardening (localhost binding alone does not stop the user's own
// browser from being used against them):
//  - Requests carrying an Origin header not in the allowlist are refused
//    (403) BEFORE the body is read — a drive-by page can't trigger side
//    effects even with a no-cors POST.
//  - POST bodies must be `application/json` (415 otherwise) — a cross-origin
//    page can't send that content-type without a CORS preflight, which fails.
//  - /api/load and /api/save resolve `dir` and refuse anything outside the
//    allowed roots (repo root by default; extend via DF_PROJECT_ROOT, which
//    accepts multiple paths joined with the OS path delimiter).
//
// Endpoints (all JSON in/out):
//   POST /api/load              { dir }                          -> { data, errors }
//   POST /api/save              { dir, project }                 -> { errors }
//   POST /api/integrity         { project }                      -> { issues }
//   POST /api/generate-profile  { brief, idSlug? }               -> { draft } | { error }
//   POST /api/generate-dialogue { scene, contextPackage? }       -> { beatPlan, draft } | { error }
//   POST /api/validate-quest   { quest, scenes? }                -> { issues, branches }
//   POST /api/review-dialogue  { draft, scene, contextPackage? } -> { review }
//   POST /api/repair-dialogue  { draft, review, lockedLineIds? } -> { draft }
//   POST /api/export           { project, format?: 'json'|'csv' } -> { json } | { csv }
//   GET  /api/health                                             -> { ok: true }
//
// Runs against the BUILT @df/storage dist. Start after `pnpm --filter
// @df/storage build`. Port defaults to 7317; override with DF_PORT.
//
// Provider selection: MockProvider by default (offline, deterministic).
// Set DF_PROVIDER=claude to use the Claude Code CLI on your subscription
// (model pinned to claude-opus-5 unless DF_CLAUDE_MODEL overrides it).

import { createServer } from "node:http";
import { delimiter, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileContext } from "@df/context-compiler";
import { exportJson, exportCsv } from "@df/exporters";
import { generateProfileDraft, planAndDraft, reviewDraft, repairDraft } from "@df/generation";
import { mockProvider, ClaudeCliProvider } from "@df/providers";
import { readProject, writeProject, checkIntegrity } from "@df/storage";
import { validateQuest, validateKnowledge, simulatePlaythrough } from "@df/validators";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DF_PORT ?? 7317);
const VITE_PORT = Number(process.env.DF_VITE_PORT ?? 5317);

// Provider comes from `--provider claude` / `--provider=claude` (friendlier
// on Windows, where FOO=bar prefixes don't work) or the DF_PROVIDER env var.
const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

const providerName = flag("provider") ?? process.env.DF_PROVIDER ?? "mock";
if (!["mock", "claude"].includes(providerName)) {
  console.error(`[studio] unknown provider "${providerName}" (use mock or claude)`);
  process.exit(1);
}
const provider =
  providerName === "claude"
    ? new ClaudeCliProvider({ model: flag("model") ?? process.env.DF_CLAUDE_MODEL })
    : mockProvider;

// Origins allowed to make requests (the Vite dev UI, plus DF_ALLOW_ORIGIN).
// Requests with NO Origin header (curl, tests, local scripts) are allowed —
// they aren't a browser and can already do anything this server can.
const ALLOWED_ORIGINS = new Set(
  [
    `http://localhost:${VITE_PORT}`,
    `http://127.0.0.1:${VITE_PORT}`,
    process.env.DF_ALLOW_ORIGIN,
  ].filter(Boolean),
);

// Filesystem roots /api/load and /api/save may touch.
const ALLOWED_ROOTS = (process.env.DF_PROJECT_ROOT ?? "")
  .split(delimiter)
  .filter(Boolean)
  .map((p) => resolve(p));
if (ALLOWED_ROOTS.length === 0) ALLOWED_ROOTS.push(resolve(here, "..", "..", ".."));

function insideAllowedRoots(absolute) {
  return ALLOWED_ROOTS.some((root) => {
    const rel = relative(root, absolute);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
}

// Resolve a client-supplied dir. Relative paths resolve against the FIRST
// allowed root (the repo root by default), never against process.cwd() —
// the server must behave the same no matter which directory launched it.
function resolveDir(dir) {
  return isAbsolute(dir) ? resolve(dir) : resolve(ALLOWED_ROOTS[0], dir);
}

/** Read and parse a JSON request body. */
function readBody(req) {
  return new Promise((fulfil, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        fulfil(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  // Deliberately NO Access-Control-Allow-Origin: browser pages on other
  // origins must not be able to read responses. The UI is same-origin via
  // the Vite proxy and needs no CORS.
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

const server = createServer(async (req, res) => {
  // Refuse cross-origin browser requests before touching the body. A no-cors
  // POST from a web page always carries its Origin; requests without one
  // come from non-browser clients (curl, tests, the Vite proxy passes the
  // UI's own origin through).
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return send(res, 403, { error: `origin not allowed: ${origin}` });
  }
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "POST" && !/^application\/json\b/.test(req.headers["content-type"] ?? "")) {
    return send(res, 415, { error: "content-type must be application/json" });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/api/health") {
      return send(res, 200, { ok: true, service: "dialogue-foundry-studio", provider: provider.id });
    }

    if (req.method === "POST" && path === "/api/load") {
      const { dir } = await readBody(req);
      if (typeof dir !== "string") return send(res, 400, { error: "missing dir" });
      const absolute = resolveDir(dir);
      if (!insideAllowedRoots(absolute)) {
        return send(res, 403, { error: "dir is outside the allowed project roots (set DF_PROJECT_ROOT to extend)" });
      }
      const result = await readProject(absolute);
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/save") {
      const { dir, project } = await readBody(req);
      if (typeof dir !== "string" || !project) return send(res, 400, { error: "missing dir or project" });
      const absolute = resolveDir(dir);
      if (!insideAllowedRoots(absolute)) {
        return send(res, 403, { error: "dir is outside the allowed project roots (set DF_PROJECT_ROOT to extend)" });
      }
      await writeProject(absolute, project);
      return send(res, 200, { errors: [] });
    }

    if (req.method === "POST" && path === "/api/integrity") {
      const { project } = await readBody(req);
      if (!project) return send(res, 400, { error: "missing project" });
      const issues = checkIntegrity(project);
      return send(res, 200, { issues });
    }

    if (req.method === "POST" && path === "/api/generate-profile") {
      // Returns a DRAFT for human review; nothing is persisted. The caller
      // (UI) stages it for accept/reject. Provider per DF_PROVIDER.
      const { brief, idSlug } = await readBody(req);
      if (typeof brief !== "string" || !brief.trim()) {
        return send(res, 400, { error: "missing or empty brief" });
      }
      const draft = await generateProfileDraft(provider, { brief, idSlug });
      return send(res, 200, { draft });
    }

    if (req.method === "POST" && path === "/api/generate-dialogue") {
      // Two-call pipeline (plan then draft) with the forbidden-facts gate.
      // Returns a beatPlan + draft for review; nothing persisted. Throws ->
      // 500 if the gate rejects (forbidden leak) or the output is invalid.
      //
      // When the caller sends the loaded `project`, Stage 1 runs first: the
      // context compiler resolves participants' profiles/states, permitted
      // fact statements, factions, and relationship named states, and the
      // provider writes from THAT — not from a bare scene. The ref-only
      // ContextPackage + compile warnings come back for inspection.
      const { scene, project, contextPackage } = await readBody(req);
      if (!scene) return send(res, 400, { error: "missing scene" });
      let snapshot = contextPackage ?? {};
      let compiled = null;
      let warnings = [];
      if (project) {
        const compileResult = compileContext(
          {
            characters: project.characters ?? [],
            states: project.states ?? [],
            canonFacts: project.canonFacts ?? [],
            factions: project.factions ?? [],
            relationships: project.relationships ?? [],
          },
          scene,
        );
        snapshot = compileResult.snapshot;
        compiled = compileResult.contextPackage;
        warnings = compileResult.warnings;
      }
      const result = await planAndDraft(provider, scene, snapshot);
      return send(res, 200, { ...result, contextPackage: compiled, warnings });
    }

    if (req.method === "POST" && path === "/api/validate-quest") {
      // M5: run all three quest validators (structure, knowledge progression,
      // playthrough). Returns combined issues + branch traces. Pure, no I/O.
      const { quest, scenes } = await readBody(req);
      if (!quest) return send(res, 400, { error: "missing quest" });
      const structure = validateQuest(quest);
      const knowledge = validateKnowledge(quest, scenes ?? []);
      const playthrough = simulatePlaythrough(quest);
      return send(res, 200, {
        issues: [...structure.issues, ...knowledge.issues, ...playthrough.issues],
        branches: playthrough.branches,
      });
    }

    if (req.method === "POST" && path === "/api/review-dialogue") {
      // M6: deterministic + AI-assisted review of a draft. Returns a DialogueReview.
      const { draft, scene, contextPackage, previousDraft } = await readBody(req);
      if (!draft || !scene) return send(res, 400, { error: "missing draft or scene" });
      const result = await reviewDraft(provider, { draft, scene, contextPackage: contextPackage ?? {}, previousDraft });
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/repair-dialogue") {
      // M6: apply suggested repairs, preserving locked lines. Returns patched draft.
      const { draft, review, lockedLineIds } = await readBody(req);
      if (!draft || !review) return send(res, 400, { error: "missing draft or review" });
      const result = await repairDraft(provider, { draft, review, lockedLineIds: lockedLineIds ?? [] });
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/export") {
      // M7: generic JSON + CSV export. Only accepted dialogue leaves the tool.
      const { project, format } = await readBody(req);
      if (!project) return send(res, 400, { error: "missing project" });
      if (format === "csv") {
        return send(res, 200, { csv: exportCsv(project) });
      }
      return send(res, 200, { json: exportJson(project) });
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[studio] backend on http://127.0.0.1:${PORT}  provider=${provider.id}${provider.model ? ` model=${provider.model}` : ""}`);
});
