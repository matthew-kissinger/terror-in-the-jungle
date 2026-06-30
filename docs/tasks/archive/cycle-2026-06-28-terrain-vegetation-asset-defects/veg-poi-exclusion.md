<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 3) -->
# veg-poi-exclusion

Confirmed bug from the 2026-06-28 owner playtest: hero canopy trees grow on the
airfield runway (and other POIs). The GLB hero scatterer is never told about the
exclusion zones — `TerrainVegetationRuntime.setExclusionZones` (~line 273) wires
the ground-card scatterer but omits `glbHeroScatterer`, and
`GLBHeroScatterer.placeHeroSpecies` has no `isExcluded` gate (unlike
`GroundCardScatterer` which checks it ~line 517). Wire the hero scatterer into
the exclusion plumbing so heroes respect POIs (runways, bases, structures).

## Files touched

- `src/systems/terrain/TerrainVegetationRuntime.ts` (~line 273 — also pass zones to glbHeroScatterer)
- `src/systems/terrain/GLBHeroScatterer.ts` (add the isExcluded gate to placeHeroSpecies)
- `*.test.ts` (new — repro-first)

## Scope

1. In `setExclusionZones`, forward the exclusion zones to `glbHeroScatterer`
   exactly as they are forwarded to the ground-card scatterer.
2. In `GLBHeroScatterer.placeHeroSpecies`, skip any candidate position inside an
   exclusion zone — mirror the `isExcluded` check in `GroundCardScatterer` (~line
   517) so the two scatterers share one exclusion contract.
3. Keep the exclusion-zone data source unchanged (reuse what ground cards use).

## Non-goals

- Route-corridor exclusion (that is `route-corridor-exclusion`, depends on this).
- Changing exclusion-zone shapes/sizes or how POIs register them.
- Retuning density (that is `vegetation-density-retune`).

## Acceptance

- [ ] **Repro-first test** (docs/TESTING.md): with an exclusion zone over a POI,
      assert `GLBHeroScatterer` places NO hero inside it (the bug: heroes ignored
      exclusion) while still placing heroes outside it.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR linking this brief; terrain-nav-reviewer APPROVE; owner walk → PLAYTEST_PENDING.

## Dependencies

- Blocks: `route-corridor-exclusion` (shared exclusion plumbing).
- Reviewer: terrain-nav (`src/systems/terrain/**`).
