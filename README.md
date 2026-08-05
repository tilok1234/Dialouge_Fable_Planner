# Dialogue Foundry

> A local-first, model-independent **game dialogue authoring system**.
> Status: **Phase 0 complete — contract, schemas, and reference sample.**
> Not yet a usable tool; the foundation is being laid.

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

## Current state (Phase 0)

Phase 0 produced the **product contract** and the **executable data contract**
— no application yet. Everything below is in this repo:

| Deliverable | What it is |
|-------------|------------|
| `PRODUCT_CONTRACT.md` | The binding product promise + 12 hard constraints. |
| `NON_GOALS.md` | What v1 deliberately is *not* (a "not now" list, not "never"). |
| `ARCHITECTURE.md` | The seven-stage pipeline, the six data layers, module boundaries. |
| `REPO_LAYOUT.md` | The proposed pnpm + TypeScript monorepo structure. |
| `ACCEPTANCE_TESTS.md` | How each milestone M0–M7 is judged (automated tests + human gates). |
| `OPEN_QUESTIONS.md` | The resolved open-questions / risks register. |
| `packages/schemas/` | 13 Zod schemas = the executable contract. Builds, typechecks, **15 tests green**. |
| `samples/quarry-project/` | A hand-authored reference project (3 characters, 5-stage quest, full pipeline trace). **23/23 artifacts validate.** |

Milestones ahead: **M0** scaffolding + `@df/core` → **M1** schemas complete +
storage → **M2** local editor → **M3** profile generation → **M4** dialogue
generation → **M5** quest/boss continuity → **M6** consistency engine → **M7**
export. Each ends with a human review gate before the next begins.

## Quickstart (schemas only, for now)

Requires Node 20+ and npm (pnpm from M0 on).

```bash
cd packages/schemas
npm install
npm test                 # 15 tests (13 schema + 2 sample-project)
npm run validate-samples # re-check every sample artifact against the schemas
npm run emit-json-schema # emit draft-07 JSON Schema for the 12 exportable types
```

No network or API key is needed for any of the above.

## Project layout

```
.
├─ PRODUCT_CONTRACT.md  NON_GOALS.md  ARCHITECTURE.md
├─ REPO_LAYOUT.md       ACCEPTANCE_TESTS.md  OPEN_QUESTIONS.md
├─ tsconfig.base.json   .gitignore  .gitattributes  LICENSE
├─ packages/
│  └─ schemas/          # @df/schemas — Zod contract (the foundation)
│     ├─ src/           # one file per schema + index barrel
│     ├─ test/          # contract + sample-project tests
│     ├─ scripts/       # validate-samples.js, emit-json-schema.js
│     └─ json-schema/   # generated draft-07 JSON Schema (gitignored)
└─ samples/
   └─ quarry-project/   # the Phase-0 reference project + its own README
```

The full target monorepo (`apps/studio`, `packages/{core,context-compiler,
generation,validators,providers,exporters,storage,test-fixtures}`) is specified
in `REPO_LAYOUT.md` and arrives with M0.

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
5. **Keep the AI behind an interface.** GLM-5.2 is the first provider, not a
   builtin. Core logic never imports a vendor client.

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
