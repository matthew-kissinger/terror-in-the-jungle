# Deploy Map 3D Spike — 2026-06-28

Design/feasibility memo for a "fast 3D map" the owner asked for on the deploy
screen (situational awareness before spawn). **Design only — no build this
campaign.** The committed code for Phase 5 is the 2D `deploy-map-navigation`
overhaul; this memo gives the owner and a future cycle something concrete to
act on.

Brief: [../tasks/archive/cycle-2026-06-28-deploy-armory-faction-select/deploy-map-3d-spike.md](../tasks/archive/cycle-2026-06-28-deploy-armory-faction-select/deploy-map-3d-spike.md)
(archived at cycle close).
Campaign: [../CAMPAIGN_2026-06-28-field-readiness.md](../CAMPAIGN_2026-06-28-field-readiness.md) (Phase 5).

## What "fast 3D deploy map" means here

The owner ask is a 3D situational-awareness view on the deploy/respawn screen:
the player should read the terrain shape (valley, ridgelines, who holds the high
ground) and the zone/spawn/vehicle markers in 3D before committing to a spawn —
not a replacement for the live game, and not a flythrough. The hard constraint
is **fast**: bounded load (the deploy screen must not hang) and bounded frame
cost (the screen is a menu, not a combat budget). It must coexist with the
deploy flow, where **the live game world may not be resident** — on first deploy
the world is mid-load, and the existing deploy map is explicitly a 2D canvas
view that runs without a live terrain scene.

## Existing render paths we could reuse (surveyed)

Accurate inventory of what already exists, with the reuse angle for each.

### Terrain CDLOD render path (the live 3D terrain)
- `src/systems/terrain/CDLODRenderer.ts` — CDLOD instanced-mesh submission. Note
  the hard cap: WebGPU's 65536-byte uniform-binding limit forces
  `WEBGPU_SAFE_MAX_INSTANCES = 1024`; observed peak selected-tile count is ~89 on
  open_frontier. This is the single most important constraint for any "render the
  real terrain" approach — see WebGPU/WebGL parity risk below.
- `src/systems/terrain/CDLODQuadtree.ts`, `src/systems/terrain/CDLODGeometry.ts`
  — quadtree LOD selection + per-tile geometry/skirts.
- `src/systems/terrain/TerrainRenderRuntime.ts`,
  `src/systems/terrain/TerrainSystem.ts` — runtime that wires height data into the
  CDLOD submission, streaming scheduler, worker pool. This is heavy: it owns
  vegetation runtime, surface bake, raycast runtime, LOS accelerator. Standing it
  up is the full terrain cost, not a "fast" cost.
- `src/systems/terrain/TerrainMaterial.ts` — terrain shader/material.
- `src/core/GameRenderer.ts` — owns the `THREE.Scene` + `PerspectiveCamera`,
  resize, fog, lights, `renderer.render(scene, camera)`. A 3D deploy view needs a
  scene + camera; this is the only existing one.

### Heightfield / DEM data path (the source of terrain shape)
- `src/systems/terrain/HeightProviderFactory.ts` +
  `src/systems/terrain/DEMHeightProvider.ts` — bilinear DEM sampling with edge
  taper. The A Shau DEM is a raw `float32` grid: **2304 x 2304 at 9 m/pixel,
  21136 m coverage** (`src/config/AShauValleyConfig.ts`,
  `ASHAU_DEM_ASSET_ID` in `src/core/GameAssetManifest.ts`; sidecar
  `data/vietnam/big-map/a-shau-z14-9x9.f32.meta.json`). 2304² floats ≈ **21.2 MB**
  on the wire for the full-res grid (the `.f32` is not committed; it is a fetched
  data asset, served from `/data/vietnam/big-map/`).
- `src/systems/terrain/HeightmapGPU.ts` — `uploadDEM(...)` bakes an
  `IHeightProvider` grid into a GPU R32F height texture + RGB8 normal map; the
  vertex shader samples it so all LOD levels share one height source. **This is
  the key reuse hook for a cheap heightfield-plane approach** — it already turns a
  Float32Array into a sampleable texture.
- `src/systems/terrain/BakedHeightProvider.ts`,
  `src/systems/terrain/TerrainSurfaceRuntime.ts` — pre-baked grid path; the
  seeded modes ship `/data/heightmaps/*.f32`. A deploy map can bake a small
  downsampled grid offline the same way.
- `scripts/prebake-navmesh.ts` — build-time prebake precedent (navmesh + heightmap
  grids). A "bake a low-poly deploy proxy GLB/heightmap offline" step would slot
  in alongside this.

### 2D deploy map + marker projection (what ships today)
- `src/ui/map/OpenFrontierRespawnMap.ts` +
  `src/ui/map/OpenFrontierRespawnMapRenderer.ts` — the current deploy screen: a
  2D `CanvasRenderingContext2D` topo render of zones, spawn points, vehicle
  markers, with zoom/pan/pinch. Runs **without** a live 3D scene.
- `src/ui/map/OpenFrontierRespawnMapUtils.ts` — `worldToMap`, zone radius/color,
  spawn-point hit testing. World->map projection is already solved here.
- `src/systems/player/RespawnMapController.ts` — wires zone query, game mode,
  spawn points, and vehicle markers into the deploy map. **Any 3D view should be
  driven from this same controller and the same marker data** so 2D and 3D agree.
- `src/ui/minimap/MinimapRenderer.ts`, `src/ui/minimap/MinimapSystem.ts` — live
  minimap; shares the `VehicleMarker` type with the deploy map. The marker
  taxonomy (faction coding, vehicle categories) is already shared and reusable.

**Takeaway:** the marker/projection/data layers are reusable as-is. The
expensive, reuse-or-not decision is whether to stand up the full CDLOD terrain
runtime (`TerrainSystem`) for the deploy screen, or render a cheap proxy from the
same DEM data.

## Candidate approaches

### A. Reuse the live CDLOD terrain at a fixed orbit camera
Bring up `TerrainSystem` + `CDLODRenderer` (or the already-live instance, when the
world is resident), park an orbit/top-down `PerspectiveCamera`, and draw markers
as 3D sprites in the same scene.

- **Pros:** pixel-identical to in-game terrain; zero new art; markers can reuse
  the live scene; "free" once the world is loaded.
- **Cons:** This is the *whole* terrain cost (streaming, worker pool, vegetation,
  surface bake, LOS accelerator). On first deploy the world is **not yet
  resident**, so the deploy screen would block on the full A Shau bring-up — the
  exact "fast" requirement it violates (and exactly the kind of long bring-up the
  A Shau load-freeze work fought). Also inherits the WebGPU 1024-instance cap and
  all terrain shader complexity for a menu. **Heaviest load, slowest to first
  paint.** Rejected as the MVP.

### B. Baked low-poly terrain proxy + 3D markers
Offline (alongside `scripts/prebake-navmesh.ts`), bake a **downsampled** low-poly
mesh of each battlefield (e.g. a 128–256 grid decimated from the DEM, ~33k–130k
tris, a flat color/relief shade — no CDLOD, no streaming, no vegetation) and ship
it as a small GLB or a compact height grid. The deploy screen loads only that
proxy into a tiny dedicated scene with an orbit camera and draws zone/spawn/
vehicle markers as 3D billboards using the existing projection.

- **Pros:** bounded, tiny load (single small asset, no DEM fetch, no terrain
  runtime); fixed trivial frame cost (one static mesh + a handful of sprites);
  fully decoupled from world-resident state — works on first deploy; one mesh
  trivially clears the WebGPU instance cap; offline bake reuses the existing DEM
  providers and prebake harness.
- **Cons:** new offline bake step + asset per map/seed; terrain looks
  approximate (not pixel-identical to in-game); proxy can drift from the live
  terrain if the DEM/stamps change (mitigated by baking from the same source and
  versioning with the navmesh signature).

### C. Heightfield-textured plane (GPU displacement)
Ship a **small downsampled height texture** (e.g. 256² R32F ≈ 0.26 MB, vs the
21.2 MB full grid) and a flat subdivided plane; displace it in the vertex shader,
reusing the `HeightmapGPU.uploadDEM` texture-bake pattern. Markers as 3D
billboards on top.

- **Pros:** smallest asset of the three; reuses the existing height-texture bake
  directly; GPU does the displacement so CPU cost is near zero; one draw call, no
  instance cap concern; decoupled from world-resident state.
- **Cons:** needs a displacement material variant (small new shader path); plane
  tessellation must be high enough to read ridgelines without looking blocky;
  normals/shading need a baked normal map (already produced by
  `HeightmapGPU.generateNormalMap`) to avoid a flat-lit look.

## Perf budget + reuse strategy

This is a **menu screen**, so the budget is generous on frame time but strict on
*load* — the deploy screen must never block.

- **Load budget:** first paint of the 3D view ≤ ~150 ms after the deploy screen
  opens; total deploy-map asset payload ≤ ~1 MB. This rules out fetching the full
  21.2 MB A Shau DEM and rules out standing up `TerrainSystem`. Approaches B and C
  both fit (small proxy / small height texture); A does not.
- **Frame budget:** ≤ ~2 ms/frame for the deploy view (it shares the page with
  nothing else; cap it well under a 16.6 ms frame so low-end devices stay smooth).
  A static proxy mesh + ~50 marker sprites is far under this.
- **Memory budget:** ≤ ~30 MB resident for the deploy view, freed when the screen
  closes. A 256-grid proxy / 256² height texture is sub-MB; markers are sprites.
- **Coexistence with deploy flow:** the 3D view must run **without** the live
  world (first deploy = world mid-load). Use a small **dedicated scene + camera**,
  not the live `GameRenderer` scene, so the deploy view has no dependency on
  terrain-resident state and tears down cleanly. Drive it from
  `RespawnMapController` with the same zone/spawn/vehicle marker data the 2D map
  uses, so 2D and 3D never disagree.
- **Reuse, concretely:**
  - **Data:** bake from the existing DEM providers
    (`DEMHeightProvider`/`HeightProviderFactory`) and the prebake harness
    (`scripts/prebake-navmesh.ts`) — do not re-fetch the runtime DEM.
  - **Height texture (approach C):** `HeightmapGPU.uploadDEM` already turns a grid
    into a height texture + normal map; reuse it on a downsampled grid.
  - **Markers + projection:** reuse `OpenFrontierRespawnMapUtils` world->map math
    and the shared `VehicleMarker` taxonomy from `MinimapRenderer`.
  - **Camera/scene plumbing:** a minimal scene mirroring the
    `GameRenderer.render(scene, camera)` pattern, not the full `GameRenderer`.

## Recommendation

**Adopt approach B (baked low-poly terrain proxy + 3D markers) as the target, with
approach C (heightfield-textured plane) as the fallback/optimization if the proxy
asset or bake step proves heavier than budget.**

Rationale: B gives the cleanest "fast" guarantees (single tiny asset, fixed frame
cost, fully decoupled from world-resident state, no WebGPU instance-cap exposure)
while reusing the existing DEM providers and prebake harness for the offline bake.
C is strictly smaller on payload and is the natural escalation if we want even
lower load cost or want to avoid shipping a per-map mesh — but it carries a small
new displacement-shader path. A is rejected: standing up `TerrainSystem` on the
deploy screen reintroduces exactly the full-bring-up cost the load-freeze work
removed, and it cannot paint before the world is resident.

## Phased build plan (a future cycle)

- **MVP (proxy, single map):** offline bake a low-poly A Shau proxy (downsampled
  DEM, flat relief shade) as a small GLB; new dedicated deploy scene + orbit
  camera; render the proxy + zone/spawn/vehicle markers as 3D billboards driven by
  `RespawnMapController`; 2D map stays the default, 3D behind a toggle. Verify load
  + frame budgets on a low-end device.
- **Full (all maps + polish):** bake proxies for every mode/seed in the prebake
  step (versioned with the navmesh signature so they cannot silently drift);
  relief/biome tint so the proxy reads like the battlefield; selectable spawn from
  the 3D view (parity with 2D selection); camera presets (top-down ↔ orbit);
  mobile touch orbit/zoom.
- **Optional escalation:** if proxy assets are too heavy or we want lower payload,
  switch the renderer to approach C (small height texture + displaced plane via
  the `HeightmapGPU` bake) behind the same controller and marker layer — the data,
  projection, and marker code are unchanged.

## Open risks

- **A Shau 21 km DEM load.** The full grid is **2304² floats ≈ 21.2 MB**; fetching
  it for a menu is a non-starter. Both recommended approaches avoid it by baking a
  downsampled proxy/texture offline. Risk: keeping the proxy in sync with the live
  DEM + stamps — mitigate by baking from the same providers and versioning with the
  navmesh bake signature.
- **Memory.** Must free the deploy scene on close; a leaked scene + textures would
  compound with the live world. Budget ≤ ~30 MB, torn down on screen close.
- **WebGPU/WebGL parity.** The live CDLOD path carries the WebGPU
  `WEBGPU_SAFE_MAX_INSTANCES = 1024` uniform-binding cap (`src/systems/terrain/CDLODRenderer.ts`).
  A single static proxy mesh (B) or single displaced plane (C) is one draw and
  sidesteps the cap entirely — but any displacement/material variant must be
  validated on **both** WebGPU and WebGL2, since instancing/uniform-sizing behavior
  diverges between backends (that cap exists precisely because r185 WebGPU sized a
  uniform from full instance-buffer capacity).
- **Drift from the 2D map.** If the 3D view computes its own projection it will
  disagree with the 2D map. Mitigate by driving both from `RespawnMapController`
  and reusing `OpenFrontierRespawnMapUtils` projection + the shared marker
  taxonomy.
- **Scope creep.** A 3D deploy view can grow into a flythrough/tactical map.
  Hold the line: this is situational awareness before spawn, bounded load + frame
  cost, 2D remains the default until the 3D view reaches parity on selection.
