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
    movement.updateFixedWingControls(deltaTime, input, this.deps.fixedWingModel ?? undefined, this.deps.hudSystem);

    const touchHeli = input.getTouchControls()?.isInHelicopterMode() ?? false;
    if (
      !touchHeli
      && cameraController.getHelicopterMouseControlEnabled()
      && input.getIsPointerLocked()
    ) {
      const mouseMovement = input.getMouseMovement();
      movement.addMouseControlToFixedWing(mouseMovement);
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

    input.setInHelicopter(true); // Reuse existing flag for vehicle mode
    if ('setInputContext' in input) {
      (input as any).setInputContext('fixed_wing');
    }
    cameraController.saveInfantryAngles();

    this.deps.hudSystem?.showFixedWingInstruments?.();
    this.deps.hudSystem?.showHelicopterMouseIndicator();
    this.deps.hudSystem?.updateHelicopterMouseMode(cameraController.getHelicopterMouseControlEnabled());
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
    input.setInHelicopter(false);
    if ('setInputContext' in input) {
      (input as any).setInputContext('gameplay');
    }
    cameraController?.restoreInfantryAngles();
    this.deps.hudSystem?.hideFixedWingInstruments?.();
    this.deps.hudSystem?.hideHelicopterMouseIndicator();
    this.deps.hudSystem?.setVehicleContext?.(null);

    this.deps.fixedWingModel?.setPilotedAircraft(null);
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
    // Set helicopter input context if InputManager is available (gates equipment keys)
    if ('setInputContext' in input) {
      (input as any).setInputContext('helicopter');
    }
    cameraController.saveInfantryAngles();

    this.deps.hudSystem?.showHelicopterMouseIndicator();
    this.deps.hudSystem?.updateHelicopterMouseMode(cameraController.getHelicopterMouseControlEnabled());
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
    input.setInHelicopter(false);
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
