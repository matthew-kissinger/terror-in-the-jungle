# Task: terrain-material-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-15-telemetry-warsim-navmesh-split` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/terrain/TerrainMaterial.ts` (1039 LOC) into 3 helpers.

## Files touched

- New: `src/systems/terrain/material/ShaderUniformBlock.ts` — shader uniforms (≤400 LOC)
- New: `src/systems/terrain/material/AtlasManager.ts` — texture atlas (≤300 LOC)
- New: `src/systems/terrain/material/ImpostorSampling.ts` — impostor sampling logic (≤300 LOC)
- Each + `*.test.ts`
- Modified: `TerrainMaterial.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. **2026-05-08 hotfix concern:** the Z-flip backface-culled
terrain on every map. This split must NOT touch face winding or shader
source. Verify with the new scenario-smoke gate (`npm run check:smoke-scenarios`)
that all 5 scenarios pass mean-luma + black-pixel thresholds.

## Reviewer: terrain-nav-reviewer pre-merge
## Playtest required: yes (visual integrity check across all scenarios)

## Branch + PR

- Branch: `task/terrain-material-split`
- Commit: `refactor(terrain): split TerrainMaterial into shader + atlas + impostor (terrain-material-split)`
