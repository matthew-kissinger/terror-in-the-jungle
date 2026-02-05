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
- Terrain merger stats (rings, chunks, draw call savings)
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

- **SpatialOctree** - 257 lines (split: SpatialOctreeNode + SpatialOctreeQuery), used for combatant queries
- **SpatialGrid** - Alternative grid-based spatial
- **SpatialGridManager** - Coordinates spatial queries
- **LOSAccelerator** - Line-of-sight caching

### Web Workers

- **BVHWorker** - Pool of 4 workers for parallel BVH computation (`src/workers/BVHWorker.ts`, 212 lines)
- **ChunkWorker** - Terrain chunk generation (`src/workers/ChunkWorker.ts`, 314 lines)
- **ChunkWorkerPool** - Manages pool of chunk generation workers (`src/systems/terrain/ChunkWorkerPool.ts`, 270 lines, split into ChunkWorkerLifecycle + ChunkWorkerTelemetry + ChunkWorkerCode + ChunkTaskQueue)

### Terrain Optimization (Recent)

- **HeightQueryCache** - Cached terrain height lookups (`src/systems/terrain/HeightQueryCache.ts`, 197 lines)
- **GPUTerrain** - GPU-accelerated terrain rendering (`src/systems/terrain/GPUTerrain.ts`, 238 lines, split: GPUTerrainShaders + GPUTerrainGeometry)
- **TerrainMeshMerger** - Merges per-chunk terrain meshes into distance-ring groups to reduce draw calls (`src/systems/terrain/TerrainMeshMerger.ts`, 240 lines). Integrated into ChunkLifecycleManager. Telemetry wired to F2 overlay and perf.report().

### Effect Pools

- TracerPool, MuzzleFlashPool, ImpactEffectsPool, ExplosionEffectsPool
- Object pooling to avoid GC

### Grenade Effects

- **SmokeCloudSystem** (`src/systems/effects/SmokeCloudSystem.ts`, 343 lines) - Pooled smoke cloud sprites with screen obscuration overlay. Distance-based opacity when player enters cloud. `isLineBlocked()` API blocks AI line-of-sight through active smoke clouds, wired into AILineOfSight via SystemConnector.
- **FlashbangScreenEffect** (`src/systems/player/FlashbangScreenEffect.ts`, 150 lines) - Full-screen white overlay with distance and angle-based intensity. 3s full blind at <15m, 1.5s partial at 15-25m.
- **GrenadeEffects** (`src/systems/weapons/GrenadeEffects.ts`, 248 lines) - Dispatches frag/smoke/flashbang explosion logic. NPC disorientation via spatial query (4x accuracy penalty for 1.5-3s based on distance).

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

| File | Lines | Location | Notes |
|------|-------|----------|-------|
| CombatantSystem.ts | 442 | systems/combat/ | Orchestrator - skip |
| ChunkWorkerCode.ts | 421 | systems/terrain/ | Worker boundary |

**ImprovedChunk.ts now 325 lines** (was 408, extracted ChunkWorkerAdapter - 214 lines)

**Completed splits**: CombatantSystem (1308->538->428, extracted CombatantSystemDamage + CombatantSystemSetters + CombatantSystemUpdate), PlayerController (1043->369), HelicopterModel (1058->433), CombatantRenderer (866->376), HUDElements (956->311), AudioManager (767->453->272, extracted AudioWeaponSounds), GrenadeSystem (731->379), PlayerRespawnManager (749->331), CombatantCombat (806->468->380, extracted CombatantCombatEffects), FootstepAudioSystem (587->326), ImprovedChunkManager (753->529->385, extracted ChunkPriorityManager + ChunkLifecycleManager + ChunkLoadQueueManager + ChunkTerrainQueries), FirstPersonWeapon (568->445, extracted WeaponAmmo + WeaponInput + WeaponModel), SandboxSystemManager (644->270, extracted SystemInitializer + SystemConnector + SystemUpdater + SystemDisposer), ChunkWorkerPool (715->270, extracted ChunkWorkerLifecycle + ChunkWorkerTelemetry + ChunkWorkerCode + ChunkTaskQueue), GPUBillboardSystem (669->243, extracted BillboardBufferManager + BillboardShaders), PerformanceTelemetry (612->388->310, extracted FrameBudgetTracker + SpatialTelemetry + HitDetectionTelemetry + FrameTimingTracker), ImprovedChunk (672->399, extracted ChunkVegetationGenerator + TerrainMeshFactory), CombatantSpawnManager (615->337, extracted SpawnPointManager + ReinforcementManager + SpawnBalancer), AIFlankingSystem (606->359, extracted FlankingRoleManager + FlankingTacticsResolver), FullMapSystem (574->365, extracted FullMapDOMHelpers + FullMapInput + FullMapStyles), AITargeting (571->94, extracted AITargetAcquisition + AILineOfSight), CombatantMovement (504->129, extracted CombatantMovementStates + CombatantMovementCommands), PixelArtSandbox (551->144, extracted PixelArtSandboxInit + PixelArtSandboxInput + PixelArtSandboxLoop), InfluenceMapSystem (570->329, extracted InfluenceMapComputations + InfluenceMapGrid), ExplosionEffectsPool (489->161, extracted ExplosionEffectFactory + ExplosionParticleUpdater + ExplosionSpawnInitializer + ExplosionTextures), OpenFrontierRespawnMap (531->194, extracted OpenFrontierRespawnMapUtils + OpenFrontierRespawnMapRenderer), gameModes (496->40, extracted GameModeZoneControl + GameModeOpenFrontier + GameModeCommon), SpatialOctree (487->257, extracted SpatialOctreeNode + SpatialOctreeQuery), HUDStyles (483->40, extracted HUDBaseStyles + HUDStatusStyles + HUDWeaponStyles + HUDZoneStyles), AICoverSystem (458->371, extracted AICoverEvaluation), SandboxRenderer (431->203, extracted SandboxCrosshairUI + SandboxLoadingUI), WeatherSystem (449->314, extracted WeatherAtmosphere + WeatherLightning), CompassSystem (454->95, extracted CompassStyles + CompassDOMBuilder + CompassZoneMarkers), ChunkLifecycleManager (448->287, extracted ChunkLoadingStrategy + ChunkSpatialUtils), FirstPersonWeapon (568->445->382, extracted WeaponAmmo + WeaponInput + WeaponModel + WeaponSwitching + WeaponShotCommandBuilder), MatchEndScreen (434->120, extracted MatchEndScreenDOM + MatchEndScreenStyles), MinimapSystem (440->117, extracted MinimapDOMBuilder + MinimapRenderer + MinimapStyles), HelicopterGeometry (433->170, extracted HelicopterGeometryParts), HUDUpdater (431->305, extracted HUDZoneDisplay), HelicopterModel (433->329, extracted HelicopterInteraction), WeaponFiring (425->312, extracted WeaponShotExecutor), GPUTerrain (422->238, extracted GPUTerrainShaders + GPUTerrainGeometry), MortarSystem (425->367, extracted MortarRoundManager + MortarCamera), DeathCamSystem (406->221, extracted DeathCamOverlay), ZoneManager (413->298, extracted ZoneInitializer), GrenadeSystem (411->383, extracted GrenadeCallout), LoadoutSelector (445->387->295, extracted LoadoutGrenadePanel + LoadoutWeaponPanel). 2 files exceed the 400-line target. ImprovedChunk (408->325, extracted ChunkWorkerAdapter).

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

- **PlayerMovement per-frame allocations** - FIXED. Module-level scratch vectors `_moveVector`, `_cameraDirection`, `_cameraRight`, `_worldMoveVector`, `_horizontalVelocity`, `_upVector` replace per-frame allocations.
- **BillboardRenderer per-frame allocations** - FIXED. Module-level scratch vectors `_cameraPosition`, `_chunkCenter`, `_direction` replace per-frame and per-chunk allocations.
- **GunplayCore Ray allocations** - FIXED. Module-level `_scratchRay`, `_origin`, `_perturbed` reused in `computeShotRay()`. Pellet array builds still allocate (necessary for output array).
- **SpatialOctree Ray allocation** - FIXED. SpatialOctree split to 257 lines (SpatialOctreeNode + SpatialOctreeQuery). Module-level scratch ray replaces per-query allocation.

- **AICoverSystem per-call Vector3 allocations** - FIXED. Module-level scratch vectors `_coverToThreat`, `_coverToCombatant`, `_sandbagCenter`, `_threatToSandbag`, `_sandbagOffset` replace per-call allocations in `evaluateCoverQuality()` and `evaluateSandbagCover()`.

- **HelicopterPhysics per-frame allocations** - FIXED. Module-level scratch vectors replace per-frame Vector3/Quaternion/Euler allocations in calculateForces(), applyAutoStabilization(), and integrate().
- **HelicopterAnimation.updateVisualTilt() quaternion clone** - FIXED. Module-level scratch quaternion `_finalQuaternion` replaces per-frame clone.
- **HelicopterModel getter clones** - FIXED. Target-vector pattern replaces per-frame clones in getHelicopterPosition(), getHelicopterQuaternion().
- **FirstPersonWeapon per-frame Vector3 fallback** - FIXED. Uses module-level scratch vector.

- **HelicopterPhysics getState()/getControls() spread** - FIXED. Eliminated shallow copy spread operators.

- **CombatantHitDetection checkPlayerHit() allocations** - FIXED. Module-level scratch vectors (commit 0b2aa83). Remaining .clone() calls in hit result construction are per-hit (rare), acceptable.
- **PlayerInput getMouseMovement() spread** - FIXED. Cached mouseResult object eliminates per-frame spread (commit 2e81787).
- **SpatialOctree Array.splice() in remove/updatePosition** - FIXED. Swap-and-pop in removeFromNode (commit 2e81787).

- **PlayerHealthEffects resize listener** - FIXED. Stored bound ref, removed in dispose() (commit c226f60).
- **PlayerSuppressionSystem resize listener** - FIXED. Stored bound ref, removed in dispose() (commit c226f60).
- **HelicopterAnimation.calculateTargetTilt() per-frame allocs** - FIXED. Module-level scratch Euler and Quaternion replace per-frame allocations (commit a21696b).
- **AIStateEngage per-frame Vector3 allocations** - FIXED. Module-level scratch vectors `_toTarget`, `_flankingPos`, `_toAttacker` replace per-frame allocations (commit 0be935b).
- **AIStatePatrol per-frame Vector3 allocations** - FIXED. Module-level scratch vectors `_toTarget`, `_offset`, `_awayDir`, `_defensePos` replace per-frame allocations (commit da4f97a).
- **AIStateMovement per-frame Vector3 allocations** - FIXED. Module-level scratch vectors `_toDestination`, `_toTarget`, `_toCover` replace per-frame allocations (commit 75af883).

- **GrenadeEffects per-detonation Vector3 allocations** - FIXED. Module-level scratch vectors `_lookDirection`, `_toCombatant`, `_offset`, `_spawnPos`, `_velocity` replace per-detonation allocations.

- **ImprovedChunk.getPosition() per-call Vector3** - FIXED. Cached `_position` in constructor, `getPosition()` returns pre-allocated vector (commit b15cd17).
- **PlayerController.getPosition()/getVelocity() clone** - FIXED. Target-vector pattern: `getPosition(target?: THREE.Vector3)` avoids allocation when caller provides target (commit b15cd17).
- **WeaponShotCommandBuilder per-shot clones** - FIXED. Removed unnecessary `.clone()` on `_origin` and `_direction` scratch vectors (commit b15cd17).

Discovered hotspots (not yet fixed):
- **MortarBallistics computeTrajectory() clones** - Lines 60-80. Still creates 100+ Vector3 via `.clone()` per trajectory computation (builds output array, not per-frame). Lower priority.
- **DeathCamSystem innerHTML in showOverlay()** - Uses innerHTML for kill details. One-time call per death (not per-frame), low impact.

Possible areas (confirm with profiling):
- Worker utilization (are they saturated?)
- Draw call reduction (TerrainMeshMerger added with telemetry - measure actual savings in-game)
- Shader complexity

### Event Listener Leaks (Memory)

**All tracked event listeners now have cleanup.** No known leaks remaining.

**Fixed** (stored bound refs, added dispose):
- PlayerInput, WeaponInput, WeaponModel, InventoryManager, PlayerSquadController, WeaponPickupSystem - bound function properties
- MatchEndScreen, LoadingPanels - added dispose()
- OpenFrontierRespawnMap, RespawnMapView - added dispose()
- WeaponInput.ts contextmenu listener - stored bound ref, removed in dispose()
- SquadRadialMenu.ts mouseenter listeners - stored handlers, removed in dispose()
- LoadoutSelector.ts click listeners - stored handlers, removed in dispose()
- PixelArtSandboxInput.ts resize/keydown listeners - exports disposeEventListeners()
- LoadingScreen.ts click listeners - stored handlers, removed in dispose() (commit c042666)
- LoadingScreenWithModes.ts click listeners - stored handlers, removed in dispose() (commit c042666)

**Console.log migration: COMPLETE.** All calls migrated to Logger. Only ChunkWorkerCode.ts (worker context, no Logger access) retains console.log.

### Known Tech Debt

- **44 `: any` type annotations** across ~15 files + 30 `as any` casts across ~18 files (heaviest: SystemInterfaces.ts with 19 `: any` - intentional). Reduced from 135 via targeted refactoring. Remaining `as any` heaviest: ChunkLoadQueueManager.ts (4), AssetLoader.ts (4), CombatantSystemDamage.ts (2), BVHWorker.ts (2) - all expected patterns (feature detection, image elements, dynamic type checks).
- **Logger emoji removal COMPLETE** - All Logger calls cleaned. Remaining ~35 emoji characters across 8 UI files (KillFeed, LoadingPanels, etc.) are intentional UI icons, not Logger calls.
- **NPC-to-NPC assists not tracked** - Scoreboard shows NPC assists as 0. Player assists tracked via KillAssistTracker, but per-NPC assist display would need additional wiring.
- **Scoreboard toggle** - FIXED. TAB key wired to toggleScoreboard() (commit 48169fa).
- **Blob URL leak in ChunkWorkerLifecycle** - FIXED. URL.revokeObjectURL() added in dispose() (commit 3cc8a99).
- **TicketSystem.restartMatch() unused** - In-memory match reset method exists (lines 351-364) but UI uses `window.location.reload()` instead.
- **IPlayerController interface incorrect** - Has `tryEnterHelicopter()`, `position`, `camera` that don't match PlayerController class (tryEnterHelicopter is on HelicopterModel, position/camera are private). Interface is unused currently but blocks any-reduction work that tries to use it.
- **Unit tests (Vitest)** - 8 test files, 258 tests passing. Coverage: Logger, MathUtils, NoiseGenerator, ObjectPoolManager, SpatialOctree, SpatialGrid, HeightQueryCache, ChunkWorkerPool. Run `npm run test:run` to execute.
- **Missing audio** - Grenade throw/pin pull, mortar launch sounds not configured in audio.ts. Weapon pickup feedback also absent.
- **Weapon balance** - BALANCED. M16A4 (US): damageNear 26, damageFar 18. AK-74 (OPFOR): damageNear 30, damageFar 16. OPFOR has ~15% near advantage, US wins at range. (commit a08ca65)

### Missing Pieces

- **GPU timing** - ADDED. renderer.info stats (draw calls, triangles, geometries, textures) and EXT_disjoint_timer_query instrumentation in PerformanceTelemetry. Visible in F2 overlay.
- **Memory profiling** - No heap snapshot automation
- **Perf regression testing** - `scripts/perf-baseline.ts` (571 lines) fully implemented. Wired to CI via `.github/workflows/perf-check.yml` (commit 6476e26). Also has `.github/workflows/deploy.yml` (build + GitHub Pages deploy).
- **Bundle code-splitting** - Vite manual chunks configured (three.js, postprocessing, UI, BVH). Main chunk ~458 kB (115 kB gzipped). Gzip and Brotli compression plugins configured via vite-plugin-compression. Brotli total ~363 kB.

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

~53k lines across 274 files. Orchestrator pattern with ongoing split refactors.

```
src/
├── core/                    # Game loop, renderer (270 lines in SandboxSystemManager, split into 4 modules)
├── systems/
│   ├── combat/             # AI, spatial, rendering
│   │   ├── ai/             # AITargeting, AIFlanking, AICover
│   │   ├── renderer/       # CombatantRenderer (split: LOD, Animation, Geometry, Materials)
│   │   ├── CombatantSystem.ts   # Main orchestrator (433 lines)
│   │   ├── SpatialOctree.ts     # Spatial queries
│   │   ├── InfluenceMapSystem.ts
│   │   └── ...
│   ├── player/             # Controller (split: Input, Movement, Camera), weapons, health, FlashbangScreenEffect
│   ├── helicopter/         # HelicopterModel (split: Geometry, Animation, Audio, Physics, Interaction)
│   ├── terrain/            # Chunks, workers, vegetation
│   ├── world/              # Zones, billboards, tickets
│   ├── debug/              # PerformanceTelemetry
│   └── effects/            # Pools (tracers, muzzle, impact, explosion), SmokeCloudSystem
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
| `src/systems/combat/CombatantSystem.ts` | NPC orchestrator | 440 lines (orchestrator, tolerable) |
| `src/systems/combat/SpatialOctree.ts` | Spatial queries | 257 lines (split into Node + Query modules) |
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
- **1-6** Weapons (1-3 Primary, 4 Sandbag, 5 Grenade, 6 Pistol), **G** Grenade
- **TAB** Scoreboard, **F1** Console stats, **F2** Performance overlay
- **M** Toggle mortar camera view (top-down tactical view when mortar deployed)
- **Z** Toggle squad command UI
- **Shift+1-5** Squad commands (Follow Me, Hold Position, Patrol Here, Retreat, Free Roam)

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
