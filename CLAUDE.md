# Terror in the Jungle

3D pixel art battlefield. GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: [GitHub Pages](https://matthew-kissinger.github.io/terror-in-the-jungle/)

## Goal: Optimize the Hell Out of It

The game has performance issues. The infrastructure to diagnose and fix them already exists - use it.

## What Already Exists

### Profiling Tools (USE THESE)

**Console API** (`window.perf`):
```javascript
perf.report()    // Full telemetry report
perf.validate()  // Check spatial grid, hit detection, frame budget
perf.benchmark(1000)  // Run 1000-iteration raycast/hit detection benchmark
perf.reset()     // Reset all telemetry
```

**F2 Overlay** shows:
- FPS, frame time, draw calls, triangles
- Chunk queue, loaded chunks
- Combatant counts (US/OPFOR)
- Vegetation active/reserved
- Combat system timing (last ms, avg ms)
- LOD breakdown (high/med/low/culled)
- Octree stats (nodes, depth, avg per leaf)
- Memory (geometries, textures, programs)
- Frame budget bars with color coding

**PerformanceTelemetry** (`src/systems/debug/PerformanceTelemetry.ts`):
- Per-system timing with EMA
- Frame budget tracking (16.67ms target)
- Slow frame detection and logging
- Spatial grid telemetry
- Hit detection stats

### Spatial Systems

- **SpatialOctree** - 487 lines, used for combatant queries
- **SpatialGrid** - Alternative grid-based spatial
- **SpatialGridManager** - Coordinates spatial queries
- **LOSAccelerator** - Line-of-sight caching

### Web Workers

- **BVHWorker** - Pool of 4 workers for parallel BVH computation (`src/workers/BVHWorker.ts`, 212 lines)
- **ChunkWorker** - Terrain chunk generation (`src/workers/ChunkWorker.ts`, 314 lines)
- **ChunkWorkerPool** - Manages pool of chunk generation workers (`src/systems/terrain/ChunkWorkerPool.ts`, 270 lines, split into ChunkWorkerLifecycle + ChunkWorkerTelemetry + ChunkWorkerCode + ChunkTaskQueue)

### Terrain Optimization (Recent)

- **HeightQueryCache** - Cached terrain height lookups (`src/systems/terrain/HeightQueryCache.ts`, 197 lines)
- **GPUTerrain** - GPU-accelerated terrain rendering (`src/systems/terrain/GPUTerrain.ts`, 421 lines)

### Effect Pools

- TracerPool, MuzzleFlashPool, ImpactEffectsPool, ExplosionEffectsPool
- Object pooling to avoid GC

### LOD System

CombatantSystem has distance-based LOD:
- High: Full updates
- Medium: Reduced update frequency
- Low: Minimal updates
- Culled: No updates

### Influence Maps

- **InfluenceMapSystem** - Strategic AI targeting

## What Needs Work

### Large Files (violate 400-line target)

| File | Lines | Location |
|------|-------|----------|
| SpatialOctree.ts | 487 | systems/combat/ |
| HUDStyles.ts | 483 | ui/hud/ |
| CombatantCombat.ts | 468 | systems/combat/ |
| AudioManager.ts | 453 | systems/audio/ |
| WeatherSystem.ts | 449 | systems/environment/ |
| CompassSystem.ts | 447 | ui/compass/ |
| FirstPersonWeapon.ts | 445 | systems/player/ |
| MinimapSystem.ts | 440 | ui/minimap/ |
| AICoverSystem.ts | 437 | systems/combat/ai/ |
| MatchEndScreen.ts | 434 | ui/end/ |
| HelicopterModel.ts | 433 | systems/helicopter/ |
| HelicopterGeometry.ts | 433 | systems/helicopter/ |
| HUDUpdater.ts | 431 | ui/hud/ |
| SandboxRenderer.ts | 431 | core/ |
| CombatantSystem.ts | 428 | systems/combat/ |
| WeaponFiring.ts | 425 | systems/player/weapon/ |
| MortarSystem.ts | 424 | systems/weapons/ |
| ChunkWorkerCode.ts | 421 | systems/terrain/ |
| GPUTerrain.ts | 421 | systems/terrain/ |
| ZoneManager.ts | 412 | systems/world/ |
| DeathCamSystem.ts | 405 | systems/player/ |
| ImprovedChunk.ts | 401 | systems/terrain/ |

**Completed splits**: CombatantSystem (1308->538->428, extracted CombatantSystemDamage + CombatantSystemSetters + CombatantSystemUpdate), PlayerController (1043->369), HelicopterModel (1058->433), CombatantRenderer (866->376), HUDElements (956->311), AudioManager (767->453), GrenadeSystem (731->379), PlayerRespawnManager (749->331), CombatantCombat (806->468), FootstepAudioSystem (587->326), ImprovedChunkManager (753->529->385, extracted ChunkPriorityManager + ChunkLifecycleManager + ChunkLoadQueueManager + ChunkTerrainQueries), FirstPersonWeapon (568->445, extracted WeaponAmmo + WeaponInput + WeaponModel), SandboxSystemManager (644->270, extracted SystemInitializer + SystemConnector + SystemUpdater + SystemDisposer), ChunkWorkerPool (715->270, extracted ChunkWorkerLifecycle + ChunkWorkerTelemetry + ChunkWorkerCode + ChunkTaskQueue), GPUBillboardSystem (669->243, extracted BillboardBufferManager + BillboardShaders), PerformanceTelemetry (612->388, extracted FrameBudgetTracker + SpatialTelemetry + HitDetectionTelemetry), ImprovedChunk (672->399, extracted ChunkVegetationGenerator + TerrainMeshFactory), CombatantSpawnManager (615->337, extracted SpawnPointManager + ReinforcementManager + SpawnBalancer), AIFlankingSystem (606->359, extracted FlankingRoleManager + FlankingTacticsResolver), FullMapSystem (574->365, extracted FullMapDOMHelpers + FullMapInput + FullMapStyles), AITargeting (571->94, extracted AITargetAcquisition + AILineOfSight), CombatantMovement (504->129, extracted CombatantMovementStates + CombatantMovementCommands), PixelArtSandbox (551->144, extracted PixelArtSandboxInit + PixelArtSandboxInput + PixelArtSandboxLoop), InfluenceMapSystem (570->329, extracted InfluenceMapComputations + InfluenceMapGrid), ExplosionEffectsPool (489->161, extracted ExplosionEffectFactory + ExplosionParticleUpdater + ExplosionSpawnInitializer + ExplosionTextures), OpenFrontierRespawnMap (531->194, extracted OpenFrontierRespawnMapUtils + OpenFrontierRespawnMapRenderer), gameModes (496->40, extracted GameModeZoneControl + GameModeOpenFrontier + GameModeCommon). 22 files exceed the 400-line target.

### Optimization Targets

Use the profiling to identify actual bottlenecks, then:

1. **Profile first** - Run `perf.report()`, check F2 overlay, identify which systems eat frame budget
2. **Stress test** - Load Zone Control with max NPCs, measure
3. **Isolate** - Toggle systems to find the culprit
4. **Fix** - Apply targeted optimizations
5. **Validate** - Measure again, confirm improvement

Known hotspots:
- **CombatantMovement zone evaluation** - FIXED. Throttled to 3-5s intervals with single-loop top-3 selection instead of per-frame sort.
- **CombatantCombat suppression scan** - FIXED. Replaced O(n) allCombatants.forEach with spatialGridManager.queryRadius() for suppression and ally search. Uses distanceToSquared. Module-level scratch vectors replace pool allocation.
- **ClusterManager O(n) per NPC** - FIXED. All three methods (calculateSpacingForce, isInCluster, getClusterDensity) now use spatialGridManager.queryRadius() with early exit. O(n) -> O(log n).
- **AITargeting cluster check** - FIXED. Combined spatial query handles both target finding and cluster detection in single pass. Module-level scratch vectors throughout.
- **GPUBillboardSystem** - FIXED. O(1) compaction, spatial chunk bounds for area clearing, batched buffer updates.
- **CompassSystem DOM rebuild** - FIXED. Caches zone marker DOM elements in a Map, reuses nodes, updates positions only instead of innerHTML rebuild every frame.
- **MinimapSystem per-frame Vector3 allocations** - FIXED. Uses module-level scratch vectors instead of per-combatant per-frame allocations.
- **FullMapSystem allocations** - FIXED. Uses module-level scratch vector instead of per-frame Vector3 allocations.
- **ExplosionEffectsPool gravity allocation** - FIXED. Static `GRAVITY` constant at module level.
- **InfluenceMapSystem per-call Vector2/Vector3 allocations** - FIXED. Module-level scratch vectors `_v2a`, `_v2b`, `_v3a` reused throughout compute methods.
- **HUDUpdater per-frame DOM rebuild** - FIXED. DOM nodes cached, uses textContent updates instead of innerHTML rebuild.
- **KillFeed DOM rebuild** - FIXED. Incremental DOM updates with entry tracking by ID, only adds/removes changed entries.
- **CombatantLODManager full sort every frame** - FIXED. Replaced O(n log n) sort with distance bucketing.
- **WeatherSystem rain particle loop** - FIXED. Eliminated per-particle matrix decomposition for 8000 rain particles per frame.
- **AIFlankingSystem per-call allocations** - FIXED. Module-level scratch vectors replace per-call Vector3 clones throughout.
- **MortarSystem detonation allocations** - FIXED. Module-level scratch vectors and static UP_NORMAL constant replace per-detonation allocations.
- **DamageNumberSystem worldToScreen() clone** - FIXED. Eliminated per-frame Vector3 clone and object allocation using module-level scratch vector.
- **HelicopterInstrumentsPanel per-frame querySelector** - FIXED. Element refs stored as private class properties, initialized in createHelicopterInstruments(), referenced in updateHelicopterInstruments().
- **CombatantLODManager.simulateDistantAI() allocations** - FIXED. Module-level scratch vectors for direction and random offset.
- **DeathCamSystem per-frame Vector3 allocations** - FIXED. Pre-allocated scratch vectors for offset, direction, and up axis.
- **WeaponFiring per-shot allocations** - FIXED. Module-level scratch vectors for ray direction, muzzle flash positions.
- **CombatantSpawnManager clone chains** - FIXED. Eliminated clone chains in manageSpawning() and spawnReinforcementWave().

- **TracerPool geometry leak** - FIXED. Geometry shared within tracer groups, dispose() uses Set to handle shared refs.
- **ImpactEffectsPool material leak** - FIXED. Cloned decal materials now disposed in dispose().
- **MortarBallistics updateRoundPhysics() clone** - FIXED. Module-level scratch vectors `_velStep` and `_roundVelStep` replace per-call clones.

- **CombatantRenderer death animation allocations** - FIXED. Pre-allocated scratch matrices and vectors reused across all death animation branches.
- **PerformanceOverlay per-frame DOM rebuild** - FIXED. DOM nodes cached and updated via textContent instead of innerHTML rebuild.
- **Effect pools Array.splice() in update loops** - FIXED. All four pools (TracerPool, ExplosionEffectsPool, MuzzleFlashPool, ImpactEffectsPool) use swap-and-pop compaction.
- **TracerPool shared material opacity bug** - FIXED. Per-tracer material clones prevent shared state mutations.
- **ZoneManager O(n*m) occupant check** - FIXED. Uses spatialGridManager.queryRadius() with 100ms throttle interval.

- **LOSAccelerator getRelevantChunks() Box3 allocations** - FIXED. Module-level scratch `_rayBox` and `_meshBox` replace per-call Box3 allocations.
- **ImprovedChunkManager getObjectHeightAt() allocations** - FIXED. Module-level `_heightBox`, `_heightTestPoint`, `_heightRaycaster`, `_heightRayOrigin`, `_heightRayDir` replace per-call allocations.
- **ImprovedChunkManager checkObjectCollision() Box3 loop** - FIXED. Module-level `_collisionBox` replaces per-iteration Box3.

- **Array.splice() in weapon/grenade update loops** - FIXED. MortarSystem, GrenadeSystem, CameraShakeSystem now use swap-and-pop.
- **OpenFrontierRespawnMapRenderer debug console.log** - FIXED. Debug logging removed from render path.

Discovered hotspots (not yet fixed):
- **PlayerMovement per-frame allocations** - `src/systems/player/PlayerMovement.ts:79-118`. Creates 4-5 new Vector3 per frame in `applyMovement()`. Should use module-level scratch vectors.
- **BillboardRenderer per-frame allocations** - `src/systems/world/billboard/BillboardRenderer.ts:25,41,90`. Creates new Vector3 per frame and per-chunk in update loop for 200k+ billboard rotations.
- **GunplayCore Ray allocations** - `src/systems/weapons/GunplayCore.ts:103,109,163`. Creates `new THREE.Ray()` per shot and per pellet for shotgun spread.
- **SpatialOctree Ray allocation** - `src/systems/combat/SpatialOctree.ts:337`. Creates `new THREE.Ray()` per spatial query.
- **MortarBallistics computeTrajectory() clones** - Lines 60-80. Still creates 100+ Vector3 via `.clone()` per trajectory computation (builds output array, not per-frame). Lower priority.

Possible areas (confirm with profiling):
- Worker utilization (are they saturated?)
- Draw call reduction
- Shader complexity

### Event Listener Leaks (Memory)

**MOSTLY FIXED.** The `.bind()` bug and missing dispose cleanup have been addressed across most files.

**Fixed** (stored bound refs, added dispose):
- PlayerInput, WeaponInput, WeaponModel, InventoryManager, PlayerSquadController, WeaponPickupSystem - bound function properties
- MatchEndScreen, GameModeSelection, LoadingPanels - added dispose()
- OpenFrontierRespawnMap, RespawnMapView - added dispose()

**Remaining issues:**
- None known. LoadoutSelector and SquadRadialMenu were fixed (stored bound refs, dispose cleanup).

### Missing Pieces

- **GPU timing** - ADDED. renderer.info stats (draw calls, triangles, geometries, textures) and EXT_disjoint_timer_query instrumentation in PerformanceTelemetry. Visible in F2 overlay.
- **Memory profiling** - No heap snapshot automation
- **Playwright test harness** - Infrastructure set up but perf regression tests not yet working
- **Bundle code-splitting** - Vite manual chunks configured (three.js, postprocessing, UI, BVH). Main chunk ~457 kB (117 kB gzipped). Circular chunk warnings from three.js internals remain.

## COMPLETED: AI Sandbox Mode

AI Sandbox mode is now implemented and can be used for automated performance testing:

**URL Params**:
- `?sandbox=true` - Enable sandbox mode (auto-starts, no pointer lock required)
- `?npcs=40` - Set NPC count (default: 40, range: 2-400)
- `?duration=60` - Set test duration in seconds (0 = unlimited)
- `?autostart=true` - Auto-start without user interaction

**Metrics API** (`window.sandboxMetrics`):
```javascript
sandboxMetrics.frameCount      // Total frames rendered
sandboxMetrics.avgFrameMs      // Average frame time
sandboxMetrics.p95FrameMs      // 95th percentile frame time
sandboxMetrics.combatantCount  // Active NPCs
sandboxMetrics.firingCount     // NPCs currently firing
sandboxMetrics.engagingCount   // NPCs in combat
sandboxMetrics.getSnapshot()   // Get all metrics as object
```

**Example stress test URL**: `http://localhost:5173/?sandbox=true&npcs=80&autostart=true`

**Benchmark API** (`perf.benchmark(iterations)`):
```javascript
perf.benchmark(1000)  // Runs 1000 raycast iterations, returns timing stats
// Returns: { totalTimeMs, avgPerRayMs, p95Ms, p99Ms, iterations, details }

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing |
| Spatial | three-mesh-bvh, custom octree/grid |
| Build | Vite 7, TypeScript 5.9 |
| Workers | BVH pool (4), chunk workers |

## Architecture

~50k lines across 190+ files. Orchestrator pattern with ongoing split refactors.

```
src/
├── core/                    # Game loop, renderer (270 lines in SandboxSystemManager, split into 4 modules)
├── systems/
│   ├── combat/             # AI, spatial, rendering
│   │   ├── ai/             # AITargeting, AIFlanking, AICover
│   │   ├── renderer/       # CombatantRenderer (split: LOD, Animation, Geometry, Materials)
│   │   ├── CombatantSystem.ts   # Main orchestrator (428 lines)
│   │   ├── SpatialOctree.ts     # Spatial queries
│   │   ├── InfluenceMapSystem.ts
│   │   └── ...
│   ├── player/             # Controller (split: Input, Movement, Camera), weapons, health
│   ├── helicopter/         # HelicopterModel (split: Geometry, Animation, Audio, Physics)
│   ├── terrain/            # Chunks, workers, vegetation
│   ├── world/              # Zones, billboards, tickets
│   ├── debug/              # PerformanceTelemetry
│   └── effects/            # Pools (tracers, muzzle, impact, explosion)
├── ui/
│   ├── hud/               # HUDElements (split: 11 focused modules)
│   ├── map/               # FullMapSystem (split: DOMHelpers, Input, Styles)
│   └── debug/              # PerformanceOverlay
├── workers/                # BVHWorker, ChunkWorker
└── utils/                  # Logger, ObjectPoolManager
```

## Key Files

| File | Purpose | Notes |
|------|---------|-------|
| `src/systems/debug/PerformanceTelemetry.ts` | Frame budget tracking | Use this |
| `src/ui/debug/PerformanceOverlay.ts` | F2 visual overlay | Shows everything |
| `src/systems/combat/CombatantSystem.ts` | NPC orchestrator | Split to 428 lines |
| `src/systems/combat/SpatialOctree.ts` | Spatial queries | Check query times |
| `src/workers/BVHWorker.ts` | Parallel BVH | Pool of 4 workers |
| `src/core/PixelArtSandbox.ts` | Main game loop | Where systems update (144 lines, split into 3 modules) |
| `src/core/SandboxSystemManager.ts` | System orchestrator | 270 lines (split into 4 modules) |
| `src/systems/terrain/HeightQueryCache.ts` | Cached height lookups | Performance optimization |
| `src/systems/terrain/ChunkWorkerPool.ts` | Worker pool management | 270 lines (split into 5 modules), has saturation telemetry |

## Game Modes

| Mode | Map | NPCs | Duration |
|------|-----|------|----------|
| Zone Control | 400x400 | 15v15 | 3 min |
| Open Frontier | 3200x3200 | 60v60 | 15 min |

## Controls

- **WASD** Move, **Shift** Sprint, **Space** Jump
- **Click** Fire, **RClick** ADS, **R** Reload
- **1-5** Weapons, **G** Grenade
- **F1** Console stats, **F2** Performance overlay

## Development

```bash
npm install
npm run dev     # localhost:5173
npm run build   # Production
```

## Approach

1. Play the game, hit F2, watch the numbers
2. Run `perf.report()` in console
3. Find what's red/yellow in frame budget
4. Read that system's code
5. Optimize it
6. Measure again
7. Repeat

Don't guess - measure.
