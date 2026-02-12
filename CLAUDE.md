# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev        # Dev server on localhost:5173
npm run build      # Production build
npm run test:run   # 3329 tests (all passing)
```

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing |
| Spatial | three-mesh-bvh, custom octree/grid |
| Build | Vite 7, TypeScript 5.9 |
| Workers | BVH pool (4), chunk generation workers |
| Tests | Vitest - 95 files, 3329 tests |

## Architecture

~58k lines across 296 source files. Systems-based architecture with orchestrator pattern.

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
- **F1** Console stats, **F2** Performance overlay, **M** Mortar camera
- **Mobile**: Virtual joystick, touch-drag look, fire/ADS/reload/grenade/scoreboard buttons, weapon bar, helicopter entry

## Known Tech Debt

- 14 `: any` annotations in source (excluding tests and SystemInterfaces)
- Mortar system only has camera toggle (M key) - deploy/aim/fire wiring was reverted in 4749be6
- Squad commands are issued via UI (Z key) but CombatantAI has zero code to read or respond to `squad.currentCommand` - AI ignores all commands
- Combat continues after match ends - no system halts AI, firing, or spawning when tickets reach 0
- TicketSystem.restartMatch() does not reset player health, ammo, weapons, or respawn queue (fix in progress on branch)
- LoadingScreen and MatchEndScreen buttons use 'click' instead of 'pointerdown' (300ms delay on mobile)
- `audio_backup/` directory tracked in git (22 WAV files, 17MB) - should be removed
- 4 agent-generated scripts tracked in git: `analyze_loc.py`, `complete_refactor.py`, `count_lines.py`, `commit_changes.sh`

### Unmerged Feature Branches

9 `mycel/*` branches with unique commits (plus 2 stale branches). Cherry-pick is the safe merge strategy.

| Feature | Branch suffix | Merge status | Unique change |
|---------|--------------|--------------|---------------|
| Mortar deploy/aim/fire controls | task-0930d0dc | Clean merge | TouchMortarButton + PlayerInput/Controller wiring (was merged then reverted) |
| Settings device-aware | task-62f7bfd2 | Clean merge | LoadingPanels label changes |
| Weather rain GPU scaling | task-642bca99 | Clean merge | WeatherSystem rain particle scaling |
| Compass responsive | task-678e18fa | Clean merge | CompassStyles changes |
| Settings + RespawnMap touch | task-75b4d187 | 1 conflict (CLAUDE.md) | LoadingPanels + OpenFrontierRespawnMap touch |
| TouchWeaponBar dispose fix | task-fa59cd92 | Clean merge | Memory leak fix in TouchWeaponBar |
| SquadRadialMenu touch | task-d4a64fc2 | 2 conflicts (PlayerInput, TouchControls) | Touch wiring (squad already on master via Z key) |
| Kill streak audio | task-fa40bc2b | Clean merge | Kill streak audio stings + PersonalStatsPanel |
| Mobile pause/menu button | task-438ba741 | Clean merge | MobilePauseButton + TouchControls integration |
