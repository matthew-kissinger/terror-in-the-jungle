# Task: combatant-system-split-and-tests

Last verified: 2026-05-09

Cycle: `cycle-2026-05-12-combatant-movement-system-ai-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/combat/CombatantSystem.ts` (665 LOC, fan-in 32, **0 direct
tests**) into orchestrator + lifecycle helpers. Add ≥3 behavior tests for
the orchestrator — closes the "0 tests" cautionary tale.

## Required reading

- `_split-template.md`
- `src/systems/combat/CombatantSystem.ts`
- `docs/COMBAT.md`
- `docs/TESTING.md`

## Files touched

- New: `src/systems/combat/combatant/CombatantLifecycle.ts` — spawn, despawn, faction allocation (≤500 LOC)
- New: `src/systems/combat/combatant/CombatantTickRouter.ts` — per-frame fan-out to render / movement / AI subsystems (≤300 LOC)
- New: `src/systems/combat/CombatantSystem.test.ts` — ≥3 behavior tests (was 0):
  - System initializes with empty combatant list
  - Spawn produces a combatant present in `getAll()`
  - Despawn removes from list and releases pool resources
  - (Optional) update() ticks at expected rate
- Modified: `src/systems/combat/CombatantSystem.ts` — orchestrator ≤300 LOC, delegates
- Modified: `scripts/lint-source-budget.ts` — remove `CombatantSystem.ts` from GRANDFATHER

## Verification

- `wc -l src/systems/combat/CombatantSystem.ts` ≤300
- `npx vitest run src/systems/combat/CombatantSystem.test.ts` — green
- Cycle's combat120 p99 ±2%
- Parity test: combatant counts identical at frame 3,600

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes

## Branch + PR

- Branch: `task/combatant-system-split-and-tests`
- Commit: `refactor(combat): split CombatantSystem + first behavior tests (combatant-system-split-and-tests)`
