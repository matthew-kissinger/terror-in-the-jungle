# Roadmap

Last updated: 2026-04-21

> Aspirational planning document. Active work tracked in [BACKLOG.md](BACKLOG.md).
> For the current verified repo state, see [STATE_OF_REPO.md](STATE_OF_REPO.md).

## Vision

A **war simulation engine** - not a single game. Powers game modes from squad-level FPS to theater-level combined arms RTS, all in a browser.

Core loop: **Play in first person AND command simultaneously.** The player holds a rifle and a radio. Snap between FPS combat and overhead tactical map in real-time - no time slowdown. All commanding happens under fire.

Vietnam War is the first theater. Architecture generalizes to any war with different factions, terrain, vehicles, and doctrine.

Current renderer: `WebGLRenderer`. `WebGPURenderer`/TSL deferred until terrain materials and post-processing are ported.

Current truthful framing: the engine already supports large strategic populations through materialization tiers; the verified fully materialized perf frontier is still centered on 120-NPC scenarios, not 3,000 simultaneous live combatants.

## Architecture Principles

1. **Engine-first:** Every system is a reusable module, not a one-off feature.
2. **Scale-agnostic:** Same systems power 8v8 and 3000v3000. Materialization tiers handle scale.
3. **Input-agnostic:** Single control schema for keyboard, touch, and gamepad.
4. **Asset-driven:** GLB/WebP/PNG from disk, not procedural code generation.
5. **Faction-flexible:** Factions are data configs (sprites, weapons, AI doctrine), not hardcoded.

## Phase Summary

| Phase | Status | Summary |
|-------|--------|---------|
| 0: Asset Manifest | DONE | 75 asset specs generated via PixelForge Kiln. |
| 1: Asset Generation | DONE | 75 GLBs shipped. Vegetation remakes pending. |
| 2: Asset Integration | MOSTLY DONE | Weapons (7/9), helicopters (3/3), animals (6/6), structures integrated. Fixed-wing runtime is live; ground vehicles remain static only. |
| 3: Vehicle Controls | PARTIAL | 3 flyable helicopters plus 3 flyable fixed-wing aircraft with live HUD/control runtime. Fixed-wing feel/interpolation sign-off, NPC transport, ground vehicles, and aircraft combat integration remain. |
| 4: Squad Command | PARTIAL | Single coordinator + Z-key overlay live. Map-first command mode live. Gamepad parity, scale adapters deferred. |
| 5: Terrain Engine | PARTIAL | CDLOD rewrite live. Biome classifier and vegetation scattering live. Water engine and hydrology not started. |
| 6: Ground Vehicles | NOT STARTED | GLBs exist (jeep, APC, truck, tank, PT-76). No driving runtime. |
| 7: Combat Expansion | PARTIAL | Loadout system live (6 weapon slots, faction pools, presets). Stationary weapons, field pickup not started. |
| 8: Fixed-Wing Air War | PARTIAL | Fixed-wing runtime is live in Open Frontier with phase-aware control law, airfield stands/runway helpers, NPC pilot support, and browser probes for takeoff/climb/orbit/handoff/approach. Cycle 2 must still resolve high-speed feel, altitude bounce/porpoise, camera/render smoothness, weapons, and broader combat loops. |
| 9: Faction Expansion | PARTIAL | 4 factions in loadout context (US, ARVN, NVA, VC). AI doctrine per faction not started. |
| 10: Scale Frontier | NOT STARTED | Gated on combat AI p99 closure. |

## Phase Details (Future Work)

### Vehicles & Transport
- Fixed-wing feel/interpolation sign-off before adding more vehicle types
- Unified `IVehicle` interface for helicopters, ground vehicles, watercraft
- Ground vehicle physics (terrain-following, speed by surface type)
- M151 Jeep, M113 APC, M35 Truck as first drivable ground vehicles
- NPC helicopter transport (takeoff, fly to LZ, deploy squad, RTB)
- Watercraft (sampan, PBR) blocked on water engine

### Command & RTS
- Command scaling: squad (8-16) -> platoon (30-60) -> company (100-200) -> battalion (500+)
- Full map as tactical command surface with waypoints and unit selection
- Air support / artillery request interface

### Terrain & Environment
- Water engine: river system, swimming, depth-based rendering, watercraft physics
- Road network generation (splines, intersections, pathfinding between zones)
- Biome transitions (blending at boundaries)

### Combat & Content
- Stationary weapons (M2 .50 cal emplacements, NPC manning)
- Faction AI doctrines (VC guerrilla, NVA conventional, US combined arms)
- Day/night cycle, music/soundtrack
- Survival/roguelite game mode

### Scale & Performance
- ECS evaluation for combat entities (if current approach stops scaling)
- Additional DEM maps (Khe Sanh, Hue, Ia Drang, Mekong Delta)
- Tile-based region loading for theater-scale maps
- Multiplayer/networking (architect for it, not building now)

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Loadout | Default presets + fully customizable. Changeable on respawn. |
| Command mode | Fully real-time. No time slowdown. |
| Water | Terrain engine module. Sandbox test first. |
| NPC rendering | Sprites now. 3D later if performant. |
| Campaign | Engine module. Linear, dynamic, and sandbox modes possible. Not near-term. |
| Multiplayer | Don't block it, but not building now. Single-player AI focus. |
| Historical accuracy | Case-by-case. |

## Performance Budget

- Near-term gate: keep 120-NPC materialized scenarios under a stable 60 FPS class budget and continue driving down p95/p99 tails through capture-and-compare work
- Long-term scale-frontier target before widening materialized counts: <8ms average, <16ms p99
- Memory: <512MB heap for standard modes
- Every phase: perf captures before/after, reject regressions
