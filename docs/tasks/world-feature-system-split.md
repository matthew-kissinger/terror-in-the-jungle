# Task: world-feature-system-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-14-fixed-wing-and-airframe-tests` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/world/WorldFeatureSystem.ts` (802 LOC) into 3 helpers.

## Required reading

- `_split-template.md`
- `src/systems/world/WorldFeatureSystem.ts`

## Files touched

- New: `src/systems/world/world-features/FeaturePlacement.ts` — terrain-aware placement decisions (≤400 LOC)
- New: `src/systems/world/world-features/FeatureAssetMgr.ts` — asset GLB loading + pool wiring (≤300 LOC)
- New: `src/systems/world/world-features/ZoneStampPolicy.ts` — zone stamp policy (e.g. firebases, airfields) (≤300 LOC)
- Each + `*.test.ts`
- Modified: `WorldFeatureSystem.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. Special concern: A Shau Valley feature placement has been
fragile in past cycles (zones in ditches, firebase pads on slopes). Verify
in playtest that A Shau placement is unchanged after the split.

## Reviewer: terrain-nav-reviewer pre-merge
## Playtest required: yes (A Shau Valley feature placement walkthrough)

## Branch + PR

- Branch: `task/world-feature-system-split`
- Commit: `refactor(world): split WorldFeatureSystem into placement + assetMgr + zoneStamp (world-feature-system-split)`
