# dedup-map-renderers

Four canvas map renderers (MinimapRenderer, FullMapSystem,
OpenFrontierRespawnMapRenderer, CommandTacticalMap) each reimplement
world→map coordinate transforms, zone drawing, faction palette lookups, and
vehicle-marker icons — divergence between them is how map bugs happen (a
marker right on the minimap and wrong on the full map). Extract the shared
logic. (Campaign: `docs/CAMPAIGN_2026-06-09-consultation-remediation.md`,
Phase 5.)

## Files touched

- `src/ui/minimap/MinimapRenderer.ts`
- `src/ui/map/FullMapSystem.ts`
- `src/ui/map/OpenFrontierRespawnMapRenderer.ts`
- `src/ui/hud/CommandTacticalMap.ts`
- new shared module under `src/ui/map/` (worldToMap + marker icons + faction
  palette helpers)
- sibling tests (extended; new for the shared module)

## Scope

1. Extract a shared `worldToMap(x, z)` transform (parameterized by viewport/
   zoom/rotation as the four call sites need) into one module.
2. Extract the vehicle-marker / marker-icon drawing + faction palette lookup
   shared by the renderers.
3. Collapse the four renderers onto the shared module; rendering output must
   be visually unchanged (Field Journal styling untouched).
4. L1 tests for the shared transform (known world points → expected map
   points at each renderer's parameterization).

## Non-goals

- Visual redesign (Field Journal look is decided and shipped).
- New map features.
- The deploy-screen map (RespawnMapController) unless it shares the exact
  duplicated code — report if it does, as a follow-up.

## Acceptance

- [ ] Net LOC down across the four renderers (~duplicated transform/zone/
      faction logic removed); report the count.
- [ ] L1 transform tests pass; existing renderer tests still pass.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
