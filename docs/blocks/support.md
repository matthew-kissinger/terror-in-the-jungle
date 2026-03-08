# Support Domain

> Audio, Effects, Environment, Input, Assets, Debug, Utils, Config.
> Hub: [CODEBASE_BLOCKS.md](../CODEBASE_BLOCKS.md)

---

## Context for Agents

These domains are smaller, mostly untracked in the tick loop. Audio, Effects, and Environment provide sensory feedback. Input manages raw events. Assets handle loading. Debug provides telemetry. Utils are shared primitives. Config holds settings and mode definitions.

Key constraints:
- AudioManager has fan-in 7 (third highest in the codebase). It is injected widely but has no setter deps itself.
- FootstepAudioSystem is active (`FOOTSTEP_AUDIO_ENABLED=true`). VoiceCalloutSystem was deleted (2026-03-06).
- Effects pools (ExplosionEffectsPool, ImpactEffectsPool, TracerPool, MuzzleFlashSystem) are OWNED and ticked by CombatantSystem - they live under `systems/effects/` but are not standalone blocks.
- SmokeCloudSystem uses a module-level `setSmokeCloudSystem()` function for wiring, not a setter method.
- ObjectPoolManager is warmed to 240 Vector3 / 80 Quaternion / 32 Raycaster / 96 Matrix4 at boot. It is the primary GC-pressure mitigation for hot combat loops.
- PerformanceTelemetry exposes `window.perf` for console debugging (report, validate, benchmark, reset).
- SettingsManager uses localStorage key `pixelart-sandbox-settings` (legacy name, not renamed).

---

## Audio Domain

### Blocks

| Block | File | Tick | Status |
|-------|------|------|--------|
| [AudioManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/AudioManager.ts) | systems/audio/AudioManager.ts | untracked | Active |
| [FootstepAudioSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/FootstepAudioSystem.ts) | systems/audio/FootstepAudioSystem.ts | untracked | Active (`FOOTSTEP_AUDIO_ENABLED=true`) |
| [RadioTransmissionSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/RadioTransmissionSystem.ts) | systems/audio/RadioTransmissionSystem.ts | untracked | Active |

### Modules (owned by AudioManager)

| Module | File | Role |
|--------|------|------|
| [AmbientSoundManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/AmbientSoundManager.ts) | systems/audio/AmbientSoundManager.ts | Sequential ambient track playback. Called via `AudioManager.startAmbient()`. |
| [AudioPoolManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/AudioPoolManager.ts) | systems/audio/AudioPoolManager.ts | Pooled audio instances. Gunshot pool 20, death pool 10, explosion pool 8. Object3D pool 32. |
| [AudioDuckingSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/AudioDuckingSystem.ts) | systems/audio/AudioDuckingSystem.ts | Reduces ambient to 40% during combat. 2s timeout after last shot. 0.3s fade. |
| [AudioWeaponSounds](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/AudioWeaponSounds.ts) | systems/audio/AudioWeaponSounds.ts | Player + positional weapon sounds, bullet whiz, weapon switch. |
| [FootstepSynthesis](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/audio/FootstepSynthesis.ts) | systems/audio/FootstepSynthesis.ts | Procedural Web Audio synthesis for grass/mud/water/rock footsteps. |

### AudioManager - Key API

```ts
// Initialization
await audioManager.init()          // loads all buffers, initializes pools
audioManager.startAmbient()        // call when gameplay starts

// Weapon sounds
audioManager.playPlayerWeaponSound('rifle' | 'shotgun' | 'smg' | 'pistol')
audioManager.playWeaponSoundAt(position, 'rifle' | 'shotgun', listenerPos?)
audioManager.playPlayerGunshot()   // non-positional player shot
audioManager.playGunshotAt(pos)    // positional NPC shot
audioManager.playReloadSound()
audioManager.playWeaponSwitchSound()

// Combat feedback
audioManager.playHitFeedback('hit' | 'headshot' | 'kill')
audioManager.playBulletWhizSound(bulletPos, playerPos)
audioManager.playDeathSound(pos, isAlly)
audioManager.playExplosionAt(pos)

// Volume
audioManager.setMasterVolume(0-1)
audioManager.setAmbientVolume(0-1)
audioManager.toggleMute()
audioManager.getListener()         // THREE.AudioListener for other systems
```

AudioContext is suspended until first user interaction (click/keydown/touchend). AudioManager.update() drives ducking only.

### FootstepAudioSystem - Key Notes

- Player pool: 4 non-positional sounds. AI pool: 8 positional sounds.
- AI footsteps only within 30m, max 5 concurrent.
- Terrain detection: height < waterLevel -> WATER, < waterLevel+2 -> MUD, slope > 0.5 -> ROCK, else GRASS.
- Walk intervals: GRASS 0.5s, MUD 0.55s, WATER 0.52s, ROCK 0.48s. Run: ~0.3s shorter each.
- Terrain-based footstep sounds (grass/mud/water/rock) with assets in `public/assets/optimized/`.

### RadioTransmissionSystem - Key Notes

- 10 OGG ghost AM transmission files from `assets/transmissions/`.
- Interval: 30s min, 2min max. Per-file 60s replay cooldown.
- Must call `setAudioListener(listener)` after construction.
- `getStatus()` returns enabled state, next-transmission countdown, loaded file count.

### Sound Config

[config/audio.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/audio.ts) - `SOUND_CONFIGS` record + `AUDIO_POOL_SIZES`. All paths under `assets/optimized/`. Key entries: playerGunshot (0.85), playerShotgun (0.95), playerSMG (0.75), otherGunshot (0.7, positional), allyDeath/enemyDeath (positional), explosion (positional).

---

## Effects Domain

### Blocks

| Block | File | Tick |
|-------|------|------|
| [CameraShakeSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/CameraShakeSystem.ts) | systems/effects/CameraShakeSystem.ts | untracked (called from PlayerController) |
| [SmokeCloudSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/SmokeCloudSystem.ts) | systems/effects/SmokeCloudSystem.ts | untracked (ticked by GameEngine or caller) |

### Modules Owned by CombatantSystem

These live under `systems/effects/` but are constructed inside CombatantSystem and ticked in its update. They are not independently wired blocks.

| Module | File | Role |
|--------|------|------|
| [ExplosionEffectsPool](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/ExplosionEffectsPool.ts) | systems/effects/ExplosionEffectsPool.ts | Pool of 16 explosion effects: flash, smoke, fire, shockwave sprites. |
| [ImpactEffectsPool](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/ImpactEffectsPool.ts) | systems/effects/ImpactEffectsPool.ts | Pooled bullet-impact sparks/dust. |
| [TracerPool](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/TracerPool.ts) | systems/effects/TracerPool.ts | Pooled tracer line segments. |
| [MuzzleFlashSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/MuzzleFlashSystem.ts) | systems/effects/MuzzleFlashSystem.ts | Muzzle flash sprites. |

### Module Owned by GameRenderer

| Module | File | Role |
|--------|------|------|
| [PostProcessingManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/effects/PostProcessingManager.ts) | systems/effects/PostProcessingManager.ts | Retro pixelation + color quantization. Render-target blit pipeline. |

### CameraShakeSystem - Key API

```ts
cameraShake.shake(intensity, duration, frequency?)
cameraShake.shakeFromExplosion(explosionPos, playerPos, maxRadius)
cameraShake.shakeFromDamage(damageAmount)        // 10dmg=0.2, 50dmg=1.0 intensity
cameraShake.shakeFromNearbyDeath(deathPos, playerPos)  // within 20 units
cameraShake.shakeFromRecoil()                    // 0.08 intensity, 0.06s
cameraShake.getCurrentShakeOffset()             // -> { pitch, yaw } in radians
cameraShake.isShaking()
```

Max intensity capped at 2.5 (nausea guard). Uses summed pseudo-Perlin (3 sine waves) with quadratic falloff envelope (fades last 30% of duration).

### SmokeCloudSystem - Key Notes

- Max 10 active clouds, 24 sprites per cloud, pre-pooled at init.
- Procedural smoke texture from `ExplosionTextures.createSmokeTexture()`.
- LOS-blocking: checks if camera-to-target ray passes through active cloud (module-level scratch vectors).
- HTML overlay div at max-opacity 0.7 for player-inside-smoke effect.
- Wiring: `setSmokeCloudSystem(system)` (module export) then `spawnSmokeCloud(position)` from call sites.

### PostProcessingManager - Key Notes

- pixelScale: 3 on desktop, 1.5 on mobile GPU.
- Render loop contract: `beginFrame()` -> render world -> `clearDepth()` -> render overlay scene -> `endFrame()`.
- Custom GLSL blit shader: color quantization at 24 levels (`colorLevels` uniform).
- `setEnabled(false)` skips the low-res target entirely (direct render).

---

## Environment Domain

### Blocks

| Block | File | Tick | Deps |
|-------|------|------|------|
| [WeatherSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/environment/WeatherSystem.ts) | systems/environment/WeatherSystem.ts | World group (1ms budget) | AudioManager (rain sfx) |
| [WaterSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/environment/WaterSystem.ts) | systems/environment/WaterSystem.ts | World group (1ms budget) | WeatherSystem |
| [Skybox](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/environment/Skybox.ts) | systems/environment/Skybox.ts | untracked (static) | none |
| [RiverWaterSystem](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/environment/RiverWaterSystem.ts) | systems/environment/RiverWaterSystem.ts | untracked | none |

### WeatherSystem - Key Notes

- States: CLEAR -> LIGHT_RAIN -> HEAVY_RAIN -> STORM (WeatherState enum in gameModeTypes.ts).
- 10s transition duration. cycleTimer drives state change per WeatherConfig.cycleDuration.
- Rain particle counts: mobile low 2k, mobile high 4k; desktop low 4k, medium 6k, high 8k.
- Sub-modules (inline, not separate class files): WeatherAtmosphere (fog/ambient/hemisphere), WeatherLightning (flash timer + thunder delay).
- setRenderer() caches base fog density, ambient intensity, moon intensity, hemisphere intensity, fog color, ambient color for blending.
- Underwater detection changes fog/ambient when camera y < water level.

Inline sub-module files (extracted helpers, not separate classes in WeatherSystem):
- [WeatherAtmosphere.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/environment/WeatherAtmosphere.ts) - `updateAtmosphere()`, `getBlendedRainIntensity()`, `AtmosphereBaseValues`
- [WeatherLightning.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/environment/WeatherLightning.ts) - `updateLightning()`, `LightningState`

### WaterSystem - Key Notes

- Three.js `Water` object from `three/examples/jsm/objects/Water.js`.
- Water level 0 (sea level). Base geometry 2000 units, 100 segments.
- Responds to WeatherSystem: distortionScale increases in storm.
- Underwater overlay div for immersed camera tint.
- `setWeatherSystem(ws)` setter wires the dependency.

### RiverWaterSystem - Key Notes

- Zero textures. Fully procedural GLSL (river vertex + fragment shaders).
- Loads river segment JSON from `public/data/vietnam/` at runtime.
- `RiverSegment` data: world-space `[x, z]` point arrays, width in meters.
- Uses HeightQueryCache to pin river geometry to terrain height.

---

## Input Domain

### Modules

| Module | File | Role |
|--------|------|------|
| [InputManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/input/InputManager.ts) | systems/input/InputManager.ts | Extends PlayerInput. Context-aware action gating. Input mode tracking (keyboard/mouse/touch/gamepad). |
| [InputContextManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/input/InputContextManager.ts) | systems/input/InputContextManager.ts | SINGLETON. Contexts: gameplay, map, menu, modal. onChange() multi-listener. |

### InputManager - Key Notes

- Extends `PlayerInput` (systems/player/PlayerInput.ts). Wraps all callbacks in context guard.
- `isKeyPressed()` override: returns false when context is not gameplay.
- Mode tracking: auto-detects keyboard, mouse, touch, gamepad (via `pollGamepad()`).
- `onInputModeChange(listener)` returns unsubscribe function.
- `setInputContext(context)` / `getInputContext()` - delegates to InputContextManager.

### InputContextManager - Key Notes

- `InputContext` type: `'gameplay' | 'map' | 'menu' | 'modal'`.
- `isGameplay()` convenience predicate.
- `onChange(listener)` fires immediately with current context, returns unsubscribe.
- One instance shared across the codebase via `InputContextManager.getInstance()`.

---

## Assets Domain

### Classes

| Class | File | Role |
|-------|------|------|
| [AssetLoader](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/AssetLoader.ts) | systems/assets/AssetLoader.ts | Texture loading and caching. Pre-initialized before main loop. Implements GameSystem. |
| [ModelLoader](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/ModelLoader.ts) | systems/assets/ModelLoader.ts | GLB/GLTF loading via GLTFLoader. Singleton: `export const modelLoader`. Cache + in-flight deduplication. |
| [modelPaths.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | systems/assets/modelPaths.ts | Path constants for all GLB models. |

### AssetLoader - Key Notes

- Loads terrain textures, vegetation sprites, NPC faction sprites (18 webp per faction).
- Uses `PixelPerfectUtils.configureTexture()` (NearestFilter, no mipmaps) by default.
- `getTexture(name)` returns cached THREE.Texture.
- Asset path resolution via `config/paths.ts:getAssetPath()`.

### ModelLoader - Key Notes

- `loadModel(relativePath)` returns a clone of the cached scene (independent instance per caller).
- Flat shading applied to all MeshStandardMaterial meshes at load time.
- Path resolution via `config/paths.ts:getModelPath()`.
- Singleton export: `import { modelLoader } from './ModelLoader'`.

### modelPaths.ts - Registry

| Const | Count | Examples |
|-------|-------|---------|
| [WeaponModels](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | 9 | M16A1, AK47, M60, M2_BROWNING, M1911, M79, RPG7, ITHACA37, M3_GREASE_GUN |
| [AircraftModels](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | 6 | UH1_HUEY, UH1C_GUNSHIP, AH1_COBRA, AC47_SPOOKY, F4_PHANTOM, A1_SKYRAIDER |
| [GroundVehicleModels](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | 5 | M151_JEEP, M35_TRUCK, M113_APC, M48_PATTON, PT76 |
| [WatercraftModels](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | 2 | SAMPAN, PBR |
| [StructureModels](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | 32 | HELIPAD, SANDBAG_WALL, MORTAR_PIT, TUNNEL_ENTRANCE, SA2_SAM, TOC_BUNKER... |
| [BuildingModels](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | 12 | SHOPHOUSE, FRENCH_VILLA, CHURCH, PAGODA, BUNKER_NVA... |
| [AnimalModels](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | 6 | EGRET, WATER_BUFFALO, MACAQUE, TIGER, KING_COBRA, WILD_BOAR |
| [PropModels](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/assets/modelPaths.ts) | 1 | WOODEN_BARREL |

---

## Debug Domain

### Modules

| Module | File | Role |
|--------|------|------|
| [PerformanceTelemetry](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/debug/PerformanceTelemetry.ts) | systems/debug/PerformanceTelemetry.ts | SINGLETON. Frame begin/end, per-system markers, GPU timing, spatial grid telemetry, hit detection stats. |
| [GPUTimingTelemetry](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/debug/GPUTimingTelemetry.ts) | systems/debug/GPUTimingTelemetry.ts | WebGL timer queries (`EXT_disjoint_timer_query_webgl2`). Opt-in via `?gpuTiming=1`. |
| [FrameTimingTracker](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/debug/FrameTimingTracker.ts) | systems/debug/FrameTimingTracker.ts | Per-system timing, 120-frame EMA history, 16.67ms budget guard, slow-frame logging (max 1/s). |
| [PerformanceBenchmark](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/debug/PerformanceBenchmark.ts) | systems/debug/PerformanceBenchmark.ts | Spatial query / combat loop benchmarking utilities. |
| [PerformanceTypes](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/debug/PerformanceTypes.ts) | systems/debug/PerformanceTypes.ts | Shared types: SystemTiming, FrameData, SpatialGridTelemetry, TelemetryReport, TerrainMergerTelemetry. |

### PerformanceTelemetry - Key API

```ts
const perf = PerformanceTelemetry.getInstance()

// Frame loop
perf.beginFrame()
perf.beginSystem('CombatantSystem')
// ... system update ...
perf.endSystem('CombatantSystem')
perf.endFrame()

// Reporting
perf.getReport()             // TelemetryReport snapshot
perf.validate()              // console-friendly validation output
perf.runBenchmark(1000)      // -> BenchmarkResult

// External updates
perf.updateSpatialGridTelemetry(data)
perf.updateTerrainMergerTelemetry(data)
perf.recordShot() / recordHit()

// Console shortcuts (window.perf)
// window.perf.report() / .validate() / .benchmark() / .reset()
```

FrameTimingTracker is owned by PerformanceTelemetry (not a separate singleton). GPUTimingTelemetry requires `init(renderer)` call after renderer is ready.

---

## Utils

### Modules

| Module | File | Role |
|--------|------|------|
| [Logger](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/utils/Logger.ts) | utils/Logger.ts | Static categorized logging. Rate-limited (5/s per category, 1s window). 200-entry ring buffer. |
| [MathUtils](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/utils/Math.ts) | utils/Math.ts | randomInRange, randomVector3, poissonDiskSampling. |
| [NoiseGenerator](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/utils/NoiseGenerator.ts) | utils/NoiseGenerator.ts | Seeded Perlin noise. Permutation table 0-255. Used by terrain chunk workers. |
| [ObjectPoolManager](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/utils/ObjectPoolManager.ts) | utils/ObjectPoolManager.ts | SINGLETON (`objectPool` export). Vector3, Quaternion, Raycaster, Matrix4 pools with borrow/return telemetry. |
| [PixelPerfectUtils](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/utils/PixelPerfect.ts) | utils/PixelPerfect.ts | Texture configuration helpers for retro rendering. |
| [DeviceDetector](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/utils/DeviceDetector.ts) | utils/DeviceDetector.ts | Device capability detection. All results cached after first call. |
| [Orientation](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/utils/Orientation.ts) | utils/Orientation.ts | `isPortraitViewport()`, `tryLockLandscapeOrientation()`. |

### Logger - Key API

```ts
Logger.debug('category', 'message', ...args)
Logger.info('category', 'message', ...args)
Logger.warn('category', 'message', ...args)
Logger.error('category', 'message', ...args)
Logger.setMinLevel('debug' | 'info' | 'warn' | 'error')
Logger.getStats()    // -> LoggerStats (suppressed counts, recent buffer)
```

Rate limit: 5 logs per category per second. Suppressed counts reported every 2s. Buffer capacity 200 entries. Initial min level resolved from `?logLevel=` query param or `VITE_LOG_LEVEL` env var.

### ObjectPoolManager - Key API

```ts
import { objectPool } from './utils/ObjectPoolManager'

// At boot
objectPool.warmup(240, 80, 32, 96)  // v3, quat, raycaster, mat4

// In hot loops
const v = objectPool.getVector3()
// ... use v ...
objectPool.releaseVector3(v)

const q = objectPool.getQuaternion()
objectPool.releaseQuaternion(q)

const r = objectPool.getRaycaster()
objectPool.releaseRaycaster(r)

const m = objectPool.getMatrix4()
objectPool.releaseMatrix4(m)

objectPool.getStats()  // peak usage, borrow counts, creation counts
```

Pool expands on miss (no hard cap). Stats track borrow vs. creation counts to detect pool undersizing.

### DeviceDetector - Key API

```ts
isTouchDevice()            // cached: ontouchstart or maxTouchPoints > 0
isMobileViewport()         // width <= 1024 && height <= 900
shouldUseTouchControls()   // delegates to isTouchDevice()
isMobileGPU()              // cached: UA + WebGL renderer string (Adreno/Mali/PowerVR/Apple GPU/Tegra)
estimateGPUTier()          // -> 'low' | 'medium' | 'high' (based on WebGL renderer + memory)
getRenderDistanceMultiplier()  // scales chunk render distance by GPU tier
```

### PixelPerfectUtils - Key API

```ts
PixelPerfectUtils.configureTexture(texture)          // NearestFilter both, no mipmaps, RepeatWrapping
PixelPerfectUtils.configureBillboardTexture(texture) // NearestFilter mag, NearestMipmapLinear min, ClampToEdge
```

---

## Config

### SettingsManager

[config/SettingsManager.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/SettingsManager.ts) - SINGLETON. localStorage key `pixelart-sandbox-settings`.

```ts
const settings = SettingsManager.getInstance()

settings.get('masterVolume')         // 0-100
settings.get('mouseSensitivity')     // 1-10 UI scale
settings.get('touchSensitivity')     // 1-10 UI scale
settings.get('graphicsQuality')      // 'low' | 'medium' | 'high' | 'ultra'
settings.get('enableShadows')
settings.get('showFPS')
settings.get('controllerPreset')     // 'default' | 'southpaw'
settings.get('controllerDpadMode')   // 'weapons' | 'quickCommands'

settings.set('masterVolume', 80)
settings.getMouseSensitivityRaw()    // -> radians/pixel (0.001 - 0.005)
settings.getTouchSensitivityRaw()    // -> 0.006 - 0.024 (Fortnite-tuned)

settings.onChange(listener)          // multi-listener, returns unsubscribe
```

GameSettings interface fields: masterVolume, mouseSensitivity, touchSensitivity, controllerPreset, controllerMoveDeadZone (5-30%), controllerLookDeadZone (5-30%), controllerLookCurve, controllerInvertY, controllerDpadMode, showFPS, enableShadows, graphicsQuality.

Defaults: masterVolume 70, mouseSensitivity 5, touchSensitivity 5, graphicsQuality 'medium', enableShadows true, showFPS false.

### Game Mode Config System

| File | Role |
|------|------|
| [gameModeTypes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModeTypes.ts) | `GameMode` enum, `GameModeConfig` type, `WarSimulatorConfig`, `ZoneConfig`, `SpawnPoint`, `WeatherConfig`, `ScaleConfig`, `WeatherState` enum. |
| [gameModes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModes.ts) | `getGameModeConfig(mode)` factory. Routes to per-mode config. AI_SANDBOX supports sandbox URL param override for npcCount. |
| [AShauValleyConfig.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/AShauValleyConfig.ts) | A_SHAU_VALLEY_CONFIG. 3000 agents, 21km DEM, 18 zones, 60-min matches. WarSimulator enabled. |
| [OpenFrontierConfig.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/OpenFrontierConfig.ts) | OPEN_FRONTIER_CONFIG. Large open map, no zones. |
| [ZoneControlConfig.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/ZoneControlConfig.ts) | ZONE_CONTROL_CONFIG. Ticket bleed, zone ownership. |
| [TeamDeathmatchConfig.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/TeamDeathmatchConfig.ts) | TEAM_DEATHMATCH_CONFIG. |
| [AiSandboxConfig.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/AiSandboxConfig.ts) | AI_SANDBOX_CONFIG. |

GameMode enum values: `ZONE_CONTROL`, `OPEN_FRONTIER`, `TEAM_DEATHMATCH`, `AI_SANDBOX`, `A_SHAU_VALLEY`.

### Supporting Config Files

| File | Role |
|------|------|
| [biomes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/biomes.ts) | `BIOMES` record, `BiomeConfig` type, `BiomeClassificationRule` (elevation/slope rules), `TerrainConfig` (defaultBiome + rules array). |
| [vegetationTypes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/vegetationTypes.ts) | `VEGETATION_TYPES` array, `VegetationTypeConfig` type. |
| [audio.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/audio.ts) | `SOUND_CONFIGS` record, `SoundConfig` interface, `AUDIO_POOL_SIZES`. |
| [paths.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/paths.ts) | `getAssetPath()`, `getModelPath()` - resolve public-dir URLs using `import.meta.env.BASE_URL`. |
| [loading.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/loading.ts) | Loading phase label strings for the loading screen UI. |
