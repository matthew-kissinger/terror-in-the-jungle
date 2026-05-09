# Task: warsim-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-15-telemetry-warsim-navmesh-split` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/strategy/WarSimulator.ts` (788 LOC) into 2 helpers.

## Files touched

- New: `src/systems/strategy/StrategicTick.ts` — strategic-scale tick logic (faction balance, frontline movement) (≤500 LOC)
- New: `src/systems/strategy/MaterializationGate.ts` — materialization tier decisions (which strategic combatants get fully materialized) (≤500 LOC)
- Each + `*.test.ts`
- Modified: `WarSimulator.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. **Important:** materialization-gate decisions are on the path
to Phase F's combat1000 perf gate. If MaterializationGate's split makes the
Phase F port harder, escalate. The gate should expose a small public
interface that can later be replaced by an ECS query.

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes (A Shau Valley with strategic populations)

## Branch + PR

- Branch: `task/warsim-split`
- Commit: `refactor(strategy): split WarSimulator into strategicTick + materializationGate (warsim-split)`
