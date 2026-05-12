# Roadmap

Last verified: 2026-05-11

> Aspirational planning document. Active work tracked in [BACKLOG.md](BACKLOG.md).
> For the current verified repo state, see [STATE_OF_REPO.md](STATE_OF_REPO.md).

## Vision

A **war simulation engine** - not a single game. Powers game modes from squad-level FPS to theater-level combined arms RTS, all in a browser.

Core loop: **Play in first person AND command simultaneously.** The player holds a rifle and a radio. Snap between FPS combat and overhead tactical map in real-time - no time slowdown. All commanding happens under fire.

Vietnam War is the first theater. Architecture generalizes to any war with different factions, terrain, vehicles, and doctrine.

Current production renderer: `WebGLRenderer`. The KONVEYER experimental branch
(`exp/konveyer-webgpu-migration`) now has branch-review evidence for strict
`WebGPURenderer` startup, TSL production material ports, zero active
production render blockers, and terrain ground-tone acceptance. It is not a
production rollout yet. KONVEYER-10 owns rest-of-scene parity and attribution:
vegetation/NPC washout, atmosphere/sky/cloud behavior, `World` timing
decomposition, skyward triangle attribution, finite-map terrain-edge
presentation, cross-browser/mobile proof, and A Shau perf acceptance. WebGL is
diagnostic only for that branch; it must not be used as a fallback success path
for WebGPU migration proof.

KONVEYER edge work is now vision-first, not probe-first. Source-backed visual
terrain extent is the direction for finite procedural maps; A Shau needs real
outer DEM/source data, an explicit flight/camera boundary, or a documented
hybrid because synthetic collar tuning still reads unfinished from the air.

**Canonical vision sentence (copy verbatim into other docs that need to state it):**

> Engine architected for 3,000 combatants via materialization tiers; live-fire combat verified at 120 NPCs while the ECS hot path is built out (Phase F, ~weeks 7–12 of the 2026-05-09 realignment plan).

Phase F is the work that makes the 3,000 line true: bitECS port of combatants, async / precomputed cover-search to close DEFEKT-3, a 1,000-NPC perf gate, and a determinism pilot. Until Phase F lands, all public-facing claims about scale must include the qualifier above.

## Projekt Objekt-143 Follow-Up

Projekt Objekt-143 follow-up is intentionally deferred until after the current
stabilization release. The 2026-05 experimental/orchestration cycle produced
useful code, tools, and evidence; the repo now treats those findings as
captured signal for the next Projekt revamp rather than as permission for
another pre-release scope expansion.

Carry these findings into the next Projekt revamp:

- Water and hydrology: keep the hydrology corridor/bake work and the
  `WaterSystem` query/interaction contract, but treat natural river/lake
  rendering, crossings, shader/intersection work, swimming/buoyancy consumers,
  and watercraft-grade physics as future terrain-engine work.
- Vegetation ecology: use the short-palm retirement, bamboo/ground-cover
  distribution audits, and Pixel Forge candidate proofs as starting evidence
  for clustered jungle, hydrology-aware palms/understory, trail edges, and grass
  or ground-cover replacement work.
- Pixel Forge pipeline: keep the 256px vegetation candidate branch, dry-run
  import plan, structure review, and bureau catalog as future import inputs;
  do not import candidate assets without owner visual acceptance and runtime
  proof.
- Combined-arms feel: keep the active-driver, StrategicDirector, and NPC route
  evidence as stabilization gains, but treat skilled-player objective flow,
  visible support activity, and battlefield life as a future gameplay pass.
- Culling/HLOD: keep the scoped culling evidence and interaction-safety tests,
  then revisit broad HLOD, vegetation culling, parked-aircraft playtest, and
  future vehicle-driving surfaces after the release cutoff.
- Platform utilization: production stays WebGL-first until the KONVEYER branch
  earns human review and production-rollout acceptance. Continue WebGPU,
  OffscreenCanvas, worker simulation, and WASM/threading only as proof-gated
  architecture branches.

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
| 5: Terrain Engine | PARTIAL | CDLOD rewrite live. Biome classifier and vegetation scattering live. A Shau DEM delivery is manifest-backed locally; static-tiled nav and route/NPC quality still need play-path validation. Water has a legacy global plane plus hydrology channel surfaces and query/interaction samples; shader/intersection acceptance and watercraft-grade physics are not started. |
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
| NPC rendering | Pixel Forge impostors are production truth with limited close-GLB materialization; KONVEYER-10 owns WebGPU visual parity for impostors vs close GLBs. |
| Campaign | Engine module. Linear, dynamic, and sandbox modes possible. Not near-term. |
| Multiplayer | Don't block it, but not building now. Single-player AI focus. |
| Historical accuracy | Case-by-case. |

## Performance Budget

- Near-term gate: keep 120-NPC materialized scenarios under a stable 60 FPS class budget and continue driving down p95/p99 tails through capture-and-compare work
- Long-term scale-frontier target before widening materialized counts: <8ms average, <16ms p99
- Memory: <512MB heap for standard modes
- Every phase: perf captures before/after, reject regressions
