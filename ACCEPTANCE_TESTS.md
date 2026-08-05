# Dialogue Foundry — Acceptance Tests & Human Review Gates

> Status: **Phase 0, Step G**. This document defines how we know each milestone
> is *done*. It binds the design doc's "Human gate: …" lines to concrete,
> runnable acceptance tests, and names the human-only judgements that no test
> can substitute for.
>
> Rule of thumb: **a milestone is not complete until (a) its automated
> acceptance tests pass AND (b) its named human gate is signed off.** A green
> test suite alone never advances a milestone.

---

## 1. The two kinds of acceptance

| Kind | What it proves | Who/what decides |
|------|----------------|------------------|
| **Automated acceptance test** | A specific, falsifiable claim about behaviour holds. Runs in CI. | Vitest / the suite |
| **Human review gate** | A judgement the contract says a human must make (voice quality, narrative fit, "does this feel right"). | The author, recorded in the milestone's gate log |

Automated tests are necessary; they are never sufficient for this product.
Dialogue *quality* is a human gate by definition. The tests exist to free the
human's attention for the judgements only they can make.

## 2. Test taxonomy

Every acceptance test carries a tag so the gate mapping is unambiguous:

- `[schema]` — validates data shape against `@df/schemas`.
- `[unit]` — a pure function under `packages/*`, no I/O, no network.
- [`pipeline]` — drives one or more Stage-1..7 stages with fixtures.
- `[contract]` — proves a hard constraint from `PRODUCT_CONTRACT.md` §9 holds.
- `[fixture]` — exercises the `samples/quarry-project` reference data.
- `[golden]` — compares against an approved, committed "golden" output. Goldens
  are versioned with the prompt-template; a golden change is a review event.

Tests tagged `[network]` (anything hitting the provider) are **not acceptance
tests** — they're integration smoke tests, skipped in CI by default, run
manually with a live `GLM_API_KEY`. Acceptance tests must pass with **no
network and no secrets**.

## 3. The 12 hard-constraint acceptance tests (contract §9)

These are the non-negotiables. Each constraint gets at least one test; most get
a fixture-based and a property-based variant. They live in
`packages/validators/test/contract.test.ts` (and friends) as those packages
land.

| # | Constraint (contract §9) | Test |
|---|--------------------------|------|
| 1 | Canonical data in human-readable JSON | `[fixture]` every artifact in `samples/` is a `.json` file parseable as plain JSON. |
| 2 | Generation never silently modifies canon | `[pipeline]` run Stage 3 on `scene_golem_first_encounter`; assert `samples/.../canon/*` byte-identical before/after. |
| 3 | New lore becomes a proposal, not an edit | `[pipeline]` inject a missing-fact need; assert a `CanonProposal` is produced AND no canon file changed; assert proposal `status==pending`. |
| 4 | Permanent profile ≠ mutable state | `[schema]` `CharacterProfile` and `CharacterState` share no field names; a state cannot carry identity fields. |
| 5 | Six disjoint knowledge categories | `[schema]` `KnowledgeModel` has exactly the six buckets; `[contract]` a fact id appears in at most one bucket per character (set intersection empty). |
| 6 | Dialogue references exact versions | `[schema]` `DialogueArtifact.provenance` requires scene + schemaVersion + promptTemplateVersion + provider + model + generatedAt. |
| 7 | Everything lockable | `[schema]` `DialogueLine.lock`, `Project.locks`, profile-field locks all validate; `[contract]` a hard-locked line is byte-identical after a regeneration patch. |
| 8 | Regeneration = patch + approval, never silent overwrite | `[pipeline]` request regen of an *accepted* artifact; assert output is a `DialoguePatch` with `approvalStatus!='accepted'` until human accept. |
| 9 | Provider-independent, GLM first | `[unit]` `generation`/`validators` import only the `DialogueAIProvider` interface, never a vendor client (enforced by an ESLint `no-restricted-imports` rule). |
| 10 | Offline authoring tool, no runtime AI | `[contract]` no package under `packages/` imports a long-lived model connection; the provider is created per-request and torn down. |
| 11 | First export is generic JSON | `[unit]` `exporters` produces a JSON file whose top level is engine-agnostic (no Unity/Godot/Unreal keys). |
| 12 | Validate before store | `[pipeline]` Stage 3 output with a deliberately broken field is rejected (parse throws) and **no** artifact file is written. |

Constraint #5 (disjoint buckets) and constraint #2/#3 (canon integrity) are the
two the design doc treats as load-bearing; they get the most tests.

## 4. Milestone acceptance — M0 through M7

Each milestone below lists: **(a)** the deliverables, **(b)** the automated
acceptance tests that must pass, **(c)** the human gate (the design doc's
"Human gate: …" line, expanded), and **(d)** the sign-off record.

### Phase 0 (pre-M0) — Product contract, schemas, sample, gates
- **Deliverables:** `PRODUCT_CONTRACT.md`, `NON_GOALS.md`, `ARCHITECTURE.md`,
  `REPO_LAYOUT.md`, the 13 schemas, the sample project, this file, and Step H's
  open-questions register.
- **Automated:** `@df/schemas` builds; 13 schema tests pass; sample-project
  validator reports 23/23 artifacts conform; JSON Schema emitted for all 12
  exportable schemas.
- **Human gate:** *You approve the product promise, non-goals, architecture,
  repo layout, and the schema decisions flagged in Step H.* Nothing in M0 may
  contradict an approved Phase-0 document.
- **Status:** ✅ documents + schemas + sample complete and green (2026-08-05);
  ⏳ awaiting your sign-off and Step H resolution.

### M0 — Product contract (formal) + scaffolding
- **Deliverables:** the pnpm monorepo skeleton (`apps/studio`, all `packages/*`
  with `package.json`/`tsconfig.json`), `tsconfig.base.json`, root
  `package.json` scripts, CI config, `.gitignore`; `@df/core` (stable IDs,
  versioning, hashing, provenance helpers) with real `contentHash`.
- **Automated:**
  - `[unit]` every package typechecks under strict TS.
  - `[unit]` every package's empty test suite passes (wiring sanity).
  - `[contract]` constraint #9 import rule active and passing across the repo.
  - `[unit]` `@df/core` hashing is deterministic: same content → same hash.
  - `[schema]` re-running `validate-samples` still reports 23/23 (no schema drift during scaffolding).
- **Human gate:** *You approve the repository layout as built (does the real
  on-disk tree match `REPO_LAYOUT.md`?)* and the hashing/versioning scheme.
- **Sign-off:** `milestones/M0.md` (created at M0 start), recording approver + date.

### M1 — Schemas and sample project (extended)
- **Deliverables:** the `ContextPackage` schema (gap from Step F); any new
  schemas for `Terminology` / `TimelineEvent` if approved in Step H; the
  `@df/storage` reader/writer for the on-disk project layout.
- **Automated:**
  - `[schema]` all schemas (incl. new ones) parse their fixtures.
  - `[schema]` round-trip: `storage.write(x)` then `storage.read()` deep-equals `x`.
  - `[unit]` stable-ID validation, including the `__` sub-segment rule.
  - `[contract]` constraint #5 disjoint-buckets property test across the sample.
  - `[fixture]` the sample project validates with **zero** warnings.
- **Human gate (the design doc's M1 bar):** *The schemas can represent a boss,
  a quest giver, and an ordinary NPC without awkward workarounds.* You confirm
  by attempting to express one new (adversarial) character of each type and
  finding no field you needed was missing or forced.

### M2 — Local editor
- **Deliverables:** the React + Vite editor for project/canon/factions/characters/
  quests/scenes, with validation errors surfaced, save/load, stable IDs, version
  history (via Git).
- **Automated:**
  - `[unit]` every editor form round-trips a fixture through its schema.
  - `[contract]` the editor never writes invalid JSON to disk (save is gated by `schema.safeParse`).
  - `[unit]` stable IDs are immutable in the UI once referenced.
  - `[contract]` constraint #1: every save produces human-readable JSON (no binary, no DB).
- **Human gate:** *You can comfortably edit the data without touching raw
  files.* You edit the entire sample project through the UI and confirm the
  on-disk result matches intent.

### M3 — Profile generation
- **Deliverables:** profile brief → structured GLM output → field-level
  acceptance/locking → sample + anti-sample generation → profile consistency
  review.
- **Automated:**
  - `[pipeline]` `generateProfile` output parses as `CharacterProfile` (constraint #12).
  - `[contract]` constraint #9: the path uses `DialogueAIProvider`, not `GlmProvider` directly.
  - `[unit]` field-level accept/reject/lock is honored by the persistence layer.
  - `[unit]` a hard-locked profile field survives a regeneration request.
  - `[network]` (manual) three prompts return three distinct, schema-valid profiles.
- **Human gate (M3 bar):** *Three generated characters are noticeably different
  and useful.* You eyeball three generated profiles and confirm they are
  voiced distinctly and none reads as generic. (The voice-comparison test from
  M6 supports this, but the judgement is human.)

### M4 — Dialogue generation
- **Deliverables:** scene templates, Context Compiler (Stage 1), beat planning
  (Stage 2), dialogue drafting (Stage 3), variants, selective regeneration,
  diff view, approval status.
- **Automated:**
  - `[pipeline]` Stage 1 `ContextPackage` contains exactly the permitted facts and excludes every forbidden one (the heart of the knowledge gate).
  - `[pipeline]` beat plan references only permitted facts.
  - `[pipeline]` Stage 3 output parses as `DialogueDraft` and realizes every required beat.
  - `[contract]` constraint #6: the draft's provenance pins every source version.
  - `[contract]` constraint #8: selective regen yields a patch, not an overwrite.
  - `[unit]` diff view preserves locked lines byte-for-byte.
- **Human gate (M4 bar):** *One character remains recognizable across calm,
  angry, and defeated states.* You generate the golem's first-encounter, phase-
  transition, and defeat lines and confirm the voice holds while the emotion
  shifts.

### M5 — Quest and boss continuity
- **Deliverables:** quest state machine, knowledge progression, boss phase
  states, relationship conditions, scene triggers, player choices, state
  mutations.
- **Automated:**
  - `[unit]` every quest stage's `transitionsTo` points to an existing stage id.
  - `[unit]` every `QuestChoice.resultingStage` exists; every choice has a resulting state.
  - `[pipeline]` the sample quest plays through stage 0→5a and 0→5b without dangling references.
  - `[contract]` constraint #5: across a full playthrough, no character ever utters a fact outside their current state's permitted set (the golem never names its origin before defeat).
  - `[unit]` relationship dimensions stay within -100..100 after every mutation.
- **Human gate (M5 bar):** *A complete five-stage quest contains no early
  revelations or state contradictions.* You play the sample quest both branches
  and confirm nothing is leaked early and no state contradicts another.

### M6 — Consistency engine
- **Deliverables:** deterministic checks, AI semantic review, canon proposal
  inbox, stale-profile warnings, repetition checks, voice-comparison tests.
- **Automated (this is the most test-heavy milestone):**
  - `[contract]` **knowledge-leak detection fires** on a planted bad line (the design doc's headline gate). Uses `scene_golem_first_encounter` with `fact_golem_created_by_miners` injected into a draft line; reviewer must return a `knowledge-leak` blocker.
  - `[contract]` **required-fact detection fires** when a `requiredFacts` fact is absent.
  - `[contract]` **forbidden-term detection fires** when a `forbiddenRevelations` fact appears.
  - `[contract]` **locked-text-changed** fires when a hard-locked line is altered.
  - `[unit]` stale flag set on a dialogue artifact when a source bumps version.
  - `[unit]` stale flag **never** auto-regenerates or deletes the artifact.
  - `[unit]` canon proposal stays `pending` until a human action sets `accepted`/`rejected`.
  - `[unit]` two distinct characters (golem vs prospector) score as dissimilar on the voice-comparison test.
- **Human gate (M6 bar):** *The checker catches intentionally planted
  contradictions.* You plant three contradictions in a copy of the sample
  (a knowledge leak, a voice drift, a stale-reference misuse) and confirm the
  engine reports all three with reasons and suggested repairs.

### M7 — Export and integration
- **Deliverables:** generic JSON export, CSV, Godot-friendly JSON, stable
  localization keys.
- **Automated:**
  - `[unit]` generic JSON export is schema-valid against a published export schema.
  - `[unit]` only `approvalStatus==='accepted'` artifacts are exported (drafts/patches/rejected never leave the tool).
  - `[unit]` every exported line carries a stable localization key.
  - `[unit]` CSV export round-trips through a spreadsheet parse without data loss.
- **Human gate (M7 bar):** *A generated dialogue sequence loads and runs inside
  one real game project.* You import the generic JSON (or Godot JSON) into a
  real engine project and confirm a line plays.

## 5. Cross-cutting acceptance (every milestone)

These must hold at *every* milestone's gate, not just the one that introduces
them:

- **C1.** `pnpm typecheck` is clean across the repo.
- **C2.** `pnpm test` is green with **no network**.
- **C3.** `pnpm --filter @df/schemas validate-samples` reports 23+/23+.
- **C4.** No new `any` in `schemas`/`core`/`context-compiler`/`validators`/`exporters`.
- **C5.** No package violates the dependency rules in `REPO_LAYOUT.md` §3 (enforced by an import-boundary linter).
- **C6.** No document in `docs/` contradicts a newer code decision without an amendment note.

## 6. The sign-off record

Each milestone gets a `milestones/M<N>.md` file at its start, containing:

```
# M<N> — <title>
- Started: <date>
- Deliverables: <list>
- Acceptance tests: <which pass, with command + count>
- Human gate: <criterion> — Status: [ ] pending / [x] signed off by <name> on <date>
- Amendment notes: <any deviations from Phase-0 docs, with reasons>
```

A milestone is **done** only when both the acceptance-tests section shows green
and the human-gate checkbox is ticked with a name and date. The next milestone
does not start until the current one is done — this is the design doc's
"Human gate" discipline made operational.

## 7. What is explicitly NOT an acceptance test

To prevent scope creep disguised as testing:

- **Model output quality is never a CI gate.** Goldens guard against *drift*,
  not against "is this good dialogue." Goodness is a human gate.
- **No test requires network or a real API key.** Provider calls are mocked or
  behind `[network]` (manual).
- **No test asserts on prose style directly.** Style is measured structurally
  (voice-profile fields, anti-sample distance) or by a human.
- **No engine loads run in CI.** The M7 engine-load is a manual human gate.

## 8. Phase 0 → M0 transition criterion

Phase 0 is signed off when:
1. Steps A–H are complete and committed;
2. `@df/schemas` builds, emits JSON Schema, and passes all 15 tests;
3. `validate-samples` reports all sample artifacts conform; and
4. You have read and approved the four `docs/` files plus this one, and
   resolved (or deferred with a note) every item in Step H's open-questions
   register.

On sign-off, M0 begins with `git init` + adding the GitHub remote and creating
`milestones/M0.md`.
