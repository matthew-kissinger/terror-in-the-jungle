// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { FixedWingModel } from './FixedWingModel';
import { createIdleFixedWingPilotIntent } from './FixedWingControlLaw';
import type { FixedWingPilotIntent, FixedWingPilotMode } from './FixedWingControlLaw';
import { getFixedWingCameraFit } from './FixedWingArmament';
import { FIXED_WING_CONFIGS } from './FixedWingConfigs';
import { buildOrbitAnchorFromHeading } from './FixedWingOperations';
import type { IHUDSystem } from '../../types/SystemInterfaces';
import type { PlayerInput } from '../player/PlayerInput';
import type {
  PlayerVehicleAdapter,
  VehicleExitOptions,
  VehicleExitPlan,
  VehicleTransitionContext,
  VehicleUpdateContext,
} from './PlayerVehicleAdapter';
import type { InputContext } from '../input/InputContextManager';
import type { VehicleUIContext } from '../../ui/layout/types';
import {
  getFlightMouseControlEnabled,
  getTouchFlightCyclicInput,
  isTouchFlightMode,
  relockPointer,
  seatPlayer,
  setCrosshairMode,
  setFlightVehicleInputState,
  setInfantryCrosshair,
  setInputContext,
} from './VehicleAdapterShared';

/**
 * Optional ammo-readout sink on the concrete HUD. `updateFixedWingAmmo` is not
 * on the fenced `IHUDSystem` (it is HUD-internal), so the adapter widens the
 * structural type here to push the per-airframe gun count + weapon name without
 * a fence change.
 */
type FixedWingAmmoHud = {
  updateFixedWingAmmo?(rounds: number, capacity: number, weaponName?: string): void;
};

// ── Fixed-wing control tuning ──
const FW_THROTTLE_RAMP_RATE = 0.8;
const FW_MOUSE_SENSITIVITY = 0.5;
const FW_TOUCH_DEADZONE = 0.1;
const FW_MOUSE_RECENTER_RATE = 1.8;
const FW_ASSIST_MOUSE_RECENTER_RATE = 3.2;
const FW_ORBIT_HOLD_ALTITUDE_HYSTERESIS_M = 60;
const FW_ORBIT_HOLD_MIN_DROPOUT_ALTITUDE_M = 20;
// DOM MouseEvent.button code for the right mouse button. RMB toggles the AC-47
// broadside gunner view (rising edge), reusing the tank-sight RMB pattern.
const FW_BROADSIDE_TOGGLE_BUTTON = 2;

function createFixedWingUIContext(
  role: string,
  weaponCount: number,
  broadsideAvailable: boolean,
  broadsideActive: boolean,
): VehicleUIContext {
  const context: VehicleUIContext = {
    kind: 'plane',
    role,
    hudVariant: 'flight',
    weaponCount,
    capabilities: {
      canExit: true,
      // Forward nose cannon: the pilot can fire when at least one weapon is
      // mounted. No weapon cycling (single fixed forward gun).
      canFirePrimary: weaponCount > 0,
      canCycleWeapons: false,
      canFreeLook: true,
      canStabilize: true,
      canDeploySquad: false,
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
  if (broadsideAvailable) {
    context.viewToggle = {
      inactiveLabel: 'SIDE',
      activeLabel: 'CHASE',
      active: broadsideActive,
      ariaLabel: broadsideActive ? 'Switch to chase view' : 'Switch to broadside view',
    };
  }
  return context;
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

  // AC-47 broadside gunner view: RMB rising-edge toggles it; only airframes with
  // a broadside battery (per the camera-fit table) respond. Flight controls are
  // unaffected — the toggle only repositions the camera.
  private broadsideViewActive = false;
  private prevBroadsideToggleDown = false;
  private broadsideToggleRequested = false;

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
    this.lastMouseControlEnabled = getFlightMouseControlEnabled(ctx.cameraController);
    this.activeAircraftId = ctx.vehicleId;
    this.broadsideViewActive = false;
    this.prevBroadsideToggleDown = false;
    this.broadsideToggleRequested = false;

    seatPlayer(ctx, 'fixedwing.enter');

    setFlightVehicleInputState(ctx.input, 'plane');
    setInputContext(ctx.input, 'fixed_wing');
    ctx.cameraController.saveInfantryAngles();
    ctx.cameraController.setFlightMouseControlEnabled(true);

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.showFixedWingInstruments?.();
    hudSystem?.showFixedWingMouseIndicator?.();
    hudSystem?.updateFixedWingMouseMode?.(getFlightMouseControlEnabled(ctx.cameraController));
    this.pushVehicleContext(hudSystem);

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

    // Boresighted reflector gunsight for the nose cannon (restored to infantry
    // on exit). Seed the ammo readout from the aircraft's current magazine.
    setCrosshairMode(ctx.gameRenderer, 'fixed_wing');
    this.pushAmmo(hudSystem, ctx.vehicleId);

    // Tell FixedWingModel this aircraft is now piloted
    this.fixedWingModel.setPilotedAircraft(ctx.vehicleId);

    // Start every aircraft on the chase cam (broadside view off). Airframes
    // without a broadside battery never enter it.
    ctx.cameraController.setFixedWingBroadsideView(false);

    // Re-acquire pointer lock for mouse flight controls
    relockPointer(ctx.input);
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'fixedwing.exit');
    setFlightVehicleInputState(ctx.input, 'none');
    setInputContext(ctx.input, 'gameplay');
    // Drop the broadside gunner view before restoring infantry angles so it
    // can never leak across the dismount.
    ctx.cameraController?.setFixedWingBroadsideView(false);
    ctx.cameraController?.restoreInfantryAngles();
    this.broadsideViewActive = false;
    this.prevBroadsideToggleDown = false;
    this.broadsideToggleRequested = false;

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.hideFixedWingInstruments?.();
    hudSystem?.hideFixedWingMouseIndicator?.();
    hudSystem?.setVehicleContext?.(null);

    // Restore the infantry crosshair the player left on foot.
    setInfantryCrosshair(ctx.gameRenderer);

    // Release the trigger before tearing down so the cannon can't latch firing
    // across an exit.
    if (this.activeAircraftId) {
      this.fixedWingModel.stopFiring(this.activeAircraftId);
    }
    this.fixedWingModel.setPilotedAircraft(null);
    this.activeAircraftId = null;
    this.activeConfigKey = null;
    this.resetControlState();
  }

  getExitPlan(ctx: VehicleTransitionContext, options: VehicleExitOptions): VehicleExitPlan {
    return this.fixedWingModel.getPlayerExitPlan(ctx.vehicleId, options) ?? {
      canExit: false,
      message: 'Cannot find aircraft for exit.',
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.activeAircraftId) return;

    this.updateBroadsideView(ctx);

    let mouseMovement: { x: number; y: number } | undefined;
    const touchFlight = isTouchFlightMode(ctx.input);
    const mouseControlEnabled = getFlightMouseControlEnabled(ctx.cameraController);
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

  /**
   * RMB rising-edge toggles the AC-47 broadside gunner view (reuses the
   * tank-sight RMB pattern). Only airframes that carry a broadside battery (per
   * the camera-fit table) respond; for the A-1 / F-4 this is a no-op. The toggle
   * only repositions the camera — flight controls are unchanged either way.
   */
  private updateBroadsideView(ctx: VehicleUpdateContext): void {
    const hasBroadside = this.hasBroadsideView();
    const down = typeof ctx.input.isMouseButtonPressed === 'function'
      ? ctx.input.isMouseButtonPressed(FW_BROADSIDE_TOGGLE_BUTTON)
      : false;

    const toggleRequested = this.broadsideToggleRequested;
    this.broadsideToggleRequested = false;
    const wasActive = this.broadsideViewActive;
    if (hasBroadside && ((down && !this.prevBroadsideToggleDown) || toggleRequested)) {
      this.broadsideViewActive = !this.broadsideViewActive;
    }
    this.prevBroadsideToggleDown = down;

    // Force-off for airframes without a broadside so a stale toggle never sticks.
    const desired = hasBroadside && this.broadsideViewActive;
    this.broadsideViewActive = desired;
    ctx.cameraController.setFixedWingBroadsideView(desired);
    if (wasActive !== desired) {
      this.pushVehicleContext(ctx.hudSystem as IHUDSystem | undefined);
    }
  }

  /** True when the AC-47 broadside gunner view is engaged. */
  isBroadsideViewActive(): boolean {
    return this.broadsideViewActive;
  }

  /**
   * Request a broadside/chase toggle from a discrete UI or keyboard action.
   * The actual camera write happens in update(), where the adapter has the
   * current camera and HUD context.
   */
  toggleBroadsideView(): void {
    this.broadsideToggleRequested = true;
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
    this.broadsideViewActive = false;
    this.prevBroadsideToggleDown = false;
    this.broadsideToggleRequested = false;
  }

  // ── Fire control ──

  /**
   * Begin firing the forward nose cannon. Routed from the player fire input
   * while piloting (mirrors the helicopter fire wiring). No-op if not seated.
   */
  startFiring(): void {
    if (this.activeAircraftId) {
      this.fixedWingModel.startFiring(this.activeAircraftId);
    }
  }

  stopFiring(): void {
    if (this.activeAircraftId) {
      this.fixedWingModel.stopFiring(this.activeAircraftId);
    }
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
    const hasTouchMode = isTouchFlightMode(input);
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
    const orbitDropoutAltitude = activeConfig
      ? Math.max(
          FW_ORBIT_HOLD_MIN_DROPOUT_ALTITUDE_M,
          (activeConfig.operation.orbitMinAltitude ?? 80) - FW_ORBIT_HOLD_ALTITUDE_HYSTERESIS_M,
        )
      : null;
    if (
      this.fixedWingOrbitHold
      && (!activeConfig || !activeFlightData || activeFlightData.weightOnWheels
        || (orbitDropoutAltitude !== null && activeFlightData.altitudeAGL < orbitDropoutAltitude))
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
    const touchCyclic = getTouchFlightCyclicInput(input);
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
      this.pushAmmo(hudSystem, this.activeAircraftId);
    }
  }

  /**
   * Push the live gun count + per-airframe weapon name to the HUD. Reads the
   * real fire-path count, capacity, and weapon name from the model so the
   * readout decrements with each shot and the label matches the airframe.
   */
  private pushAmmo(hudSystem: IHUDSystem | undefined, aircraftId: string): void {
    const sink = hudSystem as (IHUDSystem & FixedWingAmmoHud) | undefined;
    if (!sink?.updateFixedWingAmmo) return;
    sink.updateFixedWingAmmo(
      this.fixedWingModel.getWeaponAmmo(aircraftId),
      this.fixedWingModel.getWeaponAmmoCapacity(aircraftId),
      this.fixedWingModel.getWeaponName(aircraftId),
    );
  }

  private pushVehicleContext(hudSystem: IHUDSystem | undefined): void {
    if (!hudSystem || !this.activeAircraftId) return;
    const config = this.activeConfigKey ? FIXED_WING_CONFIGS[this.activeConfigKey] : null;
    hudSystem.setVehicleContext?.(createFixedWingUIContext(
      config?.role ?? 'pilot',
      this.fixedWingModel.getWeaponCount(this.activeAircraftId),
      this.hasBroadsideView(),
      this.broadsideViewActive,
    ));
  }

  private hasBroadsideView(): boolean {
    return getFixedWingCameraFit(this.activeConfigKey).broadside !== undefined;
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

  private isGunshipActive(): boolean {
    if (!this.activeConfigKey) {
      return false;
    }
    return FIXED_WING_CONFIGS[this.activeConfigKey]?.operation.playerFlow === 'gunship_orbit';
  }
}
