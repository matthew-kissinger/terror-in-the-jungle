# Task: combatant-ai-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-12-combatant-movement-system-ai-split` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/combat/CombatantAI.ts` (757 LOC) into 3 helpers.

## Required reading

- `_split-template.md`
- `src/systems/combat/CombatantAI.ts`
- `src/systems/combat/ai/` (existing AI sub-tree — extracted state classes already exist; this is about the top-level decision loop)
- `docs/COMBAT.md`

## Files touched

- New: `src/systems/combat/combatant/AIDecisionLoop.ts` — high-level state selection (≤500 LOC). Calls into `src/systems/combat/ai/AIState*` classes.
- New: `src/systems/combat/combatant/AIPerception.ts` — LOS, target acquisition, threat scoring (≤500 LOC). May share logic with existing AILineOfSight.
- New: `src/systems/combat/combatant/AISquadCoordination.ts` — squad-level decisions (group movement, suppress targets, etc.) (≤500 LOC)
- New: each + sibling `*.test.ts` with ≥3 behavior tests
- Modified: `CombatantAI.ts` — orchestrator ≤300 LOC, delegates
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. Behavior preservation matters — squad doctrine and engage timing
must be identical. Parity test compares engage events on a 60s scenario.

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes

## Branch + PR

- Branch: `task/combatant-ai-split`
- Commit: `refactor(combat): split CombatantAI into decision-loop + perception + squad helpers (combatant-ai-split)`
