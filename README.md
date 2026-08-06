# Dialogue Foundry

> A local-first, model-independent **game dialogue authoring system**.
> Status: **M0–M7 landed (MVP frame complete).** The pipeline, editor, and
> validators work end-to-end; real-model generation is opt-in via the Claude
> Code CLI (`DF_PROVIDER=claude`), otherwise a deterministic mock is used.

Dialogue Foundry does not generate dialogue from a one-line description. It
maintains a durable, inspectable model of each character — worldview, knowledge,
contradictions, relationships, voice, and changing emotional states — and
**compiles** reviewable dialogue from that model whenever a game scene requires
it. The character profile is source code; the dialogue is compiled output.

The generation pipeline is a seven-stage compiler:

```
world canon + faction + character profile + character state
        + relationship + quest state + scene purpose
        → ContextPackage → BeatPlan → Draft → Review → Repair → Approve → Artifact
```

Hard guarantees: generated dialogue never silently edits approved canon, never
overwrites locked human edits, and is never treated as game content until a
human accepts it. New lore invented during generation becomes a **canon
proposal** for review, never a silent write.

## Why it's built this way

The same boss should sound like the same boss across quests, scenes, and
sessions — dismissive before combat, offended under pressure, quietly frightened
in its final phase, and still unwilling to beg when defeated. The emotions
change; the underlying character does not. That consistency only comes from
compiling dialogue from a structured model of *who is speaking*, not from
prompting a model cold each time.

## Current state

All eight milestones (M0–M7) are merged: monorepo + core, schemas + storage,
the React editor, profile generation, dialogue generation, quest validators,
the consistency engine, and JSON/CSV export. Honesty note: the milestone
records in `milestones/` were produced during a compressed AI-driven build,
not spaced human review gates — treat them as build logs, and treat the
sample project plus the test suite as the actual evidence. The design docs
live in `docs/`:

| Deliverable | What it is |
|-------------|------------|
| `docs/PRODUCT_CONTRACT.md` | The binding product promise + 12 hard constraints. |
| `docs/NON_GOALS.md` | What v1 deliberately is *not* (a "not now" list, not "never"). |
| `docs/ARCHITECTURE.md` | The seven-stage pipeline, the six data layers, module boundaries. |
| `docs/REPO_LAYOUT.md` | The pnpm + TypeScript monorepo structure. |
| `docs/ACCEPTANCE_TESTS.md` | How each milestone M0–M7 is judged (automated tests + human gates). |
| `docs/OPEN_QUESTIONS.md` | The resolved open-questions / risks register. |
| `packages/schemas/` | 13 Zod schemas = the executable contract. **15 tests green.** |
| `packages/core/` | Stable IDs, versioning, deterministic content hashing (Q-F3), provenance. **22 tests green.** |
| `samples/quarry-project/` | A hand-authored reference project (3 characters, 5-stage quest, full pipeline trace). **23/23 artifacts validate.** |

What "complete" does NOT yet mean: the pipeline has mostly been exercised
against the deterministic `MockProvider`. The real test — whether a live
model stays in voice, produces schema-valid plans, and avoids semantic leaks
— starts now that `ClaudeCliProvider` exists. Expect the prompts and the
review gates to evolve under real output.

## Quickstart

Requires Node 20+ and pnpm 11+.

```bash
pnpm install
pnpm --filter @df/schemas run build   # @df/core tests import from schemas/dist
pnpm test                # all packages (125 tests, all offline)
pnpm run validate-samples  # re-check every sample artifact against the schemas
pnpm run emit-json-schema  # emit draft-07 JSON Schema for the 12 exportable types
pnpm run ci               # the full gate: typecheck + lint + test + validate-samples
```

No network or API key is needed for any of the above — tests and CI always
use the deterministic `MockProvider`.

### Generating with a real model (no API key)

If you have [Claude Code](https://claude.com/claude-code) installed and logged
in with a Claude subscription, the studio can generate through it — usage
bills against your subscription's limits, not per-token API pricing:

```bash
node apps/studio/main/server.js --provider claude   # backend, Opus 5
pnpm --filter studio run dev                        # UI on :5317 (2nd terminal)
```

(`DF_PROVIDER=claude` as an env var works too, on shells that support it.)
The model is pinned to `claude-opus-5`; override with `--model <id>` or
`DF_CLAUDE_MODEL`.
Subscription login is for **your own individual use** (Anthropic ToS) — anyone
else running this tool brings their own login or API key. `GET /api/health`
reports which provider is active.

The backend refuses requests from foreign browser origins, requires JSON
content-type, and only reads/writes project directories under the repo root
(extend with `DF_PROJECT_ROOT`, multiple paths joined with the OS path
delimiter).

### Preview room

The studio's **Preview room** button drops the project's characters into a
small walkable room (WASD/arrows; F to talk — lines come from accepted
dialogue artifacts, falling back to the profile's voice samples). Sprites are
served from a local asset directory (`DF_ASSET_DIR` or `--assets <dir>`)
containing `assembler-pack/` and `assembler-boss-pack/`; the assets are NOT
part of this repo (private-use license) and without them the preview uses
labeled placeholders.

## Project layout

```
.
├─ docs/                # the Phase-0 design + acceptance docs
├─ milestones/          # M0.md, M1.md, ... sign-off records
├─ packages/
│  ├─ schemas/          # @df/schemas — Zod contract (the foundation)
│  ├─ core/             # @df/core — IDs, versioning, content hashing, provenance
│  ├─ context-compiler/ # Stage 1 (M4)   generation/    # Stages 2/3/5 (M3/M4)
│  ├─ validators/       # Stage 4 (M6)   exporters/     # generic JSON (M7)
│  ├─ storage/          # fs I/O (M1)    providers/     # GLM + net (M3)
│  └─ test-fixtures/    # shared sample data (data-only)
├─ apps/studio/         # the React+Vite app (placeholder until M2)
├─ samples/quarry-project/  # the reference project + its own README
├─ tsconfig.base.json   pnpm-workspace.yaml   package.json
└─ .github/workflows/ci.yml  # Windows + Linux matrix
```

The empty `packages/*` are wired into the workspace so their dependency
boundaries are enforced from day one; their code lands in later milestones.

## For contributors — `.js` import specifiers

This repo uses **`.js` specifiers inside `.ts` source files** (e.g.
`import { x } from "./common.js"`), compiled via `tsc` with
`moduleResolution: Bundler`. This is deliberate: it works uniformly under
`tsc`, `vitest`, and the JSON-schema emit script, and produces clean ESM
output. A consequence is that you cannot run a `.ts` file directly with
`node --strip-types` without a specifier rewriter — always go through
`pnpm build` or `pnpm test`. See `docs/OPEN_QUESTIONS.md` Q-E4.

## Design principles

1. **Files are the source of truth**, not the model. The app builds a small,
   precise context package per request; it never dumps the project into a prompt.
2. **Explicit contracts over prompt magic.** State lives in inspectable JSON,
   validated by Zod at every stage boundary.
3. **Propose, never impose.** The AI produces drafts, beat plans, reviews, and
   patches. Humans accept. Nothing generated is approved until a human says so.
4. **Separate the durable from the derived.** Permanent identity is distinct
   from mutable state; dialogue is derived from sources and stored apart from
   them, recording the exact versions that produced it.
5. **Keep the AI behind an interface.** Core logic never imports a vendor
   client. The deterministic `MockProvider` is the default; `ClaudeCliProvider`
   (Claude Code CLI on your own subscription) is the first real implementation,
   and any other model can satisfy the same interface.

## The reference sample — "The Quarry Seals"

`samples/quarry-project/` is a complete miniature module that exercises every
part of the contract: a guilt-ridden quest giver, a mercantile recurring NPC,
and a three-phase boss whose central secret (`fact_golem_created_by_miners`) is
gated three ways at once — forbidden in one scene, required in another, and
unknown to the boss in its own profile. See
[`samples/quarry-project/README.md`](samples/quarry-project/README.md) for the
walkthrough.

## License

MIT — see [LICENSE](LICENSE).
