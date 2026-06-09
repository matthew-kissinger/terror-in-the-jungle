# gameplay-heightmap-resolution

A Shau gameplay terrain queries sample a grid capped by
MAX_HEIGHTMAP_GRID_SIZE — ~42m/sample over a 9m DEM. The over-smoothed grid
gives C0-discontinuous slope, which drives the contour-direction oscillation
identified as the `combat-movement-stall-tail` root (NPC stuck-on-slope). Lift
or tile the gameplay-query resolution so slope is faithful to the DEM. This is
the campaign's highest-uncertainty bet — measure before and after. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 4.)

## Files touched

- `src/systems/terrain/TerrainSurfaceRuntime.ts`
  (MAX_HEIGHTMAP_GRID_SIZE / computeTerrainSurfaceGridSize)
- `src/systems/terrain/TerrainSystem.ts` (syncCpuHeightsToGpu)
- sibling behavior tests (new or extended)

## Scope

1. Lift or tile the gameplay heightmap grid so A Shau CPU height/slope queries
   resolve at (or near) DEM resolution instead of ~42m/sample. Pick lift vs
   tile on memory grounds and document the decision + measured memory delta.
2. Verify and fix the DEM_COVERAGE_METERS=21136 vs 2304×9=20736 drift (~400m
   scale error across the map if real).
3. Behavior test: height/slope sampled across a known steep A Shau profile
   matches DEM-resolution expectations (no 42m smoothing plateau); a contour
   query on an asymmetric ridge returns stable direction.
4. Report before/after memory + any startup-time delta for the A Shau bake.

## Non-goals

- Render-side CDLOD/GPU heightmap changes (gameplay query path only).
- Navmesh regeneration (navmesh-coverage-ashau, a dependent task, owns it).
- Movement-solver tuning (the campaign checkpoint decides that AFTER this
  lands and is re-measured).

## Acceptance

- [ ] Tests above pass; the smoothing/drift repro demonstrated on master
      first (state before/after in your report).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] terrain-nav-reviewer signs off pre-merge.

## Size flag

L — if lift-vs-tile turns into a rework, ship the measured decision + the
minimal faithful-resolution path and report the rest as a proposed split.
