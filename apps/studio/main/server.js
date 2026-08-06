// Dialogue Foundry studio — local backend service.
//
// A deliberately tiny HTTP server (no framework) that exposes @df/storage over
// JSON endpoints. Local only: binds to 127.0.0.1, no auth, no CORS gymnastics
// beyond allowing the Vite dev origin. The UI never imports node:fs; it talks
// to this service (constraint #9 — the boundary rule).
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
// Q-A1: generate-profile uses ONLY the MockProvider — no API key, no network.

import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { exportJson, exportCsv } from "@df/exporters";
import { generateProfileDraft, planAndDraft, reviewDraft, repairDraft } from "@df/generation";
import { mockProvider } from "@df/providers";
import { readProject, writeProject, checkIntegrity } from "@df/storage";
import { validateQuest, validateKnowledge, simulatePlaythrough } from "@df/validators";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DF_PORT ?? 7317);

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
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(json);
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/api/health") {
      return send(res, 200, { ok: true, service: "dialogue-foundry-studio" });
    }

    if (req.method === "POST" && path === "/api/load") {
      const { dir } = await readBody(req);
      if (typeof dir !== "string") return send(res, 400, { error: "missing dir" });
      const absolute = resolve(dir);
      const result = await readProject(absolute);
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/save") {
      const { dir, project } = await readBody(req);
      if (typeof dir !== "string" || !project) return send(res, 400, { error: "missing dir or project" });
      await writeProject(resolve(dir), project);
      return send(res, 200, { errors: [] });
    }

    if (req.method === "POST" && path === "/api/integrity") {
      const { project } = await readBody(req);
      if (!project) return send(res, 400, { error: "missing project" });
      const issues = checkIntegrity(project);
      return send(res, 200, { issues });
    }

    if (req.method === "POST" && path === "/api/generate-profile") {
      // Q-A1: MockProvider only — no key, no network. Returns a DRAFT for human
      // review; nothing is persisted. The caller (UI) stages it for accept/reject.
      const { brief, idSlug } = await readBody(req);
      if (typeof brief !== "string" || !brief.trim()) {
        return send(res, 400, { error: "missing or empty brief" });
      }
      const draft = await generateProfileDraft(mockProvider, { brief, idSlug });
      return send(res, 200, { draft });
    }

    if (req.method === "POST" && path === "/api/generate-dialogue") {
      // Q-A1: MockProvider only. Two-call pipeline (plan then draft) with the
      // forbidden-facts knowledge gate. Returns a beatPlan + draft for review;
      // nothing persisted. Throws -> 500 if the gate rejects (forbidden leak)
      // or the provider output is invalid.
      const { scene, contextPackage } = await readBody(req);
      if (!scene) return send(res, 400, { error: "missing scene" });
      const result = await planAndDraft(mockProvider, scene, contextPackage ?? {});
      return send(res, 200, result);
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
      const result = await reviewDraft(mockProvider, { draft, scene, contextPackage: contextPackage ?? {}, previousDraft });
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/repair-dialogue") {
      // M6: apply suggested repairs, preserving locked lines. Returns patched draft.
      const { draft, review, lockedLineIds } = await readBody(req);
      if (!draft || !review) return send(res, 400, { error: "missing draft or review" });
      const result = await repairDraft(mockProvider, { draft, review, lockedLineIds: lockedLineIds ?? [] });
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
  console.log(`[studio] backend on http://127.0.0.1:${PORT}  (serving from ${here})`);
});
