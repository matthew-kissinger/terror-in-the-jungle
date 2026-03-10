# World Domain

**Context for Agents:** Covers the systems that define match state - zone ownership, ticket bleed, game mode configuration, and the billboard vegetation renderer. ZoneManager has the highest fan-in in the codebase (11 inbound deps) and is the central authority for capture state. TicketSystem is the match termination authority. GameModeManager still fans mode config into multiple systems, but the runtime seam is now real: definitions, runtime hooks, deploy-session policy projection, shared spawn resolution, and grouped dependency wiring are all live. GlobalBillboardSystem is independent of match state; it runs on its own 2ms budget.

---

## Blocks

| Block | Modules | Budget | Fan-in | Notes |
|---|---|---|---|---|
| ZoneManager | ZoneCaptureLogic, ZoneInitializer, ZoneRenderer, ZoneTerrainAdapter | untracked | 11 | HIGHEST fan-in; central capture authority |
| TicketSystem | TicketBleedCalculator, TicketSystemPhases, VictoryConditions | untracked | 9 | match termination authority |
| GameModeManager | (inline) | untracked | 2 | runtime seam is live and grouped dependency wiring is in place; remaining debt is broad config fan-out on mode change |
| GlobalBillboardSystem | GPUBillboardSystem, GPUBillboardVegetation, BillboardShaders | 2ms | 0 | fully independent, no match state coupling |

---

## Module Registry

| Module | File | Role |
|---|---|---|
| GameModeDefinition | `config/gameModeDefinitions.ts` | Resolves static mode config plus runtime policy bundle for deploy, respawn, map intel, command profile, and team rules |
| GameModeRuntime | `systems/world/runtime/GameModeRuntime.ts` | Runtime lifecycle hooks (`onEnter`, `onExit`, `onReapply`) plus scheduled `update()` hooks backed by mode policies |
| DeployFlowSession | `systems/world/runtime/DeployFlowSession.ts` | Shared deploy-session model that projects mode policy into front-menu and respawn UI copy/behavior |
| ModeSpawnResolver | `systems/world/runtime/ModeSpawnResolver.ts` | Shared policy-driven initial spawn and pressure-front respawn position resolver used by startup and respawn flow |
| ZoneCaptureLogic | [systems/world/ZoneCaptureLogic.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/ZoneCaptureLogic.ts) | Counts BLUFOR/OPFOR in radius, advances capture progress, flips ownership |
| ZoneInitializer | [systems/world/ZoneInitializer.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/ZoneInitializer.ts) | Reads GameModeConfig.zones, creates zone state objects |
| ZoneRenderer | [systems/world/ZoneRenderer.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/ZoneRenderer.ts) | Zone ring meshes, colored by ownership faction |
| ZoneTerrainAdapter | [systems/world/ZoneTerrainAdapter.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/ZoneTerrainAdapter.ts) | Grounds zone center Y to terrain height |
| TicketBleedCalculator | [systems/world/TicketBleedCalculator.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/TicketBleedCalculator.ts) | Computes bleed rate from zone ownership counts |
| TicketSystemPhases | [systems/world/TicketSystemPhases.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/TicketSystemPhases.ts) | Tick-based drain, kill ticket deductions |
| VictoryConditions | [systems/world/VictoryConditions.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/VictoryConditions.ts) | Detects 0-ticket or timer-expiry, fires gameEndCallback |
| GameModeManager | [systems/world/GameModeManager.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/GameModeManager.ts) | Resolves active `GameModeDefinition`, creates a policy-backed runtime, accepts grouped runtime dependencies, pushes map-intel policy into minimap/full-map systems, and still fans legacy config into multiple systems |
| AnimalSystem | [systems/world/AnimalSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/AnimalSystem.ts) | Ambient wildlife spawning, cell-based (128m cells), purely cosmetic |
| WorldFeatureSystem | [systems/world/WorldFeatureSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/WorldFeatureSystem.ts) | Structure placement with terrain flatten, vegetation clear, prefab compounds, and generator-backed airfields |
| GPUBillboardSystem | [world/billboard/GPUBillboardSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/billboard/GPUBillboardSystem.ts) | Instanced mesh renderer for vegetation billboards |
| GPUBillboardVegetation | [world/billboard/BillboardBufferManager.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/billboard/BillboardBufferManager.ts) | Vegetation placement class (defined in BillboardBufferManager.ts) |
| BillboardShaders | [world/billboard/BillboardShaders.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/billboard/BillboardShaders.ts) | Custom GLSL for alpha-tested billboard materials |

---

## Game Modes

| Mode | Zones | Tickets | War Sim | Notes |
|---|---|---|---|---|
| ZONE_CONTROL | yes | yes | optional | widened conquest layout; US firebase and OPFOR bunker home bases now use larger graded staging areas instead of compact cliff-prone pads |
| OPEN_FRONTIER | yes | yes | no | 3200m world, 10 contested + 6 HQ zones, 3 helipads, rear-area US airfield, separate heavy motor pool, 120 combatants, alliance factions (BLUFOR/OPFOR), zone-spawn respawn |
| TEAM_DEATHMATCH | no | kill-based | no | |
| AI_SANDBOX | no | no | no | dev/test mode |
| A_SHAU_VALLEY | yes | yes | yes | 3000 agents, 21km DEM, 18 zones, 60-min matches, upgraded Ta Bat airfield, separate armored yard |

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
| map intel policy | MinimapSystem, FullMapSystem | runtime service push (`GameModeManager.applyMapIntelPolicy`) |
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

## Current Execution Status

- runtime foundation is live (GameModeRuntime, GameModeDefinition, policy bundles, scheduled mode runtime updates)
- shared deploy and spawn policy is live (DeployFlowSession, ModeSpawnResolver)
- side/faction launch selection is live (alliance-based BLUFOR/OPFOR with factionMix)
- command profile is live (CommandModeOverlay, CommandTacticalMap, CommandInputManager)
- map-intel policy is live (GameModeManager.applyMapIntelPolicy pushes fog/reveal to minimap and full map)
- Open Frontier and A Shau world features now include generator-backed airfields plus separate heavy motor-pool staging. Fixed-wing aircraft and ground vehicles in those yards are static content only; helicopters remain the only active vehicle gameplay path.

## GameModeManager Anti-Pattern Note

GameModeManager still pushes mode config into multiple systems when mode changes. That is now a bounded coordination problem rather than a fake runtime layer: mode selection resolves through `GameModeDefinition`, a policy-backed `GameModeRuntime`, grouped dependency wiring, `DeployFlowSession`, and `ModeSpawnResolver`. The remaining debt is the breadth of config fan-out, not missing runtime structure. Avoid adding new system-specific mode branches unless the policy truly belongs in GameModeManager.

---

## Related

- [docs/blocks/weapons.md](../blocks/weapons.md) - weapon systems (consume spatial query)
- [docs/blocks/ui.md](../blocks/ui.md) - HUDZoneDisplay, TicketDisplay consumers
- [docs/blocks/vehicle.md](../blocks/vehicle.md) - HelipadSystem reads GameModeConfig
- [docs/ARCHITECTURE_RECOVERY_PLAN.md](../ARCHITECTURE_RECOVERY_PLAN.md) - spatial unification, heap triage
- [src/systems/world/](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world) - full world directory
- [src/systems/world/billboard/](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/world/billboard) - billboard directory
- [src/config/gameModes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModes.ts) - mode config factory
- [src/config/gameModeTypes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModeTypes.ts) - GameModeConfig type definition
