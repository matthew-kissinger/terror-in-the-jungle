# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev        # Dev server on localhost:5173
npm run build      # Production build
npm run test:run   # 3316 tests (all passing)
```

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing |
| Spatial | three-mesh-bvh, custom octree/grid |
| Build | Vite 7, TypeScript 5.9 |
| Workers | BVH pool (4), chunk generation workers |
| Tests | Vitest - 94 files, 3316 tests |

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
- Players can fire during weapon switch animation (no `isSwitching()` guard in `FirstPersonWeapon.tryFire()`)
- Mortar system only has camera toggle (M key) - no deploy/aim/fire UI on desktop or mobile
- SquadRadialMenu class exists but is never instantiated or imported anywhere - squad commands inaccessible
- No WebGL context loss recovery - game shows blank screen if GPU context lost (common on mobile tab switch)
- Bootstrap failure shows blank screen with no user-visible error message
- playerSquadId assigned via 500ms setTimeout race condition (SandboxSystemManager line 227)
- Minimap `200x200px` is hardcoded - not responsive for mobile viewports
- Desktop keyboard hints shown on mobile: "Press R to reload", "Press K", "RCTRL", "Press TAB" (5+ locations)
- PersonalStatsPanel/KillFeed overlap on mobile right side (fixed pixel positions)
- Scoreboard 2-column grid not responsive for portrait mobile
- LoadoutSelector weapon/grenade options use click-only (no touch optimization, shows "CLICK to select" on mobile)
- SquadRadialMenu has no touch support (mouse-only, and never wired into game - see above)
- OpenFrontierRespawnMap has no touch support (mouse pan only, no touch handlers)
- WeatherSystem rain particles not scaled by GPU tier on mobile
- Compass not responsive for mobile viewports (no media queries)
- Settings labels not device-aware (show desktop-specific labels on mobile)
- TouchWeaponBar dispose() doesn't clean up event listeners (memory leak)
- No touch buttons for sandbag rotation or rally point placement
- No kill streak audio feedback

### Unmerged Feature Branches

9 completed features exist on `mycel/*` branches but are NOT on master. All merge cleanly individually; risk is sequential conflicts in 4 shared files (PlayerController, PlayerInput, TouchControls, HUDSystem).

| Feature | Branch suffix | Files touched |
|---------|--------------|---------------|
| Settings device-aware | task-62f7bfd2 | SettingsManager.ts |
| Weather rain GPU scaling | task-642bca99 | WeatherSystem.ts |
| Compass responsive | task-678e18fa | CompassStyles.ts |
| OpenFrontierRespawnMap touch | task-dc892cad | OpenFrontierRespawnMap.ts |
| TouchWeaponBar dispose fix | task-fa59cd92 | TouchWeaponBar.ts |
| Sandbag/rally touch buttons | task-a37eca58 | new TouchSandbagButtons, TouchRallyPointButton + PlayerController, PlayerInput, TouchControls |
| SquadRadialMenu touch | task-d4a64fc2 | SquadRadialMenu.ts + PlayerController, PlayerInput, TouchControls |
| TicketSystem restartMatch | task-0fd4fd6c | TicketSystem.ts, HUDSystem.ts + 3 others |
| Kill streak audio | task-fa40bc2b | new files + HUDSystem.ts |
