# Architecture Recovery Plan

Last updated: 2026-03-17
Scope: runtime architecture stabilization with performance and gameplay fidelity gates.

## Current Goal

- Deliver stable large-scale combat with consistent frame tails.
- Stabilize A Shau mode flow so it is testable and tactically coherent.
- Reduce core startup and wiring fragility now that the deployed boot path is stable again.

## Progress Checkpoint (2026-03-04, Evening)

- Harness fidelity has materially improved: duplicate player-death accounting is fixed, long-run ammo sustain is explicit, and required scenarios are behavior-valid.
- Architecture risk has shifted from "measurement reliability" to "tail closure":
  - `combat120` still fails on p99/starvation despite better average frame time and stronger combat pressure.
  - `frontier30m` still fails on long-tail stability while mean frame time remains healthy.
- Strategic posture is unchanged: continue low-friction, evidence-backed CPU/harness work first; hold frontier block replacements (WebGPU/WASM/worker architecture shifts) until tail gates are met.

## Priority Board

| Priority | Workstream | Status | Notes |
|---|---|---|---|
| P0 | Harness integrity and measurement quality | IN_PROGRESS | Required Phase 1 scenarios are behavior-valid. Duplicate HUD death accounting and long-run ammo depletion in active-driver runs were fixed on 2026-03-04. Remaining gap: `systemTop` is still secondary to `userTimingByName` for authoritative tick-group analysis. |
| P1 | Spatial ownership unification (F3) | DONE | Legacy SpatialOctree removed from CombatantSystem. All consumers (AI, LOD, spawn, hit detection) use SpatialGridManager singleton. Secondary sync and dedup feature flags removed. |
| P2 | Heap growth triage in combat-heavy runs | IN_PROGRESS | New diagnostics added. Latest Phase 2 evidence still points to churn-heavy waves rather than a proven unbounded leak. A frame-local `AITargetAcquisition` neighborhood cache improved warm `combat120` starvation (`16.82 -> 12.91`) and heap growth (`15.73MB -> 3.64MB`). A second accepted March 4 optimization in `AIStateEngage.initiateSquadSuppression()` (flank-probe elevation + probe allocation cleanup) reduced warm combat tails/stalls again (`Combat.maxDurationMs 259.7ms -> 218.6ms/182.3ms`, long tasks `74 -> 47/31`), but rare p99 spikes still appear in some runs. |
| P3 | A Shau gameplay flow and contact reliability | IN_PROGRESS | Short harness capture is now behavior-valid (`270` shots / `150` hits on 2026-03-04). Remaining work is performance analysis, not basic contact acquisition. |
| P4 | UI/HUD update budget discipline | DONE | UI Engine Phases 0-7 complete. 19 CSS Modules + signals. Grid layout with 18 named slots. VisibilityManager wired. All touch controls on pointer events as UIComponent subclasses. UnifiedWeaponBar replaces 3 duplicates. Renderer subscribes to ViewportManager. 12 dead component files + 7 dead style files deleted. QuickCommandStrip + SquadRadialMenu deleted (command-bar grid region removed). |
| P5 | Terrain runtime stabilization | IN_PROGRESS | Terrain CDLOD rewrite complete (see `archive/TERRAIN_REWRITE_MASTER_PLAN.md`). World-size authority, truthful terrain API, biome/vegetation runtime wiring, block-boundary cleanup, and large-world startup cost reduction validated. Terrain-led tails effectively solved (frontier30m near-zero long tasks). March 6 fix: half-texel UV correction eliminates render/collision/vegetation positional drift. Remaining: T-008 hydrology. |

## Keep Decisions (Recent)

- Keep: `ZoneState.BLUFOR_CONTROLLED` (renamed from `US_CONTROLLED`). All zone ownership now uses alliance-level naming. 23 files updated.
- Keep: `TicketDisplay.setFactionLabels()` for dynamic HUD faction names derived from `factionMix` config. `GameEngineInit.applyLaunchSelection()` resolves labels at mode start.
- Keep: Helipad spawn points wired into `PlayerRespawnManager` for Open Frontier. BLUFOR players see helipads as spawn options; frontier deploy flow prefers helipad_main.
- Keep: production boot validation in CI via a real built-app smoke (`smoke:prod`). Deploy now depends on lint + tests + build + smoke.
- Keep: `StartupFlowController` as the canonical startup phase state for `menu_ready -> mode_preparing -> deploy_select -> spawn_warming -> live`.
- Keep: `DeployFlowController` as the canonical owner of deploy-session kind, selected spawn, and pending initial-deploy resolution.
- Keep: `SimulationScheduler` inside `SystemUpdater` for cadence-based groups (`tactical_ui`, `war_sim`, `world_state`, `mode_runtime`).
- Keep: A Shau no-contact recovery as an explicit redeploy suggestion via HUD message, not a silent player teleport.
- Keep: `SystemConnector` is no longer the only giant wiring blob. Startup/player/deploy moved into `StartupPlayerRuntimeComposer`, combat/world/game-mode/environment into `GameplayRuntimeComposer`, and strategy/vehicle/air-support into `OperationalRuntimeComposer`. Root connector is now mostly orchestration, navigation, and telemetry.
- Keep: startup cancellation is now a shared contract in `InitialDeployCancelledError.ts` instead of living inside `PlayerRespawnManager`, which reduces startup-path coupling.
- Keep: `ModeSpawnPosition.ts` is the shared spawn-fallback contract for deploy/live-entry paths, letting `GameEngineInit` defer `ModeStartupPreparer` and `InitialDeployStartup` until the user clicks `Play`.
- Keep: start-game boot surface is now partially deferred. Validated build output shows a new `ModeStartupPreparer` chunk (8.53kB minified) and main runtime dropped from `730.27kB` to `722.03kB` without regressing the production smoke path.
- Keep: Graduated supermajority zone bleed in `TicketBleedCalculator`: 70%+ control = 1.5x multiplier, 100% = 3x (was flat 2x).
- Keep: TDM kill-target urgency in `TicketDisplay`: 75% threshold = amber pulse, 90% = red pulse. Reuses existing `.low`/`.critical` CSS classes.
- Keep: Death presentation: 6s ground persistence (was 4s), 2s fadeout (was 1s), ground-sinking replaces scale-to-zero.
- Keep: `GameModeManager.applyModeConfiguration()` uses `objective.kind === 'deathmatch'` policy check instead of hardcoded `GameMode.TEAM_DEATHMATCH` comparison.
- Keep: `SystemConnector` split into 11 named private methods (`wirePlayer`, `wireCombat`, `wireHUD`, etc.) for dependency graph readability.
- Keep: CSS Grid HUD layout (`#game-hud-root`) with 18 named slots replacing 33+ position:fixed elements.
- Keep: UnifiedWeaponBar (single weapon UI for desktop + touch, replaces TouchWeaponBar + InventoryManager hotbar + WeaponAmmoDisplay).
- Keep: pointer events (pointerdown/up/cancel + setPointerCapture) on all touch controls, replacing touch events (zero touchstart/end/move listeners remain in controls).
- Keep: VisibilityManager drives HUD visibility via data attributes on #game-hud-root; CSS rules respond to data-phase, data-vehicle, data-ads, data-device, data-layout.
- Keep: data-show="infantry" on weapon-bar and action-btns slots (hidden in helicopter via CSS rule).
- Keep: score/touch/gameplay HUD ownership under `#game-hud-root` instead of direct gameplay body mounts.
- Keep: `InputManager` + `InputContextManager` as central gameplay action gate for map/menu/modal contexts.
- Keep: single compact fullscreen prompt on mobile entry (auto-fades 6s); landscape prompt removed as redundant (Deploy tap auto-enters fullscreen + locks landscape).
- Keep: squared-distance and allocation reductions in spatial queries.
- Keep: AI target acquisition scratch-buffer reuse.
- Keep: 6 weapon types (`rifle|shotgun|smg|pistol|lmg|launcher`). M60 LMG and M79 grenade launcher wired through WeaponRigManager, GunplayCore, ShotCommand, WeaponAmmo, WeaponSwitching, LoadoutTypes, AudioWeaponSounds.
- Keep: M79 launcher fires grenade projectile via `GrenadeSystem.spawnProjectile()` instead of hitscan. Separate from hand-thrown grenade cooking flow.
- Keep: Player tracer spawning in `WeaponFiring.spawnTracer()`. TracerPool already existed for NPC shots; now shared.
- Keep (2026-03-17): player fire resolution is now barrel-aligned instead of camera-center-only. `WeaponFiring` first resolves the reticle aim point, then rebuilds the live shot ray and visible tracer from a per-weapon muzzle-derived world start projected out of the overlay weapon camera. This preserves reticle correctness while fixing close-range muzzle/tracer disconnects across different gun barrel positions.
- Keep: `applyGraphicsQuality()` controls post-processing pixel size per tier (low=4, med=3, high=1.5, ultra=1) and toggles shadows.
- Keep: `AnimalSystem` cell-based ambient wildlife (egret, water_buffalo, macaque). Deterministic per-cell xorshift32 PRNG, ~20-25 active within 200m. No combat interaction.
- Keep: Structure feature placements on TDM (4), Zone Control (5), A Shau (+10 to 16 total). All use existing WorldFeatureSystem + prefab layouts.
- Delete: `ProgrammaticGunFactory.ts` (dead code; all weapons load from GLBs via WeaponRigManager).
- Keep: `SlopePhysics.ts` as the walkability/slide/step utility, not the primary locomotion model. Player uphill feel now comes from support-plane movement on a smoothed gameplay surface, while unwalkable slopes still block/slide. NPC infantry no longer rely on shared runtime slope-speed penalties.
- Keep: `NavmeshSystem` with `@recast-navigation/core` + `/three` + `/wasm` (v0.43.0). WASM chunk 727KB (218KB gzip), code-split. Solo navmesh for worldSize <= 3200m, TileCache tiled navmesh for larger maps (>3200m). Navmesh cell size scales with world size: cs=1.0 for <=800m, cs=1.5 for <=1600m, cs=2.0 for >1600m. Heightfield sampling scales similarly (4/6/8m). Large worlds (>1600m) also use coarser vertical resolution (ch=0.4 vs 0.2), longer polygon edges, larger minimum regions, and less detail mesh refinement. Memory guard aborts solo build if estimated voxel memory exceeds 300MB. Connectivity validation uses representative home bases instead of all-pairs zone queries. MAX_CROWD_AGENTS=64. Graceful degradation to beeline if WASM fails.
- Keep: `NavmeshSystem` as optional infrastructure, not infantry movement authority. Current ground-combat locomotion uses one terrain-aware solver across LOD tiers with contouring/backtrack; Recast remains available for future helper/hint work but is no longer trusted as the core hill-combat answer.
- Keep: `GameplaySurfaceSampling.ts` as the shared gameplay-terrain read model. Player and NPC movement now sample a smoothed support surface instead of relying on raw single-point slope queries.
- Keep: `StrategicRoutePlanner` as the strategic/far movement layer. `WarSimulator` now converts squad objectives into shared waypoint plans built from zones plus route-friendly authored features, and `GameModeManager` passes mode topology into `WarSimulator.configure()`. Strategic movement no longer defaults to pure straight-line chasing across hostile terrain.
- Keep: movement harness telemetry in `PerformanceTelemetry`/`perf-capture`: player support-surface quality, uphill/downhill samples, terrain blocks/slides, and NPC contour/backtrack/low-progress/LOD metrics now travel with the existing perf artifact path.
- Keep (2026-03-17): harness movement telemetry now includes pinned-area dwell metrics for both player and NPCs. This catches jittering-in-place and ditch/cliff dithering that plain displacement or anchor-progress counters miss.
- Keep (2026-03-17): NPC terrain-aware locomotion now uses support-surface projection, higher traversal-state speeds, meaningful lip tolerance, and uphill/contour-biased recovery candidates. In the latest `zonecontrol` capture (`2026-03-17T04-08-15-602Z`), player average actual speed improved `6.85 -> 7.62`, NPC pinned samples dropped `6227 -> 3793`, NPC average progress per sample improved `0.0222 -> 0.0368`, flank-arc usage rose `1248 -> 9382`, and backtrack activations fell `30 -> 21`.
- Keep (2026-03-17): future movement playback / heatmap work is harness-first, not shipping-UI-first. The right artifact shape for this game is aggregated jungle pressure data plus sampled tracks, not raw full-frame traces for every NPC.
- Keep (2026-03-17): terrain-flow compilation now feeds all three surfaces from one source of truth: terrain stamps/surface patches, full-map topo/trail overlays, and minimap trail hints. `GameModeConfig.terrainFlow` is now the mode-level policy hook for that compile step.
- Keep (2026-03-17): terrain-flow corridors now shape the gameplay height surface with continuous `flatten_capsule` stamps, and long route segments are split by route spacing so trails follow grade changes instead of averaging whole hillsides into a single flatten span.
- Keep (2026-03-17): match-end traversal stats now come from a dedicated `MovementStatsTracker`, not from perf diagnostics. Shipping results stay compact while harness-only detail remains in `PerformanceTelemetry`.
- Keep (2026-03-17): harness movement review now has a second artifact layer. `perf-capture.ts` writes `movement-artifacts.json` with sparse occupancy cells, hotspot cells, and sampled player/NPC tracks, which is the intended basis for a future terrain-relative viewer.
- Keep (2026-03-17): harness movement review now also writes `movement-terrain-context.json` and a self-contained `movement-viewer.html`, so terrain-relative playback/heat review is available from the artifact without adding shipping UI weight.
- Keep (2026-03-17): `WorldFeatureSystem` now does slope/ledge-aware terrain placement search for terrain-snapped objects so cars/props/structures are biased onto flatter nearby ground instead of pure center-height snapping onto cliff lips.
- Keep (2026-03-17): terrain-flow corridor layering was corrected. Route/shoulder stamps now sit below authored HQ/firebase pads, home-base shoulders bias to `max` height, and route corridors start from zone-edge insets instead of zone centers. This directly addresses Zone Control OPFOR HQ bowl/lip failures without returning to broad flattening.
- Keep: Structure footprint obstacles baked into navmesh. Solo maps: obstacle wall meshes (cylinder/box) passed as additional input to `threeToSoloNavMesh`. Tiled maps: `TileCache.addCylinderObstacle`/`addBoxObstacle` with incremental `update()` processing. Circle footprints -> cylinder, rect/strip footprints -> box.
- Keep: frame-local AI neighborhood cache in `AITargetAcquisition`; patrol/defend cluster-density checks now reuse the widest per-combatant spatial query issued that frame.
- Keep: heap validation expansion (`growth`, `peak`, `recovery`) in harness output.
- Keep: Single SpatialGridManager as sole spatial owner. Legacy SpatialOctree direct usage removed from CombatantSystem and all sub-modules.
- Keep: ISpatialQuery interface for AI state handlers (decouples AI from concrete spatial implementation).
- Keep: spatialGridManager injected through the typed core runtime map (`SystemKeyToType` / registry-backed orchestration in SystemInitializer, SystemConnector, and SystemUpdater).
- Keep: DayNightCycle removed entirely (conflicted with WeatherSystem; rebuild if needed for night modes).
- Keep: LoadingScreen facade deleted; GameEngine uses StartScreen directly.
- Keep: gameModes.ts barrel re-exports removed; consumers import from gameModeTypes.ts or specific config files.
- Keep: HUDElements.attachToDOM() requires HUDLayout (no body-mount fallback).
- Keep: WeaponFiring.fire() deprecated method + fireSingleShot/fireShotgunPellets removed; executeShot() is the sole API.
- Keep: ZoneManager spatial query resilience fallback removed; SpatialGridManager is trusted as sole spatial authority.
- Keep: ZoneTerrainAdapter no longer carries terrain-manager setter baggage; it uses canonical terrain height queries directly.
- Keep: createUH1HueyGeometry() legacy wrapper removed (createHelicopterGeometry is the API).
- Keep: FirstPersonWeapon.setEnemySystem() deprecated stub removed.
- Keep: HUDElements.combatStats placeholder div removed (was hidden, never updated).
- Keep: ObjectiveDisplay.ticketDisplay dead property removed (real TicketDisplay is UIComponent).
- Keep: RespawnButton module + HUDElements.respawnButton removed (never mounted to layout; RespawnUI has its own button).
- Keep: 20 dead interfaces removed from SystemInterfaces.ts (never imported). 9 used interfaces retained.
- Keep: HUDUpdater forwarding layer eliminated; HUDSystem calls UIComponents directly. HUDZoneDisplay owned by HUDSystem. Bleed text logic inlined.
- Keep: Per-aircraft physics config (AircraftConfigs.ts). Each aircraft type (UH1_HUEY, UH1C_GUNSHIP, AH1_COBRA) has distinct mass, lift, agility, speed, damping. HelicopterPhysics constructor accepts AircraftPhysicsConfig.
- Keep: Helicopter interaction uses findNearestHelicopter() instead of hardcoded 'us_huey' key (fixed post-multi-helipad migration).
- Keep: Unoccupied airborne helicopters continue physics simulation (gravity pulls them down). Grounded unoccupied helicopters skip physics.
- Keep: HUD RPM reads from HelicopterPhysics.engineRPM (real spool-up/down) instead of fake formula.
- Keep: HelicopterGeometryParts.ts deleted (307 lines of unused procedural cockpit/door-gun geometry; GLBs are the source).
- Keep: HelicopterModel.getControlInputs() dead method removed (returned empty object; controls flow through PlayerMovement.setHelicopterControls).
- Keep: 29 mock-wiring/setter-propagation tests deleted from CombatantAI.test.ts; 40 behavioral tests retained (suppression decay, movement callouts, squad command overrides).
- Keep: VoiceCalloutSystem.test.ts deleted (1 trivial test for disabled system).
- Keep: UI_ENGINE_PLAN.md archived to docs/archive/ (completed project, 1302 lines).
- Keep: PROFILING_HARNESS.md updated with perf:quick, perf:compare, perf:update-baseline commands; stale spatial feature flag env vars removed.
- Keep: repo-tracked perf baselines now cover the active Phase 1 scenario set (`combat120`, `openfrontier:short`, `ashau:short`, `frontier30m`). `perf:baseline` is now a compatibility wrapper over `perf-compare --update-baseline`, `validate:full` runs `combat120`, and CI checks `summary.json` from the committed regression scenario instead of the stale `capture-summary.json` path.
- Keep: `GameModeManager.applyModeConfiguration()` reviewed and accepted as thin coordinator (94 lines, 8 systems, null-guarded setter calls). Moving config into individual systems would couple them to `GameModeConfig`. `GameModeRuntime` now owns lifecycle hooks plus scheduled `update()` logic for mode-specific behavior.
- Keep: Zone dominance bar in `HUDZoneDisplay` showing faction control ratio (BLUFOR/contested/OPFOR percentages) with colored track and summary label ("2 HELD / 1 CONTESTED / 4 HOSTILE").
- Keep: Priority-sorted zone display capped at 5 visible zones (contested first, then player-owned-under-attack, then nearest). Overflow label shows "+N more zones" count. Solves A Shau 15-zone HUD overload.
- Keep: terrain startup no longer double-rebakes the render surface at mode start after a world-size change; `GameEngineInit` now lets `setWorldSize()` own that rebake path.
- Keep: large-world terrain surface bake budget is scale-aware instead of fixed. `TerrainSurfaceRuntime` now reduces the render-only bake grid at A Shau scale from `1024` to `512`, while gameplay height authority remains on `HeightQueryCache`.
- Keep (confirmed 2026-03-06): `maxLODLevels` is now auto-scaled from world size via `computeMaxLODLevels()` in `TerrainConfig.ts`. At 4 fixed LOD levels, Open Frontier (3200m) had 225m LOD 0 tiles with 7m vertex spacing; the GPU mesh was too coarse to match the CPU heightmap (6.26m texel spacing), causing 1-10m render/collision divergence and floating vegetation/NPCs. Auto-scaling gives Open Frontier 5 levels (3.52m spacing), A Shau 8 levels (2.63m spacing). Heightmap grid for 1024-4095m worlds also increased from 512 to 1024 (4m/sample instead of 8m). TDM/ZC keep 4 levels (already fine).
- Keep: `TerrainRaycastRuntime` no longer computes unused vertex normals for the near-field LOS mesh.
- Keep: loading/start-screen asset URLs are base-aware; root-relative screen asset paths that produced preview/Page `404`s were removed.
- Keep: CDLODQuadtree `range * 1.5` early-return removed. The skip created coverage holes when a parent subdivided but children fell outside `childRange * 1.5`, leaving terrain patches invisible (collision and vegetation still worked via HeightQueryCache). Every node now must either emit or subdivide.
- Keep: World boundary enforcement now reads playable bounds explicitly from `ITerrainRuntime.getPlayableWorldSize()` in `PlayerMovement.updateMovement()` and `HelicopterModel.updateHelicopterPhysics()`. Boundary hit bounces velocity inward at 50% strength. Playable bounds are now a first-class contract instead of a compatibility path over `getWorldSize()`.
- Keep: Terrain visual overflow is now an explicit mode/runtime setting (`visualMargin`) instead of a duplicated hardcoded constant. `TerrainRenderRuntime` inflates the CDLOD quadtree by the configured margin, while `TerrainSystem` exposes `getVisualMargin()` / `getVisualWorldSize()` for runtime clarity. Margin tiles still sample clamped heightmap UVs (explicit `clamp()` in vertex shader + `ClampToEdge` wrapping), extending edge terrain seamlessly.
- Keep: `TerrainMaterial.applyTerrainMaterialOptions()` updates existing shader uniform values in place (not replacing objects) on subsequent calls to preserve compiled shader references. First call creates uniforms and sets up `onBeforeCompile`; later calls only update `.value` fields.
- Keep: Vegetation cell bounds check in `VegetationScatterer.generateCell()` limits scatter to `worldHalfExtent + visualMargin`, matching the terrain render overflow. Player can't walk there; it's visual filler only.
- Keep: Helipad creation no longer has a synthetic fallback pad. Vehicle systems only activate when the active `GameModeConfig` explicitly declares `helipads`. Modes that omit helipads pay zero hidden vehicle cost and no longer mask config errors.
- Keep: `STRUCTURE_SCALE = 2.5` with per-category `displayScale` override in `ModelPlacementProfile`. Props (FUEL_DRUM, SUPPLY_CRATE, AMMO_CRATE, WOODEN_BARREL) at `displayScale: 0.5` to avoid oversized props while buildings/towers get full scale. All 19 prefab layout offsets rescaled by 1.25x (2.5/2.0) to maintain proper spacing.
- Keep: Procedural firebase/airfield generators (`FirebaseLayoutGenerator`, `AirfieldLayoutGenerator`) using seeded PRNG (mulberry32), zone-based placement, and minimum spacing enforcement. Templates define structure pools with weights; generators produce `StaticModelPlacementConfig[]` compatible with existing `WorldFeatureSystem.spawnFeature()`. Generated once at mode init, cached (0ms runtime cost).
- Keep: `FixedWingPhysics` as standalone physics module for fixed-wing aircraft. Speed-based lift (`L = 0.5 * rho * v^2 * S * Cl`), drag proportional to v^2, stall below aircraft-specific speed, bank-and-pull turns. Three aircraft configs (AC-47 Spooky, F-4 Phantom, A-1 Skyraider) with distinct flight envelopes. Same quaternion integration pattern as `HelicopterPhysics`.
- Keep: `NPCPilotAI` as FSM with PD controllers for autonomous helicopter flight. 7 states (idle/takeoff/fly_to/orbit/attack_run/rtb/landing). `NPCPilotManager` decoupled from concrete vehicle systems via `VehicleStateProvider` interface. Not yet wired into SystemUpdater/SystemConnector (runtime integration deferred).
- Keep: Road surface types (`dirt_road`, `gravel_road`, `jungle_trail`) as shader-only additions in `TerrainMaterial.ts`. No runtime cost; surface patches use existing `TerrainSurfacePatch` system. Road network generation (splines, intersections) deferred to future session.
- Keep: perf diagnostics are gated behind `import.meta.env.DEV` and `?perf=1`. Harness-only globals, renderer counters, and user-timing spans must stay out of production bundles.
- Keep: `GameRenderer` captures per-frame `renderer.info` stats for perf harness sampling; this is harness evidence, not shipping HUD/debug behavior.
- Keep: player death accounting is single-source in `PlayerHealthSystem`; `CombatantDamage` no longer applies a second HUD death increment for player-proxy lethal events.
- Keep: active perf driver sustain policy is bounded and behavior-preserving (respawn debounce, cooldown-based low-health top-up without spawn-protection refresh, and ammo refill guardrails).
- Keep: suppression-init cover-search budget is explicitly bounded in `AIStateEngage` (max 2 flank cover lookups per initiation) to constrain single-frame burst cost; promote to full perf-accepted status only after a clean warm A/B pair on the updated harness.
- Keep (confirmed 2026-03-06): low-overhead hotspot cleanup targeting read-side churn: `HeightQueryCache` uses numeric quantization keys with read-only hits and 20K default cache (up from 10K), `TerrainRaycastRuntime` reuses near-field geometry buffers when grid size is unchanged and uses 6m grid step (down from 4m, reducing rebuild from ~10K to ~4.5K height queries), `LOSAccelerator` no longer calls `performance.now()` per LOS query (5 calls removed from hot path), `HeightQueryCache.getNormalAt()` reuses scratch vector instead of per-call allocation, and `AIStateEngage` skips flank cover re-search when a flanker already has a nearby destination. Warm `combat120` matched pair confirms: p99 improved from 86.90ms to 30.9-35.3ms, AI starvation from 12.34 to 3.9-4.9, avg frame time from 14.17ms to 12.8-13.2ms.
- Keep: suppression flank-cover discovery remains in the suppression-init path only; a March 4 deferred recheck attempt in `AIStateMovement.ADVANCING` was reverted after warm captures increased hitch/AI-starvation risk without a clean pressure-matched win.
- Keep: `MaterializationPipeline` materializes nearest squads first so large-map scenarios establish combat around the player before distant squads consume the budget.
- Keep: `SpatialOctree` vertical world bounds scale with world size. Fixed Y bounds were invalid on mountainous maps and caused empty high-altitude hit-detection queries.
- Keep (2026-03-10): consultation correctness slice is live: `GameEngineLoop` is start/stop owned and cancelled on dispose, engine teardown resets shared runtime singletons/caches, NPC tracer lifetimes are enforced in milliseconds, `ObjectPoolManager` no longer allocates `Set` entries on hot borrows, and `ModelLoader.disposeInstance()` is the safe shared-instance detach contract.
- Keep (2026-03-10): `RadioTransmissionSystem` is now live runtime code instead of dead inventory. `StrategicFeedback` and `WeatherLightning` use typed optional audio hooks (`playDistantCombat`, `playThunder`) instead of loose casts/empty stubs.
- Keep (2026-03-10): terrain material/runtime direction remains `THREE.WebGLRenderer` + `MeshStandardMaterial.onBeforeCompile` for the active game. This matches current official Three.js guidance: `WebGLRenderer` is still the recommended choice for pure WebGL 2 applications, while `WebGPURenderer`/TSL requires porting custom material and post-processing paths first.
- Keep (2026-03-10): terrain biome textures are now validated across every shipped game mode in tests. Each mode's configured biomes must resolve to on-disk assets and produce terrain material bindings before CI goes green.
- Keep (2026-03-10): `SystemRegistry` is now the typed source of truth for runtime system ownership. `SystemManager` exposes registry-backed getters instead of mirroring a giant mutable public field bag.
- Keep (2026-03-10): startup/runtime composer types now narrow from `SystemKeyToType` instead of maintaining a second hand-written system reference interface.
- Keep (2026-03-10): `PlayerController` startup wiring now goes through `configureDependencies()` plus focused `PlayerCombatController` / `PlayerVehicleController` helpers. Compatibility setters still exist, but the boot path no longer depends on the old setter chain.
- Keep (2026-03-10): `HUDSystem` and `HelicopterModel` now support grouped dependency configuration, reducing the highest-risk connector bursts without changing runtime behavior.
- Keep (2026-03-10): the grouped dependency pattern now also covers `CombatantSystem`, `GameModeManager`, `PlayerRespawnManager`, `AirSupportManager`, `HelipadSystem`, and `WorldFeatureSystem`. Composer fallbacks exist only to keep older tests/mocks stable during migration.
- Keep (2026-03-10): player and helicopter simulation now run on a shared fixed-step pattern (`FixedStepRunner`, 60Hz simulation) with interpolated helicopter visuals, eliminating the previously documented frame-rate-dependent movement drift.
- Keep (2026-03-10): `RespawnUI` is now a `UIComponent` + CSS Modules implementation that preserves the existing `PlayerRespawnManager` contract while removing the old imperative body-style builder.
- Keep (2026-03-10): more gameplay systems now consume terrain through `ITerrainRuntime` (`getHeightAt`, `getEffectiveHeightAt`, `getSlopeAt`, `getNormalAt`) instead of reaching directly into `HeightQueryCache`.
- Keep (2026-03-10): production audio asset paths are now URL-safe. `RadioTransmissionSystem` no longer depends on `#` characters in static filenames, so built-app smoke under the deployed base path no longer 404s those assets.

## Deferred Decisions

- Terrain architecture pivot evaluation deferred. Full research documented in `docs/TERRAIN_RESEARCH.md` covering CDLOD vs geoclipmaps vs GPU tessellation vs CBT, WebGPU compute-driven quadtree, virtual texturing, heightmap streaming, and fragment-level displacement. Current CDLOD + InstancedMesh + BakedHeightProvider architecture is at or above industry standard. Primary evolutionary path is WebGPU compute-driven quadtree when Three.js WebGPU matures (UBO fix, Safari stability). No code changes needed now.

## Open Risks

- High-intensity runs can still show heap growth warnings.
- A/B startup variance can hide small wins/losses; first capture after a fresh boot should be treated as cold-start data.
- ZoneManager no longer falls back to linear scan if spatial query returns empty; if SpatialGridManager has sync bugs, zone capture may stall.
- The immediate A Shau terrain-startup spike has improved in preview smoke, but this is not yet a substitute for broader perf-harness evidence under sustained combat and camera motion.
- The new strategic route-guidance layer has focused unit and wiring coverage, but it still needs harness evidence on `openfrontier:short` and `ashau:short` before its battlefield-shape and frame-tail impact are considered accepted.
- Terrain support remains the clearest gameplay-architecture gap, but the first corridor/shoulder layer is now live. The remaining risk is upstream generation quality: routes are still shaping an already-generated procedural surface, so HQ/water/deformation/path-meshing issues may require earlier terrain-flow integration instead of more post-pass deformation.
- `combat120` now has a valid harness run, but it fails on `peak_p99_frame_ms` and AI starvation. This is the clearest measured hotspot.
- Deep `combat120` capture localizes the worst tails to `CombatantAI.updateAI()` inside high-LOD full updates. March 4 diagnostic probes now show those nominal `suppressing` / `advancing` spikes are actually `AIStateEngage.handleEngaging()` work that transitions into those states.
- The accepted March 4, 2026 frame-local `AITargetAcquisition` cache reduced matched warm `combat120` starvation (`16.82 -> 12.91`), average frame time (`15.10ms -> 14.59ms`), and heap growth (`15.73MB -> 3.64MB`) under slightly higher combat pressure, but `peak_p99_frame_ms` still fails and `SystemUpdater.Combat.maxDurationMs` rose slightly (`224.4ms -> 233.6ms`).
- A March 4, 2026 attempt to disable friendly-spacing work on visual-only high-LOD frames was reverted. Two warm post-change runs lowered mean frame time slightly, but tails, stall totals, and AI-starvation signals worsened; one rerun also under-shot badly (`54 / 32` shots / hits).
- A March 4, 2026 attempt to reuse targets and throttle advancing threat reacquisition during flank movement was also reverted. The warm rerun improved mean frame time but reduced combat pressure sharply (`220 / 140 -> 90 / 53` shots / hits) while worsening hitch rate, combat dominance, long-task totals, and `SystemUpdater.Combat.maxDurationMs`.
- March 4, 2026 short diagnostic captures (`2026-03-04T18-35-30-494Z`, `2026-03-04T18-39-02-145Z`) localize the rare `CombatantAI` spikes to `AIStateEngage.initiateSquadSuppression()`. The inner spike logs are dominated by `suppression.initiate` `65-214ms`; source inspection shows this path synchronously runs `findNearestCover()` for each flanker, which is the leading candidate for the remaining combat tails.
- March 4, 2026 warm reruns after the suppression-init flank-probe cleanup (`2026-03-04T19-00-58-280Z`, `2026-03-04T19-03-09-563Z`) show lower combat tail/stall pressure than warm pre-control `2026-03-04T18-56-58-892Z`, but run-to-run combat pressure still varies (`shots/hits` drift), so acceptance remains evidence-backed but not yet final-tail closure.
- March 4, 2026 deferred flank-cover recheck attempt (`2026-03-04T23-35-55-753Z`, `2026-03-04T23-37-57-165Z`) improved p99 but worsened warm hitch/starvation/over-budget means versus warm pre-controls (`2026-03-04T23-26-57-305Z`, `2026-03-04T23-29-06-527Z`) and ran at higher combat pressure; it was reverted and should not be treated as an accepted path.
- Active-driver stop logs still report `moved` as frontline compression movement count, not literal player-distance moved; pressure comparability should rely primarily on shots/hits and frame progression.
- `HeightQueryCache.getHeightAt()` is unexpectedly hot in combat-heavy runs because string-key generation and LRU churn sit directly on terrain and movement paths.
- The March 4, 2026 numeric-key linked-list `HeightQueryCache` experiment was reverted. Open Frontier improved, but warm `combat120` evidence was inconsistent and one matched pair worsened heap recovery from `41.7%` to `8.7%`.
- `open_frontier` and `frontier30m` are throughput-pass / tail-fail patterns: averages stay low while long-task and LoAF totals remain high.
- Terrain tails are currently more suspicious than CDLOD selection itself. `TerrainSystem.update()` still couples render update, vegetation update, and near-field BVH rebuild in the same tick group.
- Asset loading is still on `TextureLoader` + `.webp/.png/.jpg`; no KTX2/Basis pipeline is in place yet. This remains a secondary frontier opportunity, not the first measured bottleneck.
- `systemTop` remains a secondary signal in some captures; authoritative frame-budget analysis should use `browserStalls.totals.userTimingByName`.

## Required Evidence For Major Changes

- One matched throughput pair (`combat120`) with comparable startup quality.
- One soak run (`frontier30m`) when change targets memory/stability.
- Behavior validation (shots/hits, objective flow, no freeze/teleport artifacts).

## Next Execution Slice

1. Finish the remaining constructor/runtime-dependency cleanup for the next cold-path clusters (`CombatantSystem`, any remaining helicopter helpers, and selected HUD-adjacent services) now that the core player/vehicle path is no longer setter-only.
2. Continue pushing cadence-safe world, strategy, and passive UI work behind declared scheduling contracts while leaving movement/weapon-feel systems every frame.
3. Continue `combat120` tail reduction in `AIStateEngage.initiateSquadSuppression()` with pressure-matched evidence only.
4. Use the new `movement-viewer.html` / `movement-terrain-context.json` artifact pair to decide whether the next terrain pass should move route influence upstream into generation rather than adding more post-pass deformation on top of procedural terrain.
5. Revisit HQ/water/deformation edge cases only after the upstream terrain-flow direction is chosen; do not paper over them with another round of high-priority corridor flattening.
6. Break down `TerrainRaycastRuntime` near-field rebuild and vegetation update cost inside `TerrainSystem.update()` for `open_frontier`, `frontier30m`, and `a_shau_valley`.
7. Re-baseline and lock regression checks after each accepted change. Deploy is now gated on CI by built-app smoke as well as lint/test/build.
8. Keep terrain rewrite progress aligned with `blocks/terrain.md`; do not reintroduce chunk-era semantics into active runtime code.

## Update Rule

Any accepted architecture change must update:
- this file (decision + risk impact), and
- `docs/PROFILING_HARNESS.md` if capture semantics changed.
