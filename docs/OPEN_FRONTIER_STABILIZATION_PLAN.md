# Open Frontier Stabilization Plan

Last updated: 2026-04-07

## Objective

Restore Open Frontier to a stable playable state by fixing the aircraft correctness bug, removing the collision-height CPU tax introduced by staged world props, restoring reliable player hit registration, and cutting the static world-feature draw-call spike caused by the new aircraft/vehicle assets.

## Baseline Evidence

- Current short capture: `artifacts/perf/2026-04-07T03-17-24-101Z`
  - avg frame: `11.51ms`
  - avg draw calls: `781.91`
  - avg triangles: `913,540`
- Latest recovery capture: `artifacts/perf/2026-04-07T04-01-01-963Z`
  - avg frame: `9.89ms`
  - p95 frame: `17.00ms`
  - p99 frame: `29.60ms` (`WARN`)
  - player shots / hits: `234 / 131`
  - overall validation: `WARN` only for `peak_p99_frame_ms` and `heap_peak_growth_mb`
- Last accepted warm Open Frontier baseline: `artifacts/perf/2026-03-04T07-52-39-767Z`
  - avg frame: `6.57ms`
  - avg draw calls: `254.72`
  - avg triangles: `639,428`
- Peak regression evidence: `artifacts/perf/2026-03-19T22-39-45-031Z`
  - avg frame: `13.64ms`
  - avg draw calls: `1,122.88`
  - avg triangles: `1,031,835`

## Findings Driving This Plan

1. `FixedWingModel` sampled `getEffectiveHeightAt()` for placement and physics, so the plane could read its own collision bounds as ground.
2. `TerrainQueries.getEffectiveHeightAt()` scanned every registered collision object and rebuilt bounds on each query, which turned new staged props into a broad CPU regression.
3. Generic world-feature placements bypassed the air-vehicle optimization path and were added as unoptimized static scene graphs.
4. Rebuilt vehicle GLBs introduced many duplicated material variants, so the existing material-UUID batching recovered far less than the geometry layout suggested.
5. Open Frontier combatants were being inserted into the combat spatial grid with Zone Control-sized bounds (`800` world size, `400` half-extent), so nearby enemies were clamped far away inside the octree. Player raycasts then missed local enemies while enemy fire still resolved against the player through their own logic path.

## Execution Checklist

- [x] Capture and document the current regression evidence before changes.
- [x] Fix fixed-wing terrain sampling so planes no longer self-lift on entry/update.
- [x] Cache collision-object bounds for static props and mark moving aircraft as dynamic collision entries.
- [x] Improve static mesh batching so materially-identical submeshes merge even when exporters duplicated material instances.
- [x] Apply static batching to generic world-feature placements so staged helicopters/vehicles stop hitting the renderer as raw scene graphs.
- [x] Re-align combat spatial bounds on game-mode switches so Open Frontier hit registration queries operate on the correct world extents.
- [x] Run targeted tests for terrain queries, fixed-wing behavior, draw-call optimization, world-feature placement, and game-mode spatial bounds.
- [x] Re-run Open Frontier perf capture and compare the renderer counters against the current regression artifact.
- [x] Update `docs/PERFORMANCE.md` and `docs/DEVELOPMENT.md` with the accepted fixes and validation evidence.
- [x] Run `npm run validate`.
- [ ] Commit, push, and confirm CI/deploy status on `master`.

## Recovery Status

- Plane entry/update no longer samples the effective collision overlay as terrain, which removes the self-lift feedback loop.
- Static collision bounds are cached and only dynamic aircraft bounds are recomputed, so staged props no longer amplify every terrain-height query.
- Generic world-feature placements now flow through the static draw-call optimizer instead of always landing in the scene as raw cloned mesh graphs.
- Open Frontier hit registration now uses the correct combat spatial bounds before reseed/spawn, which restores local candidate queries for `raycastCombatants()`.
- The latest Frontier recovery capture is materially healthier than the regression artifact, but not yet back to the March 4 renderer baseline. The remaining measured issues are tail latency (`p99 29.6ms`) and transient heap peak (`35.1 MB`).

## External References

- Three.js `BatchedMesh`: https://threejs.org/docs/pages/BatchedMesh.html
- Three.js `InstancedMesh`: https://threejs.org/docs/pages/InstancedMesh.html
- glTF Transform optimization tooling: https://gltf-transform.dev/
- meshoptimizer / `gltfpack`: https://meshoptimizer.org/gltf/
- `three-mesh-bvh` repository: https://github.com/gkjohnson/three-mesh-bvh
- FCL broad-phase / BVH reference paper: https://gamma.cs.unc.edu/FCL/fcl_docs/webpage/pdfs/fcl_icra2012.pdf

## Out Of Scope For This Pass

- Building a brand-new drivable ground-vehicle runtime.
- Re-authoring the GLBs from scratch if code-side batching/culling is sufficient to recover the mode.
- Re-baselining every perf scenario before Open Frontier evidence is back inside an acceptable band.
