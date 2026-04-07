import * as THREE from 'three';
import type { HelicopterControls } from '../helicopter/HelicopterPhysics';
import type { IHelicopterModel, IHUDSystem } from '../../types/SystemInterfaces';
import type { PlayerInput } from '../player/PlayerInput';
import type { PlayerCamera } from '../player/PlayerCamera';
import type { PlayerVehicleAdapter, VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { InputContext } from '../input/InputContextManager';
import type { VehicleUIContext } from '../../ui/layout/types';

// ── Helicopter control tuning ──
const HELI_AUTOHOVER_TARGET = 0.4;
const HELI_TOUCH_JOYSTICK_DEADZONE = 0.1;
const HELI_TOUCH_CYCLIC_DEADZONE = 0.05;
const HELI_MOUSE_SENSITIVITY_DEFAULT = 0.5;

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

/**
 * Helicopter player vehicle adapter.
 * Owns all helicopter-specific control state and orchestrates
 * the enter/exit/update lifecycle for helicopter flight.
 */
export class HelicopterPlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'helicopter';
  readonly inputContext: InputContext = 'helicopter';

  // Helicopter control state (moved from PlayerMovement)
  private helicopterControls: HelicopterControls = {
    collective: 0,
    cyclicPitch: 0,
    cyclicRoll: 0,
    yaw: 0,
    engineBoost: false,
    autoHover: true,
  };
  private altitudeLock = false;
  private lockedCollective = HELI_AUTOHOVER_TARGET;

  private helicopterModel: IHelicopterModel;
  private activeHelicopterId: string | null = null;

  constructor(helicopterModel: IHelicopterModel) {
    this.helicopterModel = helicopterModel;
  }

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.activeHelicopterId = ctx.vehicleId;

    ctx.playerState.velocity.set(0, 0, 0);
    ctx.playerState.isRunning = false;
    ctx.setPosition(ctx.position, 'helicopter.enter');

    this.setFlightVehicleInputState(ctx.input, 'helicopter');
    if ('setInputContext' in ctx.input) {
      (ctx.input as any).setInputContext('helicopter');
    }
    ctx.cameraController.saveInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.showHelicopterMouseIndicator();
    hudSystem?.updateHelicopterMouseMode(this.getFlightMouseControlEnabled(ctx.cameraController));
    hudSystem?.showHelicopterInstruments();

    const role = this.helicopterModel.getAircraftRole(ctx.vehicleId);
    hudSystem?.setVehicleContext?.(createHelicopterUIContext(role));
    hudSystem?.setHelicopterAircraftRole(role);

    if (ctx.gameRenderer) {
      const crosshairMode = role === 'attack'
        ? 'helicopter_attack'
        : role === 'gunship'
          ? 'helicopter_gunship'
          : 'helicopter_transport';
      ctx.gameRenderer.setCrosshairMode(crosshairMode);
    }
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'helicopter.exit');
    this.setFlightVehicleInputState(ctx.input, 'none');
    if ('setInputContext' in ctx.input) {
      (ctx.input as any).setInputContext('gameplay');
    }
    ctx.cameraController?.restoreInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.hideHelicopterMouseIndicator();
    hudSystem?.hideHelicopterInstruments();
    hudSystem?.setVehicleContext?.(null);

    if (ctx.gameRenderer) {
      ctx.gameRenderer.setCrosshairMode('infantry');
    }

    this.activeHelicopterId = null;
    this.resetControlState();
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.activeHelicopterId) return;

    let mouseMovement: { x: number; y: number } | undefined;
    const touchFlight = this.isTouchFlightMode(ctx.input);
    if (
      !touchFlight
      && this.getFlightMouseControlEnabled(ctx.cameraController)
      && ctx.input.getIsPointerLocked()
    ) {
      mouseMovement = ctx.input.getMouseMovement();
    }

    this.updateHelicopterControls(ctx.deltaTime, ctx.input, ctx.hudSystem as IHUDSystem | undefined, mouseMovement);

    if (mouseMovement) {
      ctx.input.clearMouseMovement();
    }
  }

  resetControlState(): void {
    this.helicopterControls = {
      collective: 0,
      cyclicPitch: 0,
      cyclicRoll: 0,
      yaw: 0,
      engineBoost: false,
      autoHover: true,
    };
    this.altitudeLock = false;
    this.lockedCollective = HELI_AUTOHOVER_TARGET;
  }

  // ── Public control accessors ──

  getHelicopterControls(): Readonly<HelicopterControls> {
    return this.helicopterControls;
  }

  setEngineBoost(boost: boolean): void {
    this.helicopterControls.engineBoost = boost;
  }

  toggleAutoHover(): void {
    this.helicopterControls.autoHover = !this.helicopterControls.autoHover;
  }

  toggleAltitudeLock(): void {
    this.altitudeLock = !this.altitudeLock;
    if (this.altitudeLock) {
      this.lockedCollective = this.helicopterControls.collective;
    }
  }

  // ── Private control update ──

  private updateHelicopterControls(
    deltaTime: number,
    input: PlayerInput,
    hudSystem?: IHUDSystem,
    mouseMovement?: { x: number; y: number },
  ): void {
    const hasTouchHeliMode = this.isTouchFlightMode(input);

    // --- Collective (vertical thrust) ---
    if (hasTouchHeliMode) {
      const touchMove = input.getTouchMovementVector();
      const collectiveInput = -touchMove.z;
      if (Math.abs(collectiveInput) > HELI_TOUCH_JOYSTICK_DEADZONE) {
        this.helicopterControls.collective = (collectiveInput + 1) / 2;
        this.altitudeLock = false;
      } else {
        this.helicopterControls.collective = this.getIdleCollective();
      }
    } else if (input.isKeyPressed('keyw')) {
      this.helicopterControls.collective = 1.0;
      this.altitudeLock = false;
    } else if (input.isKeyPressed('keys')) {
      this.helicopterControls.collective = 0.0;
      this.altitudeLock = false;
    } else {
      this.helicopterControls.collective = this.getIdleCollective();
    }

    // --- Yaw (tail rotor, turning) ---
    if (hasTouchHeliMode) {
      const touchMove = input.getTouchMovementVector();
      this.helicopterControls.yaw = Math.abs(touchMove.x) > HELI_TOUCH_JOYSTICK_DEADZONE ? -touchMove.x : 0;
    } else if (input.isKeyPressed('keya')) {
      this.helicopterControls.yaw = 1.0;
    } else if (input.isKeyPressed('keyd')) {
      this.helicopterControls.yaw = -1.0;
    } else {
      this.helicopterControls.yaw = 0;
    }

    // --- Cyclic Pitch/Roll ---
    const touchCyclic = this.getTouchFlightCyclicInput(input);
    const hasTouchCyclic = Math.abs(touchCyclic.pitch) > HELI_TOUCH_CYCLIC_DEADZONE || Math.abs(touchCyclic.roll) > HELI_TOUCH_CYCLIC_DEADZONE;

    if (hasTouchCyclic) {
      this.helicopterControls.cyclicPitch = touchCyclic.pitch;
      this.helicopterControls.cyclicRoll = touchCyclic.roll;
    } else {
      this.helicopterControls.cyclicPitch = input.isKeyPressed('arrowup') ? 1.0
        : input.isKeyPressed('arrowdown') ? -1.0 : 0;
      this.helicopterControls.cyclicRoll = input.isKeyPressed('arrowright') ? 1.0
        : input.isKeyPressed('arrowleft') ? -1.0 : 0;
    }

    if (mouseMovement) {
      this.addMouseControl(mouseMovement);
    }

    // Send controls to helicopter model
    if (this.activeHelicopterId) {
      this.helicopterModel.setHelicopterControls(this.activeHelicopterId, this.helicopterControls);
    }

    // Update helicopter instruments HUD
    if (hudSystem && this.activeHelicopterId) {
      let rpm = this.helicopterControls.collective * 0.8 + 0.2;
      const state = this.helicopterModel.getHelicopterState(this.activeHelicopterId);
      if (state) rpm = state.engineRPM;

      const flightData = this.helicopterModel.getFlightData(this.activeHelicopterId);
      if (flightData) {
        hudSystem.updateHelicopterFlightData(flightData.airspeed, flightData.heading, flightData.verticalSpeed);
      }

      hudSystem.updateHelicopterInstruments(
        this.helicopterControls.collective,
        rpm,
        this.helicopterControls.autoHover,
        this.helicopterControls.engineBoost,
      );
    }
  }

  private getIdleCollective(): number {
    if (this.altitudeLock) return this.lockedCollective;
    if (this.helicopterControls.autoHover) return HELI_AUTOHOVER_TARGET;
    return 0;
  }

  private addMouseControl(mouseMovement: { x: number; y: number }, sensitivity: number = HELI_MOUSE_SENSITIVITY_DEFAULT): void {
    this.helicopterControls.cyclicRoll = THREE.MathUtils.clamp(
      this.helicopterControls.cyclicRoll + mouseMovement.x * sensitivity,
      -1.0, 1.0,
    );
    this.helicopterControls.cyclicPitch = THREE.MathUtils.clamp(
      this.helicopterControls.cyclicPitch - mouseMovement.y * sensitivity,
      -1.0, 1.0,
    );
  }

  // ── Input helpers (mirrors PlayerVehicleController helpers) ──

  private setFlightVehicleInputState(input: PlayerInput, mode: 'none' | 'helicopter' | 'plane'): void {
    if (typeof input.setFlightVehicleMode === 'function') {
      input.setFlightVehicleMode(mode);
      return;
    }
    input.setInHelicopter(mode !== 'none');
  }

  private getFlightMouseControlEnabled(cameraController: PlayerCamera): boolean {
    if (typeof cameraController.getFlightMouseControlEnabled === 'function') {
      return cameraController.getFlightMouseControlEnabled();
    }
    return cameraController.getHelicopterMouseControlEnabled();
  }

  private isTouchFlightMode(input: PlayerInput): boolean {
    const touchControls = input.getTouchControls?.();
    if (!touchControls) return false;
    if (typeof touchControls.isInFlightMode === 'function') {
      return touchControls.isInFlightMode();
    }
    return touchControls.isInHelicopterMode();
  }

  private getTouchFlightCyclicInput(input: PlayerInput): { pitch: number; roll: number } {
    if (typeof input.getTouchFlightCyclicInput === 'function') {
      return input.getTouchFlightCyclicInput();
    }
    return input.getTouchCyclicInput();
  }
}
