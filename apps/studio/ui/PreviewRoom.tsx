// Preview room — walk a tiny room with the project's characters placed as
// sprites; press F to talk. This is a *feel test*, not a game: does this NPC
// read right when you walk up to them and their lines come at you one by one?
//
// Sprites come from the local asset packs the backend serves via /api/assets
// (players + 57 enemy families at 24px, 13 bosses at 48px). No asset dir
// configured → characters render as labeled placeholder tiles, everything
// else still works. Sprite choice: auto-assigned by role + stable hash of the
// character id, overridable per character (persisted in localStorage).
//
// Dialogue on F: the character's lines from the project's dialogue artifacts
// (accepted first), falling back to the profile's voice sampleLines.

import type { ProjectData } from "@df/storage";
import { useEffect, useMemo, useRef, useState } from "react";

/* ---------------------------------------------------------------- */
/* Sheet contracts (from the packs' manifests)                      */
/* ---------------------------------------------------------------- */

// people sheets: 288x96, 24px cells, rows down/left/right/up,
// idle cols 0-1 (420ms), walk cols 2-5 (150ms).
const CELL = 24;
const ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
// boss idle sheets: 96x192 = 2 cols x 4 rows of 48px, same row order.
const BOSS_CELL = 48;

const TILE = 32;
const COLS = 26;
const ROWS = 15;
const SCALE = 2;
const W = COLS * TILE;
const H = ROWS * TILE;

type Dir = keyof typeof ROW;

interface SpriteRef {
  kind: "player" | "enemy" | "boss" | "none";
  sheet: string; // /api/assets/ relative path
}

interface AssetIndex {
  available: boolean;
  players: { id: string; sheet: string }[];
  enemies: { id: string; name: string; sheet: string }[];
  bosses: { id: string; sheet: string }[];
}

interface Npc {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  sprite: SpriteRef;
  lines: { speaker: string; text: string }[];
}

interface Props {
  project: ProjectData;
  onClose: () => void;
}

/** Stable tiny hash so the same character always gets the same sprite. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Families that read as "person you can talk to" get preference for NPCs. */
const HUMANOID = ["villager", "elf", "dwarf", "bandit", "cultist", "knight", "monk", "noble", "peasant", "merchant", "wizard", "hunter"];

function autoSprite(charId: string, role: string, index: AssetIndex): SpriteRef {
  if (!index.available) return { kind: "none", sheet: "" };
  if (role === "boss" && index.bosses.length > 0) {
    const b = index.bosses[hash(charId) % index.bosses.length]!;
    return { kind: "boss", sheet: b.sheet };
  }
  if (index.enemies.length > 0) {
    const humanoids = index.enemies.filter((e) => HUMANOID.includes(e.id));
    const pool = humanoids.length > 0 ? humanoids : index.enemies;
    const e = pool[hash(charId) % pool.length]!;
    return { kind: "enemy", sheet: e.sheet };
  }
  return { kind: "none", sheet: "" };
}

/** The character's speakable lines: accepted artifacts first, then drafts, then voice samples. */
function linesFor(project: ProjectData, charId: string, name: string): { speaker: string; text: string }[] {
  const fromArtifacts = [...project.dialogues]
    .sort((a, b) => (a.approvalStatus === "accepted" ? -1 : 0) - (b.approvalStatus === "accepted" ? -1 : 0))
    .flatMap((d) => d.lines.filter((l) => l.speakerId === charId).map((l) => ({ speaker: name, text: l.text.value })));
  if (fromArtifacts.length > 0) return fromArtifacts;
  const profile = project.characters.find((c) => c.id === charId);
  return (profile?.voice.sampleLines ?? []).map((s) => ({ speaker: `${name} (voice sample)`, text: s.value }));
}

export function PreviewRoom({ project, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [index, setIndex] = useState<AssetIndex>({ available: false, players: [], enemies: [], bosses: [] });
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`df-preview-sprites-${project.project.id}`) ?? "{}");
    } catch {
      return {};
    }
  });
  const [talking, setTalking] = useState<{ npc: Npc; line: number } | null>(null);
  const talkingRef = useRef(talking);
  talkingRef.current = talking;

  useEffect(() => {
    void fetch("/api/assets-index").then(async (r) => setIndex(await r.json())).catch(() => undefined);
  }, []);

  function setOverride(charId: string, value: string) {
    const next = { ...overrides };
    if (value === "auto") delete next[charId];
    else next[charId] = value;
    setOverrides(next);
    localStorage.setItem(`df-preview-sprites-${project.project.id}`, JSON.stringify(next));
  }

  /** Option value encoding: "kind:sheet". */
  function resolveSprite(charId: string, role: string): SpriteRef {
    const o = overrides[charId];
    if (o) {
      const sep = o.indexOf(":");
      return { kind: o.slice(0, sep) as SpriteRef["kind"], sheet: o.slice(sep + 1) };
    }
    return autoSprite(charId, role, index);
  }

  const npcs: Npc[] = useMemo(() => {
    const placed = project.characters.map((c, i) => {
      const cx = W * 0.25 + (i % 4) * W * 0.17;
      const cy = H * 0.3 + Math.floor(i / 4) * H * 0.28;
      return {
        id: c.id,
        name: c.identity.name,
        role: c.identity.gameplayRole,
        x: cx,
        y: cy,
        sprite: resolveSprite(c.id, c.identity.gameplayRole),
        lines: linesFor(project, c.id, c.identity.name),
      };
    });
    return placed;
  }, [project, index, overrides]);
  const npcsRef = useRef(npcs);
  npcsRef.current = npcs;

  // The whole simulation lives in one effect: input, movement, draw loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const images = new Map<string, HTMLImageElement>();
    const img = (sheet: string) => {
      let el = images.get(sheet);
      if (!el) {
        el = new Image();
        el.src = `/api/assets/${sheet}`;
        images.set(sheet, el);
      }
      return el;
    };

    const playerSheet = index.players.find((p) => p.id === "ranger") ?? index.players[0];
    const player = { x: W / 2, y: H * 0.78, dir: "up" as Dir, moving: false };
    const keys = new Set<string>();
    const SPEED = 2.4;
    const PAD = TILE + 8; // wall thickness + margin

    function nearestNpc(): Npc | null {
      let best: Npc | null = null;
      let bestD = 46;
      for (const n of npcsRef.current) {
        const d = Math.hypot(n.x - player.x, n.y - player.y);
        if (d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "f", "F"].includes(e.key)) e.preventDefault();
      if (e.key === "Escape") {
        if (talkingRef.current) setTalking(null);
        else onClose();
        return;
      }
      if (e.key === "f" || e.key === "F" || e.key === " ") {
        const t = talkingRef.current;
        if (t) {
          // advance; past the last line closes the box
          setTalking(t.line + 1 < t.npc.lines.length ? { npc: t.npc, line: t.line + 1 } : null);
        } else {
          const n = nearestNpc();
          if (n) setTalking({ npc: n, line: 0 });
        }
        return;
      }
      keys.add(e.key.toLowerCase());
    }
    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.key.toLowerCase());
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;

    function drawSheetSprite(sprite: SpriteRef, x: number, y: number, dir: Dir, moving: boolean, now: number, label: string) {
      if (!ctx) return;
      if (sprite.kind === "none" || !img(sprite.sheet).complete || img(sprite.sheet).naturalWidth === 0) {
        // Placeholder: a labeled tile, so the preview works asset-less.
        ctx.fillStyle = "#3b4a6b";
        ctx.fillRect(x - 12, y - 20, 24, 28);
        ctx.fillStyle = "#dce3f2";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(label.slice(0, 10), x, y + 20);
        return;
      }
      const el = img(sprite.sheet);
      if (sprite.kind === "boss") {
        const frame = Math.floor(now / 420) % 2;
        const size = BOSS_CELL;
        ctx.drawImage(el, frame * size, ROW[dir] * size, size, size, x - size, y - size * 1.6, size * SCALE, size * SCALE);
      } else {
        const frame = moving ? 2 + (Math.floor(now / 150) % 4) : Math.floor(now / 420) % 2;
        ctx.drawImage(el, frame * CELL, ROW[dir] * CELL, CELL, CELL, x - CELL, y - CELL * 1.5, CELL * SCALE, CELL * SCALE);
      }
    }

    function frame(now: number) {
      // input → movement (frozen while a dialogue box is open)
      if (!talkingRef.current) {
        let dx = 0;
        let dy = 0;
        if (keys.has("w") || keys.has("arrowup")) dy -= 1;
        if (keys.has("s") || keys.has("arrowdown")) dy += 1;
        if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
        if (keys.has("d") || keys.has("arrowright")) dx += 1;
        player.moving = dx !== 0 || dy !== 0;
        if (player.moving) {
          const len = Math.hypot(dx, dy);
          player.x = Math.min(W - PAD, Math.max(PAD, player.x + (dx / len) * SPEED));
          player.y = Math.min(H - PAD, Math.max(PAD, player.y + (dy / len) * SPEED));
          player.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        }
      } else {
        player.moving = false;
      }

      // room: floor + walls, plain tiles (tileforge integration is future work)
      if (!ctx) return;
      for (let ty = 0; ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const wall = tx === 0 || ty === 0 || tx === COLS - 1 || ty === ROWS - 1;
          ctx.fillStyle = wall ? "#2a2f3e" : (tx + ty) % 2 === 0 ? "#4a5568" : "#465063";
          ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }

      // npcs (y-sorted with the player for painterly overlap)
      const drawables = [
        ...npcsRef.current.map((n) => ({ y: n.y, draw: () => drawSheetSprite(n.sprite, n.x, n.y, "down" as Dir, false, now, n.name) })),
        {
          y: player.y,
          draw: () =>
            drawSheetSprite(
              playerSheet ? { kind: "player", sheet: playerSheet.sheet } : { kind: "none", sheet: "" },
              player.x,
              player.y,
              player.dir,
              player.moving,
              now,
              "you",
            ),
        },
      ].sort((a, b) => a.y - b.y);
      for (const d of drawables) d.draw();

      // interaction hint
      const near = talkingRef.current ? null : nearestNpc();
      if (near) {
        ctx.fillStyle = "#ffe08a";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`[F] talk to ${near.name}`, near.x, near.y - 58);
      }

      // name labels
      ctx.fillStyle = "rgba(220,227,242,0.75)";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      for (const n of npcsRef.current) ctx.fillText(n.name, n.x, n.y + 16);

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [index]);

  const spriteOptions = useMemo(
    () => [
      { value: "auto", label: "auto" },
      ...index.bosses.map((b) => ({ value: `boss:${b.sheet}`, label: `boss: ${b.id}` })),
      ...index.enemies.map((e) => ({ value: `enemy:${e.sheet}`, label: `npc: ${e.name}` })),
    ],
    [index],
  );

  const current = talking?.npc.lines[talking.line];

  return (
    <div className="preview-room" style={{ position: "relative", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Preview room</h2>
        <span className="muted">WASD/arrows move · F talk/advance · Esc close</span>
        {!index.available && <span className="err">no asset dir — placeholder sprites (set DF_ASSET_DIR)</span>}
        <button style={{ marginLeft: "auto" }} onClick={onClose}>
          Back to editor
        </button>
      </div>

      <div style={{ position: "relative", width: W, maxWidth: "100%" }}>
        <canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", imageRendering: "pixelated", border: "1px solid #2a2f3e", borderRadius: 4 }} />
        {talking && current && (
          <div
            style={{
              position: "absolute",
              left: "4%",
              right: "4%",
              bottom: "5%",
              background: "rgba(12,14,20,0.92)",
              border: "1px solid #4a5568",
              borderRadius: 6,
              padding: "10px 14px",
              fontFamily: "monospace",
            }}
          >
            <div style={{ color: "#ffe08a", marginBottom: 4 }}>{current.speaker}</div>
            <div>{current.text}</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
              {talking.line + 1}/{talking.npc.lines.length} — [F] next · [Esc] leave
            </div>
          </div>
        )}
        {talking && !current && (
          <div style={{ position: "absolute", left: "4%", bottom: "5%", padding: 8 }} className="muted">
            {talking.npc.name} has nothing to say (no dialogue lines or voice samples yet).
          </div>
        )}
      </div>

      <details style={{ marginTop: 10 }}>
        <summary className="muted">Sprite assignments ({project.characters.length} characters)</summary>
        <table>
          <tbody>
            {project.characters.map((c) => (
              <tr key={c.id}>
                <td style={{ paddingRight: 12 }}>{c.identity.name}</td>
                <td className="muted" style={{ paddingRight: 12 }}>{c.identity.gameplayRole}</td>
                <td>
                  <select value={overrides[c.id] ?? "auto"} onChange={(e) => setOverride(c.id, e.target.value)}>
                    {spriteOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
