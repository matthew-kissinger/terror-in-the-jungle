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
- **ChunkWorkerPool** - Manages pool of chunk generation workers (`src/systems/terrain/ChunkWorkerPool.ts`, 715 lines)

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
| CombatantCombat.ts | 806 | systems/combat/ |
| ImprovedChunkManager.ts | 753 | systems/terrain/ |
| ChunkWorkerPool.ts | 715 | systems/terrain/ |
| ImprovedChunk.ts | 672 | systems/terrain/ |
| GPUBillboardSystem.ts | 669 | systems/world/billboard/ |
| SandboxSystemManager.ts | 644 | core/ |
| AIFlankingSystem.ts | 595 | systems/combat/ai/ |
| FootstepAudioSystem.ts | 587 | systems/audio/ |
| FirstPersonWeapon.ts | 576 | systems/player/ |
| FullMapSystem.ts | 573 | ui/map/ |
| AITargeting.ts | 571 | systems/combat/ai/ |
| InfluenceMapSystem.ts | 569 | systems/combat/ |
| CombatantSpawnManager.ts | 557 | systems/combat/ |
| CombatantSystem.ts | 541 | systems/combat/ |
| PixelArtSandbox.ts | 536 | core/ |
| CombatantMovement.ts | 504 | systems/combat/ |
| OpenFrontierRespawnMap.ts | 503 | ui/map/ |
| PerformanceTelemetry.ts | 497 | systems/debug/ |
| gameModes.ts | 496 | config/ |
| SpatialOctree.ts | 487 | systems/combat/ |
| ExplosionEffectsPool.ts | 486 | systems/effects/ |
| HUDStyles.ts | 483 | ui/hud/ |
| AudioManager.ts | 453 | systems/audio/ |
| WeatherSystem.ts | 447 | systems/environment/ |
| MinimapSystem.ts | 441 | ui/minimap/ |
| AICoverSystem.ts | 437 | systems/combat/ai/ |
| HelicopterModel.ts | 433 | systems/helicopter/ |
| HelicopterGeometry.ts | 433 | systems/helicopter/ |
| SandboxRenderer.ts | 431 | core/ |
| WeaponFiring.ts | 422 | systems/player/weapon/ |
| GPUTerrain.ts | 421 | systems/terrain/ |
| MatchEndScreen.ts | 419 | ui/end/ |
| CompassSystem.ts | 414 | ui/compass/ |
| MortarSystem.ts | 409 | systems/weapons/ |

**Completed splits**: CombatantSystem (1308->538), PlayerController (1043->369), HelicopterModel (1058->433), CombatantRenderer (866->376), HUDElements (956->311), AudioManager (767->453), GrenadeSystem (731->379), PlayerRespawnManager (749->331). 34 files exceed the 400-line target.

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
- **ExplosionEffectsPool gravity allocation** - `update()` creates `new THREE.Vector3(0, -3, 0)` every frame. Should be a static constant.
- **InfluenceMapSystem per-call Vector2/Vector3 allocations** - `computeThreatLevel()`, `computeOpportunityLevel()`, `computeCoverValue()`, `computeSquadSupport()` all create `new THREE.Vector2()`/`Vector3()` per entity in loops. Should use module-level scratch vectors. Runs every 500ms but accumulates with many entities.

Possible areas (confirm with profiling):
- Worker utilization (are they saturated?)
- Draw call reduction
- Shader complexity

### Missing Pieces

- **GPU timing** - Currently only CPU-side timing
- **Memory profiling** - No heap snapshot automation
- **Playwright test harness** - Infrastructure set up but perf regression tests not yet working
- **Bundle code-splitting** - Vite manual chunks configured (three.js, postprocessing, UI, BVH). Main chunk ~440 kB (112 kB gzipped). Circular chunk warnings from three.js internals remain.

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

~46k lines across 164 files. Orchestrator pattern but some files got big.

```
src/
├── core/                    # Game loop, renderer (644 lines in SandboxSystemManager)
├── systems/
│   ├── combat/             # AI, spatial, rendering
│   │   ├── ai/             # AITargeting, AIFlanking, AICover
│   │   ├── renderer/       # CombatantRenderer (split: LOD, Animation, Geometry, Materials)
│   │   ├── CombatantSystem.ts   # Main orchestrator (538 lines)
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
│   └── debug/              # PerformanceOverlay
├── workers/                # BVHWorker, ChunkWorker
└── utils/                  # Logger, ObjectPoolManager
```

## Key Files

| File | Purpose | Notes |
|------|---------|-------|
| `src/systems/debug/PerformanceTelemetry.ts` | Frame budget tracking | Use this |
| `src/ui/debug/PerformanceOverlay.ts` | F2 visual overlay | Shows everything |
| `src/systems/combat/CombatantSystem.ts` | NPC orchestrator | Split to 538 lines |
| `src/systems/combat/SpatialOctree.ts` | Spatial queries | Check query times |
| `src/workers/BVHWorker.ts` | Parallel BVH | Pool of 4 workers |
| `src/core/PixelArtSandbox.ts` | Main game loop | Where systems update (536 lines) |
| `src/core/SandboxSystemManager.ts` | System orchestrator | 644 lines |
| `src/systems/terrain/HeightQueryCache.ts` | Cached height lookups | Performance optimization |
| `src/systems/terrain/ChunkWorkerPool.ts` | Worker pool management | 715 lines, has saturation telemetry |

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
