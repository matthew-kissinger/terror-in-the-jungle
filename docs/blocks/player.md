# Player Domain

> Self-contained reference. 8 GameSystem blocks, 21 internal modules, 1ms tick budget.
> PlayerController has the highest setter fan-out in the codebase (15 deps).

[GH]: https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src

---

## Blocks

| Block | File | Tick | Budget | Deps | Fan-In |
|-------|------|------|--------|------|--------|
| [PlayerController]([GH]/systems/player/PlayerController.ts) | systems/player/PlayerController.ts | Player | 1ms | 15 | 7 |
| [FirstPersonWeapon]([GH]/systems/player/FirstPersonWeapon.ts) | systems/player/FirstPersonWeapon.ts | Player | 1ms | 8 | 4 |
| [PlayerHealthSystem]([GH]/systems/player/PlayerHealthSystem.ts) | systems/player/PlayerHealthSystem.ts | untracked | - | 7 | 2 |
| [PlayerRespawnManager]([GH]/systems/player/PlayerRespawnManager.ts) | systems/player/PlayerRespawnManager.ts | untracked | - | 11 | 1 |
| [InventoryManager]([GH]/systems/player/InventoryManager.ts) | systems/player/InventoryManager.ts | untracked | - | 0 | 7 |
| [PlayerSuppressionSystem]([GH]/systems/player/PlayerSuppressionSystem.ts) | systems/player/PlayerSuppressionSystem.ts | untracked | - | 2 | 1 |
| [FlashbangScreenEffect]([GH]/systems/player/FlashbangScreenEffect.ts) | systems/player/FlashbangScreenEffect.ts | untracked | - | 1 | 1 |
| [DeathCamSystem]([GH]/systems/player/DeathCamSystem.ts) | systems/player/DeathCamSystem.ts | untracked | - | 0 | 0 |

---

## Module Registry

### PlayerController Internals

| Module | File | Role |
|--------|------|------|
| [PlayerCamera]([GH]/systems/player/PlayerCamera.ts) | systems/player/PlayerCamera.ts | First-person camera math, pitch/yaw |
| [PlayerInput]([GH]/systems/player/PlayerInput.ts) | systems/player/PlayerInput.ts | Keyboard/mouse/touch input, sensitivity |
| [PlayerMovement]([GH]/systems/player/PlayerMovement.ts) | systems/player/PlayerMovement.ts | Velocity, grounding, gravity, helicopter controls, world boundary bounce-back |
| [PlayerStatsTracker]([GH]/systems/player/PlayerStatsTracker.ts) | systems/player/PlayerStatsTracker.ts | K/D/assist stats |
| [PlayerHealthEffects]([GH]/systems/player/PlayerHealthEffects.ts) | systems/player/PlayerHealthEffects.ts | Visual health feedback (vignette, red flash) |
| [PlayerHealthUI]([GH]/systems/player/PlayerHealthUI.ts) | systems/player/PlayerHealthUI.ts | Health bar DOM rendering |
| [DeathCamOverlay]([GH]/systems/player/DeathCamOverlay.ts) | systems/player/DeathCamOverlay.ts | Death camera overlay |
| [RespawnUI]([GH]/systems/player/RespawnUI.ts) | systems/player/RespawnUI.ts | Respawn interface |
| [RespawnMapController]([GH]/systems/player/RespawnMapController.ts) | systems/player/RespawnMapController.ts | Respawn map interaction |
| [LoadoutService]([GH]/systems/player/LoadoutService.ts) | systems/player/LoadoutService.ts | Weapon loadout selection and persistence |
| [DeployFlowController]([GH]/systems/player/DeployFlowController.ts) | systems/player/DeployFlowController.ts | Owns deploy-session state, selected spawn point, and initial-deploy resolution |
| [InitialDeployCancelledError]([GH]/systems/player/InitialDeployCancelledError.ts) | systems/player/InitialDeployCancelledError.ts | Shared startup/deploy cancellation contract |
| [RespawnSpawnPoint]([GH]/systems/player/RespawnSpawnPoint.ts) | systems/player/RespawnSpawnPoint.ts | Spawn point type definitions |
| ~~ProgrammaticGunFactory~~ | *(deleted 2026-03-08)* | Dead code - all weapons load GLBs via WeaponRigManager |

### FirstPersonWeapon Internals

| Module | File | Role |
|--------|------|------|
| [WeaponFiring]([GH]/systems/player/weapon/WeaponFiring.ts) | player/weapon/WeaponFiring.ts | Fire action, rate limiting |
| [WeaponAmmo]([GH]/systems/player/weapon/WeaponAmmo.ts) | player/weapon/WeaponAmmo.ts | Magazine/reserve tracking |
| [WeaponReload]([GH]/systems/player/weapon/WeaponReload.ts) | player/weapon/WeaponReload.ts | Reload state machine |
| [WeaponAnimations]([GH]/systems/player/weapon/WeaponAnimations.ts) | player/weapon/WeaponAnimations.ts | Sway, recoil, ADS animation |
| [WeaponInput]([GH]/systems/player/weapon/WeaponInput.ts) | player/weapon/WeaponInput.ts | Fire/reload/ADS input binding |
| [WeaponModel]([GH]/systems/player/weapon/WeaponModel.ts) | player/weapon/WeaponModel.ts | Three.js weapon mesh |
| [WeaponSwitching]([GH]/systems/player/weapon/WeaponSwitching.ts) | player/weapon/WeaponSwitching.ts | Weapon slot transitions |
| [WeaponRigManager]([GH]/systems/player/weapon/WeaponRigManager.ts) | player/weapon/WeaponRigManager.ts | Bone/transform rig |
| [WeaponShotCommandBuilder]([GH]/systems/player/weapon/WeaponShotCommandBuilder.ts) | player/weapon/WeaponShotCommandBuilder.ts | Build shot commands |
| [WeaponShotExecutor]([GH]/systems/player/weapon/WeaponShotExecutor.ts) | player/weapon/WeaponShotExecutor.ts | Execute shots against CombatantSystem |
| [ShotCommandFactory]([GH]/systems/player/weapon/ShotCommand.ts) | player/weapon/ShotCommand.ts | Pooled shot command objects |

---

## Wiring

**PlayerController** receives (15 deps - highest fan-out):

| Dep | Method | Domain |
|-----|--------|--------|
| TerrainSystem | setTerrainSystem | Terrain |
| GameModeManager | setGameModeManager | World |
| TicketSystem | setTicketSystem | World |
| HelicopterModel | setHelicopterModel | Vehicle |
| FirstPersonWeapon | setFirstPersonWeapon | Player |
| HUDSystem | setHUDSystem | UI |
| CameraShakeSystem | setCameraShakeSystem | Effects |
| FootstepAudioSystem | setFootstepAudioSystem | Audio |
| InventoryManager | setInventoryManager | Player |
| GrenadeSystem | setGrenadeSystem | Weapons |
| MortarSystem | setMortarSystem | Weapons |
| SandbagSystem | setSandbagSystem | Weapons |
| PlayerSquadController | setPlayerSquadController | Combat |
| Renderer | setRenderer | Core |
| CommandInputManager | setCommandInputManager | Combat |

**FirstPersonWeapon** receives (8): PlayerController, CombatantSystem, TicketSystem, HUDSystem, ZoneManager, AudioManager, InventoryManager, GrenadeSystem

**PlayerHealthSystem** receives (7): ZoneManager, TicketSystem, PlayerController, FirstPersonWeapon, PlayerRespawnManager, HUDSystem, Camera

**PlayerRespawnManager** receives (11): PlayerHealthSystem, ZoneManager, GameModeManager, PlayerController, FirstPersonWeapon, InventoryManager, LoadoutService, GrenadeSystem, WarSimulator, TerrainSystem, HelipadSystem

Internal note:
- `PlayerRespawnManager` no longer owns the pending initial-deploy promise and selected-spawn state directly.
- `DeployFlowController` is now the state holder for deploy session kind, session model, visibility, selected spawn, and initial-deploy resolve/reject flow.
- `InitialDeployCancelledError` is now a standalone contract used by both core startup code and player deploy code, instead of being defined inside `PlayerRespawnManager`.

---

## Death/Respawn Flow

```
NPC fires -> CombatantCombat.processFire() -> damage to PlayerHealthSystem
PlayerHealthSystem.takeDamage()
  if health <= 0:
    playerController.disable()
    firstPersonWeapon.disable()
    hudSystem.addDeath()
    deathCam activates
    playerRespawnManager.showDeployUI('respawn')
      -> DeployFlowController owns active session + selected spawn
      -> RespawnUI / RespawnMapController confirm deployment
      -> playerController.setPosition(), enable(), playerHealthSystem.heal()
```

---

## Helicopter Enter/Exit

```
HelicopterInteraction.checkPlayerProximity()
  if within 5m: hudSystem.showInteractionPrompt("Press E")
  [E pressed]: HelicopterInteraction.tryEnterHelicopter()
    playerController.enterHelicopter(id, pos, quat)
    hudSystem.showHelicopterInstruments()
    hudSystem.setState({vehicle: 'helicopter'})  // CSS hides infantry UI
    playerController.disableFootMovement()

During flight:
  PlayerMovement reads input -> physics.setControls()
  HelicopterModel.updateHelicopterPhysics() applies controls
  playerController.setPosition(physics.state.position)
  camera follows helicopter

[E pressed again]: exitHelicopter()
  playerController.exitHelicopter()
  hudSystem.hideHelicopterInstruments()
```

---

## Controls

Source: [PlayerInput.ts]([GH]/systems/player/PlayerInput.ts)

| Input | Action | Context |
|-------|--------|---------|
| WASD | Move | Infantry |
| Mouse | Look | Infantry + Helicopter (mouse mode) |
| LMB | Fire | Infantry |
| RMB | ADS | Infantry |
| R | Reload | Infantry |
| 1-4 | Weapon switch | Infantry |
| E | Enter/exit helicopter | Near helicopter |
| V | Rally point place | Infantry |
| B | Deploy/undeploy mortar | Infantry |
| M | Toggle mortar camera | Infantry |
| F | Mortar fire | Infantry (mortar deployed) |
| Z | Squad command overlay | Infantry |
| Tab | Scoreboard | Any |
| W/S | Collective up/down | Helicopter |
| A/D | Yaw left/right | Helicopter |
| Arrows | Cyclic pitch/roll | Helicopter |
| Shift | Engine boost | Helicopter |
| Space | Auto-hover toggle | Helicopter |
| RCtrl | Mouse flight mode | Helicopter |

Note: No dedicated grenade throw key. Grenades are thrown via weapon slot selection (number keys) + LMB.

---

## Related

- [Hub](../CODEBASE_BLOCKS.md) | [Combat](combat.md) | [Vehicle](vehicle.md) | [Weapons](weapons.md) | [UI](ui.md)
- [PlayerInput.ts source]([GH]/systems/player/PlayerInput.ts) - all key bindings
- [PlayerController.ts source]([GH]/systems/player/PlayerController.ts) - movement/camera orchestrator
