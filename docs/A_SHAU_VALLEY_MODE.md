# A Shau Valley Mode

Last updated: 2026-02-18

## Status

**Fully implemented and playable.**

The mode ships as the fifth selectable entry in the start screen (`GameMode.A_SHAU_VALLEY`). All core systems — DEM terrain, war simulation, materialization pipeline, abstract combat, strategic AI, persistence, and strategic feedback — are wired and active.

---

## Specs

### Identity

| Property | Value |
|---|---|
| Map area | 21 km × 21 km (DEM-derived, ~21 136 m measured) |
| Terrain | Real-world DEM — A Shau Valley, Thua Thien Province, Vietnam |
| Elevation range | 373 m – 1 902 m (1 530 m relief) |
| Match duration | 60 min per session (save/resume makes this a session cap, not a hard end) |
| Max tickets | 5 000 per side |
| Death penalty | 2 tickets |
| Respawn time | 12 s |
| Spawn protection | 4 s |

### Forces

| Property | Value |
|---|---|
| Total strategic agents | 3 000 (1 500 US · 1 500 NVA) |
| Max materialized (full AI) | 60 |
| Simulated radius (lightweight lerp) | 3 000 m from player |
| Materialization radius | 800 m from player |
| Dematerialization radius | 900 m (100 m hysteresis) |
| Squad size | 8 – 12 members |
| Reinforcement cooldown | 90 s |

Starting posture: NVA entrenched across the valley with supply lines intact. US assaults from LZs on the eastern ridgeline.

### Zone Layout (15 zones)

#### US Home Bases (eastern ridgeline, no ticket bleed)
| ID | Name | Notes |
|---|---|---|
| `us_base` | LZ Goodman | Primary US insertion point |
| `us_hq_east` | LZ Stallion | Northern LZ complex |
| `us_hq_south` | LZ Eagle | Southern LZ |

#### NVA Home Bases (western mountains, no ticket bleed)
| ID | Name | Notes |
|---|---|---|
| `opfor_hq_main` | Base Area 611 | Primary NVA staging (Laotian border) |
| `opfor_hq_north` | Base Area 607 | Northern NVA base |
| `opfor_hq_south` | NVA Supply Depot | Southern supply node |

#### Contested Objectives (all drive ticket bleed)
| ID | Name | Bleed | Start Owner | Historical Significance |
|---|---|---|---|---|
| `zone_hill937` | Hill 937 (Hamburger Hill) | 6/s | Contested | 10-day battle, May 1969 (Operation Apache Snow) |
| `zone_tabat` | Ta Bat Airfield | 4/s | NVA | Old French airstrip; NVA logistics node |
| `zone_aluoi` | A Luoi Airfield | 4/s | Contested | Operation Delaware primary objective (1968) |
| `zone_ripcord` | Firebase Ripcord | 4/s | US | 23-day siege, 1970 — last major US battle |
| `zone_blaze` | Firebase Blaze | 3/s | US | Ridgeline firebase supporting operations |
| `zone_sf_camp` | SF Camp A Shau | 3/s | NVA | SF camp overrun by NVA regiment (1966) |
| `zone_pepper` | LZ Pepper | 2/s | US | Eastern approach helicopter LZ |
| `zone_tiger` | Tiger Mountain | 3/s | NVA | Dominating terrain / NVA observation post |
| `zone_dong_so` | Dong So Ridge | 2/s | US | Northern ridgeline position |
| `zone_trail_junction` | Trail Junction | 5/s | NVA | Ho Chi Minh Trail entry points — high value |
| `zone_hill996` | Hill 996 | 3/s | NVA | NVA staging ground north of Hamburger Hill |
| `zone_cannon` | Firebase Cannon | 2/s | Contested | Northern firebase, contested from the start |

### Renderer Overrides

| Setting | Value | Reason |
|---|---|---|
| `cameraFar` | 4 000 m | Tall DEM ridgelines extend horizon |
| `fogDensity` | 0.001 | Low density fog for jungle-valley atmosphere |
| `shadowFar` | 500 m | Narrows shadow cascade for depth budget |
| `waterEnabled` | false | No global water plane — rivers rendered by `RiverWaterSystem` |
| Weather | Light rain (initial) | Persistent weather with 30% transition chance per minute |

### Scale Overrides (`scaleConfig`)

Applied via `GameModeManager` to adapt systems tuned for 400 m maps to the 21 km battlefield.

| Parameter | Value | Default |
|---|---|---|
| `aiEngagementRange` | 200 m | 150 m |
| `aiVisualRange` | 180 m | 130 m |
| `lodHighRange` | 300 m | 200 m |
| `lodMediumRange` | 600 m | 400 m |
| `lodLowRange` | 1 000 m | 600 m |
| `patrolRadius` | 60 m | 20 m |
| `spawnRadius` | 30 – 80 m | 20 – 50 m |
| `influenceMapGridSize` | 128 | 64 |
| `spatialBounds` | 22 000 m | 4 000 m |

---

## Engine Extensions

The A Shau Valley mode required six new systems and several targeted extensions to existing ones. The existing engine required **zero changes to hot-path combat logic** — all additions are either opt-in via config or operate above the existing systems.

### 1. DEMHeightProvider (`src/systems/terrain/DEMHeightProvider.ts`)

**New file.** Implements `IHeightProvider` using a raw `Float32Array` grid loaded from a `.f32` binary file. The active DEM is `data/vietnam/big-map/a-shau-z14-9x9.f32` (2 304 × 2 304 pixels, 9 m/pixel, ~20 MB).

- **Bilinear interpolation** — smooth height queries between grid samples.
- **Bulk `getHeightData()`** — avoids per-vertex function-call overhead during chunk generation.
- **Static `sampleBilinear()`** — inlined into the chunk worker code (`ChunkWorkerCode.ts`) for off-main-thread terrain generation.
- **`getWorkerConfig()`** — serialises the grid buffer via `ArrayBuffer.slice()` for zero-copy transfer to workers.

```
Terrain pipeline when heightSource.type === 'dem':
  GameEngineInit → fetch .f32 → ArrayBuffer → Float32Array
                → new DEMHeightProvider(data, width, height, mpp)
                → ImprovedChunkManager.setHeightProvider(demProvider)
                → ChunkWorker receives HeightProviderConfig {type:'dem', buffer}
```

### 2. WarSimulator (`src/systems/strategy/WarSimulator.ts`)

**New file.** Top-level orchestrator for the persistent 3 000-agent war engine. Sits above `CombatantSystem`, which has no awareness of it.

- Owns the authoritative `Map<string, StrategicAgent>` and `Map<string, StrategicSquad>` records.
- Drives four subsystems per frame: `MaterializationPipeline`, simulated movement, `AbstractCombatResolver`, `StrategicDirector`.
- Exposes `getAgentPositionsForMap()` returning a `Float32Array` (`[faction, x, z, tier, …]`) for map rendering with zero allocation on read.
- Budget: **2 ms per frame** hard cap, enforced by the movement loop.
- Opt-in: activated only when `GameModeConfig.warSimulator.enabled === true`.

### 3. MaterializationPipeline (`src/systems/strategy/MaterializationPipeline.ts`)

**New file.** Manages the three-tier agent model:

| Tier | Count | Description |
|---|---|---|
| `MATERIALIZED` | 30 – 60 | Full `CombatantSystem` entity — AI, physics, rendering |
| `SIMULATED` | ~200 | Lightweight position lerp within 3 000 m of player |
| `STRATEGIC` | ~2 700 | Squad-level counter — no per-agent update |

Key behaviours:
- **Hysteresis**: materialize at 800 m, dematerialize at 900 m — prevents thrashing at the boundary.
- **Velocity prediction**: looks 200 m ahead in the player's movement direction to pre-materialize agents.
- **Squad coherence**: materializes full squads, not individual members, up to a 100 m squad buffer radius.
- **Throttling**: max 4 materializations and 4 dematerializations per frame.

`materializeAgent()` / `dematerializeAgent()` are new APIs added to `CombatantSystem` (see §8).

### 4. AbstractCombatResolver (`src/systems/strategy/AbstractCombatResolver.ts`)

**New file.** Runs every 2 s. Resolves off-screen combat between non-materialized squads using probability:

- Finds opposing squad pairs within 200 m centroid distance.
- Kill probability = `BASE (5%) × strength_ratio` (capped at 3×), modified by a `1.5×` defense bonus for squads defending an owned zone.
- Deaths flow into `TicketSystem.onCombatantDeath()` to affect ticket counts.
- Emits `squad_engaged`, `major_battle`, `squad_wiped`, `agent_killed` events.

### 5. StrategicDirector (`src/systems/strategy/StrategicDirector.ts`)

**New file.** Runs every 5 s. Assigns squads to objectives and models faction doctrine:

| Faction | Attack | Defend | Patrol |
|---|---|---|---|
| NVA (OPFOR) | 20% | 50% | 30% |
| US | 50% | 25% | 25% |

- Zones are scored by ticket bleed rate × contested multiplier × nearby-forces factor.
- Weak squads (strength ≤ 50%) are routed to the nearest friendly zone.
- Handles reinforcement respawning: if a faction drops below 70% alive, up to 30 dead agents are respawned at HQ positions every 90 s.

### 6. PersistenceSystem (`src/systems/strategy/PersistenceSystem.ts`)

**New file.** Saves and loads `WarState` to `localStorage`. Schema version 1.

- 3 slots: slot 0 = auto-save, slots 1–2 = manual.
- Auto-save fires every 60 s.
- Serialised size: ~360 KB per save for 3 000 agents (well under the 5 MB `localStorage` limit).
- On load: all `MATERIALIZED` agents are reset to `STRATEGIC`; the pipeline re-materializes on the next frame.
- `GameEngineInit` checks for an existing auto-save on mode start and offers resume.

### 7. StrategicFeedback (`src/systems/strategy/StrategicFeedback.ts`)

**New file.** Event-driven system that bridges `WarSimulator` events to player-facing feedback:

- **HUD messages**: zone captures/losses, reinforcements, faction advantage — throttled to one message per key per 8 s.
- **Distant battle audio**: scales volume with distance (max range 5 000 m, volume ≤ 15%), 5 s cooldown. Calls optional `AudioManager.playDistantCombat()`.
- No per-frame computation; all logic runs in the `WarEventEmitter` subscription callback.

### 8. CombatantSystem Extensions

Two new public methods added to `CombatantSystem` (`src/systems/combat/CombatantSystem.ts`):

```ts
materializeAgent(data: { faction, x, y, z, health, squadId? }): string
```
Creates a full combatant from a strategic agent snapshot; registers it in the spatial grid and returns its combatant ID.

```ts
dematerializeAgent(combatantId: string): { x, y, z, health, alive } | null
```
Removes a combatant and returns its final state for the WarSimulator to absorb back into the agent record.

```ts
setSpatialBounds(size: number): void
```
Adjusts `SpatialOctree` and `SpatialGridManager` bounds at runtime; called by `GameModeManager` when `scaleConfig.spatialBounds` is set.

### 9. GameModeConfig Interface Extensions

Four optional field groups added to `GameModeConfig` (`src/config/gameModeTypes.ts`):

| Field | Type | Purpose |
|---|---|---|
| `heightSource` | `{ type: 'dem', path, width, height, metersPerPixel }` | Selects DEM terrain instead of procedural noise |
| `cameraFar` | `number` | Per-mode camera far plane override |
| `fogDensity` | `number` | Per-mode exponential fog density |
| `shadowFar` | `number` | Per-mode shadow cascade far override |
| `waterEnabled` | `boolean` | Disables global water plane when `false` |
| `scaleConfig` | `ScaleConfig` | Per-mode AI/LOD/spatial parameter overrides |
| `warSimulator` | `WarSimulatorConfig` | Activates the war simulation engine |

All fields are optional; unset fields fall through to existing system defaults.

### 10. GameEngineInit Extensions

`startGameWithMode()` in `src/core/GameEngineInit.ts` gained:

- **DEM loading**: fetches the `.f32` binary, builds `Float32Array`, constructs `DEMHeightProvider`, and injects it into the terrain system before chunk generation starts.
- **Renderer overrides**: applies `cameraFar`, `fogDensity`, `shadowFar` to `GameRenderer` via `applyPerModeRendererSettings()`.
- **WarSimulator boot**: calls `warSimulator.configure()`, `spawnStrategicForces()`, and optionally `loadWarState()` for resume.

### 11. Minimap and Full Map Extensions

`MinimapSystem` and `FullMapSystem` gained `setWarSimulator(sim: WarSimulator)`. When set and the simulator is active, they read `getAgentPositionsForMap()` each frame and render colour-coded dots for all alive agents by faction and tier. The fix committed in the initial commit (`65bf773`) corrected minimap dot positions to rotate with the player heading using the standard 2-D rotation transform.

### 12. RiverWaterSystem (`src/systems/environment/RiverWaterSystem.ts`)

**New file.** Renders river geometry from GeoJSON polylines (`data/vietnam/reference/a-shau-rivers.json`) as flat, animated water quads. Used instead of the global `WaterSystem` plane (`waterEnabled: false`) to accurately reflect the valley's stream network without a world-spanning reflective surface.

---

## File Index

| File | Role |
|---|---|
| `src/config/AShauValleyConfig.ts` | Mode config: zones, world size, renderer overrides, war simulator params |
| `src/config/gameModeTypes.ts` | Extended `GameModeConfig` interface (`heightSource`, `scaleConfig`, `warSimulator`, renderer overrides) |
| `src/systems/terrain/DEMHeightProvider.ts` | DEM bilinear height sampler |
| `src/systems/terrain/IHeightProvider.ts` | `IHeightProvider` interface (new) |
| `src/systems/terrain/NoiseHeightProvider.ts` | Procedural noise fallback (new, wraps old inline logic) |
| `src/systems/strategy/WarSimulator.ts` | War engine orchestrator |
| `src/systems/strategy/MaterializationPipeline.ts` | 3-tier materialization |
| `src/systems/strategy/AbstractCombatResolver.ts` | Off-screen combat resolution |
| `src/systems/strategy/StrategicDirector.ts` | Squad-level objective AI |
| `src/systems/strategy/StrategicFeedback.ts` | HUD/audio war feedback |
| `src/systems/strategy/PersistenceSystem.ts` | localStorage save/load |
| `src/systems/strategy/WarEventEmitter.ts` | Pub/sub event bus |
| `src/systems/strategy/types.ts` | `StrategicAgent`, `StrategicSquad`, `WarState`, `AgentTier` types |
| `src/systems/environment/RiverWaterSystem.ts` | GeoJSON river rendering |
| `src/core/GameEngineInit.ts` | DEM load, renderer override, war simulator boot |
| `src/systems/combat/CombatantSystem.ts` | `materializeAgent`, `dematerializeAgent`, `setSpatialBounds` additions |
| `data/vietnam/big-map/a-shau-z14-9x9.f32` | DEM binary (tracked via LFS reference; not in repo blob) |
| `data/vietnam/reference/a-shau-rivers.json` | River GeoJSON for `RiverWaterSystem` |
| `data/vietnam/big-map/a-shau-z14-9x9.f32.meta.json` | DEM metadata (bounds, resolution, coverage) |

---

## Known Gaps and TODOs

- **Helicopter insert** — US forces historically arrived by helicopter; the `HelicopterSystem` is not yet wired to spawn the player at an LZ on mode start.
- **Campaign victory condition** — currently only ticket bleed drives a winner; no specific "break NVA supply lines" or "hold all firebases" end-state is implemented.
- **Manual save UI** — `PersistenceSystem` supports slots 1–2 for manual saves, but no in-game UI exposes them yet.
- **Audio: `playDistantCombat`** — `StrategicFeedback` calls this optional method on `AudioManager`; it has not yet been implemented, so distant battle audio is silently skipped.
- **Mobile tactical map** — the full map (M key hold-to-view) has no touch button, so mobile players cannot open it to see strategic agent dots.
