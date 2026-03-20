import * as THREE from 'three';
import type { PlayerState } from '../../types';
import type { PlayerMovement } from './PlayerMovement';
import type { PlayerCamera } from './PlayerCamera';
import type { PlayerInput } from './PlayerInput';
import type { PlayerVehicleControllerDependencies } from './PlayerControllerDependencies';

export class PlayerVehicleController {
  private deps: PlayerVehicleControllerDependencies = {};
  private airSupportCycleIndex = 0;

  configure(deps: PlayerVehicleControllerDependencies): void {
    this.deps = { ...this.deps, ...deps };
  }

  updateHelicopterMode(
    deltaTime: number,
    movement: PlayerMovement,
    input: PlayerInput,
    cameraController: PlayerCamera,
  ): void {
    movement.updateHelicopterControls(deltaTime, input, this.deps.hudSystem);

    const touchHeli = input.getTouchControls()?.isInHelicopterMode() ?? false;
    if (
      !touchHeli
      && cameraController.getHelicopterMouseControlEnabled()
      && input.getIsPointerLocked()
    ) {
      const mouseMovement = input.getMouseMovement();
      movement.addMouseControlToHelicopter(mouseMovement);
      input.clearMouseMovement();
    }
  }

  handleEnterExitHelicopter(playerState: PlayerState): void {
    if (!this.deps.helicopterModel) return;
    if (playerState.isInHelicopter) {
      this.deps.helicopterModel.exitHelicopter();
    } else {
      this.deps.helicopterModel.tryEnterHelicopter();
    }
  }

  handleSquadDeploy(playerState: PlayerState): void {
    if (!this.deps.helicopterModel || !playerState.isInHelicopter) return;
    this.deps.helicopterModel.tryDeploySquad();
  }

  handleToggleMouseControl(cameraController: PlayerCamera): boolean {
    const enabled = cameraController.toggleHelicopterMouseControl();
    this.deps.hudSystem?.updateHelicopterMouseMode(enabled);
    return enabled;
  }

  handleAirSupportRequest(
    playerPosition: THREE.Vector3,
    camera: THREE.Camera,
  ): void {
    if (!this.deps.airSupportManager) return;
    const types = this.deps.airSupportManager.getSupportTypes();
    const type = types[this.airSupportCycleIndex % types.length];
    this.airSupportCycleIndex++;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const targetPos = playerPosition.clone().add(forward.clone().multiplyScalar(100));

    this.deps.airSupportManager.requestSupport({
      type,
      targetPosition: targetPos,
      approachDirection: forward,
    });
  }

  enterHelicopter(
    playerState: PlayerState,
    position: THREE.Vector3,
    helicopterId: string,
    setPosition: (position: THREE.Vector3, reason: string) => void,
    input: PlayerInput,
    gameRenderer: { setCrosshairMode(mode: 'helicopter_attack' | 'helicopter_gunship' | 'helicopter_transport'): void } | undefined,
    cameraController: PlayerCamera,
  ): void {
    playerState.isInHelicopter = true;
    playerState.helicopterId = helicopterId;
    setPosition(position, 'helicopter.enter');
    playerState.velocity.set(0, 0, 0);
    playerState.isRunning = false;

    input.setInHelicopter(true);

    this.deps.hudSystem?.showHelicopterMouseIndicator();
    this.deps.hudSystem?.updateHelicopterMouseMode(cameraController.getHelicopterMouseControlEnabled());
    this.deps.hudSystem?.showHelicopterInstruments();

    if (this.deps.helicopterModel) {
      const role = this.deps.helicopterModel.getAircraftRole(helicopterId);
      this.deps.hudSystem?.setHelicopterAircraftRole(role);
      if (gameRenderer) {
        const crosshairMode = role === 'attack'
          ? 'helicopter_attack'
          : role === 'gunship'
            ? 'helicopter_gunship'
            : 'helicopter_transport';
        gameRenderer.setCrosshairMode(crosshairMode);
      }
    }

    input.getTouchControls()?.enterHelicopterMode();

    // Set vehicle fire + weapon-cycle visibility based on aircraft role
    if (this.deps.helicopterModel) {
      const role = this.deps.helicopterModel.getAircraftRole(helicopterId);
      const armed = role === 'attack' || role === 'gunship';
      const bar = input.getTouchControls()?.vehicleActionBar;
      bar?.setFireVisible(armed);
      bar?.setWeaponCycleVisible(armed);
    }
  }

  exitHelicopter(
    playerState: PlayerState,
    exitPosition: THREE.Vector3,
    setPosition: (position: THREE.Vector3, reason: string) => void,
    input: PlayerInput,
    gameRenderer: { setCrosshairMode(mode: 'infantry'): void } | undefined,
  ): void {
    playerState.isInHelicopter = false;
    playerState.helicopterId = null;
    setPosition(exitPosition, 'helicopter.exit');
    input.setInHelicopter(false);
    this.deps.hudSystem?.hideHelicopterMouseIndicator();
    this.deps.hudSystem?.hideHelicopterInstruments();
    gameRenderer?.setCrosshairMode('infantry');
    input.getTouchControls()?.exitHelicopterMode();
  }
}
