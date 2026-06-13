<!-- Proposed next cycle. Source audit: TIJ current docs + examples/fable5-world-demo, 2026-06-13. -->
# cycle-2026-06-13-fable5-world-systems-debug-proofs

Status: active branch; R1/R2/R3/R4 scaffolds, focused proof gates, strict
WebGPU all-mode visual matrix, trusted large-mode diagnostic inputs, and
culling owner-path certification are recorded. Owner alignment is still
required before default-on sky/cloud/post, full vegetation, terrain authoring,
source-asset/runtime water work, or runtime culling/HLOD changes. A current A
Shau final quiet rerun has status `ok`, validation WARN, and measurement-trust
PASS; residual A Shau Player/Weather/Zone warnings remain triage items, not
evidence that the Fable proof scaffolds regressed runtime visuals.

Predecessor: `docs/tasks/cycle-2026-06-13-fable5-webgpu-world-systems.md`
shipped the initial `RendererFeatureProfile` policy surface. This cycle folds
the remaining Fable5 topics into TIJ-owned debug/prototype work without
wholesale ports.

Goal statement: Fold the Fable5 heightfield, erosion, hydrology, water,
sky/cloud/post, generated-species, forest LOD, and Nanite-style reference
ideas into a TIJ-owned WebGPU-primary world-systems cycle by hardening renderer
capability/device-loss/limits policy, spiking heightfield and erosion against
the existing TIJ terrain authority, rebuilding water from first principles as
debug-only level/basin/river proofs, prototyping sky/cloud/post behind
WebGPU-only proof gates, translating generated-species concepts into Vietnam
species and source-asset specs, adapting forest GPU culling/LOD and
Nanite-lite aggregate concepts without Fable assets or full ports, proving the
approved subset with quiet-machine perf and visual evidence, then committing,
pushing, merging to `master`, deploying production, and passing
`npm run check:live-release`.

## Scope Posture

- One repo, one game. Do not split WebGPU and WebGL2 projects.
- WebGPU is the primary implementation path. WebGL2 fallback is compatibility
  and may disable or degrade new WebGPU-only features.
- Fable5 is reference code, not source code to import.
- TIJ terrain, DEM, navmesh, scenario, lighting, and asset-acceptance
  authority stay in TIJ.
- Runtime gameplay water is still out of scope. This cycle may add debug-only
  water level and basin/river proof surfaces, not boats, swimming, water
  combat, or default production water visuals.
- Gun/viewmodel height and ground-vehicle arcade handling are important
  follow-up feel cycles, but not part of this world-systems architecture cycle.

## Folded Fable Topics

| Topic | Reference idea | Cycle shape | Controlled burn |
|---|---|---|---|
| Heightfield / erosion | GPU-authored world field plus hydraulic/thermal erosion. | Spike against TIJ terrain authority; document where a future authoring/offline pass would attach. | No terrain ownership swap; no A Shau DEM mutation. |
| Hydrology / water | Moisture, flow, river depth, and water-surface buffers. | Rebuild from first principles as debug-only water level, basin fill, and river proof. | No gameplay water, no watercraft reactivation, no Fable water material. |
| Sky / cloud / post | Compute clouds, cloud shadows, half-res raymarch, RenderPipeline post. | WebGPU-only visual spike behind proof flags; matrix-gated before default-on. | No second lighting authority; no default-on cloud/post replacement without proof. |
| Generated species | Parameterized species, atlas bake, impostor capture. | Translate into Vietnam species definitions, accepted source-asset requirements, and bake specs. | No Fable generated species or assets. |
| WebGPU assumptions | Feature policy, limits, device loss, diagnostic hooks. | Extend `RendererFeatureProfile` with device-loss/limits and per-feature proof hooks. | Do not block fallback users from the app shell; fallback may degrade feature scope. |
| Forests | GPU culling, terrain occlusion, LOD rings, shadow proxies, impostor bands. | Adapt culling/LOD strategy incrementally around TIJ vegetation runtime. | No full Fable `Forests` port. |
| Nanite-lite | Hero close trees, clustered crown proxies, aggregate impostors. | Evaluate cluster/aggregate LOD and indirect-culling feasibility. | No true meshlet Nanite implementation. |

## Cycle Plan

1. R0 quiet baseline and attribution:
   - Run only when the owner is not also playtesting in a browser.
   - Capture Open Frontier, A Shau, and the smallest p99 reproducer.
   - Record whether p99 attribution implicates renderer, Player, Combat,
     terrain, vegetation, sky/post, startup, or measurement trust.
2. R1 WebGPU capability hardening:
   - Extend `RendererFeatureProfile` with required limits, device-loss
     reporting, and feature proof hooks.
   - Add diagnostic output that scripts can consume without importing renderer
     internals.
3. R2 terrain / hydrology / debug water proof:
   - Inventory current terrain and water-stripped boundaries.
   - Implement or scaffold a debug water-level overlay plus basin/river proof
     data path.
   - Keep all outputs non-authoritative until accepted by a later water cycle.
4. R3 sky / cloud / post spike:
   - Prototype only behind dev/proof flags.
   - Route lighting through the existing `LightingRig` / `AtmosphereSystem`
     authority.
   - Gate with `check:tod-coherence` and scenario screenshot matrix before any
     default-on decision.
5. R4 species / forest / Nanite-lite adaptation:
   - Author Vietnam species definitions and source-asset acceptance specs.
   - Define impostor bake inputs and forest LOD/culling ownership.
   - Evaluate aggregate/cluster LOD without committing to meshlet Nanite.
6. R5 proof and release:
   - `npm run validate:fast`.
   - Relevant visual gates, including `npm run check:tod-coherence` if
     sky/lighting/post is touched.
   - Quiet-machine final perf rerun against R0.
   - Commit, push, merge to `master`, deploy with `npm run deploy:prod`, run
   `npm run ci:manual` if needed, and pass `npm run check:live-release`.

## Branch Implementation Slice

2026-06-13 scaffold on `codex/fable-world-systems-debug-proofs`:

- `RendererFeatureProfile` now carries required WebGPU limit decisions,
  WebGPU device-loss state, and per-feature proof hooks for compute, world
  fields, sky/post, forest culling, impostor bake, hydrology analysis, debug
  water proof, and disabled runtime water.
- `GameRenderer` attaches the WebGPU `device.lost` promise after renderer
  init and reports loss through renderer capabilities without blocking startup
  or attempting recovery in this cycle.
- `src/systems/environment/SkyCloudPostProofGate.ts` composes the
  `renderPipelinePost` and `volumetricCloudPrototype` renderer decisions into a
  single strict-WebGPU diagnostic proof gate. The gate stays default-off,
  exposes `window.__skyCloudPostProofGate()` under the existing diagnostics
  surface, names `AtmosphereSystem/LightingRig` as the sole lighting authority,
  blocks WebGL2 fallback mirroring, and records the required visual matrix
  before any sky/cloud/post path can become default-on.
- `src/systems/terrain/HeightfieldErosionAuthoritySpike.ts` adds a CPU
  diagnostic over TIJ `IHeightProvider` terrain authority. It samples the
  current height provider, reports slope, sink, flow-strength, and erosion-risk
  summaries, and explicitly remains debug-only, non-authoritative, and
  non-mutating. It does not import Fable heightfield code, alter A Shau DEMs,
  rebuild terrain ownership, or create runtime water.
- `src/systems/environment/water/DebugWaterProof.ts` adds a pure debug-only
  basin/river sampler. It is non-authoritative and intentionally does not
  implement the dormant buoyancy sampler, so it cannot reactivate gameplay
  water or watercraft.
- `src/config/VietnamVegetationSpecies.ts` translates the Fable generated
  species / forest LOD / Nanite-lite ideas into TIJ-owned Vietnam species,
  source-asset requirements, aggregate LOD bands, WebGPU culling proof
  dependencies, and blocked-source status. It does not add, swap, or activate
  vegetation assets.
- `src/systems/terrain/ForestAggregateLodPlan.ts` turns the forest/Nanite-lite
  idea into a deterministic TIJ decision surface over current vegetation
  species specs and renderer capability profile. It classifies aggregate cells
  into current CPU residency, optional WebGPU compact proof, terrain-material
  horizon coverage, or blocked source-asset lanes; it keeps runtime defaults
  off, excludes blocked/source-only species, copies no Fable assets, and
  explicitly refuses true meshlet Nanite.
- `scripts/check-culling-baseline.ts` now keeps its existing owner categories
  but includes all explicit scene-attribution buckets in the visible-triangle
  denominator. This fixes proof-tool drift where current categories such as
  `wildlife` and `atmosphere` existed in raw attribution but were not counted
  outside `unattributed`. It does not relax the 10% threshold or hide truly
  unnamed/unregistered meshes.
- Existing runtime primitives now attach diagnostic `userData.perfCategory`
  ownership without changing visuals, draw calls, materials, gameplay, or asset
  loading: sun disc, weather rain, zone-control markers, M151/M48 procedural
  roots and turret meshes, M2HB/AA emplacements, tank shells, ammo crates,
  weapon pickups, and air-support placeholders.
- `scripts/capture-atmosphere-recovery-shots.ts` now accepts `--renderer`,
  `--headed`, and `--fail-on-scenario-error`, and records renderer backend
  capabilities plus feature profile data in each shot. The default
  `npm run evidence:atmosphere` path is unchanged, but the cycle can now
  produce headed strict-WebGPU all-mode visual evidence.
- Local gate: `npm run validate:fast` passes; 403 test files and 5,960 tests
  passed on the latest branch run.

## Evidence Captured

2026-06-13 proof runs after the R3 gate:

- `npm run check:platform-capabilities -- --run-browser --headless
  --check-live-headers` wrote
  `artifacts/perf/2026-06-13T17-38-23-217Z/projekt-143-platform-capability-probe/summary.json`.
  Local and live cross-origin isolation headers passed. Headless Chromium used
  SwiftShader and exposed no WebGPU adapter, so this is browser/header evidence,
  not strict-WebGPU capability proof.
- `npm run check:platform-capabilities -- --run-browser --check-live-headers`
  wrote
  `artifacts/perf/2026-06-13T17-54-31-607Z/projekt-143-platform-capability-probe/summary.json`.
  Headed Chromium exposed the RTX 3070 WebGPU adapter; local and live
  cross-origin isolation headers passed.
- `npm run check:sky-cloud-post-proof` passed strict-WebGPU gate proof:
  `artifacts/proofs/sky-cloud-post/2026-06-13T17-56-58-158Z/summary.json`.
  The renderer profile was `webgpuPrimary`, `renderer=webgpu-strict`,
  device-loss was clear, compute/storage limits passed, and the
  sky/cloud/post diagnostic gate returned `state=webgpu-proof`.
- `npm run check:forest-lod-plan` passed the R4 aggregate vegetation proof
  unit gate: accepted runtime species use the current billboard/scatter path or
  optional WebGPU compact proof, future broadleaf far bands require WebGPU
  forest culling plus impostor-bake proof hooks, source-spec trees stay blocked
  without accepted TIJ assets, and horizon canopy resolves through
  `TerrainMaterial` rather than individual tree geometry.
- `npm run check:culling-proof` passed headed culling proof:
  `artifacts/perf/2026-06-13T18-11-23-014Z/projekt-143-culling-proof/summary.json`.
  The proof records visible category counts for world static features,
  aircraft, helicopters, vegetation impostors, NPC impostors, and close NPC
  GLBs before any runtime forest-culling work lands.
- `npm run check:culling-baseline` after that proof still failed:
  `artifacts/perf/2026-06-13T18-11-31-836Z/projekt-143-culling-owner-baseline/summary.json`.
  Culling proof trust passed, but Open Frontier and A Shau trusted perf inputs
  were missing, so this packet does not authorize runtime culling or HLOD
  changes yet.
- `npm run perf:capture:openfrontier:short` produced a non-trusted failed
  large-mode perf artifact:
  `artifacts/perf/2026-06-13T18-11-43-267Z/summary.json`. The capture
  collected 118 samples and passed frame progression, average frame time, hitch
  rate, console-error, and end-heap checks, but failed validation on peak p99
  `100.00ms` and heap peak-growth `131.59 MB`; measurement trust was WARN
  (`probeAvg=29.67ms`, `probeP95=46.00ms`). Tail attribution says cover search
  was `0.000ms`; the sampled tail was render/Other dominated (`98.1ms`, 98%)
  with `Player` as the top system (`55.0ms`). Treat this as p99 triage
  evidence, not a quiet baseline.
- A bounded diagnostic retry of Open Frontier with no combat, no active-player
  harness, no rebuild, and a longer 60s warmup passed:
  `artifacts/perf/2026-06-13T18-24-02-167Z/summary.json`. This is a
  render/terrain/harness isolation packet, not gameplay perf proof. It
  produced measurement trust PASS (`probeAvg=19.75ms`, `probeP95=30.00ms`),
  validation WARN, avg `18.75ms`, max p99 `34.20ms`, max frame `35.30ms`,
  and `0` missed samples. The earlier 100ms p99 failure therefore appears to
  be late startup/background settling unless reproduced after the longer
  warmup.
- The matched A Shau no-combat/no-active-player, 60s-warmup diagnostic passed:
  `artifacts/perf/2026-06-13T18-26-54-378Z/summary.json`. It produced
  measurement trust PASS (`probeAvg=20.92ms`, `probeP95=31.00ms`), validation
  WARN, avg `20.04ms`, max p99 `35.60ms`, max frame `49.70ms`, and `0` missed
  samples. Treat it as terrain/render/culling input only.
- `npm run check:culling-baseline` after those diagnostic captures and the
  scene-attribution denominator fix selected
  `large-mode-world-static-and-visible-helicopters`, but the packet still
  failed certification:
  `artifacts/perf/2026-06-13T18-30-57-630Z/projekt-143-culling-owner-baseline/summary.json`.
  Culling proof, Open Frontier trust, A Shau trust, and owner-path selection
  passed. A Shau visible unattributed triangles were under threshold
  (`8.131%`), but Open Frontier remained over the 10% gate (`12.24%`).
  Runtime culling/HLOD work may use the selected owner path as directional
  evidence, but certification still requires registering/categorizing the
  remaining Open Frontier unnamed geometry or otherwise proving why it is not
  relevant to the branch.
- After explicit diagnostic ownership tags for existing runtime primitives,
  the matched no-combat/no-active-player 60s-warmup captures passed attribution
  trust on the same perf build. Open Frontier:
  `artifacts/perf/2026-06-13T18-52-45-146Z/summary.json`; visible
  unattributed triangles dropped to `8.682%`. A Shau:
  `artifacts/perf/2026-06-13T18-56-10-756Z/summary.json`; visible
  unattributed triangles dropped to `3.464%`. Remaining unattributed examples
  are mostly `vehicles/ground/m35-truck.glb`, so future asset-catalog owner
  tagging can narrow that bucket further without blocking this proof.
- `npm run check:culling-baseline` now records owner-path certification with a
  WARN-only caveat for the excluded combat diagnostic:
  `artifacts/perf/2026-06-13T18-59-10-145Z/projekt-143-culling-owner-baseline/summary.json`.
  Culling proof trust, Open Frontier trust, A Shau trust, owner-path selection,
  and both visible-unattributed thresholds passed. The combat diagnostic remains
  excluded from certification until measurement trust passes.
- `npm run check:tod-coherence` passed the A Shau 8-TOD hard gate:
  `artifacts/lighting-rig/tod-sweep/gate/verdict.json`. Foliage and NPC
  luminance coherence passed; GLB range ratio still fails only the advisory
  check.
- `npm run evidence:atmosphere` captured ground, sky, and aircraft/cloud shots
  for A Shau, Open Frontier, TDM, Zone Control, and combat120:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-06-13T17-44-48-827Z/summary.json`.
  The run completed under `webgpu-webgl-fallback` because this browser exposed
  no WebGPU adapter, so it is fallback visual evidence rather than strict-WebGPU
  visual closure.
- `npx tsx scripts/capture-atmosphere-recovery-shots.ts --headed --renderer
  webgpu-strict --fail-on-scenario-error --no-build --port 9226` captured the
  strict WebGPU all-mode visual matrix:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-06-13T19-07-57-910Z/summary.json`.
  All 15 shots resolved `rendererBackendCapabilities.resolvedBackend=webgpu`,
  all five modes produced 3 shots, there were no browser errors or scenario
  errors, and cloud anchoring tracked camera X/Z in every mode. One combat120
  sky-coverage shot remains a visual warning (`cloudTextureScore=7.82` against
  the script's `8.0` threshold), so this proves matrix coverage but does not
  authorize default-on sky/cloud/post changes.
- `npm run perf:capture:combat120` produced a measurement-trust PASS packet at
  `artifacts/perf/2026-06-13T17-49-13-305Z/summary.json`; `npm run
  perf:compare -- --scenario combat120` printed raw metrics only because the
  repo has no tracked perf baseline. The capture is directional, not a quiet
  perf pass: avg `19.61ms`, p95 `32.70ms`, p99 `44.70ms`, max `60.80ms`,
  heap growth `42.29 MB`. Tail attribution says cover search is not the driver
  (`0.000ms`); the worst tail is render/Other dominated (`36.5ms`, 82%).
- Final quiet diagnostic comparison against the available R0-proxy captures is
  recorded. Open Frontier improved/held on the same
  no-combat/no-active-player 60s-warmup shape: R0-proxy
  `artifacts/perf/2026-06-13T18-24-02-167Z/summary.json` to final
  `artifacts/perf/2026-06-13T18-52-45-146Z/summary.json`, avg
  `19.08ms -> 19.77ms`, peak p99 `34.20ms -> 33.50ms`, max frame
  `35.30ms -> 34.50ms`, visible unattributed `12.24% -> 8.682%`. A Shau did
  not hold: R0-proxy
  `artifacts/perf/2026-06-13T18-26-54-378Z/summary.json` to final
  `artifacts/perf/2026-06-13T18-56-10-756Z/summary.json`, avg
  `20.11ms -> 21.54ms`, peak p99 `35.60ms -> 41.30ms`, max frame
  `49.70ms -> 49.60ms`, visible unattributed `8.131% -> 3.464%`.
- A repeat A Shau final quiet diagnostic failed validation:
  `artifacts/perf/2026-06-13T19-11-16-934Z/summary.json`. Measurement trust
  passed (`probeAvg=20.85ms`, `probeP95=32.00ms`, `0` missed samples), but
  validation failed on heap recovery (`0.0%`, no reclaim from a `23.73 MB`
  peak/end growth). Peak p99 stayed elevated at `42.40ms` and one frame landed
  over 50ms (`51.20ms`). Tail attribution again says cover search and Combat
  are not the driver; `RenderMain` is the top measured system and render/Other
  accounts for the tail. This packet is retained as a rejected diagnostic, not
  as the current final quiet result.
- Heap/render follow-up diagnostics on the failing A Shau packet classified the
  issue as non-authoritative for acceptance:
  `artifacts/perf/2026-06-13T19-21-11-208Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
  reported `retained_or_unrecovered_peak`, and
  `artifacts/perf/2026-06-13T19-11-16-934Z/projekt-143-render-boundary-timing/render-boundary-timing.json`
  was `render_boundary_user_timing_inconclusive/low` with
  `renderer.render` max `21.2ms` inside the `51.2ms` peak.
- A deep-CDP diagnostic retry with heap sampling and render-submission summary
  produced attribution evidence only, not acceptance evidence:
  `artifacts/perf/2026-06-13T19-22-01-805Z/summary.json`,
  `artifacts/perf/2026-06-13T19-25-18-435Z/projekt-143-heap-sampling-attribution/summary.json`,
  and
  `artifacts/perf/2026-06-13T19-25-18-416Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`.
  Measurement trust was WARN because CDP overhead pushed p99 to `98.40ms`, but
  forced-GC final heap dropped to `126.39 MB` and the heap shape was
  `transient_gc_wave`. Allocation churn was dominated by Three renderer
  math/skinning (`85.79%`) plus gameplay bundle churn (`10.67%`), with
  `updateRain`, `getRelevantChunks`, and movement/terrain height-query owners
  visible in the sampled top frames. Render submissions showed terrain
  dominates triangles, while wildlife and ground vehicles dominate draw
  submissions; none of this authorizes runtime forest, sky/post, or water
  default-on work.
- A current normal A Shau quiet rerun passed the acceptance-shaped gate:
  `artifacts/perf/2026-06-13T19-25-54-553Z/summary.json`. It produced status
  `ok`, validation WARN, measurement-trust PASS (`probeAvg=21.00ms`,
  `probeP95=35.00ms`, `0` missed samples), avg `21.10ms`, peak p99 `34.10ms`,
  max frame `49.60ms`, `0.00%` frames over 50ms, heap end-growth `6.41 MB`,
  heap recovery `86.2%`, and tail attribution still says cover search and
  Combat are not drivers. `npm run perf:compare -- --scenario a_shau_valley`
  selected this artifact and printed raw metrics only because no tracked
  baseline exists.

## Acceptance

- [ ] Owner aligns on debug-only water proof being in scope.
- [ ] Quiet R0 perf attribution is recorded before world-system changes.
- [x] Renderer feature profile covers limits, device-loss policy, and proof
      hooks for the new prototype lanes.
- [x] Heightfield/erosion remains a spike against TIJ terrain authority; no
      terrain authority swap lands.
- [x] Hydrology/water produces only debug water-level, basin, or river proof
      surfaces; no gameplay water lands.
- [x] Sky/cloud/post prototype remains WebGPU-only and proof-gated.
- [x] Strict WebGPU all-mode visual matrix is recorded before any default-on
      sky/cloud/post decision; remaining combat120 sky warning is documented.
- [x] Generated species are Vietnam definitions/specs only; no Fable assets or
      generated species are copied.
- [x] Forest/Nanite-lite output is an incremental TIJ LOD/culling adaptation,
      not a full Fable `Forests` port or true meshlet Nanite.
- [x] Final quiet-machine perf attribution is recorded and compared to the
      available R0-proxy captures.
- [x] A Shau final quiet perf has a current status-ok, measurement-trust PASS
      rerun; residual validation WARNs and Player/Weather/Zone budget warnings
      remain documented triage items.
- [x] Open Frontier visible unattributed geometry is under the 10% culling
      certification threshold, or the remaining bucket is explicitly registered
      and justified.
- [x] `npm run validate:fast` passes.
- [ ] Work is committed, pushed, merged to `master`, deployed, and verified
      with `npm run check:live-release`.
