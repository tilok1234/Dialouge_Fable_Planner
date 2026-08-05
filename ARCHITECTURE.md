# Dialogue Foundry — Architecture

> Status: **Phase 0, Step C**. This document describes the runtime architecture
> of Dialogue Foundry: the layers, the data flow, the module boundaries, and the
> contracts between them. It must stay consistent with `PRODUCT_CONTRACT.md`
> (what we promise) and `NON_GOALS.md` (what we refuse to build).
> The repository layout itself is **Step D** (`REPO_LAYOUT.md`); this document is
> concerned with how the parts behave, not where they sit on disk.

---

## 1. Architectural stance

Five principles shape every decision below. When two conflict, resolve in this
order:

1. **Files are the source of truth, not the model.** The model's large context
   is a convenience while *building* the program; it is not the program's
   memory. The application assembles a small, precise context package per
   request.
2. **Explicit contracts over prompt magic.** State lives in inspectable JSON,
   not hidden inside prose. Schemas validate every generated artifact before it
   is stored.
3. **Propose, never impose.** The AI produces drafts, beat plans, reviews, and
   patches. Humans accept. Nothing generated is "approved" until accepted.
4. **Separate the durable from the derived.** Permanent identity is distinct
   from mutable state; dialogue is derived from sources and stored apart from
   them, recording the versions that produced it.
5. **Keep the AI behind an interface.** GLM-5.2 is the first provider, not a
   builtin. Core logic never imports a vendor client directly.

## 2. High-level pipeline

Generation is a **compiler**, not a single prompt. The design doc's pipeline:

```
World Bible ─────────────┐
Faction Profile ─────────┤
Character Profile ───────┤
Character State ─────────┼─> Context Compiler ──> Dialogue Planner
Relationship State ──────┤                              │
Quest State ─────────────┤                              ▼
Scene Instructions ──────┘                       Dialogue Writer
                                                        │
                                                        ▼
                                                Consistency Checks
                                                        │
                                                        ▼
                                               (Human approval)
                                                        │
                                                        ▼
                                             Versioned Dialogue Artifact
```

In v1 the compiler is a **linear, restartable pipeline of named stages**, each
with typed inputs and outputs, each writing an artifact to disk. Any stage can
be re-run independently; later stages consume the previous stage's stored
output, not an in-memory value. This makes partial runs, debugging, and
"regenerate from step N" cheap and inspectable.

### 2.1 The seven stages

| # | Stage                | Reads                                           | Writes                | AI? |
|---|----------------------|-------------------------------------------------|-----------------------|-----|
| 1 | Context Compile      | All six source layers + scene spec              | `ContextPackage`      | no  |
| 2 | Beat Plan            | `ContextPackage`                                | `DialogueBeatPlan`    | yes |
| 3 | Dialogue Draft       | `ContextPackage` + `DialogueBeatPlan`           | `DialogueDraft`       | yes |
| 4 | Consistency Review   | `DialogueDraft` + `ContextPackage`              | `DialogueReview`      | both|
| 5 | Repair (if needed)   | `DialogueReview` + `DialogueDraft` + locks      | `DialoguePatch`       | yes |
| 6 | Human Approval       | `DialoguePatch`/`DialogueDraft`                 | acceptance record     | no  |
| 7 | Persist + Export     | accepted draft + provenance                     | `DialogueArtifact`    | no  |

Stages 1, 6, 7 are deterministic. Stages 2, 3, 5 call the provider. Stage 4
runs **deterministic checks first**, then optionally an AI semantic pass.

### 2.2 Why beat-plan-then-draft (two calls, not one)

The beat plan is a short structured outline ("1. Boss acknowledges broken seals;
2. frames excavation as theft; …") generated *before* prose. Drafting from an
approved beat plan prevents attractive individual lines from displacing the
scene's actual narrative purpose. It also gives the reviewer something
structured to check the draft against.

## 3. Data model — the six layers and their boundaries

All layers are JSON objects validated by Zod schemas (Step E). Boundaries below
are mandatory; cross-references are **by stable ID**, never by embedding.

### 3.1 World canon (`CanonFact`)
Objective truths about the game world. Author-owned. Each fact is an
addressable, versioned, lockable atom — e.g. *"the western kingdom collapsed 40
years ago."* Canon is referenced; it is never duplicated into characters.

### 3.2 Faction / culture profile (`FactionProfile`)
Shared beliefs, terminology, customs — e.g. *"Stoneborn consider mining
sacred."* A character references their faction(s) by ID; faction provides
default terminology and metaphor domain that the character's voice may inherit
or override.

### 3.3 Character profile (`CharacterProfile`) — permanent
The durable identity. Sections (per the design doc):

1. **Identity & narrative role** — name, stable ID, species/culture/faction,
   occupation, gameplay role, **narrative function**, public reputation,
   private reality, connections to quests/regions/characters.
2. **Character core** — primary desire, primary fear, central value, main flaw,
   central contradiction, moral boundary, breaking point.
3. **Beliefs & opinions** — a versioned list, each with target, position,
   reason, confidence, publicly-admitted flag, and a *can-change condition*.
4. **Knowledge model** — six disjoint buckets: `knows`, `believes_false`,
   `suspects`, `secrets`, `lies`, `unknown`. This is the contract that enforces
   knowledge-leak detection.
5. **Voice profile** — formality, directness, sentence length, rhythm,
   vocabulary complexity, contractions, humor, **metaphor domain**, emotional
   restraint, question-vs-declaration tendency, address-by-name/title/insult,
   avoided words/constructions, **sample lines**, **anti-sample lines**.
6. **Behaviour under pressure** — reactions for threatened, praised,
   embarrassed, proven-wrong, betrayed, losing control, gaining advantage,
   facing death, speaking to weaker/admired/required-but-hated parties.

The profile changes only during a deliberate character arc, and even then via a
reviewable patch.

### 3.4 Character state (`CharacterState`) — mutable
Current mood, location, injuries, active quest stage, recently-witnessed events,
temporary objective, current relationship values, facts learned during play,
promises made, whether the player betrayed them, last conversation, unresolved
conflicts. One profile → many states (e.g. a boss's pre-encounter / phase-1 /
phase-2 / defeat / rematch states).

### 3.5 Relationship state (`RelationshipState`)
A **multi-dimensional** record between two parties (character↔player, or
character↔character): trust, respect, affection, fear, suspicion, debt — plus
history notes. Not a single "friendship score." The raw values are not required
to surface in dialogue; they determine which named **relationship state** applies.

### 3.6 Quest + quest state machine (`Quest`, `QuestStage`)
Each quest carries: premise, objective truth, what the player initially knows,
what each participating character knows, stages (state machine), entry /
completion / failure conditions, info revealed per stage, choices, consequences,
variables changed, characters affected, scenes triggered.

Every dialogue scene attaches to one or more **quest stages**. The scene spec
adds: what must be communicated, what may be hinted, what must not yet be
revealed, emotional direction, available player choices, and the state change
each choice causes. This is what makes dialogue *serve* the game rather than
merely sound interesting.

### 3.7 Scene specification (`SceneSpecification`)
A single conversation's contract: scene type (from the typed template library),
participants, quest state(s) it binds to, purpose, required facts, forbidden
revelations, emotional progression, max length, player choices. The scene spec
is the primary steering input to the Context Compiler.

## 4. Typed scene templates

The program does **not** use one generic generation box. Each scene type carries
its own requirements and length rules. v1 implements a subset sufficient for the
MVP; the categories are (from the design doc):

- **Quest** — introduction, offer, accept, decline, return-after-declining,
  progress update, missing-requirement, success, partial-success, failure,
  betrayal outcome, later consequence.
- **Boss** — first-encounter intro, rematch intro, aggro line, phase
  transition, mechanic warning, player-wounded, boss-wounded, boss-kills-player,
  boss victory, boss defeat, escape, post-defeat conversation; plus alternative
  lines by class/faction/previous-choice.
- **Ordinary NPC** — first greeting, repeat greeting, friendly/hostile greeting,
  service, rumour, location reaction, quest-state reaction, ambient bark,
  combat reaction, farewell.
- **Longer-form** — monologue, sermon, journal entry, letter, historical
  account, companion conversation, ambient two-NPC conversation.

Each template is a declarative spec (required facts, forbidden content, length
band, emotional defaults) consumed by the Context Compiler and the reviewer —
not hardcoded prompts.

## 5. Context Compiler

**The most important non-AI component.** It does not merely concatenate files.
Given a scene spec, it:

1. Resolves participant IDs → profiles + current states + relationships.
2. Resolves the bound quest stage → the facts that *may* be known at this point,
   the facts that *must not* yet be revealed, the choices available, and the
   state each choice mutates.
3. Selects the scene template → length band, required/forbidden content,
   emotional defaults.
4. Selects **only the relevant** canon and faction facts (by explicit reference
   from the participants/quest/scene — never "dump everything because the model
   can hold it").
5. Pulls compact **memory summaries** (not raw prior lines).
6. Emits a single, small, inspectable `ContextPackage` consumed by the Beat
   Planner and later the reviewer.

The `ContextPackage` is itself an artifact on disk. If a generation looks wrong,
you read the context package first, not the prompt.

## 6. Consistency engine (Stage 4)

Two tiers, deterministic first, AI second.

### 6.1 Deterministic checks (code)
Referenced characters/quests exist; quest states are valid; branches lead
somewhere; variables are spelled correctly; **required facts appear**;
**forbidden terms do not appear**; line-length limits respected; **locked text
has not changed**; the **character is permitted to know** every referenced fact
(knowledge-model enforcement); dialogue IDs are unique; every choice has a
resulting state; all placeholders have values.

### 6.2 AI-assisted checks (provider)
Voice drift; implied lore contradictions; emotional inconsistency; repetition;
excessive exposition; generic fantasy phrasing; two characters sounding too
similar; whether the scene purpose was accomplished; whether a *lie* accidentally
reads as objective narration; whether a phase transition feels appropriate.

### 6.3 Reporting discipline
The checker **reports problems**, it does not silently rewrite. Each finding
carries: issue type, the offending line, the reason, and a suggested repair. A
failed line is repaired **in isolation** (Stage 5) without regenerating the whole
scene.

### 6.4 Canon proposal inbox
If the writer needs a fact that does not exist in canon, it does **not** invent
it silently. It emits a `CanonProposal` (proposed fact, reason, affected assets).
Approval/edit/rejection is a human action. This is the single biggest guard
against silent lore drift.

## 7. Versioning, provenance, staleness

Every accepted `DialogueArtifact` records:

```
character_profile: vN @ hash
faction_profile[]:  vN @ hash
world_canon:        vN @ hash
quest:              vN @ hash
scene_spec:         vN @ hash
schema:             vN
prompt_template:    vN
provider:           glm-5.2
reasoning_effort:   high|normal
generated_at:       ISO timestamp
```

When any source bumps version, dependent artifacts are **flagged stale**
("Review recommended"). They are **never** auto-regenerated or erased. Stale is
a prompt, not an action.

Locking is layered on top: locked fields/lines/choices/wording survive any
regeneration, and regeneration always produces a **patch + visible diff** the
human must accept.

## 8. Provider interface (AI boundary)

The single seam between core logic and any model:

```ts
interface DialogueAIProvider {
  generateProfile(req: ProfileRequest):      Promise<CharacterProfile>;
  planScene(req: ScenePlanRequest):          Promise<DialogueBeatPlan>;
  generateDialogue(req: DialogueRequest):    Promise<DialogueDraft>;
  reviewDialogue(req: ReviewRequest):        Promise<DialogueReview>;
  repairDialogue(req: RepairRequest):        Promise<DialoguePatch>;
}
```

Core logic depends on this interface, never on a vendor client. `GlmProvider`
is the first and only v1 implementation, sitting behind it. Adding Claude /
OpenAI / Kimi / a local model later means writing a second implementation — no
core changes.

Two distinct roles for the model stay separate (per contract §8):
- **GLM-5.2 as the coding agent** building this program (now, outside the app).
- **A provider behind the finished program's Generate button** (inside the app).

## 9. Application shape (process / runtime)

v1 is a **local-first web app**: React + Vite UI, TypeScript throughout, a Node
backend service for file access and for hosting the pipeline + provider. The UI
is a friendly view over the JSON files; raw JSON remains editable by hand.

- **No database.** The filesystem is the database (contract §9.1).
- **No in-app concurrency / merge.** Git handles history and merge (non-goals
  §2.9, §3.1). The app saves atomically to disk.
- **Context per request, no long-lived model memory.** Each generation builds a
  fresh `ContextPackage`.

A finer split between the pipeline (pure, testable, no I/O) and the I/O layer
(filesystem, provider network) is mandatory: **the pipeline must be unit-testable
with fixtures, without the network or the disk.** That is what makes regression
testing the contract feasible.

## 10. Validation as a first-class concern

Per hard constraint #12 ("all generated structured output must be validated
before it is stored"), every artifact crossing a stage boundary is validated by
its Zod schema. **Validation failure is a hard stop**, not a warning — the
artifact is not written. This applies equally to AI output (profiles, beat plans,
drafts, reviews, patches) and to hand-edited JSON loaded into the editor.

## 11. Export

v1 exports **generic JSON** (engine-agnostic), with **stable localization keys**
so external tooling or human translators can localize later. CSV and
Godot-friendly JSON are planned for milestone M7; engine-native resources after.
Export reads only **accepted** artifacts — drafts and unapproved patches never
leave the tool.

## 12. Security and trust boundary

- The only outbound network call is the provider's model API, only when the user
  triggers generation. No telemetry, no cloud, no accounts (non-goal §3.6).
- Provider output is **untrusted**: it is parsed, schema-validated, and
  consistency-checked before it can influence any stored asset.
- Canon proposals and patches queue for human approval; they cannot self-apply.

## 13. Traceability

Every decision in this document maps to a contract clause:

| Architecture decision                      | Contract anchor                  |
|--------------------------------------------|----------------------------------|
| Files as source of truth, context per request | Contract §8, §9.1; principle 1 |
| Seven-stage compiler pipeline              | Contract §2 (the formula)        |
| Beat plan before draft                     | Contract §2; §7 (voice)          |
| Six knowledge buckets                      | Contract §7.2, constraint #5     |
| Context Compiler selects only relevant facts | Principle 1; non-goal (no dump)|
| Deterministic checks before AI checks      | Contract §4 (ownership)          |
| Canon proposal inbox (no silent lore)      | Contract §4, constraint #2/#3    |
| Locking + patch/diff regeneration          | Contract §6, constraint #7/#8    |
| Provenance + stale flags, never auto-regen | Contract §5                      |
| Provider interface, GLM first              | Contract §8, constraint #9       |
| Validate before store                      | Contract constraint #12          |
| Generic JSON export only                   | Contract §10, constraint #11     |

If any future code contradicts a row, the code is wrong unless the contract is
formally amended.
