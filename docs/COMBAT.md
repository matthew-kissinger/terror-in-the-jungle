# Combat Subsystem

Last updated: 2026-04-24

This document is the authoritative architecture reference for the combat
subsystem (`src/systems/combat/`). Combat is the hot loop: AI decisions,
targeting, damage resolution, cover/suppression, kill attribution, squad
behavior, and spatial indexing all live here. When performance or AI feel
regresses, it regresses here first.

Read this before touching anything under `src/systems/combat/`. Read
`docs/TESTING.md` before writing combat tests.

## Responsibilities

Combat owns:

- NPC combatant state: position, health, faction, weapon, squad membership,
  LOD bucket, and per-combatant AI scratch (`src/systems/combat/types.ts`).
- NPC AI: state machine, targeting, LOS, cover evaluation, flanking
  coordination, suppression effects (`CombatantAI`, `ai/*`).
- Damage resolution: hit detection, damage application, death animation,
  kill-feed attribution, assists, squad/ticket/HUD side-effects
  (`CombatantCombat`, `CombatantDamage`, `KillAssistTracker`).
- Spawning: initial force seeding, reinforcement waves, respawn
  (`CombatantSpawnManager`, `CombatantFactory`, `RespawnManager`,
  `SpawnPositionCalculator`).
- Squad coordination: squad membership, formation, player-squad commands
  (`SquadManager`, `PlayerSquadController`, `CommandInputManager`,
  `SquadCommandPresentation`).
- Spatial indexing: combatant spatial queries used by combat and by other
  systems (`SpatialGridManager`, `SpatialOctree`, `ClusterManager`,
  `InfluenceMapSystem`).
- Line-of-sight acceleration: a shared BVH used for ray vs. terrain checks
  (`LOSAccelerator`).
- Rally points: player-commanded regroup markers (`RallyPointSystem`).

Combat does **not** own:

- Player firing / weapons (`src/systems/weapons/`, `src/systems/player/weapon/`).
  Player shots enter combat only through `CombatantSystem.handlePlayerShot`.
- Projectiles or explosions (`GrenadeSystem`, `MortarSystem`). Those call
  `CombatantSystem.applyExplosionDamage` when they resolve.
- Terrain, navmesh, audio, HUD rendering. Combat consumes these through
  setter injection; it does not reach into them directly beyond the
  documented interfaces.
- Strategy-layer combat (`src/systems/strategy/AbstractCombatResolver`).
  Strategic agents are materialized into combat via
  `CombatantSystem.materializeAgent` / `dematerializeAgent`.

## Public Surface

Other systems interact with combat through a deliberately small set of
entry points. If you are adding a new cross-subsystem call, add it here
first.

### Primary entry point

- `CombatantSystem` (concrete class, `src/systems/combat/CombatantSystem.ts`).
  - `update(dt)` — called once per frame by `SystemUpdater` inside the
    `combat` tracked group (5ms budget).
  - `handlePlayerShot(ray, damageCalculator, weaponType)` — sole path for
    player weapons to damage NPCs. Post-B1, internally wraps the player in
    `_playerAttackerProxy` so downstream damage code (assist tracking,
    death direction, kill-feed attribution) sees a stable attacker
    identity without the player being a full `Combatant`.
  - `applyExplosionDamage(center, radius, maxDamage, attackerId, weaponType)`
    — entry point for grenade/mortar/napalm damage. Delegates to
    `CombatantSystemDamage.applyExplosionDamage`.
  - `checkPlayerHit(ray)` / `resolvePlayerAimPoint(ray)` — hit probes used
    by the FPS weapon preview and by NPC fire that can hit the player.
  - `materializeAgent(data)` / `dematerializeAgent(id)` — `WarSimulator`
    bridge. Abstract strategic agents become full combatants inside the
    active radius and collapse back to abstract state outside it.
  - Accessors: `getAllCombatants()`, `getCombatStats()`,
    `getTeamKillStats()`, `getCombatantLiveness(id)`,
    `querySpatialRadius(center, radius)`.
  - Lifecycle: `configureDependencies(deps)` (composer-wired), plus the
    grouped setter constellation (`setTerrainSystem`, `setTicketSystem`,
    `setZoneManager`, `setGameModeManager`, `setHUDSystem`,
    `setAudioManager`, `setPlayerFaction`, `setPlayerSuppressionSystem`,
    `setNavmeshSystem`, `setMaxCombatants`, `setSquadSizes`,
    `setReinforcementInterval`, `setAutonomousSpawningEnabled`,
    `clearCombatantsForExternalPopulation`, `setSpatialBounds`,
    `enableCombat`).
  - Public module refs (exposed for external wiring, not for reach-in
    logic): `combatantAI`, `combatantCombat`, `combatantRenderer`,
    `squadManager`, `impactEffectsPool`, `explosionEffectsPool`,
    optional `influenceMap`, optional `sandbagSystem`.

### Supporting exports that cross the boundary

These are legitimately used by other subsystems; they should remain stable
or be renamed with caller updates in the same PR.

- `types.ts` exports (widely imported):
  - Enums: `Faction`, `Alliance`, `CombatantState`, `SquadCommand`, `GrenadeType`.
  - Interfaces: `Combatant`, `Squad`, `ITargetable`, `AISkillProfile`.
  - Alliance helpers: `getAlliance`, `getEnemyAlliance`, `isAlly`,
    `isBlufor`, `isOpfor`.
  - Target helpers: `isPlayerTarget`, `isTargetAlive`.
- `spatialGridManager` (singleton, `SpatialGridManager.ts`) — used by
  `ZoneManager`, `GameScenario`, and the bootstrap wire-up. Resets its
  frame telemetry from `SystemUpdater`.
- `LOSAccelerator` — used by `TerrainSystem` / `TerrainQueries` for ray vs.
  terrain BVH. It lives in combat because the LOS budget is combat-scoped,
  but terrain code instantiates one.
- `InfluenceMapSystem` — consumed by `WarSimulator` and the world-runtime
  composers for objective scoring.
- `RallyPointSystem` — owned by combat, wired into `PlayerController`.
  Referenced as a type in the fenced `IPlayerController` interface
  (`src/types/SystemInterfaces.ts`).
- `PlayerSquadController`, `CommandInputManager` — owned by combat, wired
  into `PlayerController` for player-as-squad-leader controls.
- `CombatHitResult` (type, `CombatantCombat.ts`) — consumed by
  `WeaponShotExecutor` to branch on hit/kill/headshot outcomes.
- `CombatantFactory`, `SquadManager`, `RespawnManager` — consumed by
  `GameScenario` (integration test harness) for direct combatant
  construction.
- `SquadCommandPresentation` — consumed by `CommandModeOverlay` (HUD).

### Callees (what combat reaches out to)

Dependencies are injected via setters and held as optional references so
combat can run in test environments without a full system wiring.

- Terrain: `ITerrainRuntime` (fenced). Height sampling, slope, normal,
  raycast for NPC movement / line-of-fire / death effects.
- Navmesh: `NavmeshSystem`, via `NavmeshMovementAdapter`. Optional — if
  absent, combat falls back to direct-push movement.
- Zone / world state: `ZoneManager`, `TicketSystem`, `GameModeManager`.
  Used for objective assignment, capture/defense scoring, ticket drain,
  map sizing.
- Effects: `TracerPool`, `MuzzleFlashSystem`, `ImpactEffectsPool`,
  `ExplosionEffectsPool`, `CameraShakeSystem`, `SmokeCloudSystem`.
  Owned-by-combat pools are constructed locally; others are injected.
- Audio: `AudioManager` (fenced-ish — consumed through `IAudioManager`
  widely, though combat imports the concrete class for historical
  reasons).
- UI: `IHUDSystem` (fenced). Kill-feed, damage numbers, scoreboard counts.
- Player: `PlayerHealthSystem`, `PlayerSuppressionSystem`. Combat fires
  call into player when the player is the target; suppression events
  flow player-ward for screen shake / audio.
- Weapons: `SandbagSystem` (cover lookups).
- Assets / rendering: `CombatantRenderer`, Pixel Forge close GLBs, Pixel Forge
  animated impostors, `GlobalBillboardSystem`, and `AssetLoader`.
- Event bus: `GameEventBus` for cross-subsystem signals
  (`npc_killed`, `player_kill`, etc.).

## Actor Height Contract

`Combatant.position` and player position are both eye-level actor anchors. NPCs
spawn and move at `terrain + NPC_Y_OFFSET`, where `NPC_Y_OFFSET` matches
`PLAYER_EYE_HEIGHT` (`2.2m` as of 2026-04-24). Navmesh and terrain queries may
subtract that offset to sample the ground, but combat logic must not add a
second generic "soldier height" on top of the actor anchor.

Shared vertical facts live in `src/config/CombatantConfig.ts`, and combat code
must derive muzzle, center-mass, eye/LOS, hit-zone, tracer, and death-effect
positions through `src/systems/combat/CombatantBodyMetrics.ts` or the constants
it wraps. Do not reintroduce local `+1.5`, `+1.7`, `+1.2`, or player-target
`-0.6` magic offsets in ballistics, effects, LOS, cover, or hit detection.

This contract fixes the 2026-04-24 playtest symptom where NPCs visually fired
above the player and the player felt short relative to nearby combatants. If
future playtest still says NPCs look too large, treat that as a billboard/asset
scale or imposter-art problem, not as permission to stack hidden aiming offsets.

The billboard container is part of this contract. `CombatantMeshFactory` now
owns the Pixel Forge close-model target height and impostor visual height so
close GLBs and far impostors share one scale source. If future Pixel Forge
assets change transparent padding, model bounds, or the chosen 1.5x readability
scale, update the mesh sizing/offset tests and the art pipeline together.

## Player Hit Registration Contract

Player shots raycast against LOD-independent Pixel Forge hit proxies generated
by `CombatantBodyMetrics.writeCombatantHitProxies()` /
`writeCharacterHitProxies()`, not against skinned GLB triangles, impostor alpha
masks, or the old sprite-era fixed spheres. NPC shots against the player use
the same standing-character proxy contract, so player and NPC hit registration
share the same vertical proportions.

The live player damage path uses the original camera/crosshair ray with
`positionMode: 'visual'`, so `renderedPosition` is honored when the visual NPC
differs from the logical simulation position. The blue tracer path is visual
only: it starts from the projected first-person weapon muzzle/barrel
presentation point and converges to the camera/crosshair aim point. NPC-vs-NPC
raycasts continue to default to logical positions.

Debugging hooks:

- `?diag=1&hitboxes=1` draws the same shared proxies over nearby live NPCs.
- `?mode=gun-range` opens an isolated Pixel Forge GLB dev range that
  uses the production proxy helper and hit detection without terrain, AI,
  vegetation, impostor load, or combat120 load.

## NPC Locomotion Contract

As of 2026-04-24, infantry locomotion uses a real shared ceiling:
`NPC_MAX_SPEED = 6m/s`. Movement states may choose slower tactical speeds, but
they must not hide higher recovery speeds behind `Math.max(...)` expressions to
compensate for bad pathing. If pathing is bad, fix navmesh/terrain routing
instead of making soldiers sprint at or above the player's 10m/s walk budget.

Current movement shape:

- long route traversal caps at `NPC_MAX_SPEED`;
- advancing/flanking/cover movement stays below that cap;
- combat approach, retreat, strafe, defend, and player-squad command movement
  use lower tactical speeds;
- distant-culled strategic simulation uses smaller coarse steps than the visible
  solver and remains terrain-grounded after each step;
- high/medium LOD combatants clamp rendered Y near logical grounded Y so nearby
  NPCs do not hover while large terrain corrections ease in. Low/culled NPCs
  may still ease large upstream snaps because they are outside close visual
  judgment range.

Navigation is still a separate open issue. `NavmeshSystem` can load prebaked
seed assets and query paths, but `CombatantMovement` currently keeps long-range
route guidance disabled while validation continues. Do not treat lower speed
tuning as a substitute for re-enabling validated navmesh route following.

## Internal Layers

Combat has five internal layers. The layer boundaries are logical, not
folder-based — the folder is intentionally flat (~60 files) because
moving files would churn 75+ consumer imports without reducing actual
coupling. The `ai/` subfolder is the only current split.

### 1. Types / utility layer

- `types.ts` — `Combatant`, `Squad`, `Faction`, `CombatantState`,
  `SquadCommand`, `ITargetable`, plus alliance/target helpers.
- `SpatialGridManager`, `SpatialOctree`, `ClusterManager` — spatial
  indexing primitives.
- `LOSAccelerator` — shared BVH for terrain LOS.
- `KillAssistTracker` — pure damage-history bookkeeping.
- `StuckDetector` — movement stall escalation (post-B3 goal-anchor-aware).

Nothing in this layer should import from layers 2-5.

### 2. Spawn and lifecycle

- `CombatantFactory` — constructs a `Combatant` from `Faction`/position.
- `CombatantSpawnManager` — progressive spawns, reinforcement waves.
- `RespawnManager` — death-to-respawn bookkeeping.
- `SpawnPositionCalculator` — faction-aware spawn placement.
- `SquadManager` — squad creation, membership, objective propagation.

### 3. AI layer (`ai/` subfolder + orchestrator)

Combat is still **state-machine-first**. Each NPC has one of the
`CombatantState` values, and a per-state handler runs in
`CombatantAI.updateAI`. A small utility-scoring pre-pass now exists inside
`AIStateEngage` for opted-in factions, but it selects intents inside the
existing state-machine architecture rather than replacing it. The broader
doctrine question remains a Phase F candidate.

- `CombatantAI` — thin orchestrator. Dispatches on
  `combatant.state` and delegates to the appropriate handler. Also owns
  `applySquadCommandOverride` (see "Known Issues" below).
- `ai/AIStatePatrol`, `ai/AIStateEngage`, `ai/AIStateDefend`,
  `ai/AIStateMovement`, `ai/AIStateRetreat` — per-state handlers.
  `AIStateEngage` contains the bulk of the hot-path logic (target
  re-acquire, cover decision, suppression initiation, fire-rate control).
- `ai/AITargeting`, `ai/AITargetAcquisition` — who-to-shoot logic.
- `ai/AILineOfSight` — LOS cache and ray vs. combatant checks. Uses
  `LOSAccelerator` for terrain.
- `ai/AICoverSystem`, `ai/AICoverFinding`, `ai/AICoverEvaluation` —
  cover search and scoring. Budget-gated by `ai/CoverSearchBudget`.
- `ai/AIFlankingSystem`, `ai/FlankingRoleManager`,
  `ai/FlankingTacticsResolver` — squad-scale flanking coordination.
- `ai/RaycastBudget`, `ai/CombatFireRaycastBudget`,
  `ai/CoverSearchBudget` — per-frame caps that protect the 5ms combat
  budget.

### 4. Combat (damage) layer

- `CombatantCombat` — fire decisions, ballistics bookkeeping, player-shot
  entry point. Post-B1 owns the `_playerAttackerProxy` that lets player
  hits participate in the normal NPC damage pipeline without the player
  being a full `Combatant`.
- `CombatantBallistics`, `CombatantHitDetection` — ray/geometry resolution.
- `CombatantDamage` — damage application, death animation, kill-feed
  attribution, squad/ticket/HUD notifications. Post-B1 guards
  `attacker.kills++`, AI-on-AI kill feed, and `npc_killed` emissions
  behind `isPlayerTarget(attacker)` so the player proxy does not
  double-count.
- `CombatantSuppression` — suppression decay, near-miss tracking.
- `CombatantCombatEffects` — tracer/muzzle/impact effect spawn.
- `CombatantSystemDamage` — explosion-damage entry (grenades/mortars).

### 5. Movement, rendering, LOD

- `CombatantMovement`, `CombatantMovementStates`,
  `CombatantMovementCommands` — terrain-aware movement solver. Uses
  `StuckDetector` (post-B3 goal-anchor-aware) to escalate out of stall
  loops.
- `CombatantLODManager` — LOD bucketing (`high`/`medium`/`low`/`culled`)
  and per-bucket update cadence.
- `CombatantRenderer`, `CombatantMeshFactory`, `CombatantShaders` —
  billboard rendering.
- `CombatantProfiler` — per-frame timing breakdown exposed through
  `window.combatProfile()` in dev builds.

### 6. Squad command (player squad)

- `PlayerSquadController` — player-as-squad-leader input.
- `CommandInputManager` — tactical command input binding.
- `SquadCommandPresentation` — data shape for the HUD command overlay.
- `RallyPointSystem` — player-placed regroup markers.

## Perf Budget

Combat's tracked budget is **5ms/frame** (see `docs/ARCHITECTURE.md`
tick graph). Current status per `docs/PERFORMANCE.md`:

| Scenario | NPCs | Avg | p95 | p99 | Status |
|----------|-----:|----:|----:|----:|--------|
| combat120 | 120 | ~14.7ms | ~32.6ms | ~33.8ms | WARN |
| openfrontier:short | 120 | ~9.9ms | — | ~29.6ms | WARN |
| ashau:short | 60 | ~9ms | — | ~26ms | WARN |
| frontier30m | 120 | ~6.5ms | — | ~29ms | PASS* |

Frame-level budgets (`combat120` at 120 NPCs):
- avgFrameMs pass < 16ms, warn < 25ms.
- p99FrameMs pass < 30ms, warn < 50ms.

As of 2026-04-19, only `combat120` has a fresh local post-PR #96 capture.
The other scenario rows above remain the last accepted warm captures reflected
in [docs/PERFORMANCE.md](PERFORMANCE.md).

At 240 NPCs and above, combat avg frame is not baselined. The rule of
thumb is that AI update scales roughly linearly with count while LOS
cache hit rate drops, so expect more than 2x cost going 120 → 240.

Documented per-frame caps (do not exceed without re-baselining):
- Cover searches per frame: **6** (`ai/CoverSearchBudget`).
- LOS raycasts per frame: **capped**, see `ai/RaycastBudget`.
- Combat-fire raycasts per frame: **capped**, see
  `ai/CombatFireRaycastBudget`.
- `StuckDetector` backtrack retries: **4**, then escalates to `'hold'`.

## Known Issues / Deferred Work

These are deliberately not fixed in the D1 carveout. They are documented
here so future work can pick them up cleanly.

1. **Orphan `CombatantState.IDLE`.**
   `RETREATING` is now handled by `AIStateRetreat`, but `IDLE` still exists
   in `types.ts` mainly for fixtures / respawn edges and has no dedicated
   handler in `CombatantAI.updateAI`. NPCs left live in `IDLE` at tick time
   still fall through and do nothing. **Do not delete the enum value** —
   it is referenced by tests and may be intentionally reachable; flag it
   for Phase F.

2. **Duplicate squad-suppression paths.**
   `AIFlankingSystem` and the inline `AIStateEngage.initiateSquadSuppression`
   both mutate squadmate state under combat pressure, and
   `CombatantAI.applySquadCommandOverride` is a third AI-behavior mutation
   path. These evolved independently and now overlap. Candidate for
   consolidation when faction doctrine AI (D2) lands.

3. **Cover search cost dominates `combat120` p99.**
   Cover search is already budget-capped (6/frame), but per-search cost
   (sandbag iteration, vegetation grid, terrain probes) keeps p99 in the
   WARN range. Further work likely wants a cheaper candidate prefilter
   before full evaluation.

4. **NPC terrain stalling residue.**
   Post-B3 the `StuckDetector` correctly escalates after 4 failed
   backtracks, but the underlying movement solver still routes NPCs into
   unreachable slopes. The B3 fix prevents infinite loops, it does not
   prevent the stall itself.

5. **Mixed import patterns for `IAudioManager`.**
   Combat files import the concrete `AudioManager` rather than the
   fenced `IAudioManager` interface. This predates the interface fence
   and is not urgent, but a future cleanup pass should unify.

## Testing Guidance

Combat has ~35 test files under `src/systems/combat/**` after the A2
pruning pass. Follow the layering in `docs/TESTING.md`:

- **L1 (pure functions):** target-filter helpers, `isPlayerTarget`,
  `isTargetAlive`, alliance predicates, `KillAssistTracker` damage
  bookkeeping, `StuckDetector` state transitions. No Three.js scene,
  no systems.
- **L2 (single system, mocked deps):** `CombatantCombat`,
  `CombatantDamage`, `CombatantAI`, `AIStateEngage`, `AICoverFinding`,
  `SquadManager`. Mock the direct dependencies (terrain, audio, HUD)
  through the injected setter surface. Do not mock private methods.
- **L3 (small scenario):** `src/integration/scenarios/combat-flow.test.ts`,
  `squad-lifecycle.test.ts`. Wire real combat, terrain stub, HUD stub;
  assert outcomes like "A squad suppresses a B squad when in range".

What to **not** test in combat:
- Tuning constants (engagement range, suppression decay rate, fire
  accuracy). These are tuning, not contract.
- Exact `CombatantState` transition sequences. The state machine will
  keep evolving; assert observable outcomes ("target takes damage",
  "HUD kill feed fires", "combatant enters cover").
- Internal method names on the handler classes. Use
  `CombatantSystem.handlePlayerShot` and the effects it produces.

New combat tests should describe behavior in domain terms — *"a shot
combatant orients toward the threat"*, not *"lastKnownTargetPos is
stamped to attacker.position"*.

## Why No Folder Refactor in D1

The D1 brief allowed for folder restructure if internals were tangled.
After mapping imports:

- There are no circular imports between files within combat.
- `ai/` already isolates per-state handlers and per-frame budgets.
- The remaining flat layout has ~60 files but each file has a clear
  role — the mental model in this doc corresponds 1:1 to files.
- Moving files (e.g. `combat/damage/`, `combat/targeting/`,
  `combat/suppression/`) would churn imports in 75+ consumer files
  outside combat for no reduction in actual coupling.

This doc is the carveout: it names the layers and the public surface so
future changes have a map. Folder structure can be revisited if and
when layer boundaries produce real pain (e.g. new AI paradigm wants
isolated sub-folders for behavior trees).

## Why No Fenced Interface in D1

Consumers cross combat's boundary at one of three shapes:

1. `import type` of `CombatantSystem` for parameter typing. This is
   already reflected in the fenced `IHelicopterModel` and
   `IFirstPersonWeapon` surfaces (which take a `CombatantSystem`
   parameter); those are already fenced.
2. `import { ... }` of enums/helpers from `types.ts`. These are
   data-shape imports, not behavioral contracts.
3. `import { spatialGridManager }` / `import { LOSAccelerator }`
   singleton or class imports for spatial/LOS utility. These are
   cross-cutting infrastructure, not part of the combat behavioral
   contract.

No new interface earns its keep. Adding `ICombatantSystem` to
`src/types/SystemInterfaces.ts` would require committing to a surface
that is still evolving (materialization bridge, explosion damage,
player proxy) and would duplicate the concrete class without adding
enforcement. Per `docs/INTERFACE_FENCE.md`: *"A fence change is the
last resort."*

If combat's contract stabilizes after D2 (faction doctrine) and the
E-track rearchitecture decisions (Phase F), adding a fenced interface
becomes a clean follow-up — with explicit `[interface-change]` approval.
