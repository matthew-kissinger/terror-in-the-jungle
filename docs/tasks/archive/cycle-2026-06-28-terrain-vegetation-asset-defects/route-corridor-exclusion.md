<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 3) -->
# route-corridor-exclusion

From the 2026-06-28 owner playtest: trees grow straight down the centerline of
the gray strategic "trail" patches. `TerrainFlowCompiler` repaints + flattens
route corridors but emits NO vegetation exclusion, so the scatterers happily plant
on the trail. Emit a veg-exclusion corridor along each compiled route so the
trails read as cleared paths. Builds on `veg-poi-exclusion` (which added the hero
scatterer to the exclusion contract).

## Files touched

- `src/systems/terrain/TerrainFlowCompiler.ts` (emit exclusion corridors for routes)
- `src/systems/terrain/TerrainVegetationRuntime.ts` (consume route corridors as exclusion)
- `*.test.ts` (new)

## Scope

1. Have `TerrainFlowCompiler` produce a veg-exclusion region for each route
   corridor (a centerline + width band), alongside the existing repaint/flatten.
2. Feed those corridors into the same exclusion path `veg-poi-exclusion` wired,
   so BOTH ground cards and GLB heroes skip the trail centerline.
3. Width should clear the visible trail without over-clearing the surrounding
   jungle (reuse the route width the compiler already knows).

## Non-goals

- Changing route generation, repaint, or flatten behavior.
- New POI exclusion (that is `veg-poi-exclusion`).
- Navmesh/route-follow changes — this is vegetation exclusion only.

## Acceptance

- [ ] A test asserts a compiled route emits a veg-exclusion corridor and that a
      scatterer candidate on the route centerline is excluded while one well off
      the route is not.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR linking this brief; terrain-nav-reviewer APPROVE; owner walk → PLAYTEST_PENDING.

## Dependencies

- Depends on: `veg-poi-exclusion` (shared exclusion plumbing).
- Reviewer: terrain-nav (`src/systems/terrain/**`).
