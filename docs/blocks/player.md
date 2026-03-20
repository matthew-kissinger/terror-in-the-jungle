# Player Domain

> Self-contained reference. 8 GameSystem blocks, 23 internal modules, 1ms tick budget.
> PlayerController is still a high-fanout coordinator, but startup wiring now goes through grouped dependency objects instead of the old full setter chain.

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
| [PlayerMovement]([GH]/systems/player/PlayerMovement.ts) | systems/player/PlayerMovement.ts | Fixed-step movement/grounding, gravity, helicopter controls, world boundary bounce-back |
| [PlayerCombatController]([GH]/systems/player/PlayerCombatController.ts) | systems/player/PlayerCombatController.ts | Weapon, grenade, mortar, sandbag combat actions behind PlayerController |
| [PlayerVehicleController]([GH]/systems/player/PlayerVehicleController.ts) | systems/player/PlayerVehicleController.ts | Helicopter enter/exit, flight-mode support, squad deploy, air support requests |
| [PlayerStatsTracker]([GH]/systems/player/PlayerStatsTracker.ts) | systems/player/PlayerStatsTracker.ts | K/D/assist stats |
| [PlayerHealthEffects]([GH]/systems/player/PlayerHealthEffects.ts) | systems/player/PlayerHealthEffects.ts | Visual health feedback (vignette, red flash) |
| [PlayerHealthUI]([GH]/systems/player/PlayerHealthUI.ts) | systems/player/PlayerHealthUI.ts | Health bar DOM rendering |
| [DeathCamOverlay]([GH]/systems/player/DeathCamOverlay.ts) | systems/player/DeathCamOverlay.ts | Death camera overlay |
| [RespawnUI]([GH]/systems/player/RespawnUI.ts) | systems/player/RespawnUI.ts | Respawn/deploy UIComponent with CSS Modules, map host, loadout controls |
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

**PlayerController** startup runtime receives one grouped dependency object (plus a small compatibility surface that still exists for tests/cold paths):

| Dep | Method | Domain |
|-----|--------|--------|
| TerrainSystem | configureDependencies | Terrain |
| GameModeManager | configureDependencies | World |
| TicketSystem | configureDependencies | World |
| HelicopterModel | configureDependencies | Vehicle |
| FirstPersonWeapon | configureDependencies | Player |
| HUDSystem | configureDependencies | UI |
| CameraShakeSystem | configureDependencies | Effects |
| FootstepAudioSystem | configureDependencies | Audio |
| InventoryManager | configureDependencies | Player |
| GrenadeSystem | configureDependencies | Weapons |
| MortarSystem | configureDependencies | Weapons |
| SandbagSystem | configureDependencies | Weapons |
| PlayerSquadController | configureDependencies | Combat |
| Renderer | configureDependencies | Core |
| CommandInputManager | configureDependencies | Combat |

**FirstPersonWeapon** receives (8): PlayerController, CombatantSystem, TicketSystem, HUDSystem, ZoneManager, AudioManager, InventoryManager, GrenadeSystem

**PlayerHealthSystem** receives (7): ZoneManager, TicketSystem, PlayerController, FirstPersonWeapon, PlayerRespawnManager, HUDSystem, Camera

**PlayerRespawnManager** receives (11): PlayerHealthSystem, ZoneManager, GameModeManager, PlayerController, FirstPersonWeapon, InventoryManager, LoadoutService, GrenadeSystem, WarSimulator, TerrainSystem, HelipadSystem

Internal note:
- `PlayerRespawnManager` no longer owns the pending initial-deploy promise and selected-spawn state directly.
- `DeployFlowController` is now the state holder for deploy session kind, session model, visibility, selected spawn, and initial-deploy resolve/reject flow.
- `InitialDeployCancelledError` is now a standalone contract used by both core startup code and player deploy code, instead of being defined inside `PlayerRespawnManager`.
- `RespawnUI` is now a `UIComponent` mounted by the respawn flow, but it preserves the existing `PlayerRespawnManager` callback/update contract so the gameplay flow did not need a parallel rewrite.

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
  if within radius and not in exit cooldown:
    hudSystem.setInteractionContext({ kind: 'vehicle-enter', promptText, buttonLabel: 'ENTER' })
  [E pressed]: HelicopterInteraction.tryEnterHelicopter()
    playerController.enterHelicopter(id, pos, quat)
    hudSystem.setVehicleContext(helicopterUiContext)
    hudSystem.showHelicopterInstruments()
    gameplay presentation switches actorMode -> helicopter
    playerController.disableFootMovement()

During flight:
  PlayerMovement reads input -> fixed-step helicopter control updates
  HelicopterModel.updateHelicopterPhysics() applies controls through fixed-step HelicopterPhysics
  playerController.setPosition(physics.state.position)
  camera follows helicopter

[E pressed again]: exitHelicopter()
  playerController.exitHelicopter()
  HelicopterInteraction suppresses immediate re-entry prompt for 1s
  hudSystem.setVehicleContext(null)
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
| Shift+1..5 | Squad quick commands | Infantry |
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
