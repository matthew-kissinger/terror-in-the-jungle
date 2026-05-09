# Task: combatant-movement-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-12-combatant-movement-system-ai-split` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/combat/CombatantMovement.ts` (1,179 LOC, 158 methods) into 4 helpers.

## Required reading

- `_split-template.md`
- `src/systems/combat/CombatantMovement.ts`
- `docs/COMBAT.md` (movement section)

## Files touched

- New: `src/systems/combat/combatant/MovementCore.ts` — stance + velocity integration (≤500 LOC)
- New: `src/systems/combat/combatant/MovementCollision.ts` — terrain-aware collision response (≤500 LOC)
- New: `src/systems/combat/combatant/MovementClusters.ts` — cluster optimization + batching (≤500 LOC)
- New: `src/systems/combat/combatant/MovementAnimation.ts` — animation sync from movement state (≤300 LOC)
- New: each + sibling `*.test.ts` with ≥3 behavior tests
- Modified: `CombatantMovement.ts` — orchestrator ≤300 LOC, delegates to the 4 helpers
- Modified: `scripts/lint-source-budget.ts` — remove `CombatantMovement.ts` from `GRANDFATHER`

## Verification

Per template. Notably:
- combat120 p99 ±2% — movement is on the hot path; perf must hold
- Parity test: deterministic 60s scenario; combatant counts + positions identical at frame 3,600
- 10-min playtest in AI Sandbox

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes

## Branch + PR

- Branch: `task/combatant-movement-split`
- Commit: `refactor(combat): split CombatantMovement into 4 helpers (combatant-movement-split)`
