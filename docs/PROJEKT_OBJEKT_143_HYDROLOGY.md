# Projekt Objekt-143 Hydrology Track

Last updated: 2026-05-06

This note folds the owner request for reusable procedural hydrology into
Projekt Objekt-143 KB-TERRAIN. The target is not another flat/global water
shader. The target is a bakeable hydrology layer that can drive rivers,
wetlands, bank vegetation, trail crossings, terrain carving, and future water
surface flow in both DEM maps such as A Shau and procedural maps such as Open
Frontier.

## Current Local Slice

- Reusable bake core:
  `src/systems/terrain/hydrology/HydrologyBake.ts`.
- Runtime-facing manifest/cache loader:
  `src/systems/terrain/hydrology/HydrologyBakeManifest.ts`.
- Feature-gated vegetation-biome classifier candidate:
  `src/systems/terrain/hydrology/HydrologyBiomeClassifier.ts`.
- Reusable river-corridor sampling helper:
  `src/systems/terrain/hydrology/HydrologyCorridor.ts`.
- Provisional hydrology channel water-surface consumer:
  `src/systems/environment/WaterSystem.ts`, wired from
  `src/core/ModeStartupPreparer.ts`.
- Focused behavior tests:
  `src/systems/terrain/hydrology/HydrologyBake.test.ts`,
  `src/systems/terrain/hydrology/HydrologyBakeManifest.test.ts`,
  `src/systems/terrain/hydrology/HydrologyBiomeClassifier.test.ts`, and
  `src/systems/terrain/hydrology/HydrologyCorridor.test.ts`, plus
  hydrology river-surface behavior coverage in
  `src/systems/environment/WaterSystem.test.ts`.
- Static A Shau/Open Frontier audit command:
  `npm run check:projekt-143-terrain-hydrology`.
- Durable bake commands:
  `npm run hydrology:generate` and `npm run check:hydrology-bakes`.
- Durable bake manifest:
  `public/data/hydrology/bake-manifest.json`.
- Durable cache assets:
  `public/data/hydrology/a_shau_valley-hydrology.json` and
  `public/data/hydrology/open_frontier-42-hydrology.json`.
- Production build static-copy proof:
  `npm run build` copies the durable caches to `dist/data/hydrology/*`.
- Default runtime startup/liveness proof:
  `artifacts/perf/2026-05-06T09-51-26-258Z/summary.json` for Open Frontier and
  `artifacts/perf/2026-05-06T09-52-17-998Z/summary.json` for A Shau.
- Current water-system contract audit:
  `artifacts/perf/2026-05-06T10-07-20-371Z/projekt-143-water-system-audit/water-system-audit.json`.
- Current completion audit:
  `artifacts/perf/2026-05-06T11-03-38-131Z/projekt-143-completion-audit/completion-audit.json`.
- Current headed runtime water proof:
  `artifacts/perf/2026-05-06T10-26-04-620Z/projekt-143-water-runtime-proof/water-runtime-proof.json`.
- Latest audit:
  `artifacts/perf/2026-05-06T10-46-48-051Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`.
- Latest terrain distribution audit:
  `artifacts/perf/2026-05-06T10-46-38-709Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
- Current elevated terrain horizon proof:
  `artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`.
- Review masks:
  `artifacts/perf/2026-05-06T10-46-48-051Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-mask.png`
  and
  `artifacts/perf/2026-05-06T10-46-48-051Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-mask.png`.
- Cache artifacts:
  `artifacts/perf/2026-05-06T10-46-48-051Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-cache.json`
  and
  `artifacts/perf/2026-05-06T10-46-48-051Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-cache.json`.

The current bake core implements deterministic D8-style flow direction and flow
accumulation over a sampled height grid, with an optional epsilon-fill
depression pass so pit cells can route back toward an outlet. It also exposes a
shared `createHydrologyMasks` API for wet/channel masks, which the current
audit uses to generate JSON metrics and PNG review overlays. It is intentionally
pure and does not touch renderer/runtime state, so it is safe to develop while
the machine is too noisy for perf captures.

The bake core now also has a cache-artifact contract:
`createHydrologyBakeArtifact`, `materializeHydrologyMasksFromArtifact`, and
world-position mask sampling. The audit writes per-map JSON cache artifacts with
schema version `1`, sparse wet/channel cell lists, thresholds, transform data,
and bounded channel polylines. The cache now has runtime consumers for
vegetation classification, material masks, and provisional river-strip water;
the audit JSON remains static evidence, not visual acceptance.

`scripts/prebake-hydrology.ts` makes that cache durable in `public/data/hydrology`.
The manifest currently covers A Shau's DEM and the approved Open Frontier seed
`42`; withheld Open Frontier seeds stay out of the hydrology bake for the same
reason they are withheld from the map registry until per-seed presets exist.

`HydrologyBakeManifest.ts` now gives runtime consumers a typed loader for
`/data/hydrology/bake-manifest.json`, explicit seed-aware manifest selection,
relative asset URL resolution, and schema checks for cache JSON. A Shau and
Open Frontier now default-enable hydrology cache preload and
`HydrologyBiomeClassifier.ts` for vegetation-cell classification through their
mode configs. Startup keeps hydrology optional: if a cache is missing or stale,
it logs a WARN and continues without the hydrology classifier instead of
blocking mode startup. `TerrainSurfaceRuntime.ts` now materializes the same
wet/channel masks as a GPU texture for `TerrainMaterial.ts`, so A Shau and Open
Frontier can tint/blend ground materials from the accepted hydrology cache
instead of relying only on broad elevation/slope terrain rules.

`WaterSystem.ts` now also has a separate map-space hydrology river-strip
consumer. It generates one batched transparent mesh from cached
`channelPolylines` and leaves the existing global water plane intact as the
Open Frontier ocean/lake fallback. A Shau can therefore keep `waterEnabled:
false` for the sea-level plane while still receiving DEM-following stream
surfaces from the hydrology cache. The headed runtime proof records Open
Frontier with `12` channels / `592` segments and global water still enabled,
and A Shau with `12` channels / `552` segments and global water disabled. This
is provisional rendering, not final stream acceptance.

`HydrologyCorridor.ts` now turns cached `channelPolylines` into a world-space
sampling contract: channel, bank, wetland, or upland based on distance to the
nearest polyline segment, plus nearest-point metadata. This is deliberately a
pure helper, not a runtime enablement. It gives future terrain-material,
vegetation, trail-crossing, audio, and river-mesh work one shared corridor
contract instead of each system inventing its own distance test.

The latest hydrology audit is PASS for the runtime classification contract:

- A Shau DEM wet candidates cover `6.24%` of sampled cells; runtime
  hydrology-backed `riverbank`/`swamp` classification covers `100%` of those
  wet candidates, leaves `0%` dense-jungle wet candidates, and has no broad
  dry-cell leakage at this audit resolution.
- Open Frontier procedural wet candidates cover `2.47%` of sampled cells;
  runtime hydrology-backed `riverbank` classification covers `100%` of those
  wet candidates, leaves `0%` dense-jungle wet candidates, and has no broad
  dry-cell leakage at this audit resolution.

This closes the stale elevation-proxy problem: A Shau and Open Frontier no
longer need broad base `riverbank`/`swamp` elevation rules for vegetation
classification. A Shau now has a dry lowland `tallGrass` ground-cover band
outside hydrology corridors, and the latest terrain distribution audit clears
the A Shau uniformity flag. The audit still reports WARN overall only because
AI Sandbox samples its random seed mode with the fixed audit fallback.

The bake now also extracts channel paths from thresholded accumulation. Current
static path metrics are `20` A Shau channel paths with a longest path of about
`21.6km`, and `27` Open Frontier procedural channel paths with a longest path
of about `2.8km`. These are branch-start river-graph candidates, not accepted
runtime rivers. The latest JSON also stores bounded world-space
`channelPolylines` for the top paths so the next branch can start from map-space
river corridor candidates instead of re-deriving pixel paths inside the runtime.

The water-system audit makes the current renderer baseline explicit:
`WaterSystem` is a camera-following global `Y=0` Three.js water plane, A Shau
disables that plane, and Open Frontier still combines the default global water
with procedural negative-height water/lake/river-valley carving. A Shau already
has a separate river-polyline data asset with `70` river entries; the current
runtime strip path consumes the generated hydrology cache `channelPolylines`,
not that legacy asset. The latest completion audit records the hydrology loader
as `default_mode_preload`, the vegetation classifier as
`default_mode_vegetation_classifier`, and the terrain material path plus
provisional river-strip water consumer as wired. It still keeps final stream
visuals, water gameplay queries, and hydrology ecology acceptance open until
matched browser screenshots/perf and human review exist.

The latest terrain horizon proof is PASS at
`artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`.
It captures four Open Frontier/A Shau elevated screenshots with renderer,
terrain, vegetation, and browser-error checks all passing, and it links the
trusted Open Frontier/A Shau perf summaries used as current before evidence.
This is runtime terrain evidence only; final far-horizon art still needs human
visual acceptance and matched after proof for any future branch.

## Research Basis

- D8 flow routing is the conservative first step for raster DEMs: each pixel
  flows to one of eight neighbors along steepest descent. It is simple,
  deterministic, and matches the current audit need.
- The current epsilon-fill pass is a conservative raster routing step, not a
  final geomorphology model. Breaching, channel simplification, and authored
  outlet policy are still needed before the bake becomes an accepted runtime
  hydrology system.
- Procedural river work should eventually move beyond masks: river trajectories
  should carve beds into terrain and produce water-surface flow data instead of
  only selecting a wet biome.
- River networks are a strong terrain-organizing primitive. For Open Frontier,
  the river graph should be generated as a map feature before final terrain and
  vegetation distribution are accepted, not painted on afterward as a generic
  plane.
- Current primary-source review reinforces the local shape:
  - DEM flat/depression treatment is not optional. Flow direction,
    accumulation, stream-channel extraction, and topographic indices depend on
    a rectified DEM, and untreated sink/flat pixels produce broken flow paths.
    TIJ's epsilon-fill is an acceptable first cache format, but the next branch
    should add explicit outlet/breach policy rather than piling more thresholds
    on top of the current fill.
  - Procedural riverscape work should treat a river as geometry plus terrain
    modification plus flow, not just a water-colored mask. The future runtime
    branch should therefore go through `HydrologyCorridor` to
    `TerrainFlowCompiler` carve stamps and only then into a river-water mesh.
  - Hydrology-based terrain generation literature uses river graphs and
    watershed decomposition as terrain-organizing primitives. For Open Frontier,
    choose stable seed/outlet/channel rules before terrain material and
    vegetation acceptance, especially before withheld seed variants are added.
  - Vietnam vegetation research supports hydrology-aware clustering: bamboo
    communities in a southern Vietnam reserve are reported as associated with
    stream corridors, water bodies, increased moisture, and dendritic stream
    structure. This supports the owner request for bamboo groves and palm or
    understory pockets near wet corridors instead of an evenly spaced species
    mix everywhere.

Primary references used for this direction:

- DEM flats/depressions and flow direction: Pan, Stieglitz, and McKane, 2012,
  https://research.fs.usda.gov/treesearch/48121
- D8 / drainage basins: Scherler and Schwanghart, 2020,
  https://esurf.copernicus.org/articles/8/245/2020/
- Depression filling: Planchon and Darboux, 2001 via SAGA GIS docs,
  https://saga-gis.sourceforge.io/saga_tool_doc/8.2.1/ta_preprocessor_3.html
- Procedural riverscapes: Peytavie et al., 2019,
  https://diglib.eg.org/items/555e713d-c93f-4c7c-987e-674f7153d34d
- Hydrology-based procedural terrain: Genevaux et al., 2013,
  https://www.cs.purdue.edu/cgvlab/www/resources/papers/Genevaux-ACM_Trans_Graph-2013-Terrain_Generation_Using_Procedural_Models_Based_on_Hydrology.pdf
- Vietnam bamboo/moisture landscape pattern reference: Komarova et al., 2025,
  https://www.mdpi.com/2073-445X/14/10/2003

## Proposed System Shape

### Bake Inputs

- Height grid from DEM, procedural height provider, or future authored map
  heightfield.
- World transform: grid size, cell size, origin, and mode seed.
- Optional boundary policy: outlets on map edge, ocean/lowland sinks, authored
  mouths, or gameplay-required crossings.
- Optional masks: no-river zones, base pads, route/trail corridors, landing
  zones, airfields, and playable-objective buffers.

### Bake Outputs

- `flowDirection`: downslope neighbor index or encoded direction.
- `flowAccumulation`: contributing area per cell.
- `wetness`: normalized mask for soil/vegetation/material blending.
- `channel`: thresholded river/stream candidate mask.
- `cacheArtifact`: sparse wet/channel cells, thresholds, world transform, and
  bounded channel polylines for mode-level bake manifests.
- `bank`: dilated channel shoulder mask for palms, elephant ears, ferns, mud,
  and disturbed trail edges.
- `riverPolyline`: simplified stream graph for rendering, crossings, audio,
  tactical cover, and future water-surface flow.
- `carveStamps`: terrain-flow stamps for riverbeds, banks, trail crossings, and
  dry gullies.

### Runtime Consumers

- `TerrainFlowCompiler`: riverbed/streambank carve stamps and trail crossings.
- `TerrainBiomeRuntimeConfig`: hydrology-backed biome selection instead of
  broad elevation-only `riverbank`/`swamp` bands.
- `ChunkVegetationGenerator`: bank/wetland species placement, trail-edge
  transitions, and reduced uniform scatter.
- `TerrainMaterial`: wet soil, mud, bank, and shallow-water material masks.
- `WaterSystem`: provisional river mesh strips from cached channel polylines,
  still missing flow vectors, crossings, and final visual proof.

### Local Integration Findings

- `TerrainFlowCompiler.ts` already has the right shape for route/trail stamps:
  it emits flow paths, capsule terrain stamps, and `jungle_trail` surface
  patches. Hydrology riverbeds should follow the same contract rather than
  adding a parallel terrain-edit system.
- `ModeStartupPreparer.ts` and `TerrainSystem.ts` now support hydrology preload
  and hydrology-biome policy by mode config, with global flags still available
  for forced probes.
- `VegetationScatterer.ts` can classify a cell through
  `HydrologyBiomeClassifier` after the base elevation/slope biome. That means a
  large-map path can now prove bank/wetland placement without changing water
  rendering.
- `TerrainBiomeRuntimeConfig.ts` can include hydrology-only material biomes,
  and `TerrainMaterial.ts` samples a sparse RGBA hydrology mask texture to
  prefer wet/channel biome slots in shader color and roughness selection.
- `TerrainMaterial.ts` still has a shader-side lowland wetness tint based on
  slope/elevation. That remains useful fallback atmosphere, but the new
  hydrology mask path is the cache-backed material consumer.
- `WaterSystem.ts` now draws cached hydrology channel polylines as batched
  map-space strips independent of the global water-plane toggle. This is the
  first runtime stream-surface consumer, but it is not yet accepted art.
- `AShauValleyConfig.ts` and `OpenFrontierConfig.ts` no longer carry broad
  elevation/slope `riverbank` or `swamp` base rules. Wet/channel ecology is now
  owned by the baked hydrology classifier, while broader visual variety remains
  a separate clustered vegetation/ground-cover problem.
- `ChunkVegetationGenerator.ts` already supports clustered mid-level placement
  and `vegetationTypes.ts` has bamboo cluster tuning. The missing piece is
  corridor-aware permissioning: bamboo, palms, and ground-cover candidates
  should be allowed by channel/bank/wetland/trail/upland zones, not just by a
  global biome palette.
- A Shau already has two water-adjacent data sources that must be reconciled
  before any river-rendering claim: `public/data/vietnam/a-shau-rivers.json`
  carries `70` authored/imported river polylines totaling about `77.0km`, while
  `public/data/hydrology/a_shau_valley-hydrology.json` carries `12`
  DEM-generated channel polylines totaling `94.8km` by stored path length
  (`105.4km` by point-geometry measurement), plus `4,120` wet candidate cells
  and `1,322` channel candidate cells. The next branch should choose a
  snap/merge/authority policy instead of rendering both independently or
  ignoring one.
- Open Frontier currently has no separate authored river layer in `public/data`;
  the seed-42 cache has `12` generated channel polylines totaling `9.8km` by
  stored path length (`11.2km` by point-geometry measurement), `1,629` wet
  candidate cells, and `1,322` channel candidate cells. That makes Open
  Frontier the better pilot for fully procedural outlet/channel policy, while A
  Shau needs reconciliation with the existing river asset.

## Map-Specific Direction

### A Shau Valley

Use DEM-derived hydrology first. The current audit shows A Shau already has
strong drainage candidates, but the current runtime biome proxy is too broad.
Next branch should cache the hydrology result and feed it into biome/material
classification as a mask, while explicitly reconciling the existing
`a-shau-rivers.json` river polylines with the generated channel cache. Final
acceptance still needs ground-level screenshots, elevated screenshots, route/nav
quality evidence, and clean perf captures.

### Open Frontier

Use the same bake interface against the procedural height provider. For
procedural maps, rivers should be generated from the map seed and then baked
into terrain flow:

1. Sample procedural height grid at bake resolution.
2. Run fill/breach plus D8 or D-infinity candidate routing.
3. Select a small number of stable outlets/channels from accumulation.
4. Convert channel cells into simplified polylines.
5. Carve terrain-flow riverbeds and banks.
6. Feed bank/wetness masks to vegetation/materials.
7. Add crossings where routes/trails intersect channels.

This lets Open Frontier grow from a generic water plane into a map with actual
river corridors, banks, crossings, and vegetation ecology.

## Next Implementation Steps

1. Add a breach/outlet-policy pass on top of the current epsilon fill.
2. Generate review images and runtime screenshots that prove the default
   hydrology-backed vegetation classifier improves water-edge ecology without
   damaging accepted vegetation.
3. Visually tune and validate the provisional river-strip surfaces against
   terrain at ground and elevated viewpoints.
4. Promote the Open Frontier seed-42 audit into a per-seed river/channel policy
   before withheld seeds are accepted.
5. Add deterministic cluster zones from hydrology corridors:
   - channel/bank: mud, elephantEar/fern/banana understory, sparse palm pockets;
   - wetland shoulder: dense ground cover and occasional bamboo pockets;
   - drier upland: mixed canopy/understory, not riverbank vegetation;
   - trail crossings: cleared/disturbed edge material and lower vegetation.
6. Generate review images for hydrology masks over terrain, then ground-level
   screenshots. Do this before any perf claim.
7. When the machine is quiet, run matched Open Frontier and A Shau perf captures
   before accepting the hydrology-backed runtime branch.

## Non-Claims

- Current hydrology work changes default vegetation classification for A Shau
  and Open Frontier only; it does not yet prove final visual acceptance.
- Current hydrology work adds provisional river-strip water rendering, but it
  does not accept final stream art, flow, crossings, or gameplay water queries.
- Current hydrology work drives terrain material masks, but it does not accept
  final water-edge visuals.
- Current hydrology work does not close KB-TERRAIN.
- Current hydrology work does not claim Open Frontier or A Shau perf.
- Current hydrology work does not replace a future real stream layer if one is
  imported or authored later.
