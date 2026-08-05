# Dialogue Foundry — Non-Goals (v1)

> Status: **Phase 0, Step B**. The companion to `PRODUCT_CONTRACT.md`.
> A non-goal is not a "bad idea forever" — it is a **"not now."** Each item
> below is deliberately excluded from v1 so the foundation can be built and
> proven. Several are listed as *possible later* directions. None of them may
> creep into v1 without an explicit amendment to this file and the contract.

## 1. Purpose of this document

`PRODUCT_CONTRACT.md` says what v1 *is*. This document says what v1 *is not*.

The rule is simple: **if it is not in the contract and not in the MVP success
criteria, and it is listed here, it does not get built in v1.** When in doubt,
we leave it out, ship the smaller thing, and revisit.

Non-goals exist to protect the foundation. The most expensive way to build this
system is to try to build all of it at once.

## 2. Hard non-goals for v1 (do not build)

These are drawn from the design document's "deliberately leave out" list and the
v1 scoping decision. They are excluded from the first version entirely.

### 2.1 Live runtime AI inside the released game
v1 is an **offline authoring tool**. It produces finished, exported dialogue
assets. It is **not** a live NPC brain that calls a model while the player is
in-game. Runtime AI is a possible *optional later layer* — it must not define
the foundation, and no part of v1 may assume a model is present at game runtime.

### 2.2 Voice generation (TTS) and audio
No speech synthesis, no voice direction output, no audio export in v1. The
output is text. (Voice *direction notes* for a human actor are a possible later
artifact, but not part of MVP.)

### 2.3 Automatic localization / translation
No machine translation pipelines in v1. Dialogue is authored in one language.
The export format will provide **stable localization keys** so a human or
external toolchain can localize later, but the program does not translate.

### 2.4 A large visual node editor
No full graph-based dialogue node canvas in v1. The MVP uses structured editors
(forms / lists) over the JSON. A visual node editor is a large UI investment
that does not belong in the foundation.

### 2.5 Procedural creation of entire quest chains
v1 supports **authoring** quests (including a state machine), and the AI can
*propose* canon additions. It does **not** auto-generate whole branching quest
chains end to end. One five-stage, hand-shaped quest is the MVP bar.

### 2.6 Complex relationship-graph visualizations
Relationship state is modeled (trust, respect, affection, fear, suspicion,
debt), but v1 does not render interactive network/graph diagrams of it. The
data is inspectable in structured form; visualization is a later nicety.

### 2.7 A fleet of model providers
GLM-5.2 is implemented **first and only** for v1, behind the provider
interface. Wiring up Claude / OpenAI / Kimi / local models is explicitly later.
The point of the interface is to *permit* them later, not to ship them now.

### 2.8 Fully autonomous lore creation
The AI **never** silently creates world canon. New lore becomes a **canon
proposal** for human approval. There is no "auto-accept canon" mode in v1.

### 2.9 Multiplayer dialogue synchronization
v1 is a single-author (or single-editor-at-a-time) local tool. No real-time
collaboration, no multi-user editing, no conflict resolution between concurrent
editors.

### 2.10 Engine-native resources as the first export
The first export is **generic JSON**. Godot-specific resources, Unity
ScriptableObjects, Unreal data tables, or bespoke TypeScript-game formats are
**later**. (Godot-*friendly* JSON and CSV are planned for the export milestone
M7; native resource formats after that.)

## 3. Self-imposed scope cuts for v1

Beyond the design doc's list, these are excluded to keep the MVP achievable.
Each is a reasonable future feature; none belong in the foundation.

### 3.1 No in-app diff/merge between conflicting human edits
v1 shows original-vs-replacement diffs for **AI regeneration proposals**, but
does not attempt to merge concurrent human edits (there is no concurrency — see
2.9). Raw Git remains the merge tool.

### 3.2 No undo/redo tree beyond file state
v1 relies on saving JSON to disk and (recommended) Git for history. There is no
custom in-memory infinite-undo engine across the whole app in v1.

### 3.3 No automatic cross-character "cast voice" tuning
The character-comparison *test* (place several characters in the same situation
and compare) is in the MVP as a check. Automatic re-balancing of voices to make
them more distinct is **not** — that is a human judgement call surfaced by the
report.

### 3.4 No sentiment/profanity/style scoring engines
The AI-assisted reviewer flags voice drift, exposition, repetition, generic
fantasy phrasing, etc. v1 does **not** ship dedicated deterministic
sentiment/profanity/style scorers. Those are possible later validators.

### 3.5 No plugin/extension API in v1
The schema, validators, provider interface, and exporters are internal modules.
A public plugin SDK for third parties to add editors/validators/exporters is a
later concern once the contracts have proven stable.

### 3.6 No cloud, accounts, or telemetry
Local-first means local. No login, no cloud sync, no usage telemetry, no
analytics. Nothing leaves the machine except an explicit model API call when the
user generates something.

## 4. Things v1 *will* do that might look like non-goals

To prevent confusion, these sound optional but **are** in scope:

- **Knowledge-leak detection** — in MVP (it is central to the knowledge-model
  contract).
- **Locked-edit preservation through regeneration** — in MVP.
- **Canon proposal inbox** — in MVP.
- **Stale-content warnings** when a source version changes — in MVP.
- **Character voice comparison test** — in MVP (as a report, not auto-tuning).
- **Selective line regeneration with visible diffs** — in MVP.
- **Generic JSON export** — in MVP.

## 5. How a non-goal becomes a goal

A non-goal is promoted to scope only by:

1. An explicit amendment to this file (move it out of here), **and**
2. A matching update to `PRODUCT_CONTRACT.md` if it touches the contract, **and**
3. Assignment to a milestone (M0–M7 or a new one) with a human review gate.

Anything else is scope creep and should be refused at review time.

## 6. Summary line

> **v1 is an offline, local-first, single-author dialogue authoring tool. It
> models characters/quests/scenes as inspectable JSON, compiles reviewable
> dialogue from them via a single provider (GLM-5.2), checks consistency, and
> exports generic JSON. Everything else is later.**
