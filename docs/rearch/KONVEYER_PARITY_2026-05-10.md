# KONVEYER Parity And Migration Ledger

Last verified: 2026-05-11

Branch: `exp/konveyer-webgpu-migration`

## KONVEYER-0 Summary

KONVEYER starts from a WebGL2 production runtime with no active WebGPU runtime
source path. The first static audit on this branch wrote:

- `artifacts/perf/2026-05-10T14-06-41-625Z/webgpu-strategy-audit/strategy-audit.json`
- `activeWebgpuSourceMatches=0`
- `webglRendererEntrypoints=13`
- `migrationBlockerMatches=117`

Blocker split from the audit:

| Pattern | Matches |
| --- | ---: |
| `ShaderMaterial` | 73 initially, 69 after K7 post-processing retirement |
| `RawShaderMaterial` | 6 initially, 4 after K7 vegetation billboard port |
| `onBeforeCompile` | 11 |
| `WebGLRenderTarget` | 5 initially, 0 after K7 post-processing retirement |
| Direct WebGL context or GPU timer access | 22 |

By the latest K7 completion audit, raw static matches remain noisy because
tests, docs, archived scripts, and asset metadata intentionally stay in scope,
but active production render blockers are now `0`.

By the final default-on pass, headed hardware proof on this machine resolved
strict WebGPU to `webgpu` on the NVIDIA RTX 3070 path and the default built app
requests WebGPU first.

The initial platform probe wrote:

- `artifacts/perf/2026-05-10T14-06-51-008Z/projekt-143-platform-capability-probe/summary.json`
- Chromium `147.0.7727.15`
- Headless WebGL2: PASS through SwiftShader
- Headless WebGPU adapter: WARN, `navigator.gpu` exists but no adapter returned
- COOP/COEP and `SharedArrayBuffer`: PASS locally and on live Pages headers

The headed hardware probe later wrote:

- `artifacts/perf/2026-05-10T16-46-35-720Z/projekt-143-platform-capability-probe/summary.json`
- Headed WebGL renderer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 ... D3D11)`
- Headed WebGPU adapter: PASS
- Live Pages COOP/COEP header contract: PASS

This means the first runtime implementation must keep compile-time capability,
explicit WebGL diagnostics, and strict headed WebGPU adapter proof separate.
WebGL is not a fallback success path for this branch.

## Architecture Posture

Three.js remains the chosen renderer path for KONVEYER. The experiment is not
permission to pivot to another browser renderer framework. The long-term
"native or port-ready" posture is instead:

- Make the renderer boundary backend-agnostic inside the engine while leaving
  the fenced public interface alone until a reviewed interface-change PR.
- Move shader code from GLSL strings toward TSL/node graphs so the same intent
  can target WGSL for WebGPU. TSL's GLSL output is useful context, but it is
  not a passing fallback path for KONVEYER proof.
- Keep simulation authority on CPU-side data contracts that can later move
  toward WASM, worker, or native-hosted builds without coupling game state to a
  specific browser graphics context.
- Treat Vite config and tests as migration infrastructure. A WebGPU proof gate
  must fail loudly when the WebGPU backend is missing. Product compatibility
  planning belongs in a separate design pass, not in this migration proof.

Renderer policy for this branch:

- The default app path and `?renderer=webgpu-strict` both require
  `resolvedBackend=webgpu`. If Three resolves to WebGL, initialization must
  fail loudly.
- `?renderer=webgpu-force-webgl` is no longer an acceptance scenario. If it is
  run manually, it is a negative diagnostic only and must not appear in proof
  matrices.
- `?renderer=webgl`, `VITE_KONVEYER_WEBGPU=0`, and
  `VITE_KONVEYER_FORCE_WEBGL=1` are explicit legacy WebGL diagnostics only.

## Upstream Facts Refreshed

Sources checked on 2026-05-11:

- Three.js WebGPURenderer docs:
  https://threejs.org/docs/pages/WebGPURenderer.html
- Three.js WebGPURenderer manual:
  https://threejs.org/manual/en/webgpurenderer
- Three.js TSL docs:
  https://threejs.org/docs/TSL.html
- Three.js WebGPU capability helper:
  https://threejs.org/docs/pages/WebGPU.html
- MDN WebGPU API:
  https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- Chrome WebGPU overview:
  https://developer.chrome.com/docs/web-platform/webgpu/overview
- WebKit Safari Technology Preview WebGPU note:
  https://webkit.org/blog/14879/webgpu-now-available-for-testing-in-safari-technology-preview/

Current Three.js guidance relevant to this repo:

- `WebGPURenderer` is imported through the WebGPU build, normally
  `three/webgpu`.
- `WebGPURenderer` initializes asynchronously. A requestAnimationFrame loop
  must not call `render()` before `await renderer.init()`, unless it uses the
  renderer-managed animation loop.
- The renderer tries WebGPU first and can fall back to a WebGL2 backend. The
  `forceWebGL` option is the explicit test path.
- `ShaderMaterial`, `RawShaderMaterial`, and `onBeforeCompile` customizations
  are not migration-complete WebGPU surfaces. They need TSL/node material ports.
- Classic `EffectComposer`-style post-processing is not a drop-in WebGPU
  path. Post-processing moves to the node render pipeline.
- TSL can generate WGSL for WebGPU and GLSL for WebGL2, which makes it the
  correct shader graph path while migrating away from GLSL strings. Cross
  backend success is not WebGPU proof.
- WebGPU is still not a universal browser baseline. MDN marks it limited
  availability and secure-context-only. Chrome documents broad support, but
  platform-specific compatibility should be designed separately from the
  strict KONVEYER migration gate.

## Repo Parity Matrix

| Surface | Status | Current owner path | WebGPU migration note |
| --- | --- | --- | --- |
| Main renderer boot | strict-default | `src/core/RendererBackend.ts`, `src/core/GameRenderer.ts` | Default startup now requests `WebGPURenderer` and must resolve `webgpu`; `?renderer=webgl` remains an explicit diagnostic, `?renderer=webgpu-force-webgl` is excluded from proof, and strict hardware proof resolves `webgpu` on headed RTX 3070. |
| Engine render loop | proven-start | `src/core/GameEngine.ts`, `src/core/GameEngineLoop.ts` | The engine awaits async renderer init before system wiring; built smoke, headed matrix, and terrain visual proof reach app/gameplay under the default-on path. |
| Fenced renderer contract | blocked | `src/types/SystemInterfaces.ts` | `IGameRenderer.renderer` and weapon rendering methods are typed as `THREE.WebGLRenderer`; branch must use an internal adapter/cast and avoid fence edits. |
| GPU timing telemetry | blocked | `src/systems/debug/GPUTimingTelemetry.ts`, `src/systems/debug/PerformanceTelemetry.ts` | Uses `renderer.getContext()` and `EXT_disjoint_timer_query_webgl2`; WebGPU needs timestamp-query or disabled telemetry fallback. |
| Texture warmup | needs-port | `src/systems/assets/AssetLoader.ts` | Uses `renderer.initTexture`; common renderer has an initialized requirement, so WebGPU path needs init ordering guard. |
| Post-processing | retired | `src/systems/effects/PostProcessingManager.ts` | Runtime draws straight to back buffer. K7 removed the dormant low-res blit resources so this is no longer a hidden WebGPU blocker; any future post path must use Three's node post stack. |
| Terrain material | ported-visual-proof | `src/systems/terrain/TerrainMaterial.ts` | K7 replaced the production `onBeforeCompile` terrain shader injection with a TSL `MeshStandardNodeMaterial` graph for CDLOD displacement, biome shading, hydrology tint, feature surfaces, far-canopy tint, roughness, and explicit material-owned fog/tint. The 2026-05-11 strict WebGPU terrain/lighting repair restores solid CDLOD placement, bounded sky/fog lighting, sRGB terrain albedo policy, render-camera-aware visual proof, and Open Frontier/A Shau ground-tone acceptance. |
| Terrain renderer | ported-hardware-proof | `src/systems/terrain/CDLODRenderer.ts` | CDLOD instancing now publishes packed tile transform attributes for the node material instead of depending on injected `instanceMatrix` GLSL. The packed layout keeps the WebGPU vertex-buffer count under adapter limits. |
| Vegetation billboards | ported-hardware-proof | `src/systems/world/billboard/BillboardBufferManager.ts`, `src/systems/world/billboard/BillboardNodeMaterial.ts` | K7 moved production instanced vegetation off `RawShaderMaterial` onto a TSL `MeshBasicNodeMaterial` graph with atlas, wind, fog, lighting, and premultiplied alpha. The buffer manager initializes zero instance count and visibility explicitly so WebGPU never submits an infinite instance draw. |
| Combatant impostors | ported-hardware-proof | `src/systems/combat/CombatantMeshFactory.ts` | K7 moved active Pixel Forge NPC atlas impostors off `ShaderMaterial` onto a TSL `MeshBasicNodeMaterial` graph with crop-map sampling, animation frame selection, readability, atmosphere lighting, and material-owned fog. Headed strict WebGPU proof is green; combat120 perf remains review evidence. |
| Combatant close GLBs | ready | `src/systems/combat/CombatantRenderer.ts` | Mostly standard/skinned GLB materials. Must prove skinning, shadows, and perf under WebGPU separately. |
| Muzzle flashes | ported | `src/systems/effects/MuzzleFlashSystem.ts` | K5 follow-up replaced the custom points material with standard textureless `PointsMaterial` and vertex colors. The textureless path avoids WebGPU UV requirements on point geometry. |
| Sky dome | ported | `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` | Uses a generated sky/cloud texture on standard `MeshBasicMaterial`; CPU LUT remains the fog/lighting authority. K13 first slice keeps the dome camera-followed but samples clouds from a world/altitude-projected deck instead of sky texture `u/v`. |
| Cloud layer | retired | `src/systems/environment/AtmosphereSystem.ts`, `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` | The old finite plane prototype was removed from production source; sky-dome clouds remain the only active cloud authority. Strict proof records `camera-followed-dome-world-altitude-clouds`, but final cloud art/weather representation remains open. |
| Global water | ported | `src/systems/environment/WaterSystem.ts` | The legacy global water plane now uses standard `MeshStandardMaterial` with animated normal texture offset; hydrology river water remains the map-space authority for channel surfaces. Future shader work should not contort the global plane into map-space rivers. |
| Hydrology river water | ready-needs-art-acceptance | `src/systems/environment/WaterSystem.ts` | Uses `MeshStandardMaterial` vertex colors, CPU query segments, and `sampleWaterInteraction` for future gameplay consumers. Runtime proof passes in Open Frontier/A Shau, but water shader, intersections, flow, and visual acceptance remain open. |
| First-person weapon overlay | needs-port | `src/systems/player/FirstPersonWeapon.ts`, `src/systems/player/weapon/WeaponModel.ts` | API is fenced to `WebGLRenderer`; calls common `render` but type and ordering need adapter handling. |
| Dev viewers and tools | unknown | `src/dev/*`, `public/vehicle-viewer.html`, `tools/vehicle-viewer.html` | Not production boot blockers. Keep WebGL until runtime path proves out. |
| Minimap and DOM UI | ready | `src/ui/minimap`, HUD DOM | DOM/UI should stay outside renderer migration except for world projection calls. |

## Execution Order

1. KONVEYER-1: Add internal renderer backend selection and capability reporting.
   Keep WebGL default unless `?renderer=webgpu` or an explicit env flag is set.
2. KONVEYER-2: Add TSL helper module and a small node material fixture. Do not
   start with terrain or post.
3. KONVEYER-3: Port or parallel-prototype the vegetation billboard material
   path because it is high draw-volume and less simulation-entangled than NPCs.
4. KONVEYER-4: Port an isolated combatant impostor material bucket. Close GLBs
   stay on standard material first.
5. KONVEYER-5: Build a small compute/material proof around muzzle particles or
   projectile/effect buffer ownership.
6. KONVEYER-6: Add GPU-ready data packing for cover/sensor queries, with CPU
   authority retained.
7. KONVEYER-7: Write and prove the terrain, water, and post-processing parity
   route. Port the smallest safe tail item only after earlier slices run.
8. KONVEYER-8: Expand validation to WebGPU strict proof, WebGPU-forced-WebGL
   compatibility, headed adapter probe, A Shau/Open Frontier coverage, and
   explicit fallback policy.
9. KONVEYER-9: Produce default-on readiness packet, rollback plan, and owner
   review decisions. No `master` merge or production deploy from this branch.

## Hard Decisions For Review

- A true default-on WebGPU game path requires TSL ports for all active custom
  shader materials, not only swapping renderer construction.
- The fenced `IGameRenderer` shape still names `WebGLRenderer`. This campaign
  can avoid a fence change with an internal adapter, but the long-term API
  should eventually become renderer-agnostic in a reviewed `[interface-change]`
  PR.
- WebGPU GPU timing cannot reuse the existing WebGL timer query path. The
  first WebGPU backend should report renderer stats and mark GPU time
  unavailable until timestamp query support is implemented and validated.
- The active render-material blockers have been ported or retired, and default
  startup now requests WebGPU. Perf comparison and reviewer approval still gate
  any merge/deploy from this experiment branch.

## KONVEYER-1 Checkpoint

Implemented after the KONVEYER-0 checkpoint:

- `src/core/RendererBackend.ts` adds the internal renderer backend selector,
  capability object, async WebGPURenderer creation, and resolved-backend
  inspection.
- `src/core/GameRenderer.ts` creates a temporary bootstrap canvas before
  `initializeRendererBackend()` swaps in WebGPU. A WebGPU request now fails
  loudly if it cannot resolve `webgpu`.
- `src/core/GameEngine.ts` awaits renderer backend initialization before
  system wiring and refreshes capture/context-guard references after a renderer
  swap.
- `src/systems/debug/GPUTimingTelemetry.ts` now treats non-WebGL renderers as
  GPU-timer unavailable instead of assuming `getContext()`.
- `src/core/RendererBackend.test.ts` covers backend selection and initial
  capability state.

Validation for this checkpoint:

- `npm run typecheck`: PASS
- `npx vitest run src/core/RendererBackend.test.ts src/core/GameRenderer.test.ts`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run smoke:prod`: PASS for the historical K1 boot path
- `npm run check:webgpu-strategy`: PASS,
  `artifacts/perf/2026-05-10T14-14-01-807Z/webgpu-strategy-audit/strategy-audit.json`

Current limitation:

- The opt-in WebGPU renderer boot path is present, but full game rendering is
  still blocked by the custom GLSL material inventory above. That is expected
  until KONVEYER-2 through KONVEYER-7 replace or route those surfaces.

## KONVEYER-2 Checkpoint

Implemented after the KONVEYER-1 checkpoint:

- `src/core/RendererBackend.ts` adds strict WebGPU proof selection through
  `?renderer=webgpu-strict` and `VITE_KONVEYER_WEBGPU_STRICT=1`.
- `src/core/GameRenderer.ts` refuses to swap to a WebGPURenderer instance that
  resolved to the WebGL backend when strict proof mode is active.
- `src/core/TslMaterialFactory.ts` adds the first typed TSL material fixture:
  an alpha-tested texture node material with no GLSL shader strings.
- `evaluateNodeMaterialReadiness()` centralizes the rule that strict WebGPU
  material slices must not hide behind backend fallback.
- `src/core/TslMaterialFactory.test.ts` covers the strict/fallback readiness
  split and verifies the TSL node material is created from Three's node stack.

Validation for this checkpoint:

- `npm run typecheck`: PASS
- `npx vitest run src/core/RendererBackend.test.ts src/core/TslMaterialFactory.test.ts src/core/GameRenderer.test.ts`: PASS
- `npm run lint`: PASS
- `npm run lint:docs`: PASS, 12 pre-existing grandfathered warnings
- `npm run check:webgpu-strategy`: PASS,
  `artifacts/perf/2026-05-10T14-23-23-107Z/webgpu-strategy-audit/strategy-audit.json`
- `npm run build`: PASS

Current limitation:

- K2 proves the foundation and failure posture only. Vegetation and combatant
  production materials still need K3/K4 slice ports before strict scene proof
  can claim WebGPU visual parity.

## KONVEYER-3 Checkpoint

Implemented after the KONVEYER-2 checkpoint:

- `src/rendering/KonveyerInstancedSlice.ts` adds a reusable TSL instanced
  impostor slice that can model vegetation, combatants, or effect particles
  without `ShaderMaterial`, `RawShaderMaterial`, or GLSL shader strings.
- `scripts/konveyer-slice-probe.ts` writes measured slice artifacts under
  `artifacts/perf/**/konveyer-*-slice/slice.json`.
- `package.json` wires `check:konveyer-vegetation-slice` and
  `check:konveyer-combatant-slice` so the measured slices are repeatable.
- `src/rendering/KonveyerInstancedSlice.test.ts` verifies the vegetation slice
  creates a node material, stays single-draw in the slice model, and reports no
  GLSL shader strings.

Validation for this checkpoint:

- `npm run typecheck`: PASS
- `npx vitest run src/rendering/KonveyerInstancedSlice.test.ts src/core/TslMaterialFactory.test.ts`: PASS
- `npm run check:konveyer-vegetation-slice`: PASS,
  `artifacts/perf/2026-05-10T14-37-17-283Z/konveyer-vegetation-slice/slice.json`
- `npm run lint`: PASS
- `npm run lint:docs`: PASS, 12 pre-existing grandfathered warnings
- `npm run build`: PASS

Measured vegetation slice:

- Surface: `vegetation-billboard`
- Capacity: `16384`
- Active instances: `8192`
- Estimated GPU-writable bytes: `1048716`
- Node material: `true`
- GLSL shader strings: `0`

Current limitation:

- This was the first TSL instanced impostor slice. K7 has since promoted the
  production `GPUBillboardVegetation` path onto a TSL node material too. The
  remaining vegetation risk is visual/perf acceptance on real scenes and
  headed WebGPU hardware, not a `RawShaderMaterial` production dependency.

## KONVEYER-4 Checkpoint

Implemented after the KONVEYER-3 checkpoint:

- The shared `KonveyerInstancedSlice` substrate is exercised as a combatant
  impostor slice with the project target scale of 3,000 capacity and a 120 NPC
  active stress slice.
- `check:konveyer-combatant-slice` writes a separate artifact from vegetation
  so reviewers can compare surface-specific capacities and bytes.

Validation for this checkpoint:

- `npm run check:konveyer-combatant-slice`: PASS,
  `artifacts/perf/2026-05-10T14-37-17-259Z/konveyer-combatant-slice/slice.json`
- Shared K3/K4 code validation used the same lint, docs, targeted Vitest, and
  production build gates listed in KONVEYER-3.

Measured combatant slice:

- Surface: `combatant-impostor`
- Capacity: `3000`
- Active instances: `120`
- Estimated GPU-writable bytes: `192140`
- Node material: `true`
- GLSL shader strings: `0`

Current limitation:

- The combatant slice proves the TSL instanced impostor substrate at Phase F
  capacity shape. It does not yet replace the production animated Pixel Forge
  NPC atlas shader, crop-map sampling, aura/outline behavior, or close-GLB
  skinning proof.

## KONVEYER-5 And KONVEYER-6 Checkpoint

Implemented after the KONVEYER-4 checkpoint:

- `src/rendering/KonveyerComputeCarrier.ts` adds fixed vec4-pair carrier
  layouts for effect particles and sensor/cover samples.
- The effect carrier is the K5 path for particles, muzzle, impact, and
  projectile-adjacent visual compute work.
- The sensor/cover carrier is the K6 path for future cover, visibility, and
  sensing compute slices while CPU gameplay authority remains intact.
- `createKonveyerStorageBufferAttribute()` bridges the CPU-authored carriers
  into Three WebGPU `StorageBufferAttribute` objects.
- `scripts/konveyer-compute-carrier-probe.ts` writes repeatable artifacts for
  both carrier kinds.
- `package.json` wires `check:konveyer-compute-carriers`.

Validation for this checkpoint:

- `npm run typecheck`: PASS
- `npx vitest run src/rendering/KonveyerComputeCarrier.test.ts`: PASS
- `npm run check:konveyer-compute-carriers`: PASS,
  `artifacts/perf/2026-05-10T14-37-17-228Z/konveyer-compute-carriers/carriers.json`
- `npm run lint`: PASS
- `npm run lint:docs`: PASS, 12 pre-existing grandfathered warnings
- `npm run check:webgpu-strategy`: PASS,
  `artifacts/perf/2026-05-10T14-37-26-961Z/webgpu-strategy-audit/strategy-audit.json`
- `npm run build`: PASS

Measured compute carriers:

| Carrier | Capacity | Active samples | Byte length | Storage vec4 count |
| --- | ---: | ---: | ---: | ---: |
| `effect-particle` | 4096 | 512 | 131072 | 8192 |
| `sensor-cover` | 3000 | 120 | 96000 | 6000 |

Current limitation:

- These are storage-buffer-ready data carriers, not a compute shader dispatch.
  They intentionally preserve CPU authority until a later gate proves WebGPU
  compute execution, readback cost, determinism, and fallback policy.

K5 production particle material reduction:

- `src/systems/effects/MuzzleFlashSystem.ts` now uses standard
  `THREE.PointsMaterial` for NPC and player muzzle flashes instead of custom
  GLSL point programs.
- The pooled point representation stayed intact: NPC flashes remain
  perspective attenuated, player overlay flashes stay fixed-pixel, active
  particles are vertex-colored by life, and inactive slots move to the hidden
  sentinel position.
- `src/systems/effects/MuzzleFlashSystem.test.ts` covers the material type,
  attribute contract, particle upload path, and scene cleanup.
- `npx vitest run src/systems/effects/MuzzleFlashSystem.test.ts`: PASS
- `npm run check:webgpu-strategy`: PASS,
  `artifacts/perf/2026-05-10T14-58-05-913Z/webgpu-strategy-audit/strategy-audit.json`
- `npm run audit:konveyer-completion`: BLOCKED as expected while the tree was
  dirty, but it recorded `productionBlockers=36`, down from `39` after the
  prior clean checkpoint.

## KONVEYER-7 Tail Route

KONVEYER-7 is the remaining full-scene parity route. It is not safe to call
default-on WebGPU complete until these surfaces are migrated or explicitly
disabled by scenario policy:

| Surface | Required route | Acceptance evidence |
| --- | --- | --- |
| Terrain CDLOD | TSL node material port, packed instancing, headed WebGPU strict proof, and Open Frontier/A Shau visual review are in place. | `npx tsx scripts/check-terrain-visual.ts --headed --port 9271 --renderer webgpu-strict`, `artifacts/perf/2026-05-11T02-00-18-828Z/projekt-143-terrain-visual-review/visual-review.json`; A Shau perf capture remains a production-rollout follow-up. |
| Global water | Standard material plane is now the fallback/ocean path; hydrology river mesh stays standard material. Future work is visual acceptance and flow, not a WebGL-only material port. | Water-system audit plus water-enabled screenshots/perf in Open Frontier and A Shau hydrology paths. |
| Post-processing | Keep runtime disabled or move to Three WebGPU node `PostProcessing`; do not re-enable classic WebGL render-target composer as WebGPU proof. | Built-app renderer matrix plus visual-integrity audit. |
| Vegetation production path | Production material is now TSL/node based and strict WebGPU hardware proof is green. Buffer initialization prevents zero-instance or infinite-instance submission hazards. | Renderer matrix, terrain visual coverage, and combat120 evidence cover the active branch review packet. |
| Combatant production path | Production Pixel Forge impostor material is now TSL/node based. Combat120 validates the active impostor/close-combat stress path with zero WebGPU console errors. | Combat120 capture and renderer matrix. |

This route is the review boundary for actual default-on approval. The branch
now has renderer selection, strict proof behavior, TSL material foundation,
measured vegetation/combatant slices, storage-buffer-ready compute carriers,
headed hardware WebGPU strict proof, combat120 evidence, and zero active
production render blockers in the completion audit. It still needs human owner
approval before any merge to `master` or production deploy.

K7 post-processing tail reduction:

- `src/systems/effects/PostProcessingManager.ts` is now an explicit no-op
  compatibility shim. It preserves input/toggle compatibility but owns no
  render target or shader blit resources.
- `src/systems/effects/PostProcessingManager.test.ts` now asserts the no-op
  contract and pixel-size compatibility state.
- `npm run check:webgpu-strategy` after this change wrote
  `artifacts/perf/2026-05-10T14-42-46-903Z/webgpu-strategy-audit/strategy-audit.json`.
- Static blocker count moved from `117` at KONVEYER-0 to `108`; the
  `WebGLRenderTarget` category is now `0`.
- After the K5 muzzle flash material port, the production blocker count moved
  to `36`; raw static matches remain noisy because docs and tests are still in
  the strategy audit scope.
- The old `CloudLayer` plane was retired after confirming `AtmosphereSystem`
  already forced it invisible and routed effective weather/scenario coverage
  into the sky-dome backend. This removes a dead production shader surface
  instead of porting an unused fallback-looking path.
- `npm run audit:konveyer-completion` after this retirement recorded
  `productionBlockers=34` while the tree was dirty; the branch still needs a
  clean completion audit after commit/push.
- The active sky dome was then moved off its custom material path by generating
  the analytic sky/cloud texture on CPU and rendering it with standard
  `MeshBasicMaterial`. This preserves the existing CPU atmosphere LUT for fog
  and lighting while removing the visible sky dome from the custom shader
  inventory.
- `npm run audit:konveyer-completion` after the sky-dome material port recorded
  `productionBlockers=31` while the tree was dirty; the branch still needs a
  clean completion audit after commit/push.
- The global water plane was then moved from Three's example `Water` object to
  a standard `MeshStandardMaterial` plane with normal-map offset animation.
  Hydrology river surfaces and water query semantics stayed intact.
- `npm run audit:konveyer-completion` after the water material port recorded
  `productionBlockers=26` while the tree was dirty; the branch still needs a
  clean completion audit after commit/push.
- Completion audit refinement now reports direct WebGL context access
  separately from active render-material blockers. The remaining context hits
  are confined to `GPUTimingTelemetry` and `DeviceDetector`, so they are
  policy-visible diagnostics/capability probes, not default-on render proof.
- After removing a comment-only `RawShaderMaterial` false positive,
  `npm run audit:konveyer-completion` recorded `productionBlockers=25`,
  `productionRenderBlockers=16`, and `unexpectedContextBlockers=0` while the
  tree was dirty.
- The production vegetation billboard path was then ported from
  `RawShaderMaterial` plus GLSL shader strings to a TSL `MeshBasicNodeMaterial`
  graph. The graph preserves instanced positions/scales/rotations, atlas
  azimuth/elevation selection, wind sway, height fog, atmosphere lighting,
  normal-atlas lighting, alpha hardening, and premultiplied blending. The
  explicit WebGL diagnostic renderer installs Three's WebGL node handler for
  comparison only; strict WebGPU proof remains the acceptance path.
- `npx vitest run src/systems/world/billboard/BillboardBufferManager.test.ts src/systems/world/billboard/GPUBillboardSystem.test.ts`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run smoke:prod`: PASS
- `npx tsx scripts/konveyer-completion-audit.ts` after this port recorded
  `productionBlockers=23`, `productionRenderBlockers=14`,
  `unexpectedContextBlockers=0`, and `rawBlockers=100` while the tree was
  dirty.
- The combatant support layer was then narrowed so only the active Pixel Forge
  impostor material remains a production `ShaderMaterial` blocker. Unused
  outline shader creation was removed, and combatant material plumbing now
  updates a renderer-agnostic uniform-material contract so the coming TSL
  impostor port does not have to preserve `ShaderMaterial` types.
- `npx vitest run src/systems/combat/CombatantShaders.test.ts src/systems/combat/CombatantMeshFactory.test.ts src/systems/combat/CombatantRenderer.test.ts`: PASS
- `npm run check:webgpu-strategy`: PASS,
  `artifacts/perf/2026-05-10T15-45-40-071Z/webgpu-strategy-audit/strategy-audit.json`
- `npx tsx scripts/konveyer-completion-audit.ts` after this cleanup recorded
  `productionBlockers=12`, `productionRenderBlockers=3`,
  `unexpectedContextBlockers=0`, and `rawBlockers=89` while the tree was
  dirty. The remaining production render blockers are the active Pixel Forge
  NPC impostor material and terrain CDLOD `onBeforeCompile`.
- The active Pixel Forge NPC impostor material was then ported from
  `ShaderMaterial` plus GLSL shader strings to a TSL `MeshBasicNodeMaterial`
  graph. The graph preserves crop-map atlas sampling, view/frame selection,
  loop and one-shot animation modes, readability/parity tuning, atmosphere
  lighting, fog matching, alpha testing, and tile-crop texture disposal.
- The production terrain material was then ported from
  `MeshStandardMaterial.onBeforeCompile` shader injection to a TSL
  `MeshStandardNodeMaterial` graph. CDLOD now supplies explicit tile
  attributes for node-material displacement, and terrain shading owns biome
  blending, hydrology masks, feature surfaces, far-canopy tint, roughness, and
  debug LOD color through node fields.
- The strict WebGPU terrain/lighting repair fixed the remaining visual
  blocker without adding WebGL fallback masking: the TSL terrain position node
  now returns tile-local X/Z for instanced CDLOD placement, biome sampling wraps
  UVs in shader space, visual proof tile selection follows the explicit render
  camera override, analytic sky/fog radiance is bounded before becoming scene
  lighting, terrain ground albedo keeps sRGB texture policy, and vegetation
  billboards now use material-owned exposure/chroma/light clamps.
- K7 node materials explicitly disable Three's legacy WebGL fixed fog uniform
  path because terrain, NPC impostors, vegetation, and fixture materials own
  fog/tint in their node graphs. This is not a hidden fallback: strict WebGPU
  still fails if Three resolves to the WebGL backend.
- The production vegetation TSL graph was then split into
  `BillboardNodeMaterial.ts` plus shared billboard types so
  `BillboardBufferManager.ts` stays under the source budget instead of adding
  new grandfathered debt during the migration.
- `npx vitest run src/systems/terrain/TerrainMaterial.test.ts src/systems/terrain/CDLODRenderer.test.ts src/systems/world/billboard/BillboardBufferManager.test.ts src/systems/combat/CombatantMeshFactory.test.ts src/core/TslMaterialFactory.test.ts`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run validate:fast`: PASS, with only existing grandfathered warnings
- `npm run build`: PASS
- `npm run build:perf`: PASS
- `npm run smoke:prod`: PASS
- `npm run check:terrain-visual -- --headed --port 9254`: PASS,
  `artifacts/perf/2026-05-10T17-50-31-169Z/projekt-143-terrain-visual-review/visual-review.json`
- `npm run check:webgpu-strategy`: PASS,
  `artifacts/perf/2026-05-10T16-59-57-044Z/webgpu-strategy-audit/strategy-audit.json`,
  `recommendation=commit-webgpu-migration`
- `npm run check:konveyer-renderer-matrix -- --headed`: PASS,
  `artifacts/perf/2026-05-10T17-50-23-900Z/konveyer-renderer-matrix/matrix.json`
- `npx tsx scripts/konveyer-completion-audit.ts` after the combatant and
  terrain ports recorded `productionBlockers=9`,
  `productionRenderBlockers=0`, `unexpectedContextBlockers=0`, and
  `rawBlockers=80` in
  `artifacts/perf/2026-05-10T16-59-03-860Z/konveyer-completion-audit/completion-audit.json`
  while the tree was dirty. Strict WebGPU and default-on readiness both pass;
  the remaining blocker is branch cleanliness until this doc/code checkpoint is
  committed and pushed.
- The first full WebGPU combat120 capture exposed real renderer-portability
  bugs that prior partial artifacts could hide: vegetation submitted
  `drawIndexed(... Infinity ...)`, terrain/CDLOD exceeded the WebGPU vertex
  buffer limit, and textured point muzzle flashes requested missing `uv`
  geometry. These were fixed without adding fallback masking:
  `BillboardBufferManager` initializes `instanceCount=0` and mesh visibility,
  `CDLODRenderer` packs six scalar tile attributes into two vec4 attributes,
  zero-instance combatant meshes stay invisible, and muzzle flashes no longer
  bind a texture to `PointsMaterial`.
- The combat LOD scheduler now chooses stagger/cap eligibility before polling
  the hard AI budget and uses the existing soft budget as a proactive defer
  point. This keeps combat120 from reporting off-stagger visual updates as AI
  starvation while preserving the hard-overrun signal for scheduled AI work.
- Final headed combat120 evidence:
  `artifacts/perf/2026-05-10T17-46-59-842Z/summary.json`. Status `ok`,
  console errors `0`, AI starvation average `2.77` PASS, average frame
  `16.78ms`, p99 `37.80ms`, max `47.00ms`, no 50ms/100ms hitches. Residual
  warnings were p99-frame, heap growth/peak growth, and a stochastic harness
  movement-transition warning.
- `npm run perf:compare`: WARN, `6 pass`, `2 warn`, `0 fail` against the
  tracked `combat120` baseline. Warned metrics were average frame time and
  heap growth; p95, p99, max frame, hitches, and over-budget percent passed.
- 2026-05-11 terrain/lighting repair validation:
  - `npx vitest run src/systems/world/billboard/BillboardBufferManager.test.ts src/systems/world/billboard/GPUBillboardSystem.test.ts src/systems/assets/AssetLoader.test.ts src/systems/terrain/TerrainMaterial.test.ts src/systems/terrain/TerrainRenderRuntime.test.ts src/systems/environment/AtmosphereSystem.test.ts src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts`: PASS
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS, 279 files / 4224 tests
  - `npm run build`: PASS
  - `npm run build:perf`: PASS
  - `npx tsx scripts/check-terrain-visual.ts --headed --port 9271 --renderer webgpu-strict`: PASS,
    `artifacts/perf/2026-05-11T02-00-18-828Z/projekt-143-terrain-visual-review/visual-review.json`
  - `npx tsx scripts/konveyer-completion-audit.ts`: COMPLETE,
    `artifacts/perf/2026-05-11T02-08-44-493Z/konveyer-completion-audit/completion-audit.json`

## KONVEYER-8 Validation Matrix

Implemented after the KONVEYER-5/KONVEYER-6 checkpoint:

- `src/core/bootstrap.ts` exposes read-only renderer backend capabilities under
  `?diag=1` for validation scripts.
- `scripts/konveyer-renderer-matrix.ts` runs the built app through two proof
  cases: default WebGPU and strict WebGPU. Explicit WebGL diagnostics are kept
  out of this matrix so they cannot count as fallback success.
- `--headed` switches the matrix off headless SwiftShader and onto the local
  hardware browser path for real strict WebGPU proof.
- `package.json` wires `check:konveyer-renderer-matrix`.

Validation for this checkpoint:

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run smoke:prod`: PASS
- `npm run check:konveyer-renderer-matrix -- --headed`: PASS,
  `artifacts/perf/2026-05-10T17-50-23-900Z/konveyer-renderer-matrix/matrix.json`

Renderer matrix result from the 2026-05-10 artifact:

| Case | Result | Resolved backend | Meaning |
| --- | --- | --- | --- |
| `default-webgpu` | PASS | `webgpu` | Current default path reaches the start screen on headed hardware WebGPU. |
| `webgpu-strict` | PASS | `webgpu` | Strict proof resolves real WebGPU and does not accept fallback success. |

2026-05-11 policy update:

- The renderer matrix script now fails unless both default and strict WebGPU
  resolve `webgpu`.
- `legacy-webgl` and `webgpu-force-webgl` are no longer proof cases.

Current limitation:

- Headless Chromium can still miss a hardware WebGPU adapter. That is an
  environment failure, not a WebGL fallback pass.

## KONVEYER-9 Review Packet

Branch state:

- Branch: `exp/konveyer-webgpu-migration`
- Scope: experimental only, no `master` merge and no production deploy.
- Checkpoint commits pushed for review include:
  - `7ee1b59 docs(konveyer): add WebGPU parity ledger`
  - `38d6d71 feat(konveyer): add experimental WebGPU renderer boot path`
  - `72c566e feat(konveyer): add strict WebGPU TSL foundation`
  - `67879b1 feat(konveyer): add measured TSL impostor slices`
  - `c831e6d feat(konveyer): add compute-ready carrier probes`
  - `913f602 test(konveyer): add renderer backend matrix`
  - `4d9174c refactor(konveyer): retire legacy post-processing blocker`
  - `3c1ede2 refactor(konveyer): port muzzle flashes off custom shaders`
  - `09d0b56 refactor(konveyer): retire hidden cloud plane`
  - `8f3d560 refactor(konveyer): render sky dome with standard material`
  - `e10f527 refactor(konveyer): port global water to standard material`
  - `da33b2a test(konveyer): separate diagnostic context blockers`
  - `ef4dcbd refactor(konveyer): port vegetation billboards to TSL`
  - `a24d0ed refactor(konveyer): port combatants and terrain to TSL`
- Use `git log --oneline` and the completion audit artifact for the exact
  current branch head; avoid freezing a stale final SHA in this ledger.

Default-on decision:

- Visual blocker cleared for the experiment branch after the 2026-05-11
  strict WebGPU terrain/lighting repair. Default startup requests WebGPU,
  strict proof resolves `webgpu`, and the latest strict terrain visual review
  accepts Open Frontier and A Shau ground tone.
- Not approved for `master` merge or production deploy yet. Review still needs
  residual perf-warning acceptance, cross-browser/mobile acceptance, A Shau
  perf acceptance, and an owner rollback decision.

2026-05-11 visual repair:

- The branch should use strict WebGPU-only proof. WebGL may remain as named
  diagnostic comparison, but it must not count as fallback success,
  completion-audit success, or demo-readiness evidence.
- The prior Open Frontier white/low-contrast terrain rejection is superseded by
  `artifacts/perf/2026-05-11T02-00-18-828Z/projekt-143-terrain-visual-review/visual-review.md`.
- The latest visual artifact passes all required terrain checks with
  `renderer=webgpu-strict`, zero browser/page errors, and Open Frontier/A Shau
  river, foundation, parking, support, and player-ground coverage.
- Asset caveat: close vegetation still inherits source-atlas silhouette limits.
  The WebGPU material now avoids washed-out/neon presentation, but final art
  polish should still come from Pixel Forge source atlas or mesh-LOD upgrades.

Next reviewer decisions:

- Review the combat120 and terrain visual artifacts on WebGPU-capable hardware
  and decide whether the residual perf warnings are acceptable for this
  experiment branch.
- Run broader cross-browser/mobile checks and A Shau perf captures before any
  production rollout; the current A Shau evidence is visual terrain coverage,
  not a full A Shau perf acceptance.
- Decide whether the explicit WebGL escape hatches should stay query/env only
  or become a visible player setting before any production rollout.
- Approve a later `[interface-change]` PR to rename fenced renderer types away
  from `WebGLRenderer` once the internal adapter has proven stable.

## KONVEYER-10 Next Cycle: Scene Parity And Frame-Budget Attribution

KONVEYER-0 through KONVEYER-9 close the branch-review migration route, not the
production-rollout route. Terrain color is accepted for now based on the latest
strict WebGPU terrain packet, but the rest of the scene still needs parity and
budget work before this can claim to be better than the WebGL production path.

KONVEYER-10 definition of parity: use WebGL as evidence of the intended game,
not as a pixel-perfect target. The WebGL path was the first implementation
attempt for the vision, and it had known visual weaknesses. WebGPU work should
keep what served the vision and replace what did not, especially around jungle
density, combatant readability, atmosphere depth, flight-scale horizons, and
performance attribution for materialization-tier scale.

Closure rule: after the initially scoped migration/parity objectives are met,
run a separate principles-first rearchitecture review. That review should ask
what the scene, material, atmosphere, culling, edge, and materialization systems
should be for this game now that WebGPU/TSL is the baseline, rather than
cementing WebGL-era compromises because they happened to be migrated.

Water-loop rule: insert a hydrology/water pass before that larger
first-principles review. The scene architecture cannot be judged complete
without reviewing visible hydrology, water shader/material behavior,
water/terrain intersections, interaction, buoyancy/swimming, and eventual
watercraft as connected systems.

Asset rule: strict WebGPU parity evidence must be allowed to indict source
assets and bakes. Vegetation/NPC impostor atlases, alpha crops, normal maps,
LOD source, compression, and texture color space may have been authored around
the old WebGL material path. If WebGPU exposes those assumptions, the preferred
fix can be Pixel Forge regeneration, impostor rebake, texture edit, or
source-asset cleanup rather than shader compensation.

Current symptoms to treat as open engineering work:

- Vegetation and NPC impostors can read washed, pale, or detached from terrain
  because they use material-owned `MeshBasicNodeMaterial` lighting/fog models
  while terrain and close GLBs use different lighting paths.
- `World` timing is too coarse. It groups zone, tickets, weather, atmosphere,
  and water under a 1ms budget, so over-budget reports are not actionable yet.
- Water is now wired through hydrology surfaces and a shared interaction
  sample, but the visual material is still provisional. Do not treat global
  water, hydrology strip rendering, shader design, terrain intersections,
  buoyancy/swimming, and watercraft as separate architecture decisions.
- Sky/cloud behavior used to feel attached to the player in flight because the
  dome is camera-followed and clouds were sampled from sky texture coordinates
  rather than authored as a world/altitude-anchored layer. K13 first slice now
  projects cloud sampling through a 1,800m world deck while keeping the dome
  camera-followed for clipping safety.
- Clouds also showed obvious representation defects before this cycle:
  straight-line cutoffs, hard bands, and alignment seams. Those are not solved
  by color parity; they require a representation or asset-authoring decision.
- Renderer triangle counters can reach 1M+ in ordinary strict-WebGPU review
  shots. Skyward 1.5M reports need scene/pass attribution before CDLOD, shadow,
  or vegetation budgets are changed.
- Small finite maps such as Zone Control still expose hard terrain edges from
  the air. Visual margins are not a horizon strategy.

KONVEYER-10 acceptance criteria:

1. Split `SystemUpdater.World` evidence into named sub-timings for atmosphere
   sky texture, atmosphere light/fog, weather, water, and zone/ticket work.
2. Add strict-WebGPU debug/evidence modes or probes for vegetation and NPC
   impostors that separate raw atlas/crop, material lighting, fog contribution,
   and final output.
3. Fix or explicitly document the `todCycle.startHour` phase drift so scenario
   sun intent matches runtime behavior.
4. Capture skyward renderer counters with scene/pass attribution and preserve
   the artifact path in this ledger.
5. Select a sky/cloud anchoring approach that keeps flight views stable without
   bringing back a finite flat cloud plane as a WebGPU blocker.
6. Select a finite-map edge approach for Zone Control and similar modes:
   terrain apron, low-res far ring, edge fade, flight clamp, or a documented
   equivalent.
7. Run strict-WebGPU Open Frontier, Zone Control, Team Deathmatch, combat120,
   and A Shau short captures before any renewed default-on or rollout claim.

KONVEYER-10 implementation direction selected on 2026-05-11:

- `World` stays as the aggregate frame-budget bucket for continuity, but child
  timings must be visible as `World.Zone`, `World.Tickets`, `World.Weather`,
  `World.Atmosphere`, `World.Water`, plus atmosphere-internal sky texture,
  light/fog, and cloud timings.
- Sky dome remains camera-followed so aircraft cannot clip through it. The
  cloud model should not remain player-attached: active work samples the cloud
  noise field through a world/altitude deck, giving flight a more stable
  weather read without reintroducing the retired finite flat cloud plane.
- Strict WebGPU proof for this cloud-deck anchoring slice is
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`;
  it records the new cloud model across Open Frontier, Zone Control, actual
  Team Deathmatch, combat120, and A Shau with zero console/page errors.
- The current sky-dome texture cloud pass is interim. If hard cloud cutoffs or
  visible seams remain after anchoring, the next proper solution is a
  world/altitude-authored cloud representation or regenerated cloud asset
  approach, not more one-off color tuning.
- Finite-map edge handling is a presentation problem, not a terrain-color
  problem. Source-backed visual extent is the selected direction for
  procedural/small maps where the source can continue past the playable square.
  A Shau is different: its current DEM has no outer source data, and the
  1600m DEM-edge extrapolation/tint experiment still read as a tan/gold
  synthetic band. Do not keep tuning that probe into acceptance; choose real
  DEM/source collar data, explicit flight/camera boundary, or a documented
  hybrid.
- Vegetation and NPC impostor tuning should be judged against the intended
  visual hierarchy. The target is dark, dense jungle mass with readable but
  grounded soldiers, not maximum brightness or exact WebGL color matching.
- Vegetation/NPC evidence should explicitly separate "bad material model" from
  "bad source bake." Pixel Forge rebakes or asset edits are valid next actions
  if raw atlas/crop/normal data is the root cause.
- Water/hydrology evidence has the same rule: if the current normal texture,
  strip mesh, or material colors fight the Vietnam scene, use a water material
  or asset-authoring pass rather than trying to make the old global plane serve
  every river, pond, and gameplay interaction.
- First water bridge proof is
  `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`;
  it proves hydrology meshes, channel queries, and `sampleWaterInteraction`
  in Open Frontier and A Shau, but does not accept shader/art/physics.
- Probe output is evidence, not the design target. A probe can identify the
  raw atlas, crop, material lighting, fog, and final-output contributions, but
  a human review decision should choose the renderer model that best serves the
  game vision.

KONVEYER-10 work-in-progress evidence on
`origin/exp/konveyer-webgpu-migration` branch head is indexed in
`docs/tasks/cycle-2026-05-11-konveyer-scene-parity.md` and `docs/DIRECTIVES.md`.
Current finding summary: strict WebGPU scene probes pass across the requested
modes; skyward triangle count is terrain/pass dominated; source-backed visual
extent is the selected small-map edge direction; A Shau remains blocked after
the rejected 1600m synthetic-collar proof; cloud anchoring improved to a
world/altitude-projected deck on a camera-followed dome; water now has a
proved hydrology/query/interaction bridge but no accepted shader, flow,
physics, or visual art; close-NPC proof now uses public
`window.npcMaterializationProfile()` telemetry plus geometry-derived body
bounds, shows a strict-WebGPU close soldier/weapon in the isolated material
crop, and records the bounded Open Frontier spawn-residency reserve at
`artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json`;
the UI "Compiling features" step is attributed mostly to the stamped heightmap
rebake rather than shader compilation.
Research spike: `docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md`
sets WebGPU/TSL as the principles-first baseline; ECSY is reference vocabulary only.

## KONVEYER-10 Multi-Mode Materialization Evidence (2026-05-12)

Multi-mode strict-WebGPU asset crop probe across Open Frontier, Zone Control,
Team Deathmatch, combat120 (ai_sandbox), and A Shau Valley:

- `artifacts/perf/2026-05-12T01-50-01-495Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  (with spawn-residency reserve engaged in Open Frontier)
- `artifacts/perf/2026-05-12T01-50-30-290Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  (parallel run with a wider initial player frame, so the Open Frontier
  spawn-residency reserve did not engage and 4 close-radius actors fell back
  to impostor; the cap-policy story is the same)

All five modes resolve `resolvedBackend=webgpu` with `strictWebGPUReady=true`,
zero console errors, zero page errors, zero request failures. Per-mode close
model residency under the current 8 + 4-spawn-reserve cap:

Run 1 (`01-50-01-495Z`):

| Mode | Candidates ≤120 m | Active close-GLBs | Effective cap | Fallbacks | Nearest fallback (m) |
| --- | ---: | ---: | ---: | --- | ---: |
| `open_frontier` | 10 | 10 | 10 | none | n/a |
| `zone_control` | 13 | 11 | 11 | `total-cap:2` | 65.0 |
| `team_deathmatch` | 16 | 12 | 12 | `total-cap:4` | 36.0 |
| `ai_sandbox` (combat120) | 29 | 12 | 12 | `pool-empty:3, total-cap:14` | 23.3 |
| `a_shau_valley` | 0 | 0 | 8 | none | n/a |

Run 2 (`01-50-30-290Z`), camera framed wider so OF reserve did not engage:

| Mode | Candidates ≤120 m | Active close-GLBs | Effective cap | Fallbacks |
| --- | ---: | ---: | ---: | --- |
| `open_frontier` | 12 | 8 | 8 | `total-cap:4` |
| `zone_control` | 12 | 9 | 9 | `total-cap:3` |
| `team_deathmatch` | 16 | 12 | 12 | `total-cap:4` |
| `ai_sandbox` (combat120) | 32 | 12 | 12 | `pool-empty:2, total-cap:18` |
| `a_shau_valley` | 0 | 0 | 8 | none |

What this proves:

- The spawn-residency reserve closes Open Frontier's crowded-spawn symptom
  cleanly: 10 of 10 candidates within close radius render as close GLBs with
  no fallback records.
- Zone Control and Team Deathmatch still drop spawn-cluster actors to
  impostor inside the close radius. The current reserve raised the effective
  cap above the 8-slot baseline but did not cover all spawn residents.
- combat120 has 29 candidates inside the 120 m close radius. Even with the
  full reserve the cap holds at 12, so 17 close-radius actors render as
  impostors (3 of those because the per-faction pool ran empty before the
  total cap was hit, 14 because the cap is the hard limit). Nearest fallback
  is at 23.3 m. This is the densest close-NPC cluster the proof has seen.
- A Shau Valley has zero combatants inside the 120 m close radius from the
  current player spawn pose. This is consistent with A Shau's strategic-tier
  spawn distribution (3,000-unit simulation; close materialization happens
  only where the player walks into action), but it also means the probe
  cannot accept or reject A Shau close-GLB behavior from spawn alone.

What this does not prove:

- The right cap size for the experimental branch. Raising the cap will spend
  frame budget; lowering it will keep more actors as impostors. The decision
  belongs with the budget-arbiter slice in
  `docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md`, not with this
  probe.
- That the spawn-residency reserve is the correct policy for non-spawn
  clusters. The combat120 evidence shows the densest clusters happen mid-game
  (actors converging on AI sandbox waypoints, not at spawn position). The
  reserve as authored only covers initial spawn density. The Phase F arbiter
  is expected to subsume the spawn-residency policy under a per-cluster
  hard-near reserve once it exists.
- A Shau visual-acceptance for close NPCs. A directed probe that warps the
  player into an A Shau action zone (or waits for AI convergence) is the
  next evidence step there.

This evidence is the input for Phase F materialization tier work and the
KONVEYER-10 budget-arbiter slice. Hard stops remain in force: no master
merge, no perf baseline refresh, no fenced-interface edit, no WebGL fallback
proof. The probe is repeatable with:

```
npx tsx scripts/konveyer-asset-crop-probe.ts --headed --port 9281 \
  --modes open_frontier,zone_control,team_deathmatch,combat120,a_shau_valley \
  --close-model-wait-ms 12000
```

Phase F materialization tier draft:
`docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md`. It records the
current sim/render lanes, names the spawn-residency reserve as a special case
of a broader per-cluster hard-near reserve, and proposes a budget arbiter
plus two new render lanes (silhouette and cluster) to scale toward 3,000
combatants without each entity costing a draw call.

Hard stops remain unchanged: no `master` merge, no production deploy, no
`perf-baselines.json` refresh, no fenced-interface edit, and no fallback-based
WebGPU proof.

Final validation rollup on 2026-05-10:

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run lint:docs`: PASS, 12 pre-existing grandfathered warnings
- `npx vitest run src/core/RendererBackend.test.ts src/core/TslMaterialFactory.test.ts src/rendering/KonveyerInstancedSlice.test.ts src/rendering/KonveyerComputeCarrier.test.ts`: PASS
- `npm run check:konveyer-vegetation-slice`: PASS
- `npm run check:konveyer-combatant-slice`: PASS
- `npm run check:konveyer-compute-carriers`: PASS
- `npm run check:webgpu-strategy`: PASS
- `npm run build`: PASS
- `npm run build:perf`: PASS
- `npm run smoke:prod`: PASS
- `npm run check:konveyer-renderer-matrix -- --headed`: PASS
- `npm run check:terrain-visual -- --headed --port 9254`: PASS
- `npm run perf:capture:combat120`: PASS with validation WARN
- `npm run perf:compare`: WARN, `6 pass`, `2 warn`, `0 fail`
- `npm run validate:fast`: PASS, 28 pre-existing source-budget warnings and
  12 pre-existing docs warnings

Completion audit:

- `npm run audit:konveyer-completion` writes a prompt-to-artifact checklist
  under `artifacts/perf/**/konveyer-completion-audit/completion-audit.json`.
- The audit is intended to be run against a clean branch head after the final
  default-on checkpoint commit. A dirty-tree audit is allowed as progress
  evidence only and should not be treated as the final completion signal.
