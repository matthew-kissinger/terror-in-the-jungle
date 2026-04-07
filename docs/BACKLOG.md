# Backlog

Last updated: 2026-04-06

## P0 - Performance Blockers

- [ ] Combat AI p99 ~35ms (target <16ms) - synchronous cover search in `AIStateEngage.initiateSquadSuppression()`
- [ ] Re-capture and refresh perf baselines after the 2026-04-02 harness recovery (`combat120`, `openfrontier:short`, `ashau:short`, `frontier30m`)
- [ ] Re-capture `openfrontier:short` after the 2026-04-02 air-vehicle batching + visibility pass and decide whether aircraft/helicopter far-LOD meshes are still needed
- [ ] Reduce initial JS bundle (~710-734kB main runtime chunks)

## P1 - Gameplay

- [ ] Wire NPC pilot AI into SystemUpdater for live NPC flight
- [ ] NPC helicopter transport missions (takeoff, fly to LZ, deploy, RTB)
- [ ] Ground vehicles (M151 jeep first - GLB exists, need driving runtime)
- [ ] Fixed-wing gameplay pass: takeoff/landing feel tuning, runway HUD cues, weapons integration
- [ ] Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds
- [ ] Stationary weapons (M2 .50 cal emplacements, NPC manning)
- [ ] Faction AI doctrines (VC guerrilla vs NVA conventional vs US combined arms)

## P2 - Content & Polish

- [ ] Vegetation billboard remakes
- [ ] Terrain texture improvements
- [ ] Road network generation (splines, intersections, pathfinding)
- [ ] Wire additional DEM maps as game modes (Ia Drang, Khe Sanh)
- [ ] Day/night cycle
- [ ] Music/soundtrack

## P3 - Architecture

- [ ] Terrain contract cleanup: remove stale chunk-era config names, debug labels
- [ ] Decide: remaining connector bursts -> constructor/runtime dependency objects vs grouped setters
- [ ] Split tracked tick groups into smaller declared groups where cadence can differ safely
- [ ] Move more world/strategy/passive-UI work behind scheduler contracts
- [ ] Continue identifying deploy-only UI/runtime that can defer without touching menu path

## Far Horizon

- Hydrology system / water engine (river system, swimming, depth rendering, watercraft physics)
- Watercraft (PBR, sampan - GLBs exist, blocked on water engine)
- Multiplayer/networking
- Destructible structures
- Survival/roguelite mode
- Campaign system
- Theater-scale maps (tiled DEM)
- ECS evaluation for combat entities

## Known Bugs

1. Combat AI p99 sits ~35ms in heavy scenarios, above the 16ms target.
2. Main runtime bundle is ~780kB (startup stable but heavy).
3. Open Frontier/A Shau air vehicles are player-usable, but still lack NPC pilots, transport missions, and broader battlefield integration.
4. First grenade/explosion cold-start hitch needs fresh perf evidence after the hidden live-effect warmup change.

## Architecture Debt

1. SystemManager ceremony - adding a new system touches SystemInitializer + composers.
2. PlayerController setter methods (reduced after vehicle adapter refactor; model/camera setters still duplicated).
3. Variable deltaTime physics (no fixed timestep for grenade/NPC/particle systems; player, helicopter, and fixed-wing use FixedStepRunner).

## Recently Completed (2026-04-06)

- [x] VehicleStateManager: single source of truth for player vehicle state with adapter pattern
- [x] Fixed-wing physics: ground stabilization, thrust speed gate, F-4 TWR correction, resetToGround on enter
- [x] Helicopter perf: door gunner restricted to piloted only, idle rotor animation skip
- [x] Vehicle control state decoupled from PlayerMovement (~550 lines removed)
4. Mixed UI paradigms (~50 files with raw createElement alongside UIComponent + CSS Modules).
5. Recast-navigation WASM shipped twice (main thread + worker; Vite worker boundary limitation, not fixable with config).
