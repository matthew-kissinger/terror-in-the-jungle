# Task: fixed-wing-model-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-14-fixed-wing-and-airframe-tests` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/vehicle/FixedWingModel.ts` (957 LOC) into 4 helpers.

## Required reading

- `_split-template.md`
- `src/systems/vehicle/FixedWingModel.ts`
- `docs/ARCHITECTURE.md` (Air Vehicle Systems section)

## Files touched

- New: `src/systems/vehicle/fixedWing/FixedWingStateMachine.ts` — state transitions (parked → lineup → takeoff_roll → ... → rollout) (≤500 LOC)
- New: `src/systems/vehicle/fixedWing/FixedWingRepositionHelpers.ts` — runway / approach reposition (≤300 LOC)
- New: `src/systems/vehicle/fixedWing/FixedWingVisuals.ts` — per-aircraft visual updates (≤300 LOC)
- New: `src/systems/vehicle/fixedWing/FixedWingNPCSimulation.ts` — only-simulate-piloted-aircraft logic (≤300 LOC)
- Each + `*.test.ts`
- Modified: `FixedWingModel.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template + `npm run probe:fixed-wing` clean.

## Reviewer: none required
## Playtest required: yes (fixed-wing flight feel)

## Branch + PR

- Branch: `task/fixed-wing-model-split`
- Commit: `refactor(vehicle): split FixedWingModel into 4 helpers (fixed-wing-model-split)`
