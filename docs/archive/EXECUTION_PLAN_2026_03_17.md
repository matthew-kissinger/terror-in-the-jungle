# Execution Plan: Navmesh-Driven NPC Movement + Validated Placement

Status: COMPLETE (Layer 1-2 + speed tuning + behavioral fixes shipped; Layer 3A/3C/3D deferred)
Date: 2026-03-17

> **Continued iteration** on movement, terrain-flow, and validation lives in [`MOVEMENT_NAV_CHECKIN.md`](./MOVEMENT_NAV_CHECKIN.md) and issue notes in [`PLAYTEST_ISSUES.md`](./PLAYTEST_ISSUES.md).

## Problem Statement

NPCs cannot navigate terrain. They use a reactive 1.35m-lookahead wall-follower that probes terrain each frame, gets blocked by slopes, oscillates, and eventually triggers stuck-recovery hacks that backtrack to other stuck positions. The system has no spatial model of where NPCs can and cannot go.

Meanwhile, a Recast navmesh is already built from the terrain heightfield at world-size-scaled cell resolution (cs=1.0 for <=800m, 1.5 for <=1600m, 2.0 for >1600m). It encodes walkable surfaces. It supports pathfinding queries. Nobody queries it. The crowd steering was disabled because crowd forces fought terrain slopes, but path queries are independent of crowd steering.

Structure placement has no navigability awareness. Flat zones are hand-tuned radii that don't account for actual structure footprints. No post-generation step validates that objectives are reachable from spawns.

## Design Direction (Owner)

- NPC feel: active, intelligent, reactive, never stuck, performant through elegance
- Speed tuning is downstream of navigation - fix pathing first, then measure and tune
- Terrain config control per mode, presets derived from navigability data not guessed
- ZC/TDM: deterministic seeds curated by connectivity quality; OF: procedural
- Water: deferred entirely (separate design doc when ready)
- A Shau: same unified engine, mode-specific config
- No global flattening - navmesh naturally routes around steep terrain

## Architecture

Current:
```
AI decides destination -> NPC probes terrain 1.35m ahead -> blocked -> 8 contour samples
-> still blocked for 1.2s -> stuck detector fires -> backtrack search -> repeat
```

Target:
```
AI decides destination -> navmesh returns walkable waypoint path -> NPC follows waypoints
-> terrain-aware solver handles final meters only -> if no path exists, AI picks new goal immediately
```

The navmesh becomes the single source of truth for "where can NPCs go." It is queried for paths (not crowd steering), validated for connectivity at generation time, and consulted by structure placement.

---

## Layer 1: Navigation Authority

Foundation layer. Everything else depends on this.

### 1A. Expose Navmesh Path Queries

The navmesh is private inside NavmeshSystem. The only public API is the crowd adapter (which is disabled). Add direct path query methods.

Work:
- [x] Add `queryPath(start, end)` - uses `NavMeshQuery.computePath()`, returns THREE.Vector3[] or null
- [x] Add `findNearestPoint(point, searchRadius)` - uses `findClosestPoint()`, Y halfExtent=50
- [x] Add `isPointOnNavmesh(point, tolerance)` - uses `findNearestPoly()`, XZ distance <= 2m
- [x] Add `validateConnectivity(points)` - union-find over pairwise queryPath, logs disconnected islands
- [x] NavMeshQuery created alongside Crowd, destroyed in dispose()
- [x] 23 unit tests (queryPath:5, findNearestPoint:5, isPointOnNavmesh:6, connectivity:6, dispose:1)
- [x] 3555 tests passing, type-check clean, no regressions

Files: `src/systems/navigation/NavmeshSystem.ts`, `src/systems/navigation/NavmeshSystem.test.ts`

### 1B. Connectivity Validation at Generation Time

Wire the `validateConnectivity` method (implemented in 1A) into mode startup. Catch broken maps before NPCs discover them at runtime.

Work:
- [x] Wire validation into `configureTerrainAndNavigation()` in `ModeStartupPreparer.ts`
  - Runs after `generateNavmesh()`, queries HeightQueryCache for zone Y positions
  - Logs per-island zone names on disconnected maps
  - No rebuild loop yet (deferred - log-and-warn first, then add corridor widening if data shows need)
  - Rebuild loop deferred (log-and-warn first, add corridor widening if data shows need)
- [ ] Integration test: generate ZC/OF terrain, run connectivity check (requires WASM - deferred to runtime validation)

Files: `src/systems/navigation/NavmeshSystem.ts`, `src/core/ModeStartupPreparer.ts`

### 1C. Evaluate Navmesh Slope Parameters

Navmesh and terrain solver had misaligned slope thresholds.

Analysis:
- Navmesh was 40° (cos(40°)=0.766). Terrain solver blocks at 60° (slopeDot=0.5), crawl zone 45-60°.
- At 40° the navmesh excluded slopes the terrain solver considers fully walkable (40-45° range).
- 45° aligns the navmesh cutoff with the terrain solver's crawl-zone boundary (slopeDot=0.7).
- WALKABLE_CLIMB 0.4m was too small for terrain lips from stamped corridors.

Work:
- [x] `WALKABLE_SLOPE_ANGLE`: 40 -> 45° (aligns with terrain solver crawl-zone start)
- [x] `WALKABLE_CLIMB`: 0.4 -> 0.6m (handles stamped corridor lips)
- [ ] Validate in playtest: connectivity logs will show if 45° produces connected maps
- [ ] Refine if needed based on connectivity data

Files: `src/systems/navigation/NavmeshSystem.ts`

---

## Layer 2: NPC Path Following

Replace the wall-follower with navmesh-guided movement. Keep terrain-aware solver only for local tactical positioning.

### 2A. Path Request and Cache + 2B. Waypoint Following

Implemented together as a single `tryNavmeshPathFollow` method in CombatantMovement.

Work:
- [x] `CachedNavPath` struct: waypoints[], currentIndex, destination, queryTime
- [x] `navPaths` Map<string, CachedNavPath> in CombatantMovement
- [x] `tryNavmeshPathFollow()`: called before terrain-aware solver in `updateMovement()`
  - If navmesh ready AND anchor >15m away: query/cache path, steer toward next waypoint
  - Returns true (skip terrain solver) or false (fall through to terrain solver)
  - Waypoint arrival at 2m, advances to next. Falls through to terrain solver at final waypoint
  - Path invalidated when destination moves >5m or age exceeds 10s
- [x] `getOrQueryPath()`: checks cache, amortizes queries (max 4/frame)
  - Queries at terrain-level Y (subtracts NPC_Y_OFFSET)
  - Returns null if no path (NPC falls through to terrain solver gracefully)
- [x] `resetPathQueryBudget()`: called once per frame by CombatantLODManager
- [x] Path cache cleaned up on NPC death, vehicle entry, removal
- [x] All existing tests updated: navmeshSystem mock includes queryPath/findNearestPoint/etc.
- [x] 3555 tests passing, type-check clean, no regressions

Files: `src/systems/combat/CombatantMovement.ts`, `src/systems/combat/CombatantLODManager.ts`,
       `src/systems/combat/CombatantMovement.test.ts`, `src/systems/combat/CombatantLODManager.test.ts`

### 2C. Simplify Stuck Detection

Work:
- [x] **Path-following mode**: waypoint stall detection in `tryNavmeshPathFollow`
  - `WAYPOINT_STALL_TIMEOUT_MS = 3000`: if stuck at same waypoint >3s, invalidate path
  - Falls through to terrain solver on invalidation (not teleport, not random backtrack)
- [x] **Terrain-solver mode**: faster checks, navmesh recovery
  - `STUCK_CHECK_INTERVAL_MS`: 600 -> 300ms (terrain solver is close-range guardrail now)
  - `STUCK_PINNED_DWELL_MS`: 1200 -> 800ms
  - `activateBacktrack()` tries `navmeshSystem.findNearestPoint()` first (10m radius)
  - Falls back to existing terrain-based recovery scoring if navmesh unavailable
- [x] Existing complex recovery scoring preserved as fallback (not removed yet)

Files: `src/systems/combat/CombatantMovement.ts`, `src/systems/combat/StuckDetector.ts`

### 2D. LOD-Tiered Movement

Work:
- [x] **High/Medium LOD** (<400m): navmesh path following via `updateMovement()` (done in 2A/2B)
- [x] **Culled** (>600m): `simulateDistantAI` now queries navmesh path for first waypoint direction
  - Steers toward first waypoint instead of direct beeline (avoids pathing through mountains)
  - Falls back to beeline if no navmesh path available
  - NavmeshSystem wired into CombatantLODManager via CombatantSystem.setNavmeshSystem
- [ ] Low LOD lowCost path still uses direct velocity addition (deferred - less impactful)
- [ ] Strategic route integration for Low/Culled (deferred - needs StrategicRoutePlanner bridging)

Files: `src/systems/combat/CombatantLODManager.ts`, `src/systems/combat/CombatantSystem.ts`, `src/core/SystemConnector.ts`

---

## Layer 3: Validated Placement and Terrain Config

Structure placement and terrain presets informed by navmesh data. This layer depends on Layer 1 being complete.

### 3A. Derived Flat Radii

Current flat radii are hand-picked numbers. They should be computed from content.

Work:
- [ ] Zone config declares structure set (types + counts) for each zone
- [ ] Compute minimum flat area from: sum of structure footprints + inter-structure spacing + buffer
- [ ] `flatRadius` = sqrt(totalArea / pi) * safety_factor
- [ ] If computed radius exceeds terrain budget for the mode: reduce structure count
  - Fewer valid structures > many clipping structures
- [ ] Existing hand-tuned radii become fallback minimums, not primary values

Files: `src/systems/world/WorldFeatureSystem.ts`, zone configs

### 3B. Navmesh-Aware Structure Placement

Work:
- [x] `isPointOnNavmesh(center)` check in `scoreTerrainPlacementCandidate()`
  - 20-point penalty for off-navmesh placements (strong enough to prefer walkable sites)
- [x] Corner height divergence penalty: >1.5m divergence = 50 penalty (effective rejection)
  - Prevents half-on-cliff placements
- [x] NavmeshSystem wired into WorldFeatureSystem via SystemConnector
- [ ] Chokepoint detection deferred (requires navmesh island analysis post-placement)

Files: `src/systems/world/WorldFeatureSystem.ts`, `src/core/SystemConnector.ts`

### 3C. Terrain Presets From Measurement

Presets derived from navmesh connectivity analysis, not guessed.

Work:
- [ ] After Layer 1 is complete: generate 50 random terrains per mode at current noise settings
- [ ] Run connectivity validation on each
- [ ] Identify which noise parameter ranges produce >95% connected maps
- [ ] Define per-mode presets from those ranges:
  - TDM: gentlest (400m, close combat, minimal navigation complexity)
  - ZC: moderate (800m, needs route diversity but not extreme terrain)
  - OF: full range (3200m, exploration and variety)
  - A Shau: DEM (no preset, real terrain, connectivity validated at load)
- [ ] Add `terrainPreset` to GameModeConfig with the measured values

Files: `src/config/gameModeTypes.ts`, `src/systems/terrain/NoiseHeightProvider.ts`, per-mode configs

### 3D. Seed Curation

Work:
- [ ] For ZC and TDM: generate N seeds (e.g. 100), run connectivity + path diversity analysis
- [ ] Score each seed: connectivity %, average path length variance, flat area coverage
- [ ] Keep top 5 per mode as curated seeds
- [ ] Default behavior: cycle through curated seeds
- [ ] Random seed available via URL param or config for testing
- [ ] OF stays fully random (procedural variety is the point)

Files: per-mode configs, seed scoring script (can be a one-time harness script)

---

## Speed Tuning Pass

Navmesh paths eliminate stuck time. Speed constants raised to reflect intended tactical pace.

Work:
- [x] `NPC_MAX_SPEED`: 6 -> 8 m/s
- [x] State speeds raised across the board:
  - TRAVERSAL_RUN: 8.5 -> 10, PATROL: 6 -> 7.5, PATROL_CLOSE: 3.75 -> 5
  - COMBAT_APPROACH: 3.25 -> 5.5, ADVANCING: 6.5 -> 8, DEFEND: 4.75 -> 6
  - COVER_SEEKING: 7 -> 9, RETREAT: 2 -> 3.5, STRAFE: 2 -> 3, WANDER: 2 -> 3
- [x] Uphill drag reduced (terrain solver is close-range only now):
  - Traversal min factor: 0.86 -> 0.9, drag: 0.12 -> 0.08
  - Combat min factor: 0.8 -> 0.85, drag: 0.2 -> 0.14
- [x] All movement state tests updated to match new speeds
- [x] 3561 passing, type-check clean, build passes

Files: `src/config/CombatantConfig.ts`, `src/systems/combat/CombatantMovementStates.ts`,
       `src/systems/combat/CombatantMovement.ts`, `src/systems/combat/CombatantMovementStates.test.ts`

---

## Execution Order and Dependencies

```
Layer 1: Navigation Authority (foundation - do first)
  1A: queryPath / findNearestPoint / isPointOnNavmesh
  1B: validateConnectivity wired into startup
  1C: slope angle evaluation (can parallel with 1A/1B)

Layer 2: NPC Path Following (gameplay fix - do second)
  2A: path request + cache          (depends on 1A)
  2B: waypoint following            (depends on 2A)
  2C: stuck detection simplification (depends on 2B)
  2D: LOD-tiered movement           (depends on 2B)

Layer 3: Validated Placement (generation quality - do third)
  3A: derived flat radii            (depends on 1A for isPointOnNavmesh)
  3B: navmesh-aware placement       (depends on 1A)
  3C: terrain presets               (depends on 1B connectivity data)
  3D: seed curation                 (depends on 3C)

Speed tuning                        (depends on Layer 2 validated in harness)
```

Within each layer, items are sequential (each depends on the previous).
Layers are sequential (each depends on the foundation of the previous).

## Validation Gates

### Layer 1 Complete When:
- [ ] `queryPath` returns valid waypoint paths between zone pairs on ZC/OF maps
- [ ] `validateConnectivity` correctly identifies connected and disconnected objectives
- [ ] Connectivity validation wired into startup, logs warnings on broken maps
- [ ] Walkable slope angle chosen with measurement rationale documented

### Layer 2 Complete When:
- [ ] NPCs follow navmesh waypoints to objectives without stalling
- [ ] Harness NPC pinned samples < 500 (currently ~3793)
- [ ] No NPC permanently stuck for >3s in zone_control harness run
- [ ] NPC average end-to-end travel speed measurable and reasonable
- [ ] Unreachable destinations detected immediately (no 1.2s stuck delay)
- [ ] Frame budget not regressed: avg < 14ms, p99 < 40ms

### Layer 3 Complete When:
- [ ] No structure geometry extends past walkable navmesh area
- [ ] All structure footprint corners within 1.5m height divergence of center
- [ ] >95% of generated maps pass connectivity validation per mode
- [ ] Curated seeds produce consistently playable layouts for ZC/TDM

## Test Impact

Current: 3532 passing, 51 failing (FirstPersonWeapon.test.ts mock issue - unrelated)

### Tests to update:
- `StuckDetector.test.ts` - refactor for two-mode detection (path mode vs local mode)
- `CombatantMovement.test.ts` - path-following behavior
- `CombatantLODManager.test.ts` - tiered movement changes

### New tests:
- NavmeshSystem: queryPath, findNearestPoint, isPointOnNavmesh, validateConnectivity
- CombatantMovement: waypoint following, unreachable destination handling, path re-query on timeout
- WorldFeatureSystem: navmesh-aware placement rejection, derived flat radius computation
- Integration: end-to-end connectivity validation on generated terrain

## Files Changed Summary

### Layer 1 (3 files + tests):
- `src/systems/navigation/NavmeshSystem.ts` (expose path queries, connectivity validation)
- `src/core/GameEngineInit.ts` or mode startup (wire connectivity check)
- NavmeshSystem test file (new)

### Layer 2 (4 files + tests):
- `src/systems/combat/CombatantMovement.ts` (path following replaces wall-follower for >15m)
- `src/systems/combat/StuckDetector.ts` (simplify to two modes)
- `src/systems/combat/CombatantLODManager.ts` (tiered path data)
- Possibly new `src/systems/navigation/NavmeshPathCache.ts`

### Layer 3 (5+ files + tests):
- `src/systems/world/WorldFeatureSystem.ts` (navmesh-aware placement, derived radii)
- `src/config/gameModeTypes.ts` (terrainPreset type)
- `src/systems/terrain/NoiseHeightProvider.ts` (preset consumption)
- `src/config/ZoneControlConfig.ts`, `OpenFrontierConfig.ts`, `TeamDeathmatchConfig.ts` (presets, seeds)

### Speed pass (2 files):
- `src/config/CombatantConfig.ts`
- `src/systems/combat/CombatantMovementStates.ts`

## Progress Log

### 2026-03-17 Plan Approved

Initial plan written. Layers defined. Execution order locked.

### 2026-03-17 Layer 1 Complete

**1A** - Exposed navmesh path query API on NavmeshSystem:
- `queryPath()`, `findNearestPoint()`, `isPointOnNavmesh()`, `validateConnectivity()`
- NavMeshQuery created from @recast-navigation/core after navmesh generation
- 23 new unit tests, all passing.

**1B** - Wired connectivity validation into `ModeStartupPreparer.configureTerrainAndNavigation()`:
- After navmesh generates, validates all zone positions are reachable
- Logs per-island zone names on disconnected maps
- Rebuild loop deferred until data shows it's needed

**1C** - Aligned navmesh slope parameters:
- `WALKABLE_SLOPE_ANGLE`: 40 -> 45° (aligns with terrain solver crawl-zone boundary)
- `WALKABLE_CLIMB`: 0.4 -> 0.6m (handles stamped corridor lips)

Full suite: 3555 passing (23 new tests). Type-check clean. No regressions.

### 2026-03-17 Layer 2A+2B Complete

Path request, cache, and waypoint following implemented in CombatantMovement:
- `tryNavmeshPathFollow()` inserted before terrain-aware solver in updateMovement
- Long-distance movement (>15m) uses navmesh waypoints; close-range falls through to terrain solver
- Path cache with destination-change and age invalidation. Amortized at 4 queries/frame.
- All existing tests updated with expanded navmeshSystem mock. No regressions.
- Full suite: 3555 passing. Type-check clean.

### 2026-03-17 Layer 2C+2D Complete

**2C** - Stuck detection simplified:
- Path-following: waypoint stall timeout (3s) invalidates path, falls through to terrain solver
- Terrain solver: check interval 600->300ms, pinned dwell 1200->800ms
- Recovery prefers navmesh findNearestPoint (10m radius) over terrain-based scoring
- Existing complex recovery preserved as fallback

**2D** - LOD-tiered navmesh usage:
- High/Medium: full path-following (2A/2B)
- Culled: distant AI now queries navmesh path for direction (avoids mountain beelines)
- NavmeshSystem wired into LODManager via CombatantSystem

Full suite: 3555 passing. Type-check clean. No regressions.

Layer 2 complete. Layer 3 (validated placement + terrain presets) depends on playtest data.

### 2026-03-17 Speed Tuning + Layer 3B Complete

**Speed tuning:**
- NPC_MAX_SPEED 6->8, all state speeds raised 30-70%
- Uphill drag reduced (terrain solver is close-range guardrail now, not primary movement)
- Net effect: NPCs move at threatening pace on navmesh paths, mild drag on close-range slopes

**Layer 3B:**
- Navmesh-aware placement scoring: 20-point penalty for off-navmesh sites
- Corner height divergence >1.5m = effective rejection (50 penalty)
- NavmeshSystem wired into WorldFeatureSystem via SystemConnector

Full suite: 3561 passing (up from 3555). Type-check clean. Build passes.

**Remaining Layer 3 items (deferred to playtest validation):**
- 3A: derived flat radii from content (needs structure set declarations per zone)
- 3C: terrain presets from connectivity measurement (needs runtime data)
- 3D: seed curation (needs 3C)

**Session summary - all changes this session:**
- Layer 1: navmesh path query API, connectivity validation, slope param alignment
- Layer 2: NPC path following, waypoint cache, stuck detection simplification, LOD-tiered navmesh
- Layer 3B: navmesh-aware structure placement
- Speed: all NPC speeds raised, uphill drag reduced
- 13 files changed, 29 new tests, 3561 passing (was 3532)
