# Combat Domain

> Self-contained reference for the Combat domain.
> Base URL: `https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src`

**5 GameSystem blocks. 46+ internal modules. 5ms tick budget (largest). Fan-in: 8 (third most depended-on).**

---

## Navigation

- [Blocks](#blocks)
- [Internal Module Registry](#internal-module-registry)
- [CombatantSystem.update() Flow](#combatantsystemupdate-flow)
- [Wiring](#wiring)
- [Spatial Query Flow](#spatial-query-flow)
- [LOD Tiers](#lod-tiers)
- [AI State Machine](#ai-state-machine)
- [Types](#types)
- [Raycast Budgets](#raycast-budgets)
- [Tests](#tests)
- [Related Domains](#related-domains)

---

## Blocks

| Block | File | Tick group | Budget | Fan-out | Fan-in |
|-------|------|-----------|--------|---------|--------|
| [CombatantSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantSystem.ts) | systems/combat/CombatantSystem.ts | Combat | 5ms | 9 | 8 |
| [InfluenceMapSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/InfluenceMapSystem.ts) | systems/combat/InfluenceMapSystem.ts | untracked (throttled 500ms) | - | 0 | 2 |
| [PlayerSquadController](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/PlayerSquadController.ts) | systems/combat/PlayerSquadController.ts | pre-tick explicit | - | 0 | 1 |
| [RallyPointSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/RallyPointSystem.ts) | systems/combat/RallyPointSystem.ts | untracked | - | 0 | 0 |
| [CommandInputManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CommandInputManager.ts) | systems/combat/CommandInputManager.ts | untracked | - | 0 | 0 |

---

## Internal Module Registry

### Orchestrator Core

| Class | File | Notes |
|-------|------|-------|
| [CombatantSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantSystem.ts) | systems/combat/CombatantSystem.ts | Central block; owns combatants Map; exposes materializeAgent / dematerializeAgent |
| [CombatantSystemDamage](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantSystemDamage.ts) | systems/combat/CombatantSystemDamage.ts | Explosion AoE delegation; uses KillAssistTracker |
| [CombatantSystemUpdate](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantSystemUpdate.ts) | systems/combat/CombatantSystemUpdate.ts | Squad objective reassignment (10s interval); player proxy helpers |
| [CombatantProfiler](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantProfiler.ts) | systems/combat/CombatantProfiler.ts | Per-frame timing breakdown; exposes window.combatProfile() |

### AI Subsystem (systems/combat/ai/)

| Class | File | Notes |
|-------|------|-------|
| [CombatantAI](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantAI.ts) | systems/combat/CombatantAI.ts | Thin state machine dispatcher; per-state timing; squad command overrides |
| [AIStatePatrol](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AIStatePatrol.ts) | systems/combat/ai/AIStatePatrol.ts | Wander + zone-aware patrolling; transitions to ALERT on enemy detection |
| [AIStateEngage](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AIStateEngage.ts) | systems/combat/ai/AIStateEngage.ts | ALERT/ENGAGING/SUPPRESSING states; wires CoverSystem + FlankingSystem |
| [AIStateDefend](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AIStateDefend.ts) | systems/combat/ai/AIStateDefend.ts | Zone defense; HOLD_POSITION command handling |
| [AIStateMovement](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AIStateMovement.ts) | systems/combat/ai/AIStateMovement.ts | ADVANCING/SEEKING_COVER movement; voice callout trigger |
| [AITargeting](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AITargeting.ts) | systems/combat/ai/AITargeting.ts | findNearestEnemy, shouldEngage, shouldSeekCover, isCoverFlanked |
| [AITargetAcquisition](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AITargetAcquisition.ts) | systems/combat/ai/AITargetAcquisition.ts | Spatial-grid-accelerated enemy discovery |
| [AILineOfSight](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AILineOfSight.ts) | systems/combat/ai/AILineOfSight.ts | LOS raycasting; 150ms result cache; smoke/sandbag awareness |
| [AICoverSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AICoverSystem.ts) | systems/combat/ai/AICoverSystem.ts | Cover evaluation orchestrator; occupation tracking; per-frame beginFrame() |
| [AICoverFinding](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AICoverFinding.ts) | systems/combat/ai/AICoverFinding.ts | Cover position search + evaluation |
| [AICoverEvaluation](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AICoverEvaluation.ts) | systems/combat/ai/AICoverEvaluation.ts | Score a candidate cover position (threat angle, distance, line of sight) |
| [AIFlankingSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/AIFlankingSystem.ts) | systems/combat/ai/AIFlankingSystem.ts | Flanking operation lifecycle; per-squad coordination |
| [FlankingRoleManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/FlankingRoleManager.ts) | systems/combat/ai/FlankingRoleManager.ts | Assigns SUPPRESS/FLANK roles to squad members |
| [FlankingTacticsResolver](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/FlankingTacticsResolver.ts) | systems/combat/ai/FlankingTacticsResolver.ts | Resolves tactic choice from operation context |
| [RaycastBudget](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/RaycastBudget.ts) | systems/combat/ai/RaycastBudget.ts | LOS raycast budget (default 8/frame); module-level counters; reset each frame |
| [CombatFireRaycastBudget](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/CombatFireRaycastBudget.ts) | systems/combat/ai/CombatFireRaycastBudget.ts | NPC fire validation budget (default 16/frame, adaptive 4-24 via intervalScale) |

### Spatial Subsystem

| Class / Export | File | Notes |
|----------------|------|-------|
| [spatialGridManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SpatialGridManager.ts) (singleton) | systems/combat/SpatialGridManager.ts | Single owner of octree; LOD-based sync; telemetry; exposes ISpatialQuery |
| [SpatialOctree](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SpatialOctree.ts) | systems/combat/SpatialOctree.ts | Implements ISpatialQuery; 12 entities/node, 6 max depth |
| [OctreeNode](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SpatialOctreeNode.ts) | systems/combat/SpatialOctreeNode.ts | Internal node type; exported as OctreeNode |
| [SpatialOctreeQueries](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SpatialOctreeQueries.ts) | systems/combat/SpatialOctreeQueries.ts | queryRadius, queryNearestK, queryRay implementations |

### Combat Resolution

| Class | File | Notes |
|-------|------|-------|
| [CombatantCombat](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantCombat.ts) | systems/combat/CombatantCombat.ts | NPC fire loop; player shot handler; max engagement range 280m |
| [CombatantBallistics](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantBallistics.ts) | systems/combat/CombatantBallistics.ts | Aim jitter, burst degradation, leading error |
| [CombatantHitDetection](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantHitDetection.ts) | systems/combat/CombatantHitDetection.ts | Cylinder hit detection; headshot zone |
| [CombatantDamage](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantDamage.ts) | systems/combat/CombatantDamage.ts | Damage application; death animation init (isDying flag) |
| [CombatantSuppression](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantSuppression.ts) | systems/combat/CombatantSuppression.ts | NPC suppression; near-miss counting |
| [CombatantCombatEffects](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantCombatEffects.ts) | systems/combat/CombatantCombatEffects.ts | Tracer / muzzle flash / impact spawning from fire loop |
| [KillAssistTracker](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/KillAssistTracker.ts) | systems/combat/KillAssistTracker.ts | Damage history attribution for kill credit |
| [LOSAccelerator](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/LOSAccelerator.ts) | systems/combat/LOSAccelerator.ts | Coarse terrain step sampler (TERRAIN_SAMPLE_STEP 1.25m) |

### NPC Lifecycle

| Class / Export | File | Notes |
|----------------|------|-------|
| [CombatantFactory](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantFactory.ts) | systems/combat/CombatantFactory.ts | createCombatant(); assigns AISkillProfile per faction |
| [CombatantSpawnManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantSpawnManager.ts) | systems/combat/CombatantSpawnManager.ts | Progressive spawn queue (1s delay, max 24 enqueued); reinforcement waves (15s default); tighter initial HQ staging offsets for base openings |
| [SpawnPositionCalculator](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SpawnPositionCalculator.ts) | systems/combat/SpawnPositionCalculator.ts | Zone-aware spawn position selection |
| [RespawnManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/RespawnManager.ts) | systems/combat/RespawnManager.ts | NPC respawn with rally-point-first fallback |
| [CombatantMovement](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantMovement.ts) | systems/combat/CombatantMovement.ts | Position integration; terrain grounding via HeightQueryCache; delegates to MovementStates; navmesh intercept (high/medium LOD use crowd-steered velocity, low/culled use beeline); slope speed penalty via SlopePhysics |
| [CombatantMovementStates](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantMovementStates.ts) | systems/combat/CombatantMovementStates.ts | updatePatrolMovement, updateCombatMovement, updateCoverSeekingMovement, updateDefendingMovement |
| [CombatantMovementCommands](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantMovementCommands.ts) | systems/combat/CombatantMovementCommands.ts | handlePlayerCommand, handleRejoiningMovement; uses ObjectPoolManager |
| [clusterManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ClusterManager.ts) (singleton) | systems/combat/ClusterManager.ts | Spacing forces (min 4m), target distribution, reaction stagger for clustered NPCs |

### Navigation (Navmesh)

| Class / Export | File | Notes |
|----------------|------|-------|
| [NavmeshSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/navigation/NavmeshSystem.ts) | systems/navigation/NavmeshSystem.ts | Top-level lifecycle: WASM init, solo/tiled navmesh generation, crowd simulation, tile streaming, structure obstacles |
| [NavmeshHeightfieldBuilder](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/navigation/NavmeshHeightfieldBuilder.ts) | systems/navigation/NavmeshHeightfieldBuilder.ts | Converts HeightQueryCache -> indexed BufferGeometry for Recast input |
| [NavmeshMovementAdapter](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/navigation/NavmeshMovementAdapter.ts) | systems/navigation/NavmeshMovementAdapter.ts | Bridges Recast Crowd with CombatantMovement; register/unregister agents; target debounce; XZ velocity override |
| [SlopePhysics](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/SlopePhysics.ts) | systems/terrain/SlopePhysics.ts | Pure-function slope utility: speed multiplier, walkability check, slide velocity, step-up gating |

### Rendering

| Class / Export | File | Notes |
|----------------|------|-------|
| [CombatantRenderer](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantRenderer.ts) | systems/combat/CombatantRenderer.ts | InstancedMesh billboard sprites; front/back/side via dot product (threshold 0.45); 400ms walk animation |
| [CombatantMeshFactory](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantMeshFactory.ts) | systems/combat/CombatantMeshFactory.ts | Creates InstancedMesh per faction+state; WalkFrameMap |
| [CombatantShaders](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantShaders.ts) | systems/combat/CombatantShaders.ts | Shader preset types; CombatantShaderSettingsManager; cel/rim/aura uniforms |

### Squads

| Class | File | Notes |
|-------|------|-------|
| [SquadManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SquadManager.ts) | systems/combat/SquadManager.ts | Squad CRUD; createSquad (wedge formation) now terrain-anchors squads and retracts unsafe edge positions before grounding; optional InfluenceMapSystem |
| [PlayerSquadController](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/PlayerSquadController.ts) | systems/combat/PlayerSquadController.ts | SquadCommand dispatch (Shift+1-5); radial menu; command indicator |

### LOD Manager

| Class | File | Notes |
|-------|------|-------|
| [CombatantLODManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantLODManager.ts) | systems/combat/CombatantLODManager.ts | Classifies combatants into 4 buckets per frame; drives update depth; adaptive budget |

### Influence Map

| Class | File | Notes |
|-------|------|-------|
| [InfluenceMapSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/InfluenceMapSystem.ts) | systems/combat/InfluenceMapSystem.ts | 64x64 grid; 500ms throttle; threat/opportunity/cover/squad scores; debug canvas overlay |
| [InfluenceMapGrid](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/InfluenceMapGrid.ts) | systems/combat/InfluenceMapGrid.ts | Grid init/reset; InfluenceCell type |
| [InfluenceMapComputations](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/InfluenceMapComputations.ts) | systems/combat/InfluenceMapComputations.ts | computeThreatLevel, computeOpportunityLevel, computeCoverValue, computeSquadSupport, computeCombinedScores |

### Effects (owned by CombatantSystem; live in systems/effects/)

| Class | File | Notes |
|-------|------|-------|
| [TracerPool](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/TracerPool.ts) | systems/effects/TracerPool.ts | Pool of 256 tracer line segments |
| [MuzzleFlashSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/MuzzleFlashSystem.ts) | systems/effects/MuzzleFlashSystem.ts | Pool of 64 muzzle flash sprites |
| [ImpactEffectsPool](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/ImpactEffectsPool.ts) | systems/effects/ImpactEffectsPool.ts | Pool of 128 impact particles |
| [ExplosionEffectsPool](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/ExplosionEffectsPool.ts) | systems/effects/ExplosionEffectsPool.ts | Pool of 16 explosion effects |

---

## CombatantSystem.update() Flow

```
camera.getWorldPosition(playerPosition)
lodManager.setPlayerPosition(playerPosition)
lodManager.updateFrameTiming(dt)           // FPS EMA -> intervalScale

if !combatEnabled || !ticketSystem.isGameActive():
  lodManager.updateCombatants(dt, {enableAI: false})
  combatantRenderer.updateWalkFrame + updateBillboards + updateShaderUniforms
  profiler.updateTiming(duration)
  return

updateHelpers.ensurePlayerProxy()

if autonomousSpawning:
  spawnManager.update(dt, combatEnabled, ticketSystem)

updateHelpers.updateSquadObjectives(dt)    // 10s interval, influence-map-driven

if influenceMap && zoneManager:
  influenceMap.setCombatants + setZones + setPlayerPosition + setSandbagBounds

lodManager.updateCombatants(dt)            // AI + movement + combat via LOD scheduling
  -> resetRaycastBudget() + resetCombatFireRaycastBudget()
  -> combatantAI.clearLOSCache() + beginFrame()
  -> updateDeathAnimations(dt)             // isDying -> DEAD -> remove from Map
  -> classify into HIGH / MEDIUM / LOW / CULLED buckets
  -> per-bucket: updateCombatantFull / Medium / Basic / VisualOnly / UltraLight

combatantRenderer.updateWalkFrame(dt)
combatantRenderer.updateBillboards(combatants, playerPosition)
combatantRenderer.updateShaderUniforms(dt)

tracerPool.update()
muzzleFlashSystem.update(dt)
impactEffectsPool.update(dt)

profiler.updateTiming(totalMs)
```

**updateCombatantFull** (HIGH tier, on its stagger turn):
```
combatantAI.updateAI(combatant, dt, playerPos, allCombatants, spatialGridManager)
combatantMovement.updateMovement(combatant, dt, squads, combatants)
combatantCombat.updateCombat(combatant, dt, playerPos, combatants, squads)
combatantRenderer.updateCombatantTexture(combatant)
combatantMovement.updateRotation(combatant, dt)
spatialGridManager.syncEntity(combatant.id, combatant.position)
```

---

## Wiring

### Receives (setter injection via CombatantSystem)

| Dep | Setter | Purpose |
|-----|--------|---------|
| [TerrainSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/TerrainSystem.ts) | setTerrainSystem | Terrain-effective height, LOS raycasting, grounded spawn/materialization queries |
| [TicketSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/TicketSystem.ts) | setTicketSystem | isGameActive() gate; death ticket deduction |
| [PlayerHealthSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/player/PlayerHealthSystem.ts) | setPlayerHealthSystem | Player damage from NPC fire |
| [ZoneManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/ZoneManager.ts) | setZoneManager | Zone-aware spawning; squad objectives; distant AI sim |
| [GameModeManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/GameModeManager.ts) | setGameModeManager | World size -> spatialGridManager.reinitialize; LOD scale |
| [HUDSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/ui/hud/HUDSystem.ts) | setHUDSystem | Kill feed; damage numbers |
| [AudioManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/AudioManager.ts) | setAudioManager | Weapon sounds |
| [PlayerSuppressionSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/player/PlayerSuppressionSystem.ts) | setPlayerSuppressionSystem | Player suppression from NPC near-miss fire |

### Depended on by (fan-in 8)

| Dependent | What it uses |
|-----------|-------------|
| FirstPersonWeapon | handlePlayerShot, applyExplosionDamage, getCombatants |
| FullMap | getAllCombatants for map dots |
| GrenadeSystem | applyExplosionDamage |
| HUDSystem | getCombatStats (kill feed) |
| Minimap | getAllCombatants for minimap dots |
| MortarSystem | applyExplosionDamage |
| WarSimulator | materializeAgent, dematerializeAgent, clearCombatantsForExternalPopulation |
| ZoneManager | querySpatialRadius (for zone occupancy) |

---

## Spatial Query Flow

```
spatialGridManager (singleton, SpatialGridManager)
  -> wraps SpatialOctree (12 entities/node, depth 6)
  -> initialized with worldSize on GameModeManager set
  -> reinitialized on mode change

Sync frequency (LOD-based, in syncAllPositions):
  <150m     every frame        (SyncFrequency.EVERY_FRAME)
  150-300m  every 2 frames     (SyncFrequency.EVERY_2_FRAMES)
  300-500m  every 5 frames     (SyncFrequency.EVERY_5_FRAMES)
  >500m     every 30 frames    (SyncFrequency.EVERY_30_FRAMES)

Per-combatant sync: spatialGridManager.syncEntity() called in recordSpatialUpdate()
Dead combatants: spatialGridManager.removeEntity() on death + at end of death animation

Query paths:
  CombatantCombat    -> closure set via combatantCombat.setSpatialQueryProvider()
  ZoneManager        -> CombatantSystem.querySpatialRadius() (public passthrough)
  AITargetAcquisition -> spatialGrid param injected by CombatantAI.updateAI()
```

---

## LOD Tiers

| Tier | Distance (desktop) | Distance (mobile/low) | Stagger | Budget gate | Update depth |
|------|--------------------|-----------------------|---------|------------|-------------|
| HIGH | < 200m | < 60m | every 3 frames | 20 full/frame (12 mobile) | AI + movement + combat + render + spatial |
| MEDIUM | 200-400m | 60-120m | every 5 frames | 24 full/frame (10 mobile) | AI + movement + combat + rotation + spatial |
| LOW | 400-600m | 120-250m | every 8 frames (large world) | dynamic interval | movement + rotation + spatial (lowCost path skips terrain) |
| CULLED | > 600m | > 250m | 12 frames (near); 45s sim (distant > 800m) | 1.5ms loop budget | distant: simulateDistantAI (zone-seeking step); near: basic movement |

**Budget override modes** (when 6ms AI budget exceeded):

| Mode | Condition | Behavior |
|------|-----------|----------|
| degraded | budget > 6ms | skip AI+combat; movement+render only |
| ultra-light | budget > 15ms (2.5x) | texture + rotation only; no movement/spatial |

**Adaptive scaling**: FPS EMA tracked; `intervalScale` stretches intervals up to 3x (4x mobile) below 30fps (45fps mobile). Fire raycast cap scales inversely: `max(4, min(24, 16/intervalScale))`.

---

## AI State Machine

```
CombatantAI.updateAI()
  applySquadCommandOverride()   // FOLLOW_ME/RETREAT interrupt combat; HOLD_POSITION -> DEFENDING
  decaySuppressionEffects()     // suppressionLevel -= 0.3/s; nearMissCount decay after 3s
  updateFlankingOperation()     // once per squad per frame

  switch combatant.state:
    PATROLLING  -> AIStatePatrol.handlePatrolling()
    ALERT       -> AIStateEngage.handleAlert()
    ENGAGING    -> AIStateEngage.handleEngaging()
    SUPPRESSING -> AIStateEngage.handleSuppressing()
    ADVANCING   -> AIStateMovement.handleAdvancing()
    SEEKING_COVER -> AIStateMovement.handleSeekingCover()
    DEFENDING   -> AIStateDefend.handleDefending()

  maybeTriggerMovementCallout() // 20% chance on ADVANCING/RETREATING state transition
```

**State transitions (typical combat arc)**:
```
PATROLLING -> ALERT (enemy spotted, canSeeTarget) -> ENGAGING -> SEEKING_COVER (health/suppression)
ENGAGING -> SUPPRESSING (squad suppression initiated)
ENGAGING -> ADVANCING (outnumber enemies, no cover available)
DEFENDING (from HOLD_POSITION command or zone assignment)
```

**Squad command -> state overrides**:

| Command | Interrupt combat? | Effect |
|---------|------------------|--------|
| FOLLOW_ME | Yes | Force PATROLLING; clear target |
| RETREAT | Yes | Force PATROLLING; clear target |
| HOLD_POSITION | No | Non-combat -> DEFENDING at commandPosition |
| PATROL_HERE | No | DEFENDING -> PATROLLING |
| FREE_ROAM | No | Clears command-driven DEFENDING |

---

## Types

File: [systems/combat/types.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/types.ts)

**Faction** (4 values):

| Value | Alliance |
|-------|---------|
| US | BLUFOR |
| ARVN | BLUFOR |
| NVA | OPFOR |
| VC | OPFOR |

**CombatantState** (10 values): IDLE, PATROLLING, ALERT, ENGAGING, SUPPRESSING, ADVANCING, RETREATING, SEEKING_COVER, DEFENDING, DEAD

**SquadCommand** (6 values): FOLLOW_ME, PATROL_HERE, RETREAT, HOLD_POSITION, FREE_ROAM, NONE

**Key Combatant fields**:

| Field | Type | Notes |
|-------|------|-------|
| id | string | Unique; used as spatial grid key |
| faction | Faction | Determines alliance via FACTION_ALLIANCE map |
| position / velocity | Vector3 | Mutable each frame |
| health / maxHealth | number | Death at health <= 0 |
| state | CombatantState | State machine current state |
| lodLevel | 'high'\|'medium'\|'low'\|'culled' | Set by LODManager each frame |
| skillProfile | AISkillProfile | reactionDelayMs, aimJitterAmplitude, visualRange, fieldOfView |
| isDying / deathProgress | boolean / number | Death animation (fall 0.7s + ground 6s + fade 2s) |
| squadId / squadRole | string / 'leader'\|'follower' | Optional squad membership |
| inCover / coverPosition | boolean / Vector3 | Cover state |
| suppressionLevel | number | Decays 0.3/s; affects accuracy |
| isPlayerProxy | boolean | Virtual combatant representing the player for AI targeting |
| flashDisorientedUntil | number | Timestamp when flashbang effect ends |

**Squad fields**: id, faction, members (string[]), leaderId, objective (Vector3), formation ('line'\|'wedge'\|'column'), isPlayerControlled, currentCommand, commandPosition

**GrenadeType**: FRAG, SMOKE, FLASHBANG

---

## Raycast Budgets

Two independent per-frame caps (module-level singletons, reset at start of each LOD update):

| Budget | File | Default cap | Adaptive cap | Purpose |
|--------|------|-------------|-------------|---------|
| LOS raycasts | [ai/RaycastBudget.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/RaycastBudget.ts) | 8/frame | static | Terrain LOS checks in AILineOfSight |
| Fire raycasts | [ai/CombatFireRaycastBudget.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ai/CombatFireRaycastBudget.ts) | 16/frame | 4-24 (16/intervalScale) | Terrain occlusion checks in NPC fire loop |

LOS results also cached for 150ms per combatant pair (AILineOfSight.losCache).

Profiling exposed via CombatantSystem.update() -> profiler:
- `profiler.profiling.raycastBudget` (LOS stats)
- `profiler.profiling.combatFireRaycastBudget` (fire stats)
- `profiler.profiling.losCache` (cache hit/miss/denial counts)

---

## Tests

| File | What it covers |
|------|---------------|
| [CombatantAI.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantAI.test.ts) | 40 behavioral tests for AI state transitions and squad command overrides |
| [CombatantBallistics.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantBallistics.test.ts) | Ballistics math |
| [CombatantCombat.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantCombat.test.ts) | Fire resolution |
| [CombatantDamage.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantDamage.test.ts) | Damage application and death |
| [CombatantHitDetection.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantHitDetection.test.ts) | Cylinder hit geometry |
| [CombatantLODManager.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantLODManager.test.ts) | LOD bucket classification |
| [CombatantMovementStates.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantMovementStates.test.ts) | Movement state functions |
| [CombatantRenderer.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantRenderer.test.ts) | Billboard direction and walk animation |
| [CombatantSpawnManager.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantSpawnManager.test.ts) | Spawn queue and reinforcement |
| [CombatantSuppression.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/CombatantSuppression.test.ts) | Suppression mechanics |
| [ClusterManager.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/ClusterManager.test.ts) | Spacing force calculation |
| [InfluenceMapSystem.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/InfluenceMapSystem.test.ts) | Influence map update and query |
| [InfluenceMapComputations.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/InfluenceMapComputations.test.ts) | Score computation functions |
| [InfluenceMapGrid.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/InfluenceMapGrid.test.ts) | Grid init/reset |
| [KillAssistTracker.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/KillAssistTracker.test.ts) | Damage attribution |
| [LOSAccelerator.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/LOSAccelerator.test.ts) | Terrain step sampler |
| [RallyPointSystem.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/RallyPointSystem.test.ts) | Rally point lifecycle |
| [RespawnManager.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/RespawnManager.test.ts) | NPC respawn logic |
| [SpawnPositionCalculator.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SpawnPositionCalculator.test.ts) | Spawn position selection |
| [SquadManager.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SquadManager.test.ts) | Squad CRUD |
| [SpatialGridManager.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SpatialGridManager.test.ts) | Spatial grid correctness |
| [SpatialOctree.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/combat/SpatialOctree.test.ts) | Octree query correctness |
| ai/AILineOfSight.test.ts | LOS cache behavior and budget gating |
| ai/AIStateEngage.test.ts | Engage state transitions |
| ai/AIStatePatrol.test.ts | Patrol wander and detection |
| ai/AIStateDefend.test.ts | Defend positioning |
| ai/AICoverSystem.test.ts | Cover occupation tracking |
| ai/AICoverFinding.test.ts | Cover search |
| ai/AIFlankingSystem.test.ts | Flanking operation lifecycle |
| ai/FlankingRoleManager.test.ts | Role assignment |
| **Integration** | |
| [combat-flow.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/integration/scenarios/combat-flow.test.ts) | End-to-end spawn, engage, kill, ticket deduction |
| [squad-lifecycle.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/integration/scenarios/squad-lifecycle.test.ts) | Squad creation, commands, dissolution |
| [zone-capture.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/integration/scenarios/zone-capture.test.ts) | Zone occupancy via spatial queries |

Run unit only: `npm run test:quick`. Run all: `npm run test:run`.

---

## Related Domains

| Domain | Relationship |
|--------|-------------|
| [CODEBASE_BLOCKS.md](../CODEBASE_BLOCKS.md) | Hub index linking all domains |
| [docs/blocks/strategy.md](strategy.md) | WarSimulator materializes SIMULATED/STRATEGIC agents into CombatantSystem via materializeAgent / dematerializeAgent |
| [docs/blocks/player.md](player.md) | PlayerHealthSystem receives player damage; PlayerSuppressionSystem receives suppression events from CombatantCombat |
| [docs/blocks/weapons.md](weapons.md) | GrenadeSystem and MortarSystem call applyExplosionDamage; SandbagSystem bounds passed to InfluenceMap and AILineOfSight |
| [docs/blocks/world.md](world.md) | ZoneManager calls querySpatialRadius for zone occupancy; CombatantSystem reads zone state for spawn and AI decisions |

---

*Last updated: 2026-03-02*
