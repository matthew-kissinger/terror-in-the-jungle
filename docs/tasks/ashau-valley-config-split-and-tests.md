# Task: ashau-valley-config-split-and-tests

Last verified: 2026-05-09

Cycle: `cycle-2026-05-15-telemetry-warsim-navmesh-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/config/AShauValleyConfig.ts` (763 LOC, **0 tests**) into 2-3
helper config files + add ≥3 behavior tests for the public surface.

## Files touched

- New: `src/config/ashau/TerrainConfig.ts` — terrain dimensions, DEM source, biome bands (≤300 LOC)
- New: `src/config/ashau/SpawnConfig.ts` — faction spawn points, capturable zones (≤300 LOC)
- New: `src/config/ashau/HydrologyConfig.ts` — river / channel / pond definitions (≤300 LOC) — only if needed; otherwise inline
- New: `src/config/ashau/AShauValleyConfig.test.ts` — ≥3 behavior tests:
  - Terrain config exports valid DEM dimensions
  - Spawn config has at least one US + one NVA point
  - Hydrology config defines at least one river channel
- Modified: `AShauValleyConfig.ts` — orchestrator ≤300 LOC, re-exports the helper configs
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template + `npm run perf:capture:ashau:short` clean.

## Reviewer: terrain-nav-reviewer pre-merge
## Playtest required: yes (A Shau Valley feature placement + spawn + hydrology unchanged)

## Branch + PR

- Branch: `task/ashau-valley-config-split-and-tests`
- Commit: `refactor(config): split AShauValleyConfig + add tests (ashau-valley-config-split-and-tests)`
