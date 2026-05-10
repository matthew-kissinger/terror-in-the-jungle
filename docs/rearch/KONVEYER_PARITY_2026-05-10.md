# KONVEYER Parity And Migration Ledger

Last verified: 2026-05-10

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

The initial platform probe wrote:

- `artifacts/perf/2026-05-10T14-06-51-008Z/projekt-143-platform-capability-probe/summary.json`
- Chromium `147.0.7727.15`
- Headless WebGL2: PASS through SwiftShader
- Headless WebGPU adapter: WARN, `navigator.gpu` exists but no adapter returned
- COOP/COEP and `SharedArrayBuffer`: PASS locally and on live Pages headers

This means the first runtime implementation must keep compile-time, explicit
WebGL fallback, and strict headed WebGPU adapter proof separate.

## Architecture Posture

Three.js remains the chosen renderer path for KONVEYER. The experiment is not
permission to pivot to another browser renderer framework. The long-term
"native or port-ready" posture is instead:

- Make the renderer boundary backend-agnostic inside the engine while leaving
  the fenced public interface alone until a reviewed interface-change PR.
- Move shader code from GLSL strings toward TSL/node graphs so the same intent
  can target WGSL for WebGPU and GLSL for explicit WebGL2 fallback.
- Keep simulation authority on CPU-side data contracts that can later move
  toward WASM, worker, or native-hosted builds without coupling game state to a
  specific browser graphics context.
- Treat Vite config and tests as migration infrastructure. A WebGPU proof gate
  must fail loudly when the WebGPU backend is missing, even though the product
  runtime can keep a separately tested WebGL fallback path.

Fallback policy for this branch:

- `?renderer=webgpu-strict` and `VITE_KONVEYER_WEBGPU_STRICT=1` are proof
  modes. They must fail if Three resolves to the WebGL backend.
- `?renderer=webgpu-force-webgl` is an explicit compatibility matrix path. It
  is allowed only when the test name or artifact says fallback was forced.
- The default app path can retain WebGL while migration is incomplete, but no
  KONVEYER checkpoint should call fallback behavior WebGPU success.

## Upstream Facts Refreshed

Sources checked on 2026-05-10:

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
  correct bridge for dual-backend shader work.
- WebGPU is still not a universal browser baseline. MDN marks it limited
  availability and secure-context-only. Chrome documents broad support, but
  platform-specific fallback remains required.

## Repo Parity Matrix

| Surface | Status | Current owner path | WebGPU migration note |
| --- | --- | --- | --- |
| Main renderer boot | needs-port | `src/core/GameRenderer.ts` | Constructor is `THREE.WebGLRenderer`; startup now installs Three's WebGL node handler so TSL materials exercise the default WebGL path, but default-on still needs strict WebGPU hardware proof. |
| Engine render loop | unknown | `src/core/GameEngine.ts`, `src/core/GameEngineLoop.ts` | Mostly calls common `render`, `clearDepth`, `shadowMap`, and `info` APIs, but must not run before async WebGPU init. |
| Fenced renderer contract | blocked | `src/types/SystemInterfaces.ts` | `IGameRenderer.renderer` and weapon rendering methods are typed as `THREE.WebGLRenderer`; branch must use an internal adapter/cast and avoid fence edits. |
| GPU timing telemetry | blocked | `src/systems/debug/GPUTimingTelemetry.ts`, `src/systems/debug/PerformanceTelemetry.ts` | Uses `renderer.getContext()` and `EXT_disjoint_timer_query_webgl2`; WebGPU needs timestamp-query or disabled telemetry fallback. |
| Texture warmup | needs-port | `src/systems/assets/AssetLoader.ts` | Uses `renderer.initTexture`; common renderer has an initialized requirement, so WebGPU path needs init ordering guard. |
| Post-processing | retired | `src/systems/effects/PostProcessingManager.ts` | Runtime draws straight to back buffer. K7 removed the dormant low-res blit resources so this is no longer a hidden WebGPU blocker; any future post path must use Three's node post stack. |
| Terrain material | ported-needs-hardware-proof | `src/systems/terrain/TerrainMaterial.ts` | K7 replaced the production `onBeforeCompile` terrain shader injection with a TSL `MeshStandardNodeMaterial` graph for CDLOD displacement, biome shading, hydrology tint, feature surfaces, far-canopy tint, roughness, and explicit material-owned fog/tint. `check:terrain-visual` passes Open Frontier and A Shau on the WebGL node path. |
| Terrain renderer | ported-needs-hardware-proof | `src/systems/terrain/CDLODRenderer.ts` | CDLOD instancing now publishes explicit tile transform attributes for the node material instead of depending on injected `instanceMatrix` GLSL. |
| Vegetation billboards | ported-needs-hardware-proof | `src/systems/world/billboard/BillboardBufferManager.ts` | K7 moved production instanced vegetation off `RawShaderMaterial` onto a TSL `MeshBasicNodeMaterial` graph with atlas, wind, fog, lighting, and premultiplied alpha. Needs headed WebGPU hardware proof and perf comparison before default-on. |
| Combatant impostors | ported-needs-hardware-proof | `src/systems/combat/CombatantMeshFactory.ts` | K7 moved active Pixel Forge NPC atlas impostors off `ShaderMaterial` onto a TSL `MeshBasicNodeMaterial` graph with crop-map sampling, animation frame selection, readability, atmosphere lighting, and material-owned fog. Needs combat120 and headed WebGPU hardware proof. |
| Combatant close GLBs | ready | `src/systems/combat/CombatantRenderer.ts` | Mostly standard/skinned GLB materials. Must prove skinning, shadows, and perf under WebGPU separately. |
| Muzzle flashes | ported | `src/systems/effects/MuzzleFlashSystem.ts` | K5 follow-up replaced the custom points material with standard `PointsMaterial`, generated radial texture, and vertex colors. |
| Sky dome | ported | `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` | Uses a generated sky/cloud texture on standard `MeshBasicMaterial`; CPU LUT remains the fog/lighting authority. |
| Cloud layer | retired | `src/systems/environment/AtmosphereSystem.ts`, `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` | The old finite plane prototype was removed from production source; sky-dome clouds remain the only active cloud authority. |
| Global water | ported | `src/systems/environment/WaterSystem.ts` | The legacy global water plane now uses standard `MeshStandardMaterial` with animated normal texture offset; hydrology river water remains the map-space authority for channel surfaces. |
| Hydrology river water | ready | `src/systems/environment/WaterSystem.ts` | Uses `MeshStandardMaterial` vertex colors and CPU query segments. WebGPU-compatible candidate once renderer boots. |
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
- The active render-material blockers have been ported or retired, but
  default-on WebGPU still needs headed strict hardware proof, perf comparison,
  and reviewer approval before the product default changes.

## KONVEYER-1 Checkpoint

Implemented after the KONVEYER-0 checkpoint:

- `src/core/RendererBackend.ts` adds the internal renderer backend selector,
  capability object, async WebGPURenderer creation, and resolved-backend
  inspection.
- `src/core/GameRenderer.ts` keeps WebGL as the default constructor path and
  adds `initializeRendererBackend()` for explicit `?renderer=webgpu` and
  `?renderer=webgpu-force-webgl` opt-in paths.
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
- `npm run smoke:prod`: PASS, default WebGL app reached the deploy UI
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
| Terrain CDLOD | TSL node material port is in place. Remaining route is hardware WebGPU strict proof, screenshot review against saved terrain artifacts, and perf comparison before approval. | `check:terrain-visual` plus Open Frontier/A Shau perf captures on WebGPU-capable hardware. |
| Global water | Standard material plane is now the fallback/ocean path; hydrology river mesh stays standard material. Future work is visual acceptance and flow, not a WebGL-only material port. | Water-system audit plus water-enabled screenshots/perf in Open Frontier and A Shau hydrology paths. |
| Post-processing | Keep runtime disabled or move to Three WebGPU node `PostProcessing`; do not re-enable classic WebGL render-target composer as WebGPU proof. | Built-app renderer matrix plus visual-integrity audit. |
| Vegetation production path | Production material is now TSL/node based; remaining route is bundle/perf measurement and strict WebGPU hardware proof. | Vegetation horizon/grounding audits plus Open Frontier/A Shau captures. |
| Combatant production path | Production Pixel Forge impostor material is now TSL/node based; remaining route is combat120 and close-GLB skinning proof under the renderer matrix. | Combat120 capture and Pixel Forge NPC probe. |

This route is the review boundary for actual default-on approval. The branch
now has renderer selection, strict proof behavior, TSL material foundation,
measured vegetation/combatant slices, storage-buffer-ready compute carriers,
and zero active production render blockers in the completion audit. It does not
yet have headed hardware WebGPU strict proof or default-on reviewer approval.

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
  default WebGL renderer now installs Three's WebGL node handler so this path
  is exercised before default-on WebGPU.
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
- `npm run check:terrain-visual`: PASS,
  `artifacts/perf/2026-05-10T16-38-43-058Z/projekt-143-terrain-visual-review/visual-review.json`
- `npm run check:webgpu-strategy`: PASS,
  `artifacts/perf/2026-05-10T16-42-46-792Z/webgpu-strategy-audit/strategy-audit.json`
- `npm run check:konveyer-renderer-matrix`: PASS,
  `artifacts/perf/2026-05-10T16-44-28-123Z/konveyer-renderer-matrix/matrix.json`
- `npx tsx scripts/konveyer-completion-audit.ts` after the combatant and
  terrain ports recorded `productionBlockers=9`,
  `productionRenderBlockers=0`, `unexpectedContextBlockers=0`, and
  `rawBlockers=80` in
  `artifacts/perf/2026-05-10T16-43-42-954Z/konveyer-completion-audit/completion-audit.json`
  while the tree was dirty. The remaining blockers are branch cleanliness,
  strict hardware WebGPU proof, and default-on reviewer approval, not active
  production render-material blockers.

## KONVEYER-8 Validation Matrix

Implemented after the KONVEYER-5/KONVEYER-6 checkpoint:

- `src/core/bootstrap.ts` exposes read-only renderer backend capabilities under
  `?diag=1` for validation scripts.
- `scripts/konveyer-renderer-matrix.ts` runs the built app through three
  backend cases: default WebGL, explicit WebGPURenderer forced WebGL backend,
  and strict WebGPU proof mode.
- `package.json` wires `check:konveyer-renderer-matrix`.

Validation for this checkpoint:

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run smoke:prod`: PASS
- `npm run check:konveyer-renderer-matrix`: PASS,
  `artifacts/perf/2026-05-10T14-37-32-237Z/konveyer-renderer-matrix/matrix.json`

Renderer matrix result:

| Case | Result | Resolved backend | Meaning |
| --- | --- | --- | --- |
| `default-webgl` | PASS | `webgl` | Current production path still reaches the start screen. |
| `webgpu-force-webgl` | PASS | `webgpu-webgl-fallback` | Compatibility fallback is explicit and labeled. |
| `webgpu-strict` | PASS | loud fatal | Strict proof rejected fallback with `Strict WebGPU proof mode resolved webgpu-webgl-fallback; refusing WebGL fallback.` |

Current limitation:

- This machine's headless Chromium still resolves strict WebGPU to the WebGL
  fallback backend. That is a useful proof of the no-hidden-fallback gate, but
  not a headed hardware WebGPU success.

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
- Use `git log --oneline` and the completion audit artifact for the exact
  current branch head; avoid freezing a stale final SHA in this ledger.

Default-on decision:

- Not approved yet. The campaign produced the migration substrate, proof gates,
  and production TSL ports for the active tail render blockers, but strict
  WebGPU does not pass on this headless machine.
- The branch is ready for reviewer inspection because fallback is no longer
  hidden: strict proof fails loudly, compatibility fallback is separately
  named, default WebGL health is still validated, and the completion audit now
  reports `productionRenderBlockers=0`.

Next reviewer decisions:

- Run `npm run check:konveyer-renderer-matrix` on headed hardware with a real
  WebGPU adapter. Default-on work can only proceed if strict resolves
  `webgpu`.
- Run combat120 and Open Frontier/A Shau perf captures on WebGPU-capable
  hardware so reviewers can compare TSL material cost against the old WebGL
  shader path.
- Decide when to flip the product default to WebGPU with explicit WebGL
  fallback after strict hardware proof is green.
- Approve a later `[interface-change]` PR to rename fenced renderer types away
  from `WebGLRenderer` once the internal adapter has proven stable.

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
- `npm run smoke:prod`: PASS
- `npm run check:konveyer-renderer-matrix`: PASS
- `npm run validate:fast`: PASS, 28 pre-existing source-budget warnings and
  12 pre-existing docs warnings

Completion audit:

- `npm run audit:konveyer-completion` writes a prompt-to-artifact checklist
  under `artifacts/perf/**/konveyer-completion-audit/completion-audit.json`.
- This audit is intentionally allowed to report `completionStatus=blocked`
  without failing the command, because its job is to prevent a false
  default-on claim while the branch is still reducing tail blockers.
