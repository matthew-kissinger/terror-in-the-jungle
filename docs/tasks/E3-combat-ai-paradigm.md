# Task E3: Combat AI paradigm review

**Phase:** E (parallel R&D track, decision memo only)
**Depends on:** Foundation
**Blocks:** Batch F planning
**Playtest required:** no
**Estimated risk:** low (analysis + small prototype, no merge)
**Files touched:** deliverable is a decision memo, with an optional throwaway prototype branch

## Goal

Decide whether the current hand-written per-NPC state machines (`AIStateEngage`, `AIStateDefend`, `AIStatePatrol`) scale to rich faction doctrine — or whether we need a higher-level AI paradigm (utility AI, GOAP, behavior trees).

## Vision anchor

Four factions with distinct doctrines (VC guerrilla, NVA conventional, US combined arms, ARVN hybrid). D2 assumes doctrine is a thin parameter layer over existing state machines. This task tests that assumption.

## Required reading first

- `docs/REARCHITECTURE.md` E3 section.
- All files under `src/systems/combat/ai/`.
- `docs/COMBAT.md` if D1 has landed.
- `docs/BACKLOG.md` faction doctrine section.

## Steps

1. **Write 3 concrete doctrine scenarios** that are hard to express in the current state machines. Examples:
   - "VC squad withdraws when friendly suppression reaches threshold AND terrain cover is available in the withdrawal direction."
   - "NVA platoon: one half-squad suppresses while the other maneuvers flank."
   - "US squad: calls for helicopter gunship support when engaged by superior force."
2. **Try to express each scenario as state-machine extensions.** Note where it breaks: hard to compose, requires new state categories, requires cross-squad coordination that state machines don't model, etc.
3. **Prototype ONE scenario in a utility-AI / GOAP / BT style** (throwaway). Compare the expression.
4. **Decision memo.**

## Deliverable: decision memo

File: `docs/rearch/E3-combat-ai-evaluation.md`.

Sections:

1. **Question.**
2. **Three scenarios** (written out).
3. **State-machine expression attempts** (for each scenario, note what broke or how ugly it got).
4. **Prototype expression** (one scenario, in whichever paradigm the implementer chose).
5. **Cost estimate** (migrating AI to the chosen paradigm).
6. **Value estimate** (doctrine richness unlocked, plus easier/harder to tune per faction).
7. **Recommendation** (keep state machines + data-driven tuning / design utility layer / design GOAP / design BT / defer).

## Verification

- Memo exists, scenarios are specific and testable.
- Prototype (if any) runs in isolation.
- No changes merged.

## Non-goals

- Do not adopt a third-party AI library.
- Do not rewrite existing AI.
- Do not touch fenced interfaces.
- Do not produce a full migration plan — that's Batch F if greenlit.

## Exit criteria

- Decision memo delivered.
- Orchestrator flags memo delivered, moves on.
