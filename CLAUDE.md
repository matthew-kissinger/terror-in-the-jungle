# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev        # Dev server on localhost:5173
npm run build      # Production build
npm run test:run   # 3388 tests (all passing)
```

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing v6.37 |
| Spatial | three-mesh-bvh v0.9, custom octree/grid |
| Build | Vite 7.1, TypeScript 5.9 |
| Workers | BVH pool (4), chunk generation workers |
| Tests | Vitest 4.0 - 98 files, 3388 tests |

## Architecture

~60k lines across 308 source files. Systems-based architecture with orchestrator pattern.

```
src/
├── core/           # Game loop, renderer, bootstrap, WebGL recovery
├── systems/
│   ├── assets/     # Asset loading
│   ├── audio/      # Ambient, radio, footsteps, weapon sounds, voice callouts
│   ├── combat/     # AI targeting, flanking, cover, spatial octree, influence maps
│   │   └── ai/    # AI state machine (patrol, engage, defend), LOS, targeting
│   ├── player/     # Controller, movement, weapons, health, flashbang, respawn
│   │   └── weapon/ # Weapon rig, ammo, shot commands, input handling
│   ├── helicopter/ # Model, physics, animation, audio, helipad
│   ├── terrain/    # Chunks, workers, vegetation, height queries, mesh merging
│   ├── weapons/    # Gunplay, grenades, mortars, ammo, sandbags, pickups
│   ├── world/      # Zones, billboards, tickets
│   │   └── billboard/ # Billboard buffer management
│   ├── debug/      # PerformanceTelemetry, GPU timing, benchmarks
│   ├── effects/    # Pools (tracers, muzzle, impact, explosion), smoke, pixelation
│   └── environment/# Day/night, weather, water, skybox
├── ui/
│   ├── compass/    # Compass bearing + zone markers
│   ├── controls/   # Touch controls (joystick, fire, look, ADS, weapon bar, actions)
│   ├── design/     # Design tokens, responsive utilities, shared styles
│   ├── end/        # Match end screen (responsive)
│   ├── hud/        # HUD elements, scoreboard, kill feed, squad radial menu
│   ├── loading/    # Start screen, mode cards, settings modal, how-to-play
│   ├── loadout/    # Grenade type selector (touch deploy button)
│   ├── map/        # Fullscreen map (pinch-zoom, drag-pan), respawn map
│   ├── minimap/    # Minimap styles + rendering
│   └── debug/      # Log overlay, performance overlay, time indicator
├── workers/        # BVHWorker, ChunkWorker
├── shaders/        # GLSL shaders
├── config/         # Game modes, loading phases, settings
├── types/          # TypeScript interfaces and declarations
└── utils/          # Logger, ObjectPoolManager, math, DeviceDetector
```

## Key Files

- `src/core/PixelArtSandbox.ts` - Main game class (split into 3 modules)
- `src/core/PixelArtSandboxInit.ts` - Async initialization + `startGameWithMode()`
- `src/core/SandboxSystemManager.ts` - System orchestration, pre-generation, game mode setup
- `src/core/bootstrap.ts` - Entry point (async, awaits initialization)
- `src/ui/loading/StartScreen.ts` - Start screen with mode selection
- `src/ui/design/tokens.ts` - Design tokens (colors, spacing, typography, z-index)

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
- **1-6** Weapons (1=Shotgun, 2=Grenade, 3=Primary, 4=Sandbag, 5=SMG, 6=Pistol), **G** Grenade, **Z** Squad UI, **TAB** Scoreboard
- **B** Deploy/undeploy mortar, **F** Fire mortar, **Arrows** Aim mortar (pitch/yaw), **Mouse wheel** Adjust pitch
- **F1** Console stats, **F2** Performance overlay, **M** Mortar camera
- **Mobile**: Virtual joystick, touch-drag look, fire/ADS/reload/grenade/scoreboard buttons, weapon bar, helicopter entry/cyclic, mortar deploy/fire/aim pad/camera, sandbag rotate, rally point, squad menu, landscape lock

## Known Tech Debt

- 14 `: any` annotations in source (excluding tests, SystemInterfaces, and .d.ts files)
- `OpenFrontierRespawnMap` uses separate mouse/touch handlers (correct - do not change)
- No weapon switch feedback - `FirstPersonWeapon.ts` silently ignores fire input during switch (line 223).
- Full map (M key hold-to-view) has no touch button - mobile players cannot open the tactical map. `FullMapInput.ts` only listens for keyboard events.
- Helicopter auto-hover toggle (Space key in helicopter) has no touch button - mobile pilots cannot toggle hover mode.
- Desktop hotbar slots are display-only (no click handlers) - pointer lock prevents DOM click events during gameplay. Weapon switching is keyboard-only (keys 1-6) on desktop, touch weapon bar on mobile.
