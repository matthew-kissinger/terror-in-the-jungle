# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev        # Dev server on localhost:5173
npm run build      # Production build
npm run test:run   # 3366 tests (all passing)
```

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing |
| Spatial | three-mesh-bvh, custom octree/grid |
| Build | Vite 7, TypeScript 5.9 |
| Workers | BVH pool (4), chunk generation workers |
| Tests | Vitest - 96 files, 3366 tests |

## Architecture

~58k lines across 297 source files. Systems-based architecture with orchestrator pattern.

```
src/
├── core/           # Game loop, renderer, bootstrap, WebGL recovery
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
│   ├── hud/        # HUD elements, scoreboard, kill feed, squad radial menu
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
- **B** Deploy/undeploy mortar, **F** Fire mortar, **Arrows** Aim mortar (pitch/yaw), **Mouse wheel** Adjust pitch
- **F1** Console stats, **F2** Performance overlay, **M** Mortar camera
- **Mobile**: Virtual joystick, touch-drag look, fire/ADS/reload/grenade/scoreboard buttons, weapon bar, helicopter entry

## Known Tech Debt

- 16 `: any` annotations in source (excluding tests and SystemInterfaces)
- Mortar has no touch controls - completely inaccessible on mobile. No TouchMortarButton on master. Needs deploy, fire, and aim (pitch/yaw) controls.
- Team Deathmatch mode config exists but is not shown in mode selection UI. A branch (task-69f3364c) has the UI but also regresses SquadRadialMenu touch - cherry-pick only LoadingScreen.ts changes.
- `MobilePauseOverlay` uses `'click'` + `'touchend'` (2 listeners) - could use `pointerdown`. `LoadingScreenWithModes` also uses click but is deprecated/unused.
- `HUDSystem` respawn button uses `onclick` instead of `addEventListener('pointerdown')`
- `RespawnMapView` uses mixed click/touchend pattern (acceptable for this use case)
- `OpenFrontierRespawnMap` uses separate mouse/touch handlers (correct - do not change)

### Unmerged Feature Branches

2 `mycel/*` branches have active worktrees. Both regress the SquadRadialMenu touch fix - do NOT merge directly.

| Feature | Branch suffix | Notes |
|---------|--------------|-------|
| Team Deathmatch UI | task-69f3364c | Adds TDM card to LoadingScreen mode selection. Cherry-pick only LoadingScreen.ts changes - the SquadRadialMenu changes revert the touch fix. |
| Branch cleanup + docs | task-b4afb36a | CLAUDE.md updates + SquadRadialMenu regression. Stale - discard after cherry-picking any useful doc changes. |
