// Backend API acceptance test (M2).
//
// Boots the studio backend on an ephemeral port, exercises load/save/integrity
// against the real sample project. No network beyond 127.0.0.1; no React.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, beforeAll, afterAll } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const sampleDir = join(repoRoot, "samples", "quarry-project");

const PORT = String(17317 + Math.floor(Math.random() * 1000));
let serverProc;
const base = `http://127.0.0.1:${PORT}`;

async function req(path, init) {
  const res = await fetch(base + path, init);
  return { status: res.status, body: await res.json() };
}
const post = (path, body) => req(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  serverProc = spawn(process.execPath, [join(here, "server.js")], {
    // Roots: the repo (for the sample project) + the OS tmpdir (for the
    // save round-trip test). Everything else must be refused.
    env: { ...process.env, DF_PORT: PORT, DF_PROJECT_ROOT: [repoRoot, tmpdir()].join(delimiter) },
    stdio: "ignore",
  });
  // wait for health
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) return;
    } catch {
      /* server not ready yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("backend did not start");
}, 30000);

afterAll(() => serverProc?.kill());

describe("studio backend API", () => {
  it("GET /api/health", async () => {
    const { status, body } = await req("/api/health");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("loads the sample project with zero errors", async () => {
    const { status, body } = await post("/api/load", { dir: sampleDir });
    expect(status).toBe(200);
    expect(body.errors).toEqual([]);
    expect(body.data.project.id).toBe("project_quarry_module");
    expect(body.data.characters).toHaveLength(3);
  });

  it("resolves relative dirs against the repo root, not the server's cwd", async () => {
    const { status, body } = await post("/api/load", { dir: "samples/quarry-project" });
    expect(status).toBe(200);
    expect(body.data.project.id).toBe("project_quarry_module");
  });

  it("reports integrity issues for a clean project (none) and a corrupted one (some)", async () => {
    const loaded = await post("/api/load", { dir: sampleDir });
    const clean = await post("/api/integrity", { project: loaded.body.data });
    expect(clean.body.issues).toEqual([]);

    // Corrupt: point a relationship at a nonexistent party.
    const bad = structuredClone(loaded.body.data);
    bad.relationships[0].partyB = "char_does_not_exist";
    const dirty = await post("/api/integrity", { project: bad });
    expect(dirty.body.issues.some((i) => i.ref === "char_does_not_exist")).toBe(true);
  });

  it("save round-trips: load -> save -> reload yields the same data", async () => {
    const loaded = await post("/api/load", { dir: sampleDir });
    const tmp = await mkdtemp(join(tmpdir(), "df-studio-"));
    try {
      const saved = await post("/api/save", { dir: tmp, project: loaded.body.data });
      expect(saved.status).toBe(200);
      expect(saved.body.errors).toEqual([]);

      const reloaded = await post("/api/load", { dir: tmp });
      expect(reloaded.body.errors).toEqual([]);
      const ids = (xs) => xs.map((x) => x.id).sort();
      expect(ids(reloaded.body.data.characters)).toEqual(ids(loaded.body.data.characters));
      expect(ids(reloaded.body.data.scenes)).toEqual(ids(loaded.body.data.scenes));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("rejects bad requests with 400", async () => {
    const noDir = await post("/api/load", {});
    expect(noDir.status).toBe(400);
  });
});

describe("studio backend — browser hardening", () => {
  it("refuses requests from a foreign Origin (drive-by page)", async () => {
    const { status } = await req("/api/load", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ dir: sampleDir }),
    });
    expect(status).toBe(403);
  });

  it("accepts the Vite dev origin", async () => {
    const { status } = await req("/api/health", { headers: { origin: "http://localhost:5317" } });
    expect(status).toBe(200);
  });

  it("refuses a no-cors-style POST (text/plain smuggled JSON)", async () => {
    const { status } = await req("/api/save", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ dir: tmpdir(), project: {} }),
    });
    expect(status).toBe(415);
  });

  it("refuses load/save outside the allowed roots", async () => {
    const outside = join(repoRoot, "..", "some-other-folder");
    const load = await post("/api/load", { dir: outside });
    expect(load.status).toBe(403);
    const save = await post("/api/save", { dir: outside, project: { id: "x" } });
    expect(save.status).toBe(403);
  });

  it("refuses ../ escape from an allowed root", async () => {
    const escape = join(sampleDir, "..", "..", "..", "escape-target");
    const { status } = await post("/api/load", { dir: escape });
    expect(status).toBe(403);
  });

  it("sends no Access-Control-Allow-Origin header", async () => {
    const res = await fetch(base + "/api/health");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("studio backend — preview assets", () => {
  // A second server instance with DF_ASSET_DIR pointing at a fake pack tree.
  const PORT2 = String(18400 + Math.floor(Math.random() * 1000));
  const base2 = `http://127.0.0.1:${PORT2}`;
  let assetDir;
  let proc2;

  beforeAll(async () => {
    assetDir = await mkdtemp(join(tmpdir(), "df-assets-"));
    // minimal fake pack: one player sheet, one family index + sheet
    await mkdir(join(assetDir, "assembler-pack", "players"), { recursive: true });
    await mkdir(join(assetDir, "assembler-pack", "indexes"), { recursive: true });
    await mkdir(join(assetDir, "assembler-pack", "enemies", "slime"), { recursive: true });
    const png = Buffer.from("89504e470d0a1a0a", "hex"); // just a magic header; content is irrelevant
    await writeFile(join(assetDir, "assembler-pack", "players", "character-ranger.png"), png);
    await writeFile(join(assetDir, "assembler-pack", "enemies", "slime", "lime.png"), png);
    await writeFile(
      join(assetDir, "assembler-pack", "indexes", "enemy-families.json"),
      JSON.stringify({ families: [{ id: "slime", name: "Slime", default_variant: "lime", variants: [{ id: "lime", sheet: "enemies/slime/lime.png" }] }] }),
    );
    // a secret OUTSIDE the asset dir that traversal must never reach
    await writeFile(join(assetDir, "..", "df-assets-secret.json"), JSON.stringify({ secret: true }));

    proc2 = spawn(process.execPath, [join(here, "server.js")], {
      env: { ...process.env, DF_PORT: PORT2, DF_ASSET_DIR: assetDir },
      stdio: "ignore",
    });
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(base2 + "/api/health");
        if (r.ok) return;
      } catch {
        /* not ready */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("asset backend did not start");
  }, 30000);

  afterAll(async () => {
    proc2?.kill();
    await rm(assetDir, { recursive: true, force: true });
    await rm(join(assetDir, "..", "df-assets-secret.json"), { force: true });
  });

  it("health reports assets availability", async () => {
    const r = await fetch(base2 + "/api/health");
    expect((await r.json()).assets).toBe(true);
    const r0 = await fetch(base + "/api/health");
    expect((await r0.json()).assets).toBe(false);
  });

  it("assets-index lists players and enemy families", async () => {
    const r = await fetch(base2 + "/api/assets-index");
    const idx = await r.json();
    expect(idx.available).toBe(true);
    expect(idx.players).toEqual([{ id: "ranger", sheet: "assembler-pack/players/character-ranger.png" }]);
    expect(idx.enemies).toEqual([{ id: "slime", name: "Slime", sheet: "assembler-pack/enemies/slime/lime.png" }]);
  });

  it("assets-index is empty-but-ok without an asset dir", async () => {
    const r = await fetch(base + "/api/assets-index");
    const idx = await r.json();
    expect(idx.available).toBe(false);
    expect(idx.players).toEqual([]);
  });

  it("serves a sheet inside the asset dir", async () => {
    const r = await fetch(base2 + "/api/assets/assembler-pack/players/character-ranger.png");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
  });

  it("refuses traversal outside the asset dir and non-png/json types", async () => {
    const traversal = await fetch(base2 + "/api/assets/..%2Fdf-assets-secret.json");
    expect(traversal.status).toBe(403);
    const badType = await fetch(base2 + "/api/assets/assembler-pack/players/character-ranger.exe");
    expect(badType.status).toBe(403);
  });
});

describe("studio backend — generate-profile (M3, mock only — Q-A1)", () => {
  it("generates a schema-valid profile draft from a brief", async () => {
    const { status, body } = await post("/api/generate-profile", {
      brief: "ancient stone boss, proud and judicial",
      idSlug: "hollow_king",
    });
    expect(status).toBe(200);
    expect(body.draft.profile.id).toBe("char_hollow_king");
    expect(body.draft.profile.identity.gameplayRole).toBe("boss");
    expect(body.draft.canonProposals).toEqual([]);
  });

  it("rejects an empty brief with 400", async () => {
    const { status } = await post("/api/generate-profile", { brief: "   " });
    expect(status).toBe(400);
  });

  it("classifies merchant briefs to the merchant template", async () => {
    const { body } = await post("/api/generate-profile", { brief: "wandering prospector merchant" });
    expect(body.draft.profile.identity.gameplayRole).toBe("ambient-npc");
  });
});

describe("studio backend — generate-dialogue (M4, mock only)", () => {
  const scene = {
    id: "scene_test_m4",
    version: 1,
    contentHash: "sha256:m4",
    label: "M4 test",
    sceneType: "boss-first-encounter",
    participants: [{ characterId: "char_boss", stateId: "state_boss__pre", role: "speaker" }],
    purpose: { value: "Test", lang: "en" },
    requiredFacts: ["fact_one"],
    forbiddenRevelations: [],
    emotionalProgression: [{ order: 1, emotion: "judgement" }],
    maxLength: "short",
  };

  it("returns a beatPlan + draft from the two-call pipeline", async () => {
    const { status, body } = await post("/api/generate-dialogue", { scene });
    expect(status).toBe(200);
    expect(body.beatPlan.beats.length).toBeGreaterThan(0);
    expect(body.draft.lines.length).toBe(body.beatPlan.beats.length);
    expect(body.draft.approvalStatus).toBe("draft");
  });

  it("rejects a missing scene with 400", async () => {
    const { status } = await post("/api/generate-dialogue", {});
    expect(status).toBe(400);
  });

  it("compiles real context from the project (M9): profiles reach the provider", async () => {
    const loaded = await post("/api/load", { dir: sampleDir });
    const project = loaded.body.data;
    const golemScene = project.scenes.find((s) => s.id === "scene_golem_first_encounter");
    const { status, body } = await post("/api/generate-dialogue", { scene: golemScene, project });
    expect(status).toBe(200);
    expect(body.warnings).toEqual([]);
    expect(body.contextPackage.id).toBe("ctx_golem_first_encounter");
    expect(body.contextPackage.factsForbiddenInDialogue).toEqual(golemScene.forbiddenRevelations);
    // The mock voices lines from the resolved profile — the golem's own sample
    // line surfaces in the draft, proving the profile made it through Stage 1.
    const golem = project.characters.find((c) => c.id === golemScene.participants[0].characterId);
    const sampleStart = golem.voice.sampleLines[0].value.slice(0, 30);
    expect(body.draft.lines.some((l) => l.text.value.includes(sampleStart))).toBe(true);
  });
});

describe("studio backend — review + repair dialogue (M6, mock only)", () => {
  const scene = {
    id: "scene_m6", version: 1, contentHash: "sha256:m6",
    label: "M6", sceneType: "boss-first-encounter",
    participants: [{ characterId: "char_b", stateId: "state_b", role: "speaker" }],
    purpose: { value: "x", lang: "en" },
    requiredFacts: [], forbiddenRevelations: [],
    emotionalProgression: [{ order: 1, emotion: "judgement" }], maxLength: "short",
  };
  const draft = {
    id: "dlg_m6", version: 1, contentHash: "sha256:m6d",
    sceneId: "scene_m6", beatPlanId: "beat_m6", contextPackageId: "ctx_m6",
    approvalStatus: "draft",
    lines: [{ id: "l1", speakerId: "char_b", text: { value: "Foolish mortal! You dare challenge my immense power?", lang: "en" }, humanEdited: false }],
    provenance: {
      scene: { id: "scene_m6", version: 1 }, characterProfiles: [], characterStates: [],
      relationships: [], factions: [], canonSnapshot: [],
      schemaVersion: "1", promptTemplateVersion: "1",
      provider: "mock", model: "mock", reasoningEffort: "normal", generatedAt: "2026-08-06T00:00:00.000Z",
    },
    stale: false,
  };

  it("review-dialogue returns findings (AI flags the generic line)", async () => {
    const { status, body } = await post("/api/review-dialogue", { draft, scene });
    expect(status).toBe(200);
    expect(body.review.findings.length).toBeGreaterThan(0);
    expect(body.review.findings.some((f) => f.type === "generic-fantasy-phrasing")).toBe(true);
  });

  it("repair-dialogue patches the flagged line", async () => {
    const review = (await post("/api/review-dialogue", { draft, scene })).body.review;
    const { status, body } = await post("/api/repair-dialogue", { draft, review, lockedLineIds: [] });
    expect(status).toBe(200);
    expect(body.draft.lines[0].text.value).not.toContain("Foolish mortal");
  });
});

describe("studio backend — export (M7)", () => {
  it("exports JSON with accepted dialogue lines + loc keys", async () => {
    const loaded = await post("/api/load", { dir: sampleDir });
    const { status, body } = await post("/api/export", { project: loaded.body.data });
    expect(status).toBe(200);
    expect(body.json.lines.length).toBeGreaterThan(0);
    expect(body.json.lines[0].locKey).toMatch(/^quarry\./);
    expect(body.json.skippedDrafts).toBe(0);
  });

  it("exports CSV with a header row + one row per line", async () => {
    const loaded = await post("/api/load", { dir: sampleDir });
    const { status, body } = await post("/api/export", { project: loaded.body.data, format: "csv" });
    expect(status).toBe(200);
    const rows = body.csv.trim().split("\n");
    expect(rows[0]).toContain("locKey");
    // header + 4 data lines (the sample's accepted dialogue has 4 lines)
    expect(rows.length).toBe(5);
  });
});
