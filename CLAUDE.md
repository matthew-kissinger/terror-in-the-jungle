# Terror in the Jungle

Browser-based 3D combined-arms FPS with GPU-accelerated billboard rendering of 200k+ procedural vegetation and faction-based AI combat.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev          # Dev server on localhost:5173
npm run build        # Production build (tsc + vite)
npm run test:run     # 3222 tests (95 files)
npm run lint         # ESLint check
npm run lint:fix     # ESLint autofix
```

### Performance Harness

```bash
npm run perf:capture              # Headed capture (trusted default)
npm run perf:capture:headless     # Headless (secondary signal)
npm run perf:capture:headed       # Explicit headed
npm run perf:capture:devtools     # With Chrome DevTools auto-opened
npm run perf:analyze:latest       # Analyze latest capture artifacts
npm run perf:baseline             # Regression-focused baseline
```

Harness parameters (env vars or CLI flags):
- `PERF_DURATION`, `PERF_WARMUP`, `PERF_NPCS`, `PERF_PORT`
- `PERF_COMBAT=1|0`, `PERF_ACTIVE_PLAYER=1|0`, `PERF_DEEP_CDP=1`
- `PERF_STARTUP_TIMEOUT`, `PERF_STARTUP_FRAME_THRESHOLD`
- `PERF_COMPRESS_FRONTLINE=1|0`, `PERF_FRONTLINE_TRIGGER_DISTANCE`

See `docs/PROFILING_HARNESS.md` for full reference.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Three.js r182, postprocessing v6.38 |
| Spatial | three-mesh-bvh v0.9, custom octree + grid |
| Build | Vite 7.3, TypeScript 5.9 |
| Workers | BVH pool, chunk generation workers |
| Tests | Vitest 4.0 |
| Profiling | Playwright CDP, speedscope, lighthouse |

## Codebase

~60k lines source, ~48k lines tests. 302 source files, 95 test files. Systems-based architecture with orchestrator pattern.

```
src/
├── core/              # Game loop, renderer, bootstrap, WebGL recovery
│   ├── bootstrap.ts           # Entry point (async init + start)
│   ├── GameEngine.ts              # Main game class (delegates to 3 modules)
│   ├── GameEngineInit.ts          # Initialization + startGameWithMode()
│   ├── GameEngineInput.ts         # Input event wiring
│   ├── GameEngineLoop.ts          # Frame loop + metrics
│   ├── SystemManager.ts           # System orchestration, game mode setup
│   ├── GameRenderer.ts            # Three.js renderer wrapper
│   ├── RuntimeMetrics.ts          # Runtime metrics for harness
│   ├── SystemInitializer.ts   # Serial system init (critical + deferred)
│   ├── SystemConnector.ts     # Inter-system wiring
│   ├── SystemUpdater.ts       # Per-frame update dispatch with telemetry
│   ├── SystemDisposer.ts      # Cleanup
│   └── WebGLContextRecovery.ts# GPU context loss handling
├── config/            # Game modes, settings, loading phases
│   ├── gameModeTypes.ts       # GameMode enum + GameModeConfig interface
│   ├── gameModes.ts           # Mode config resolver
│   ├── ZoneControlConfig.ts
│   ├── OpenFrontierConfig.ts
│   ├── TeamDeathmatchConfig.ts
│   ├── AiSandboxConfig.ts     # Stress test mode
│   ├── SettingsManager.ts     # User settings (localStorage)
│   ├── audio.ts               # Audio config
│   ├── loading.ts             # Loading phases
│   └── paths.ts               # Asset paths
├── systems/
│   ├── assets/        # Asset loading (textures, models, audio)
│   ├── audio/         # Audio manager, pools, spatial audio
│   │   ├── AudioManager.ts          # Orchestrator
│   │   ├── AudioPoolManager.ts      # Pooled audio nodes
│   │   ├── AudioWeaponSounds.ts     # Weapon fire/reload sounds
│   │   ├── FootstepAudioSystem.ts   # Material-aware footsteps
│   │   ├── AmbientSoundManager.ts   # Environmental audio
│   │   ├── RadioTransmissionSystem.ts# Radio chatter
│   │   ├── VoiceCalloutSystem.ts    # Squad callouts
│   │   └── AudioDuckingSystem.ts    # Priority ducking
│   ├── combat/        # AI combat system (primary perf bottleneck)
│   │   ├── CombatantSystem.ts       # Orchestrator
│   │   ├── CombatantSystemUpdate.ts # Update pipeline
│   │   ├── CombatantAI.ts           # AI controller
│   │   ├── CombatantCombat.ts       # Damage resolution
│   │   ├── CombatantMovement.ts     # NPC movement
│   │   ├── CombatantRenderer.ts     # Instanced billboard rendering
│   │   ├── CombatantLODManager.ts   # LOD + AI budget capping
│   │   ├── CombatantHitDetection.ts # Hit registration
│   │   ├── CombatantDamage.ts       # Damage model
│   │   ├── CombatantSpawnManager.ts # Spawn logic
│   │   ├── SpatialGridManager.ts    # Grid spatial index
│   │   ├── SpatialOctree.ts         # Octree spatial index
│   │   ├── SquadManager.ts          # Squad formation/tactics
│   │   ├── InfluenceMapSystem.ts    # Influence maps
│   │   ├── LOSAccelerator.ts        # LOS broad-phase with cached bounds
│   │   └── ai/                      # AI subsystems
│   │       ├── AIStatePatrol.ts
│   │       ├── AIStateEngage.ts
│   │       ├── AIStateDefend.ts
│   │       ├── AIStateMovement.ts
│   │       ├── AILineOfSight.ts
│   │       ├── AITargetAcquisition.ts
│   │       ├── AIFlankingSystem.ts
│   │       ├── AICoverSystem.ts
│   │       └── AICoverFinding.ts
│   ├── player/        # First-person player controller
│   │   ├── PlayerController.ts      # Main controller
│   │   ├── PlayerInput.ts           # Input -> command dispatch
│   │   ├── PlayerMovement.ts        # Movement physics
│   │   ├── PlayerHealthSystem.ts    # Health/damage
│   │   ├── PlayerSuppressionSystem.ts# Suppression effects
│   │   ├── PlayerRespawnManager.ts  # Respawn logic
│   │   ├── InventoryManager.ts      # Weapon inventory
│   │   ├── DeathCamSystem.ts        # Death camera
│   │   └── weapon/                  # Weapon rig system
│   │       ├── WeaponRigManager.ts
│   │       ├── WeaponFiring.ts
│   │       ├── WeaponAmmo.ts
│   │       ├── WeaponInput.ts
│   │       ├── WeaponShotCommandBuilder.ts
│   │       └── WeaponShotExecutor.ts
│   ├── helicopter/    # Helicopter model, physics, animation, audio
│   ├── terrain/       # Procedural chunked terrain
│   │   ├── ImprovedChunkManager.ts  # Chunk orchestrator
│   │   ├── ChunkWorkerPool.ts       # Worker pool management
│   │   ├── ChunkWorkerLifecycle.ts  # Worker lifecycle
│   │   ├── ChunkWorkerCode.ts       # Worker generation code
│   │   ├── ChunkLoadingStrategy.ts  # Load prioritization
│   │   ├── ChunkLoadQueueManager.ts # Load queue
│   │   ├── ChunkPriorityManager.ts  # Priority calculation
│   │   ├── ChunkLifecycleManager.ts # Chunk create/dispose
│   │   ├── TerrainMeshMerger.ts     # Incremental ring merging
│   │   ├── HeightQueryCache.ts      # Terrain height cache
│   │   └── ChunkVegetationGenerator.ts # Vegetation placement
│   ├── weapons/       # Weapon systems
│   │   ├── GrenadeSystem.ts         # Grenade physics + explosion
│   │   ├── MortarSystem.ts          # Mortar aiming + projectiles
│   │   ├── SandbagSystem.ts         # Fortification placement
│   │   └── AmmoSupplySystem.ts      # Ammo resupply
│   ├── world/         # World management
│   │   ├── GameModeManager.ts       # Mode lifecycle
│   │   ├── ZoneManager.ts           # Zone capture logic
│   │   ├── ZoneRenderer.ts          # Zone visualization
│   │   └── billboard/               # GPU billboard system
│   │       ├── GlobalBillboardSystem.ts
│   │       ├── GPUBillboardSystem.ts
│   │       ├── BillboardRenderer.ts
│   │       └── BillboardBufferManager.ts
│   ├── effects/       # Visual effects
│   │   ├── TracerPool.ts
│   │   ├── MuzzleFlashPool.ts
│   │   ├── ImpactEffectsPool.ts
│   │   ├── ExplosionEffectsPool.ts
│   │   ├── CameraShakeSystem.ts
│   │   ├── SmokeCloudSystem.ts
│   │   └── PixelationPass.ts
│   ├── environment/   # Environmental systems
│   │   ├── DayNightCycle.ts
│   │   ├── WeatherSystem.ts
│   │   ├── WaterSystem.ts
│   │   └── SkyboxSystem.ts
│   └── debug/         # Profiling and telemetry
│       ├── PerformanceTelemetry.ts  # Frame timing + system breakdown
│       └── ...
├── ui/
│   ├── compass/       # Compass bearing + zone markers
│   ├── controls/      # Touch controls (joystick, fire, look, ADS, weapon bar)
│   ├── design/        # Design tokens, responsive utilities, shared styles
│   ├── end/           # Match end screen
│   ├── hud/           # HUD elements, scoreboard, kill feed, squad menu
│   ├── loading/       # Start screen, mode cards, settings, how-to-play
│   ├── loadout/       # Grenade type selector
│   ├── map/           # Fullscreen tactical map (pinch-zoom, drag-pan)
│   ├── minimap/       # Minimap rendering
│   └── debug/         # Log overlay, performance overlay, time indicator
├── workers/           # Web workers (BVH, chunk generation)
├── shaders/           # GLSL shaders
├── types/             # TypeScript interfaces (SystemInterfaces, global)
└── utils/             # Logger, ObjectPoolManager, math, DeviceDetector
```

## Key Files

| File | Role |
|------|------|
| `src/main.ts` | Module entry, calls `bootstrapGame()` |
| `src/core/bootstrap.ts` | Creates game instance, injects CSS, sets up disposal |
| `src/core/GameEngine.ts` | Main game class (delegates to Init/Input/Loop modules) |
| `src/core/GameEngineInit.ts` | Async init, `startGameWithMode()`, `restartMatch()` |
| `src/core/SystemManager.ts` | System orchestration, pre-generation, mode setup |
| `src/core/SystemUpdater.ts` | Per-frame system dispatch with telemetry markers |
| `src/core/SandboxModeDetector.ts` | URL param parser for sandbox/harness mode |
| `src/config/gameModes.ts` | Mode config resolver (ZoneControl/OpenFrontier/TDM/Sandbox) |
| `src/ui/loading/StartScreen.ts` | Start screen with mode selection |
| `src/ui/design/tokens.ts` | Design tokens (colors, spacing, typography, z-index) |
| `scripts/perf-capture.ts` | Playwright CDP perf harness |
| `scripts/perf-active-driver.js` | Active player scenario driver for harness |
| `scripts/perf-analyze-latest.ts` | Capture artifact analysis |

## Game Modes

| Mode | Map | NPCs | Duration | Enum |
|------|-----|------|----------|------|
| Zone Control | 400x400 | 15v15 | 3 min | `ZONE_CONTROL` |
| Open Frontier | 3200x3200 | 60v60 | 15 min | `OPEN_FRONTIER` |
| Team Deathmatch | 400x400 | 15v15 | 5 min | `TEAM_DEATHMATCH` |
| AI Sandbox | configurable | configurable | unlimited | `AI_SANDBOX` |

## Profiling

### In-Game

- **F2**: Performance overlay (FPS, draw calls, triangles, chunk stats, combatant counts, memory, system breakdown)
- **F1**: Console stats toggle
- **Console**: `perf.report()`, `perf.validate()`, `perf.benchmark(1000)`

### Automated Harness

Playwright CDP-based capture with CPU profiling, heap sampling, Chrome tracing, and runtime telemetry. Two scenarios:

1. **Control** (`PERF_COMBAT=0`): No NPCs, combat disabled. Measures terrain/render baseline.
2. **Combat** (`PERF_COMBAT=1`): Active player with scripted movement/fire, configurable NPC count. Measures full combat load.

Artifacts written to `artifacts/perf/<timestamp>/`: summary.json, validation.json, runtime-samples.json, console.json, cpu-profile.cpuprofile, heap-sampling.json, chrome-trace.json, final-frame.png.

Validation gates: frame budget, hitches, stalls, combat dominance, shot/hit validation, UI contamination.

### CI Performance Checks

`perf-check.yml` runs on push/PR: captures control (20s) + combat (60 NPCs, 20s) profiles, validates frame budgets, uploads artifacts.

## Controls

- **WASD** Move, **Shift** Sprint, **Space** Jump
- **Click** Fire, **Right-click** ADS, **R** Reload
- **1-6** Weapons (1=Shotgun, 2=Grenade, 3=Primary, 4=Sandbag, 5=SMG, 6=Pistol)
- **G** Grenade, **Z** Squad UI, **TAB** Scoreboard
- **B** Deploy/undeploy mortar, **F** Fire mortar, **Arrows** Aim mortar, **Mouse wheel** Adjust pitch
- **F1** Console stats, **F2** Performance overlay, **M** Mortar camera
- **Mobile**: Virtual joystick, touch-drag look, fire/ADS/reload/grenade/scoreboard buttons, weapon bar, helicopter entry/cyclic, mortar deploy/fire/aim pad/camera, sandbag rotate, rally point, squad menu, landscape lock

## Known Tech Debt

- 15 `: any` annotations in source (excluding tests, SystemInterfaces, and .d.ts files)
- `OpenFrontierRespawnMap` uses separate mouse/touch handlers (correct - do not change)
- No weapon switch feedback - `FirstPersonWeapon.ts` silently ignores fire input during switch (line 223)
- Full map (M key hold-to-view) has no touch button - mobile players cannot open the tactical map
- Helicopter auto-hover toggle (Space key in helicopter) has no touch button
- Desktop hotbar slots are display-only (no click handlers) - pointer lock prevents DOM click events
- `window.__engine` and `window.__renderer` exposed for perf harness (intentional)
