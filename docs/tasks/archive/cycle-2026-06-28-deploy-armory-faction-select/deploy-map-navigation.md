<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 5) -->
# deploy-map-navigation

From the 2026-06-28 owner walk: the deploy/respawn map is "atrocious / impossible
to navigate" — especially on A Shau's 21km canvas. Fix the navigation: bound the
pan, add recenter + zoom controls, raise the zoom ceiling and the hit-target
size, and add spawn cycling so the player can actually find and pick a spawn.

## Files touched

- `src/ui/map/OpenFrontierRespawnMap.ts` (pan/zoom state, bounds, recenter, spawn cycling)
- `src/ui/map/OpenFrontierRespawnMapRenderer.ts` (hit-target size, zoom rendering)
- `src/ui/screens/DeployScreen.ts` (map controls wiring)
- `*.test.ts` (new)

## Scope

1. Clamp pan to the map bounds so the canvas can't be dragged off into empty
   space; add a recenter control that returns to a sensible default view.
2. Add zoom controls + raise the zoom ceiling so A Shau's 21km map is usable;
   increase the spawn-point hit-target size so points are easy to select.
3. Add spawn cycling (next/prev spawn) that pans/zooms to the selected spawn, so
   the player can step through spawns without hunting on the canvas.

## Non-goals

- A 3D map (that is `deploy-map-3d-spike`, design-only).
- The helipad label/boardable-heli truth (that is `helipad-spawn-truth`).
- The CREW-A-VEHICLE selectable panel (that is `crew-vehicle-selectable`).
- The armory column (that is `weapon-stats-panel` / `armory-layout-reflow`).

## Acceptance

- [ ] Pan is bounded; recenter + zoom controls work; zoom ceiling raised; spawn
      cycling steps through spawns and frames each. Behavior test asserts pan
      clamps to bounds and spawn cycling advances + recenters the view.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root. **Blocks `helipad-spawn-truth`** (shared spawn/map path — serialize).
- No reviewer. NOTE: `DeployScreen.ts` is also edited by `weapon-stats-panel`
  (the armory column); keep edits localized to the map panel for a clean rebase.
