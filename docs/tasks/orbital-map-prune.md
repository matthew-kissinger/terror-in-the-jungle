# task/orbital-map-prune

Cycle: `cycle-2026-07-02-greenlight-followthrough`

## Goal

Full prune of the owner-rejected 3D orbital topographic map (owner decision U4:
delete). Git history is the resurrection path.

## Scope (what was deleted / changed)

- The `src/ui/map/orbital/*` directory — entire directory removed (8 source + 4
  test files: `OrbitalRendererRegistry`, `OrbitalTopoMaterial`,
  `OrbitalTopoMapHost`, `OrbitalTopoRenderer`, `OrbitalTopoControls`,
  `OrbitalTopoMap`, `OrbitalTopoMeshBuilder`, `OrbitalTopoMarkers` + their
  `.test.ts`). (Path deliberately shown as a glob so doc-drift does not treat the
  now-deleted directory as a live code path.)
- Write-only wiring removed:
  - `src/core/bootstrap.ts` — orbital imports + `setOrbitalSharedRenderer(...)` call.
  - `src/core/modeStartup/TerrainNavigationStage.ts` — orbital import +
    `setOrbitalLiveTerrain(...)` call + the stale "plain M opens 3D" comment.
- The `scripts/bake-topo-dem.*` bake script deleted + its `knip.ignore` entry
  (`package.json`) removed. No npm script referenced it.
- Baked sidecars deleted: `public/data/heightmaps/{open_frontier,tdm,zone_control}-42-topo-96.f32`
  (+ `.f32.json`). `compress-data-assets.ts` / `sw.js` glob `.f32` generically —
  no topo-specific references to clean. No cloudflare/R2 pin list entry existed
  (only the A Shau DEM is pinned).
- `src/systems/player/PlayerController.test.ts` — removed the vacuous
  `toggleOrbital3D` mock + `.not.toHaveBeenCalled()` assertion (the method no
  longer exists on `FullMapSystem`); kept the behavior assertion that the
  pause-menu tactical action routes to the 2D full map.
- `src/systems/terrain/TerrainSystem.ts` — removed the now-orphaned public
  `getBakedHeightmap()` facade (its only consumer was the deleted orbital map).
  The INTERNAL `surfaceRuntime.getBakedHeightmap()` (a different object) is kept.
  Grandfather snapshot in `scripts/lint-source-budget.ts` re-based down (985/81 →
  974/80) to lock in the shrink.
- Docs: `THIRD-PARTY-ASSETS.md` orbital-topo section replaced with a removal
  note; `docs/asset-provenance/orbital-topo-2026-06/README.md` kept as a
  historical record with a removal banner added.

## Non-goals

- Did NOT touch `src/types/SystemInterfaces.ts` (fenced; no fence change).
- Did NOT touch `DIRECTIVES.md` / `PLAYTEST_PENDING.md` / `CARRY_OVERS.md` /
  `CURRENT.md` (a sibling docs task owns registries).
- KEPT `src/core/tsl/NodeMaterialLibrary.ts` (its `TslNode` type + node builders
  are consumed by `PostGradeNodes`/`HeightFogNode`). Its relief/hypsometric/contour
  named exports become orphaned after this prune but are LEFT in place — the
  export-surface ratchet task counts them; deleting them is out of scope here.

## Validation

- `npm run typecheck`
- `npm run lint`
- `npm run lint:budget`
- `npm run test:run -- src/systems/player/PlayerController.test.ts` and the
  bootstrap / TerrainNavigationStage touch-scope tests.
- `npx knip` (files-level; deleted files leave no dangling imports).
- `npm run check:doc-drift`

## Proposed PLAYTEST_PENDING row

None — this removes unreachable code. The existing 2D-map walk row already
covers the map surface.
