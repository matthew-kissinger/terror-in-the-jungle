# Agent Instructions

Last updated: 2026-03-10

## Project

Terror in the Jungle is a browser-based 3D combat game built on Three.js r182. Focus areas:
- Large-scale AI combat (up to 3000 agents)
- Stable frame-time tails under load
- Realistic/testable large-map scenarios (A Shau Valley, 21km DEM)

Tech stack: TypeScript 5.9, Three.js r182, Vite 7.3, Vitest 4.0, Node 22

## Commands

```bash
npm run dev                      # dev server
npm run build                    # production build
npm run test:run                 # all tests
npm run test:quick               # all tests with dot reporter
npm run test:integration         # integration scenario tests only
npm run validate                 # lint + test + build + smoke
npm run validate:full            # validate + committed perf check
npm run lint                     # eslint
npm run deadcode                 # knip dead code scan
npm run perf:capture:combat120   # perf capture: 120 NPCs
npm run perf:compare             # compare latest capture against baselines
```

## Architecture

Systems-based orchestration with ~23 subsystems managed by SystemManager.

### Entry Points
- `src/main.ts` -> `src/core/bootstrap.ts` -> `GameEngine` -> Init/Input/Loop modules

### Core Runtime
- `src/core/GameEngine.ts` - top-level coordinator
- `src/core/GameEngineInit.ts` - startup coordinator (lazy-loads mode/deploy pipeline)
- `src/core/SystemUpdater.ts` - per-frame dispatch with EMA budgets
- `src/core/SystemManager.ts` - system registry (~44 systems)
- `src/core/GameEventBus.ts` - typed singleton event queue (queue-and-flush)
- `src/core/SimulationScheduler.ts` - cadence-based update groups

### Runtime Composers (extracted from SystemConnector)
- `StartupPlayerRuntimeComposer.ts` - player/UI/deploy wiring
- `GameplayRuntimeComposer.ts` - combat/world/game-mode/environment
- `OperationalRuntimeComposer.ts` - strategy/vehicle/air-support

### Key Subsystems
| Domain | Directory | Key Files |
|--------|-----------|-----------|
| Combat | `src/systems/combat/` | CombatantSystem, CombatantAI, SpatialGridManager, LODManager |
| Combat AI | `src/systems/combat/ai/` | AIStateEngage, AIStatePatrol, AITargetAcquisition |
| Terrain | `src/systems/terrain/` | TerrainSystem, HeightQueryCache, CDLODRenderer |
| Strategy | `src/systems/strategy/` | WarSimulator, MaterializationPipeline, StrategicDirector |
| Player | `src/systems/player/` | PlayerController, PlayerMovement, PlayerRespawnManager |
| Weapons | `src/systems/weapons/` | GunplayCore, GrenadeSystem, MortarSystem, SandbagSystem |
| Helicopter | `src/systems/helicopter/` | HelicopterModel, HelicopterPhysics, HelicopterWeaponSystem, HelicopterHealthSystem, HelicopterDoorGunner |
| Vehicle | `src/systems/vehicle/` | VehicleManager, FixedWingPhysics, NPCPilotAI, NPCVehicleController |
| World | `src/systems/world/` | GameModeManager, ZoneManager, WorldFeatureSystem, AnimalSystem |
| Navigation | `src/systems/navigation/` | NavmeshSystem, NavmeshMovementAdapter |
| Air Support | `src/systems/airsupport/` | AirSupportManager, AAEmplacement, NapalmMission |
| Audio | `src/systems/audio/` | AudioManager, FootstepAudioSystem |
| Effects | `src/systems/effects/` | TracerPool, MuzzleFlashSystem, PostProcessingManager |
| Environment | `src/systems/environment/` | WeatherSystem, WaterSystem, Skybox |
| UI | `src/ui/` | HUD (18-region CSS Grid), touch controls, minimap, modals |
| Icons | `src/ui/icons/` | IconRegistry (centralized, 50 pixel-art PNGs) |

### Config
- Game modes: `src/config/gameModeTypes.ts`, `src/config/*Config.ts`
- Shared NPC constants: `src/config/CombatantConfig.ts`
- 5 game modes: Zone Control, Open Frontier, TDM, AI Sandbox, A Shau Valley

## Codebase Stats (2026-03-10)

- ~376 source files, ~170 test files, 3,482+ tests passing
- 133K LOC TypeScript
- 75 GLB models, 50 UI icons, 31 audio files
- 25 CSS modules
- 8 runtime dependencies (three, signals, three-mesh-bvh, @recast-navigation, fonts)
- Build output: ~714KB main + ~694KB three.js + ~392KB UI chunk (gzipped)

## Documentation

Read order:
1. `docs/CODEBASE_BLOCKS.md` - start here (hub index)
2. `docs/blocks/` - per-domain sub-docs (10 files)
3. `docs/ROADMAP.md` - aspirational vision
4. `docs/PLAN_STATE.md` - wave tracker + known architecture debt
5. `docs/NEXT_WORK.md` - active checklist (work top-down)

Reference docs: ARCHITECTURE_RECOVERY_PLAN, PROFILING_HARNESS, PERF_FRONTIER, DEPLOYMENT_VALIDATION, ASSET_MANIFEST, UI_ICON_MANIFEST, TERRAIN_RESEARCH, AGENT_TESTING

## Conventions

### Code Style
- TypeScript strict mode
- ESLint with import/no-cycle (warn, maxDepth 3)
- No `any` types in SystemInterfaces
- Named constants over magic numbers (see CombatantConfig.ts pattern)
- Scratch vector pre-allocation in hot paths (GC avoidance)

### Testing
- Vitest with jsdom environment
- Shared test utilities in `src/test-utils/`
- Integration tests in `src/integration/scenarios/`
- Perf captures via `scripts/perf-capture.ts`

### Documentation Contract
- Update `docs/ARCHITECTURE_RECOVERY_PLAN.md` after architecture/perf decisions
- Update `docs/PROFILING_HARNESS.md` when capture flags/semantics change
- Update relevant `docs/blocks/*.md` when systems change
- Keep docs concise; remove stale status logs

### Patterns to Follow
- Systems implement `GameSystem` interface (init/update/dispose)
- Setter injection for wiring (moving toward grouped runtime composers)
- Budget-monitored tick groups in SystemUpdater
- ObjectPool for hot-path allocations (Vector3, Quaternion, Raycaster, Matrix4)
- GameEventBus for cross-system events (queue-and-flush per frame)
- CSS Modules + UIComponent pattern for new UI

### Patterns to Avoid
- Do not add `any` types
- Do not reorder tick groups without checking downstream dependencies
- Do not add systems without updating SystemReferences + isTrackedSystem()
- Do not commit .env files or secrets
- Do not skip pre-commit hooks

## Known Architecture Debt

1. SystemManager 40-prop god object / 4-file ceremony for new systems
2. PlayerController 47 setter methods (deferred init ceremony)
3. Variable deltaTime physics (no fixed timestep for player/helicopter)
4. Three coexisting UI paradigms (~57 files with raw createElement)
5. Partial singleton reset coverage (blocks HMR and "return to menu")

## Perf Context

- `combat120` scenario at WARN: p99 ~30-35ms (target <16ms)
- AI starvation largely solved (~4 events/sample)
- Terrain-led tails effectively solved
- Top remaining bottleneck: synchronous cover search in AIStateEngage.initiateSquadSuppression()
