<!-- Proposed next cycle. Source audit: TIJ current docs + examples/fable5-world-demo, 2026-06-13. -->
# cycle-2026-06-13-fable5-world-systems-debug-proofs

Status: active branch; R1/R2 scaffold started. Owner alignment is still
required before expanding into sky/cloud/post, full vegetation, terrain
authoring, or species source-asset work.

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
- Local gate: `npm run validate:fast` passes; 402 test files and 5,955 tests
  passed on the latest branch run.

## Evidence Captured

2026-06-13 proof runs after the R3 gate:

- `npm run check:platform-capabilities -- --run-browser --headless
  --check-live-headers` wrote
  `artifacts/perf/2026-06-13T17-38-23-217Z/projekt-143-platform-capability-probe/summary.json`.
  Local and live cross-origin isolation headers passed. Headless Chromium used
  SwiftShader and exposed no WebGPU adapter, so this is browser/header evidence,
  not strict-WebGPU capability proof.
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
- `npm run perf:capture:combat120` produced a measurement-trust PASS packet at
  `artifacts/perf/2026-06-13T17-49-13-305Z/summary.json`; `npm run
  perf:compare -- --scenario combat120` printed raw metrics only because the
  repo has no tracked perf baseline. The capture is directional, not a quiet
  perf pass: avg `19.61ms`, p95 `32.70ms`, p99 `44.70ms`, max `60.80ms`,
  heap growth `42.29 MB`. Tail attribution says cover search is not the driver
  (`0.000ms`); the worst tail is render/Other dominated (`36.5ms`, 82%).

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
- [x] Generated species are Vietnam definitions/specs only; no Fable assets or
      generated species are copied.
- [x] Forest/Nanite-lite output is an incremental TIJ LOD/culling adaptation,
      not a full Fable `Forests` port or true meshlet Nanite.
- [ ] Final quiet-machine perf attribution is recorded and compared to R0.
- [x] `npm run validate:fast` passes.
- [ ] Work is committed, pushed, merged to `master`, deployed, and verified
      with `npm run check:live-release`.
