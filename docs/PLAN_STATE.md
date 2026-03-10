# Plan State

> Persistent tracker for agent loops, session compactions, and prioritization.
> Updated: 2026-03-10

---

## Wave 1: Quick Wins (small, parallelizable) - COMPLETE

- [x] 1.1 Fix 5 lint errors (unused imports/params in WeaponFiring, TerrainFeatureCompiler, OpenFrontierRespawnMap)
- [x] 1.2 Delete dead LoadoutSelector + its 2 smoke tests (replaced by RespawnUI loadout panel + LoadoutService)
- [x] 1.3 Delete 2 orphaned audio files (voiceCalloutOPFOR.wav, voiceCalloutUS.wav)
- [x] 1.4 Add per-weapon audio configs for pistol, LMG, launcher (distinct volume/pitch per weapon type)
- [x] 1.5 Wire remaining 3 animal types: tiger (rare, stationary), king cobra (slow, solitary), wild boar (pairs, slow wander)
- [x] 1.6 Archive stale plan docs: ASHAU_VALLEY_IMPLEMENTATION_PLAN, FRONTEND_REARCHITECTURE_BACKLOG, ROADMAP stale sections fixed

## Wave 1.5: UI Cleanup - COMPLETE

- [x] Delete QuickCommandStrip (always-visible squad keyboard hints, blocked mobile)
- [x] Delete SquadRadialMenu (legacy, never triggered in normal gameplay)
- [x] Remove command-bar grid region from HUD layout (18 regions, was 19)
- [x] Delete RespawnMapView (replaced by OpenFrontierRespawnMap for all modes)
- [x] Delete ProgrammaticGunFactory (all weapons load from GLBs)

## Wave 2: Gameplay Impact (medium) - PARTIAL

- [x] 2.1 Helicopter weapons: minigun, rockets, door gunner NPC AI, rearm on helipad
- [x] 2.2 Vehicle damage + destruction (role-based HP, repair on helipad, destruction forces pilot exit)
- [ ] 2.3 Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds (requires asset generation)
- [ ] 2.4 Wire 1-2 additional DEM maps as game modes (Ia Drang, Khe Sanh - data ready in data/vietnam/converted/)

## Wave 3: Architecture Debt (medium-large)

- [x] 3.1 AI cover search grid reduced (8x8 + early-out at 4 candidates) - p99 86ms -> 35ms
- [x] 3.2 Terrain tick stagger (BVH skips vegetation rebuild frames) - frontier30m p99 effectively solved
- [x] 3.3 Make perf regression a deploy gate in CI (merged perf-check.yml into ci.yml, deploy needs perf job)
- [x] 3.4 Stabilize production boot + add built-app smoke gate (`smoke:prod`) for menu -> deploy path
- [x] 3.5 Extract startup phases out of `GameEngineInit` into `ModeStartupPreparer`, `InitialDeployStartup`, `LiveEntryActivator`
- [x] 3.6 Reduce `SystemConnector` setter wiring for startup/player/deploy path (`StartupPlayerRuntimeComposer`)
- [x] 3.7 Reduce `SystemConnector` setter wiring for strategy/vehicle/air-support path (`OperationalRuntimeComposer`)
- [x] 3.8 Reduce `SystemConnector` setter wiring for combat/world/game-mode/environment path (`GameplayRuntimeComposer`)
- [x] 3.12 Delete dead file-level code flagged by `knip` (18 unused files removed; unused `@recast-navigation/wasm` dependency removed)
- [x] 3.13 Terrain feature grading now supports authored shoulders (`gradeRadius` / `gradeStrength`) instead of only flat-core + hard blend rings
- [x] 3.14 Spawn/nav reliability pass: terrain-aware spawn scoring now covers squad staging, reinforcements, and respawns
- [x] 3.15 Cleanup pass complete: `eslint`, `knip`, tests, build, and production smoke all pass cleanly
- [ ] 3.4 Combat AI p99 still ~35ms (target <16ms) - remaining synchronous cover search cost
- [ ] 3.5 Terrain contract cleanup: remove stale chunk-era config names, debug labels
- [ ] 3.9 Reduce initial JS bundle surface without reintroducing fragile chunking (partial: mode-start pipeline is deferred, a small release-loop diagnostics trim landed, but current build still emits `710-734kB` main runtime chunks)
- [ ] 3.10 Decide whether remaining connector bursts should become constructor/runtime dependency objects or stay grouped setters
- [x] 3.11 Zone Control firebase pass: widen base layout, soften home-base terrain grading, spread firebase towers, and add terrain-safe squad anchoring to stop cliff-edge starts

## Wave 4: Content Expansion (large)

- [ ] 4.1 Ground vehicles (M151 jeep first - GLB exists, simplest vehicle)
- [ ] 4.2 Faction AI doctrines (VC guerrilla vs NVA conventional vs US combined arms)
- [ ] 4.3 Music/soundtrack
- [ ] 4.4 Day/night cycle

## Wave 5: Open Items (absorbed from archived execution plans)

### From NEXT_PHASE_EXECUTION_PLAN (Tracks 2-4)

- [ ] 5.1 A Shau insertion readability: explicit insertion-type language in deploy summary
- [ ] 5.2 A Shau insertion: distinguish tactical/safer-LZ/aggressive-forward in UI/policy
- [ ] 5.3 A Shau insertion: review default insertion bias against current objective pressure
- [ ] 5.4 A Shau objective readability: improve first-entry guidance
- [ ] 5.5 A Shau objective readability: surface active pressure/front-line direction more clearly
- [ ] 5.6 Remove/rename stale chunk-era config that no longer controls runtime behavior
- [ ] 5.7 Decide whether worker pool APIs are real runtime dependencies or legacy compatibility
- [ ] 5.8 Visual balance pass: palms against canopy trees
- [ ] 5.9 Review A Shau and Open Frontier landmark readability
- [ ] 5.10 Tune LZ/helipad authored spaces to feel deliberate

### From NEXT_PHASE_REFACTOR_PLAN (Tracks 2-4)

- [ ] 5.11 Replace remaining hot-path setter chains with constructor or grouped runtime dependency injection
- [ ] 5.12 Leave low-value or cold-path systems on setters until hot-path/core wiring is stable
- [ ] 5.13 Split current tracked groups into smaller declared groups where cadence can differ safely
- [ ] 5.14 Keep movement/weapon-feel/input-coupled systems every frame
- [ ] 5.15 Move more world/strategy/passive-UI work behind scheduler contracts
- [ ] 5.16 Add tests for cadence and accumulated-delta behavior when groups are skipped
- [ ] 5.17 Continue identifying deploy-only UI/runtime that can defer without touching the menu path

## Far Horizon (not sized, not sequenced)

- Watercraft (PBR, sampan - GLBs exist, blocked on water engine)
- Fixed-wing aircraft (Spooky, Phantom, Skyraider - flight code exists; Open Frontier and A Shau now stage static parked aircraft, but there is still no live vehicle runtime)
- Multiplayer/networking
- Destructible structures
- Swimming/river gameplay (T-008 hydrology)
- Survival/roguelite mode
- Campaign system
- Theater-scale maps (T-010 tiled DEM)
- ECS evaluation

---

## Current Codebase Health

| Metric | Value |
|--------|-------|
| Source files | 376 TS/TSX under `src/` |
| Test files | 174 |
| Tests passing | 3,612 |
| Type errors | 0 |
| Lint errors | 0 |
| Lint warnings | 0 |
| Dead-code scan | Passing (`npm run deadcode`) |
| TODO/FIXME in source | 0 |
| Runtime deps | 8 (`three`, `signals`, `three-mesh-bvh`, `@recast-navigation/*`, 3 font packages) |
| GLB models | 75 on disk |
| Audio files | 31 on disk, 31 wired, 0 orphaned |
| DEM maps | 10 processed, 1 wired (A Shau) |
| Built-app smoke | Passing (`menu -> deploy` under deployed base path) |

## Feature Completeness

| Domain | Status | Notes |
|--------|--------|-------|
| Weapons (7 types) | DONE | M16A1, AK-47, Ithaca 37, M3 Grease Gun, M1911, M60, M79 - all GLBs, differentiated ballistics |
| Loadout system | DONE | RespawnUI: primary/secondary weapon + equipment + 3 presets + faction pools + localStorage |
| Combat (squads, suppression, damage) | DONE | Full damage model, headshots, kill assists |
| Grenades (frag/smoke/flash) | DONE | Cooking, arc preview, physics, audio (pin pull, throw, beep) |
| Mortar system | DONE | Deployment, aiming, ballistics, dedicated camera |
| Helicopter (3 types, flight) | DONE | Enter/exit, distinct physics per aircraft |
| Helicopter weapons | DONE | Minigun (50rps hitscan), rockets (projectile, 8m radius), door gunner NPC AI, rearm on helipad |
| Vehicle damage | DONE | Role-based HP (transport:500/gunship:600/attack:400), repair on helipad, destruction forces pilot exit |
| Game modes (5) | DONE | Zones, tickets, win conditions, policy-driven respawn, mode product passes complete |
| Weather system | DONE | Rain, storms, lightning, transitions |
| World structures | DONE | prefab compounds plus generator-backed airfields; Open Frontier and A Shau now stage planes and separate heavy motor pools |
| Ambient wildlife | DONE | All 6 types spawning (egret, buffalo, macaque, tiger, cobra, boar) |
| Water | PARTIAL | Visual plane only, no swimming/rivers |
| Day/night | NOT STARTED | Deleted as dead code |
| Audio coverage | DONE | Per-weapon fire sounds, grenade lifecycle, kill streak sting, footsteps, ambient |
| Music | NOT STARTED | |
| HUD (minimap, scoreboard, kill feed) | DONE | 18-region CSS Grid, squad overlay via Z key |
| Start screen + settings | DONE | Graphics quality controls post-processing |
| Multiplayer | NOT STARTED | Single-player AI only |

## Known Bugs / Active Defects

1. Combat AI p99 still sits around ~35ms in heavy scenarios, well above the 16ms target.
2. Initial bundle remains large (`~710-734kB` main runtime chunks), so startup is now stable but still heavy.
3. There is no current release-blocking boot/deploy defect; remaining issues are perf and packaging quality, not functional stability.
4. Open Frontier and A Shau airfields now stage fixed-wing aircraft, jeeps, APCs, and tanks as static world content only; helicopters remain the only playable vehicles.

## Current Release Posture

- Current branch state is a playable, shippable stabilization baseline for focused playtesting.
- Required local gates are green: `lint`, `deadcode`, `test:run`, `build`, and `smoke:prod`.
- This is ready to push and deploy for structured gameplay validation. Remaining work is release polish: perf tails, bundle weight, and content expansion.

## Residual Architecture Backlog

Consultation-critical findings are closed. What remains is non-blocking cleanup and polish.

1. **System registration still spans multiple files** -- `SystemRegistry` removed the public property bag, but adding a new system still usually touches `SystemInitializer` and one or more composers.
2. **Compatibility setters still exist on some large systems** -- the boot/runtime path now prefers grouped `configureDependencies()` on the high-fan-in clusters, but compatibility setters remain for tests and older call sites.
3. **Legacy UI still exists outside the newest component path** -- `RespawnUI` is migrated, but parts of the older HUD/admin surface still use imperative DOM patterns.
4. **Singleton lifecycle is improved, not universal** -- the major consultation caches/singletons reset on engine teardown, but there is still no single repo-wide dispose contract for every singleton-like helper.

## Architecture Risks

1. Combat AI p99 ~35ms (target <16ms) - synchronous cover search improved but not solved
2. Scheduler enforcement is only partial - some cadence-safe groups moved off every-frame updates, but core simulation is still largely serial on the main thread
3. Startup/player/deploy, gameplay runtime, and operational runtime are now grouped in dedicated composers; the remaining order-sensitive wiring is lower risk than the old monolithic connector path, but not fully eliminated
4. Startup orchestration is improved and the mode-start pipeline now defers until `Play`, but runtime contracts are still order-sensitive across multiple systems
5. Production boot is fixed and deferred chunks now exist for mode startup, but bundle weight is still high enough to remain a product risk
6. Terrain grading is now system-level instead of config-only, but it still only supports circular flatten stamps; more complex compound footprints still need authored support beyond radius-based grading

## Dead Code Status

- `npm run deadcode` now passes cleanly.
- File-level cleanup is complete for the current pass:
- removed 18 unused files, including shelved terrain/perf scripts, `RiverWaterSystem`, `NPCPilotManager`, and the unused BVH worker
- removed the unused `@recast-navigation/wasm` dependency
- de-exported speculative internal interfaces/types across core, terrain, combat, vehicle, player, UI, and test-helper modules
- added a `knip` tag allowance for the intentionally lazy-loaded `prepareModeStartup` startup path
- dead-code cleanup is no longer an active backlog item; remaining work is architectural and performance-oriented, not cleanup-oriented

## Doc Cleanup Log

- 2026-03-09: Archived GAME_STATE_ANALYSIS.md, SQUAD_COMMAND_REARCHITECT.md, FRONTEND_ARCHITECTURE_INVENTORY.md
- 2026-03-10: Archived 10 completed/superseded docs (execution plans, research, consultation). Merged AUDIO_ASSETS_NEEDED and BUILD_NOW_ASSET_BACKLOG into ASSET_MANIFEST. Deleted CODEBASE_MAP.mmd. Consultation report findings captured in Known Architecture Debt above.
