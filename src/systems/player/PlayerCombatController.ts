import * as THREE from 'three';
import { WeaponSlot } from './InventoryManager';
import type { PlayerState } from '../../types';
import type { PlayerInput } from './PlayerInput';
import type { PlayerCombatControllerDependencies } from './PlayerControllerDependencies';

export class PlayerCombatController {
  private deps: PlayerCombatControllerDependencies = {};

  configure(deps: PlayerCombatControllerDependencies): void {
    this.deps = { ...this.deps, ...deps };
  }

  beginFire(playerState: PlayerState, currentWeaponMode: WeaponSlot, camera: THREE.Camera): void {
    const isGameActive = this.deps.ticketSystem ? this.deps.ticketSystem.isGameActive() : true;
    if (!isGameActive) return;

    if (playerState.isInHelicopter && this.deps.helicopterModel && playerState.helicopterId) {
      this.deps.helicopterModel.startFiring(playerState.helicopterId);
      return;
    }

    switch (currentWeaponMode) {
      case WeaponSlot.GRENADE: {
        const equipmentAction = this.deps.inventoryManager?.getEquipmentActionForSlot(WeaponSlot.GRENADE);
        if (equipmentAction === 'grenade' && this.deps.grenadeSystem) {
          this.deps.grenadeSystem.startAiming();
          this.deps.hudSystem?.showGrenadePowerMeter();
        } else if (equipmentAction === 'sandbag') {
          this.deps.sandbagSystem?.placeSandbag();
        } else if (equipmentAction === 'mortar') {
          this.toggleMortar(camera, playerState.position);
        }
        break;
      }
      case WeaponSlot.SANDBAG:
        this.deps.sandbagSystem?.placeSandbag();
        break;
      default:
        this.deps.firstPersonWeapon?.getWeaponInput()?.triggerFireStart();
        break;
    }
  }

  endFire(playerState: PlayerState, currentWeaponMode: WeaponSlot): void {
    if (playerState.isInHelicopter && this.deps.helicopterModel && playerState.helicopterId) {
      this.deps.helicopterModel.stopFiring(playerState.helicopterId);
      return;
    }

    switch (currentWeaponMode) {
      case WeaponSlot.GRENADE:
        if (this.deps.inventoryManager?.getEquipmentActionForSlot(WeaponSlot.GRENADE) === 'grenade' && this.deps.grenadeSystem) {
          this.deps.grenadeSystem.throwGrenade();
          this.deps.hudSystem?.hideGrenadePowerMeter();
        }
        break;
      default:
        this.deps.firstPersonWeapon?.getWeaponInput()?.triggerFireStop();
        break;
    }
  }

  startADS(): void {
    this.deps.firstPersonWeapon?.getWeaponInput()?.triggerADS(true);
  }

  stopADS(): void {
    this.deps.firstPersonWeapon?.getWeaponInput()?.triggerADS(false);
  }

  reload(): void {
    this.deps.firstPersonWeapon?.getWeaponInput()?.triggerReload();
  }

  toggleGrenadeSlot(): void {
    this.deps.inventoryManager?.setCurrentSlot(WeaponSlot.GRENADE);
  }

  toggleMortar(camera: THREE.Camera, playerPosition: THREE.Vector3): void {
    if (!this.deps.mortarSystem) return;
    if (this.deps.inventoryManager && !this.deps.inventoryManager.hasMortarKit()) {
      this.deps.hudSystem?.showMessage('Mortar kit not equipped', 2000);
      return;
    }

    if (this.deps.mortarSystem.isCurrentlyDeployed()) {
      this.deps.mortarSystem.undeployMortar();
      return;
    }

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    this.deps.mortarSystem.deployMortar(playerPosition, direction);
  }

  fireMortar(): void {
    this.deps.mortarSystem?.fireMortarRound();
  }

  adjustMortarPitch(delta: number): void {
    if (this.deps.mortarSystem?.isCurrentlyDeployed()) {
      this.deps.mortarSystem.adjustPitch(delta * 2);
    }
  }

  adjustMortarYaw(delta: number): void {
    if (this.deps.mortarSystem?.isCurrentlyDeployed()) {
      this.deps.mortarSystem.adjustYaw(delta * 2);
    }
  }

  updateSupportSystems(
    currentWeaponMode: WeaponSlot,
    camera: THREE.Camera,
    _input: PlayerInput,
  ): void {
    const equipmentAction = this.deps.inventoryManager?.getEquipmentActionForSlot(currentWeaponMode) ?? null;
    if ((currentWeaponMode === WeaponSlot.SANDBAG || equipmentAction === 'sandbag') && this.deps.sandbagSystem) {
      this.deps.sandbagSystem.updatePreviewPosition(camera);
      return;
    }

    if (currentWeaponMode === WeaponSlot.GRENADE && equipmentAction === 'grenade' && this.deps.grenadeSystem?.isCurrentlyAiming()) {
      this.deps.grenadeSystem.updateArc();
      const aimingState = this.deps.grenadeSystem.getAimingState();
      this.deps.hudSystem?.updateGrenadePower(aimingState.power);
    }
  }
}
