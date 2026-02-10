# Terror in the Jungle

3D pixel art battlefield with GPU-accelerated billboard rendering of 200k+ vegetation in procedurally generated jungle.

**Live**: https://matthew-kissinger.github.io/terror-in-the-jungle/

## Commands

```bash
npm install
npm run dev        # Dev server on localhost:5173
npm run build      # Production build
npm run test:run   # 2915 tests (all passing)
```

## Critical Bug: Game Won't Start

**The game builds and tests pass, but is NOT playable.**

In `src/core/PixelArtSandbox.ts` line 61, `this.initializeSystems()` is called from the constructor without `await`. Since constructors can't be async, the promise runs in the background. If any error occurs during async initialization (`systemManager.initializeSystems`, `loadGameAssets`, `preGenerateSpawnArea`), it's silently caught and `isInitialized` never becomes `true`. The `startGameWithMode()` guard (`if (!sandbox.isInitialized) return`) blocks the game from starting.

**Fix approach**: Restructure bootstrap to await initialization:
```typescript
// bootstrap.ts - make async
export async function bootstrapGame(): Promise<void> {
  const sandbox = new PixelArtSandbox();
  await sandbox.initialize();  // Extract async init from constructor
  sandbox.start();
}
```

**Key files**:
- `src/core/PixelArtSandbox.ts` - Main game class (144 lines, split into 3 modules)
- `src/core/PixelArtSandboxInit.ts` - Async initialization + `startGameWithMode()`
- `src/core/bootstrap.ts` - Entry point that creates and starts the sandbox
- `src/ui/loading/LoadingScreen.ts` - Loading screen with mode selection

## Stack

| Layer | Tech |
|-------|------|
| Graphics | Three.js r182 + postprocessing |
| Spatial | three-mesh-bvh, custom octree/grid |
| Build | Vite 7, TypeScript 5.9 |
| Workers | BVH pool (4), chunk generation workers |
| Tests | Vitest - 75 files, 2915 tests |

## Architecture

~54k lines across 281 files. Systems-based architecture with orchestrator pattern.

```
src/
├── core/           # Game loop, renderer, bootstrap
├── systems/
│   ├── combat/     # AI targeting, flanking, cover, spatial octree, influence maps
│   ├── player/     # Controller, weapons, health, flashbang
│   ├── helicopter/ # Model, physics, animation, audio
│   ├── terrain/    # Chunks, workers, vegetation, GPU terrain
│   ├── world/      # Zones, billboards, tickets
│   ├── debug/      # PerformanceTelemetry
│   └── effects/    # Pools (tracers, muzzle, impact, explosion), smoke
├── ui/
│   ├── hud/        # HUD elements (11 modules)
│   ├── loading/    # Loading screen, mode selection
│   └── map/        # Fullscreen map, minimap
├── workers/        # BVHWorker, ChunkWorker
├── shaders/        # GLSL shaders
├── config/         # Game modes, loading phases
└── utils/          # Logger, ObjectPoolManager, math
```

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

- 26 `: any` annotations across source files (excluding tests and SystemInterfaces)
- `window.game` global fully migrated to module singletons
- Missing audio: grenade throw/pin pull, mortar launch, weapon pickup
- `TicketSystem.restartMatch()` unused - UI uses `window.location.reload()` instead
