<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# compositor-hydrology-feedback

R2.2 of `cycle-terrain-compositor`. Implements Pass C — re-sample river
elevations against the composed provider — and ships the IndexedDB/OPFS
recompose cache in the same PR (owner decision 2026-05-27). Closes the OF
water-on-walls bug: river surface mesh sits on actual ground at airfield
and motor-pool overlaps. Navmesh consumers keep the original artifact.
Design memo: [docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
**Mandatory `terrain-nav-reviewer` pre-merge** (Pass C is load-bearing).

## Files touched

- `src/systems/terrain/compositor/TerrainCompositor.ts` (Pass C wiring under `options.recomposeHydrology`)
- `src/systems/terrain/compositor/HydrologyArtifactRecomposer.ts` (new — pure recompose function)
- `src/systems/terrain/compositor/HydrologyArtifactRecomposer.test.ts` (new)
- `src/systems/terrain/compositor/HydrologyArtifactCache.ts` (new — IndexedDB/OPFS cache, in-memory fallback)
- `src/systems/terrain/compositor/HydrologyArtifactCache.test.ts` (new — fake-indexeddb)
- `src/systems/environment/water/HydrologyRiverSurface.ts` (consume `waterSurfaceArtifact` from output)
- `src/core/ModeStartupPreparer.ts` (flip `options.recomposeHydrology: true`; pass artifact through to river surface)
- `src/systems/terrain/hydrology/HydrologyTerrainFeatures.ts` (flip hydrology bed `targetHeightStrategy` → `sample_post_compose`)
- `src/workers/terrain.worker.ts` (composed-provider parity check — keep original artifact for navmesh path)

## Scope

1. **`recomposeHydrologyArtifact(artifact, composedProvider, conflicts)`**:
   for each channel polyline point, sample
   `composedProvider.getHeightAt(point.x, point.z)` and write the corrected
   `elevationMeters` into a **copy** of the artifact (structuredClone). Bed
   depth stays as the delta from sampled elevation, not absolute Y. Skip
   points whose AABB doesn't overlap any non-hydrology stamp from R2.1's
   conflicts list (perf: only re-sample where it matters).
2. **`HydrologyRiverSurface.setArtifact`** consumes
   `output.waterSurfaceArtifact`. Today's call site bakes river Y once at
   `point.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS`; that
   stays — the offset is fine, the elevations being fed in are the fixed bit.
3. **Navmesh path keeps the ORIGINAL artifact.** Bake hydrology / navmesh
   prebake consumers must NOT see the recomposed copy — they fed the base
   provider, so re-anchoring would corrupt the navigation graph.
   `ModeStartupPreparer` passes `hydrologyArtifact` (input) to bake and
   `output.waterSurfaceArtifact` (recomposed) to river surface.
4. **IndexedDB/OPFS cache.** Cache key: `sha1(stamps.sort-by-priority +
   artifact.version-hash + composedProvider.identity)`. Store the recomposed
   artifact under `terrain-compositor/hydrology-recompose/<key>`. On hit,
   skip the recompose; on miss, write after recompose. In-memory LRU
   fallback when neither IDB nor OPFS is available (test env, headless
   capture). Cache invalidates naturally when any stamp's priority/footprint
   changes.
5. **Flip hydrology bed `targetHeightStrategy`** from `baked` (R1.3 default)
   to `sample_post_compose` so the resolver in R2.1 picks up the new
   elevations consistently.

## Non-goals

- Watercraft physics changes (`OperationalRuntimeComposer.bindSpawnedWatercraftRuntime`
  already reads runtime height; just verify it still works post-merge).
- Worker-side hydrology bake rework (worker keeps the original artifact path).
- WGSL compute port (rejected per memo §"Reject").

## Acceptance

- [ ] OF playtest capture: river Y within 0.5 m of `composedProvider.getHeightAt(x,z) + 0.85` at 8 sample points (4 inside airfield overlap, 4 on clean ground).
- [ ] `OperationalRuntimeComposer.bindSpawnedWatercraftRuntime` reports `surfaceY` within 0.5 m at all OF Sampan + PBR spawn points.
- [ ] A Shau navmesh path identical vs master (graph diff = 0).
- [ ] Cache cold/warm test: second `composeTerrain` call returns the cached recomposed artifact in <5 ms.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] **Mandatory** `terrain-nav-reviewer` APPROVE pre-merge.

## Round 2 / Dependencies

- Depends on: R2.1 (resolved stamps), R1.x (foundation).
- Blocks: R3.1 (acceptance captures), R3.2 (playtest evidence).
