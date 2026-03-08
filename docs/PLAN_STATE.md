# Plan State

> Persistent tracker for agent loops, session compactions, and prioritization.
> Updated: 2026-03-08

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

## Wave 2: Gameplay Impact (medium) - NOT STARTED

- [ ] 2.1 Helicopter weapons: door guns for Huey, rockets for Cobra/Gunship
- [ ] 2.2 Vehicle damage + destruction (health, fire, crash)
- [ ] 2.3 Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds (requires asset generation)
- [ ] 2.4 Wire 1-2 additional DEM maps as game modes (Ia Drang, Khe Sanh - data ready in data/vietnam/converted/)

## Wave 3: Architecture Debt (medium-large)

- [x] 3.1 AI cover search grid reduced (8x8 + early-out at 4 candidates) - p99 86ms -> 35ms
- [x] 3.2 Terrain tick stagger (BVH skips vegetation rebuild frames) - frontier30m p99 effectively solved
- [ ] 3.3 Make perf regression a deploy gate in CI (currently advisory-only)
- [ ] 3.4 Combat AI p99 still ~35ms (target <16ms) - remaining synchronous cover search cost
- [ ] 3.5 Terrain contract cleanup: remove stale chunk-era config names, debug labels

## Wave 4: Content Expansion (large)

- [ ] 4.1 Ground vehicles (M151 jeep first - GLB exists, simplest vehicle)
- [ ] 4.2 Faction AI doctrines (VC guerrilla vs NVA conventional vs US combined arms)
- [ ] 4.3 Music/soundtrack
- [ ] 4.4 Day/night cycle

## Far Horizon (not sized, not sequenced)

- Watercraft (PBR, sampan - GLBs exist, blocked on water engine)
- Fixed-wing aircraft (Spooky, Phantom, Skyraider - GLBs exist, no code)
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
| Source files | 327 |
| Test files | 128 |
| Tests passing | 2,999 |
| Type errors | 0 |
| Lint errors | 0 |
| Lint warnings | 102 |
| TODO/FIXME in source | 1 |
| Runtime deps | 3 (three, signals, three-mesh-bvh) |
| GLB models | 73 on disk, 73 referenced |
| Audio files | 31 on disk, 31 wired, 0 orphaned |
| DEM maps | 10 processed, 1 wired (A Shau) |

## Feature Completeness

| Domain | Status | Notes |
|--------|--------|-------|
| Weapons (7 types) | DONE | M16A1, AK-47, Ithaca 37, M3 Grease Gun, M1911, M60, M79 - all GLBs, differentiated ballistics |
| Loadout system | DONE | RespawnUI: primary/secondary weapon + equipment + 3 presets + faction pools + localStorage |
| Combat (squads, suppression, damage) | DONE | Full damage model, headshots, kill assists |
| Grenades (frag/smoke/flash) | DONE | Cooking, arc preview, physics, audio (pin pull, throw, beep) |
| Mortar system | DONE | Deployment, aiming, ballistics, dedicated camera |
| Helicopter (3 types, flight) | DONE | Enter/exit, distinct physics per aircraft |
| Helicopter weapons | NOT STARTED | Roles defined (transport/gunship/attack) but no weapon code |
| Vehicle damage | NOT STARTED | No health system for vehicles |
| Game modes (5) | DONE | Zones, tickets, win conditions, policy-driven respawn, mode product passes complete |
| Weather system | DONE | Rain, storms, lightning, transitions |
| World structures | DONE | 35 prefabs, WorldFeatureSystem, placements on TDM/ZC/A Shau |
| Ambient wildlife | DONE | All 6 types spawning (egret, buffalo, macaque, tiger, cobra, boar) |
| Water | PARTIAL | Visual plane only, no swimming/rivers |
| Day/night | NOT STARTED | Deleted as dead code |
| Audio coverage | DONE | Per-weapon fire sounds, grenade lifecycle, kill streak sting, footsteps, ambient |
| Music | NOT STARTED | |
| HUD (minimap, scoreboard, kill feed) | DONE | 18-region CSS Grid, squad overlay via Z key |
| Start screen + settings | DONE | Graphics quality controls post-processing |
| Multiplayer | NOT STARTED | Single-player AI only |

## Known Bugs

1. A Shau squad spawn: player squad created at HQ position, not near tactical insertion point
2. Combat AI p99 ~35ms: still 2x the 16ms budget target despite 60% improvement

## Architecture Risks

1. Combat AI p99 ~35ms (target <16ms) - synchronous cover search improved but not solved
2. Budget enforcement advisory-only (no load shedding)
3. Perf regression doesn't block deploy in CI
4. ~150 setter-injection calls in SystemConnector (works but fragile)

## Dead Code Pending Deletion

(No known dead code remaining)

## Stale Docs Pending Archive/Update

- `docs/SQUAD_COMMAND_REARCHITECT.md` - references deleted QuickCommandStrip + SquadRadialMenu (historical, low priority)
- `docs/GAME_MODES_EXECUTION_PLAN.md` - references deleted RespawnMapView.ts, QuickCommandStrip (historical)
- `docs/ROADMAP.md` Phase 5C - references deleted chunk system
