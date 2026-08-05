# Sample project — "The Quarry Seals"

The Phase 0 / milestone-M1 reference project for Dialogue Foundry. It exists to
prove the contract schemas can represent the full MVP cast — **a quest giver,
a recurring NPC, and a multi-phase boss inside a five-stage quest** — without
awkful workarounds, and to exercise every pipeline-stage artifact type as
concrete data.

Every file in this tree is validated against `@df/schemas` by
`packages/schemas/scripts/validate-samples.js` (run via
`pnpm --filter @df/schemas validate-samples`, or it runs as part of the test
suite). If you edit a file, re-run the validator.

## The module in one paragraph

A played-out stone quarry, sacred to the **Stoneborn**, was sealed long ago
when the guardian the miners carved — the **Hornblende Golem** — turned on
them. Now the seals are failing. **Foreman Aldric** (the guilt-ridden retired
foreman who ordered the evacuation) wants them checked. **Mae the Prospector**
(a recurring opportunist) wants them broken for profit. The golem, at the
sealed vein, does not yet know it was made by the very people it hunts.

## Cast

| ID | Role | Voice in one line |
|----|------|-------------------|
| `char_hornblende_golem` | 3-phase boss | Formal, archaic, impenetrable; speaks of stone, weight, debt. |
| `char_quarry_foreman` | Quest giver (Aldric) | Casual, indirect, dry; talks himself out of his own sentences. |
| `char_wandering_prospector` | Recurring NPC (Mae) | Bright, brisk, interrogative; speaks of coin and the open road. |

The three are deliberately voiced in opposite registers so the voice-comparison
test has real contrast (the golem and the prospector are essentially
incompatible voices).

## The knowledge-gating test (the heart of this sample)

`fact_golem_created_by_miners` is the module's biggest secret. Its permitted
use is controlled per-character AND per-state AND per-scene, which is exactly
the layered knowledge model the contract promises:

| Holder | Where the fact lives | What they may say |
|--------|----------------------|-------------------|
| Hornblende Golem (profile) | `knowledge.unknown` | **Nothing** — it does not know its own origin. |
| Hornblende Golem (`state_..._defeated`) | `factsLearned` | The truth — and only in `scene_golem_defeated`. |
| Foreman Aldric | `knowledge.suspects` | May hint, never state as fact. |
| Mae the Prospector | `knowledge.secrets` | Knows it, will not reveal without payment. |
| `scene_golem_first_encounter` | `forbiddenRevelations` | **Hard forbid** — the leak detector must reject any mention. |
| `scene_golem_defeated` | `requiredFacts` | **Required** — the dying reveal must land it. |

This is the cleanest demonstration of the contract's six-bucket knowledge model
and the `forbiddenRevelations` / `requiredFacts` scene gates working together.

## Tree

```
quarry-project/
├─ project.json
├─ canon/                 world-facts, terminology, timeline
├─ factions/              stoneborn, ash-kingdom
├─ characters/            hornblende-golem, quarry-foreman, wandering-prospector
├─ states/                per-character state files (golem has 5: pre/p1/p2/final/defeated)
├─ relationships/         hornblende-golem__player
├─ quests/                quarry-seals (5 narrative stages + branch 5a/5b)
├─ scenes/                golem-first-encounter, golem-phase-transition,
│                         golem-defeated, foreman-offer
├─ context/               golem-first-encounter.ctx   (compiler output; no schema yet)
├─ beats/                 golem-first-encounter.beat
├─ dialogue/              golem-first-encounter.dialogue  (line l4 is hard-locked)
├─ reviews/               golem-first-encounter.review
└─ proposals/             seals-built-by-miners.proposal  (pending; canonical inbox demo)
```

## Pipeline artifact walkthrough

`golem-first-encounter` is traced end-to-end through the seven stages:

1. **Context** (`context/...ctx.json`) — compiler-selected canon, permitted and
   forbidden facts, memory summaries, relationship snapshot.
2. **Beat plan** (`beats/...beat.json`) — four ordered beats before prose.
3. **Dialogue** (`dialogue/...dialogue.json`) — the accepted artifact, with
   line `l4` **hard-locked and human-edited** (the locked-edit-survives-regen
   proof), and full `provenance`.
4. **Review** (`reviews/...review.json`) — a deterministic blocker
   (`required-fact-missing`) plus an AI pass that caught an anti-sample phrase;
   both resolved before acceptance.
5. **Proposal** (`proposals/...proposal.json`) — the writer needed a canon fact
   that didn't exist; it proposed one instead of inventing it. Status: pending.

## Notes / known gaps (deferred to Step H)

- `context/*.ctx.json` has **no contract schema** yet — it's the compiler's
  intermediate output. A `ContextPackage` schema is flagged for Step H / M1.
- `canon/terminology.json` and `canon/timeline.json` are loose helper arrays,
  not contract-validated. Whether they become `Terminology` / `TimelineEvent`
  schemas is a Step H decision.
- `contentHash` values are placeholders (`sha256:<slug>`); real hashing lands
  in `@df/core` (M0/M1).
