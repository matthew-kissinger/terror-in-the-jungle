# Vegetation Pass Inventory - 2026-06-13

Cycle: `docs/tasks/cycle-2026-06-13-jungle-vegetation-aggregate-lod.md`

Status: R1 engineering complete for the safe vegetation subset. This is the
keep/change/remove/add truth table, the current runtime placement evidence, and
the boundary between approved vegetation work, deferred owner visual review,
and later source/LOD asset work.

## R0 Evidence

| Evidence | Result | Artifact |
|---|---|---|
| `npm run doctor` | PASS | terminal, 2026-06-13 |
| `npm run check:culling-proof` | PASS | `artifacts/perf/2026-06-13T12-40-00-699Z/projekt-143-culling-proof/summary.json` |
| `npm run check:vegetation-grounding` | PASS | `artifacts/perf/2026-06-13T12-39-54-077Z/vegetation-grounding-audit/summary.json` |
| `npm run check:vegetation-horizon` | GAP | `artifacts/perf/2026-06-13T12-39-45-501Z/vegetation-horizon-audit/horizon-audit.json` |
| `npm run check:terrain-baseline` | PASS | `artifacts/perf/2026-06-13T12-40-08-796Z/projekt-143-terrain-horizon-baseline/summary.json` |
| `npm run perf:capture:openfrontier:short` | FAIL existing p99/heap gates | `artifacts/perf/2026-06-13T12-42-33-979Z/summary.json` |
| `npm run perf:capture:ashau:short` | FAIL existing p99 gate | `artifacts/perf/2026-06-13T12-46-36-226Z/summary.json` |

R0 vegetation horizon findings: runtime vegetation reads to about `520m`.
Open Frontier records a `476.79m` bare band. A Shau records a `3479.2m` bare
band because camera/far terrain outpaces the current vegetation tier.

R0 perf attribution is not a pass baseline. Open Frontier had `37,659`
visible vegetation instances / `75,318` vegetation triangles. A Shau had
`78,684` visible vegetation instances / `157,368` vegetation triangles. Both
captures completed with zero browser errors but failed pre-existing frame-tail
validation unrelated to the vegetation inventory decision.

## Runtime Species Burn List

| Species | Current tier | Action | Rationale |
|---|---|---|---|
| `fern` | ground cover impostor | CHANGE | Keep as wet jungle understory, but move near-field density to `JungleGroundRing`; current 250m max distance is not a horizon solution. |
| `elephantEar` | ground cover impostor | CHANGE | Keep for broadleaf wet/riparian patches; move near-field mass to the ring and keep scatterer placement as mid patch accents. |
| `bananaPlant` | mid-level impostor | CHANGE | Keep but reduce as a dominant jungle read; asset is oversampled in legacy optics notes and should be patch accent, not primary tree tier. |
| `bambooGrove` | mid-level impostor | KEEP/CHANGE | Strong Vietnam signal; keep as clustered biome patch, but do not use as the only vertical jungle mass. |
| `fanPalm` | canopy impostor | CHANGE | First accepted canopy/tree-tier family. Keep as palm canopy accent while broader jungle tree assets wait for source-bake approval. |
| `coconut` | canopy impostor | CHANGE | First accepted tall palm tree family. Keep sparse/coastal/riparian until regenerated; current runtime quarantines atlas row/azimuth issues. |
| `giantPalm` | retired | REMOVE | Already owner-retired; do not reintroduce. |

## Candidate Add List

| Candidate | Action | First-cycle use |
|---|---|---|
| Banyan / strangler fig | ADD | Primary jungle tree family for close hybrid trunk/card canopy and far impostor. |
| Rubber/plantation tree | ADD | Repeating mid/tall tree for Open Frontier plantation and A Shau lowland pockets. |
| Mangrove | ADD | Add only where future water/riparian authority can support it; candidate held until placement masks are credible. |
| Teak / broadleaf hardwood | ADD | Secondary canopy tree for A Shau slopes and generic jungle mass. |
| Elephant grass | ADD | Ground-ring blade/tuft layer; first target for Fable5-style coverage-preserving thinning. |
| Rice paddy plants | ADD | Ground/riparian cluster layer near settlements and flat wet fields; no gameplay water dependency. |
| Vines / lianas | ADD | Tree-card canopy and deadfall detail; not a separate high-density draw path in R1. |
| Deadfall / logs / leaf litter | ADD | Ground-ring debris layer, route-safe and base-excluded. |

## Reference Adaptation

- Fable5 `GroundRing` maps to TIJ `JungleGroundRing`: camera-following slots,
  deterministic cell contents, distance thinning, widened survivors, and
  terrain-color dissolve at the outer edge.
- Fable5 `Forests` maps to TIJ tree tiers: close hybrid, mid cluster-card, far
  impostor, and later optional indirect culling.
- Fable5 `CanopyShell` maps to TIJ far canopy coverage, not terrain
  replacement.
- Fable5 `Impostors` maps to future octahedral tree impostors; current R1 can
  start with existing lat/lon impostor rules if source assets are not ready.
- Heavy reference use is strategy-only. R1 did not copy Fable5 assets,
  heightfield, hydrology, water, sky, cloud, post stack, generated species, or
  WebGPU-only renderer assumptions.

## First Runtime Target

1. Added `JungleGroundRing` as a dense near-field fern/elephant-ear ground
   coverage experiment with route/base/vehicle exclusion. It uses the existing
   `GlobalBillboardSystem`, not a new renderer path. Owner follow-up rejected
   the resulting dense camera-following vegetation circle, so normal runtime
   no longer schedules the ring.
2. Reverted normal runtime ownership so `VegetationScatterer` receives accepted
   ground-cover, mid-level, and canopy vegetation types. `JungleGroundRing`
   remains dormant experiment/reference code, not current player-facing
   vegetation ownership.
3. Add `jungle-tree-tier-mvp` with 2-3 tree families only after source
   licensing, Pixel Forge/source-bake approval, and GLB/LOD evidence pass. R1
   starts with the two already accepted tall palm families, `fanPalm` and
   `coconut`, as canopy-tier vegetation. The currently blocked `banyan`,
   `rubberTree`, `mangrove`, `ricePaddyPlants`, `elephantGrass`, and `areca`
   IDs stay blocked.
4. Added far canopy coverage through explicit `farCanopyTint.coverageDistance`,
   `coverageStrength`, and `coverageScale` policy in mode config plus a
   low-cost terrain-material coverage mask. This is the TIJ-owned adaptation of
   Fable5 `CanopyShell`, not a new water/heightfield/forest renderer.

## R1 Runtime Evidence

| Evidence | Result | Notes |
|---|---|---|
| `npm run test:run -- src/systems/terrain/TerrainVegetationRuntime.test.ts src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/VegetationScatterer.test.ts src/systems/terrain/JungleGroundRing.test.ts` | PASS | 47 tests; scatterer owns normal runtime vegetation, dormant ring is not scheduled, stale ring-ownership tests burned |
| `npm run typecheck` | PASS | Source TypeScript check |
| `npm run lint` | PASS | ESLint on `src/` |
| `npm run test:quick` | PASS | 397 files, 5926 tests |
| `npm run validate:fast` | PASS | Pixel Forge checks, typecheck, lint, budget/docs gates, and quick tests; doc drift artifact `artifacts/perf/2026-06-13T14-15-50.904Z/doc-drift-gate/doc-drift.json` |
| `npm run check:vegetation-grounding` | PASS | `artifacts/perf/2026-06-13T13-09-34-547Z/vegetation-grounding-audit/summary.json` |
| `npm run check:vegetation-horizon` | GAP | `artifacts/perf/2026-06-13T13-09-34-437Z/vegetation-horizon-audit/horizon-audit.json`; max vegetation range still `520m`, so the far canopy tier is still required |
| `npm run perf:capture:openfrontier:short` | FAIL existing p99 gate | `artifacts/perf/2026-06-13T13-09-44-876Z/summary.json`; avg `20.70ms`, p99 `100ms`, zero console errors, vegetation `12,951` visible instances / `25,902` triangles |
| `npm run perf:capture:ashau:short` | FAIL existing p99 gate | `artifacts/perf/2026-06-13T13-13-49-438Z/summary.json`; avg `25.10ms`, p99 `100ms`, zero console errors, vegetation `20,388` visible instances / `40,776` triangles |
| `npx vitest run src/config/vegetationTypes.test.ts src/systems/terrain/ChunkVegetationGenerator.test.ts src/systems/terrain/TerrainMaterial.test.ts src/systems/terrain/JungleGroundRing.test.ts src/systems/terrain/TerrainSystem.test.ts` | PASS | Historical pre-rollback evidence; superseded for ground-cover ownership by the 2026-06-15 focused terrain vegetation suite above |
| `npm run check:tod-coherence` | PASS | `artifacts/lighting-rig/tod-sweep/gate/verdict.json`; hard lighting checks pass, with non-hard GLB range-ratio advisory still present |
| `npm run check:vegetation-horizon` | PASS | `artifacts/perf/2026-06-13T13-47-19-388Z/vegetation-horizon-audit/horizon-audit.json`; all five audited modes report `maxBareBand=0m` and `flags=none` |
| `npm run check:vegetation-grounding` | PASS | `artifacts/perf/2026-06-13T13-47-19-535Z/vegetation-grounding-audit/summary.json` |
| `npm run check:terrain-baseline` | PASS | `artifacts/perf/2026-06-13T13-57-31-759Z/projekt-143-terrain-horizon-baseline/summary.json`; 4/4 elevated screenshots, renderer stats, terrain metrics, vegetation counters, and zero browser errors |
| `npm run perf:capture:openfrontier:short` | FAIL existing p99 gate | `artifacts/perf/2026-06-13T14-07-00-362Z/summary.json`; only hard failure is `peak_p99_frame_ms`; avg `22.44ms`, p99 `100ms`, startup `3s`, heap growth/peak WARN, heap recovery PASS, zero console errors, vegetation `5,184` visible instances / `10,368` triangles |
| Open Frontier heap diagnostic on final rerun | WARN / attribution rejected | `artifacts/perf/2026-06-13T14-10-59-387Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`; source capture has no hard heap validation failures, but heap attribution remains a STABILIZAT diagnostic input |
| `npm run perf:capture:ashau:short` | FAIL existing p99 gate | `artifacts/perf/2026-06-13T13-53-14-772Z/summary.json`; avg `24.12ms`, p99 `100ms`, startup `3s`, zero console errors, vegetation `10,925` visible instances / `21,850` triangles |

R1 perf attribution: the ground-ring split, accepted-palm canopy tier, and
terrain-material coverage mask reduced visible persistent vegetation-imposter
residency in both measured modes, but they do not clear the existing frame-tail
gates. The final Open Frontier rerun fails only `peak_p99_frame_ms`; tail
attribution used the older residual wording: non-combat residual was labeled
render/Other `77.3ms (77%)` plus Combat `22.7ms (23%)`, with cover search at
`0ms` and vegetation not identified as the driver. A Shau final tail attribution
similarly labeled the residual `render/Other 97.9%` with Combat `2%`. As of
2026-06-14, the tail reporter distinguishes named non-combat sampled systems
from unassigned residual, so do not read those historical labels as a proven
renderer-only finding. Vegetation stream samples remain small and are not the
tail driver in either after-capture. Startup threshold stays `3s` in both modes.
Open Frontier still cannot be called a clean perf pass, but the final capture is
a vegetation-cycle non-regression decision rather than a new vegetation blocker.

Visual review note: `JungleGroundRing` should not be treated as current runtime
ownership. Owner feedback on 2026-06-15 was that the dense vegetation circle is
unnecessary and should feel like the previous vegetation setup. Normal runtime
therefore routes accepted ground-cover plants through `VegetationScatterer`
again and keeps `JungleGroundRing` dormant. The Open Frontier dawn/night sample
also exposes the separate lighting problem: vegetation and terrain can read too
red/black even while the TOD coherence hard gate passes. Treat that as
lighting-pass input, not as vegetation placement evidence.

Tree asset status: no new tree assets imported. The first runtime tree tier
uses existing accepted Pixel Forge `fanPalm` and `coconut` vegetation assets as
canopy families. `docs/ASSET_MANIFEST.md` and
`docs/archive/PROJEKT_OBJEKT_143/VEGETATION_SOURCE_PIPELINE.md` still require
accepted Pixel Forge/source-bake provenance before blocked or new broadleaf,
rubber, mangrove, or banyan vegetation families enter runtime. Existing
`public/models/props/pixel-forge/tree*.glb` assets remain prop catalog
material, not accepted jungle vegetation.
