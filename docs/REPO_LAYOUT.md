# Dialogue Foundry — Repository Layout (proposed)

> Status: **Phase 0, Step D**. This is a *proposal* for the repository structure,
> awaiting your approval before any code or `package.json` is created.
> It refines the sketch in the design doc into a concrete monorepo and maps every
> directory to a responsibility in `ARCHITECTURE.md`. Names follow the GitHub
> repo: **`Dialouge_Fable_Planner`**.

This is a **pnpm + TypeScript monorepo** (apps + packages). The split enforces
the architecture's hard rule that the pipeline is pure and I/O-free: packages
that contain logic depend only on other packages and on `schemas`/`core`, never
on Node `fs` or a network client. I/O and the provider live in their own
packages behind interfaces.

---

## 1. Top level

```
Dialouge_Fable_Planner/
├─ apps/
│  └─ studio/                    # the local-first web app (React + Vite + Node service)
├─ packages/
│  ├─ schemas/                   # Zod schemas = the contract (Step E)
│  ├─ core/                      # domain types + stable IDs + versioning helpers
│  ├─ context-compiler/          # Stage 1: assemble ContextPackage (pure)
│  ├─ generation/                # Stages 2,3,5: beat plan / draft / repair orchestration (pure)
│  ├─ validators/                # Stage 4: deterministic checks + reviewer glue (pure)
│  ├─ providers/                 # DialogueAIProvider interface + GLM impl (the only network)
│  ├─ exporters/                 # generic JSON (+ later CSV / Godot-friendly) (pure)
│  ├─ storage/                   # filesystem I/O: read/write JSON project files (the only fs)
│  └─ test-fixtures/             # hand-authored sample projects used by every package's tests
├─ docs/
│  ├─ PRODUCT_CONTRACT.md        # (already written; relocate here)
│  ├─ NON_GOALS.md               # (already written; relocate here)
│  ├─ ARCHITECTURE.md            # (already written; relocate here)
│  └─ REPO_LAYOUT.md             # (already written; relocate here)
├─ samples/
│  └─ quarry-project/            # the Phase 0 sample project (Step F) as real JSON
├─ pnpm-workspace.yaml
├─ package.json                  # root: scripts, lint, format, typecheck
├─ tsconfig.base.json            # strict TS shared by all packages
├─ vitest.config.ts              # shared test runner config
├─ .gitignore
├─ .editorconfig
└─ README.md
```

### 1.1 Why monorepo, why pnpm
- **One source of truth for schemas.** Every package imports `@df/schemas`.
  There is no second copy of the contract floating around.
- **Clean dependency direction** (§3 below). The logic packages stay pure; only
  `storage` and `providers` touch the outside world.
- **pnpm workspaces** keep installs fast and disk-light, and make the
  `@df/*` package linkage trivial. (npm/yarn workspaces would also work; pnpm is
  recommended, not mandated.)

---

## 2. `apps/studio/` — the application

```
apps/studio/
├─ src/
│  ├─ main/                      # Electron-or-Node host process (file access + provider host)
│  │  ├─ server/                 # local service exposing pipeline + storage + provider
│  │  └─ ipc/                    # bridge between UI and local service
│  ├─ ui/                        # React + Vite frontend
│  │  ├─ project/                # Project & world setup screen
│  │  ├─ canon/                  # Canon fact editor
│  │  ├─ factions/               # Faction editor
│  │  ├─ characters/             # Profile editor (incl. states, relationships)
│  │  ├─ quests/                 # Quest + state-machine editor
│  │  ├─ scenes/                 # Scene spec editor (typed templates)
│  │  ├─ workspace/              # Dialogue generation workspace (beats, draft, diff, approval)
│  │  ├─ review/                 # Consistency report view
│  │  ├─ canon-inbox/            # Canon proposal inbox
│  │  └─ export/                 # Export centre
│  └─ shared/                    # types shared between main and ui
├─ public/
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
└─ package.json
```

Notes:
- The UI is a **friendly view over JSON files** (contract §9). Raw JSON remains
  editable by hand; the editor round-trips through `@df/schemas` validation.
- The host process owns the pipeline and the provider; the UI never imports
  `fs` or the GLM client directly. This keeps the provider boundary real rather
  than aspirational.
- v1 need not be Electron — a Node service + Vite dev server is enough. The
  `main/` split is structured so Electron packaging is a *later* option, not a
  rewrite.

---

## 3. `packages/` — responsibilities & allowed dependencies

Each package has one job and a strict import budget.

| Package             | Responsibility                                          | May import                                          | May NOT import            |
|---------------------|---------------------------------------------------------|-----------------------------------------------------|---------------------------|
| `schemas`           | Zod schemas = the contract; types derived from them     | `zod` only                                          | any other @df pkg, fs, net| 
| `core`              | Stable IDs, versioning, hashing, provenance helpers     | `@df/schemas`                                       | fs, net                   |
| `context-compiler`  | Stage 1: build `ContextPackage` from project data       | `@df/schemas`, `@df/core`                           | fs, net, provider         |
| `generation`        | Stages 2/3/5 orchestration via `DialogueAIProvider`     | `@df/schemas`, `@df/core`, `@df/context-compiler`   | fs, net (takes provider injected) |
| `validators`        | Stage 4: deterministic checks; AI reviewer glue         | `@df/schemas`, `@df/core`                           | fs, net (takes provider for AI tier) |
| `providers`         | `DialogueAIProvider` interface + `GlmProvider`          | `@df/schemas`, `@df/core`, `fetch`/SDK              | fs, pipeline logic        |
| `exporters`         | Generic JSON export (+ later CSV/Godot)                 | `@df/schemas`, `@df/core`                           | fs, net                   |
| `storage`           | Filesystem I/O for the JSON project layout              | `@df/schemas`, `@df/core`, `fs`                     | net, provider, pipeline   |
| `test-fixtures`     | Hand-authored sample projects                           | (data only; imports nothing)                        | —                         |

Two rules make the architecture testable and honest:
1. **No logic package imports `fs` or network.** I/O is injected. That is what
   lets `context-compiler`, `generation`, `validators`, `exporters` run under
   Vitest with fixtures and no network.
2. **`schemas` imports nothing of ours.** It is the foundation everyone trusts;
   it cannot depend on the things it validates.

---

## 4. `samples/quarry-project/` — the canonical project layout on disk

This is also the on-disk shape `@df/storage` reads and writes. Every v1 project
looks like this. (Phase 0 Step F will populate this exact tree.)

```
quarry-project/
├─ project.json                  # project id, name, schema/prompt versions, locks index
├─ canon/
│  ├─ world-facts.json           # CanonFact[]
│  ├─ terminology.json           # shared terms
│  └─ timeline.json              # dated events
├─ factions/
│  ├─ stoneborn.json             # FactionProfile
│  └─ ash-kingdom.json
├─ characters/
│  ├─ hornblende-golem.json      # CharacterProfile  (3-phase boss)
│  ├─ quarry-foreman.json        # CharacterProfile  (quest giver)
│  └─ wandering-prospector.json  # CharacterProfile  (recurring NPC)
├─ states/
│  ├─ hornblende-golem/          # one CharacterState file per named state
│  │  ├─ pre-encounter.json
│  │  ├─ phase-one.json
│  │  ├─ phase-two.json
│  │  ├─ final-phase.json
│  │  └─ defeated.json
│  ├─ quarry-foreman/
│  │  └─ default.json
│  └─ wandering-prospector/
│     ├─ first-meeting.json
│     └─ returning.json
├─ relationships/
│  └─ hornblende-golem__player.json   # RelationshipState (file name = ordered pair of IDs)
├─ quests/
│  └─ quarry-seals.json          # Quest (five-stage state machine)
├─ scenes/
│  ├─ golem-first-encounter.json # SceneSpecification (boss first encounter)
│  ├─ golem-phase-transition.json
│  ├─ golem-defeated.json
│  ├─ foreman-offer.json         # quest offer
│  ├─ foreman-progress.json
│  └─ foreman-complete.json
├─ context/                      # ContextPackage artifacts (Stage 1 output), inspectable
│  └─ golem-first-encounter.ctx.json
├─ beats/                        # DialogueBeatPlan artifacts (Stage 2 output)
│  └─ golem-first-encounter.beat.json
├─ dialogue/                     # DialogueArtifact (accepted, versioned, with provenance)
│  ├─ golem-first-encounter.dialogue.json
│  └─ foreman-offer.dialogue.json
├─ reviews/                      # DialogueReview reports (Stage 4 output)
│  └─ golem-first-encounter.review.json
├─ proposals/                    # CanonProposal inbox (pending/accepted/rejected)
│  └─ seals-built-by-miners.proposal.json
└─ exports/                      # generic JSON exports
   └─ quarry-seals.export.json
```

### 4.1 Naming conventions (stable IDs)
- **Stable IDs** are `snake_case`, prefixed by kind where helpful:
  `char_hornblende_golem`, `fac_stoneborn`, `quest_quarry_seals`,
  `scene_golem_first_encounter`, `canon_western_kingdom_collapse`,
  `fact_seals_prevent_excavation`. The exact prefix scheme is finalized in
  Step E with the schemas; the rule is *IDs are immutable once anything
  references them.*
- **File names** derive from the stable ID (minus the kind prefix) so filesystem
  lookups are trivial.
- **Relationship files** use the ordered pair `a__b.json` of the two party IDs.

### 4.2 Why so many folders (not one big JSON)
Each artifact is an addressable, versionable atom. This is what makes:
- selective regeneration cheap (rewrite one dialogue file, touch nothing else),
- Git diffs readable (one logical change = one file),
- staleness flags precise (an artifact depends on N named files by hash),
- and AI-agent/manual repairs safe (you edit exactly the thing that's wrong).

---

## 5. Tooling

- **TypeScript** strict mode everywhere (`tsconfig.base.json`). No `any` in
  `schemas`/`core`/`context-compiler`/`validators`/`exporters`.
- **Vitest** in every package; `test-fixtures` is imported as data. Tests run
  with no network and no disk writes outside a temp dir.
- **Zod** for runtime validation at every stage boundary (contract constraint
  #12). Types are inferred from schemas so there's one source of truth.
- **Prettier + ESLint** at the root; CI runs `typecheck`, `lint`, `test`.
- **`.gitignore`** ignores `node_modules/`, `dist/`, build output, and any local
  secrets (`.env`, `*.local.json`). The `GLM_API_KEY` is read from the
  environment, never stored in the repo.

## 6. Migration path from the empty repo
1. `git init` in `C:\Users\headc\Documents\Dialouge_Fable_Plan`, add the GitHub
   remote `https://github.com/tilok1234/Dialouge_Fable_Planner`.
2. Move the four `docs/` files (`PRODUCT_CONTRACT.md`, `NON_GOALS.md`,
   `ARCHITECTURE.md`, `REPO_LAYOUT.md`) into `docs/` — or keep them at root for
   Phase 0 and relocate once `apps/` and `packages/` exist. (Recommendation:
   keep at root through Phase 0 for visibility, move on M0 completion.)
3. Scaffold the monorepo skeleton (`pnpm-workspace.yaml`, root `package.json`,
   `tsconfig.base.json`, empty package folders with their own `package.json`
   + `tsconfig.json`) — this is the **first code-creation task of M0**, *not*
   part of Phase 0. Phase 0 remains documents + schemas + sample data only.

## 7. Open questions for your approval (Step H will collect these)
- **Q-D1.** Package manager: pnpm (recommended) vs npm vs yarn workspaces?
- **Q-D2.** App shell: Node service + Vite (v1, recommended) vs Electron from
  day one?
- **Q-D3.** Keep the four Phase-0 docs at repo root or move to `docs/` now?
- **Q-D4.** Stable-ID prefix scheme — confirm the `kind_...` convention above,
  or prefer unprefixed slugs?
- **Q-D5.** Should `samples/quarry-project/` live in the repo as committed
  reference data (recommended) or be generated by a seed script?

None of these block writing `REPO_LAYOUT.md`; they block the *scaffolding* that
comes in M0.
