# Backlog

Last updated: 2026-03-30

## Active

- [ ] Combat AI p99 ~35ms (target <16ms) - synchronous cover search in `AIStateEngage.initiateSquadSuppression()`
- [ ] Terrain contract cleanup: remove stale chunk-era config names, debug labels
- [ ] Reduce initial JS bundle (~710-734kB main runtime chunks)
- [ ] Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds

## Planned

### Gameplay
- [ ] Wire NPC pilot AI into SystemUpdater for live NPC flight
- [ ] Wire FixedWingPhysics for player-pilotable fixed-wing aircraft
- [ ] NPC helicopter transport missions (takeoff, fly to LZ, deploy, RTB)
- [ ] Ground vehicles (M151 jeep first - GLB exists)
- [ ] Road network generation (splines, intersections, pathfinding)
- [ ] Wire additional DEM maps as game modes (Ia Drang, Khe Sanh)
- [ ] Hydrology system layer (T-008, blocked on river gameplay requirements)

### Architecture
- [ ] Decide: remaining connector bursts -> constructor/runtime dependency objects vs grouped setters
- [ ] Split tracked tick groups into smaller declared groups where cadence can differ safely
- [ ] Move more world/strategy/passive-UI work behind scheduler contracts
- [ ] Continue identifying deploy-only UI/runtime that can defer without touching menu path

### Content
- [ ] Vegetation billboard remakes
- [ ] Terrain textures
- [ ] Helicopter GLB replacements (UH-1 Huey, UH-1C Gunship)
- [ ] Faction AI doctrines (VC guerrilla vs NVA conventional vs US combined arms)
- [ ] Music/soundtrack
- [ ] Day/night cycle

## Far Horizon

- Watercraft (PBR, sampan - GLBs exist, blocked on water engine)
- Multiplayer/networking
- Destructible structures
- Swimming/river gameplay
- Survival/roguelite mode
- Campaign system
- Theater-scale maps (tiled DEM)
- ECS evaluation for combat entities

## Known Bugs

1. Combat AI p99 sits ~35ms in heavy scenarios, above the 16ms target.
2. Main runtime bundle is ~710-734kB (startup stable but heavy).
3. Helicopter collective throttle stickiness.
4. Open Frontier/A Shau helicopters are cosmetic - no NPC pilots, no transport mechanic.

## Architecture Debt

1. SystemManager ceremony - adding a new system touches SystemInitializer + composers.
2. PlayerController 47 setter methods (deferred init ceremony).
3. Variable deltaTime physics (no fixed timestep for player/helicopter).
4. Mixed UI paradigms (~57 files with raw createElement alongside UIComponent + CSS Modules).
5. Partial singleton reset coverage (blocks HMR and "return to menu").
