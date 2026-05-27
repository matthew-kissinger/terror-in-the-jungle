# Terrain Compositor Spike — 2026-05-27

Single architectural memo that names a `TerrainCompositor` as the canonical
owner of stamp composition + spatial conflict detection + hydrology feedback,
closing the Open Frontier water-on-walls bug and the airfield
random-mountain/padding bug in one cycle.

## Why now

Owner playtest 2026-05-27: rivers on Open Frontier appear to run on a wall of
elevated terrain. A Shau Valley reads correctly. Same family: the OF airfield
shows uneven flat zones, occasional random mountains inside the footprint, and
incorrect padding at the grade ramp.

Both symptoms come from the same root cause: there is no canonical
compositor. Three independent compilers produce stamps in isolation, get
concatenated, sorted by priority, applied. No spatial overlap detection, no
feedback loop where downstream stamps influence upstream target heights.

## Evidence (primary source, file:line)

- Hydrology priority `40`:
  [src/systems/terrain/hydrology/HydrologyTerrainFeatures.ts:14](../../src/systems/terrain/hydrology/HydrologyTerrainFeatures.ts)
- Hydrology bed stamp uses **baked** `elevationMeters` not current terrain:
  [HydrologyTerrainFeatures.ts:53](../../src/systems/terrain/hydrology/HydrologyTerrainFeatures.ts)
- River surface mesh Y baked once, never re-sampled:
  [HydrologyRiverGeometry.ts:128,171-172](../../src/systems/environment/water/HydrologyRiverGeometry.ts)
- Airfield rect stamps priority `priority + offset + index` (~50);
  envelope `basePriority - 20`:
  [TerrainFeatureCompiler.ts:332,449](../../src/systems/terrain/TerrainFeatureCompiler.ts)
- Airfield datum (`fixedTargetHeight`) sampled from base provider:
  [TerrainFeatureCompiler.ts:222](../../src/systems/terrain/TerrainFeatureCompiler.ts)
- ModeStartupPreparer concatenate + simple sort, zero conflict logic:
  [ModeStartupPreparer.ts:134-136](../../src/core/ModeStartupPreparer.ts)
- Hydrology prebake reads base provider, runs offline:
  [scripts/prebake-hydrology.ts](../../scripts/prebake-hydrology.ts)

A Shau is unaffected because its DEM contains real river valleys (so the
hydrology bake reads the right elevations against the real ground) and its
airfields ship `validateTerrain: false`
([AShauValleyConfig.ts:647,660](../../src/config/AShauValleyConfig.ts)).

## Decision: TerrainCompositor as single source of truth

`src/systems/terrain/compositor/TerrainCompositor.ts` owns the entire stamp
pipeline.

### Contract

```ts
interface TerrainCompositorInput {
  baseProvider: HeightProvider;       // procedural noise (OF) or DEM (A Shau)
  features: TerrainFeatureConfig[];   // airfields, motor pools, helipads
  flow: TerrainFlowConfig[];          // routes, zone shoulders
  hydrology: HydrologyBakeArtifact | null;
  options: { strict: boolean; recomposeHydrology: boolean };
}

interface TerrainCompositorOutput {
  composedProvider: HeightProvider;             // StampedHeightProvider on sorted stamps
  stamps: TerrainStampConfig[];                 // canonical sorted list
  vegetationExclusionZones: TerrainExclusionZone[];
  conflicts: TerrainStampConflict[];            // observed overlaps + resolutions
  waterSurfaceArtifact: HydrologyBakeArtifact | null; // recomposed against composedProvider
}
```

Every stamp carries two new annotations:

- `obstructionPolicy: 'never_below' | 'never_above' | 'override' | 'consult'`
- `targetHeightStrategy: 'baked' | 'sample_at_compose' | 'sample_post_compose'`

Both default to the current behavior so R1 is a behavior-identical wrapper.

### Pass order

1. **Pass A — Collection.** Each compiler returns annotated stamps. No behavior
   change vs today.
2. **Pass B — Spatial conflict graph.** AABB R-tree over stamp envelopes; for
   every overlapping pair, resolve by policy:
   - Hydrology ∩ airfield envelope → `consult`: hydrology cedes target height
     to the airfield's datum sampled at compose time; the hydrology stamp
     keeps its bed-cut depth anchored to the new datum.
   - Hydrology ∩ motor-pool flatten → `never_above`: motor-pool target is
     clamped down to hydrology bed height, or the placement is rejected with
     a logged conflict (a motor pool sitting in a river is a config error).
   - Airfield ∩ flow stamp → `override` by priority; flow stamp's
     `gradeStrength` is reduced inside the airfield's `gradeRadius`.
3. **Pass C — Hydrology feedback** (gated by `options.recomposeHydrology`).
   Walk the original `HydrologyBakeArtifact`'s channel polylines; for each
   point, sample `composedProvider.getHeightAt(point.x, point.z)` and write
   the corrected `elevationMeters` to a **copy** of the artifact. This is
   the artifact the water-surface mesh consumes. The original prebaked
   artifact stays intact for navmesh consumers.
4. **Output composition.** `composedProvider = new StampedHeightProvider(base, sorted)`
   becomes canonical. `waterSurfaceArtifact` is the recomposed copy.
   `conflicts` is surfaced to telemetry + the diagnostic overlay.

### Why this fixes both bugs

- **Water-on-walls:** Pass C re-anchors river elevation to the composed
  terrain. The water surface mesh, fed the recomposed artifact at
  `HydrologyRiverSurface.setArtifact(...)`, sits on the actual ground —
  including over airfield-flattened ground where the old baked elevation
  diverged.
- **Airfield random-mountains + padding:** Pass B detects the cases where the
  airfield's `gradeRadius` (the envelope's outer ramp) overlaps a stamp it
  isn't aware of, including hydrology. Stamps with
  `targetHeightStrategy: 'sample_post_compose'` (the new airfield-envelope
  strategy) re-sample their datum after lower-priority context has composed,
  so the envelope no longer flattens to a stale base-noise value.

## What we borrow from HLS_WebGPUPlugins (and what we reject)

The HLS repo
([github.com/hlsvortex/HLS_WebGPUPlugins](https://github.com/hlsvortex/HLS_WebGPUPlugins))
is MIT-licensed, TypeScript, Three.js + TSL — compatible enough to borrow
patterns. Their pipeline (per
[docs/GPU_PIPELINE.md](https://github.com/hlsvortex/HLS_WebGPUPlugins/blob/master/docs/GPU_PIPELINE.md)):

```
GraphGenerator (CPU, Delaunay) → riverMapTex
riverMapTex → height.compute.wgsl → rawHeightTex
rawHeightTex → height_blur.compute.wgsl → heightTex
heightTex → biome.compute.wgsl → biomeTex
biomeTex → spawn.compute.wgsl → spawnTex
```

### Borrow

- **Inversion of control: hydrology is an INPUT to height, not a separate
  stamp.** HLS's `height.compute.wgsl` reads `riverMapTex` (R: pixelVal,
  G: flow, B: procH, A: regionId) as the very first operation; rivers exist
  in the height field by definition. Our Pass C is the same idea expressed
  in our existing CPU pipeline: rebuild the hydrology artifact against the
  composed provider so the water mesh and the terrain mesh see the same
  height field.
- **Producer→texture→consumer chain discipline.** HLS's
  `GraphGenerator.js → riverMapTex → height.compute.wgsl` is a clean
  producer-consumer chain. Our mirror: `HydrologyBake → HydrologyBakeArtifact
  → TerrainCompositor → waterSurfaceArtifact → HydrologyRiverSurface`. If we
  close the feedback loop (Pass C), it becomes that exact shape.
- **Plugin lifecycle pattern.** Useful for the worldbuilder runtime-edit path
  (out of scope this cycle but on the horizon).

### Reject

- **All-GPU-compute pipeline.** Too far from our architecture (DEM source,
  navmesh prebake, CDLOD with skirts + edge morph, worker parity, web-worker
  terrain pool, IndexedDB cache). 4+ weeks of forklift for no perf win since
  our heightmap bake is already off the main thread.
- **HLS's `flattenTerrainAround(x, z, r, y, strength)` mutation API.** Our
  `StampedHeightProvider` chain is cleaner; we should not regress to
  mutation.
- **HLS's monolithic `TerrainSystem.js`.** Couples compute, LOD, materials,
  callbacks, decals. Our split (`TerrainSystem` + `CDLODRenderer` +
  `StampedHeightProvider` + `ModeStartupPreparer` + new `TerrainCompositor`)
  stays healthier.

## Implementation phases

R1 — Foundation (parallel-safe, all behavior-identical):
- **R1.1 `terrain-compositor-skeleton`** — new module + types + plumbing
  through `ModeStartupPreparer` as a NO-OP wrapper around the current
  three-compiler concat-and-sort. Contract surface + unit tests.
- **R1.2 `compositor-conflict-detection`** — AABB R-tree + overlap
  enumeration. Logging-only, no behavior change. Tests on known OF
  airfield ∩ hydrology conflict + synthetic cases.
- **R1.3 `compositor-stamp-policy-annotations`** — extend
  `TerrainStampConfig` with `obstructionPolicy` + `targetHeightStrategy`.
  All three existing compilers annotate their outputs with defaults that
  preserve current behavior.

R2 — Behavioral changes (depends on R1):
- **R2.1 `compositor-stamp-policy-resolver`** — implement
  consult / never_above / never_below / override. Airfield wins height
  fights but hydrology preserves bed depth anchored to new datum. Motor
  pool placement inside river logs a conflict.
- **R2.2 `compositor-hydrology-feedback`** — Pass C. Re-sample river
  elevations against composed provider. `HydrologyRiverSurface` consumes
  the new artifact. Navmesh consumers untouched. Mandatory
  `terrain-nav-reviewer`.
- **R2.3 `compositor-debug-overlay`** — dev-only overlay showing stamp
  AABBs + conflict edges via the existing `Shift+\` diagnostic surface.

R3 — Validation:
- **R3.1 `compositor-of-acceptance-captures`** — capture script asserts no
  OF water hovers >0.5m above terrain at any of the 3 OF water-feature
  spawns; assert no random-mountain in airfield footprint.
- **R3.2 `compositor-playtest-evidence`** — PLAYTEST_PENDING row for owner
  walk on OF + A Shau.

## Acceptance

1. `OperationalRuntimeComposer.bindSpawnedWatercraftRuntime` reports
   `surfaceY` within 0.5m of
   `TerrainSystem.getHeightAt(spawn.x, spawn.z) + 0.85` for all OF
   Sampan + PBR spawn points.
2. `scripts/capture-of-water-airfield-shots.ts` produces zero post-merge
   frames with `hoverAboveTerrainMeters > 0.5`.
3. `terrain-nav-reviewer` APPROVE on R2.2 (Pass C is load-bearing).
4. `combat120` p99 within ±2ms of baseline (compositor adds compose-time
   cost, not frame-time cost).
5. Owner playtest: OF + A Shau river render correctly from helicopter
   altitude and on watercraft routes; OF airfield reads as flat with
   smooth padding.

## Non-goals

- Worldbuilder runtime stamp editing (future cycle).
- CDLOD / skirts / edge-morph rework.
- Watercraft physics.
- WGSL compute port of the height path (see §"Reject").
- Vegetation pipeline changes beyond `vegetationExclusionZones` plumbing.

## Risks

- **Compose time creep.** Pass C re-bakes hydrology in JS. Mitigate: only
  re-sample river points whose AABB overlaps a non-hydrology stamp; cache by
  `(stamps-hash, hydrology-artifact-hash)` to IndexedDB/OPFS.
- **Worker parity drift.** `terrain.worker.ts` needs the same
  `composedProvider`. The May 19 DEMSampling.ts unification is precedent for
  the fix shape.
- **Navmesh desync.** Navmesh consumes the **pre-feedback** hydrology
  artifact. Pass C must produce a copy and leave the original untouched.

## Sequencing

This cycle blocks `cycle-vekhikl-5-fleet-expansion` (more vehicles = more
layout overlap risk against the new conflict surface) and clears the path
for any future polish targeting the OF airfield or motor-pool reflow.

## Open questions to resolve in R1.1 dispatch

1. R-tree vs flat O(n²) overlap scan — at OF's ~150 stamps the flat scan is
   ~22K compares per startup; pick the simpler one unless we have evidence.
2. IndexedDB/OPFS cache key shape — defer until Pass C exists and we
   measure compose-time cost.
3. Where the `Shift+\` overlay keybind lands without colliding with the
   existing seam-highlighter `Y` chord (memory note from 2026-05-08).
