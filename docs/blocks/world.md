# World Domain

**Context for Agents:** Covers the systems that define match state - zone ownership, ticket bleed, game mode configuration, and the billboard vegetation renderer. ZoneManager has the highest fan-in in the codebase (11 inbound deps) and is the central authority for capture state. TicketSystem is the match termination authority. GameModeManager is a manager-of-managers anti-pattern - it reconfigures 7+ systems on mode change and is a known architecture smell (not scheduled for refactor). GlobalBillboardSystem is independent of match state; it runs on its own 2ms budget.

---

## Blocks

| Block | Modules | Budget | Fan-in | Notes |
|---|---|---|---|---|
| ZoneManager | ZoneCaptureLogic, ZoneInitializer, ZoneRenderer, ZoneTerrainAdapter | untracked | 11 | HIGHEST fan-in; central capture authority |
| TicketSystem | TicketBleedCalculator, TicketSystemPhases, VictoryConditions | untracked | 9 | match termination authority |
| GameModeManager | (inline) | untracked | 2 | manager-of-managers, reconfigures 7+ systems on mode change |
| GlobalBillboardSystem | GPUBillboardSystem, GPUBillboardVegetation, BillboardShaders | 2ms | 0 | fully independent, no match state coupling |

---

## Module Registry

| Module | File | Role |
|---|---|---|
| ZoneCaptureLogic | [strategy/zones/ZoneCaptureLogic.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/zones/ZoneCaptureLogic.ts) | Counts BLUFOR/OPFOR in radius, advances capture progress, flips ownership |
| ZoneInitializer | [strategy/zones/ZoneInitializer.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/zones/ZoneInitializer.ts) | Reads GameModeConfig.zones, creates zone state objects |
| ZoneRenderer | [strategy/zones/ZoneRenderer.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/zones/ZoneRenderer.ts) | Zone ring meshes, colored by ownership faction |
| ZoneTerrainAdapter | [strategy/zones/ZoneTerrainAdapter.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/zones/ZoneTerrainAdapter.ts) | Grounds zone center Y to terrain height |
| TicketBleedCalculator | [strategy/tickets/TicketBleedCalculator.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/tickets/TicketBleedCalculator.ts) | Computes bleed rate from zone ownership counts |
| TicketSystemPhases | [strategy/tickets/TicketSystemPhases.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/tickets/TicketSystemPhases.ts) | Tick-based drain, kill ticket deductions |
| VictoryConditions | [strategy/tickets/VictoryConditions.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/tickets/VictoryConditions.ts) | Detects 0-ticket or timer-expiry, fires gameEndCallback |
| GameModeManager | [strategy/GameModeManager.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/GameModeManager.ts) | Reads GameModeConfig, calls setters on 7+ systems to reconfigure on mode change |
| GPUBillboardSystem | [terrain/billboard/GPUBillboardSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/billboard/GPUBillboardSystem.ts) | Instanced mesh renderer for vegetation billboards |
| GPUBillboardVegetation | [terrain/billboard/GPUBillboardVegetation.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/billboard/GPUBillboardVegetation.ts) | Vegetation placement, BillboardBufferManager |
| BillboardShaders | [terrain/billboard/BillboardShaders.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/billboard/BillboardShaders.ts) | Custom GLSL for alpha-tested billboard materials |

---

## Game Modes

| Mode | Zones | Tickets | War Sim | Notes |
|---|---|---|---|---|
| ZONE_CONTROL | yes | yes | optional | standard conquest |
| OPEN_FRONTIER | no | no | optional | respawn map |
| TEAM_DEATHMATCH | no | kill-based | no | |
| AI_SANDBOX | no | no | no | dev/test mode |
| A_SHAU_VALLEY | yes | yes | yes | 3000 agents, 21km DEM, 18 zones, 60-min matches |

Config resolution: `getGameModeConfig(mode)` in [config/gameModes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModes.ts) returns a `GameModeConfig` typed by [config/gameModeTypes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModeTypes.ts).

---

## Wiring

### Deps In (what world blocks need)

| Dep | Source | Injected Via |
|---|---|---|
| spatialQueryProvider | SpatialGridManager (ISpatialQuery) | setter (ZoneCaptureLogic) |
| GameModeConfig | GameModeManager / getGameModeConfig() | constructor (ZoneInitializer) |
| HeightQueryCache | Terrain domain | direct query service (ZoneTerrainAdapter) |
| scene (THREE.Scene) | GameRenderer | constructor (ZoneRenderer, GPUBillboardSystem) |
| TicketSystem ref | ZoneManager | setter (TicketBleedCalculator reads zone state) |
| gameEndCallback | GameEngine bootstrap | setter (VictoryConditions) |

### Deps Out (what world blocks provide)

| Dep | Consumer | Mechanism |
|---|---|---|
| zone ownership state | TicketSystem (bleed) | direct ref via setter |
| zone ownership state | HUDSystem (zone display) | getter (ZoneManager) |
| zone ownership state | MinimapSystem | getter (ZoneManager) |
| zone ownership state | AI strategy layer | getter (ZoneManager) |
| ticket counts | HUDSystem (ticket display) | getter (TicketSystem) |
| ticket counts | MinimapSystem | getter (TicketSystem) |
| gameEndCallback fire | HUDSystem.handleGameEnd() | callback |
| gameEndCallback fire | MatchEndScreen show | callback |
| GameModeConfig | HelicopterSystem | setter (GameModeManager) |
| GameModeConfig | SpawnSystem | setter (GameModeManager) |
| GameModeConfig | ZoneManager | setter (GameModeManager) |
| GameModeConfig | WarSimulator | setter (GameModeManager) |

---

## Zone Capture Flow

```
ZoneCaptureLogic.update(dt):
  1. For each zone:
       query = spatialQueryProvider.querySpatialRadius(zone.center, zone.radius)
       count BLUFOR vs OPFOR in result
  2. dominant side advances captureProgress toward 1.0
  3. captureProgress reaches 1.0 -> ownership flips
  4. onOwnershipChange fires -> ZoneRenderer recolors ring

TicketBleedCalculator.tick(dt):
  1. reads ZoneManager.getZones() -> counts zones per faction
  2. side with fewer zones bleeds tickets (configurable rate per zone deficit)

VictoryConditions.check():
  1. BLUFOR tickets <= 0 -> OPFOR wins
  2. OPFOR tickets <= 0 -> BLUFOR wins
  3. timer >= matchDuration -> lower tickets loses
  4. fires gameEndCallback(winner)

gameEndCallback:
  -> HUDSystem.handleGameEnd(winner)
  -> MatchEndScreen.show(result)
```

---

## GameModeManager Anti-Pattern Note

GameModeManager calls setters on 7+ systems when mode changes. This creates a brittle dependency graph where adding a new system requires editing GameModeManager. This is a known smell listed in architecture notes. Do not add more systems to this pattern without discussion. Refactor path: event-based mode change notification (not yet scheduled).

---

## Related

- [docs/blocks/weapons.md](../blocks/weapons.md) - weapon systems (consume spatial query)
- [docs/blocks/ui.md](../blocks/ui.md) - HUDZoneDisplay, TicketDisplay consumers
- [docs/blocks/vehicle.md](../blocks/vehicle.md) - HelipadSystem reads GameModeConfig
- [docs/ARCHITECTURE_RECOVERY_PLAN.md](../ARCHITECTURE_RECOVERY_PLAN.md) - spatial unification, heap triage
- [src/systems/strategy/](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy) - full strategy directory
- [src/systems/terrain/billboard/](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/terrain/billboard) - billboard directory
- [src/config/gameModes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModes.ts) - mode config factory
- [src/config/gameModeTypes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModeTypes.ts) - GameModeConfig type definition
