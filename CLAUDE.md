# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev        # Dev server on localhost:5173
npm run build      # Production build
npm run test:run   # 3318 tests (all passing)
```

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing |
| Spatial | three-mesh-bvh, custom octree/grid |
| Build | Vite 7, TypeScript 5.9 |
| Workers | BVH pool (4), chunk generation workers |
| Tests | Vitest - 94 files, 3318 tests |

## Architecture

~57k lines across 292 source files. Systems-based architecture with orchestrator pattern.

```
src/
├── core/           # Game loop, renderer, bootstrap
├── systems/
│   ├── audio/      # Ambient, radio, footsteps, weapon sounds, voice callouts
│   ├── combat/     # AI targeting, flanking, cover, spatial octree, influence maps
│   ├── player/     # Controller, weapons, health, flashbang
│   ├── helicopter/ # Model, physics, animation, audio
│   ├── terrain/    # Chunks, workers, vegetation, GPU terrain
│   ├── weapons/    # Gunplay, grenades, mortars, ammo, sandbags, pickups
│   ├── world/      # Zones, billboards, tickets
│   ├── debug/      # PerformanceTelemetry
│   ├── effects/    # Pools (tracers, muzzle, impact, explosion), smoke
│   └── environment/# Day/night, weather, water, skybox
├── ui/
│   ├── compass/    # Compass bearing + zone markers
│   ├── controls/   # Touch controls (joystick, fire, look, ADS, weapon bar, actions)
│   ├── end/        # Match end screen (responsive)
│   ├── hud/        # HUD elements, scoreboard, kill feed
│   ├── loading/    # Loading screen, mode selection (touch-to-start)
│   ├── loadout/    # Weapon + grenade loadout selector (touch deploy button)
│   ├── map/        # Fullscreen map (pinch-zoom, drag-pan), respawn map
│   └── minimap/    # Minimap styles + rendering
├── workers/        # BVHWorker, ChunkWorker
├── shaders/        # GLSL shaders
├── config/         # Game modes, loading phases, settings
└── utils/          # Logger, ObjectPoolManager, math, DeviceDetector
```

## Key Files

- `src/core/PixelArtSandbox.ts` - Main game class (split into 3 modules)
- `src/core/PixelArtSandboxInit.ts` - Async initialization + `startGameWithMode()`
- `src/core/bootstrap.ts` - Entry point (async, awaits initialization)
- `src/ui/loading/LoadingScreen.ts` - Loading screen with mode selection

## Game Modes

| Mode | Map | NPCs | Duration |
|------|-----|------|----------|
| Zone Control | 400x400 | 15v15 | 3 min |
| Open Frontier | 3200x3200 | 60v60 | 15 min |
| Team Deathmatch | 400x400 | 15v15 | 5 min |

## Profiling Tools

- **F2 Overlay**: FPS, draw calls, triangles, chunk stats, combatant counts, memory
- **Console `perf.report()`**: Full telemetry report
- **Console `perf.benchmark(1000)`**: Raycast/hit detection benchmark
- **AI Sandbox mode**: `?sandbox=true&npcs=80&autostart=true` for automated testing

## Controls

- **WASD** Move, **Shift** Sprint, **Space** Jump
- **Click** Fire, **RClick** ADS, **R** Reload
- **1-6** Weapons, **G** Grenade, **Z** Squad UI, **TAB** Scoreboard
- **F1** Console stats, **F2** Performance overlay, **M** Mortar camera
- **Mobile**: Virtual joystick, touch-drag look, fire/ADS/reload/grenade/scoreboard buttons, weapon bar, helicopter entry

## Known Tech Debt

- 16 `: any` annotations in source (excluding tests and SystemInterfaces)
- Mortar system only has camera toggle (M key) - no deploy/aim/fire UI on desktop or mobile
- SquadRadialMenu class exists but is never instantiated or imported anywhere - squad commands inaccessible
- Bootstrap failure shows blank screen with no user-visible error message
- playerSquadId assigned via 500ms setTimeout race condition (SandboxSystemManager line 227)
- TicketSystem.restartMatch() does not reset player health, ammo, weapons, or respawn queue
- Master is 86 commits ahead of origin - live GitHub Pages site is significantly behind

### Unmerged Feature Branches

12 completed features exist on `mycel/*` branches but are NOT on master. A merge task (cbfd9b2d) has been created to cherry-pick them all in dependency-safe order.

| Feature | Branch suffix | Files touched |
|---------|--------------|---------------|
| Settings device-aware | task-62f7bfd2 | SettingsManager.ts, LoadingPanels.ts |
| Weather rain GPU scaling | task-642bca99 | WeatherSystem.ts |
| Compass responsive | task-678e18fa | CompassStyles.ts |
| OpenFrontierRespawnMap touch | task-dc892cad | OpenFrontierRespawnMap.ts |
| TouchWeaponBar dispose fix | task-fa59cd92 | TouchWeaponBar.ts |
| DeathCam camera restore | task-2b52030b | DeathCamSystem.ts |
| Keyboard hints device-aware | task-b21be059 | Multiple HUD files |
| Minimap responsive + panel overlap | task-cb81f260 | MinimapStyles.ts, HUD files |
| Scoreboard responsive | task-f04c697c | Scoreboard.ts |
| Sandbag/rally touch buttons | task-a37eca58 | new files + PlayerController, PlayerInput, TouchControls |
| SquadRadialMenu touch | task-d4a64fc2 | SquadRadialMenu.ts + PlayerController, PlayerInput, TouchControls |
| Kill streak audio | task-fa40bc2b | new files + HUDSystem.ts |
