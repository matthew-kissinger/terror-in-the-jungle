# Codebase Block Map

> Hub index. Generated from `scripts/extract-block-map.ts` -> `artifacts/block-map.json`.
> Each domain has a self-contained sub-doc in [`docs/blocks/`](blocks/).

[GH]: https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src

**250 classes. 43 GameSystems. 100 wiring edges. 7 singletons. 9 tick groups.**

---

## Navigation

| Domain | Doc | Blocks | Biggest class | Budget |
|--------|-----|--------|---------------|--------|
| [Core](blocks/core.md) | Engine shell | 0 (11 modules) | [GameEngine]([GH]/core/GameEngine.ts) | - |
| [Combat](blocks/combat.md) | NPC AI, spatial, squads | 4 (48+ modules) | [CombatantSystem]([GH]/systems/combat/CombatantSystem.ts) | 5ms |
| [Terrain](blocks/terrain.md) | Chunks, workers, height | 2 (22 modules) | [ImprovedChunkManager]([GH]/systems/terrain/ImprovedChunkManager.ts) | 2ms |
| [Strategy](blocks/strategy.md) | War sim, materialization | 2 (5 modules) | [WarSimulator]([GH]/systems/strategy/WarSimulator.ts) | 2ms |
| [Player](blocks/player.md) | Movement, weapon, health | 8 (21 modules) | [PlayerController]([GH]/systems/player/PlayerController.ts) | 1ms |
| [Weapons](blocks/weapons.md) | Grenades, mortar, sandbag | 5 (16 modules) | [GrenadeSystem]([GH]/systems/weapons/GrenadeSystem.ts) | 1ms |
| [Vehicle](blocks/vehicle.md) | Helicopters, helipads | 2 (8 modules) | [HelicopterModel]([GH]/systems/helicopter/HelicopterModel.ts) | deferred |
| [World](blocks/world.md) | Zones, tickets, modes | 4 (9 modules) | [ZoneManager]([GH]/systems/world/ZoneManager.ts) | 1ms |
| [UI](blocks/ui.md) | HUD, minimap, map, touch | 4 (60+ modules) | [HUDSystem]([GH]/ui/hud/HUDSystem.ts) | 1.5ms |
| [Support](blocks/support.md) | Audio, effects, env, debug | 10 (14 modules) | [AudioManager]([GH]/systems/audio/AudioManager.ts) | untracked |

---

## Coupling Heatmap

Most-depended-on blocks. Touch these and you touch everything.

| Block | Fan-In | Fan-Out | Dependents |
|-------|--------|---------|------------|
| **[ZoneManager]([GH]/systems/world/ZoneManager.ts)** | **11** | 4 | AmmoSupply, Combat, Compass, FPWeapon, FullMap, HUD, Minimap, PlayerHealth, PlayerRespawn, Tickets, WarSim |
| **[TicketSystem]([GH]/systems/world/TicketSystem.ts)** | **9** | 1 | Combat, FPWeapon, Grenade, HUD, Mortar, PlayerCtrl, PlayerHealth, Sandbag, WarSim |
| **[CombatantSystem]([GH]/systems/combat/CombatantSystem.ts)** | **8** | 9 | FPWeapon, FullMap, Grenade, HUD, Minimap, Mortar, WarSim, ZoneMgr |
| **[AudioManager]([GH]/systems/audio/AudioManager.ts)** | **7** | 0 | Combat, FPWeapon, Grenade, Helicopter, Mortar, StratFeedback, Weather |
| [HUDSystem]([GH]/ui/hud/HUDSystem.ts) | 7 | 5 | Combat, FPWeapon, Helicopter, PlayerCtrl, PlayerHealth, StratFeedback, ZoneMgr |
| [ChunkManager]([GH]/systems/terrain/ImprovedChunkManager.ts) | 7 | 0 | Combat, Footstep, Helicopter, Helipad, PlayerCtrl, PlayerRespawn, ZoneMgr |
| [InventoryManager]([GH]/systems/player/InventoryManager.ts) | 7 | 0 | AmmoSupply, FPWeapon, Grenade, Mortar, PlayerCtrl, PlayerRespawn, Sandbag |
| [PlayerController]([GH]/systems/player/PlayerController.ts) | 7 | **13** | FPWeapon, Flashbang, Grenade, Helicopter, PlayerHealth, PlayerRespawn, Suppression |

**Mutual dependencies** (bidirectional wiring):
CombatantSystem <-> ZoneManager, PlayerController <-> FirstPersonWeapon, CombatantSystem <-> HUDSystem, PlayerHealthSystem <-> PlayerRespawnManager

---

## Tick Graph

```
performanceTelemetry.beginFrame()
spatialGridManager.resetFrameTelemetry()
ShotCommandFactory.resetPool()
playerSquadController.updatePlayerPosition()

TRACKED (budgeted, EMA-monitored):
  Combat    5.0ms  combatantSystem.update(dt)
  Terrain   2.0ms  chunkManager.update(dt)
  Billboards 2.0ms  globalBillboardSystem.update(dt)
  Player    1.0ms  playerController + firstPersonWeapon
  Weapons   1.0ms  grenade + mortar + sandbag + ammoSupply
  HUD       1.0ms  hudSystem.update(dt)
  TacticalUI 0.5ms  minimap + compass (20Hz throttle)
  WarSim    2.0ms  warSimulator + strategicFeedback (A Shau only)
  AShauAssist 0.2ms  contact-assist teleport (A Shau, 60s no-contact)
  World     1.0ms  zoneManager + ticketSystem + weather + water

UNTRACKED (catch-all loop):
  assetLoader, audioManager, skybox, playerHealth, playerRespawn,
  helipad, helicopter, gameMode, squadCtrl, inventory, camShake,
  suppression, flashbang, smoke, influence, voice, loadout, footstep

performanceTelemetry.endFrame()

POST-TICK RENDER:
  skybox.updatePosition -> renderer.render -> fpw.renderWeapon ->
  grenade overlay -> postProcessing.endFrame -> metrics
```

**Total tracked: 15.7ms** of 16.6ms frame budget (60fps).

---

## Singletons

| Name | Access | File | Role |
|------|--------|------|------|
| `spatialGridManager` | `export const` | [SpatialGridManager]([GH]/systems/combat/SpatialGridManager.ts) | All spatial queries |
| `getHeightQueryCache()` | factory fn | [HeightQueryCache]([GH]/systems/terrain/HeightQueryCache.ts) | Terrain height lookups |
| `SettingsManager.getInstance()` | class static | [SettingsManager]([GH]/config/SettingsManager.ts) | User prefs, localStorage |
| `performanceTelemetry` | `export const` | [PerformanceTelemetry]([GH]/systems/debug/PerformanceTelemetry.ts) | Frame/system timing |
| `objectPool` | `export const` | [ObjectPoolManager]([GH]/utils/ObjectPoolManager.ts) | Vector3/Quaternion pools |
| `InputContextManager.getInstance()` | class static | [InputContextManager]([GH]/systems/input/InputContextManager.ts) | gameplay/map/menu/modal |
| `ViewportManager.getInstance()` | class static | [ViewportManager]([GH]/ui/design/responsive.ts) | Breakpoints, isTouch |

---

## Lifecycle

```
BOOT       main.ts -> bootstrap.ts -> new GameEngine()
CONSTRUCT  SystemInitializer: 37 systems created in dependency order
WIRE       SystemConnector: 100 setter calls
INIT       system.init() per non-deferred system
MENU       StartScreen. Player picks mode.
MODE_START Load DEM (if A Shau) -> configure chunks/billboard/weather ->
           GameModeManager.applyModeConfiguration() ->
           WarSimulator.configure() -> pre-generate 3x3 spawn area -> init zones
GAME_START Position player, enable combat, start ambient audio.
           Deferred: HelipadSystem, HelicopterModel, VoiceCallout, Loadout (500ms)
TICK       RAF loop -> SystemUpdater.updateSystems() per frame
MATCH_END  TicketSystem -> HUDSystem.handleGameEnd()
RESTART    clearCombatants, resetTickets, respawnPlayer
```

---

## Communication Patterns

| Pattern | Where | How |
|---------|-------|-----|
| **Setter injection** | [SystemConnector]([GH]/core/SystemConnector.ts) (100 edges) | `refs.A.setB(refs.C)`. No compile-time safety. |
| **Batched pub/sub** | [WarEventEmitter]([GH]/systems/strategy/WarEventEmitter.ts) only | `.emit()` queues, `.flush()` delivers batch. StrategicFeedback subscribes. |
| **Callback 1:1** | TicketSystem, HelipadSystem, HUDSystem, SettingsManager | `.setCallback(fn)` or `.onChange(fn)` |
| **Direct push** | FPWeapon->HUD, Combat->HUD, StratFeedback->HUD | Cross-system method calls |
| **Preact signals** | UI layer only (UIComponent subclasses) | `.signal()`, `.effect()`, `.computed()`. Auto-disposed. |

---

## Vocabulary

| Say | Means | File |
|-----|-------|------|
| the engine | GameEngine | [core/GameEngine.ts]([GH]/core/GameEngine.ts) |
| the renderer | GameRenderer | [core/GameRenderer.ts]([GH]/core/GameRenderer.ts) |
| the tick loop | SystemUpdater | [core/SystemUpdater.ts]([GH]/core/SystemUpdater.ts) |
| the wiring | SystemConnector | [core/SystemConnector.ts]([GH]/core/SystemConnector.ts) |
| the combat system | CombatantSystem | [combat/CombatantSystem.ts]([GH]/systems/combat/CombatantSystem.ts) |
| combat AI | CombatantAI + ai/* | [combat/CombatantAI.ts]([GH]/systems/combat/CombatantAI.ts) |
| spatial / octree | SpatialGridManager singleton | [combat/SpatialGridManager.ts]([GH]/systems/combat/SpatialGridManager.ts) |
| the LOD manager | CombatantLODManager | [combat/CombatantLODManager.ts]([GH]/systems/combat/CombatantLODManager.ts) |
| squads | SquadManager | [combat/SquadManager.ts]([GH]/systems/combat/SquadManager.ts) |
| influence map | InfluenceMapSystem | [combat/InfluenceMapSystem.ts]([GH]/systems/combat/InfluenceMapSystem.ts) |
| terrain / chunks | ImprovedChunkManager | [terrain/ImprovedChunkManager.ts]([GH]/systems/terrain/ImprovedChunkManager.ts) |
| terrain workers | ChunkWorkerPool | [terrain/ChunkWorkerPool.ts]([GH]/systems/terrain/ChunkWorkerPool.ts) |
| height cache | HeightQueryCache | [terrain/HeightQueryCache.ts]([GH]/systems/terrain/HeightQueryCache.ts) |
| DEM / real terrain | DEMHeightProvider | [terrain/DEMHeightProvider.ts]([GH]/systems/terrain/DEMHeightProvider.ts) |
| war layer / war sim | WarSimulator | [strategy/WarSimulator.ts]([GH]/systems/strategy/WarSimulator.ts) |
| the materializer | MaterializationPipeline | [strategy/MaterializationPipeline.ts]([GH]/systems/strategy/MaterializationPipeline.ts) |
| the director | StrategicDirector | [strategy/StrategicDirector.ts]([GH]/systems/strategy/StrategicDirector.ts) |
| player controller | PlayerController | [player/PlayerController.ts]([GH]/systems/player/PlayerController.ts) |
| FPW / first person weapon | FirstPersonWeapon | [player/FirstPersonWeapon.ts]([GH]/systems/player/FirstPersonWeapon.ts) |
| player health | PlayerHealthSystem | [player/PlayerHealthSystem.ts]([GH]/systems/player/PlayerHealthSystem.ts) |
| respawn | PlayerRespawnManager | [player/PlayerRespawnManager.ts]([GH]/systems/player/PlayerRespawnManager.ts) |
| inventory | InventoryManager | [player/InventoryManager.ts]([GH]/systems/player/InventoryManager.ts) |
| grenades | GrenadeSystem | [weapons/GrenadeSystem.ts]([GH]/systems/weapons/GrenadeSystem.ts) |
| mortar | MortarSystem | [weapons/MortarSystem.ts]([GH]/systems/weapons/MortarSystem.ts) |
| sandbags | SandbagSystem | [weapons/SandbagSystem.ts]([GH]/systems/weapons/SandbagSystem.ts) |
| helicopters / the heli | HelicopterModel | [helicopter/HelicopterModel.ts]([GH]/systems/helicopter/HelicopterModel.ts) |
| heli physics | HelicopterPhysics | [helicopter/HelicopterPhysics.ts]([GH]/systems/helicopter/HelicopterPhysics.ts) |
| zones | ZoneManager | [world/ZoneManager.ts]([GH]/systems/world/ZoneManager.ts) |
| tickets | TicketSystem | [world/TicketSystem.ts]([GH]/systems/world/TicketSystem.ts) |
| game modes | GameModeManager | [world/GameModeManager.ts]([GH]/systems/world/GameModeManager.ts) |
| billboards | GlobalBillboardSystem | [world/billboard/GlobalBillboardSystem.ts]([GH]/systems/world/billboard/GlobalBillboardSystem.ts) |
| the HUD | HUDSystem | [ui/hud/HUDSystem.ts]([GH]/ui/hud/HUDSystem.ts) |
| weapon bar | UnifiedWeaponBar | [ui/hud/UnifiedWeaponBar.ts]([GH]/ui/hud/UnifiedWeaponBar.ts) |
| minimap | MinimapSystem | [ui/minimap/MinimapSystem.ts]([GH]/ui/minimap/MinimapSystem.ts) |
| full map | FullMapSystem | [ui/map/FullMapSystem.ts]([GH]/ui/map/FullMapSystem.ts) |
| touch controls | TouchControls | [ui/controls/TouchControls.ts]([GH]/ui/controls/TouchControls.ts) |
| settings | SettingsManager | [config/SettingsManager.ts]([GH]/config/SettingsManager.ts) |
| audio | AudioManager | [audio/AudioManager.ts]([GH]/systems/audio/AudioManager.ts) |
| post-processing | PostProcessingManager | [effects/PostProcessingManager.ts]([GH]/systems/effects/PostProcessingManager.ts) |
| perf telemetry | PerformanceTelemetry | [debug/PerformanceTelemetry.ts]([GH]/systems/debug/PerformanceTelemetry.ts) |
| A Shau config | A_SHAU_VALLEY_CONFIG | [config/AShauValleyConfig.ts]([GH]/config/AShauValleyConfig.ts) |

---

## Regenerating

```bash
npx tsx scripts/extract-block-map.ts   # writes artifacts/block-map.json
```
