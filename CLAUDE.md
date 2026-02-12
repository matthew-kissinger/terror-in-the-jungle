# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev        # Dev server on localhost:5173
npm run build      # Production build
npm run test:run   # 3370 tests (all passing)
```

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing |
| Spatial | three-mesh-bvh, custom octree/grid |
| Build | Vite 7, TypeScript 5.9 |
| Workers | BVH pool (4), chunk generation workers |
| Tests | Vitest - 96 files, 3370 tests |

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
- **Mobile**: Virtual joystick, touch-drag look, fire/ADS/reload/grenade/scoreboard buttons, weapon bar, helicopter entry, mortar deploy/fire/aim pad, sandbag rotate, rally point, landscape lock

## Known Tech Debt

- 9 `: any` annotations in source (excluding tests, SystemInterfaces, and .d.ts files)
- Helicopter cyclic controls (pitch/roll) have no touch equivalent - players can enter/exit helicopter and control collective/yaw via joystick, but cannot pitch forward/backward or bank left/right on mobile. Arrow key controls in `PlayerMovement.ts` lines 250-268 are desktop-only.
- Mortar camera toggle (M key) has no touch button - `TouchMortarButton.ts` has deploy/fire/aim but no camera view toggle.
- `RespawnUI.ts` respawn button uses `onclick` (line 272) instead of `pointerdown` - causes 300ms touch delay on respawn.
- `FullMapDOMHelpers.ts` zoom buttons use `onclick` (lines 42, 47, 52) instead of `pointerdown` - 300ms delay on mobile map controls.
- `bootstrap.ts` error recovery button uses `onclick` (line 35) instead of `pointerdown`.
- `OpenFrontierRespawnMap` uses separate mouse/touch handlers (correct - do not change)
- `FirstPersonWeapon.ts` blocks reload while ADS (line 344) - player must exit ADS before reloading, breaks combat flow.
- No zone capture celebration - `ZoneManager.ts` only increments stat counter, no audio callout or screen notification.
- No weapon switch feedback - `FirstPersonWeapon.ts` silently ignores fire input during switch (line 223).
- Full map (M key hold-to-view) has no touch button - mobile players cannot open the tactical map. `FullMapInput.ts` only listens for keyboard events.
- Unmerged branches: `mycel/task-315f7324` has helicopter cyclic touch controls (commit e495052), `mycel/task-65efcfd0` has RespawnUI pointerdown fix + mortar camera button (commit b7e8e45). Both tested and passing but need cherry-pick to master.
