# Roadmap

Last updated: 2026-03-30

> Aspirational planning document. Active work tracked in [BACKLOG.md](BACKLOG.md).

## Vision

A **war simulation engine** - not a single game. Powers game modes from squad-level FPS to theater-level combined arms RTS, all in a browser.

Core loop: **Play in first person AND command simultaneously.** The player holds a rifle and a radio. Snap between FPS combat and overhead tactical map in real-time - no time slowdown. All commanding happens under fire.

Vietnam War is the first theater. Architecture generalizes to any war with different factions, terrain, vehicles, and doctrine.

Current renderer: `WebGLRenderer`. `WebGPURenderer`/TSL deferred until terrain materials and post-processing are ported.

## Architecture Principles

1. **Engine-first:** Every system is a reusable module, not a one-off feature.
2. **Scale-agnostic:** Same systems power 8v8 and 3000v3000. Materialization tiers handle scale.
3. **Input-agnostic:** Single control schema for keyboard, touch, and gamepad.
4. **Asset-driven:** GLB/WebP/PNG from disk, not procedural code generation.
5. **Faction-flexible:** Factions are data configs (sprites, weapons, AI doctrine), not hardcoded.

## Phase Summary

| Phase | Status | Summary |
|-------|--------|---------|
| 0: Asset Manifest | DONE | 80+ asset specs for Pixel Forge generation. |
| 1: Asset Generation | DONE | 75 GLBs generated. Vegetation remakes still pending. |
| 2: Asset Integration | MOSTLY DONE | Weapons (7), helicopters (3), animals (6), structures integrated. Fixed-wing/ground vehicles static only. |
| 3: Vehicle Controls | PARTIAL | Helicopter flight/weapons/damage/HUD live. Controls tuning, NPC transport, vehicle abstraction remain. |
| 4: Squad Command | PARTIAL | Single coordinator + Z-key overlay live. Map-first command mode live. Gamepad parity, scale adapters deferred. |
| 5: Terrain Engine | PARTIAL | CDLOD rewrite live. Biome classifier and vegetation scattering live. Water engine and hydrology not started. |
| 6: Ground Vehicles | NOT STARTED | GLBs exist (jeep, APC, truck, tank). No driving runtime. |
| 7: Combat Expansion | PARTIAL | Loadout system live (7 weapons, faction pools, presets). Stationary weapons, field pickup not started. |
| 8: Fixed-Wing Air War | PARTIAL | Flight physics and NPC pilot AI exist. Not wired to live vehicle runtime. |
| 9: Faction Expansion | PARTIAL | 4 factions in loadout context (US, ARVN, NVA, VC). AI doctrine per faction not started. |
| 10: Scale Frontier | NOT STARTED | Gated on combat AI p99 closure. |

## Phase Details (Future Work)

### Vehicles & Transport
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

- Target: 60 FPS with 120+ materialized NPCs
- Frame budget: <8ms average, <16ms p99
- Memory: <512MB heap for standard modes
- Every phase: perf captures before/after, reject regressions
