# Combat Subsystem

Last updated: 2026-04-16 (D1 carveout pass)

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
- Assets / rendering: `GlobalBillboardSystem`, `AssetLoader` (NPC
  billboard sprites).
- Event bus: `GameEventBus` for cross-subsystem signals
  (`npc_killed`, `player_kill`, etc.).

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

Combat uses a **parameter-driven finite state machine**, not utility AI.
Each NPC has one of the `CombatantState` values, and a per-state handler
runs in `CombatantAI.updateAI`. The current doctrine lives in tuning
constants (engagement range, cover-seek thresholds, flanking triggers),
not in a data-driven decision tree. E3 research concluded this is the
right near-term paradigm; a utility-AI layer is a Phase F candidate.

- `CombatantAI` — thin orchestrator. Dispatches on
  `combatant.state` and delegates to the appropriate handler. Also owns
  `applySquadCommandOverride` (see "Known Issues" below).
- `ai/AIStatePatrol`, `ai/AIStateEngage`, `ai/AIStateDefend`,
  `ai/AIStateMovement` — per-state handlers. `AIStateEngage` contains the
  bulk of the hot-path logic (target re-acquire, cover decision,
  suppression initiation, fire-rate control).
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
| combat120 | 120 | ~16ms | ~32ms | ~34ms | WARN |
| openfrontier:short | 120 | ~9.9ms | — | ~29.6ms | WARN |
| ashau:short | 60 | ~9ms | — | ~26ms | WARN |
| frontier30m | 120 | ~6.5ms | — | ~29ms | PASS* |

Frame-level budgets (`combat120` at 120 NPCs):
- avgFrameMs pass < 16ms, warn < 25ms.
- p99FrameMs pass < 30ms, warn < 50ms.

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

1. **Orphan `CombatantState` values: `IDLE` and `RETREATING`.**
   Both enum values are declared in `types.ts` but have no matching case
   in `CombatantAI.updateAI`'s state switch. `IDLE` is used as an initial
   state in test fixtures and in `RespawnManager`, but NPCs in `IDLE` at
   tick time fall through the switch and do nothing.
   **Do not delete the enum values** — they are referenced by tests and
   may be intentionally reachable; flag them for Phase F.

2. **Duplicate squad-suppression paths.**
   `AIFlankingSystem` and the inline `AIStateEngage.initiateSquadSuppression`
   both mutate squadmate state under combat pressure, and
   `CombatantAI.applySquadCommandOverride` is a third AI-behavior mutation
   path. These evolved independently and now overlap. Candidate for
   consolidation when faction doctrine AI (D2) lands.

3. **`CombatantMeshFactory.maxInstances = 120`.**
   NPC billboards are allocated as `InstancedMesh` buckets of 120
   instances per (faction, state) key. At 2000+ NPCs biased by faction or
   state (e.g. many `ENGAGING` US soldiers in one mode), instances
   silently drop once a bucket saturates. Safe for current modes (max
   120 active NPCs per `combat120` scenario), but needs addressing before
   A Shau Valley materializes more than ~120 NPCs per bucket.

4. **Cover search cost dominates `combat120` p99.**
   Cover search is already budget-capped (6/frame), but per-search cost
   (sandbag iteration, vegetation grid, terrain probes) keeps p99 in the
   WARN range. Further work likely wants a cheaper candidate prefilter
   before full evaluation.

5. **NPC terrain stalling residue.**
   Post-B3 the `StuckDetector` correctly escalates after 4 failed
   backtracks, but the underlying movement solver still routes NPCs into
   unreachable slopes. The B3 fix prevents infinite loops, it does not
   prevent the stall itself.

6. **Mixed import patterns for `IAudioManager`.**
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
