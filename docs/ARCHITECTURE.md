# Architecture

Last verified: 2026-04-01

Systems-based orchestration engine. 43 GameSystem classes, 14 tracked tick groups, 8 singletons.

## Entry Points

```
index.html -> src/main.ts -> src/core/bootstrap.ts -> new GameEngine()
```

- `GameEngine` owns the runtime shell: `GameUI`, `GameRenderer`, `SystemManager`, overlays, startup flow.
- `GameEngineInit` coordinates startup: mode selection, terrain/navmesh prep, deploy flow.
- `GameEngineInput` handles keyboard/pointer bindings.
- `GameEngineLoop` runs the RAF loop via `SystemUpdater.updateSystems()`.

## Startup Lifecycle

```
BOOT       main.ts -> bootstrap.ts -> new GameEngine()
CONSTRUCT  SystemInitializer: 41 systems created in dependency order
WIRE       SystemConnector: setter calls via 3 runtime composers
INIT       system.init() per non-deferred system
MENU       GameUI state machine (TitleScreen -> ModeSelectScreen -> DeployScreen)
MODE_START ModeStartupPreparer: terrain, navmesh, features, zones
GAME_START Position player, enable combat, start ambient audio
TICK       RAF loop -> SystemUpdater.updateSystems() per frame
MATCH_END  TicketSystem -> HUDSystem.handleGameEnd()
```

Runtime composers (extracted from SystemConnector):
- `StartupPlayerRuntimeComposer` - player/UI/deploy wiring
- `GameplayRuntimeComposer` - combat/world/game-mode/environment
- `OperationalRuntimeComposer` - strategy/vehicle/air-support

## System Overview

| Domain | Directory | Key Files | Budget |
|--------|-----------|-----------|-------:|
| Combat | `src/systems/combat/` | CombatantSystem, CombatantAI, SpatialGridManager, CombatantLODManager, SquadManager | 5ms |
| Terrain | `src/systems/terrain/` | TerrainSystem, HeightQueryCache, CDLODRenderer | 2ms |
| Navigation | `src/systems/navigation/` | NavmeshSystem, NavmeshMovementAdapter | 2ms |
| Strategy | `src/systems/strategy/` | WarSimulator, MaterializationPipeline, StrategicDirector | 2ms |
| Player | `src/systems/player/` | PlayerController, PlayerMovement, FirstPersonWeapon | 1ms |
| Weapons | `src/systems/weapons/` | GrenadeSystem, MortarSystem, SandbagSystem, AmmoSupplySystem | 1ms |
| Vehicles | `src/systems/helicopter/`, `src/systems/vehicle/` | HelicopterModel, HelicopterPhysics, VehicleManager | 1ms |
| World | `src/systems/world/` | ZoneManager, TicketSystem, GameModeManager, WorldFeatureSystem | 1ms |
| Air Support | `src/systems/airsupport/` | AirSupportManager, AAEmplacement | 1ms |
| Assets | `src/systems/assets/` | AssetLoader, ModelLoader | untracked |
| Input | `src/systems/input/` | InputContextManager (singleton) | untracked |
| Audio | `src/systems/audio/` | AudioManager, FootstepAudioSystem | untracked |
| Effects | `src/systems/effects/` | TracerPool, PostProcessingManager, CameraShakeSystem | untracked |
| Environment | `src/systems/environment/` | WeatherSystem, WaterSystem, Skybox | untracked |
| Debug | `src/systems/debug/` | PerformanceTelemetry (singleton) | untracked |
| UI | `src/ui/` | HUDSystem, GameUI, TouchControls, MinimapSystem, FullMapSystem | 1.5ms |
| Config | `src/config/` | gameModeTypes, *Config, MapSeedRegistry, CombatantConfig | - |

## Tick Graph

From `SystemUpdater.updateSystems()`:

```
performanceTelemetry.beginFrame()
spatialGridManager.resetFrameTelemetry()
ShotCommandFactory.resetPool()
playerSquadController.updatePlayerPosition()

TRACKED (budgeted, EMA-monitored):
  Combat      5.0ms  combatantSystem
  Terrain     2.0ms  terrainSystem
  Navigation  2.0ms  navmeshSystem
  Billboards  2.0ms  globalBillboardSystem
  Vehicles    1.0ms  helicopterModel + vehicleManager
  Player      1.0ms  playerController + firstPersonWeapon
  Weapons     1.0ms  grenade + mortar + sandbag + ammoSupply
  HUD         1.0ms  hudSystem
  TacticalUI  0.5ms  minimap + compass (scheduled cadence)
  WarSim      2.0ms  warSimulator + strategicFeedback (scheduled)
  AirSupport  1.0ms  airSupport + aaEmplacement + npcVehicleController (scheduled)
  ModeRuntime 0.2ms  gameModeManager runtime hook (scheduled)
  World       1.0ms  zoneManager + ticketSystem + weather + water (scheduled)

UNTRACKED (catch-all):
  assetLoader, audioManager, skybox, playerHealth, playerRespawn,
  helipad, deathCam, gameMode, squadCtrl, inventory, camShake,
  suppression, flashbang, smoke, influence, footstep, weaponPickup, rally

GameEventBus.flush()
performanceTelemetry.endFrame()

POST-TICK: skybox -> renderer.render -> fpw.renderWeapon -> postProcessing
```

Scheduled groups (`SimulationScheduler`): `tactical_ui`, `war_sim`, `air_support`, `world_state`, `mode_runtime` run at reduced cadence to save budget.

## Weapon System

Six weapon slots managed by `WeaponRigManager`:

| Slot | Weapon | GLB | GunplayCore |
|------|--------|-----|-------------|
| Rifle | M16A1 (US/ARVN) or AK-47 (NVA/VC) | `m16a1.glb` / `ak47.glb` | faction-switched |
| Shotgun | Ithaca 37 | `ithaca37.glb` | pellet spread, pump action |
| SMG | M3 Grease Gun | `m3-grease-gun.glb` | high RPM, low damage |
| Pistol | M1911 | `m1911.glb` | sidearm |
| LMG | M60 | `m60.glb` | high sustained fire |
| Launcher | M79 | `m79.glb` | grenade projectile (not hitscan) |

Shot pipeline: `WeaponInput` -> `FirstPersonWeapon.tryFire()` -> `WeaponShotCommandBuilder.createShotCommand()` -> `WeaponFiring.executeShot()` -> `WeaponShotExecutor`.

Key behavior:
- `GunplayCore.computeShotRay()` uses camera origin/direction. Spread is currently 0 (perfect accuracy).
- `WeaponFiring.resolveBarrelAlignedCommand()` redirects the ray from barrel position toward the camera aim point for tracer alignment. ADS uses camera center; hip-fire uses a right/down offset.
- `WeaponAnimations` handles ADS transition, recoil spring, idle bob, and pump action.
- `ShotCommand` pattern: all validation (canFire, ammo) happens before command creation. Executor trusts the command.

## Helicopter System

Three flyable helicopters with GLB models containing rigged rotor pivots:

| Aircraft | GLB | Rotor Pivots |
|----------|-----|-------------|
| UH-1 Huey | `uh1-huey.glb` | Joint_MainRotor, Joint_TailRotor, 2x M60 door guns |
| UH-1C Gunship | `uh1c-gunship.glb` | Joint_MainRotor, Joint_TailRotor |
| AH-1 Cobra | `ah1-cobra.glb` | Joint_MainRotor, Joint_TailRotor |

Rotor detection (`HelicopterGeometry.ts`): Traverses GLB scene graph, matches node names containing `mainrotor`/`mainblade` -> `userData.type = 'mainBlades'`, `tailrotor`/`tailblade` -> `userData.type = 'tailBlades'`. Animation (`HelicopterAnimation.ts`): main rotors spin `rotation.y`, tail rotors spin `rotation.z`.

Naming rule: Only pivot nodes (Joint_*) should match rotor patterns. Child mesh names use MR*/TR* prefixes to avoid double-animation.

Tail rotor pre-rotation: `pivot.rotation.y = PI/2` baked into GLB so the Z-spin creates a sideways disc.

## Coupling Heatmap

Most-depended-on systems:

| System | Fan-In | Key Dependents |
|--------|-------:|----------------|
| ZoneManager | 11 | Combat, Compass, FullMap, HUD, Minimap, PlayerRespawn, Tickets, WarSim |
| TicketSystem | 9 | Combat, Grenade, HUD, Mortar, PlayerCtrl, PlayerHealth, Sandbag, WarSim |
| CombatantSystem | 8 | FullMap, Grenade, HUD, Minimap, Mortar, WarSim, ZoneMgr |
| AudioManager | 7 | Combat, FPWeapon, Grenade, Helicopter, Mortar, StratFeedback, Weather |
| TerrainSystem | 7 | Combat, Footstep, Helicopter, Helipad, PlayerCtrl, PlayerRespawn, ZoneMgr |
| PlayerController | 7 | FPWeapon, Grenade, Helicopter, PlayerHealth, PlayerRespawn, Suppression |

Mutual dependencies: CombatantSystem <-> ZoneManager, PlayerController <-> FirstPersonWeapon, CombatantSystem <-> HUDSystem, PlayerHealthSystem <-> PlayerRespawnManager.

## Singletons

| Name | Access | File |
|------|--------|------|
| `spatialGridManager` | `export const` | `src/systems/combat/SpatialGridManager.ts` |
| `getHeightQueryCache()` | factory fn | `src/systems/terrain/HeightQueryCache.ts` |
| `SettingsManager.getInstance()` | class static | `src/config/SettingsManager.ts` |
| `performanceTelemetry` | `export const` | `src/systems/debug/PerformanceTelemetry.ts` |
| `objectPool` | `export const` | `src/utils/ObjectPoolManager.ts` |
| `InputContextManager.getInstance()` | class static | `src/systems/input/InputContextManager.ts` |
| `ViewportManager.getInstance()` | class static | `src/ui/design/responsive.ts` |
| `GameEventBus` | static methods | `src/core/GameEventBus.ts` |

## Communication Patterns

| Pattern | Where | How |
|---------|-------|-----|
| Setter injection | SystemConnector (via 3 composers) | `refs.A.setB(refs.C)` |
| GameEventBus | Cross-system events | Queue-and-flush per frame, typed events |
| WarEventEmitter | Strategy layer only | Batched pub/sub for war sim events |
| Callback 1:1 | TicketSystem, HelipadSystem, HUDSystem | `.setCallback(fn)` or `.onChange(fn)` |
| Preact signals | UI layer only | UIComponent subclasses, auto-disposed |

## Key Patterns

- **GameSystem interface**: `init()`, `update(dt)`, `dispose()`. All 43 systems implement it.
- **Runtime composers**: Grouped dependency wiring replaces monolithic SystemConnector.
- **SimulationScheduler**: Cadence-based update groups for non-critical systems.
- **ObjectPool**: Pre-allocated Vector3/Quaternion/Matrix4 for GC avoidance in hot paths.
- **CSS Modules + UIComponent**: New UI uses signals-based UIComponent with CSS Modules.
- **Scratch vectors**: Pre-allocated reusable vectors in hot-path classes.
- **freezeTransform**: Static objects have `matrixAutoUpdate` disabled for scene graph perf.

## Known Architecture Debt

1. **SystemManager ceremony** - adding a new system touches SystemInitializer + one or more composers.
2. **PlayerController 47 setters** - grouped `configureDependencies()` exists but compatibility setters remain.
3. **Variable deltaTime physics** - no fixed timestep for player/helicopter (FixedStepRunner exists but not universal).
4. **Mixed UI paradigms** - UIComponent + CSS Modules is the active path, but ~50 files still use raw `document.createElement`.
5. **Partial singleton reset** - major singletons reset on engine teardown, but no universal dispose contract.

## Game Modes

5 modes configured in `src/config/`:

| Mode | Config File | World Size | Combatants |
|------|------------|---:|---:|
| Zone Control | `ZoneControlConfig.ts` | 500m | 20 |
| Team Deathmatch | `TeamDeathmatchConfig.ts` | 400m | 30 |
| Open Frontier | `OpenFrontierConfig.ts` | 3200m | 120 |
| A Shau Valley | `AShauValleyConfig.ts` | 21km | 60 materialized / 3000 strategic |
| AI Sandbox | `SandboxConfig` (via URL params) | 200m | configurable |

Map seed rotation: `src/config/MapSeedRegistry.ts` (5 OF, 3 ZC, 3 TDM pre-baked variants).
