# Vehicle Domain

**Context for Agents:** Two blocks, both DEFERRED - neither instantiates until the active GameModeConfig includes helipad definitions. Zero vehicle cost in modes that omit helipads (TEAM_DEATHMATCH, AI_SANDBOX by default). HelicopterPhysics accepts a per-aircraft AircraftPhysicsConfig so adding a new aircraft type is config-only (no physics code changes). Timing constraint: PlayerMovement.setHelicopterControls() must run before HelicopterModel.updateHelicopterPhysics() each frame - this is satisfied by Player tick group executing before the untracked update group. Do not reorder these groups.

---

## Blocks

| Block | Modules | Budget | Fan-in | Notes |
|---|---|---|---|---|
| HelicopterModel | HelicopterPhysics, HelicopterAnimation, HelicopterAudio, HelicopterInteraction, HelicopterWeaponSystem, HelicopterHealthSystem, HelicopterDoorGunner | untracked | 5 | DEFERRED - created only when GameModeConfig has helipads |
| HelipadSystem | (inline) | untracked | 3 | DEFERRED - places helipad meshes from config with dynamic foundation depth; now wired through grouped runtime dependencies |
| SquadDeployFromHelicopter | (inline) | untracked | 2 | G key tactical insertion from low/slow helicopter |
| VehicleManager | (inline) | untracked | 2 | Vehicle registry and lifecycle |
| NPCVehicleController | NPCPilotAI | AirSupport group (1ms) | 2 | NPC pilot FSM, wired in SystemUpdater AirSupport group |
| FixedWingPhysics | (inline) | not yet wired | 0 | Speed-based lift/drag/stall/bank-and-pull, ground roll; live staging content now uses parked fixed-wing assets only |

---

## Module Registry

| Module | File | Role |
|---|---|---|
| HelicopterPhysics | [helicopter/HelicopterPhysics.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterPhysics.ts) | 6DOF flight sim, collective/cyclic/yaw, gravity fallback when unoccupied |
| HelicopterAnimation | [helicopter/HelicopterAnimation.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterAnimation.ts) | Rotor spin, tilt blend, per-frame mesh transforms |
| HelicopterAudio | [helicopter/HelicopterAudio.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterAudio.ts) | Engine RPM audio, rotor pitch variation |
| HelicopterInteraction | [helicopter/HelicopterInteraction.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterInteraction.ts) | Proximity check, enter/exit, findNearestHelicopter() |
| HelicopterModel | [helicopter/HelicopterModel.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterModel.ts) | Top-level block class; owns physics + animation + audio instances; accepts grouped runtime dependencies |
| AircraftConfigs | [helicopter/AircraftConfigs.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/AircraftConfigs.ts) | Per-aircraft AircraftPhysicsConfig + AircraftWeaponMount definitions |
| HelicopterWeaponSystem | [helicopter/HelicopterWeaponSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterWeaponSystem.ts) | Pilot-operated weapons: hitscan minigun (50rps, 15dmg) + projectile rockets (150m/s, 150dmg, 8m radius). Rearm on helipad. |
| HelicopterHealthSystem | [helicopter/HelicopterHealthSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterHealthSystem.ts) | Role-based HP (transport:500, gunship:600, attack:400). Repair on helipad at 50HP/s. Destruction forces pilot exit. |
| HelicopterDoorGunner | [helicopter/HelicopterDoorGunner.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterDoorGunner.ts) | NPC AI for crew weapons (M60 on UH-1C). 200m target acquisition, hitscan with spread. |
| SquadDeployFromHelicopter | [helicopter/SquadDeployFromHelicopter.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/SquadDeployFromHelicopter.ts) | G key deploy: altitude(<15m)/speed(<5m/s)/30s cooldown, 4 terrain-snapped positions |
| HelicopterGeometry | [helicopter/HelicopterGeometry.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterGeometry.ts) | createHelicopterGeometry() - procedural helicopter mesh construction |
| HelipadSystem | [helicopter/HelipadSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelipadSystem.ts) | Reads GameModeConfig.helipads, accepts grouped runtime dependencies, places meshes, spawns HelicopterModel per helipad |
| VehicleManager | [vehicle/VehicleManager.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/vehicle/VehicleManager.ts) | Vehicle registry, spawn/track/despawn lifecycle |
| FixedWingPhysics | [vehicle/FixedWingPhysics.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/vehicle/FixedWingPhysics.ts) | Speed-based lift (L=0.5*rho*v^2*S*Cl), drag, stall, bank-and-pull turns, ground roll; not yet bound to active vehicles |
| FixedWingConfigs | [vehicle/FixedWingConfigs.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/vehicle/FixedWingConfigs.ts) | AC47_SPOOKY (stall:35, max:80), F4_PHANTOM (stall:60, max:200), A1_SKYRAIDER (stall:40, max:120) |
| NPCPilotAI | [vehicle/NPCPilotAI.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/vehicle/NPCPilotAI.ts) | 7-state FSM (idle/takeoff/fly_to/orbit/attack_run/rtb/landing). PD controllers for altitude/heading/speed. |
| NPCVehicleController | [vehicle/NPCVehicleController.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/vehicle/NPCVehicleController.ts) | Registry of NPC pilots, ticked in SystemUpdater AirSupport group |
| HelicopterVehicleAdapter | [vehicle/HelicopterVehicleAdapter.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/vehicle/HelicopterVehicleAdapter.ts) | IVehicle adapter bridging HelicopterModel to the vehicle interface |
| IVehicle | [vehicle/IVehicle.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/vehicle/IVehicle.ts) | Shared vehicle interface (enter/exit, damage, physics, render) |

---

## Aircraft Config Table

| Constant | Type | Mass | Handling | Use |
|---|---|---|---|---|
| UH1_HUEY | transport | 2200 kg | stable | troop insert, general transport |
| UH1C_GUNSHIP | gunship | 2400 kg | sluggish | fire support |
| AH1_COBRA | attack | 1400 kg | agile | fast attack |

Config fields in `AircraftPhysicsConfig`: mass, maxLiftForce, maxCyclicForce, maxYawRate, engineSpoolRate, maxHorizontalSpeed, velocityDamping, angularDamping, autoLevelStrength, groundEffectHeight, groundEffectStrength, inputSmoothRate. HelicopterPhysics constructor accepts config directly - no hardcoded constants in physics code.

---

## Wiring

### Deps In (what vehicle blocks need)

| Dep | Source | Injected Via |
|---|---|---|
| GameModeConfig.helipads | GameModeManager | constructor (HelipadSystem) |
| TerrainSystem | Terrain domain | grouped dependency config / targeted setter for helipad placement and helicopter grounding |
| scene (THREE.Scene) | GameRenderer | constructor |
| PlayerState / controls | PlayerSystem | setter (HelicopterInteraction) |
| camera | GameRenderer | setter (HelicopterModel - cockpit view) |

Operational runtime wiring now prefers `configureDependencies(...)` on both `HelipadSystem` and `HelicopterModel`; legacy targeted setters remain as compatibility surfaces inside those blocks.

### Deps Out (what vehicle blocks provide)

| Dep | Consumer | Mechanism |
|---|---|---|
| isOccupied, position | HUDSystem (RPM, altitude instruments) | getter (HelicopterModel) |
| engineRPM | HUDSystem.showHelicopterInstruments() | getter on physics state |
| onEnterHelicopter | PlayerSystem (disable foot movement) | callback (HelicopterInteraction) |
| onExitHelicopter | PlayerSystem (re-enable foot movement) | callback (HelicopterInteraction) |
| helipad mesh list | scene graph | direct scene.add (HelipadSystem) |

---

## Key Design Notes

### Deferred Initialization
Helipad creation is config-driven only. `HelipadSystem` is a no-op if `GameModeConfig.helipads` is empty or absent, and it no longer synthesizes a fallback helipad. HelicopterModel instances are created lazily only when `HelipadSystem` sees a populated config. Modes without helipads pay zero allocation cost and config mistakes are no longer masked at runtime.

### Dynamic Foundation Depth
Helipad placement uses `TerrainFoundationUtils.sampleTerrainHeightRange()` (~115 samples across 3 concentric rings + axis cross-sections) to measure the terrain height range within the platform footprint. `computeFoundationDepth()` then sizes the foundation mesh to cover the full gap between the platform surface and the lowest terrain point plus a 1.0m margin. On flat terrain: ~1.0m depth. On a hillside: foundation extends to fill any gap. The dirt surround and pad meshes are scaled downward from their top face so the landing surface stays fixed. This is engine-agnostic - the utilities accept a plain `(x, z) => height` callback and are shared with WorldFeatureSystem for firebases, airstrips, and future flat-platform features.

### Unoccupied Helicopter Gravity
When a pilot exits mid-air, HelicopterPhysics zeroes all control inputs but continues integrating physics (gravity applies). The helicopter descends until it collides with terrain. There is no auto-land or despawn.

### World Boundary Enforcement
HelicopterPhysics enforces world boundary independently from PlayerMovement. `HelicopterModel.updateHelicopterPhysics()` sets `worldHalfExtent` on the physics instance each frame from `terrainManager.getPlayableWorldSize()`. `HelicopterPhysics.enforceWorldBoundary()` runs after ground collision and bounces velocity inward at 50% strength when position exceeds limits. This mirrors the player boundary bounce-back but runs in the helicopter physics pipeline, not the player movement pipeline.

### Frame Ordering Constraint
```
Frame N:
  1. Player tick group:
       PlayerMovement.update() -> setHelicopterControls(collective, cyclic, yaw)
  2. Untracked group:
       HelicopterModel.update() -> HelicopterPhysics.integrate(controls)
```
PlayerMovement must run first. If update group ordering changes, verify this constraint is preserved.

### findNearestHelicopter()
HelicopterInteraction.findNearestHelicopter() iterates HelipadSystem.helicopters array. Works regardless of game mode or helipad count. Interaction prompt appears within 5m of any helicopter.

### HUD RPM Source
HUDSystem reads `helicopterModel.physics.engineRPM` (real physics state). The old approach faked RPM as `collective * 0.8 + 0.2` - this was removed. Do not reintroduce fake RPM.

### Controls Summary
| Input | Action | Platform |
|---|---|---|
| W/S | collective up/down | KB |
| A/D | yaw left/right | KB |
| Arrow keys | cyclic | KB |
| Shift | boost | KB |
| Space | auto-hover toggle | KB |
| E | enter/exit | KB |
| RCtrl | mouse mode toggle | KB |
| Cyclic pad | cyclic only | Touch |
| E button | enter/exit only | Gamepad |

Touch has no collective or yaw controls. Gamepad has no flight axis mappings - enter/exit only.

### Helicopter Weapons (Live)
- **HelicopterWeaponSystem**: pilot-operated. Hitscan minigun (50rps, 15dmg, TracerPool(32) + MuzzleFlashSystem(16)). Projectile rockets via GrenadeSystem.spawnProjectile (150m/s, 150dmg, 8m radius). Rearm on helipad (minigun 100/s, rockets 1/s). Weapon switch 1/2 keys.
- **HelicopterDoorGunner**: NPC AI for crew weapons (M60 on UH-1C). querySpatialRadius target acquisition (200m, 0.5s scan). Hitscan firing with spread. Dedicated TracerPool(16) + MuzzleFlashSystem(8).
- **AircraftWeaponMount** configs: UH1_HUEY (none), UH1C_GUNSHIP (M60 door gun), AH1_COBRA (M134 minigun + rocket pod).

### Fixed-Wing Aircraft (Code exists, not yet wired to vehicles)
- **FixedWingPhysics**: speed-based lift, drag, stall, bank-and-pull turns, ground roll. States: grounded/airborne/stalled.
- **FixedWingConfigs**: AC47_SPOOKY, F4_PHANTOM, A1_SKYRAIDER with distinct stall/max speeds.
- **NPCPilotAI**: 7-state FSM (idle/takeoff/fly_to/orbit/attack_run/rtb/landing). PD controllers.
- **NPCVehicleController**: ticked in SystemUpdater AirSupport group. Wired via OperationalRuntimeComposer.
- **Current content use**: Open Frontier and A Shau Valley now place parked UH-1/A-1/F-4 aircraft at generator-backed airfields and stage M151/M35/M113/M48 vehicles in separate heavy motor pools. Those are static world features with collision, not playable vehicles.

### Future Work
- Wire FixedWingPhysics into VehicleManager for player-pilotable fixed-wing
- NPC helicopter transport missions (takeoff, fly to LZ, deploy squad, RTB)
- Ground vehicles (runtime interaction for M151 / M113 / M48 still missing; current mode content is static staging only)

---

## Related

- [docs/blocks/world.md](../blocks/world.md) - GameModeManager (config source)
- [docs/blocks/ui.md](../blocks/ui.md) - HelicopterHUD instruments
- [docs/ARCHITECTURE_RECOVERY_PLAN.md](../ARCHITECTURE_RECOVERY_PLAN.md) - perf decisions
- [src/systems/helicopter/](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter) - full vehicle directory
- [src/config/gameModeTypes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModeTypes.ts) - GameModeConfig type (includes helipads field)
