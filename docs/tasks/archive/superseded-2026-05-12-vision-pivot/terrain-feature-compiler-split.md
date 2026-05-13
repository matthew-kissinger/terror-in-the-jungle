# Task: terrain-feature-compiler-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-15-telemetry-warsim-navmesh-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/terrain/TerrainFeatureCompiler.ts` (728 LOC) into 2 helpers.

## Files touched

- New: `src/systems/terrain/featureCompiler/StampMorphCompiler.ts` — stamp morphing + height baking (≤400 LOC)
- New: `src/systems/terrain/featureCompiler/RotationOcclusionBaker.ts` — rotation transforms + occlusion baking (≤300 LOC)
- Each + `*.test.ts`
- Modified: `TerrainFeatureCompiler.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template + airfield/feature placement unchanged across maps.

## Reviewer: terrain-nav-reviewer pre-merge
## Playtest required: yes

## Branch + PR

- Branch: `task/terrain-feature-compiler-split`
- Commit: `refactor(terrain): split TerrainFeatureCompiler into stampMorph + rotationOcclusion (terrain-feature-compiler-split)`
