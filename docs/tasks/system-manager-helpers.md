# Task: system-manager-helpers

Last verified: 2026-05-09

Cycle: `cycle-2026-05-15-telemetry-warsim-navmesh-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Drop `SystemManager.ts` method count from 60 → ≤50 by factoring lifecycle helpers. Method count is the issue, not LOC.

## Required reading

- `_split-template.md`
- `src/core/SystemManager.ts`
- `src/core/SystemInitializer.ts` (already extracted)
- `src/core/SystemConnector.ts` (already extracted)
- `src/core/SystemUpdater.ts` (already extracted)

## Files touched

- New: `src/core/system/SystemDisposer.ts` — system teardown helpers (≤200 LOC)
- New: `src/core/system/SystemDeferredStarter.ts` — deferred init helpers (≤200 LOC)
- Each + `*.test.ts`
- Modified: `SystemManager.ts` — methods migrated to helpers; ≤50 methods retained
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. `npm run probe` (engine-health-probe) clean — system lifecycle unchanged.

## Reviewer: none required
## Playtest required: no (boot-shape sanity only)

## Branch + PR

- Branch: `task/system-manager-helpers`
- Commit: `refactor(core): factor SystemManager lifecycle into disposer + deferredStarter (system-manager-helpers)`
