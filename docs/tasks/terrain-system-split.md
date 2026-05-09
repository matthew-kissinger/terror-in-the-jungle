# Task: terrain-system-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-15-telemetry-warsim-navmesh-split` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/terrain/TerrainSystem.ts` (753 LOC, 60 methods) into 2 helpers. Drop method count to ≤50.

## Required reading

- `_split-template.md`
- `src/systems/terrain/TerrainSystem.ts`
- `src/types/SystemInterfaces.ts` — `ITerrainRuntime` and `ITerrainRuntimeController` are fenced; do NOT change them

## Files touched

- New: `src/systems/terrain/TerrainCore.ts` — height query cache, CDLOD morphing, frustum culling (≤500 LOC)
- New: `src/systems/terrain/TerrainStreamingFacade.ts` — feature compilation, streaming scheduler hook (≤300 LOC)
- Each + `*.test.ts`
- Modified: `TerrainSystem.ts` — orchestrator ≤300 LOC, still implements `ITerrainRuntime` + `ITerrainRuntimeController`
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template + `npm run perf:terrain-probe:ashau:traverse` clean (terrain streaming unchanged).

## Reviewer: terrain-nav-reviewer pre-merge
## Playtest required: yes (A Shau + Open Frontier traversal)

## Branch + PR

- Branch: `task/terrain-system-split`
- Commit: `refactor(terrain): split TerrainSystem into core + streaming facade (terrain-system-split)`
