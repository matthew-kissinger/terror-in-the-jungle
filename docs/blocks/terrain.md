# Terrain Domain

Current reference for the live terrain domain.

Status: active runtime/query boundaries are now explicit. `TerrainSystem` owns runtime orchestration, `TerrainQueries` exposes gameplay-facing terrain queries, and `HeightQueryCache` remains the canonical height data authority underneath those query paths.

---

## Summary

The terrain domain currently consists of three explicit blocks:

1. `TerrainSystem`
   Active terrain runtime facade. Owns render-time terrain selection, terrain material setup, near-field collision proxy generation, biome/vegetation orchestration, and runtime lifecycle.

2. `TerrainQueries`
   Gameplay-facing terrain query surface. Owns terrain height/effective-height queries, collision object registration, and terrain LOS/raycast access.

3. `HeightQueryCache`
   Canonical terrain data service. Owns the active `IHeightProvider`, cached `getHeightAt()` access, and provider switching between procedural and DEM terrain.

This is now a valid layered block shape instead of an implicit split.

---

## Active Blocks

| Block | File | Tick | Budget | Status |
|-------|------|------|--------|--------|
| `TerrainSystem` | `src/systems/terrain/TerrainSystem.ts` | Terrain | 2ms | Active |
| `TerrainQueries` | `src/systems/terrain/TerrainQueries.ts` | shared service | unbudgeted | Active |
| `HeightQueryCache` | `src/systems/terrain/HeightQueryCache.ts` | shared service | unbudgeted | Active |

---

## TerrainSystem

### Role

`TerrainSystem` is the active terrain runtime injected into core game systems.

It currently owns:
- terrain runtime orchestration across render, surface, raycast/query, vegetation, and workers
- terrain biome/material orchestration via `TerrainBiomeRuntimeConfig`
- collision object registry and terrain ray queries via `TerrainQueries`
- vegetation scatter triggering via `VegetationScatterer`
- worker access via `TerrainWorkerPool`
- a shrinking transitional metrics surface retained for runtime reporting

### Constructor Dependencies

Injected at construction:
- `scene`
- `camera`
- `assetLoader`
- `globalBillboardSystem`
- terrain runtime bootstrap config

### Public Contract

The runtime currently exposes four categories of API:

Rendering/runtime:
- `init()`
- `update(deltaTime)`
- `dispose()`
- `updatePlayerPosition(position)`

Queries/collision:
- `getHeightAt(x, z)`
- `getEffectiveHeightAt(x, z)`
- `raycastTerrain(origin, direction, maxDistance)`
- `registerCollisionObject(id, object)`
- `unregisterCollisionObject(id)`
- `checkObjectCollision(position, radius)`
- `getLOSAccelerator()`

Worker/config:
- `getWorkerPool()`
- `getWorkerStats()`
- `getWorkerTelemetry()`
- `setChunkSize(size)`
- `setRenderDistance(distance)`
- `setWorldSize(worldSize)`
- `setVisualMargin(visualMargin)`
- `setBiomeConfig(defaultBiomeId, biomeRules)`
- `isTerrainReady()`
- `hasTerrainAt(x, z)`

Runtime config/metrics:
- `getChunkSize()`
- `getActiveTerrainTileCount()`
- `getPlayableWorldSize()`
- `getVisualMargin()`
- `getVisualWorldSize()`

### Fan-In

`TerrainSystem` is wired into:
- `PlayerController`
- `CombatantSystem`
- `ZoneManager`
- `PlayerRespawnManager`
- `HelipadSystem`
- `HelicopterModel`
- `GameModeManager`
- `FootstepAudioSystem`
- `GrenadeSystem`
- `MortarSystem`
- `SandbagSystem`

This is a high-coupling block.

### Main Critique

As a block, `TerrainSystem` is overburdened.

It tries to be:
- the terrain runtime,
- the gameplay query service,
- the collision/raycast provider.

That load is materially lower than before because render, surface, and raycast internals have been split into dedicated runtime modules, and live consumers now depend on `ITerrainRuntime` / `ITerrainRuntimeController` instead of deleted chunk-era shims.

The remaining architectural pressure is internal cohesion, not fake public compatibility.

---

## TerrainQueries

### Role

`TerrainQueries` is the gameplay terrain query boundary.

It owns:
- canonical `getHeightAt()` access through `HeightQueryCache`
- effective-height queries against near-field collision objects
- terrain raycast and LOS integration
- collision object registration for non-height terrain blockers

### Why it matters

Gameplay systems should not care whether terrain render data comes from CDLOD selection, heightmap baking, or future tiled DEM streaming.

They need:
- terrain height,
- effective standing height,
- terrain presence/readiness,
- terrain ray queries.

Those semantics are now exposed through `TerrainSystem` as a runtime facade over `TerrainQueries`, rather than through ad hoc direct `HeightQueryCache` reads across combat/player/world code.

---

## HeightQueryCache

### Role

`HeightQueryCache` remains the practical terrain data authority for much of the game.

It owns:
- the current `IHeightProvider`
- cached `getHeightAt()` access
- provider switching between procedural and DEM terrain

### Why it matters

`HeightQueryCache` still matters because it is the one canonical height source beneath gameplay and render/runtime consumers.

Direct `getHeightQueryCache()` usage is now confined to:
- terrain internals such as `TerrainQueries`, `TerrainSystem`, and `VegetationScatterer`
- startup/provider wiring in `GameEngineInit`

### Main Critique

This split is now explicit and acceptable:
- `HeightQueryCache` is the data authority,
- `TerrainQueries` is the gameplay query layer,
- `TerrainSystem` is the runtime facade and orchestration block.

The remaining concern is not authority confusion. It is whether `TerrainSystem` should continue to host both runtime orchestration and query-surface forwarding long term.

---

## Internal Modules

### Runtime/render modules

| Module | File | Role |
|--------|------|------|
| `TerrainSystem` | `src/systems/terrain/TerrainSystem.ts` | Top-level terrain runtime facade |
| `TerrainRenderRuntime` | `src/systems/terrain/TerrainRenderRuntime.ts` | Frustum extraction, quadtree selection, instanced draw submission |
| `TerrainSurfaceRuntime` | `src/systems/terrain/TerrainSurfaceRuntime.ts` | Heightmap bake, terrain material creation, material refresh on world/provider/biome changes |
| `TerrainRaycastRuntime` | `src/systems/terrain/TerrainRaycastRuntime.ts` | Near-field BVH terrain mesh rebuild and LOS accelerator registration |
| `CDLODQuadtree` | `src/systems/terrain/CDLODQuadtree.ts` | Terrain tile selection |
| `CDLODRenderer` | `src/systems/terrain/CDLODRenderer.ts` | Instanced terrain tile renderer |
| `TerrainMaterial` | `src/systems/terrain/TerrainMaterial.ts` | Shader/material injection for terrain |
| `HeightmapGPU` | `src/systems/terrain/HeightmapGPU.ts` | CPU->GPU height/normal bake and sampling |

### Query/data modules

| Module | File | Role |
|--------|------|------|
| `HeightQueryCache` | `src/systems/terrain/HeightQueryCache.ts` | Cached terrain height authority |
| `IHeightProvider` | `src/systems/terrain/IHeightProvider.ts` | Height-provider interface |
| `NoiseHeightProvider` | `src/systems/terrain/NoiseHeightProvider.ts` | Procedural terrain source |
| `DEMHeightProvider` | `src/systems/terrain/DEMHeightProvider.ts` | DEM terrain source |
| `TerrainQueries` | `src/systems/terrain/TerrainQueries.ts` | Collision object + LOS query facade |

### Vegetation/worker modules

| Module | File | Role |
|--------|------|------|
| `VegetationScatterer` | `src/systems/terrain/VegetationScatterer.ts` | Cell-based vegetation scatter runtime |
| `TerrainWorkerPool` | `src/systems/terrain/TerrainWorkerPool.ts` | Terrain worker access |
| `terrain.worker.ts` | `src/workers/terrain.worker.ts` | Height bake / terrain work worker |

### Config

| Module | File | Role |
|--------|------|------|
| `TerrainConfig` | `src/systems/terrain/TerrainConfig.ts` | Runtime config and terrain bootstrap config shape |

---

## Wiring Shape

### Core ownership

Construction and storage:
- `SystemInitializer` constructs `TerrainSystem`
- `SystemManager` stores it as `terrainSystem`
- `SystemConnector` injects it into dependent systems

### Runtime mode/config flow

Terrain-affecting config currently comes from multiple places:
- `GameEngineInit` loads DEM and swaps the `HeightQueryCache` provider
- `GameEngineInit` configures active terrain biome state on `TerrainSystem`
- `GameEngineInit` pushes both playable world size and render-only visual margin into `TerrainSystem`
- `GameModeManager` changes terrain render distance

This means mode changes intentionally span both:
- the data-authority layer (`HeightQueryCache`)
- and the terrain runtime/controller layer (`TerrainSystem`)

That is now a documented bootstrap/config boundary, not an accidental gameplay leak.

---

## Behavioral Notes

### What is real

Real runtime behavior:
- terrain mesh exists and updates from quadtree selection
- heightmap textures are baked from the active provider
- near-field collision proxy mesh is rebuilt as the player moves
- height queries can resolve through the runtime
- weapons and helicopter systems use terrain-effective height methods
- terrain material now uses live biome textures, biome roughness, soft biome blending, rotated dual-sample anti-tiling, macro breakup, and slope-aware triplanar sampling on steep surfaces
- terrain shading now includes lowland humidity/wetness response and cliff-only rock accenting instead of broad rock overpaint
- live weather now drives terrain surface wetness through the runtime, so rain changes terrain darkness/roughness rather than only particles and fog
- terrain ground textures now use linear mipmapped filtering instead of nearest/no-mipmap sprite filtering
- render-only surface bake density now scales with world size; A Shau uses a 512-grid render surface instead of a fixed 1024-grid bake
- loading/start-screen terrain-adjacent UI assets now use base-aware paths instead of hard-coded root-relative URLs
- automated preview smoke now confirms shader-clean, terrain-warning-clean, request-error-clean startup in both `zone_control` and `a_shau_valley`
- A Shau biome coverage has been retuned toward dense jungle and bamboo uplands, with highland rock constrained to upper ridges and cliff accents
- playable boundary: player and helicopters bounce off the playable world edge (velocity reversed at 50%). `PlayerMovement.enforceWorldBoundary()` and `HelicopterModel` read `getPlayableWorldSize()` from `ITerrainRuntime` with `getWorldSize()` fallback for older callers
- configurable visual terrain margin: `TerrainRenderRuntime` inflates the CDLOD quadtree by `visualMargin * 2` total. Vertex shader explicitly clamps UVs to `[0,1]`, so overflow tiles sample edge heights from the heightmap
- vegetation overflow uses the same `visualMargin` contract as terrain render overflow, so mode tuning changes both systems together
- terrain material uniform updates preserve compiled shader references by updating `.value` in place instead of creating new uniform objects

### Transitional residue

The dishonest chunk-era compatibility stubs have been removed from the live runtime.
The remaining issue is internal responsibility load inside `TerrainSystem`, not public chunk-era API residue.
That load has started to reduce:
- frustum extraction, quadtree selection, and instanced terrain draw submission now live in `TerrainRenderRuntime`,
- heightmap bake and terrain material refresh now live in `TerrainSurfaceRuntime`.
- near-field BVH terrain mesh rebuild and LOS registration now live in `TerrainRaycastRuntime`.

Critical gameplay flow has already moved to:
- `isTerrainReady()`
- `hasTerrainAt(x, z)`

---

## Risks

### 1. Runtime facade still carries too much orchestration

The terrain domain no longer has misleading public authority split, but `TerrainSystem` still owns:
- biome/runtime coordination
- worker coordination
- render/runtime module orchestration
- query-surface forwarding

That is workable now, but still a hotspot for future hydrology and tiled-DEM work.

### 2. Overloaded block

`TerrainSystem` is carrying too many concerns for a block with this much fan-in.

### 3. Terrain material is improved but not final

The terrain material stack is no longer a placeholder:
- live biome textures are active,
- biome roughness is active,
- steep slopes can switch toward triplanar sampling.

What is still missing for a fully frontier-grade terrain surface:
- authored per-layer normal inputs,
- richer per-layer PBR control beyond roughness,
- visual validation against A Shau and a small procedural mode.

Current hard evidence:
- `AssetLoader` currently inventories biome ground albedo textures such as `jungle-floor.webp`, `rocky-highland.webp`, `rice-paddy.webp`, `river-bank.webp`, `firebase-ground.webp`, `tall-grass.webp`, `bamboo-floor.webp`, `swamp.webp`, `defoliated-ground.webp`
- no parallel terrain-specific normal/roughness/metalness map set is currently present in that active asset inventory

### 4. Large-world terrain budget still needs wider proof

The immediate A Shau startup cost issue that appeared in the earlier smoke artifact has been materially improved:
- the previous preview smoke artifact (`artifacts/terrain-smoke/2026-03-04T00-38-53-189Z`) reported terrain slow-frame and terrain budget warnings
- the current preview smoke artifact (`artifacts/terrain-smoke/2026-03-04T00-41-49-250Z`) does not

That is strong evidence that the current terrain runtime is in a materially better state.
It is not yet proof that large-world terrain cost is solved under broader camera motion, combat pressure, or long-run play.

### 5. Visual tuning is ahead of visual proof

The material stack is now materially better than the earlier prototype state:
- more jungle-biased biome coverage,
- anti-tiling breakup,
- wet lowland response,
- weather-driven surface wetness.

What is still missing is a canonical screenshot-based review loop on live A Shau and one small mode.
Until that exists, the shader stack is improved but not yet visually signed off.

### 5. Stale docs

Architecture docs elsewhere still describe the deleted chunk architecture.

---

## Recommended Refactor Shape

The terrain domain should probably resolve into three explicit blocks:

### `TerrainDataAuthority`

Would own:
- `HeightQueryCache`
- provider switching
- canonical world extents
- DEM/procedural source semantics

### `TerrainRuntime`

Would own:
- CDLOD/clipmap/far-field rendering
- terrain material/shader runtime
- optional derived collision proxies
- vegetation runtime orchestration

### `TerrainGameplayQueries`

Would own:
- effective height
- terrain-aware collision objects
- LOS/raycast queries
- the exact API required by player, AI, weapons, helicopters, and respawn

If old chunk semantics still need to exist temporarily, they should live in a separate adapter, not in the main terrain runtime class.

---

## Verdict

As a block, the terrain domain is now clean enough to build on.

It now fits the system in both wiring and semantic terms:
- `HeightQueryCache` is the data authority,
- `TerrainQueries` is the gameplay query layer,
- `TerrainSystem` is the runtime/controller facade.

That makes the current terrain architecture:
- promising,
- high leverage,
- and finally explicit enough to support the next rewrite stages without misleading future agents.
