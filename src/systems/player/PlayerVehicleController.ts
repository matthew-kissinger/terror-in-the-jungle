import * as THREE from 'three';
import type { PlayerState } from '../../types';
import type { PlayerCamera } from './PlayerCamera';
import type { PlayerVehicleControllerDependencies } from './PlayerControllerDependencies';

/**
 * Handles vehicle proximity interactions, squad deploy, and air support.
 *
 * Vehicle enter/exit/update lifecycle is now managed by VehicleStateManager
 * with HelicopterPlayerAdapter and FixedWingPlayerAdapter.
 */
export class PlayerVehicleController {
  private deps: PlayerVehicleControllerDependencies = {};
  private airSupportCycleIndex = 0;

  configure(deps: PlayerVehicleControllerDependencies): void {
    this.deps = { ...this.deps, ...deps };
  }

  handleEnterExitVehicle(playerState: PlayerState): void {
    // Exit current vehicle first
    if (playerState.isInHelicopter) {
      this.deps.helicopterModel?.exitHelicopter();
      return;
    }
    if (playerState.isInFixedWing) {
      this.deps.fixedWingModel?.exitAircraft();
      return;
    }
    // Try entering: fixed-wing first (higher priority at airfields), then helicopter
    if (this.deps.fixedWingModel?.tryEnterAircraft()) return;
    this.deps.helicopterModel?.tryEnterHelicopter();
  }

  handleEnterExitHelicopter(playerState: PlayerState): void {
    this.handleEnterExitVehicle(playerState);
  }

  handleSquadDeploy(playerState: PlayerState): void {
    if (!this.deps.helicopterModel || !playerState.isInHelicopter) return;
    this.deps.helicopterModel.tryDeploySquad();
  }

  handleToggleMouseControl(cameraController: PlayerCamera): boolean {
    const enabled = cameraController.toggleFlightMouseControl();
    this.deps.hudSystem?.updateHelicopterMouseMode(enabled);
    this.deps.hudSystem?.updateFixedWingMouseMode?.(enabled);
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
}
