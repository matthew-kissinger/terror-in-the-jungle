# Roadmap

> Aspirational planning document. Active work tracked in [BACKLOG.md](BACKLOG.md).
> For the current verified repo state, see [Current State](state/CURRENT.md).

## Vision

A **war simulation engine** - not a single game. Powers game modes from squad-level FPS to theater-level combined arms RTS, all in a browser.

Core loop: **Play in first person AND command simultaneously.** The player holds a rifle and a radio. Snap between FPS combat and overhead tactical map in real-time - no time slowdown. All commanding happens under fire.

Vietnam War is the first theater. Architecture generalizes to any war with different factions, terrain, vehicles, and doctrine.

Current production renderer is **`WebGPURenderer`** (Three.js r184,
`three/webgpu` import) with automatic WebGL2 fallback for browsers without
WebGPU support. This landed on master on 2026-05-13 via
[PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
(merge commit `1df141ca`), folding in KONVEYER-0 through KONVEYER-10 plus the
Phase F R1 materialization rearch slices. The WebGL2 fallback path is gated on
`strictWebGPU` only — production users on browsers without WebGPU automatically
hit Three.js's WebGL2 backend (commit `4aec731e`).

Forward-leaning WebGPU tech the project will pursue on this trajectory:
compute shaders (spatial grid, influence map), indirect drawing + GPU-side
culling, TSL ComputeNode for particles, storage-texture-backed terrain
deformation, GPU timestamp queries, subgroup operations. R2-R4 of the Phase F
materialization rearch (cover-spatial-grid, render-silhouette/cluster lanes,
squad-aggregated strategic sim, budget arbiter v2) are queued as follow-up
cycles on `master`.

KONVEYER edge work is now vision-first, not probe-first. Source-backed visual
terrain extent is the direction for finite procedural maps; A Shau needs real
outer DEM/source data, an explicit flight/camera boundary, or a documented
hybrid because synthetic collar tuning still reads unfinished from the air.

Mode startup now has a separate hardening lane. The 2026-05-13
`task/mode-startup-terrain-spike` branch proved the slow mode-selection
symptom was synchronous terrain surface baking, not Recast/WASM cache delivery.
The durable direction is worker-backed terrain surface baking, batched mode
terrain configuration, and visual review of the render-only terrain apron
before merge. See
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).

**Canonical vision sentence (copy verbatim into other docs that need to state it):**

> Engine architected for 3,000 combatants via materialization tiers; live-fire combat verified at 120 NPCs while an ECS hot path is evaluated (Phase F, ~weeks 7–12 of the 2026-05-09 realignment plan).

Phase F is the work that keeps the 3,000 line honest: materialization tiers, a
1,000-NPC perf gate, determinism and budget-arbiter pilots, and a contingent
bitECS hot-path port only if the current approach stops scaling. Cover-search is
no longer the known p99 blocker: the O(1) `CoverSpatialGrid` path is wired and
proven cheap, while the remaining scale risk sits in residual NPC
movement-stall tails, render/Other attribution, and the missing quiet-machine
baseline. Until Phase F lands, all public-facing claims about scale must include
the qualifier above.

Current reality: combatants live in a Map<string,Combatant> (CombatantSystem.ts); bitECS is not yet a dependency and the E1 evaluation (docs/rearch/E1-ecs-evaluation.md) recommends DEFER — ECS is a contingent Phase-F evaluation, not in progress.

## Projekt Objekt-143 Follow-Up

Projekt Objekt-143 follow-up is intentionally deferred until after the current
stabilization release. The 2026-05 experimental/orchestration cycle produced
useful code, tools, and evidence; the repo now treats those findings as
captured signal for the next Projekt revamp rather than as permission for
another pre-release scope expansion.

Carry these findings into the next Projekt revamp:

- Water and hydrology: accepted gameplay water now comes from authored
  level/depth water bodies in Open Frontier and A Shau. These reaches carve
  bathymetry, return `water_body` samples, and render as real volumes instead
  of narrow terrain-following ribbons. They use a cool opaque night material
  to avoid red/white emissive slabs in true night captures. Hydrology remains
  useful as a drainage/material sensor, not as the player-facing water surface.
  The legacy global water plane is only an opt-in fallback; natural WebGPU/TSL
  river rendering, wider authored river networks, crossings, shoreline polish,
  bridge clearance, and watercraft-grade physics remain future terrain-engine
  work.
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
- Platform utilization: production is now WebGPU-primary with automatic
  WebGL2 fallback as of the 2026-05-12 master-merge (PR #192, commit
  `1df141ca`). Continue OffscreenCanvas, worker simulation, and WASM/threading
  only as proof-gated architecture branches.

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
| 2: Asset Integration | MOSTLY DONE | Weapons (7/9), helicopters (3/3), structures, fixed-wing, M151/M48 vehicles, and watercraft boarding/spawn surfaces are integrated. Remaining asset work is visual polish, fleet expansion, and owner playtest acceptance. |
| 3: Vehicle Controls | PARTIAL | 3 flyable helicopters, 3 flyable fixed-wing aircraft, drivable M151, operable M48 tanks, and boardable watercraft surfaces are live. Fixed-wing feel/interpolation sign-off, vehicle seat swaps, NPC transport, aircraft period weapons/routes, and broader combined-arms feel remain. |
| 4: Squad Command | PARTIAL | Single coordinator + Z-key overlay live. Map-first command mode live. Gamepad parity, scale adapters deferred. |
| 5: Terrain Engine | PARTIAL | CDLOD rewrite live. Biome classifier and vegetation scattering live. A Shau DEM delivery is manifest-backed locally; static-tiled nav and route/NPC quality still need play-path validation. Water now uses authored level/depth bodies with carved bathymetry and `water_body` samples in Open Frontier and A Shau; hydrology is diagnostic/material input. Final WebGPU/TSL water material, broader authored river networks, shoreline polish, bridge clearance, and watercraft-grade physics remain open. |
| 6: Ground Vehicles | MOSTLY DONE | M151 jeep (VEKHIKL-1) drivable with per-wheel terrain conform; M48 Patton chassis (VEKHIKL-3) + turret/cannon/AI gunner (VEKHIKL-4) shipped; cycle-2026-05-28 added tank crew + cannon + turret and deploy/loadout discoverability. All code-complete; playtests deferred to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md). Architecture memos: `docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md` (wheeled physics, Ackermann steering, ground-normal conform) and `docs/rearch/TANK_SYSTEMS_2026-05-13.md` (skid-steer, independent turret, gunner seat, ballistic cannon, damage states). |
| 7: Combat Expansion | PARTIAL | Loadout system live (6 weapon slots, faction pools, presets). Weapon pickup and M2HB emplacement surfaces exist but remain playtest-polish items; faction doctrines and broader content loops remain open. |
| 8: Fixed-Wing Air War | PARTIAL | Fixed-wing runtime is live in Open Frontier with phase-aware control law, airfield stands/runway helpers, NPC pilot support, and browser probes for takeoff/climb/orbit/handoff/approach. Cycle 2 must still resolve high-speed feel, altitude bounce/porpoise, camera/render smoothness, weapons, and broader combat loops. |
| 9: Faction Expansion | PARTIAL | 4 factions in loadout context (US, ARVN, NVA, VC). AI doctrine per faction not started. |
| 10: Scale Frontier | NOT STARTED | Gated on STABILIZAT-1 quiet-machine baselines, residual combat movement-stall tail work, render/Other attribution, and Phase F materialization proof. |

## Current Remaining Roadmap Work

- Owner playtest sign-off for the terrain/vehicle/water foundation reset and the
  playtest-deferred VODA, VEKHIKL, AVIATSIYA, SVYAZ, UX, and DIZAYN surfaces.
- SOL-1 solar/atmosphere/terrain lighting rearch: the active source candidate
  now follows the Sheep Dog Simulator-style ownership model where
  `SunDiscMesh` owns a depth-tested hot sun body and the TSL sky dome owns
  bounded atmospheric glow/scatter plus a tight warm sky solar mass. The
  post-feedback full matrix passes `33/33` captures with daylight WebGPU
  `sunCore=0.105-0.113%`, `sunSpan=5.19-5.46%`, explicit WebGL2 Open Frontier
  `sunCore=0.085-0.086%`, `sunSpan=4.44%`, and max parity delta `0.39%`. A Shau
  dusk ridge proof passes strict WebGPU and production fallback terrain
  occlusion, terrain warmth, sun-scale, and `0.00%` parity delta, while A Shau
  midnight verifies the authored water body no longer creates a local
  red/white/cyan/bright slab. Production parity is proven by
  `check:live-release`; owner visual acceptance remains the SOL-1 closeout gate.
- STABILIZAT-1: re-establish quiet-machine perf baselines, certify combat120
  frame tails, and separate NPC movement-stall work from render/Other cost.
- KB-STARTUP-1: harden worker-backed terrain surface baking and mode-start
  batching so large maps stop blocking mode selection on the main thread.
- KONVEYER-12: choose a finite-map edge strategy for procedural maps and a real
  A Shau outer-boundary strategy instead of synthetic collar tuning.
- A Shau play-path validation: route/NPC movement quality, airfield usability,
  vehicle spawn/driving proof, water readability, and terrain-source boundaries.
- Aviation follow-through: fixed-wing feel, period-specific weapons, lead/sway
  aids, named maneuver routes, and broader air-combat loops.
- Ground and water vehicle follow-through: seat swaps, M113/M35/T-54 fleet
  expansion, bridge clearance, watercraft physics, and combined-arms feel.
- Scale frontier: 1,000-NPC perf gate, materialization budget arbitration,
  determinism proof, and an ECS hot-path decision only if OOP stops scaling.

## Phase Details (Future Work)

### Vehicles & Transport
- Fixed-wing feel/interpolation sign-off before widening air-combat scope
- Continue vehicle adapter/session consolidation across helicopters, fixed-wing,
  ground vehicles, and watercraft
- Seat swaps, active-gunner handoff, and combined-arms vehicle feel
- M113 APC, M35 truck, and T-54 as next drivable ground-vehicle candidates
- NPC helicopter transport (takeoff, fly to LZ, deploy squad, RTB)
- Watercraft (sampan, PBR) have boarding/spawn integration; watercraft-grade
  hydrodynamics, bridge clearance, and seat-swap combat polish remain open.

### Command & RTS
- Command scaling: squad (8-16) -> platoon (30-60) -> company (100-200) -> battalion (500+)
- Full map as tactical command surface with waypoints and unit selection
- Air support / artillery request interface

### Terrain & Environment
- Water engine: broader authored river network, WebGPU/TSL material pass,
  shoreline polish, bridge clearance, swimming/wading feel, and watercraft
  physics
- Road network generation (splines, intersections, pathfinding between zones)
- Biome transitions (blending at boundaries)

### Combat & Content
- Stationary weapons polish (M2 .50 cal emplacements, NPC manning, owner feel)
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
| Water | Authored level/depth bodies own gameplay water in Open Frontier and A Shau; hydrology remains drainage/material input; legacy global plane is opt-in fallback. |
| NPC rendering | Pixel Forge impostors are production truth with limited close-GLB materialization; KONVEYER-10 owns WebGPU visual parity for impostors vs close GLBs. |
| Campaign | Engine module. Linear, dynamic, and sandbox modes possible. Not near-term. |
| Multiplayer | Don't block it, but not building now. Single-player AI focus. |
| Historical accuracy | Case-by-case. |

## Performance Budget

- Near-term gate: re-establish quiet-machine baselines through STABILIZAT-1,
  then drive toward a 60 FPS-class budget for 120-NPC materialized scenarios.
  `perf:compare` currently reports latest raw metrics without a tracked
  baseline; cover-search is not the active p99 driver. See
  [docs/state/perf-trust.md](state/perf-trust.md).
- Long-term scale-frontier target before widening materialized counts: <8ms average, <16ms p99
- Memory: <512MB heap for standard modes
- Every phase: perf captures before/after, reject regressions
