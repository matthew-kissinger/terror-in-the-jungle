# Terrain Domain

Self-contained reference for the Terrain domain. 2 blocks, 26 modules, 2ms tick budget.

Base URL: `https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src`

---

## Blocks

| Block | File | Tick | Budget | Status |
|-------|------|------|--------|--------|
| [ImprovedChunkManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ImprovedChunkManager.ts) | `systems/terrain/ImprovedChunkManager.ts` | Terrain | 2ms | Active |
| [GPUTerrain](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/GPUTerrain.ts) | `systems/terrain/GPUTerrain.ts` | - | - | DISABLED (comment in SystemInitializer: "going with web workers approach instead") |

---

## Module Registry

### Chunk Management (7 modules)

| Module | File | Role |
|--------|------|------|
| [ImprovedChunkManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ImprovedChunkManager.ts) | `systems/terrain/ImprovedChunkManager.ts` | Orchestrator. Ring-based load/unload, adaptive render distance (FPS EMA), 0.25s update cadence. Implements `GameSystem`. |
| [ImprovedChunk](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ImprovedChunk.ts) | `systems/terrain/ImprovedChunk.ts` | Single chunk lifecycle: generate, add to scene, hold heightData + vegetation map, dispose. |
| [ChunkLifecycleManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkLifecycleManager.ts) | `systems/terrain/ChunkLifecycleManager.ts` | Chunk create/destroy, loadChunkImmediate for startup, exposes `getChunks()` / `getLoadingChunks()`. |
| [ChunkLoadQueueManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkLoadQueueManager.ts) | `systems/terrain/ChunkLoadQueueManager.ts` | Drains priority queue via `requestIdleCallback` (fallback: 100ms timeout). Per-frame budget enforced. |
| [ChunkLoadingStrategy](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkLoadingStrategy.ts) | `systems/terrain/ChunkLoadingStrategy.ts` | Decides which chunks to load next; delegates to ChunkLifecycleManager. |
| [ChunkPriorityManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkPriorityManager.ts) | `systems/terrain/ChunkPriorityManager.ts` | Distance-based priority queue. Detects player chunk change, exposes `updateLoadQueue()`. |
| [ChunkTaskQueue](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkTaskQueue.ts) | `systems/terrain/ChunkTaskQueue.ts` | Worker task queue (max 48). Priority sort on dequeue, deduplication via in-flight map. |

### Worker System (4 modules)

| Module | File | Role |
|--------|------|------|
| [ChunkWorkerPool](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkWorkerPool.ts) | `systems/terrain/ChunkWorkerPool.ts` | 2-8 web workers (defaults to `navigator.hardwareConcurrency`). 30s watchdog via `Promise.race`. Exposes `generateChunk()` returning `ChunkGeometryResult`. |
| [ChunkWorkerAdapter](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkWorkerAdapter.ts) | `systems/terrain/ChunkWorkerAdapter.ts` | Main-thread adapter: reconstructs Three.js mesh + vegetation map from transferred ArrayBuffers. |
| [ChunkWorkerLifecycle](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkWorkerLifecycle.ts) | `systems/terrain/ChunkWorkerLifecycle.ts` | Worker create/assign/terminate. Owns `WorkerState[]`. Fires `onWorkerReady`, `onWorkerResult`, `onWorkerError` callbacks. |
| [ChunkWorkerTelemetry](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkWorkerTelemetry.ts) | `systems/terrain/ChunkWorkerTelemetry.ts` | Worker timing stats: chunksGenerated, avgGenerationTimeMs, workersReady, duplicatesAvoided. |

### Height System (5 modules)

| Module | File | Role |
|--------|------|------|
| [HeightQueryCache](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/HeightQueryCache.ts) | `systems/terrain/HeightQueryCache.ts` | **SINGLETON** via `getHeightQueryCache()`. LRU cache (10k entries, 0.5m snap grid). Delegates to IHeightProvider. Exposes `getHeightAt`, `getNormalAt`, `getSlopeAt`, `isUnderwater`, `preloadRegion`, `setProvider`. |
| [IHeightProvider](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/IHeightProvider.ts) | `systems/terrain/IHeightProvider.ts` | Interface: `getHeightAt(x,z)` + `getWorkerConfig(): HeightProviderConfig`. Config is a discriminated union `{type:'noise',seed}` or `{type:'dem',...}`. |
| [NoiseHeightProvider](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/NoiseHeightProvider.ts) | `systems/terrain/NoiseHeightProvider.ts` | Default provider. Multi-layer noise: continental (0.001), ridges (0.003), valleys (0.008), hills (0.015/0.03/0.06), detail (0.1). Water/river carving logic. Heights: -8 to ~130m. |
| [DEMHeightProvider](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/DEMHeightProvider.ts) | `systems/terrain/DEMHeightProvider.ts` | Real DEM Float32Array. Bilinear interpolation, grid centered at `(originX, originZ)`. A Shau Valley: 21km real terrain. Static `sampleBilinear()` used by inline worker code. |
| [BiomeClassifier](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/BiomeClassifier.ts) | `systems/terrain/BiomeClassifier.ts` | `classifyBiome(elevation, slopeDeg, rules, default)` - priority-sorted rule matching. `computeSlopeDeg(cx, cz, dist, getHeight)` - 4-neighbour finite difference. |

### Geometry (6 modules)

| Module | File | Role |
|--------|------|------|
| [ChunkGeometryBuilder](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkGeometryBuilder.ts) | `systems/terrain/ChunkGeometryBuilder.ts` | Static methods: `createGeometryFromHeightData` (PlaneGeometry + Y-displacement + BVH), `createMeshFromGeometry`. |
| [ChunkMaterials](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkMaterials.ts) | `systems/terrain/ChunkMaterials.ts` | Material management per chunk. |
| [ChunkHeightGenerator](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkHeightGenerator.ts) | `systems/terrain/ChunkHeightGenerator.ts` | Static: `generateHeightAt`, `generateHeightData`. Thin wrapper over `NoiseHeightProvider.calculateHeight`. |
| [ChunkHeightQueries](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkHeightQueries.ts) | `systems/terrain/ChunkHeightQueries.ts` | Static: `getHeightAtLocal` (bilinear from Float32Array), `getHeightAt` (world coords), `getHeightAtRaycast` (BVH raycast fallback). |
| [ChunkTerrainQueries](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkTerrainQueries.ts) | `systems/terrain/ChunkTerrainQueries.ts` | Collision object registry (LOSAccelerator), effective height from chunks, raycasting utilities. Uses module-level scratch vectors. |
| [ChunkVegetationGenerator](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkVegetationGenerator.ts) | `systems/terrain/ChunkVegetationGenerator.ts` | Per-chunk billboard placement. Slope limits (canopy 30 deg, midlevel 40 deg). Integer-hash density noise. TrunkGrid O(1) suppress radius check. |

### Mesh (3 modules)

| Module | File | Role |
|--------|------|------|
| [TerrainMeshFactory](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/TerrainMeshFactory.ts) | `systems/terrain/TerrainMeshFactory.ts` | `createTerrainMesh` (from heightData) and `createTerrainMeshFromGeometry` (from worker result). Sets `receiveShadow`, positions mesh at `chunkX*size+size/2`. |
| [TerrainMeshMerger](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/TerrainMeshMerger.ts) | `systems/terrain/TerrainMeshMerger.ts` | Merges per-chunk meshes into 10 distance rings (reduces ~100-150 draw calls to ~10). 500ms debounce, 3 rings/pass max. `ENABLE_MERGED_BVH=false` (visual only). Currently `enableMeshMerging: false` in config. |
| [BiomeTexturePool](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/BiomeTexturePool.ts) | `systems/terrain/BiomeTexturePool.ts` | One `MeshLambertMaterial` per biome, shared across all chunks. Texture repeat=16, trilinear filtering. Fallback color `#4a7c59`. |

### Utility (2 modules)

| Module | File | Role |
|--------|------|------|
| [ChunkSpatialUtils](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkSpatialUtils.ts) | `systems/terrain/ChunkSpatialUtils.ts` | `worldToChunkCoord`, `getChunkKey` (`"x,z"`), `getChunkDistanceFromPlayer` (Chebyshev). Module-level scratch `Vector2`. |
| [ChunkLifecycleTypes](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkLifecycleTypes.ts) | `systems/terrain/ChunkLifecycleTypes.ts` | `ChunkLifecycleConfig` interface (size, loadDistance, renderDistance, skipTerrainMesh, enableMeshMerging, defaultBiomeId, biomeRules). |

### GPU Terrain (disabled - 2 modules)

| Module | File | Role |
|--------|------|------|
| [GPUTerrainGeometry](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/GPUTerrainGeometry.ts) | `systems/terrain/GPUTerrainGeometry.ts` | `createLODRingGeometry`: concentric LOD rings, exponential spacing. Not in use. |
| [GPUTerrainShaders](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/GPUTerrainShaders.ts) | `systems/terrain/GPUTerrainShaders.ts` | Vertex/fragment shader strings for heightmap texture displacement. Not in use. |

### Workers (src/workers/)

| Module | File | Role |
|--------|------|------|
| [ChunkWorker](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/workers/ChunkWorker.ts) | `workers/ChunkWorker.ts` | Web worker entry. Self-contained noise impl (must match `NoiseGenerator.ts` exactly). Handles `generate`, `setHeightProvider`, `setVegetationConfig`, `setBiomeConfig`. Returns transferable ArrayBuffers. |
| [BVHWorker](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/workers/BVHWorker.ts) | `workers/BVHWorker.ts` | `ViteBVHWorker` class: pool of BVH workers for off-thread collision tree. Uses `bvh.worker.js?worker` (Vite native syntax). |
| [bvh.worker.js](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/workers/bvh.worker.js) | `workers/bvh.worker.js` | Raw BVH worker script. Imported by BVHWorker.ts via Vite `?worker`. |

---

## Config

| File | Role |
|------|------|
| [config/biomes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/biomes.ts) | `BiomeConfig`, `BiomeClassificationRule`, `TerrainConfig`. All 10 built-in biomes. `BIOMES` record + `getBiome()`. `WorkerBiomeConfig` / `toWorkerBiomeConfig()` for worker transfer. |
| [config/vegetationTypes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/vegetationTypes.ts) | `VegetationTypeConfig`. All vegetation type definitions. |

---

## Biomes

| ID | Name | Ground Texture |
|----|------|----------------|
| denseJungle | Dense Jungle | jungle-floor |
| highland | Highland | rocky-highland |
| ricePaddy | Rice Paddy | rice-paddy |
| riverbank | Riverbank | river-bank |
| cleared | Cleared Area | firebase-ground |
| tallGrass | Tall Grass | tall-grass |
| mudTrail | Mud Trail | mud-ground |
| bambooGrove | Bamboo Grove | bamboo-floor |
| swamp | Swamp | swamp |
| defoliated | Defoliated Zone | defoliated-ground |

Biome selection (DEM mode): `classifyBiome(elevation, slopeDeg, rules, default)` - highest-priority rule that satisfies all constraints wins. Noise mode uses single `defaultBiomeId`.

---

## Worker Communication Protocol

All messages are typed via `WorkerMessageData` in [ChunkWorkerLifecycle.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkWorkerLifecycle.ts).

### Main thread -> Worker

| Message | Payload | Notes |
|---------|---------|-------|
| `generate` | `{chunkX, chunkZ, size, segments, seed, requestId}` | Triggers geometry generation |
| `setHeightProvider` | `HeightProviderConfig` (`{type:'noise',seed}` or `{type:'dem',buffer,...}`) | ArrayBuffer transfer for DEM |
| `setVegetationConfig` | `VegetationTypeConfig[]` | Vegetation type definitions |
| `setBiomeConfig` | `WorkerBiomeConfig[]` | Biome vegetation palettes |

### Worker -> Main thread

| Message | Payload | Notes |
|---------|---------|-------|
| `ready` | - | Worker initialized |
| `result` | `{requestId, chunkX, chunkZ, positions, normals, uvs, indices, heightData, vegetation, biomeId}` | All geometry as transferable ArrayBuffers (zero-copy) |
| `providerReady` | - | DEM provider loaded in worker |

---

## Height Query Chain

```
getHeightQueryCache()           // singleton, module-level instance
  provider: NoiseHeightProvider // default (procedural)

  // A Shau Valley mode:
  heightCache.setProvider(new DEMHeightProvider(float32data, w, h, metersPerPixel))
  workerPool.sendHeightProvider(provider.getWorkerConfig())  // workers get same DEM

  getHeightAt(x, z)             // LRU cache, 0.5m snap grid, up to 10k entries
    -> provider.getHeightAt(x, z)
       NoiseHeightProvider: multi-layer noise
       DEMHeightProvider: bilinear interpolation of Float32Array
```

**Consumers** (all call `getHeightQueryCache().getHeightAt(x, z)`):

- `ChunkLifecycleManager` / `ChunkLoadingStrategy` - chunk grounding
- `ChunkTerrainQueries` - collision / effective height
- `ZoneTerrainAdapter` - zone initialization
- `PlayerRespawnManager` - spawn point grounding
- `WarSimulator` - strategic agent elevation
- NPC grounding on every movement update (via CombatantMovement)
- Helicopter terrain collision (HelicopterPhysics)
- Helipad placement

---

## ImprovedChunkManager Key Constants

| Constant | Value | Role |
|----------|-------|------|
| `UPDATE_INTERVAL` | 0.25s | Chunk system cadence (not every frame) |
| `MAX_CHUNKS_PER_FRAME` | 1 | Ingestion limit to reduce spikes |
| `IN_FRAME_BUDGET_MS` | 2.0ms | Per-frame work budget |
| `IDLE_BUDGET_MS` | 6.0ms | requestIdleCallback budget |
| `MAX_QUEUE_SIZE` | 48 | Worker task queue cap |
| `LOAD_DELAY_FALLBACK` | 100ms | Fallback when rIC unavailable |
| `FPS_EMA_ALPHA` | 0.1 | Smoothing for adaptive render distance |
| `ADAPT_COOLDOWN_MS` | 1500ms | Min time between render distance changes |
| Default `size` | 64 world units | Chunk side length |
| Default `renderDistance` | 6 chunks | Visible ring radius |
| Default `loadDistance` | 7 chunks | Load ring (1 beyond visible) |
| Default `segments` | 32 | Vertices per side in worker |
| Startup sync chunks | 5 | Center + 4 cardinal neighbors |

Adaptive render distance: shrinks if FPS EMA < 55, grows if > 65. Bounded `[max(3, renderDistance/2), renderDistance]`.

---

## Chunk Lifecycle States

```
queued (ChunkPriorityManager)
  -> loading (ChunkLifecycleManager.loadingChunks set)
    -> worker generates geometry (ChunkWorkerPool)
      -> result returned (ChunkWorkerAdapter.applyWorkerData)
        -> chunk added to scene (ChunkLifecycleManager.chunks map)
          -> chunk unloaded when outside loadDistance (unloadDistantChunks)
```

Startup: `loadChunkImmediate` bypasses queue for center + 4 cardinal neighbors (prevents spawn hole).

---

## Wiring

`ImprovedChunkManager` has **no setter dependencies** - all constructor-injected: `scene`, `camera`, `assetLoader`, `globalBillboardSystem`.

**Fan-in** (7 systems reference it as `ChunkManager`): Combat, Footstep, Helicopter, Helipad, PlayerCtrl, PlayerRespawn, ZoneMgr.

`HeightQueryCache` is a module-level singleton - no injection needed anywhere, just `import { getHeightQueryCache }`.

---

## Tests

| Test File | What It Covers |
|-----------|----------------|
| [HeightQueryCache.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/HeightQueryCache.test.ts) | LRU eviction, cache hits, setProvider, preloadRegion |
| [ChunkWorkerPool.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkWorkerPool.test.ts) | Worker pool lifecycle, deduplication, timeout watchdog |
| [DEMHeightProvider.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/DEMHeightProvider.test.ts) | Bilinear interpolation, out-of-bounds clamping, getWorkerConfig |
| [ChunkLoadingStrategy.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkLoadingStrategy.test.ts) | Load order strategy |
| [ChunkPriorityManager.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ChunkPriorityManager.test.ts) | Distance-based priority, player chunk change detection |
| [ImprovedChunk.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ImprovedChunk.test.ts) | Chunk generation, dispose |
| [ImprovedChunkManager.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/ImprovedChunkManager.test.ts) | Manager init, update, adaptive render distance |
| [TerrainMeshMerger.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/TerrainMeshMerger.test.ts) | Ring merge, draw call reduction |

---

## Related Docs

- `docs/blocks/combat.md` - NPC grounding uses HeightQueryCache
- `docs/blocks/strategy.md` - WarSimulator elevation queries
- `docs/blocks/vehicle.md` - Helicopter terrain collision
- `docs/blocks/world.md` - Zone initialization needs terrain height
- `docs/ARCHITECTURE_RECOVERY_PLAN.md` - Terrain perf optimization history
