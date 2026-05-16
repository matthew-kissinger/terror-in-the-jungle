# WebGL Fallback Pipeline Diff (Pre- vs Post-KONVEYER Merge)

Last verified: 2026-05-16
Cycle: `cycle-2026-05-16-mobile-webgpu-and-sky-recovery`
Task: `webgl-fallback-pipeline-diff` (R1)
Status: Memo only. No product code touched.

## Summary

The user-reported regression is **"mobile is unplayable post-merge"** (KB-MOBILE-WEBGPU).
This memo enumerates what the WebGL2-fallback render pipeline actually does on
master vs the pre-merge WebGL pipeline (parent of `1df141ca`, SHA `79103082`).

The single most important pre-vs-post structural fact:

> **Pre-merge** WebGL ran on `THREE.WebGLRenderer` (the classic renderer with
> its hand-tuned GLSL `ShaderLib` chunk system).
> **Post-merge default + adapter-denied** runs on `WebGPURenderer` from
> `three/webgpu` with its **internal WebGL2 backend** (the node-based
> generator that compiles TSL graphs to GLSL at runtime). These are not the
> same code path. See `node_modules/three/build/three.webgpu.js:82651`:
> ```
> parameters.getFallback = () => {
>   warn( 'WebGPURenderer: WebGPU is not available, running under WebGL2 backend.' );
>   return new WebGLBackend( parameters );
> };
> ```
> The fallback is *inside* the WebGPU renderer, not a swap back to classic
> `WebGLRenderer`. Mobile devices that previously rendered through the
> classic GLSL fast path are now going through the node-translated path
> with TSL-derived shaders.

This is the canonical KB-MOBILE-WEBGPU hypothesis (c) from the cycle brief:
*"WebGL2 fallback engaged but the fallback path itself is heavier than the
pre-migration WebGL renderer."*

## Method

- `git show 79103082:<path>` against current master files. No checkout of
  the pre-merge SHA.
- The "WebGL2 fallback" path is the code that runs when
  `strictWebGPU=false` (the default per `4aec731e`) and the WebGPU
  adapter is denied — `src/core/GameRenderer.ts:253-270` accepts the
  resolved `webgpu-webgl-fallback` backend and keeps the renderer.
- Every claim is cited with `file:line` from post-merge HEAD.

## What renders, in order, on the post-merge WebGL2 fallback

The main loop fires three `renderer.render(...)` calls per frame:

1. Main scene pass — `src/core/GameEngineLoop.ts:145` or `:147`
   (mortar camera or active camera).
2. First-person weapon overlay — `src/systems/player/weapon/WeaponModel.ts:112`
   (rendered through the shared renderer; same backend pipeline).
3. Grenade overlay — `src/core/GameEngineLoop.ts:174`
   (after `renderer.clearDepth()`; same backend pipeline).

`PostProcessingManager` is a no-op shim in both pre- and post-merge
(`src/systems/effects/PostProcessingManager.ts:11-44`) so there is no
backbuffer FXAA / bloom / pixelation pass on either side. That part is
not the source of new fallback cost.

What changed underneath each of those three passes is the **material
backend and the per-material shader-generation route**. The renderer
object itself is now a `WebGPURenderer` instance (see
`src/core/GameRenderer.ts:280` `this.renderer = renderer`) — even on
mobile WebGL2 fallback. The classic `THREE.WebGLRenderer` is only
constructed as a bootstrap and immediately disposed at
`src/core/GameRenderer.ts:278` (`previousRenderer.dispose()`).

## Pipeline elements NEW in the post-merge WebGL2-fallback path

Each item below was either entirely absent pre-merge or replaced an
explicit GLSL surface that compiled to a known cost on classic
`WebGLRenderer`. Cited line numbers are post-merge HEAD.

### 1. Renderer construction — bootstrap-then-swap, with `WebGLNodesHandler`

**Pre-merge (`git show 79103082:src/core/GameRenderer.ts`, line 82-93):**
single `new THREE.WebGLRenderer({...})` and that's the renderer for the
rest of the session.

**Post-merge:**
- `src/core/GameRenderer.ts:99` constructs a bootstrap `WebGLRenderer`
  via `createWebGLRenderer(...)` (`src/core/RendererBackend.ts:101-110`)
  which **attaches a `WebGLNodesHandler` from
  `three/addons/tsl/WebGLNodesHandler.js`** to that bootstrap renderer
  (`src/core/RendererBackend.ts:108`). This nodes handler is the
  TSL-to-classic-WebGL bridge. It is allocated even when the renderer
  will be disposed seconds later.
- `src/core/GameRenderer.ts:144` (`engine.renderer.initializeRendererBackend()`
  invoked from `src/core/GameEngine.ts:144`) imports `three/webgpu`
  dynamically (`src/core/RendererBackend.ts:139` `await import('three/webgpu')`)
  and constructs a `WebGPURenderer`.
- `src/core/GameRenderer.ts:250` then `await initializeCommonRenderer(renderer)`
  → `await renderer.init()` (`src/core/RendererBackend.ts:168-172`).
  This is where the WebGPU adapter probe happens; on a mobile browser
  without WebGPU, the `getFallback` shown above fires and a `WebGLBackend`
  is constructed instead.
- `src/core/GameRenderer.ts:278` disposes the bootstrap WebGLRenderer.
- `src/core/GameRenderer.ts:280` swaps the renderer reference.

**Cost contributors:**
- Synchronous import + init cost of `three/webgpu` on every startup,
  including mobile fallback (the chunk is shipped regardless of backend).
- A throwaway WebGLRenderer is built and disposed every boot. Heap/GPU
  context allocation cost paid twice on cold mobile devices.
- DOM `replaceChild` / `appendChild` of the canvas on
  `src/core/GameRenderer.ts:272-277` — recreates the WebGL context the
  page initially scrolled into.

### 2. Terrain material — `MeshStandardNodeMaterial` (TSL) replaces `MeshStandardMaterial + onBeforeCompile`

This is the highest-leverage change because every terrain tile in the
visible CDLOD ring binds it.

**Pre-merge (`git show 79103082:src/systems/terrain/TerrainMaterial.ts:646-661`):**
```
export function createTerrainMaterial(options: TerrainMaterialOptions): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({...});
  ...
  material.onBeforeCompile = (shader) => { ... };
```
The pre-merge material was the stock `MeshStandardMaterial`, with our
custom logic injected via `onBeforeCompile` into Three.js's existing
GLSL chunks. The classic `WebGLRenderer` compiled one program once and
cached it. The CDLOD attributes (`lodLevel`, `morphFactor`, `isSkirt`,
`edgeMorphMask`) and the world UV / heightmap sample / triplanar splat
math were all stitched into the standard shader chunks.

**Post-merge (`src/systems/terrain/TerrainMaterial.ts:2`, `:45`, `:638-648`):**
```
import { MeshStandardNodeMaterial } from 'three/webgpu';
...
export type TerrainMaterial = MeshStandardNodeMaterial & { ... };
...
const material = new MeshStandardNodeMaterial({...}) as TerrainMaterial;
```
With `positionNode`, `normalNode`, `colorNode`, `roughnessNode`,
`metalnessNode` assigned at `src/systems/terrain/TerrainMaterial.ts:631-635`.

On the post-merge WebGL2 fallback (running under WebGPURenderer's WebGL2
backend), this material's TSL graph is compiled to GLSL by the node
generator on first use of every shader permutation. The fragment-side
graph includes triplanar splatmap blending, biome rule evaluation, far-
canopy tint, hydrology mask, and surface-wetness — all expressed in TSL
nodes that lower to GLSL through the WebGL backend's node builder, not
through Three.js's hand-tuned `ShaderLib`.

**Cost contributors:**
- Larger compiled GLSL than the pre-merge `onBeforeCompile` variant —
  TSL-generated code typically inflates because it emits explicit temp
  variables and helper functions rather than reusing chunk-local vars
  the classic renderer's chunk system already had in scope. (Empirical
  validation belongs in the sibling `tsl-shader-cost-audit` memo;
  this memo only flags the surface.)
- First-use shader-compile stall on mobile (mobile GPUs lack
  `KHR_parallel_shader_compile` more often than desktop —
  `src/core/GameRenderer.ts:452-457` already skips async pre-compile
  when the extension is absent, leaving the cost paid at first frame).

### 3. NPC impostor material — `MeshBasicNodeMaterial` (TSL) replaces `THREE.ShaderMaterial`

**Pre-merge (`git show 79103082:src/systems/combat/CombatantMeshFactory.ts:335-342`):**
```
): THREE.ShaderMaterial {
  ...
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: ..., fragmentShader: ... });
```
Pre-merge NPC impostors used a hand-written GLSL ShaderMaterial with
its own custom vertex/fragment pair, compiled once per faction by
classic `WebGLRenderer`.

**Post-merge (`src/systems/combat/CombatantMeshFactory.ts:2`, `:394-411`):**
```
import { MeshBasicNodeMaterial } from 'three/webgpu';
...
const material = new MeshBasicNodeMaterial({
  name: `PixelForgeNpcImpostor.${clipId}.nodeMaterial`,
  ...
  forceSinglePass: true,
}) as MeshBasicNodeMaterial & CombatantUniformMaterial & {...};
material.colorNode = createNpcImpostorColorNode(texture, tileCrop.texture, uniforms);
material.opacityNode = createNpcImpostorOpacityNode(...);
material.alphaTestNode = tslFloat(0.18);
```
Plus the supporting TSL imports at
`src/systems/combat/CombatantMeshFactory.ts:3-22` (20+ TSL operator
imports).

These impostors render once per Pixel-Forge faction bucket per frame
(one `InstancedMesh` per faction × clip, capped at ~250 instances each).
At 60 NPC headcount that's ~6-8 instanced draw calls running this
material.

**Cost contributors:**
- Same first-use compile penalty as terrain, multiplied by faction
  permutations.
- Per-frame uniform writes still drive the same data, but routed
  through TSL `reference('value', 'float', uniformSlot)` plumbing
  (`src/systems/combat/CombatantMeshFactory.ts:15` `reference`) rather
  than direct `material.uniforms.foo.value = bar`.

### 4. Vegetation billboard material — `MeshBasicNodeMaterial` (TSL) replaces classic `THREE.ShaderMaterial` (BillboardShaders.ts deleted)

**Pre-merge:** `git show 79103082:src/systems/world/billboard/BillboardShaders.ts`
existed (298 lines of hand-written GLSL: `BILLBOARD_VERTEX_SHADER`,
`BILLBOARD_FRAGMENT_SHADER`, both `precision highp float`, custom
view-billboarding + LOD + fog + atlas-imposter logic). Consumed by
`BillboardBufferManager` via plain `new THREE.ShaderMaterial({...})`.

**Post-merge:** `BillboardShaders.ts` deleted; replaced by
`src/systems/world/billboard/BillboardNodeMaterial.ts` (436 lines).
- `src/systems/world/billboard/BillboardNodeMaterial.ts:2`
  `import { MeshBasicNodeMaterial } from 'three/webgpu';`
- `src/systems/world/billboard/BillboardNodeMaterial.ts:3-28` — 23 TSL
  operator imports.
- `src/systems/world/billboard/BillboardNodeMaterial.ts:95-98`
  declares `BillboardNodeMaterial = MeshBasicNodeMaterial & { uniforms; isKonveyerBillboardNodeMaterial }`.
- `src/systems/world/billboard/BillboardBufferManager.ts:4` now imports
  `createBillboardNodeMaterial` and consumes node materials.

Billboards are the dominant draw-count category in any vegetated scene
(hundreds of thousands of grass/tree instances behind frustum +
distance culls). The runtime is correctly using GPU instancing — the
material change does not increase draw count — but the per-fragment
shader cost on WebGL2 fallback is now whatever TSL → GLSL emits.

**Cost contributors:**
- Fragment shader runs over very large screen-coverage area (canopy
  silhouettes, grass mat); any per-fragment-instruction inflation
  multiplies across an enormous fragment count.
- LOD blend logic in the post-merge TSL graph
  (`BillboardNodeMaterial.ts:71` `lodDistances: THREE.Vector2`) was a
  baked uniform branch pre-merge; in TSL it lowers through whatever
  branching idiom the WebGL2 backend prefers.

### 5. Analytic sky — CPU-baked DataTexture replaces GPU `ShaderMaterial` fragment-shader Preetham

The sky pipeline change is in scope here because the sky dome is
rendered on every frame inside the main scene pass.

**Pre-merge (`git show 79103082:src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:78-101`):**
```
this.material = new THREE.ShaderMaterial({
  name: 'HosekWilkieSky',
  uniforms: { uSunDirection, uTurbidity, uRayleigh, uMieCoefficient, uMieDirectionalG, uGroundAlbedo, uExposure, uCloudCoverage, uCloudNoiseScale, uCloudTimeSeconds, uCloudWindDir },
  vertexShader: hosekWilkieVertexShader,
  fragmentShader: hosekWilkieFragmentShader,
  side: THREE.BackSide, depthWrite: false, depthTest: false,
});
```
A full analytic Preetham sky shader (~214 lines of GLSL in the now-
deleted `hosekWilkie.glsl.ts`). Cost: one full-screen pass of analytic
math per fragment. No CPU-side per-frame work to bake the dome.

**Post-merge (`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:207-225`):**
```
this.material = new THREE.MeshBasicMaterial({
  name: 'HosekWilkieSky',
  map: this.skyTexture,
  side: THREE.BackSide,
  depthWrite: false, depthTest: false, fog: false,
});
```
The dome now draws a textured `MeshBasicMaterial`. The texture
(`skyTexture`) is a **128 x 64 `THREE.DataTexture`** baked on the CPU
every 2 seconds via the loop at
`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:436-525`:
```
private refreshSkyTexture(): void {
  ...
  for (let y = 0; y < SKY_TEXTURE_HEIGHT; y++) {
    ...
    for (let x = 0; x < SKY_TEXTURE_WIDTH; x++) {
      // bilinear LUT sample, sun-disc composite, cloud composite
      ...
    }
  }
  this.skyTexture.needsUpdate = true;
```
With `SKY_TEXTURE_WIDTH = 128`, `SKY_TEXTURE_HEIGHT = 64` declared at
`HosekWilkieSkyBackend.ts:9-10`, the loop runs **8192 pixels × inner
work** every 2 s. The `SKY_TEXTURE_REFRESH_SECONDS = 2.0` cadence is
documented at `HosekWilkieSkyBackend.ts:17-26` explicitly as a 4x
fire-rate reduction from a prior 0.5 s baseline because the loop's EMA
sat at ~5 ms.

**Cost contributors:**
- Main-thread CPU spike every 2 s (the comment at lines 17-26 says EMA
  ~5 ms on the *target machine*; on a 4G-throttled mid-tier phone the
  same JS loop will be multiples slower).
- DataTexture re-upload to GPU on the same cadence
  (`needsUpdate = true` at line 519). 128*64*4 = 32 KB per upload —
  small, but the upload happens inside the render pass on whatever
  thread is bound to GL.
- *Gain:* the per-fragment GPU cost on the dome dropped massively
  vs the pre-merge per-fragment Preetham math. So this is a tradeoff,
  not a one-way regression — the fragment work moved to a CPU loop and
  a periodic upload. On a desktop with fast CPU + decent GPU upload,
  the net is probably a win. On a thermally-constrained phone running
  the WebGL2 fallback path, this may have net-regressed.

### 6. `AtmosphereSystem` per-frame uniform/buffer surface — three sub-system telemetry passes + sky-radiance compression

`AtmosphereSystem.update()` now wraps three telemetry passes per frame
(`src/systems/environment/AtmosphereSystem.ts:173-181`):
```
this.trackAtmosphereTiming('World.Atmosphere.SkyTexture', () => { this.backend.update(...) });
this.trackAtmosphereTiming('World.Atmosphere.LightFog', () => { this.applyToRenderer(); this.applyFogColor(); });
this.trackAtmosphereTiming('World.Atmosphere.Clouds', () => { this.updateCloudCoverage(...) });
```

The new sky-radiance compressor (`AtmosphereSystem.ts:40-49`) runs
**six** color-component clamp-and-rescale operations every frame:
- `applyToRenderer()` calls it twice (zenith + horizon, lines 428-429).
- `applyFogColor()` calls it once (horizon, line 467).
- The three public getters `getSkyColorAtDirection` / `getZenithColor` /
  `getHorizonColor` (lines 486-498) each call it once on every external
  query — billboard material lighting, terrain hemisphere binding, NPC
  impostor sky-color uniform, etc., depending on which subsystem
  queries which getter per frame.

This compressor exists specifically to bound the new HDR-ish radiance
values the CPU-baked sky produces (`AtmosphereSystem.ts:31-37`
documents: *"those values are fine for the baked sky texture, but fog
and hemisphere lights need bounded presentation colors or noon scenes
collapse into a white fill under WebGPU"*). It is small per-call but
fires every frame on the main thread.

**Cost contributors:**
- Tiny per-frame; flagged here as a *new surface* that didn't exist
  pre-merge — pre-merge the analytic shader did the equivalent work
  inside the fragment shader bound to the dome, with the hemisphere
  light driven by a single direct uniform copy.

### 7. NPC muzzle flash — `THREE.PointsMaterial` replaces `THREE.ShaderMaterial`

**Pre-merge (`git show 79103082:src/systems/effects/MuzzleFlashSystem.ts`, lines 26-90):**
Custom `ShaderMaterial` with a `PLAYER_VERT` / `NPC_VERT` / `SHARED_FRAG`
trio (additive blend, `gl_PointSize` from instance lifetime, soft
radial circle in fragment).

**Post-merge (`src/systems/effects/MuzzleFlashSystem.ts:60-76`):**
Replaced by stock `THREE.PointsMaterial` (size, sizeAttenuation,
vertexColors). Compiles through whatever path the active renderer
uses for built-in materials. On WebGL2 fallback under WebGPURenderer
that's still the node-translation path.

This is a *simplification*, not a regression. Flagged for completeness
because it's a per-frame draw surface and the material backend changed.

### 8. Water — `MeshStandardMaterial` replaces Three.js `Water` example (reflection RT retired)

**Pre-merge (`git show 79103082:src/systems/environment/WaterSystem.ts:161`):**
```
this.water = new Water(waterGeometry, {
  textureWidth: 512, textureHeight: 512, waterNormals: ...,
  sunDirection: ..., sunColor: 0xffffff,
  waterColor: GLOBAL_WATER_COLOR, distortionScale: ..., fog: ...,
});
```
Three.js's `Water` example renders into a 512×512 reflection
`WebGLRenderTarget` every frame plus its own complex shader. Known
mobile-killer if water is visible.

**Post-merge (`src/systems/environment/WaterSystem.ts:165-180`):**
```
const waterMaterial = new THREE.MeshStandardMaterial({
  name: 'global-water-standard-material',
  color: GLOBAL_WATER_COLOR, roughness: 0.42, metalness: 0,
  transparent: true, opacity: GLOBAL_WATER_ALPHA,
  normalMap: waterNormals, normalScale: new THREE.Vector2(0.18, 0.18),
  depthWrite: false, side: THREE.DoubleSide,
});
```
Plain `MeshStandardMaterial`, no reflection RT.

This is a clear *win* for mobile (no per-frame 512×512 reflection
render). Flagged here only to document that water is **not** a
contributor to the post-merge regression — if anything it should be
faster. If the alignment memo needs to defend "why didn't water save
us?", this is why: the saving is real but the cost shift elsewhere
(items 1-6 above) overwhelms it.

## Ranked WebGL2-fallback cost contributors (top 3)

Ranked by expected impact on a mid-tier phone running the WebGPU →
WebGL2 fallback path. All ranks are reasoned from code surface — the
empirical confirmation is the sibling `tsl-shader-cost-audit` and
`mobile-startup-and-frame-budget` memos.

### Rank 1: `MeshStandardNodeMaterial` terrain via WebGPURenderer's WebGL2 backend

`src/systems/terrain/TerrainMaterial.ts:639` (post-merge) replaced
`THREE.MeshStandardMaterial + onBeforeCompile` at
`git show 79103082:src/systems/terrain/TerrainMaterial.ts:647`.

Rationale: terrain is the largest screen-coverage surface in every
scene. Pre-merge it ran through Three.js's classic `ShaderLib` GLSL
which has years of hand-tuning. Post-merge it runs through
WebGPURenderer's `WebGLBackend` node generator, which emits a
syntactically different shader and is bound to a renderer instance
mobile users have never exercised through Three's pre-merge code
paths. Mid-tier mobile fragment throughput is the single binding
constraint, and this material burns the most fragments of any.

### Rank 2: Renderer-construction overhead (bootstrap WebGLRenderer + dynamic `three/webgpu` import + WebGPU adapter probe + canvas swap)

`src/core/GameRenderer.ts:99` (bootstrap), `:247` (post-import construct),
`:250` (`init()`), `:272-278` (canvas replace + dispose).

Rationale: startup-only cost, but compounds with mobile devices that
were already pinned at the post-click stall (see `KB-STARTUP-1` carry-
over). The dynamic `three/webgpu` import (`src/core/RendererBackend.ts:139`)
adds another large JS chunk parsed before the renderer is even attempted.
A failed WebGPU adapter probe on mobile must still time out before the
fallback `getFallback` runs (line `node_modules/three/build/three.webgpu.js:82651-82657`),
so the user pays a navigator.gpu round-trip on every cold load.

### Rank 3: CPU-baked sky DataTexture refresh (8192-pixel loop every 2 s)

`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:436-525`
(the loop), `HosekWilkieSkyBackend.ts:26` (the cadence constant).

Rationale: a periodic main-thread spike every 2 s. The slice-13
comment block at lines 17-26 already records that the loop's EMA was
~5 ms *on the development machine*; on a thermal-throttled phone CPU
this is plausibly 15-30 ms — long enough to drop a frame every 2 s
visibly. The DataTexture upload (`needsUpdate = true` at line 519)
adds GPU stall cost on top. This is the only post-merge cost that
fires on a periodic-spike pattern (vs the per-frame steady-state of
items 1-2), so it's the most likely answer to the *"feels janky in
bursts"* mode of the user-reported regression.

(Honorable mentions outside the top 3: NPC impostor TSL material,
billboard TSL material, AtmosphereSystem radiance-compression hot
path. Each is real but each is per-frame at a lower magnitude than
the terrain fragment-shader cost in Rank 1.)

## Evidence I deliberately did *not* attempt in this memo

- Real on-device GPU traces. Out of scope for the diff memo; that work
  belongs in `mobile-startup-and-frame-budget`.
- Compiled-GLSL line counts for the new TSL materials. Out of scope
  here; that work belongs in `tsl-shader-cost-audit`.
- Pre/post screenshots of the sky. Owned by
  `sky-visual-and-cost-regression`.

## Cross-references

- Cycle brief:
  [docs/tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md](../../tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md).
- Sibling R1 memos in this folder (when merged):
  `mobile-renderer-mode-truth.md`, `tsl-shader-cost-audit.md`,
  `sky-visual-and-cost-regression.md`, `mobile-startup-and-frame-budget.md`.
- WebGPU skill reference: `.claude/skills/webgpu-threejs-tsl/SKILL.md`
  and `.claude/skills/webgpu-threejs-tsl/docs/materials.md`.
- Strict-fallback gate: commit `4aec731e`
  (`fix(renderer): gate WebGL-fallback rejection on strict mode only`).
- Pre-merge SHA: `79103082` (parent of merge `1df141ca`).
