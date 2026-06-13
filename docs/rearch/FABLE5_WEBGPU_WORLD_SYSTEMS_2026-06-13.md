# Fable5 WebGPU World Systems Analysis - 2026-06-13

Status: active cycle alignment packet. R1 runtime policy work has started with
`src/core/RendererFeatureProfile.ts`; reference-system ports remain gated by
the cycle scope below.

Cycle: `docs/tasks/cycle-2026-06-13-fable5-webgpu-world-systems.md`

## Owner Decisions

- Keep one repo and one game. Do not split WebGPU and WebGL2 into separate
  projects.
- WebGPU is the development posture. WebGL2 remains supported, but compatibility
  work must not slow WebGPU feature progress.
- Include all three lanes in the next cycle: WebGPU architecture posture,
  Fable5 world-system analysis, and visual/world proof planning.
- Do not reintroduce runtime water this cycle. Hydrology and water are analysis
  only until a later approved water cycle.
- Use `master` as the single release-target name in docs, commands, and
  closeout language.
- Do not wave away p99. The cause is not known enough; the next cycle needs a
  p99 attribution checkpoint before accepting any broad visual/runtime change.

## Current TIJ Ground Truth

TIJ already runs as a WebGPU-primary Three.js r184 project with automatic
WebGL2 fallback through `WebGPURenderer`. The current renderer surface is
centralized in `src/core/RendererBackend.ts` and `src/core/GameRenderer.ts`.
The fallback path exists for production users and proof comparison, but strict
WebGPU remains the acceptance path for renderer work.

Water is currently stripped to first principles. `docs/state/CURRENT.md`,
`docs/DIRECTIVES.md`, and `docs/ROADMAP.md` all say hydrology and all water
runtime paths were removed on 2026-06-09; watercraft code is dormant. That
means Fable5 hydrology and `WaterSurface` can inform design, debug probes, and
future architecture, but not become runtime gameplay water in this cycle.

The open p99 issue is not sufficiently attributed. The vegetation cycle showed
Open Frontier p99 failures before and after the vegetation change. The final
vegetation run reduced visible vegetation residency but still failed
`peak_p99_frame_ms`, with tail attribution pointing at render/Other plus
combat/player superposition. The next cycle should treat p99 as unknown until
new same-machine R0 captures and attribution prove otherwise.

## Fable5 Reference Map

| Fable5 system | Useful idea | TIJ decision |
|---|---|---|
| `examples/fable5-world-demo/src/world/Heightfield.ts` | A single GPU-authored world field that feeds terrain, water, vegetation, moisture, and debug probes. | Analyze the ownership model only. TIJ terrain/DEM/nav authority stays in place; no heightfield swap this cycle. |
| `examples/fable5-world-demo/src/gpu/passes/Erosion.ts` | Compute-driven hydraulic/thermal erosion as an offline or boot-time terrain shaping pass. | Spike suitability for future authored terrain tooling. Do not mutate A Shau DEM or live terrain at runtime. |
| `examples/fable5-world-demo/src/gpu/passes/FlowRivers.ts` | Hydrology outputs moisture, flow, river depth, and water surface buffers. | Analysis only. Use it to design future water/moisture authority and vegetation masks; no visible water implementation this cycle. |
| `examples/fable5-world-demo/src/world/WaterSurface.ts` and `examples/fable5-world-demo/src/render/WaterMaterial.ts` | Camera-following water clipmap and TSL material fed by water-height buffers. | Controlled burn for now. Record future VODA shape; do not reintroduce runtime water. |
| `examples/fable5-world-demo/src/sky/Clouds.ts` | WebGPU compute clouds, shadow map, wind drift, and half-res raymarch integration. | Candidate WebGPU-only visual prototype behind a dev flag and strict proof; WebGL2 may degrade or disable. |
| `examples/fable5-world-demo/src/render/PostStack.ts` | RenderPipeline-based post chain with cloud composition, GTAO, exposure, bloom, and ablation flags. | Useful architecture for a TIJ post stack, but start with a minimal feature-profiled pipeline and proof matrix. |
| `examples/fable5-world-demo/src/sky/SunSky.ts` | Sky/IBL/cloud coordination around a single renderer-owned sky system. | Compare against TIJ `AtmosphereSystem`/`LightingRig`; do not create a second lighting authority. |
| `examples/fable5-world-demo/src/vegetation/Species.ts` and `examples/fable5-world-demo/src/vegetation/VegLibrary.ts` | Parameterized generated species and atlas/impostor baking. | Translate concepts into Vietnam species definitions and source-bake requirements. Do not copy Fable species or generated assets. |
| `examples/fable5-world-demo/src/vegetation/Forests.ts` | GPU instance culling, terrain occlusion, LOD ring classification, shadow proxies, and impostor bands. | Adapt the LOD/culling strategy incrementally. No full wholesale Forests port. |
| `examples/fable5-world-demo/src/vegetation/Impostors.ts` | Octahedral impostor capture with albedo/normal/depth and view blending. | Strong candidate for future accepted tree families; not required before source asset approval. |
| "Nanite" direction in comments | Hero close trees, clustered crown proxies, and aggregate impostor bands. | Treat as Nanite-lite research: aggregate/cluster LOD and indirect culling, not true meshlet Nanite. |

## WebGPU Posture

Do not split the repo. Split renderer capability policy.

The cycle now includes `src/core/RendererFeatureProfile.ts`, a
`RendererFeatureProfile` policy surface that makes each new visual feature
choose one of these outcomes:

1. `requiredWebGPU` - strict WebGPU only; fallback disables feature.
2. `degradedFallback` - WebGPU gets full feature; WebGL2 gets a cheaper
   material/pass.
3. `sharedNodeSafe` - TSL node material is expected to run on both WebGPU and
   Three's WebGL2 fallback backend.
4. `diagnosticOnly` - feature is available only in dev/proof harnesses.

This reduces the cost of future WebGPU work because new systems do not need a
mirrored WebGL2 implementation by default. WebGL2 remains a product fallback,
but it stops being a veto over WebGPU renderer progress.

Renderer hardening should continue with WebGPU limits and device-loss policy:

- query adapter limits before requesting larger storage buffers;
- request only required limits for specific features;
- record features like `timestamp-query`, texture compression, and shader-f16
  in the capability profile;
- attach a `device.lost` handler for the WebGPU renderer path;
- add a debug/proof path for simulated device loss before production default-on.

## P99 Policy

The cycle should not treat p99 as an automatic blocker for every exploratory
visual feature, but it must prevent unknown p99 from hiding regressions.

2026-06-13 evidence hygiene: the owner was also testing the game in a browser
during the local validation window, so any overlapping p99/perf captures are
tainted for attribution. Use them only as directional noise checks; rerun R0
and final p99 attribution on a quiet machine before making a cycle-close perf
claim.

Acceptance policy:

- R0 captures are required before new renderer/world changes.
- If p99 is already red and the touched feature is not in the tail attribution,
  the cycle can continue with a written non-regression decision.
- If a touched system appears in the tail attribution or worsens startup,
  renderer stats, heap, or frame tails beyond R0, stop and fix or cut scope.
- If measurement trust is WARN, do not update baselines from that run. Use it
  for direction only and keep STABILIZAT-1 open.

## Controlled Burns

- No runtime water this cycle.
- No Fable assets copied into TIJ.
- No generated Fable species used as Vietnam species.
- No replacement of TIJ terrain/DEM/nav authority.
- No second lighting authority beside `LightingRig` and `AtmosphereSystem`.
- No full Fable `Forests` port.
- No true meshlet Nanite implementation.
- No separate WebGPU/WebGL2 project split.
- No direct-to-`master` push; close through the repo's merge and deploy proof
  flow.

## Proposed Deliverables

1. WebGPU-primary renderer feature profile and fallback policy. The initial
   feature profile is implemented and exposed through the diagnostic
   `window.__rendererFeatureProfile()` hook.
2. P99 attribution packet for the next cycle's R0 and final captures.
3. Fable5 heightfield/erosion/hydrology/water analysis with water explicitly
   held for a later runtime cycle.
4. Minimal WebGPU-only sky/cloud/post prototype plan or guarded spike, with
   `check:tod-coherence` and visual matrix requirements.
5. Forest/species/Nanite-lite adaptation plan for Vietnam vegetation and future
   accepted tree assets.
6. Master-target closeout plan ending in validation, merge to `master`,
   production deploy, and `check:live-release`.
