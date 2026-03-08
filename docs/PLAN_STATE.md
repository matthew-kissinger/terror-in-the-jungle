# Plan State

> Persistent tracker for agent loops, session compactions, and prioritization.
> Updated: 2026-03-08

---

## Wave 1: Quick Wins (small, parallelizable)

- [x] 1.1 Fix 5 lint errors (unused imports/params in WeaponFiring, TerrainFeatureCompiler, OpenFrontierRespawnMap)
- [x] 1.2 Delete dead LoadoutSelector + its 2 smoke tests (replaced by RespawnUI loadout panel + LoadoutService)
- [x] 1.3 Delete 2 orphaned audio files (voiceCalloutOPFOR.wav, voiceCalloutUS.wav)
- [x] 1.4 Add per-weapon audio configs for pistol, LMG, launcher (distinct volume/pitch per weapon type)
- [x] 1.5 Wire remaining 3 animal types: tiger (rare, stationary), king cobra (slow, solitary), wild boar (pairs, slow wander)
- [x] 1.6 Archive stale plan docs: ASHAU_VALLEY_IMPLEMENTATION_PLAN, FRONTEND_REARCHITECTURE_BACKLOG, ROADMAP stale sections fixed

## Wave 2: Gameplay Impact (medium)

- [ ] 2.1 Helicopter weapons: door guns for Huey, rockets for Cobra/Gunship
- [ ] 2.2 Vehicle damage + destruction (health, fire, crash)
- [ ] 2.3 Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds (requires asset generation)
- [ ] 2.4 Wire 1-2 additional DEM maps as game modes (Ia Drang, Khe Sanh - data ready in data/vietnam/converted/)

## Wave 3: Architecture Debt (medium-large)

- [ ] 3.1 Amortize AI cover search across frames (root cause of combat p99 ~35ms, target <16ms)
- [ ] 3.2 Vegetation residency rewrite (fix frontier30m soak test p99 86ms)
- [ ] 3.3 Make perf regression a deploy gate in CI (currently advisory-only)
- [ ] 3.4 Terrain contract cleanup: remove stale chunk-era config names, debug labels

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
| Test files | 127 |
| Tests passing | 2,995 |
| Type errors | 0 |
| Lint errors | 5 |
| Lint warnings | 102 |
| TODO/FIXME in source | 1 |
| Runtime deps | 3 (three, signals, three-mesh-bvh) |
| GLB models | 73 on disk, 73 referenced |
| Audio files | 33 on disk, 28 wired, 2 orphaned |
| DEM maps | 10 processed, 1 wired (A Shau) |

## Feature Completeness

| Domain | Status | Notes |
|--------|--------|-------|
| Weapons (7 types) | DONE | All GLBs loaded, differentiated ballistics, ADS, reload |
| Loadout system | DONE | RespawnUI has full weapon/equipment/preset selection; dead LoadoutSelector needs deletion |
| Combat (squads, suppression, damage) | DONE | Full damage model, headshots, kill assists |
| Grenades (frag/smoke/flash) | DONE | Cooking, arc preview, physics, audio |
| Mortar system | DONE | Deployment, aiming, ballistics, dedicated camera |
| Helicopter (3 types, flight) | DONE | Enter/exit, distinct physics per aircraft |
| Helicopter weapons | NOT STARTED | Roles defined but no weapon code |
| Vehicle damage | NOT STARTED | No health system for vehicles |
| Game modes (5) | DONE | Zones, tickets, win conditions, policy-driven respawn |
| Weather system | DONE | Rain, storms, lightning, transitions |
| World structures | DONE | 35 prefabs, WorldFeatureSystem, placements on TDM/ZC/A Shau |
| Ambient wildlife | PARTIAL | 3 of 6 types spawning (egret, buffalo, macaque) |
| Water | PARTIAL | Visual plane only, no swimming/rivers |
| Day/night | NOT STARTED | Deleted as dead code |
| Audio coverage | PARTIAL | Core sounds done, missing per-weapon variants for pistol/LMG/launcher |
| Music | NOT STARTED | |
| HUD (minimap, scoreboard, kill feed) | DONE | |
| Start screen + settings | DONE | |
| Multiplayer | NOT STARTED | Single-player AI only |

## Architecture Risks

1. Combat AI p99 ~35ms (target <16ms) - synchronous cover search
2. frontier30m soak test FAILS (avg 7ms, p99 86ms) - terrain + combat tail co-occurrence
3. Budget enforcement advisory-only (no load shedding)
4. Perf regression doesn't block deploy in CI
5. ~90 setter-injection calls in SystemConnector (works but fragile)

## Dead Code Pending Deletion

(All items completed - LoadoutSelector, LoadoutGrenadePanel, voice callout wavs deleted)

## Stale Docs Pending Archive/Update

- `docs/ASHAU_VALLEY_IMPLEMENTATION_PLAN.md` - Phase 2/4 superseded by MapIntelPolicy + product passes
- `docs/FRONTEND_REARCHITECTURE_BACKLOG.md` - Phases 1-4 done, Phase 5 stale, immediate tasks likely done
- `docs/ROADMAP.md` Phase 5C - references deleted chunk system
- `docs/ROADMAP.md` Phase 5A - biome system already exists (understated)
- `docs/GAME_MODES_EXECUTION_PLAN.md` - references deleted RespawnMapView.ts
