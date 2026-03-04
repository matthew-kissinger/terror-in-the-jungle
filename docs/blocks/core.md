# Core Domain

> Engine shell, boot sequence, tick dispatch, wiring, and user-facing lifecycle.
> Hub: [CODEBASE_BLOCKS.md](../CODEBASE_BLOCKS.md)

---

## Context for Agents

The Core domain is the outermost shell. It owns nothing domain-specific - no AI, no terrain, no HUD state. What it does:

- Constructs and wires all 37 game systems (SystemInitializer + SystemConnector)
- Drives the RAF tick loop and dispatches updates in budget-monitored groups (SystemUpdater)
- Owns the Three.js WebGLRenderer, scene, camera, and post-processing pipeline (GameRenderer)
- Manages the full user lifecycle: menu -> loading -> gameplay -> match-end -> restart
- Exposes `window.__engine`, `window.__renderer`, `window.__metrics` for the perf harness

**To work in this domain in isolation:**
- You do not need to understand any system internals. Systems are black boxes here.
- The only coupling contract is `SystemReferences` (38-field interface in SystemInitializer.ts) and the `GameSystem` interface (`init/update/dispose`).
- Setter injection in SystemConnector.ts is the wiring layer. There is no compile-time safety for missing wires - bugs appear at runtime.
- The tick order in SystemUpdater.ts is the source of truth for update sequencing. Do not re-order without checking downstream dependencies.
- `GameEngineInit.ts` is where mode-start and restart logic lives. `GameEngine.ts` is a thin coordinator that delegates to the four split modules.

---

## User Lifecycle (E2E)

```
PAGE LOAD -> index.html
  |
main.ts  (imports theme CSS, calls bootstrapGame())
  |
bootstrap.ts
  |- resetStartupTelemetry()
  |- injectSharedStyles()
  |- new TouchControlLayout().init()       // CSS custom properties for touch sizing
  |- new GameEngine()                      // constructor: StartScreen + GameRenderer +
  |                                        //   SystemManager + overlays + event listeners
  |- engine.initialize()                   // async: construct + wire + init all systems
  |- engine.start()                        // begins RAF loop (always running; guards on
  |                                        //   isInitialized && gameStarted per frame)
  |- window.__engine / __renderer / __metrics exposed for perf harness
  |
MAIN MENU  (StartScreen)
  |- Mode carousel  (5 modes: Zone Control, Open Frontier, TDM, AI Sandbox, A Shau Valley)
  |- [SETTINGS]     -> SettingsModal (mouse sens, touch sens, FPS toggle, pixel size, volume,
  |                                   graphics quality, shadows)
  |- [HOW TO PLAY]  -> HowToPlayModal
  |
[SELECT MODE + PLAY]
  |
startGameWithMode(mode)   (GameEngineInit)
  |- guard: isInitialized && !gameStarted
  |- tryLockLandscapeOrientation() on touch devices
  |- if config.heightSource.type === 'dem':
  |    fetch DEM binary -> DEMHeightProvider -> HeightQueryCache + ChunkWorkerPool
  |- renderer.configureForWorldSize()      // camera far, fog density, shadow far
  |- terrainSystem.setWorldSize(config.worldSize)
  |- terrainSystem.setVisualMargin(config.visualMargin ?? 200)
  |- terrainSystem set chunk size + render distance
  |- terrainSystem.setBiomeConfig(defaultBiome, biomeRules)
  |- systemManager.setGameMode(mode)       // GameModeManager.setGameMode ->
  |                                        //   reseedForcesForMode (spawns AI forces)
  |- if warSimulator.enabled: load persisted war state (A Shau only)
  |- preGenerateSpawnArea(spawnPos)        // 3x3 chunk ring, 5s timeout, then initZones
  |- applyDefaultLoadout() (rifle + frag)
  |- startGame()
  |
startGame() / runStartupFlow()
  |- loadingScreen.hide()
  |- renderer.showSpawnLoadingIndicator()  // "DEPLOYING TO BATTLEFIELD" overlay
  |- playerController.setPosition()       // grounded at terrain height
  |- terrainSystem.update(0.016)
  |- await nextFrame()
  |- renderer.showRenderer()              // canvas becomes visible
  |- renderer.hideSpawnLoadingIndicator()
  |- firstPersonWeapon.setGameStarted(true)
  |- playerController.setGameStarted(true)
  |- hudSystem.startMatch()
  |- audioManager.startAmbient()
  |- combatantSystem.enableCombat()
  |- requestBackgroundTask(renderer.precompileShaders, 1000ms)
  |- requestBackgroundTask(startDeferredInitialization, 500ms)
  |    Deferred: HelipadSystem, HelicopterModel, VoiceCalloutSystem, LoadoutSelector
  |
GAMEPLAY  (RAF tick loop, always running)
  |- Player fights, captures zones, drives tickets
  |- Tab key: Scoreboard
  |- M key: Full Map (FullMapSystem, pauses tactical UI at 20Hz)
  |- F1: perf stats to console
  |- F2: real-time perf overlay
  |- F3: log overlay
  |- F4: time indicator
  |- P: toggle post-processing
  |- [ / ]: adjust pixel size (1-8)
  |- K: voluntary respawn
  |- Mobile visibility change: MobilePauseOverlay
  |
MATCH END  (TicketSystem detects winner -> HUDSystem.handleGameEnd())
  |- MatchEndScreen overlay shown
  |- [PLAY AGAIN] -> restartMatch()        // same mode, no page reload
  |- [MAIN MENU]  -> NOT YET IMPLEMENTED   // currently only play-again is wired
  |
RESTART  restartMatch()
  |- gameModeManager.getCurrentMode() -> setGameMode(mode, {createPlayerSquad:true})
  |    -> reseedForcesForMode (clears + respawns all AI)
  |    -> weatherSystem.resetState()
  |- ticketSystem.restartMatch()           // reset counters
  |- hudSystem.startMatch()               // reset HUD state
  |- playerRespawnManager.respawnAtBase() // triggered via ticketSystem match-restart callback
  |- loop back to GAMEPLAY
```

---

## Modules

All files are in `src/core/` unless noted.

| Module | File | Role |
|--------|------|------|
| GameEngine | [GameEngine.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/GameEngine.ts) | Top-level coordinator. Owns StartScreen, GameRenderer, SystemManager, overlays. Delegates all logic to Init/Input/Loop split modules. Holds clock, isInitialized, gameStarted flags. |
| GameEngineInit | [GameEngineInit.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/GameEngineInit.ts) | Async init, startGameWithMode(), DEM loading, spawn positioning (A Shau insertion logic), restartMatch(). Contains runStartupFlow() which drives the "DEPLOYING" overlay sequence. |
| GameEngineInput | [GameEngineInput.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/GameEngineInput.ts) | Window keyboard event listeners. Debug toggle handlers: F1 (perf stats), F2 (overlay), F3 (log), F4 (time), P (post-processing), [ / ] (pixel size), K (voluntary respawn). |
| GameEngineLoop | [GameEngineLoop.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/GameEngineLoop.ts) | animate() RAF loop. Calls updateSystems, skybox, mortar camera check, GPU timing, render main scene, render weapon + grenade overlays, post-processing endFrame, runtime metrics. Crash guard: 3 crashes in 5s shows fatal overlay. |
| GameRenderer | [GameRenderer.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/GameRenderer.ts) | Three.js WebGLRenderer (no antialias, high-performance), Scene, PerspectiveCamera (75 FOV). FogExp2 (0x5a7a6a, density 0.004), AmbientLight, DirectionalLight (moonLight, casts shadows), HemisphereLight. PostProcessingManager, CrosshairUI, LoadingUI. Device-adaptive shadow/pixel-ratio via DeviceDetector. configureForWorldSize() adjusts camera far / fog / shadow for mode. |
| SystemManager | [SystemManager.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/SystemManager.ts) | Holds 37 public system refs. Delegates to Initializer/Connector/Updater/Disposer. Owns setGameMode(), preGenerateSpawnArea(), startDeferredInitialization(), waitForPlayerSquad(). |
| SystemInitializer | [SystemInitializer.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/SystemInitializer.ts) | Constructs all 37 systems in dependency order across 4 phases (core, textures, audio, world). Defines `SystemReferences` interface (38 fields). Defers 4 systems. Pre-initializes AssetLoader + AudioManager (skipped in main init loop). Warms ObjectPool to 240/80/32/96. |
| SystemConnector | [SystemConnector.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/SystemConnector.ts) | 119 setter-injection calls. THE wiring layer. Groups: PlayerController, CombatantSystem, FirstPersonWeapon, HUDSystem, TicketSystem, PlayerHealthSystem, Minimap/FullMap/Compass, ZoneManager, AudioManager, PlayerRespawnManager, HelipadSystem, HelicopterModel, GameModeManager, CameraShakeSystem, Suppression, Flashbang, WeaponSystems (grenade/mortar/sandbag/ammo), FootstepAudio, WarSimulator, StrategicFeedback. Also mounts Compass/Minimap/Health/SquadIndicator into HUD grid slots. |
| SystemUpdater | [SystemUpdater.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/SystemUpdater.ts) | Per-frame dispatch. 9 tracked groups with EMA budgets (alpha=0.1). Budget overrun warning at 150% EMA, 10s cooldown. TacticalUI throttled to 20Hz. AShauAssist: teleports player to contact if 60s no-opfor within 250m (90s cooldown). Untracked systems run in a catch-all loop. |
| SystemDisposer | [SystemDisposer.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/SystemDisposer.ts) | Iterates systems array calling `system.dispose()`. |
| RuntimeMetrics | [RuntimeMetrics.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/RuntimeMetrics.ts) | Ring buffer (300 samples) for frame timing. Tracks avg, p95, p99 (500ms recompute throttle), max, hitch33/50/100 counts. Accumulates combatant/firing/engaging counts. Exposed as `window.__metrics`. |
| CrosshairUI | [CrosshairUI.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/CrosshairUI.ts) | Tactical crosshair DOM element: center dot, 4 lines with pulse animation, 4 corner brackets, spread indicator circle. Created lazily on showCrosshair(). |
| LoadingUI | [LoadingUI.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/LoadingUI.ts) | "DEPLOYING TO BATTLEFIELD" spawn-loading overlay. Shows during runStartupFlow. Fade-out on hide (450ms). Status + detail text updated via setSpawnLoadingStatus(). |
| WebGLContextRecovery | [WebGLContextRecovery.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/WebGLContextRecovery.ts) | Listens for webglcontextlost/webglcontextrestored. On lost: sets contextLost=true, shows "Recovering graphics" overlay, loop skips frames. On restored: resize renderer, rebuild PostProcessingManager, force shadow map update. |
| StartupTelemetry | [StartupTelemetry.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/StartupTelemetry.ts) | markStartup(name) breadcrumbs with ms timestamps from reset. Exposed as `window.__startupTelemetry.getSnapshot()`. Called at every major init phase boundary. |
| SandboxModeDetector | [SandboxModeDetector.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/SandboxModeDetector.ts) | URL param parsing for perf harness: `?sandbox=1&npcs=40&combat=1&autostart=1&duration=0`. Returns SandboxConfig used to skip pointer lock, skip loadout, autostart mode, gate combat. |
| bootstrap.ts | [bootstrap.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/bootstrap.ts) | bootstrapGame(): reset telemetry, inject styles, init TouchControlLayout, construct GameEngine, await initialize(), start(). Exposes window globals. Registers beforeunload + HMR dispose. Shows fatal error overlay on bootstrap failure. |
| main.ts | [main.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/main.ts) | Entry point. Imports `ui/engine/theme.css`. Calls `bootstrapGame()`. |

---

## Boot Sequence

```
1. main.ts
   - import './ui/engine/theme.css'         // CSS custom properties before any UI
   - bootstrapGame()

2. bootstrap.ts: bootstrapGame()
   - resetStartupTelemetry()                // marks bootstrap.begin
   - injectSharedStyles()                   // design system CSS vars injected to <head>
   - new TouchControlLayout().init()        // sets --touch-* CSS custom properties
   - new GameEngine()

3. GameEngine constructor
   - isSandboxMode() / getSandboxConfig()   // URL param detection
   - new StartScreen().mount(document.body) // main menu rendered immediately
   - new GameRenderer()                     // Three.js renderer + scene + camera +
   |                                        //   lighting + post-processing
   - new SystemManager()                    // empty shell, no systems yet
   - new PerformanceOverlay/TimeIndicator/LogOverlay/RuntimeMetrics
   - new WebGLContextRecovery(renderer)
   - Input.setupEventListeners(this)        // window resize + keydown
   - setupMenuCallbacks()                   // onPlay, onSettings, onHowToPlay,
   |                                        //   SettingsManager.onChange subscriber
   - new MobilePauseOverlay(this).setup()
   - marks: bootstrap.engine-constructed

4. engine.initialize() -> initializeSystems()
   -> SystemManager.initializeSystems(scene, camera, onProgress, renderer)
     -> SystemInitializer.initializeSystems(refs, ...)
       Phase 1 core (progress: 0-1):
         - objectPool.warmup(240, 80, 32, 96)
         - new AssetLoader()
         - new GlobalBillboardSystem(scene, camera, assetLoader)
         - new TerrainSystem(scene, camera, assetLoader, billboard, {
             size:64, renderDistance:adaptive(3-6), loadDistance:+1, lodLevels:4
           })
       Phase 2 textures (progress: 0-1):
         - await assetLoader.init()          // loads all textures
       Phase 3 audio (progress: 0-1):
         - new AudioManager(scene, camera)
         - await audioManager.init()
       Phase 4 world (progress: 0-1):
         - Construct all remaining 32 systems (PlayerController, CombatantSystem,
           Skybox, WaterSystem, WeatherSystem, FirstPersonWeapon, ZoneManager,
           TicketSystem, PlayerHealthSystem, PlayerRespawnManager, HUDSystem,
           MinimapSystem, FullMapSystem, CompassSystem, GameModeManager,
           HelipadSystem, HelicopterModel, PlayerSquadController, InventoryManager,
           GrenadeSystem, MortarSystem, SandbagSystem, CameraShakeSystem,
           PlayerSuppressionSystem, FlashbangScreenEffect, SmokeCloudSystem,
           InfluenceMapSystem, AmmoSupplySystem, FootstepAudioSystem,
           VoiceCalloutSystem, LoadoutSelector, WarSimulator, StrategicFeedback,
           spatialGridManager singleton)
         - Separate deferred list: HelipadSystem, HelicopterModel,
           VoiceCalloutSystem, LoadoutSelector
         - await system.init() for all non-deferred, non-pre-initialized systems
     -> SystemConnector.connectSystems(refs, scene, camera, renderer)
          119 setter calls (see Wiring section)
   - Back in initializeSystems (engine level):
     - asset check (skybox texture)
     - engine.isInitialized = true
     - hudSystem.setPlayAgainCallback(() => restartMatch(engine))
     - if sandbox.autoStart: startGameWithMode(AI_SANDBOX)
     - else: loadingScreen.showMainMenu()
   - marks: bootstrap.engine-initialize.end

5. engine.start()
   - animate()                              // RAF loop begins (guards on isInitialized
                                            //   && gameStarted; menu shows while loop runs)
   - marks: bootstrap.engine-started
```

---

## Tick Dispatch Detail

Source: [SystemUpdater.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/SystemUpdater.ts)

Each tracked group uses `trackSystemUpdate(name, budgetMs, fn)`:
- Measures wall-clock ms per call
- Updates EMA (alpha = 0.1)
- Warns if `emaMs > budgetMs * 1.5`, throttled to once per 10s per group

```
performanceTelemetry.beginFrame()
spatialGridManager.resetFrameTelemetry()
ShotCommandFactory.resetPool()

if playerSquadController && playerController:
  playerSquadController.updatePlayerPosition(playerPos)
  minimapSystem.setCommandPosition(commandPos)
  voiceCalloutSystem.setPlayerPosition(playerPos)

TRACKED GROUPS (name, budget):
  "Combat"      5.0ms  combatantSystem.update(dt)
  "Terrain"     2.0ms  terrainSystem.update(dt)        [gated: gameStarted]
  "Billboards"  2.0ms  globalBillboardSystem.update(dt, fog)
  "Player"      1.0ms  playerController.update(dt)
                       firstPersonWeapon.update(dt)
  "Weapons"     1.0ms  grenadeSystem.update(dt)
                       mortarSystem.update(dt)
                       sandbagSystem.update(dt)
                       ammoSupplySystem.update(dt)
  "HUD"         1.0ms  hudSystem.update(dt)
  "TacticalUI"  0.5ms  [throttled 20Hz = 1/20s accumulator]
                         if !fullMapVisible: minimapSystem + compassSystem
                         if fullMapVisible:  fullMapSystem
  "WarSim"      2.0ms  warSimulator.setPlayerPosition() + warSimulator.update(dt)
                       strategicFeedback.setPlayerPosition()
                       [only updates if warSimulator.isEnabled() - A Shau only]
  "AShauAssist" 0.2ms  [A Shau mode only] if 60s with no opfor within 250m:
                         playerRespawnManager.getAShauPressureInsertionSuggestion()
                         playerController.setPosition(suggested)
                         playerHealthSystem.applySpawnProtection(2s)
                         [90s cooldown between assists]
  "World"       1.0ms  zoneManager.update(dt)
                       [gated: gameStarted] ticketSystem.update(dt)
                                            weatherSystem.update(dt)
                       waterSystem.update(dt)

UNTRACKED ("Other" telemetry bucket - catch-all for non-reference-equal systems):
  assetLoader, audioManager, skybox, playerHealthSystem, playerRespawnManager,
  helipadSystem, helicopterModel, gameModeManager, playerSquadController,
  inventoryManager, cameraShakeSystem, playerSuppressionSystem,
  flashbangScreenEffect, smokeCloudSystem, influenceMapSystem,
  footstepAudioSystem, voiceCalloutSystem, loadoutSelector

performanceTelemetry.endFrame()
```

**Total tracked budget: 15.7ms** (Combat 5 + Terrain 2 + Billboards 2 + Player 1 + Weapons 1 + HUD 1 + TacticalUI 0.5 + WarSim 2 + AShauAssist 0.2 + World 1)

Post-tick render (in GameEngineLoop, after updateSystems):
```
skybox.updatePosition(camera.position)
mortarSystem.isUsingMortarCamera() check
performanceTelemetry.collectGPUTime()           // collect previous frame GPU query
performanceTelemetry.beginSystem('RenderMain')
postProcessing.beginFrame()                     // redirect to low-res target
renderer.render(scene, camera)  OR  mortar camera
performanceTelemetry.endSystem('RenderMain')
firstPersonWeapon.renderWeapon(renderer)
grenade overlay render (clearDepth, render grenade scene)
postProcessing.endFrame()                       // blit low-res to screen
updateRuntimeMetrics(), updatePerformanceOverlay(), updateLogOverlay()
```

isTrackedSystem() uses reference equality against refs fields to determine which systems fall through to the untracked loop. Any system added to allSystems but not listed in isTrackedSystem() is untracked.

---

## Wiring

Source: [SystemConnector.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/core/SystemConnector.ts)

119 setter-injection calls. No compile-time safety - missing wires silently produce undefined at call sites. All wiring happens in `connectSystems()`, called synchronously after `initializeSystems()` returns.

| Receiver | Wired dependencies |
|----------|--------------------|
| **playerController** | terrainSystem, gameModeManager, ticketSystem, helicopterModel, firstPersonWeapon, hudSystem, renderer, cameraShakeSystem, inventoryManager, grenadeSystem, mortarSystem, sandbagSystem, playerSquadController, footstepAudioSystem |
| **combatantSystem** | terrainSystem, camera, ticketSystem, playerHealthSystem, zoneManager, gameModeManager, hudSystem, audioManager, playerSuppressionSystem, voiceCalloutSystem. Plus direct property assigns: influenceMap, sandbagSystem. combatantCombat.setSandbagSystem, combatantAI.setSandbagSystem/setZoneManager/setSmokeCloudSystem, squadManager.setInfluenceMap |
| **firstPersonWeapon** | playerController, combatantSystem, ticketSystem, hudSystem, zoneManager, inventoryManager, audioManager |
| **hudSystem** | combatantSystem, zoneManager, ticketSystem, grenadeSystem, mortarSystem. Mounts: compassSystem, minimapSystem, playerHealthSystem, playerSquadController |
| **ticketSystem** | zoneManager. matchRestartCallback: cancelPendingRespawn + resetForNewMatch + weapon.enable + respawnAtBase |
| **playerHealthSystem** | zoneManager, ticketSystem, playerController, firstPersonWeapon, camera, playerRespawnManager, hudSystem |
| **minimapSystem** | zoneManager, combatantSystem, warSimulator. Receives helipad markers via helipadSystem.onHelipadsCreated |
| **fullMapSystem** | zoneManager, combatantSystem, gameModeManager, warSimulator. Receives helipad markers. |
| **compassSystem** | zoneManager. Mounted into hudSystem grid slot 'compass'. |
| **zoneManager** | combatantSystem, camera, terrainSystem, spatialGridManager, spatialQueryProvider (lambda), hudSystem |
| **playerRespawnManager** | playerHealthSystem, zoneManager, gameModeManager, playerController, firstPersonWeapon, inventoryManager, warSimulator, terrainSystem |
| **helipadSystem** | terrainSystem (terrainManager), globalBillboardSystem (vegetationSystem), gameModeManager. onHelipadsCreated -> minimap + fullMap markers. |
| **helicopterModel** | terrainSystem (terrainManager), helipadSystem, playerController, hudSystem, audioManager listener |
| **gameModeManager** | connectSystems(zoneManager, combatantSystem, ticketSystem, terrainSystem, minimapSystem), influenceMapSystem, warSimulator |
| **cameraShakeSystem** | (no setters; receives from playerController.setCameraShakeSystem) |
| **playerSuppressionSystem** | cameraShakeSystem, playerController |
| **flashbangScreenEffect** | playerController. setSmokeCloudSystem global. |
| **grenadeSystem** | combatantSystem, inventoryManager, ticketSystem, audioManager, playerController, flashbangEffect, voiceCalloutSystem, impactEffectsPool (from combatantSystem), explosionEffectsPool |
| **mortarSystem** | combatantSystem, inventoryManager, audioManager, ticketSystem, impactEffectsPool, explosionEffectsPool |
| **sandbagSystem** | inventoryManager, ticketSystem |
| **ammoSupplySystem** | zoneManager, inventoryManager, firstPersonWeapon |
| **weatherSystem** | audioManager, renderer |
| **waterSystem** | weatherSystem |
| **footstepAudioSystem** | terrainSystem |
| **warSimulator** | combatantSystem, zoneManager, ticketSystem, influenceMapSystem |
| **strategicFeedback** | warSimulator, hudSystem, audioManager |
| **performanceTelemetry** | hitDetection (from combatantCombat), terrainSystem, combatants array, spatialGridManager. initGPUTiming(renderer). |

---

## Key Patterns

### Deferred Systems
Four systems are excluded from the main init loop and initialized 500ms after the first interactive frame via `requestBackgroundTask`:

| System | Why Deferred |
|--------|--------------|
| HelipadSystem | Helipad placement scans terrain; not needed for first frame |
| HelicopterModel | Large geometry load; not needed until player approaches helipad |
| VoiceCalloutSystem | Audio assets optional; CALLOUT_AUDIO_ENABLED=false currently |
| LoadoutSelector | UI panel not shown by default |

They are fully wired before deferral (SystemConnector runs on all refs including these). They are added to the main `systems` array after init completes so they participate in the untracked update loop.

### Pre-Initialized Systems
`AssetLoader` and `AudioManager` are `await`-ed explicitly in SystemInitializer phases 2 and 3. They are added to the main init loop but skipped via `preInitializedSystems` set (their `init()` is not called again).

### isTrackedSystem() Reference Check
SystemUpdater calls each tracked group directly by name. The untracked catch-all loop iterates `systems[]` and calls `system.update(dt)` for every entry not matched by `isTrackedSystem()`. This check uses `===` reference equality against `refs.*` fields. If you add a new system and want it tracked, add it to a named group in `updateSystems()` AND add it to `isTrackedSystem()`.

### SandboxMode
URL param `?sandbox=1` skips pointer lock, auto-starts AI_SANDBOX mode, gates combat/NPC count/duration. Used by the perf harness. `sandboxEnabled` flag on GameEngine suppresses fatal crash overlay and loadout selector.

### Settings Live-Apply
`SettingsManager.onChange()` subscribed in `setupMenuCallbacks()`. Changes to `masterVolume`, `enableShadows`, `showFPS`, `graphicsQuality` apply immediately to live systems. `mouseSensitivity` is read per-frame by PlayerInput directly from SettingsManager.

### Frame Loop Resilience
GameEngineLoop tracks consecutive crashes within a 5s window. After 3 crashes it shows the fatal error overlay. In sandbox mode the overlay is suppressed and errors are logged only. The RAF loop always continues - it never calls `cancelAnimationFrame`.

---

## Window Globals

| Global | Set in | Value |
|--------|--------|-------|
| `window.__engine` | bootstrap.ts | GameEngine instance |
| `window.__renderer` | bootstrap.ts | GameRenderer instance |
| `window.__metrics` | RuntimeMetrics constructor | Live frame metrics (frameCount, avgFrameMs, p95, p99, max, hitch counts, combatant stats) |
| `window.__startupTelemetry` | StartupTelemetry module | `{ getSnapshot() }` - all markStartup() breadcrumbs |
| `window.__ashauDiagnostics` | bootstrap.ts | Function returning A Shau session telemetry snapshot |

---

## Related Docs

- [CODEBASE_BLOCKS.md](../CODEBASE_BLOCKS.md) - hub, coupling heatmap, singletons, vocabulary
- [ARCHITECTURE_RECOVERY_PLAN.md](../ARCHITECTURE_RECOVERY_PLAN.md) - optimization decisions
- [PROFILING_HARNESS.md](../PROFILING_HARNESS.md) - how perf captures use `window.__engine`
- [AGENT_TESTING.md](../AGENT_TESTING.md) - agent validation workflows and perf baselines
- [blocks/combat.md](combat.md) - CombatantSystem internals (5ms budget)
- [blocks/terrain.md](terrain.md) - TerrainSystem, HeightQueryCache, workers, DEM
- [blocks/ui.md](ui.md) - HUDSystem, StartScreen, minimap, touch controls
- [blocks/world.md](world.md) - ZoneManager, TicketSystem, GameModeManager
