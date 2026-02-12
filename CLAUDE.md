# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev        # Dev server on localhost:5173
npm run build      # Production build
npm run test:run   # 3256 tests (all passing)
```

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing |
| Spatial | three-mesh-bvh, custom octree/grid |
| Build | Vite 7, TypeScript 5.9 |
| Workers | BVH pool (4), chunk generation workers |
| Tests | Vitest - 85 files, 3256 tests |

## Architecture

~55k lines across 288 source files. Systems-based architecture with orchestrator pattern.

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
│   ├── controls/   # Touch controls (joystick, fire, look, action buttons)
│   ├── hud/        # HUD elements (11 modules)
│   ├── loading/    # Loading screen, mode selection
│   └── map/        # Fullscreen map, minimap
├── workers/        # BVHWorker, ChunkWorker
├── shaders/        # GLSL shaders
├── config/         # Game modes, loading phases
└── utils/          # Logger, ObjectPoolManager, math
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

## Known Tech Debt

- 15 `: any` annotations across source files (excluding tests and SystemInterfaces)
- Mobile touch controls are MVP - no ADS, weapon switching, or helicopter controls on touch yet
- Touch controls (5 files in `src/ui/controls/`) have zero test coverage
- HUD uses hard-coded pixel positions/sizes - not responsive for mobile viewports
- RespawnUI has `min-width: 600px` map panel - overflows on phones
- `TicketSystem.restartMatch()` unused - UI uses `window.location.reload()` instead
- `PixelArtSandboxInit.ts:45` catches init errors but swallows them silently (no user feedback)
- TouchLook sensitivity hardcoded to 0.004 - not connected to SettingsManager
- No mobile GPU detection or auto-quality scaling for touch devices
- Squad radial menu UI exists but commands are non-functional placeholders
