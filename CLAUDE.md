# Project Notes

Last updated: 2026-03-23

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
npm run validate             # lint + test:run + build + smoke:prod
npm run validate:full        # test:run + build + combat120 capture + perf:compare
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
- Modes: `src/config/gameModeTypes.ts`, `src/config/*Config.ts`, `src/config/MapSeedRegistry.ts`
- Combat: `src/systems/combat/*`
- Navigation: `src/systems/navigation/*` (navmesh, crowd, movement adapter)
- Strategy (A Shau): `src/systems/strategy/*`
- Terrain: `src/systems/terrain/*`
- Vehicles: `src/systems/vehicle/*` (IVehicle, FixedWingPhysics, NPCPilotAI, NPCPilotManager)
- World features: `src/systems/world/*` (WorldFeatureSystem, FirebaseLayoutGenerator, AirfieldLayoutGenerator)
- Harness: `scripts/perf-capture.ts`, `scripts/perf-analyze-latest.ts`, `scripts/perf-compare.ts`
- Scene utilities: `src/utils/SceneUtils.ts` (freezeTransform for static object matrix optimization)
- UI: `src/ui/hud/` (HUD, KillFeed, CrosshairSystem, HelicopterHUD), `src/ui/controls/` (touch buttons, BaseTouchButton, VehicleActionBar), `src/ui/icons/` (IconRegistry), `src/ui/screens/` (GameUI, TitleScreen, ModeSelectScreen, DeployScreen), `src/ui/loading/` (SettingsModal, LoadingProgress), `src/ui/engine/` (UIComponent, FocusTrap)
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
12. Icon integration (2026-03-10; trimmed 2026-03-19): **38** pixel-art PNGs in `public/assets/ui/icons/`. `IconRegistry` centralizes paths; unused emblem/hint/crouch/grenade-throw/map-village assets removed from tree (recover via git if needed). Optimization: `npm run assets:optimize`. See `docs/UI_ICON_MANIFEST.md`.
13. Structure scale + procedural generation + vehicle systems (2026-03-10): STRUCTURE_SCALE 2.0->2.5 with per-category displayScale (props at 0.5x). Procedural firebase generator (3 templates, seeded RNG, zone-based). Procedural airfield generator (runway/taxiway surface patches) is now live in Open Frontier and A Shau, with separate heavy motor-pool staging for M151/M35/M113/M48 assets. Fixed-wing flight physics (lift/drag/stall/bank-and-pull, AC-47/F-4/A-1 configs). NPC pilot AI (7-state FSM with PD controllers). Road surface types (dirt_road/gravel_road/jungle_trail) in terrain shader. 3612+ tests passing.
14. Docs reorganized (2026-03-10): 10 completed docs archived, 3 backlogs merged into ASSET_MANIFEST, consultation report findings captured in PLAN_STATE known debt. Active doc set: CODEBASE_BLOCKS + blocks/, ROADMAP, ARCHITECTURE_RECOVERY_PLAN, PROFILING_HARNESS, PERF_FRONTIER, DEPLOYMENT_VALIDATION, ASSET_MANIFEST, UI_ICON_MANIFEST, TERRAIN_RESEARCH, PLAN_STATE, NEXT_WORK.
15. Codebase hardening pass (2026-03-10): Doc drift fixes (CODEBASE_BLOCKS tick graph, system count, singletons, lifecycle). New test coverage: HelicopterHealthSystem (26 tests), HelicopterDoorGunner (20 tests), NPCPilotAI (42 tests), WeatherLightning (15 tests), NPCFlightController (11 tests). NPC pilot wiring: NPCFlightController bridges NPCPilotAI FSM + FixedWingPhysics for physics-driven air support flight. Spooky mission uses physics-based orbit. 3612+ tests passing.
16. Navmesh path query API + NPC movement overhaul (2026-03-17): NavmeshSystem exposes queryPath/findNearestPoint/isPointOnNavmesh/validateConnectivity via @recast-navigation NavMeshQuery. Connectivity validation wired into ModeStartupPreparer. WALKABLE_SLOPE_ANGLE 40->45, WALKABLE_CLIMB 0.4->0.6. NPC speeds raised 30-70% (NPC_MAX_SPEED 6->8, patrol 7.5, combat approach 5.5, traversal run 10). Forward probe tolerance increased (lip rise 0.45->1.0m). Follower NPCs share leader destination instead of random wander. Zone selection weighted 70/20/10 toward best zone. Leaderless followers advance toward enemy territory. Enemy base fallback uses cascading zone lookups. Navmesh-aware structure placement scoring. Navmesh route guidance infrastructure built but disabled pending WASM validation. Stale docs/artifacts cleaned (.firehose/, tasks.md, memory files). 3561+ tests passing.
17. Engine optimizations + mobile hardening (2026-03-17): Scene graph matrix freeze (`freezeTransform` utility, scene-level `matrixAutoUpdate`/`matrixWorldAutoUpdate` disabled, ~700 static objects frozen, ~50 dynamic objects explicitly opted in). THREE.Cache enabled globally. Effect pool scene management (TracerPool/ExplosionEffectsPool/ImpactEffectsPool/SmokeCloudSystem: inactive effects removed from scene entirely, re-added on spawn). CSS performance hardening (HUD `contain: layout style`, `backdrop-filter` ban on HUD subtree, `will-change`/`translate3d` on animated elements). InputContextManager decoupled input (`isMovementAllowed()`/`isFireAllowed()` for scoreboard-style overlays). Mobile fixes: joystick reset on blur/pagehide/visibilitychange, TouchCrouchButton deleted (crouch removed from gameplay). 3599 tests passing.
18. HUD visibility fix + UI screen redesign (2026-03-17): `backdrop-filter` ban scoped to `@media (pointer: coarse)` only - desktop HUD panels restored (ammo, tickets, timer, kill feed get frosted-glass blur back). Kill feed `.entry` backdrop-filter restored. UI screens redesigned: `GameUI` state machine replaces `StartScreen` (TitleScreen + ModeSelectScreen), `DeployScreen` replaces `RespawnUI` with hero-map layout. Opaque `rgba(8,12,18,0.96)` backgrounds replace blur on all screen overlays. HowToPlayModal + OnboardingOverlay absorbed into SettingsModal as collapsible `<details>` sections. 10 files deleted (StartScreen, RespawnUI, HowToPlayModal, OnboardingOverlay + their CSS/tests), 7 new files created (`src/ui/screens/`). UI code reduced from ~4,500 lines to ~2,900 lines (-35%). 3569 tests passing.
19. Mobile vehicle controls + sensitivity tuning (2026-03-18): VehicleActionBar component (EXIT/FIRE/STAB/LOOK buttons for helicopter mode). Touch sensitivity range halved (0.003-0.015, was 0.006-0.024), accel exponent 1.35->1.15, dead zone 0.5->1.5px. TouchActionButtons test fixed for 5-button layout (CMD+MAP added in PR #36). Fire button visibility gated by aircraft role (attack/gunship only). Auto-hover wired through touch controls. 3586 tests passing.
20. Open Frontier navmesh perf fix (2026-03-18): World-size-aware navmesh parameters prevent browser crash/hang on 3200m maps. Cell size scales with world size (cs=1.0 for <=800m, 1.5 for <=1600m, 2.0 for >1600m). Heightfield sampling scales similarly (4/6/8m). Large worlds use coarser Recast params (ch=0.4, maxEdgeLen=24, minRegionArea=16, detailSampleDist=12). Memory guard aborts solo build >300MB. Tiled threshold reverted to strict greater-than (3200m stays solo). Connectivity validation reduced from all-pairs to home-base representatives. 3584 tests passing.
21. Startup/loading performance (2026-03-19): Inline boot splash in `index.html` (CSS-only pulsing bar, visible <100ms, removed by GameUI.onMount). Granular texture/audio loading progress (per-file `onProgress` callbacks in AssetLoader.init and AudioManager.init, wired through SystemInitializer). Progress bar transition `0.5s ease` -> `0.15s linear` for responsive feel. Navmesh slow-phase hint ("this may take a few seconds") in TitleScreen. 3591 tests passing.
22. Async startup + map seed rotation + Cloudflare deploy (2026-03-20): Open Frontier 10-15s hang eliminated. `VegetationScatterer.regenerateAllAsync()` yields between batches of 3 cells via rAF+setTimeout. `HeightmapGPU.uploadPrebakedGrid()` accepts pre-computed Float32Arrays. `MapSeedRegistry` rotates pre-baked seeds per session (5 OF, 3 ZC, 3 TDM variants). Prebake script (`scripts/prebake-navmesh.ts`) generates heightmaps + navmeshes for all variants with connectivity validation; skips when assets exist (`--force` to regenerate). Vegetation determinism: all `Math.random()` in `ChunkVegetationGenerator` replaced with `hashInts()`. Progress bar reweighted (vegetation 50%, was hidden inside features). Deployed to Cloudflare Pages (`terror-in-the-jungle.pages.dev`). CI: lint+test+build+smoke gate deploy; `vite base` changed from `/terror-in-the-jungle/` to `/`. Service worker caches immutable assets. 3614 tests passing.
23. Frontend/UX hardening pass (2026-03-21): 30 issues fixed across HUD, input, vehicle transitions, CSS. Critical: fire-stop callback bypass context gating (`runRelease`), helicopter entry reordered for atomic HUD swap, ammo display suppressed during weapon switch. HelicopterHUD repositioned flush-left (`align-items: flex-start`), mobile media queries fixed (conflicting position properties). KillFeed uses `animationend` + timeout tracking. Camera saves/restores infantry angles across helicopter transitions. HUD update rates split (timer 1Hz, tickets 10Hz, objectives 2Hz). `'helicopter'` input context added - equipment keys (grenade/sandbag/mortar) gated to infantry-only via `runInfantry`. Helicopter exit uses world quaternion for directional offset. Z-index tier system in primitives.css. `backdrop-filter` removed from gameplay HUD elements. Crosshair pulse reduced + disabled during ADS. Dead code removed from WeaponPill. 3616 tests passing.
24. Mobile fullscreen + HUD fix (2026-03-22): Root cause analysis of 5 mobile bugs. Added `fullscreenchange` listeners to TouchControls orchestrator + VirtualJoystick/TouchLook/TouchHelicopterCyclic (resets pointer captures on viewport change). TouchLook `consumeDelta()` clamped to 0.15 rad magnitude (prevents camera snap from coordinate-space glitches). HelicopterHUD portrait repositioned to bottom-left (was top-right, overlapping minimap). Removed conflicting `max-width:480px` breakpoint. lookZone expanded to 100% height (was 70%, leaving dead zones). Z-index consolidated: `--z-modal:10000` + `--z-modal-overlay:10001` in primitives.css, hardcoded values in 5 CSS files replaced with vars. Mobile-ui CI gate fixed (MAP button visibility check for short landscape). 3621 tests passing.
25. Mobile HUD redesign + fullscreen hardening (2026-03-23): HUD grid simplified (removed joystick/weapon-bar/stats rows on mobile - touch controls are fixed-position, not grid-bound). Status-bar (timer/score) viewport-centered via absolute positioning. Squad indicator mounts to status-bar on touch (was stats column). Health slot directly under minimap. Infantry health hidden in helicopter/plane mode. HelicopterHUD landscape: bottom-center compact strip (was top-right, overlapping minimap). HelicopterHUD portrait: below minimap column. Rally button re-parented into HUD grid (`mountToGrid`). Weapon cycler shows ammo count via `hud:ammo` DOM event from HUDSystem. Interact button repositioned center-right (clear of fire/ADS). LOOK button hidden on touch (cyclic joystick handles free-look). Vehicle action bar 2-column landscape layout. Theme colors changed from blue to amber (`--screen-*` vars). Fullscreen: stale-state workaround (alternate element target), `exitFullscreen()` on mount, TAP FOR FULLSCREEN prompt mounted to `document.body`, visual fullscreen detection via `display-mode` media query. PWA manifest + meta tags added. Pointer lock blocked on touch devices (prevents frozen joystick coords). Orientation lock removed (user chooses). `setPointerCapture` wrapped in try/catch for CDP/synthetic events. Mobile playtest script added (`scripts/mobile-playtest.ts`). Fullscreen bug documented (`docs/FULLSCREEN_BUG.md`). 3621 tests passing.
26. See `docs/NEXT_WORK.md` for the active checklist.

## Documentation Contract

- Update `docs/ARCHITECTURE_RECOVERY_PLAN.md` after architecture/perf decisions.
- Update `docs/PROFILING_HARNESS.md` when capture flags/semantics change.
- See `docs/AGENT_TESTING.md` for agent validation workflows and perf baselines.
- Keep docs concise; remove stale status logs.
