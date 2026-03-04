# Vehicle Domain

**Context for Agents:** Two blocks, both DEFERRED - neither instantiates until the active GameModeConfig includes helipad definitions. Zero vehicle cost in modes that omit helipads (TEAM_DEATHMATCH, AI_SANDBOX by default). HelicopterPhysics accepts a per-aircraft AircraftPhysicsConfig so adding a new aircraft type is config-only (no physics code changes). Timing constraint: PlayerMovement.setHelicopterControls() must run before HelicopterModel.updateHelicopterPhysics() each frame - this is satisfied by Player tick group executing before the untracked update group. Do not reorder these groups.

---

## Blocks

| Block | Modules | Budget | Fan-in | Notes |
|---|---|---|---|---|
| HelicopterModel | HelicopterPhysics, HelicopterAnimation, HelicopterAudio, HelicopterInteraction | untracked | 5 | DEFERRED - created only when GameModeConfig has helipads |
| HelipadSystem | (inline) | untracked | 3 | DEFERRED - places helipad meshes from config; creates HelicopterModel instances |

---

## Module Registry

| Module | File | Role |
|---|---|---|
| HelicopterPhysics | [helicopter/HelicopterPhysics.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterPhysics.ts) | 6DOF flight sim, collective/cyclic/yaw, gravity fallback when unoccupied |
| HelicopterAnimation | [helicopter/HelicopterAnimation.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterAnimation.ts) | Rotor spin, tilt blend, per-frame mesh transforms |
| HelicopterAudio | [helicopter/HelicopterAudio.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterAudio.ts) | Engine RPM audio, rotor pitch variation |
| HelicopterInteraction | [helicopter/HelicopterInteraction.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterInteraction.ts) | Proximity check, enter/exit, findNearestHelicopter() |
| HelicopterModel | [helicopter/HelicopterModel.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterModel.ts) | Top-level block class; owns physics + animation + audio instances |
| AircraftConfigs | [helicopter/AircraftConfigs.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/AircraftConfigs.ts) | Per-aircraft AircraftPhysicsConfig definitions |
| HelicopterGeometry | [helicopter/HelicopterGeometry.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelicopterGeometry.ts) | createHelicopterGeometry() - procedural helicopter mesh construction |
| HelipadSystem | [helicopter/HelipadSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter/HelipadSystem.ts) | Reads GameModeConfig.helipads, places meshes, spawns HelicopterModel per helipad |

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
| TerrainSystem | Terrain domain | setter (`setTerrainManager`) for helipad placement and helicopter grounding |
| scene (THREE.Scene) | GameRenderer | constructor |
| PlayerState / controls | PlayerSystem | setter (HelicopterInteraction) |
| camera | GameRenderer | setter (HelicopterModel - cockpit view) |

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

### Future Work
- Weapon mounts (config field `weapons` present in AircraftPhysicsConfig stub)
- Troop transport (`seats` field in config, not yet wired)
- Per-aircraft weapon loadouts

---

## Related

- [docs/blocks/world.md](../blocks/world.md) - GameModeManager (config source)
- [docs/blocks/ui.md](../blocks/ui.md) - HelicopterHUD instruments
- [docs/ARCHITECTURE_RECOVERY_PLAN.md](../ARCHITECTURE_RECOVERY_PLAN.md) - perf decisions
- [src/systems/helicopter/](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/helicopter) - full vehicle directory
- [src/config/gameModeTypes.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/gameModeTypes.ts) - GameModeConfig type (includes helipads field)
