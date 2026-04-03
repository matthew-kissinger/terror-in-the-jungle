import * as THREE from 'three';
import type { PlayerState } from '../../types';
import type { PlayerMovement } from './PlayerMovement';
import type { PlayerCamera } from './PlayerCamera';
import type { PlayerInput } from './PlayerInput';
import type { PlayerVehicleControllerDependencies } from './PlayerControllerDependencies';
import type { VehicleUIContext } from '../../ui/layout/types';

function createHelicopterUIContext(role: 'transport' | 'attack' | 'gunship'): VehicleUIContext {
  const armed = role === 'attack' || role === 'gunship';
  return {
    kind: 'helicopter',
    role,
    hudVariant: 'flight',
    weaponCount: armed ? 2 : 0,
    capabilities: {
      canExit: true,
      canFirePrimary: armed,
      canCycleWeapons: armed,
      canFreeLook: true,
      canStabilize: true,
      canDeploySquad: role === 'transport',
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

function createFixedWingUIContext(): VehicleUIContext {
  return {
    kind: 'plane',
    role: 'pilot',
    hudVariant: 'flight',
    weaponCount: 0,
    capabilities: {
      canExit: true,
      canFirePrimary: false,
      canCycleWeapons: false,
      canFreeLook: true,
      canStabilize: true,
      canDeploySquad: false,
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

export class PlayerVehicleController {
  private deps: PlayerVehicleControllerDependencies = {};
  private airSupportCycleIndex = 0;

  private getTouchFlightMode(input: PlayerInput): boolean {
    const touchControls = input.getTouchControls?.();
    if (!touchControls) return false;
    if (typeof touchControls.isInFlightMode === 'function') {
      return touchControls.isInFlightMode();
    }
    return touchControls.isInHelicopterMode();
  }

  private getFlightMouseControlEnabled(cameraController: PlayerCamera): boolean {
    if (typeof cameraController.getFlightMouseControlEnabled === 'function') {
      return cameraController.getFlightMouseControlEnabled();
    }
    return cameraController.getHelicopterMouseControlEnabled();
  }

  private setFlightVehicleInputState(input: PlayerInput, mode: 'none' | 'helicopter' | 'plane'): void {
    if (typeof input.setFlightVehicleMode === 'function') {
      input.setFlightVehicleMode(mode);
      return;
    }
    input.setInHelicopter(mode !== 'none');
  }

  configure(deps: PlayerVehicleControllerDependencies): void {
    this.deps = { ...this.deps, ...deps };
  }

  updateHelicopterMode(
    deltaTime: number,
    movement: PlayerMovement,
    input: PlayerInput,
    cameraController: PlayerCamera,
  ): void {
    let mouseMovement: { x: number; y: number } | undefined;
    const touchHeli = this.getTouchFlightMode(input);
    if (
      !touchHeli
      && this.getFlightMouseControlEnabled(cameraController)
      && input.getIsPointerLocked()
    ) {
      mouseMovement = input.getMouseMovement();
    }

    movement.updateHelicopterControls(deltaTime, input, this.deps.hudSystem, mouseMovement);
    if (mouseMovement) {
      input.clearMouseMovement();
    }
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

  // -- Fixed-Wing Methods --

  updateFixedWingMode(
    deltaTime: number,
    movement: PlayerMovement,
    input: PlayerInput,
    cameraController: PlayerCamera,
  ): void {
    let mouseMovement: { x: number; y: number } | undefined;
    const touchHeli = this.getTouchFlightMode(input);
    if (
      !touchHeli
      && this.getFlightMouseControlEnabled(cameraController)
      && input.getIsPointerLocked()
    ) {
      mouseMovement = input.getMouseMovement();
    }

    movement.updateFixedWingControls(
      deltaTime,
      input,
      this.deps.fixedWingModel ?? undefined,
      this.deps.hudSystem,
      mouseMovement,
    );
    if (mouseMovement) {
      input.clearMouseMovement();
    }
  }

  enterFixedWing(
    playerState: PlayerState,
    position: THREE.Vector3,
    aircraftId: string,
    setPosition: (position: THREE.Vector3, reason: string) => void,
    input: PlayerInput,
    cameraController: PlayerCamera,
  ): void {
    playerState.isInFixedWing = true;
    playerState.fixedWingId = aircraftId;
    setPosition(position, 'fixedwing.enter');
    playerState.velocity.set(0, 0, 0);
    playerState.isRunning = false;

    this.setFlightVehicleInputState(input, 'plane');
    if ('setInputContext' in input) {
      (input as any).setInputContext('fixed_wing');
    }
    cameraController.saveInfantryAngles();

    this.deps.hudSystem?.showFixedWingInstruments?.();
    this.deps.hudSystem?.showFixedWingMouseIndicator?.();
    this.deps.hudSystem?.updateFixedWingMouseMode?.(this.getFlightMouseControlEnabled(cameraController));
    this.deps.hudSystem?.setVehicleContext?.(createFixedWingUIContext());

    // Set stall speed for HUD display
    if (this.deps.fixedWingModel) {
      const fd = this.deps.fixedWingModel.getFlightData(aircraftId);
      if (fd) {
        this.deps.hudSystem?.setFixedWingStallSpeed?.(fd.stallSpeed);
      }
    }

    // Tell FixedWingModel this aircraft is now piloted
    this.deps.fixedWingModel?.setPilotedAircraft(aircraftId);
  }

  exitFixedWing(
    playerState: PlayerState,
    exitPosition: THREE.Vector3,
    setPosition: (position: THREE.Vector3, reason: string) => void,
    input: PlayerInput,
    cameraController?: PlayerCamera,
  ): void {
    playerState.isInFixedWing = false;
    playerState.fixedWingId = null;
    setPosition(exitPosition, 'fixedwing.exit');
    this.setFlightVehicleInputState(input, 'none');
    if ('setInputContext' in input) {
      (input as any).setInputContext('gameplay');
    }
    cameraController?.restoreInfantryAngles();
    this.deps.hudSystem?.hideFixedWingInstruments?.();
    this.deps.hudSystem?.hideFixedWingMouseIndicator?.();
    this.deps.hudSystem?.setVehicleContext?.(null);

    this.deps.fixedWingModel?.setPilotedAircraft(null);
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

    this.setFlightVehicleInputState(input, 'helicopter');
    // Set helicopter input context if InputManager is available (gates equipment keys)
    if ('setInputContext' in input) {
      (input as any).setInputContext('helicopter');
    }
    cameraController.saveInfantryAngles();

    this.deps.hudSystem?.showHelicopterMouseIndicator();
    this.deps.hudSystem?.updateHelicopterMouseMode(this.getFlightMouseControlEnabled(cameraController));
    this.deps.hudSystem?.showHelicopterInstruments();

    if (this.deps.helicopterModel) {
      const role = this.deps.helicopterModel.getAircraftRole(helicopterId);
      this.deps.hudSystem?.setVehicleContext?.(createHelicopterUIContext(role));
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
  }

  exitHelicopter(
    playerState: PlayerState,
    exitPosition: THREE.Vector3,
    setPosition: (position: THREE.Vector3, reason: string) => void,
    input: PlayerInput,
    gameRenderer: { setCrosshairMode(mode: 'infantry'): void } | undefined,
    cameraController?: PlayerCamera,
  ): void {
    playerState.isInHelicopter = false;
    playerState.helicopterId = null;
    setPosition(exitPosition, 'helicopter.exit');
    this.setFlightVehicleInputState(input, 'none');
    if ('setInputContext' in input) {
      (input as any).setInputContext('gameplay');
    }
    cameraController?.restoreInfantryAngles();
    this.deps.hudSystem?.hideHelicopterMouseIndicator();
    this.deps.hudSystem?.hideHelicopterInstruments();
    this.deps.hudSystem?.setVehicleContext?.(null);
    gameRenderer?.setCrosshairMode('infantry');
  }
}
