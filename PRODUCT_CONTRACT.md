# Dialogue Foundry — Product Contract

> Status: **Phase 0, Step A**. This document is the product promise.
> It defines what the program creates, the invariants it must never violate, and
> the boundaries of the first version. It is intentionally short and binding.
> Everything in `NON_GOALS.md`, `ARCHITECTURE.md`, the schemas, and later code
> must remain consistent with this contract. If a future decision contradicts it,
> the decision changes — not the contract — unless you explicitly amend this file.

---

## 1. What it is

**Dialogue Foundry** is a local-first, model-independent **game dialogue
authoring system**.

It is not a generic text generator. It is a structured **character, quest,
scene, and dialogue** authoring tool whose output is *reviewable* dialogue
artifacts that can be reused across multiple games.

Its fundamental pipeline is:

```
world canon
+ faction profile
+ permanent character profile
+ current character state
+ relationship state
+ quest state
+ scene purpose
= reviewable dialogue artifact
```

A useful mental model: **the character profile is source code; the dialogue is
compiled output.** Dialogue is never invented in isolation. It is compiled from
a durable, inspectable model of who is speaking, what they believe, what they
know, how they feel right now, whom they are speaking to, and why.

## 2. What it creates

The system produces, as first-class, human-readable structured artifacts:

- A **project** (the container for one game's or module's authoring work).
- **World canon** — objective truths about the game world.
- **Faction / culture profiles** — shared beliefs, terminology, customs.
- **Character profiles** — permanent identity, core, beliefs/opinions, knowledge
  model, voice, and behaviour under pressure.
- **Character states** — mutable current state (mood, location, injuries,
  temporary goals, facts learned, promises made, last conversation, etc.).
- **Relationship states** — multi-dimensional state between two parties
  (trust, respect, affection, fear, suspicion, debt).
- **Quests** with a **quest state machine** — stages, entry/completion/failure
  conditions, information gating, choices, consequences, scene triggers.
- **Scene specifications** — the purpose, required facts, forbidden revelations,
  emotional direction, and choices for a single conversation.
- **Dialogue artifacts** — the generated, versioned, checkable dialogue itself,
  stored separately from profiles and referencing the exact versions that
  produced it.
- **Dialogue beat plans** and **dialogue reviews** (consistency reports).
- **Canon proposals** — when generation needs a new world fact, it is proposed
  here for human approval, never silently written into canon.

## 3. What it does not create

See `NON_GOALS.md` for the full, explicit out-of-scope list. In summary, v1 is
**not**: live in-game runtime AI, voice generation, automatic localization, a
visual node editor, procedural quest-chain creation, relationship-graph
visualization, a multi-provider fleet, autonomous lore creation, or multiplayer
dialogue sync.

The first version is an **offline authoring tool**. It generates, checks,
edits, approves, and exports finished game dialogue. Runtime AI may come later
as an optional layer; it does not define the foundation.

## 4. Canon ownership (who may change what)

The system obeys a strict ownership model. This is the rule that prevents lore
from slowly mutating without the author's knowledge.

| Asset                       | Owner of truth            | Who may change it                                   |
|-----------------------------|---------------------------|-----------------------------------------------------|
| World canon                 | The human author          | Human only. The AI may **propose**, never write.    |
| Faction / character profile | The human author          | Human directly, or AI via a **reviewable patch**.   |
| Character state             | The author + quest logic  | Quest/scene state transitions, logged and reversible. |
| Quest definition            | The human author          | Human only; AI may propose additions.               |
| Generated dialogue          | The human author          | AI proposes drafts; nothing is "approved" until accepted. |

**Invariants:**

1. The AI **never silently modifies approved world canon.**
2. New lore invented during generation **must become a separate canon proposal**
   for review, not an edit to existing files.
3. Locked human edits (profile fields, quest facts, dialogue lines, choices,
   specific wording) **must never be overwritten** by regeneration.
4. Generated text is **never** treated as approved game content until a human
   explicitly accepts it.

## 5. Versioning and provenance

Every dialogue artifact records **exactly which versions produced it**:

- character profile version
- world canon version
- quest version
- faction profile version(s)
- scene spec version
- prompt template version
- schema version
- model + provider + reasoning effort

When a source changes version, dependent dialogue is **flagged as potentially
stale** ("Review recommended") but **never automatically erased or
regenerated**. Stale review is a prompt, not an action.

## 6. Locking

Anything the author cares about must be lockable:

- entire profiles
- individual profile fields
- quest facts
- dialogue lines
- player choices
- branches
- specific wording inside a line

Regeneration operates through **proposed patches** that visibly preserve locked
content and show original-vs-replacement diffs. Nothing is applied until
accepted.

## 7. Separation principles (the structural contract)

These separations are mandatory in the data model:

1. **Permanent profile vs. mutable state.** A character's core identity and
   their current state are distinct objects. A boss keeps one profile and many
   states (pre-encounter, phase 1, phase 2, defeat, rematch, post-quest).
2. **Knowledge categories are distinct.** Objective knowledge, false beliefs,
   suspicions, secrets, deliberate lies, and unknowns are represented
   separately. A character may only use information their knowledge profile
   permits — this prevents the "every NPC knows the whole world bible" failure.
3. **Opinions are first-class and versioned.** An opinion tracks target,
   position, reason, confidence, whether it is publicly admitted, and the
   condition under which it can change — so opinions can evolve without silently
   rewriting the character.
4. **Dialogue is stored separately from profiles.** Dialogue references the
   profile/quest/scene/canon/schema/prompt/model versions that produced it; it
   is not embedded inside the profile.
5. **Voice is structural, not just vibes.** The voice profile carries
   formality, directness, sentence length, rhythm, metaphor domain, sample
   lines, and **anti-sample lines** (how the character should *not* sound).

## 8. AI provider boundaries

The AI layer is **provider-independent** behind a single interface, with
**GLM-5.2 implemented first**. The architecture must permit Claude, OpenAI,
Kimi, or a local model later without touching core logic.

Two distinct roles for the model are kept separate:

- **GLM-5.2 as the coding agent** that builds the program (now).
- **An API provider behind the finished program's Generate button** (later).

The model's long context window is **not** the program's memory system. Files
remain the source of truth; the application constructs a **small, precise
context package** per generation request.

## 9. The 12 hard constraints

These are binding on all later work:

1. Canonical project data is stored in **human-readable, version-controlled
   JSON files**.
2. Generated dialogue **never silently modifies approved world canon**.
3. New lore invented during generation becomes a **separate canon proposal**.
4. **Permanent character identity and mutable character state are separate.**
5. Objective facts, beliefs, suspicions, secrets, deliberate lies, and unknowns
   are **represented separately**.
6. Dialogue is stored separately from profiles and **references the exact
   profile, quest, scene, canon, schema, prompt, and model versions** used.
7. Every profile field, dialogue line, branch, and human edit is **lockable**.
8. Regeneration operates through **proposed patches** and never overwrites
   accepted content without approval.
9. The AI layer is **provider-independent**, with GLM-5.2 first.
10. The initial product is an **offline authoring tool**, not live runtime AI.
11. The first export format is **generic JSON**.
12. **All generated structured output is validated before it is stored.**

## 10. Export expectations

The first export format is **generic JSON** (engine-agnostic). CSV and
engine-specific JSON (e.g. Godot-friendly) with stable localization keys are
planned for the export milestone (M7). Engine-native resources and
TypeScript-game formats may follow; they do not belong to the MVP.

## 11. What "done for v1" means (MVP success criteria)

The MVP succeeds when it can demonstrate, end to end:

- three clearly different character profiles;
- one ordinary quest giver, one recurring NPC, one multi-phase boss;
- one five-stage quest;
- boss introduction, phase-transition, and defeat dialogue;
- quest offer, progress, and completion dialogue;
- selective line regeneration that preserves locked content;
- locked human edits surviving regeneration;
- knowledge-leak detection;
- generic JSON export.

That is enough to prove the central system works. Anything beyond that is
deferred per `NON_GOALS.md`.

## 12. Build discipline

- Prefer **explicit contracts and inspectable data** over prompt magic.
- Do not hide important state inside prose.
- Do not implement features outside the approved MVP.
- Every milestone ends with a **human review gate** before the next begins.
