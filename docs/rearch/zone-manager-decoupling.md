# ZoneManager Decoupling — Design Memo

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-zone-manager-decoupling` (Phase 2, Round 1).

This memo is the design artifact the upcoming `izone-query-fence` PR cites
when it adds `IZoneQuery` to `src/types/SystemInterfaces.ts`. It catalogs
every direct caller of `ZoneManager`, classifies how each call uses the
manager, defines the read-only `IZoneQuery` interface, and lays out a
batched migration that drops `ZoneManager` fan-in below 20 before Phase 3
god-module splits start re-creating the coupling.

## Why

`ZoneManager` is the worst coupling junction in the repo: 11 production
callers (per `docs/ARCHITECTURE.md` heatmap, ~52 raw symbol references).
Every read/UI/strategy path imports the concrete class because the only
way to ask "what zones exist?" today is to dereference the manager itself.
Splitting `HUDSystem`, `FullMapSystem`, and `CombatantSystem` in Phase 3
will reproduce the same coupling on the new pieces unless we extract a
read-only contract first.

## Caller audit

Eleven production files depend on `ZoneManager` (test files, ZoneManager
internal helpers, and the `CaptureZone` / `ZoneState` value-type imports
are not counted as fan-in — they share the data shape but do not reach
into manager state).

| # | Caller | Receives via | Calls used |
|--:|--------|--------------|------------|
| 1 | `src/ui/hud/HUDSystem.ts` | `setZoneManager(manager)` | `getAllZones` (forwarded to `HUDZoneDisplay`) |
| 2 | `src/ui/hud/HUDZoneDisplay.ts` | parameter on `updateObjectivesDisplay` | `getAllZones` |
| 3 | `src/ui/compass/CompassSystem.ts` + `CompassZoneMarkers.ts` | `setZoneManager(manager)` | `getAllZones` |
| 4 | `src/ui/minimap/MinimapSystem.ts` + `MinimapRenderer.ts` | `setZoneManager(manager)` | `getAllZones` |
| 5 | `src/ui/map/FullMapSystem.ts` | `setZoneManager(manager)` | `getAllZones` |
| 6 | `src/ui/map/OpenFrontierRespawnMap.ts` + `OpenFrontierRespawnMapRenderer.ts` | `setZoneManager(manager)` | `getAllZones` |
| 7 | `src/ui/hud/CommandTacticalMap.ts` (via render-state from `CommandInputManager`) | render-state object | `getAllZones` (through `MinimapRenderer`) |
| 8 | `src/systems/combat/CombatantSystem.ts` (with delegates: `CombatantAI`, `CombatantMovement`, `CombatantSpawnManager`, `CombatantLODManager`, `CombatantSystemUpdate`, `RallyPointSystem`, `SquadManager`, `ai/AIStateDefend`, `ai/AIStatePatrol`, `CombatantMovementStates`, `SpawnPositionCalculator`) | `setZoneManager(manager)` fanned out internally | `getAllZones` only |
| 9 | `src/systems/world/TicketSystem.ts` (via `TicketBleedCalculator`) and `src/systems/world/VictoryConditions.ts` | `setZoneManager(manager)` | `getAllZones` |
|10 | `src/systems/world/GameModeManager.ts` | constructor / mode wiring | `setGameModeConfig`, `getAllZones` (snapshot for `WarSimulator.spawnStrategicForces`) |
|11 | `src/systems/strategy/WarSimulator.ts` (with `StrategicDirector`, `AbstractCombatResolver`) | `setZoneManager(manager)` | `getAllZones` |
|12 | `src/systems/player/PlayerRespawnManager.ts` (with `SpawnPointSelector`, `RespawnMapController`) | `setZoneManager(manager)` | `getAllZones` |
|13 | `src/systems/player/PlayerHealthSystem.ts` | `setZoneManager(manager)` (forwards to respawn) | none directly — pure forwarder |
|14 | `src/systems/player/FirstPersonWeapon.ts` (with `WeaponAmmo` → six per-weapon `AmmoManager` instances) | `setZoneManager(manager)` | `getZoneAtPosition` (in `AmmoManager.checkResupplyZone`) |
|15 | `src/systems/weapons/AmmoSupplySystem.ts` | `setZoneManager(manager)` | `getAllZones` |
|16 | `src/systems/combat/CommandInputManager.ts` | `setZoneManager(manager)` | none directly — passed into render-state for `CommandTacticalMap` |
|17 | `src/core/SystemManager.ts`, `src/core/ModeStartupPreparer.ts`, `src/core/StartupPlayerRuntimeComposer.ts`, `src/core/GameplayRuntimeComposer.ts`, `src/core/OperationalRuntimeComposer.ts`, `src/core/bootstrap.ts` | construct + wire | `initializeZones`, `setPlayerAlliance`, plus the lifecycle setters (`setCombatantSystem`, `setCamera`, `setTerrainSystem`, `setSpatialGridManager`, `setSpatialQueryProvider`, `setHUDSystem`) |

The "11" headline number in `docs/ARCHITECTURE.md` collapses several of
these into clusters (e.g. `Combat` is the entire combat subsystem fanning
through `CombatantSystem.setZoneManager`). The expanded list above is the
complete set of files holding a live `ZoneManager` reference outside of
the manager's own implementation directory.

### Method-usage summary

Across every production caller, only six methods are actually called on a
`ZoneManager` reference:

| Method | Callers |
|--------|---------|
| `getAllZones()` | HUD, Compass, Minimap, FullMap, OpenFrontierRespawnMap, CombatantSystem family, RallyPointSystem, SquadManager (via `CombatantSystemUpdate`), AmmoSupplySystem, TicketBleedCalculator, VictoryConditions, WarSimulator, StrategicDirector, AbstractCombatResolver, GameModeManager, PlayerRespawnManager, SpawnPointSelector, SpawnPositionCalculator, AIStateDefend, AIStatePatrol, CombatantMovementStates, CombatantLODManager, CommandTacticalMap render-state |
| `getZoneAtPosition(pos)` | `AmmoManager.checkResupplyZone` (WeaponAmmo / FirstPersonWeapon) |
| `getNearestCapturableZone(pos, faction?)` | none in production today (defined on the manager, exercised only by tests) |
| `getZonesByOwner(faction)` | none in production today (defined on the manager, exercised only by tests) |
| `getTicketBleedRate()` | none externally — `TicketSystem` reimplements this in `TicketBleedCalculator` |
| `setGameModeConfig`, `setPlayerAlliance`, `setCombatantSystem`, `setCamera`, `setTerrainSystem`, `setSpatialGridManager`, `setSpatialQueryProvider`, `setHUDSystem`, `initializeZones`, `updateOccupants`, `update`, `dispose` | `core/*` composers and `SystemManager` only — owner-side lifecycle |

Two observations:

1. **`getAllZones()` is doing the work of three different methods.** Most
   callers immediately filter by `!isHomeBase`, by `owner === faction`,
   or by `state === CONTESTED`. Promoting those filters into named
   accessors reduces both call-site noise and the temptation to mutate
   the returned array.
2. **`getNearestCapturableZone` and `getZonesByOwner` are dead in
   production.** They survive because of test coverage. The interface
   should still expose them (they are obvious read primitives) but the
   migration plan must not assume callers exercise them.

## Per-call classification

Using the three categories the brief defines:

- **state-mutation** — caller mutates `ZoneManager` state. ZoneManager
  keeps; caller can usually be re-expressed as an event publish.
- **state-read** — caller reads zone state. Migrate to `IZoneQuery`.
- **event-driven** — caller subscribes to "zone X captured" or similar.
  Migrate to `GameEventBus` (`zone_captured` / `zone_lost` already
  defined in `src/core/GameEventBus.ts`).

| Caller | Call site | Classification | Target |
|--------|-----------|----------------|--------|
| HUDZoneDisplay / HUDSystem | `getAllZones` for objectives panel | state-read | `IZoneQuery.getAllZones` (or `getCapturableZones`) |
| HUDSystem (capture toast) | listens for "zone captured" via `addZoneCapture` from ZoneManager.update — *currently a direct call into `IHUDSystem`* | event-driven (already mediated, but tightly coupled — convert to `zone_captured` / `zone_lost` subscription on the HUD side, drop the `setHUDSystem` dependency) | `GameEventBus.subscribe('zone_captured' \| 'zone_lost')` |
| CompassZoneMarkers | `getAllZones` per frame | state-read | `IZoneQuery.getAllZones` |
| MinimapRenderer | `getAllZones` per render | state-read | `IZoneQuery.getAllZones` |
| FullMapSystem | `getAllZones` per render | state-read | `IZoneQuery.getAllZones` |
| OpenFrontierRespawnMapRenderer | `getAllZones` per render | state-read | `IZoneQuery.getAllZones` |
| CommandTacticalMap render-state | passes `ZoneManager` reference into renderer | state-read | render-state shape switches to `IZoneQuery` |
| TicketBleedCalculator | `getAllZones` then filter | state-read | `IZoneQuery.getCapturableZones` |
| VictoryConditions | `getAllZones` then filter | state-read | `IZoneQuery.getCapturableZones` |
| WarSimulator (3 call sites) | `getAllZones` for caching, lookup, snapshot | state-read | `IZoneQuery.getAllZones` + `getZoneById` |
| StrategicDirector | `getAllZones` for scoring | state-read | `IZoneQuery.getAllZones` |
| AbstractCombatResolver | `getAllZones().find` | state-read | `IZoneQuery.getZoneById` |
| GameModeManager (zones snapshot for war-sim) | `getAllZones().map(...)` | state-read | `IZoneQuery.getAllZones` |
| GameModeManager (`setGameModeConfig`) | `setGameModeConfig` | state-mutation | stays on `ZoneManager` (owner edge) |
| AIStateDefend / AIStatePatrol / CombatantMovementStates | `getAllZones().filter(...)` | state-read | `IZoneQuery.getAllZones` |
| CombatantLODManager (`simulateDistantAI`) | `getAllZones` per culled tick | state-read | `IZoneQuery.getAllZones` |
| CombatantSystem (`init zones for influence map`) | `getAllZones` | state-read | `IZoneQuery.getAllZones` |
| CombatantSystemUpdate (squad-objective reassign) | `getAllZones` for objective scoring | state-read | `IZoneQuery.getAllZones` |
| RallyPointSystem | `getAllZones` for placement check | state-read | `IZoneQuery.getAllZones` (or new `getZonesNear(pos, radius)` later) |
| SpawnPositionCalculator | `getAllZones` for base lookup | state-read | `IZoneQuery.getAllZones` |
| SpawnPointSelector | `getAllZones` for spawnable filter | state-read | `IZoneQuery.getAllZones` |
| PlayerRespawnManager (`respawnAtHomeBase` / `respawnAtSpecificZone`) | `getAllZones().find` | state-read | `IZoneQuery.getZoneById` (home-base lookup may want a dedicated `getHomeBaseFor(alliance)` helper later) |
| AmmoManager (`checkResupplyZone`) | `getZoneAtPosition` | state-read | `IZoneQuery.getZoneAt` |
| AmmoSupplySystem | `getAllZones` per update | state-read | `IZoneQuery.getAllZones` |
| ModeStartupPreparer (`setPlayerAlliance`) | `setPlayerAlliance` | state-mutation | stays on `ZoneManager` (owner edge) |
| StartupPlayerRuntimeComposer / GameplayRuntimeComposer / OperationalRuntimeComposer | every owner-side setter | state-mutation | stays on `ZoneManager` (owner edge) |
| SystemManager (`initializeZones`) | `initializeZones` | state-mutation | stays on `ZoneManager` (owner edge) |
| SystemUpdater (`update`) | `update` | state-mutation | stays on `ZoneManager` (owner edge) |
| bootstrap.ts (`window.__engine` exposure) | `getAllZones` from diagnostic surface | state-read | `IZoneQuery.getAllZones` |

Net: every consumer outside `core/` is **state-read** or
**event-driven**. The state-mutation surface stays inside the composers,
`SystemManager`, `SystemUpdater`, `ModeStartupPreparer`, and
`GameModeManager.applyModeConfiguration` — the systems that actually own
zone lifecycle.

## Proposed `IZoneQuery` interface

Validated against every state-read site listed above. All methods are
read-only and return immutable views (`readonly` arrays / `Readonly<T>`)
so that consumers cannot accidentally mutate manager state through the
read seam.

```ts
/**
 * Read-only query surface over capture zones. Implemented by
 * `ZoneManager`. Consumers that only need to *read* zone state should
 * depend on this interface instead of importing the concrete manager.
 */
export interface IZoneQuery {
  /** All zones, including home bases. Order is insertion order. */
  getAllZones(): readonly CaptureZone[];

  /** All zones with `isHomeBase === false`. */
  getCapturableZones(): readonly CaptureZone[];

  /** Zone whose horizontal radius contains `position`, or `null`. */
  getZoneAt(position: THREE.Vector3): CaptureZone | null;

  /** Zone with the given id, or `null`. */
  getZoneById(id: string): CaptureZone | null;

  /** All zones owned by `faction`. */
  getZonesByOwner(faction: Faction): readonly CaptureZone[];

  /** Nearest zone to `position` that is not owned by `faction` (or
   *  the nearest non-home-base zone when faction is omitted). */
  getNearestCapturableZone(position: THREE.Vector3, faction?: Faction): CaptureZone | null;
}
```

Notes on shape:

- `getZoneAt` replaces `getZoneAtPosition`. The shorter name reads better
  at call sites and the rename is forced anyway by the read seam.
- `getCapturableZones` formalizes the `!isHomeBase` filter that nine
  call sites perform inline today. Once it lands, those sites simplify.
- `CaptureZone` itself stays where it is (`src/systems/world/ZoneManager.ts`).
  Moving the type would inflate this PR's blast radius and is not required
  to remove the fan-in. A later cycle can split `CaptureZone` into a
  `data/` module if we want to formally untangle the type from the class.
- The interface deliberately omits `getTicketBleedRate()`. That value is
  derived state owned by `TicketBleedCalculator`; surfacing it on the
  read seam would re-couple the two systems.

## Migration batches

Three batches, dispatched in order. Each is a separate task brief in this
cycle. Each batch leaves the build green and behavior unchanged.

### Batch A — Read-only consumers (HUD / Compass / Minimap / FullMap)

Files:

- `src/ui/hud/HUDSystem.ts` (the `setZoneManager` setter and the field type)
- `src/ui/hud/HUDZoneDisplay.ts` (`updateObjectivesDisplay` parameter)
- `src/ui/compass/CompassSystem.ts` + `CompassZoneMarkers.ts`
- `src/ui/minimap/MinimapSystem.ts` + `MinimapRenderer.ts`
- `src/ui/map/FullMapSystem.ts`
- `src/ui/map/OpenFrontierRespawnMap.ts` + `OpenFrontierRespawnMapRenderer.ts`
- `src/ui/hud/CommandTacticalMap.ts` (render-state `zoneManager?` →
  `zoneQuery?`)
- `src/systems/combat/CommandInputManager.ts` (the field that feeds
  `CommandTacticalMap`)

Strategy: change the parameter type on every setter / render-state from
`ZoneManager` to `IZoneQuery`. Composer side stays the same — `ZoneManager`
already implements every method in the interface. No behavior change.

### Batch B — State-driven consumers (Combat / Tickets / WarSim)

Files:

- `src/systems/combat/CombatantSystem.ts` and the delegates it fans
  `setZoneManager` out to (`CombatantAI`, `CombatantMovement`,
  `CombatantSpawnManager`, `CombatantLODManager`, `CombatantSystemUpdate`,
  `ai/AIStateDefend`, `ai/AIStatePatrol`)
- `src/systems/combat/RallyPointSystem.ts`
- `src/systems/combat/SpawnPositionCalculator.ts`
- `src/systems/combat/CombatantMovementStates.ts`
- `src/systems/weapons/AmmoSupplySystem.ts`
- `src/systems/weapons/AmmoManager.ts` (and `WeaponAmmo`,
  `FirstPersonWeapon` setters that fan out to it)
- `src/systems/world/TicketSystem.ts` + `TicketBleedCalculator.ts`
- `src/systems/world/VictoryConditions.ts`
- `src/systems/strategy/WarSimulator.ts`
- `src/systems/strategy/StrategicDirector.ts`
- `src/systems/strategy/AbstractCombatResolver.ts`

Strategy: same parameter swap, plus convert the HUD capture-toast path
(`ZoneManager.update` → `IHUDSystem.addZoneCapture`) into a
`GameEventBus.emit('zone_captured' | 'zone_lost', {...})` from inside
`ZoneManager`, and a subscription on the HUD side. After that, the
`setHUDSystem(IHUDSystem)` dependency on `ZoneManager` can be removed —
ZoneManager becomes a pure publisher of zone events. The `IZoneQuery`
fence interface itself is *not* extended for this.

### Batch C — Owners and ZoneManager-internal cleanup

Files:

- `src/systems/player/PlayerRespawnManager.ts` + `SpawnPointSelector.ts`
  + `RespawnMapController.ts`
- `src/systems/player/PlayerHealthSystem.ts` (pure forwarder)
- `src/systems/world/GameModeManager.ts` — keeps `setGameModeConfig`
  call (state-mutation), but the `getAllZones().map(...)` snapshot it
  builds for `WarSimulator.spawnStrategicForces` migrates to
  `IZoneQuery`.
- `src/core/StartupPlayerRuntimeComposer.ts` /
  `GameplayRuntimeComposer.ts` / `OperationalRuntimeComposer.ts` /
  `SystemManager.ts` / `ModeStartupPreparer.ts` / `bootstrap.ts` —
  pass `IZoneQuery` to consumer setters where possible; keep the live
  `ZoneManager` only on the owner edge.

After Batch C, the only files outside `src/systems/world/` that import
the concrete `ZoneManager` class should be the composers, `SystemManager`,
`ModeStartupPreparer`, `SystemUpdater`, and `bootstrap.ts` — the
lifecycle owners. Target fan-in for the concrete class: 6 files (down
from 11+).

## Parity test plan

Goal: prove that the migration does not change observable game behavior.

Scenario: scripted Open Frontier 60-second match-fragment built on top of
the existing harness in `src/integration/scenarios/zone-capture.test.ts`
and `src/integration/harness/GameScenario.ts`. The harness already wires
`ZoneManager` + `CombatantSystem` + `TicketSystem` + a synthetic player.

Per-batch assertions (run before and after the batch lands; deltas must
be zero unless explicitly noted):

1. **Zone state equality.** Snapshot every zone's `id`, `owner`,
   `state`, and `captureProgress` at t = 0, t = 30, t = 60. The two
   snapshots must compare equal between pre- and post-migration runs
   driven by the same `SeededRandom` seed.
2. **Capture-toast event count.** Hook `IHUDSystem.addZoneCapture`
   (Batch A/C) and `GameEventBus.subscribe('zone_captured' | 'zone_lost')`
   (Batch B) and assert the counts match the pre-migration run.
3. **Ticket bleed rate equality.** Call `TicketSystem.getTicketBleedRate()`
   at the same t = 30 and t = 60 sample points and require equality
   within ±0.001 tickets/sec.
4. **Spawn anchor equality.** Drive a forced respawn at t = 45. The
   resolved spawn position from `SpawnPositionCalculator.getSpawnPosition`
   must match (same seed, same tolerance: 0.01 m XZ).
5. **No new lint/test failures.** `npm run lint`, `npm run test:run`,
   `npm run build`, `npm run check:smoke-scenarios:dev` all green on
   the integration PR. (Smoke scenarios are the gate that caught the
   2026-05-08 backface Z-flip; we want them in the loop.)

Recommended test placement: a new
`src/integration/scenarios/zone-query-parity.test.ts`. It exercises the
real `ZoneManager` through the `IZoneQuery` seam (no mocks) and is
deleted at the end of Batch C — its only purpose is to ride along with
the migration.

## What this memo deliberately does NOT do

- It does not modify `src/types/SystemInterfaces.ts`. The fence change is
  the next task (`izone-query-fence`), which is the only PR in this
  cycle authorized to touch the fenced file. See `docs/INTERFACE_FENCE.md`.
- It does not change `ZoneManager`'s implementation. ZoneManager is the
  only `IZoneQuery` implementation today and stays where it is.
- It does not move `CaptureZone` / `ZoneState` out of
  `src/systems/world/ZoneManager.ts`. Worth doing eventually; not in
  scope for this cycle.
- It does not touch any consumer file. Each batch is its own task brief
  with its own PR.
