# aircraft-building-collision: register buildings with LOSAccelerator so the airframe sweep sees them

**Slug:** `aircraft-building-collision`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 1
**Priority:** P0 - the single highest-leverage correctness fix in the cycle. One change, eliminates the "phase through buildings after takeoff" symptom permanently.
**Playtest required:** NO (probe-verified via sweep-hit assertion).
**Estimated risk:** low - additive registration, no existing behaviour changes.
**Budget:** <=200 LOC.
**Files touched:**

- Read: `src/systems/combat/LOSAccelerator.ts`, `src/systems/vehicle/airframe/terrainProbe.ts`, `src/systems/terrain/TerrainQueries.ts`, `src/systems/world/WorldFeatureSystem.ts`.
- Modify: `src/systems/world/WorldFeatureSystem.ts` (or wherever buildings finalize spawn) to call `LOSAccelerator.registerChunk` (or the most appropriate public registration API) for building meshes; possibly a small addition in `src/systems/combat/LOSAccelerator.ts` if building registration needs a distinct scope.

Do NOT touch: `src/systems/vehicle/FixedWingModel.ts`, `src/systems/vehicle/airframe/Airframe.ts`. The airframe sweep already queries through `raycastTerrain` via `LOSAccelerator.checkLineOfSight`. Adding buildings to the accelerator is sufficient; no client-side airframe change needed.

## Required reading first

- `src/systems/combat/LOSAccelerator.ts` end-to-end. Identify the registration surface, scope semantics (what is a "chunk"), and whether static building meshes need their own registry.
- `src/systems/vehicle/airframe/terrainProbe.ts:75-140` - verify the sweep path actually returns hits from the accelerator, not only from a terrain-specific query.
- `src/systems/terrain/TerrainQueries.ts:109-121` (`raycastTerrain`) - confirm it dispatches through the accelerator and will pick up new registrations.
- `src/systems/world/WorldFeatureSystem.ts` - how buildings are spawned, when `freezeTransform` runs, where the right hook for registration lives.

## Diagnosis

From the 2026-04-21 diagnostic: `LOSAccelerator.registerChunk` in `src/systems/combat/LOSAccelerator.ts:29` registers terrain chunk meshes only. Buildings are never registered with any system the airframe consults. `FixedWingModel.ts:466` registers the aircraft as a dynamic collision object *for others to see*, but that is one-way; nothing reads that record during the airframe's own sweep.

## Fix

Register every spawned static building mesh with the accelerator at spawn time (immediately after `freezeTransform`). Use the same registration API that terrain chunks use, or add a sibling API (e.g. `registerStaticObstacle`) if the semantics differ (terrain chunks can re-stream; buildings are frozen). Share the underlying BVH data structures; do not invent a parallel index.

## Steps

1. Read all of "Required reading first."
2. Determine whether `registerChunk` accepts static meshes or if a new `registerStaticObstacle` method is needed. If new, match its signature and internal data structures to `registerChunk`.
3. Add the registration call in the building spawn path (probably `WorldFeatureSystem.spawnFeature` after `freezeTransform`). Register only meaningful collidable meshes (not decorative props below some footprint threshold - defer that filter to a constant).
4. Add a deregistration path if buildings can be despawned mid-match. If they cannot, skip and add a comment.
5. Add a Vitest unit covering: an aircraft sweep from before a building to past it returns a hit at the building's near face.
6. Capture a probe assertion that confirms a post-registration aircraft sweep hits a known hangar on `main_airbase`.

## Exit criteria

- Airframe sweep reports building contact when the prev->next segment intersects any registered building mesh.
- At least one hangar and one tower confirmed collidable via probe assertion.
- No regression in `combat120` perf smoke (p99 within 5% of baseline).
- No change in NPC navigation (navmesh is independent of this).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before/after JSON committed to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/aircraft-building-collision/`.

## Non-goals

- Do not implement crash physics or damage (the sweep reporting contact is the whole deliverable; how the airframe responds to that contact is a separate concern).
- Do not register trees or small vegetation (footprint threshold out of scope).
- Do not change the accelerator's spatial data structure.

## Hard stops

- Fence change -> STOP.
- Accelerator registration signature change that other callers would need to migrate -> STOP, file separate prep task.
- Perf p99 regresses > 5% -> STOP, investigate BVH cost before merging.

## Pairs with

`airframe-directional-fallback` (the two together mean aircraft see both terrain and buildings correctly post-rotation).
