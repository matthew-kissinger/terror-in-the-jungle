import * as THREE from 'three';
import type { FixedWingModel } from './FixedWingModel';
import { createIdleFixedWingPilotIntent } from './FixedWingControlLaw';
import type { FixedWingPilotIntent, FixedWingPilotMode } from './FixedWingControlLaw';
import { FIXED_WING_CONFIGS } from './FixedWingConfigs';
import { buildOrbitAnchorFromHeading } from './FixedWingOperations';
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

function createFixedWingUIContext(role: string): VehicleUIContext {
  return {
    kind: 'plane',
    role,
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
  private fixedWingOrbitHold = false;
  private fixedWingOrbitCenterX = 0;
  private fixedWingOrbitCenterZ = 0;
  private fixedWingPilotMode: FixedWingPilotMode = 'assisted';
  private lastMouseControlEnabled = false;

  private fixedWingModel: FixedWingModel;
  private activeAircraftId: string | null = null;
  private activeConfigKey: string | null = null;

  constructor(fixedWingModel: FixedWingModel) {
    this.fixedWingModel = fixedWingModel;
  }

  onEnter(ctx: VehicleTransitionContext): void {
    // Initialize controls from aircraft config
    this.activeConfigKey = this.fixedWingModel.getConfigKey(ctx.vehicleId);
    const config = this.activeConfigKey ? FIXED_WING_CONFIGS[this.activeConfigKey] : null;
    const autoLevelDefault = this.fixedWingModel.getDisplayInfo(ctx.vehicleId)?.autoLevelDefault ?? false;
    this.fixedWingThrottle = 0;
    this.fixedWingMousePitch = 0;
    this.fixedWingMouseRoll = 0;
    this.fixedWingStabilityAssist = autoLevelDefault;
    this.fixedWingOrbitHold = false;
    this.fixedWingOrbitCenterX = 0;
    this.fixedWingOrbitCenterZ = 0;
    this.fixedWingPilotMode = 'assisted';
    this.lastMouseControlEnabled = this.getFlightMouseControlEnabled(ctx.cameraController);
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
    hudSystem?.setVehicleContext?.(createFixedWingUIContext(config?.role ?? 'pilot'));

    // Set stall speed for HUD display
    const fd = this.fixedWingModel.getFlightData(ctx.vehicleId);
    if (fd) {
      hudSystem?.setFixedWingStallSpeed?.(fd.stallSpeed);
      hudSystem?.updateFixedWingFlightData?.(fd.airspeed, fd.heading, fd.verticalSpeed);
      hudSystem?.updateFixedWingThrottle?.(fd.throttle);
      hudSystem?.setFixedWingStallWarning?.(fd.isStalled);
      hudSystem?.setFixedWingPhase?.(fd.controlPhase);
      hudSystem?.setFixedWingOperationState?.(fd.operationState);
      const assistIndicator = config?.operation.playerFlow === 'gunship_orbit'
        ? fd.orbitHoldEnabled
        : this.fixedWingStabilityAssist;
      hudSystem?.setFixedWingFlightAssist?.(assistIndicator);
      hudSystem?.setFixedWingAutoLevel?.(assistIndicator);
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
    this.activeConfigKey = null;
    this.resetControlState();
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.activeAircraftId) return;

    let mouseMovement: { x: number; y: number } | undefined;
    const touchFlight = this.isTouchFlightMode(ctx.input);
    const mouseControlEnabled = this.getFlightMouseControlEnabled(ctx.cameraController);
    if (
      !touchFlight
      && mouseControlEnabled
      && ctx.input.getIsPointerLocked()
    ) {
      mouseMovement = ctx.input.getMouseMovement();
    }

    this.updateFixedWingControls(
      ctx.deltaTime,
      ctx.input,
      ctx.hudSystem as IHUDSystem | undefined,
      mouseMovement,
      mouseControlEnabled,
    );

    if (mouseMovement) {
      ctx.input.clearMouseMovement();
    }
  }

  resetControlState(): void {
    this.fixedWingThrottle = 0;
    this.fixedWingMousePitch = 0;
    this.fixedWingMouseRoll = 0;
    this.fixedWingStabilityAssist = false;
    this.fixedWingOrbitHold = false;
    this.fixedWingOrbitCenterX = 0;
    this.fixedWingOrbitCenterZ = 0;
    this.fixedWingPilotMode = 'assisted';
    this.lastMouseControlEnabled = false;
  }

  // ── Public accessors ──

  toggleFlightAssist(): void {
    if (this.isGunshipActive()) {
      this.toggleOrbitHold();
      return;
    }
    this.fixedWingStabilityAssist = !this.fixedWingStabilityAssist;
  }

  toggleAutoLevel(): void {
    this.toggleFlightAssist();
  }

  isFlightAssistEnabled(): boolean {
    return this.fixedWingStabilityAssist;
  }

  isAutoLevelEnabled(): boolean {
    return this.isFlightAssistEnabled();
  }

  // ── Private control update ──

  private updateFixedWingControls(
    deltaTime: number,
    input: PlayerInput,
    hudSystem?: IHUDSystem,
    mouseMovement?: { x: number; y: number },
    mouseControlEnabled: boolean = false,
  ): void {
    const hasTouchMode = this.isTouchFlightMode(input);
    const gp = input.getGamepadManager?.();
    const gpActive = gp?.isActive() ?? false;

    if (mouseControlEnabled !== this.lastMouseControlEnabled) {
      this.fixedWingMousePitch = 0;
      this.fixedWingMouseRoll = 0;
      this.lastMouseControlEnabled = mouseControlEnabled;
    }
    this.fixedWingPilotMode = mouseControlEnabled ? 'direct_stick' : 'assisted';

    const activeFlightData = this.activeAircraftId
      ? this.fixedWingModel.getFlightData(this.activeAircraftId)
      : null;
    const activeConfig = this.activeConfigKey ? FIXED_WING_CONFIGS[this.activeConfigKey] : null;
    if (
      this.fixedWingOrbitHold
      && (!activeConfig || !activeFlightData || activeFlightData.weightOnWheels
        || activeFlightData.altitudeAGL < (activeConfig.operation.orbitMinAltitude ?? 80))
    ) {
      this.fixedWingOrbitHold = false;
    }

    // --- Throttle target (persistent: W increases, S decreases) ---
    let brake = 0;
    let throttleStep = 0;
    if (hasTouchMode) {
      const touchMove = input.getTouchMovementVector();
      const throttleRate = -touchMove.z;
      if (Math.abs(throttleRate) > FW_TOUCH_DEADZONE) {
        throttleStep = throttleRate;
        this.fixedWingThrottle = THREE.MathUtils.clamp(
          this.fixedWingThrottle + throttleRate * deltaTime * FW_THROTTLE_RAMP_RATE,
          0, 1,
        );
      }
    } else if (input.isKeyPressed('keyw')) {
      throttleStep = 1;
      this.fixedWingThrottle = Math.min(this.fixedWingThrottle + deltaTime * FW_THROTTLE_RAMP_RATE, 1.0);
    } else if (input.isKeyPressed('keys')) {
      throttleStep = -1;
      this.fixedWingThrottle = Math.max(this.fixedWingThrottle - deltaTime * FW_THROTTLE_RAMP_RATE, 0.0);
      if (this.fixedWingThrottle <= 0.35) {
        brake = 1.0;
      }
    }

    // --- Yaw / steering ---
    let yawIntent = 0;
    if (hasTouchMode) {
      const touchMove = input.getTouchMovementVector();
      yawIntent = Math.abs(touchMove.x) > FW_TOUCH_DEADZONE ? -touchMove.x : 0;
    } else if (input.isKeyPressed('keya')) {
      yawIntent = 1.0;
    } else if (input.isKeyPressed('keyd')) {
      yawIntent = -1.0;
    }

    // --- Pitch / bank intent adapter ---
    const touchCyclic = this.getTouchFlightCyclicInput(input);
    const hasTouchCyclic = Math.abs(touchCyclic.pitch) > 0.05 || Math.abs(touchCyclic.roll) > 0.05;
    let pitchIntent = 0;
    let bankIntent = 0;

    if (gpActive && gp) {
      const gpMove = gp.getMovementVector();
      const gpPitch = -gpMove.z;
      const gpRoll = gpMove.x;
      if (Math.abs(gpPitch) > 0.05 || Math.abs(gpRoll) > 0.05) {
        pitchIntent = gpPitch;
        bankIntent = gpRoll;
      }
    }

    if (pitchIntent === 0 && bankIntent === 0) {
      if (hasTouchCyclic) {
        pitchIntent = touchCyclic.pitch;
        bankIntent = touchCyclic.roll;
      } else {
        pitchIntent = input.isKeyPressed('arrowup') ? 1.0
          : input.isKeyPressed('arrowdown') ? -1.0 : 0;
        bankIntent = input.isKeyPressed('arrowright') ? 1.0
          : input.isKeyPressed('arrowleft') ? -1.0 : 0;
      }
    }

    if (mouseMovement && mouseControlEnabled) {
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

    const intent = this.composePilotIntent(
      throttleStep,
      pitchIntent,
      bankIntent,
      yawIntent,
      brake,
      activeConfig,
    );
    this.fixedWingModel.setFixedWingPilotIntent(intent);

    // Update fixed-wing HUD
    if (hudSystem && this.activeAircraftId) {
      hudSystem.updateElevation(0); // Position-based; handled by PlayerController
      const fd = this.fixedWingModel.getFlightData(this.activeAircraftId);
      if (fd) {
        hudSystem.updateFixedWingFlightData?.(fd.airspeed, fd.heading, fd.verticalSpeed);
        hudSystem.updateFixedWingThrottle?.(this.fixedWingThrottle);
        hudSystem.setFixedWingStallWarning?.(fd.isStalled);
        hudSystem.setFixedWingPhase?.(fd.controlPhase);
        hudSystem.setFixedWingOperationState?.(fd.operationState);
        const assistIndicator = this.isGunshipActive() ? this.fixedWingOrbitHold : this.fixedWingStabilityAssist;
        hudSystem.setFixedWingFlightAssist?.(assistIndicator);
        hudSystem.setFixedWingAutoLevel?.(assistIndicator);
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

  private composePilotIntent(
    throttleStep: number,
    pitchIntent: number,
    bankIntent: number,
    yawIntent: number,
    brake: number,
    activeConfig: (typeof FIXED_WING_CONFIGS)[keyof typeof FIXED_WING_CONFIGS] | null,
  ): FixedWingPilotIntent {
    const intent = createIdleFixedWingPilotIntent();
    intent.throttleStep = THREE.MathUtils.clamp(throttleStep, -1, 1);
    intent.throttleTarget = this.fixedWingThrottle;
    intent.pitchIntent = THREE.MathUtils.clamp(pitchIntent, -1, 1);
    intent.bankIntent = THREE.MathUtils.clamp(bankIntent, -1, 1);
    intent.yawIntent = THREE.MathUtils.clamp(yawIntent, -1, 1);
    intent.brake = brake;
    intent.pilotMode = this.fixedWingPilotMode;
    intent.assistEnabled = this.fixedWingStabilityAssist;
    intent.orbitHoldEnabled = this.fixedWingOrbitHold;
    intent.orbitCenterX = this.fixedWingOrbitCenterX;
    intent.orbitCenterZ = this.fixedWingOrbitCenterZ;
    intent.orbitRadius = activeConfig?.operation.orbitRadius ?? 0;
    intent.orbitBankDeg = activeConfig?.operation.orbitBankDeg ?? 0;
    intent.orbitTurnDirection = activeConfig?.operation.orbitTurnDirection ?? -1;
    intent.directPitchInput = this.fixedWingPilotMode === 'direct_stick' ? this.fixedWingMousePitch : 0;
    intent.directRollInput = this.fixedWingPilotMode === 'direct_stick' ? this.fixedWingMouseRoll : 0;
    intent.directYawInput = 0;
    return intent;
  }

  private toggleOrbitHold(): void {
    if (!this.activeAircraftId || !this.activeConfigKey) {
      return;
    }
    const config = FIXED_WING_CONFIGS[this.activeConfigKey];
    const flightData = this.fixedWingModel.getFlightData(this.activeAircraftId);
    if (!config || !flightData || flightData.weightOnWheels) {
      this.fixedWingOrbitHold = false;
      return;
    }
    const minAltitude = config.operation.orbitMinAltitude ?? 80;
    if (!this.fixedWingOrbitHold && flightData.altitudeAGL < minAltitude) {
      return;
    }

    this.fixedWingOrbitHold = !this.fixedWingOrbitHold;
    if (!this.fixedWingOrbitHold) {
      return;
    }

    const position = new THREE.Vector3();
    if (!this.fixedWingModel.getAircraftPositionTo(this.activeAircraftId, position)) {
      this.fixedWingOrbitHold = false;
      return;
    }

    const anchor = buildOrbitAnchorFromHeading(
      position,
      THREE.MathUtils.degToRad(flightData.heading),
      config.operation.orbitRadius ?? 160,
      config.operation.orbitTurnDirection ?? -1,
    );
    this.fixedWingOrbitCenterX = anchor.centerX;
    this.fixedWingOrbitCenterZ = anchor.centerZ;
    this.fixedWingStabilityAssist = true;
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

  private isGunshipActive(): boolean {
    if (!this.activeConfigKey) {
      return false;
    }
    return FIXED_WING_CONFIGS[this.activeConfigKey]?.operation.playerFlow === 'gunship_orbit';
  }
}
