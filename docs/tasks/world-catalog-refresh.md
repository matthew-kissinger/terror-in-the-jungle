# world-catalog-refresh

Cut all building/structure/prop placements over to the normalized repaint
catalog: placement profiles re-derived from measured dims instead of hand
fudges, six net-new buildings join the settlement pools, parked-vehicle
scenery lands at bases. The user sees villages, firebases, and airfields
rebuilt with the new catalog in every mode. Part of
`cycle-2026-06-11-war-asset-repaint`; read
`docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md` (break #5 + debt list)
first.

## Files touched

- `src/systems/assets/ModelPlacementProfiles.ts`
- `src/systems/world/WorldFeaturePrefabs.ts`
- `src/systems/world/FirebaseTemplates.ts`, `src/systems/world/AirfieldTemplates.ts`
- `src/systems/world/WorldFeatureSystem.ts` (only if obstacle/collision
  registration needs dims plumbing)
- Sibling tests for changed `src/systems/**` files

## Scope

1. Re-derive `ModelPlacementProfiles` from `warAssetCatalog` measured dims:
   replace per-asset `displayScale` fudges (fuel-drum/supply-crate/ammo-crate/
   wooden-barrel 0.5 etc.) with target-size-driven normalization or plain 1.0
   where the asset is now real-scale — verify rendered size in-scene per
   asset, do not assume. Sandbag-wall cover height/collision stays untouched
   (REJECTED asset keeps old GLB).
2. Spacing/footprint audit: church (now 18.7m wide), warehouse, french-villa,
   pagoda against MIN_SPACING + zone flat-pad logic (DEFEKT-7 ditch fix must
   stay green); re-verify aircraft-obstacle registration (>3m footprint) with
   new bounds.
3. Wire 6 net-new buildings (buddhist-temple, stilt-house, schoolhouse,
   tea-house, rubber-plantation-mansion, rice-mill) into village/settlement
   prefab pools with sensible rarity (temple/mansion as one-per-settlement
   landmarks).
4. Parked-vehicle scenery via prefabs: t54 at NVA armor point, zil-157 at NVA
   supply depot, m42-duster + ontos at US motor pool (static, non-drivable,
   M35 precedent). pond-heron as paddy-edge scenery dressing where rice
   paddies exist.
5. Per-mode worldgen verification: Open Frontier, A Shau, TDM, ZC each
   generate without overlap/float/ditch regressions; capture overview
   screenshots per mode.

## Non-goals

- No layout-generator algorithm rework (placement intelligence is a known
  separate backlog item). No terrain edits. No modelPaths edits. No touching
  rejected assets' profiles. No `PixelForgePropCatalog` integration.

## Acceptance

- [ ] Firebase + village + airfield overview screenshots in all 4 modes,
      committed to `artifacts/cycle-war-asset-repaint/world/`.
- [ ] A Shau + OF zone/base placement still passes the DEFEKT-7 behavior
      tests (`ZoneDitchPlacement.test.ts` green, no new nudge warnings in a
      worldgen run log).
- [ ] Draw-call/tri delta note for one representative firebase (renderer
      stats before/after) — feeds the cycle's budget exception note.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master`; terrain-nav-reviewer gate applies if any
      `src/systems/terrain|navigation/**` file ends up touched.

## Round 2 / Dependencies

- Depends on: `war-asset-import-pipeline`, `ground-vehicle-glb-cutover`
  (vehicle catalog entries it places).
