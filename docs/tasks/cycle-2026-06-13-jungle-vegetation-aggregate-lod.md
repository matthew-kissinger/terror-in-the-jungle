<!-- Proposed cycle. Source audit: fable5-world-demo + TIJ terrain/vegetation trace, 2026-06-13. -->
# cycle-2026-06-13-jungle-vegetation-aggregate-lod

Status: R1 engineering complete; owner vegetation visual walk deferred to
`docs/PLAYTEST_PENDING.md`. Perf risk is accepted for this vegetation cycle as
an existing non-vegetation frame-tail residual, not as a clean p99 pass.
This is a full vegetation pass: add/remove/change vegetation assets and runtime
tiers until TIJ reads as dense jungle at infantry, vehicle, and flight
distances. Use Fable5 as strategy, not assets; target aggregate LOD while
preserving TIJ terrain, placement, lighting, and startup authority.

## Fable5 Reference Scope
- Heavy reference use: `GroundRing`, `Forests`, `Impostors`, `CanopyShell`,
  `VegLibrary`, and terrain-splat dissolve behavior.
- Adapt this cycle: aggregate ground ring, tree LOD rings, octahedral/far
  impostor strategy, canopy horizon coverage, GPU/indirect cull spike shape,
  and vegetation coverage thinning without visible density bands.
- Do not copy wholesale: Fable5 boot generation, generated species, hydrology,
  water, sky/cloud/post stack, or WebGPU-only runtime assumptions.
- R1 shipped the safe adaptation subset only: `JungleGroundRing`, terrain
  far-canopy coverage, horizon/grounding audit changes, and a limited
  accepted-palm canopy/tree tier. Octahedral impostors, GPU indirect culling,
  broadleaf source assets, and water/cloud/lighting replacement stay out of
  this cycle.

## Swap Out
1. Near-field ground greenery: persistent billboard-cell instances ->
   camera-following `JungleGroundRing`; `VegetationScatterer` keeps mid/far.
2. Distant jungle readability: tint-only horizon -> canopy coverage tier built
   on current terrain material/canopy tint, not a CDLOD replacement.

## Modify
1. Modify scatter/generator ownership only enough to stop double-owning near
   cover and expose biome density, slope, route, and exclusion data.
2. Modify billboard/tree lighting only through `LightingRig`; no parallel fog
   or sun authority.
3. Modify `TerrainMaterial` splat/biome terms so thinned grass dissolves into
   matching ground color, then extend audits for ring/canopy/horizon stats.

## Extend
1. Extend asset tiers: close mesh/card, mid cluster-card, far impostor, and
   canopy-shell coverage for banyan/rubber/mangrove/teak/elephant grass/rice
   paddy/vines/deadfall/palms.
2. Extend `GlobalBillboardSystem` with optional WebGPU indirect/cull backend
   for mid/far vegetation after CPU-authored proof.
3. Extend `check:vegetation-horizon` and `check:vegetation-grounding`.

## Controlled Burn
- Do not port demo `Heightfield`, erosion, hydrology, `WaterSurface`, `SunSky`,
  `PostStack`, or full `Forests` wholesale.
- Do not implement true meshlet Nanite; use instance/aggregate culling first.
- Do not resurrect gameplay water or hydrology ribbons.
- Do not bypass WebGL2 fallback without feature gate and fallback rendering.
- Do not import generated demo species as Vietnam jungle assets.

## R0 Evidence
1. Capture Open Frontier and A Shau baselines: `npm run check:terrain-baseline`,
   `npm run check:vegetation-horizon`, `npm run check:vegetation-grounding`.
2. Run `npm run perf:capture:openfrontier:short` and
   `npm run perf:capture:ashau:short` before implementation.
3. Save screenshots/stats for near cover, tree density, far horizon, draw
   calls, triangles, GPU time, and startup marks.

## R1 Split
1. `vegetation-inventory-burn-list` - classify existing and candidate species
   as keep, change, remove, or add before runtime placement starts.
2. `jungle-ground-ring` - camera-following aggregate ground cover with
   deterministic biome sampling, route/base exclusions, rig lighting, and
   WebGPU feature gate/fallback behavior.
3. `jungle-tree-tier-mvp` - add and place 2-3 approved jungle tree families
   with close hybrid trunk/card canopy, mid cluster-card, and far impostor tiers.
4. `canopy-horizon-tier` - far canopy shell/coverage layer once R1 ground
   ring metrics are stable.
5. `vegetation-indirect-cull-spike` - optional WebGPU compacted indirect path
   for mid/far vegetation, measured against the existing billboard backend.

## R1 Implementation Status
- Done: R0 baseline evidence and inventory burn list.
- Done: `JungleGroundRing` runtime slice. Near ground-cover density now uses a
  camera-following ring through `GlobalBillboardSystem`, while
  `VegetationScatterer` keeps non-ground-cover mid/canopy vegetation ownership.
  The ring adapts the Fable5 `GroundRing` strategy with TIJ-authored
  deterministic cells, biome sampling, slope checks, exclusions, distance
  thinning, and existing billboard rendering.
- Done: focused behavior coverage for ring chunk prefixing, budget-throttled
  critical cells, route/base exclusions, removals, and TerrainSystem ownership
  split.
- Done: after-capture evidence. `validate:fast`, `check:tod-coherence`,
  `check:vegetation-horizon`, `check:vegetation-grounding`, and
  `check:terrain-baseline` pass; Open Frontier and A Shau perf captures
  completed with zero browser errors and lower persistent vegetation-imposter
  residency, but still fail existing frame-tail gates.
- Done: limited `jungle-tree-tier-mvp`. Existing accepted Pixel Forge
  `fanPalm` and `coconut` assets are now canopy-tier vegetation families, while
  `bambooGrove` and `bananaPlant` remain mid-level. This uses real accepted
  runtime assets, not the generic Pixel Forge prop-tree GLBs.
- Done: far canopy/horizon tier. `farCanopyTint` now carries explicit
  procedural coverage distance, strength, and scale. The material applies a
  low-cost canopy coverage mask, and `check:vegetation-horizon` reports zero
  bare-band flags across AI Sandbox, TDM, Zone Control, Open Frontier, and
  A Shau.
- Still blocked for later source work: broadleaf/rubber/banyan/mangrove/tree
  diversity. Blocked species (`rubberTree`, `ricePaddyPlants`, `elephantGrass`,
  `areca`, `mangrove`, `banyan`) cannot be silently imported. Existing generic
  Pixel Forge prop trees remain cataloged props, not accepted vegetation
  substitutes.
- Deferred owner walk: route/base/NPC readability, terrain/vegetation lighting
  readability, and first accepted palm-tree tier art direction are tracked in
  `docs/PLAYTEST_PENDING.md`.
- Perf decision: this cycle does not claim a clean perf pass. R0 already failed
  p99 before the vegetation changes. The final Open Frontier rerun fails only
  `peak_p99_frame_ms`; heap checks are WARN with recovery passing, startup
  holds at `3s`, vegetation residency is sharply below R0, and tail attribution
  is render/Other plus combat superposition rather than vegetation.

## R1 Final Evidence
- `npm run validate:fast`: PASS,
  `artifacts/perf/2026-06-13T14-15-50.904Z/doc-drift-gate/doc-drift.json`.
- `npm run check:tod-coherence`: PASS,
  `artifacts/lighting-rig/tod-sweep/gate/verdict.json`; hard lighting checks
  pass, with the non-hard GLB range-ratio advisory still present.
- `npm run check:vegetation-horizon`: PASS,
  `artifacts/perf/2026-06-13T13-47-19-388Z/vegetation-horizon-audit/horizon-audit.json`;
  AI Sandbox, TDM, Zone Control, Open Frontier, and A Shau all report
  `maxBareBand=0m` and `flags=none`.
- `npm run check:vegetation-grounding`: PASS,
  `artifacts/perf/2026-06-13T13-47-19-535Z/vegetation-grounding-audit/summary.json`.
- `npm run check:terrain-baseline`: PASS,
  `artifacts/perf/2026-06-13T13-57-31-759Z/projekt-143-terrain-horizon-baseline/summary.json`;
  captured 4/4 elevated screenshots with renderer stats, terrain metrics, and
  vegetation counters.
- `npm run perf:capture:openfrontier:short`: FAIL existing p99 gate,
  `artifacts/perf/2026-06-13T14-07-00-362Z/summary.json`; only hard failure is
  `peak_p99_frame_ms`; avg `22.44ms`, p99 `100ms`, startup `3s`, heap growth
  `+25.34MB` WARN, heap peak `+65.86MB` WARN, heap recovery `0.615` PASS,
  vegetation `5,184` visible instances / `10,368` triangles, tail attribution
  `render/Other 77.3ms (77%)` plus Combat `22.7ms (23%)`.
- Open Frontier heap diagnostic on the final rerun:
  `artifacts/perf/2026-06-13T14-10-59-387Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`;
  classification remains a WARN/rejected heap attribution, but the source
  capture no longer has hard heap validation failures.
- `npm run perf:capture:ashau:short`: FAIL existing p99 gate,
  `artifacts/perf/2026-06-13T13-53-14-772Z/summary.json`; avg `24.12ms`,
  p99 `100ms`, startup `3s`, vegetation `10,925` visible instances /
  `21,850` triangles, tail attribution `render/Other 97.9%`.

## Acceptance
- [x] Owner approves or edits this cycle before runtime implementation starts.
- [x] No `src/types/SystemInterfaces.ts` change unless separately approved.
- [x] Inventory marks each vegetation asset/tier keep/change/remove/add.
- [x] R0 and after captures include OF/A Shau screenshots and renderer stats.
- [x] Near jungle reads denser without hiding routes, bases, vehicles, or NPCs
      at the engineering-proof level; owner visual approval is explicitly
      deferred in `docs/PLAYTEST_PENDING.md` because final screenshots also
      expose separate lighting/weather readability issues.
- [x] `jungle-tree-tier-mvp` ships real tree assets, not only a manifest.
- [x] OF/A Shau perf does not regress vegetation/startup beyond the approved
      vegetation-cycle budget. Startup holds at `3s`, A Shau heap recovers,
      the final Open Frontier rerun has no hard heap failures, and visible
      vegetation residency is far lower than R0. The global p99 failure remains
      tracked outside this cycle as existing frame-tail/STABILIZAT work.
- [x] `npm run validate:fast`, `npm run check:tod-coherence`,
      `npm run check:vegetation-horizon`, and `npm run check:vegetation-grounding`
      pass before merge.
