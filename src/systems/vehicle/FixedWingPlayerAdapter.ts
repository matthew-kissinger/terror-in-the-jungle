import * as THREE from 'three';
import type { FixedWingModel } from './FixedWingModel';
import type { FixedWingCommand } from './FixedWingPhysics';
import type { IHUDSystem } from '../../types/SystemInterfaces';
import type { PlayerInput } from '../player/PlayerInput';
import type { PlayerCamera } from '../player/PlayerCamera';
import type { PlayerVehicleAdapter, VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { InputContext } from '../input/InputContextManager';
import type { VehicleUIContext } from '../../ui/layout/types';

// ── Fixed-wing control tuning ──
const FW_THROTTLE_RAMP_RATE = 0.8;
const FW_MOUSE_SENSITIVITY = 0.5;
const FW_TOUCH_DEADZONE = 0.1;
const FW_MOUSE_RECENTER_RATE = 1.8;
const FW_ASSIST_MOUSE_RECENTER_RATE = 3.2;

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

/**
 * Fixed-wing player vehicle adapter.
 * Owns all fixed-wing-specific control state and orchestrates
 * the enter/exit/update lifecycle for fixed-wing flight.
 */
export class FixedWingPlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'fixed_wing';
  readonly inputContext: InputContext = 'fixed_wing';

  // Fixed-wing control state (moved from PlayerMovement)
  private fixedWingThrottle = 0;
  private fixedWingMousePitch = 0;
  private fixedWingMouseRoll = 0;
  private fixedWingStabilityAssist = false;

  private fixedWingModel: FixedWingModel;
  private activeAircraftId: string | null = null;

  constructor(fixedWingModel: FixedWingModel) {
    this.fixedWingModel = fixedWingModel;
  }

  onEnter(ctx: VehicleTransitionContext): void {
    // Initialize controls from aircraft config
    const autoLevelDefault = this.fixedWingModel.getDisplayInfo(ctx.vehicleId)?.autoLevelDefault ?? false;
    this.fixedWingThrottle = 0;
    this.fixedWingMousePitch = 0;
    this.fixedWingMouseRoll = 0;
    this.fixedWingStabilityAssist = autoLevelDefault;
    this.activeAircraftId = ctx.vehicleId;

    ctx.playerState.velocity.set(0, 0, 0);
    ctx.playerState.isRunning = false;
    ctx.setPosition(ctx.position, 'fixedwing.enter');

    this.setFlightVehicleInputState(ctx.input, 'plane');
    if ('setInputContext' in ctx.input) {
      (ctx.input as any).setInputContext('fixed_wing');
    }
    ctx.cameraController.saveInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.showFixedWingInstruments?.();
    hudSystem?.showFixedWingMouseIndicator?.();
    hudSystem?.updateFixedWingMouseMode?.(this.getFlightMouseControlEnabled(ctx.cameraController));
    hudSystem?.setVehicleContext?.(createFixedWingUIContext());

    // Set stall speed for HUD display
    const fd = this.fixedWingModel.getFlightData(ctx.vehicleId);
    if (fd) {
      hudSystem?.setFixedWingStallSpeed?.(fd.stallSpeed);
    }

    // Tell FixedWingModel this aircraft is now piloted
    this.fixedWingModel.setPilotedAircraft(ctx.vehicleId);

    // Re-acquire pointer lock for mouse flight controls
    if (typeof ctx.input.relockPointer === 'function') {
      ctx.input.relockPointer();
    }
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'fixedwing.exit');
    this.setFlightVehicleInputState(ctx.input, 'none');
    if ('setInputContext' in ctx.input) {
      (ctx.input as any).setInputContext('gameplay');
    }
    ctx.cameraController?.restoreInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.hideFixedWingInstruments?.();
    hudSystem?.hideFixedWingMouseIndicator?.();
    hudSystem?.setVehicleContext?.(null);

    this.fixedWingModel.setPilotedAircraft(null);
    this.activeAircraftId = null;
    this.resetControlState();
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.activeAircraftId) return;

    let mouseMovement: { x: number; y: number } | undefined;
    const touchFlight = this.isTouchFlightMode(ctx.input);
    if (
      !touchFlight
      && this.getFlightMouseControlEnabled(ctx.cameraController)
      && ctx.input.getIsPointerLocked()
    ) {
      mouseMovement = ctx.input.getMouseMovement();
    }

    this.updateFixedWingControls(ctx.deltaTime, ctx.input, ctx.hudSystem as IHUDSystem | undefined, mouseMovement);

    if (mouseMovement) {
      ctx.input.clearMouseMovement();
    }
  }

  resetControlState(): void {
    this.fixedWingThrottle = 0;
    this.fixedWingMousePitch = 0;
    this.fixedWingMouseRoll = 0;
    this.fixedWingStabilityAssist = false;
  }

  // ── Public accessors ──

  toggleAutoLevel(): void {
    this.fixedWingStabilityAssist = !this.fixedWingStabilityAssist;
  }

  isAutoLevelEnabled(): boolean {
    return this.fixedWingStabilityAssist;
  }

  // ── Private control update ──

  private updateFixedWingControls(
    deltaTime: number,
    input: PlayerInput,
    hudSystem?: IHUDSystem,
    mouseMovement?: { x: number; y: number },
  ): void {
    const hasTouchMode = this.isTouchFlightMode(input);
    const gp = input.getGamepadManager?.();
    const gpActive = gp?.isActive() ?? false;

    // --- Throttle target (persistent: W increases, S decreases) ---
    let brake = 0;
    if (hasTouchMode) {
      const touchMove = input.getTouchMovementVector();
      const throttleRate = -touchMove.z;
      if (Math.abs(throttleRate) > FW_TOUCH_DEADZONE) {
        this.fixedWingThrottle = THREE.MathUtils.clamp(
          this.fixedWingThrottle + throttleRate * deltaTime * FW_THROTTLE_RAMP_RATE,
          0, 1,
        );
      }
    } else if (input.isKeyPressed('keyw')) {
      this.fixedWingThrottle = Math.min(this.fixedWingThrottle + deltaTime * FW_THROTTLE_RAMP_RATE, 1.0);
    } else if (input.isKeyPressed('keys')) {
      this.fixedWingThrottle = Math.max(this.fixedWingThrottle - deltaTime * FW_THROTTLE_RAMP_RATE, 0.0);
      if (this.fixedWingThrottle <= 0.35) {
        brake = 1.0;
      }
    }

    // --- Yaw / steering ---
    let yawCommand = 0;
    if (hasTouchMode) {
      const touchMove = input.getTouchMovementVector();
      yawCommand = Math.abs(touchMove.x) > FW_TOUCH_DEADZONE ? -touchMove.x : 0;
    } else if (input.isKeyPressed('keya')) {
      yawCommand = 1.0;
    } else if (input.isKeyPressed('keyd')) {
      yawCommand = -1.0;
    }

    // --- Pitch / roll command adapter ---
    const touchCyclic = this.getTouchFlightCyclicInput(input);
    const hasTouchCyclic = Math.abs(touchCyclic.pitch) > 0.05 || Math.abs(touchCyclic.roll) > 0.05;
    let pitchCommand = 0;
    let rollCommand = 0;

    if (gpActive && gp) {
      const gpMove = gp.getMovementVector();
      const gpPitch = -gpMove.z;
      const gpRoll = gpMove.x;
      if (Math.abs(gpPitch) > 0.05 || Math.abs(gpRoll) > 0.05) {
        pitchCommand = gpPitch;
        rollCommand = gpRoll;
      }
    }

    if (pitchCommand === 0 && rollCommand === 0) {
      if (hasTouchCyclic) {
        pitchCommand = touchCyclic.pitch;
        rollCommand = touchCyclic.roll;
      } else {
        pitchCommand = input.isKeyPressed('arrowup') ? 1.0
          : input.isKeyPressed('arrowdown') ? -1.0 : 0;
        rollCommand = input.isKeyPressed('arrowright') ? 1.0
          : input.isKeyPressed('arrowleft') ? -1.0 : 0;
      }
    }

    if (mouseMovement) {
      this.addMouseControl(mouseMovement);
    }

    const recenterRate = this.fixedWingStabilityAssist
      ? FW_ASSIST_MOUSE_RECENTER_RATE
      : FW_MOUSE_RECENTER_RATE;
    this.fixedWingMousePitch = THREE.MathUtils.lerp(
      this.fixedWingMousePitch,
      0,
      Math.min(recenterRate * deltaTime, 1.0),
    );
    this.fixedWingMouseRoll = THREE.MathUtils.lerp(
      this.fixedWingMouseRoll,
      0,
      Math.min(recenterRate * deltaTime, 1.0),
    );

    const command = this.composeCommand(pitchCommand, rollCommand, yawCommand, brake);
    this.fixedWingModel.setFixedWingCommand(command);

    // Update fixed-wing HUD
    if (hudSystem && this.activeAircraftId) {
      hudSystem.updateElevation(0); // Position-based; handled by PlayerController
      const fd = this.fixedWingModel.getFlightData(this.activeAircraftId);
      if (fd) {
        hudSystem.updateFixedWingFlightData?.(fd.airspeed, fd.heading, fd.verticalSpeed);
        hudSystem.updateFixedWingThrottle?.(this.fixedWingThrottle);
        hudSystem.setFixedWingStallWarning?.(fd.isStalled || fd.phase === 'rotation');
        hudSystem.setFixedWingAutoLevel?.(this.fixedWingStabilityAssist);
      }
    }
  }

  private addMouseControl(mouseMovement: { x: number; y: number }, sensitivity: number = FW_MOUSE_SENSITIVITY): void {
    this.fixedWingMouseRoll = THREE.MathUtils.clamp(
      this.fixedWingMouseRoll + mouseMovement.x * sensitivity,
      -1.0, 1.0,
    );
    this.fixedWingMousePitch = THREE.MathUtils.clamp(
      this.fixedWingMousePitch - mouseMovement.y * sensitivity,
      -1.0, 1.0,
    );
  }

  private composeCommand(
    pitchCommand: number,
    rollCommand: number,
    yawCommand: number,
    brake: number,
  ): FixedWingCommand {
    const composedPitch = THREE.MathUtils.clamp(pitchCommand + this.fixedWingMousePitch, -1, 1);
    const composedRoll = THREE.MathUtils.clamp(rollCommand + this.fixedWingMouseRoll, -1, 1);

    return {
      throttleTarget: this.fixedWingThrottle,
      pitchCommand: composedPitch,
      rollCommand: composedRoll,
      yawCommand,
      brake,
      freeLook: false,
      stabilityAssist: this.fixedWingStabilityAssist,
    };
  }

  // ── Input helpers ──

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
