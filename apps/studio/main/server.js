// Dialogue Foundry studio — local backend service.
//
// A deliberately tiny HTTP server (no framework) that exposes @df/storage over
// JSON endpoints. Local only: binds to 127.0.0.1, no auth, no CORS gymnastics
// beyond allowing the Vite dev origin. The UI never imports node:fs; it talks
// to this service (constraint #9 — the boundary rule).
//
// Endpoints (all JSON in/out):
//   POST /api/load      { dir }                          -> { data, errors }
//   POST /api/save      { dir, project }                 -> { errors }
//   POST /api/integrity { project }                      -> { issues }
//   GET  /api/health                                     -> { ok: true }
//
// Runs against the BUILT @df/storage dist. Start after `pnpm --filter
// @df/storage build`. Port defaults to 7317; override with DF_PORT.

import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readProject, writeProject, checkIntegrity } from "@df/storage";

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

    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[studio] backend on http://127.0.0.1:${PORT}  (serving from ${here})`);
});
