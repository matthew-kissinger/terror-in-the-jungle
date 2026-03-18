# Project Notes

Last updated: 2026-03-10

## Project

Terror in the Jungle is a browser-based 3D combat game focused on:
- large-scale AI combat
- stable frame-time tails under load
- realistic/testable large-map scenarios (A Shau Valley)

## Daily Commands

```bash
npm run dev
npm run build
npm run test:run
npm run test:quick           # all tests with dot reporter (fast output)
npm run test:integration     # integration scenario tests only
npm run validate             # quick: type-check + unit tests + build
npm run validate:full        # full: test + build + committed combat120 perf check
npm run perf:capture
npm run perf:analyze:latest
```

## Perf Commands

```bash
npm run perf:capture:combat120
npm run perf:capture:openfrontier:short
npm run perf:capture:ashau:short
npm run perf:capture:frontier30m
npm run perf:quick            # quick smoke capture only (not a committed baseline)
npm run perf:compare          # compare latest capture against baselines
npm run perf:update-baseline  # update baseline from latest capture
```

## Runtime Landmarks

- Entry: `src/main.ts`, `src/core/bootstrap.ts`
- Engine: `src/core/GameEngine.ts`, `src/core/GameEngineInit.ts`, `src/core/SystemUpdater.ts`, `src/core/GameEventBus.ts`
- Modes: `src/config/gameModeTypes.ts`, `src/config/*Config.ts`
- Combat: `src/systems/combat/*`
- Navigation: `src/systems/navigation/*` (navmesh, crowd, movement adapter)
- Strategy (A Shau): `src/systems/strategy/*`
- Terrain: `src/systems/terrain/*`
- Vehicles: `src/systems/vehicle/*` (IVehicle, FixedWingPhysics, NPCPilotAI, NPCPilotManager)
- World features: `src/systems/world/*` (WorldFeatureSystem, FirebaseLayoutGenerator, AirfieldLayoutGenerator)
- Harness: `scripts/perf-capture.ts`, `scripts/perf-analyze-latest.ts`, `scripts/perf-compare.ts`
- UI: `src/ui/hud/` (HUD, KillFeed, CrosshairSystem, HelicopterHUD), `src/ui/controls/` (touch buttons, BaseTouchButton), `src/ui/icons/` (IconRegistry), `src/ui/onboarding/`, `src/ui/loading/` (start screen, modals), `src/ui/engine/` (UIComponent, FocusTrap)
- Integration tests: `src/integration/harness/`, `src/integration/scenarios/`
- Test utilities: `src/test-utils/` (shared mocks and factories)

## Current Focus

1. Terrain render/collision divergence fixed: `maxLODLevels` now auto-scales with world size (`computeMaxLODLevels` in TerrainConfig). Open Frontier: 5 LOD levels (was 4), 3.52m vertex spacing (was 7.03m), 1024 heightmap grid (was 512). Eliminates floating vegetation/NPCs on large maps.
2. `combat120` at WARN after micro-optimizations: p99 ~34ms (was 86.9ms), avg ~12.3ms (was 14.2ms), AI starvation ~3.6 (was 12.3). Cover search grid reduced (8x8 + early-out), terrain tick staggered (BVH skips vegetation-rebuild frames).
3. HeightQueryCache batch eviction: 10% batch evict on overflow (was per-miss FIFO). Heap recovery 94%/30.8% vs previous LRU 8.7%. No combat regression.
4. Respawn map fixed for large worlds: dynamic WORLD_SIZE via `setMapWorldSize()`, max zoom scales with world size, left-click drag panning, pointer lock disabled during deploy UI, input context set to 'menu'. RespawnMapController unified to use OpenFrontierRespawnMap for all modes. Spawn point model refactored to `RespawnSpawnPoint` with kind/selectionClass/priority fields.
5. A Shau harness is behavior-valid; next step is mode product passes, then WarSim/heap isolation.
6. Game modes Phases 6-7 complete. Mode product passes (Phase 5) are the next gameplay work.
7. Player-facing content pass (2026-03-08): 6 weapon types (added M60 LMG + M79 launcher), player tracers, grenade/kill-streak audio, graphics quality tiers control post-processing, AnimalSystem (ambient wildlife), structure placements on TDM/ZC/A Shau, ProgrammaticGunFactory deleted.
8. Slope physics + navmesh pathfinding (2026-03-08): Player slope speed/slide/step-up gating, NPC slope penalty, @recast-navigation WASM navmesh (solo + tiled), crowd simulation with LOD-gated steering, structure footprint obstacles. 3040 tests passing.
9. Magic number extraction (2026-03-08): ~125 magic numbers replaced with named constants across 12 files. Shared cross-file config in `src/config/CombatantConfig.ts` (NPC_Y_OFFSET, NPC_MAX_SPEED, NPC_HEALTH, OPFOR_OBJECTIVE_FOCUS_CHANCE). Single-file constants grouped by category at top of each module. 3040 tests passing.
10. Architecture + features pass (2026-03-09): 7 `any` types fixed in SystemInterfaces, `import/no-cycle` ESLint rule, deferred init timeout (15s), SpawnPointSelector extracted (PlayerRespawnManager 857->594 lines), GameEventBus (typed, queue-and-flush), SpectatorCamera (post-death follow cam), MissionBriefing (A Shau overlay), SquadDeployFromHelicopter (G key tactical insertion from helicopter), shared test utilities (`src/test-utils/`), InputContextManager+InputManager tests. CI perf job gates deploy. 3159 tests passing.
11. UI/UX overhaul (2026-03-09): BaseTouchButton shared pointer handling (-128 lines net across 6 buttons), joystickMath dead-zone utility, KillFeed refactored to CSS module with slide-out/streak-glow animations, FocusTrap utility for modals, SettingsModal/HowToPlayModal accessibility (ARIA, fieldsets, Escape-to-close, helicopter controls section, graphics quality descriptions), HelicopterHUD flight instruments (airspeed/heading/VSI/weapon status/damage bar), CrosshairSystem replaces CrosshairUI (4 modes: infantry/helicopter_transport/gunship/attack pipper), AircraftWeaponMount configs, OnboardingOverlay (5-page opt-in tutorial from start screen), mobile gestures (weapon swipe, ADS hold mode, crouch button, haptic feedback, grenade quick-throw, minimap pinch zoom).
12. Icon integration (2026-03-10): 50 pixel-art PNG icons (252KB) in `public/assets/ui/icons/`. Centralized `IconRegistry` (`src/ui/icons/IconRegistry.ts`) with `icon()`, `iconImg()`, `iconHtml()`, weapon icon lookups. All 16 UI consumers migrated from scattered `import.meta.env.BASE_URL` paths. Old `WeaponIconRegistry` deleted. Touch buttons, kill feed, helicopter HUD, crosshair reticles, faction emblems, onboarding hints, minimap markers all use PNG icons. `scripts/optimize-icons.mjs` handles optimization. Icon manifest at `docs/UI_ICON_MANIFEST.md`. 3398 tests passing.
13. Structure scale + procedural generation + vehicle systems (2026-03-10): STRUCTURE_SCALE 2.0->2.5 with per-category displayScale (props at 0.5x). Procedural firebase generator (3 templates, seeded RNG, zone-based). Procedural airfield generator (runway/taxiway surface patches) is now live in Open Frontier and A Shau, with separate heavy motor-pool staging for M151/M35/M113/M48 assets. Fixed-wing flight physics (lift/drag/stall/bank-and-pull, AC-47/F-4/A-1 configs). NPC pilot AI (7-state FSM with PD controllers). Road surface types (dirt_road/gravel_road/jungle_trail) in terrain shader. 3612+ tests passing.
14. Docs reorganized (2026-03-10): 10 completed docs archived, 3 backlogs merged into ASSET_MANIFEST, consultation report findings captured in PLAN_STATE known debt. Active doc set: CODEBASE_BLOCKS + blocks/, ROADMAP, ARCHITECTURE_RECOVERY_PLAN, PROFILING_HARNESS, PERF_FRONTIER, DEPLOYMENT_VALIDATION, ASSET_MANIFEST, UI_ICON_MANIFEST, TERRAIN_RESEARCH, PLAN_STATE, NEXT_WORK.
15. Codebase hardening pass (2026-03-10): Doc drift fixes (CODEBASE_BLOCKS tick graph, system count, singletons, lifecycle). New test coverage: HelicopterHealthSystem (26 tests), HelicopterDoorGunner (20 tests), NPCPilotAI (42 tests), WeatherLightning (15 tests), NPCFlightController (11 tests). NPC pilot wiring: NPCFlightController bridges NPCPilotAI FSM + FixedWingPhysics for physics-driven air support flight. Spooky mission uses physics-based orbit. 3612+ tests passing.
16. Navmesh path query API + NPC movement overhaul (2026-03-17): NavmeshSystem exposes queryPath/findNearestPoint/isPointOnNavmesh/validateConnectivity via @recast-navigation NavMeshQuery. Connectivity validation wired into ModeStartupPreparer. WALKABLE_SLOPE_ANGLE 40->45, WALKABLE_CLIMB 0.4->0.6. NPC speeds raised 30-70% (NPC_MAX_SPEED 6->8, patrol 7.5, combat approach 5.5, traversal run 10). Forward probe tolerance increased (lip rise 0.45->1.0m). Follower NPCs share leader destination instead of random wander. Zone selection weighted 70/20/10 toward best zone. Leaderless followers advance toward enemy territory. Enemy base fallback uses cascading zone lookups. Navmesh-aware structure placement scoring. Navmesh route guidance infrastructure built but disabled pending WASM validation. Stale docs/artifacts cleaned (.firehose/, tasks.md, memory files). 3561+ tests passing.
17. See `docs/NEXT_WORK.md` for the active checklist.

## Documentation Contract

- Update `docs/ARCHITECTURE_RECOVERY_PLAN.md` after architecture/perf decisions.
- Update `docs/PROFILING_HARNESS.md` when capture flags/semantics change.
- See `docs/AGENT_TESTING.md` for agent validation workflows and perf baselines.
- Keep docs concise; remove stale status logs.
