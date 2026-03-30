# Agent Instructions

Last updated: 2026-03-30

## Project

Terror in the Jungle - browser-based 3D combat game. Three.js 0.183, TypeScript 5.9, Vite 8, Vitest 4, Node 22.

Focus: large-scale AI combat (up to 3,000 agents), stable frame-time tails, real-terrain scenarios (A Shau Valley 21km DEM).

## Commands

```bash
npm run dev                      # Vite dev server
npm run build                    # TypeScript + production build
npm run test:run                 # All tests
npm run test:quick               # All tests, dot reporter
npm run test:integration         # Integration scenario tests
npm run validate                 # lint + test + build + smoke:prod
npm run validate:full            # test + build + combat120 capture + perf:compare
npm run lint                     # ESLint
npm run deadcode                 # knip dead code scan
npm run perf:capture:combat120   # Primary perf regression capture
npm run perf:compare             # Compare latest capture vs baselines
```

## Architecture

Entry: `src/main.ts` -> `src/core/bootstrap.ts` -> `GameEngine` -> Init/Input/Loop modules.

44 GameSystem classes, 14 tracked tick groups, 8 singletons. Runtime composition via 3 grouped composers (StartupPlayer, Gameplay, Operational).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system overview, tick graph, and coupling heatmap.

### Key Subsystems

| Domain | Directory | Key Files |
|--------|-----------|-----------|
| Combat | `src/systems/combat/` | CombatantSystem, CombatantAI, SpatialGridManager |
| Terrain | `src/systems/terrain/` | TerrainSystem, HeightQueryCache, CDLODRenderer |
| Strategy | `src/systems/strategy/` | WarSimulator, MaterializationPipeline |
| Player | `src/systems/player/` | PlayerController, PlayerMovement, FirstPersonWeapon |
| Vehicles | `src/systems/helicopter/`, `src/systems/vehicle/` | HelicopterModel, HelicopterPhysics |
| Navigation | `src/systems/navigation/` | NavmeshSystem, NavmeshMovementAdapter |
| World | `src/systems/world/` | GameModeManager, ZoneManager, WorldFeatureSystem |
| UI | `src/ui/` | HUDSystem, GameUI, TouchControls, MinimapSystem |
| Config | `src/config/` | gameModeTypes, *Config, MapSeedRegistry, CombatantConfig |

## Conventions

### Code Style
- TypeScript strict mode
- ESLint with `import/no-cycle` (warn, maxDepth 3)
- No `any` types in SystemInterfaces
- Named constants over magic numbers (see `CombatantConfig.ts`)
- Scratch vector pre-allocation in hot paths

### Testing
- Vitest with jsdom environment
- Shared test utilities in `src/test-utils/`
- Integration tests in `src/integration/scenarios/`

### Patterns to Follow
- Systems implement `GameSystem` interface (init/update/dispose)
- Grouped runtime composers for dependency wiring
- `SimulationScheduler` cadence-based update groups
- `ObjectPool` for hot-path allocations
- `GameEventBus` for cross-system events (queue-and-flush)
- CSS Modules + UIComponent for new UI

### Patterns to Avoid
- Do not add `any` types
- Do not reorder tick groups without checking dependencies
- Do not add systems without updating SystemInitializer + isTrackedSystem()
- Do not commit .env files or secrets

## Documentation

| Doc | Purpose |
|-----|---------|
| [Architecture](docs/ARCHITECTURE.md) | System overview, tick graph, coupling heatmap |
| [Roadmap](docs/ROADMAP.md) | Vision and phase plan |
| [Performance](docs/PERFORMANCE.md) | Profiling commands and scenarios |
| [Development](docs/DEVELOPMENT.md) | Testing, CI, deployment |
| [Backlog](docs/BACKLOG.md) | Open work items |
| [Asset Manifest](docs/ASSET_MANIFEST.md) | 75 GLBs, integration status |
