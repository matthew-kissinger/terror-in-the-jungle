/**
 * Legacy fixed-wing API surface types.
 *
 * `FixedWingCommand` is the command shape produced by `FixedWingControlLaw`'s
 * `buildFixedWingPilotCommand()`; `FixedWingFlightSnapshot` is the observable
 * per-tick telemetry snapshot consumed by control-law and operation-state
 * helpers.
 *
 * These types used to live alongside a legacy fixed-wing shim class. With the
 * B1 cutover the shim is gone — `FixedWingModel` / `NPCFlightController` /
 * `flightTestScene` drive `Airframe` directly — but the control-law command
 * shape and the snapshot layout stay: control-law is the live translation from
 * pilot intent to command, and the snapshot is what the HUD / operation FSM /
 * derived control-phase code read. One `airframeStateToFixedWingSnapshot()`
 * helper is provided below so call sites produce snapshots the legacy
 * consumers already understand.
 */

import type { AirframeConfig, AirframeState } from './airframe/types';
import type { FixedWingPhysicsConfig } from './FixedWingConfigs';

export type FixedWingFlightPhase =
  | 'parked'
  | 'ground_roll'
  | 'rotation'
  | 'airborne'
  | 'stall'
  | 'landing_rollout';

export type FixedWingFlightState = 'grounded' | 'airborne' | 'stalled';

export interface FixedWingCommand {
  throttleTarget: number;
  pitchCommand: number;
  rollCommand: number;
  yawCommand: number;
  brake: number;
  freeLook: boolean;
  stabilityAssist: boolean;
}

export interface FixedWingFlightSnapshot {
  phase: FixedWingFlightPhase;
  airspeed: number;
  forwardAirspeed: number;
  verticalSpeed: number;
  altitude: number;
  altitudeAGL: number;
  aoaDeg: number;
  sideslipDeg: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  pitchRateDeg: number;
  rollRateDeg: number;
  throttle: number;
  brake: number;
  weightOnWheels: boolean;
  isStalled: boolean;
}

/**
 * Map an `AirframePhase` + weight-on-wheels flag to the legacy
 * `FixedWingFlightPhase` labels the rest of the fixed-wing codebase consumes
 * (HUD, operation FSM, derived control-phase). Direct 1:1 except that
 * `climb`/`cruise`/`approach` all collapse to `airborne` on the legacy side.
 */
function legacyPhaseFromAirframe(
  airframePhase: AirframeState['phase'],
  weightOnWheels: boolean,
): FixedWingFlightPhase {
  if (airframePhase === 'parked') return 'parked';
  if (airframePhase === 'stall') return 'stall';
  if (airframePhase === 'rotation') return 'rotation';
  if (airframePhase === 'taxi' || airframePhase === 'takeoff_roll') return 'ground_roll';
  if (airframePhase === 'rollout') return 'landing_rollout';
  if (airframePhase === 'approach') return 'airborne';
  // climb / cruise
  return weightOnWheels ? 'ground_roll' : 'airborne';
}

/**
 * Build a `FixedWingFlightSnapshot` from an `AirframeState`. Handles the field
 * renames (`forwardAirspeedMs` → `forwardAirspeed`, `verticalSpeedMs` →
 * `verticalSpeed`) and collapses the airframe phase label into the legacy
 * phase enum.
 */
export function airframeStateToFixedWingSnapshot(state: AirframeState): FixedWingFlightSnapshot {
  return {
    phase: legacyPhaseFromAirframe(state.phase, state.weightOnWheels),
    airspeed: state.airspeedMs,
    forwardAirspeed: state.forwardAirspeedMs,
    verticalSpeed: state.verticalSpeedMs,
    altitude: state.altitude,
    altitudeAGL: state.altitudeAGL,
    aoaDeg: state.aoaDeg,
    sideslipDeg: state.sideslipDeg,
    headingDeg: state.headingDeg,
    pitchDeg: state.pitchDeg,
    rollDeg: state.rollDeg,
    pitchRateDeg: state.pitchRateDeg,
    rollRateDeg: state.rollRateDeg,
    throttle: state.effectors.throttle,
    brake: state.effectors.brake,
    weightOnWheels: state.weightOnWheels,
    isStalled: state.isStalled,
  };
}

export function fixedWingFlightStateFromSnapshot(
  snapshot: FixedWingFlightSnapshot,
): FixedWingFlightState {
  if (snapshot.weightOnWheels) return 'grounded';
  return snapshot.isStalled ? 'stalled' : 'airborne';
}

/**
 * Translate a legacy `FixedWingPhysicsConfig` (the per-aircraft registry entry
 * in `FixedWingConfigs.ts`) into the unified `AirframeConfig` the new sim
 * consumes.
 *
 * This is the same translation the deleted fixed-wing shim used to perform
 * internally. It is kept here (not inlined at every call site) because both
 * `FixedWingModel` and `NPCFlightController` build Airframes from the legacy
 * config and must build them identically — that's the regression surface the
 * B1 integration tests protect.
 *
 * The feel scales (`rawPitchScale`, `rawRollScale`, `rawYawScale`) are
 * deliberately neutralized to 1.0. Legacy callers — `FixedWingModel`,
 * `NPCFlightController`, `flightTestScene`, and the integration tests — drive
 * the Airframe with command values that are already scaled to the final
 * surface-like range via `FixedWingControlLaw.buildFixedWingPilotCommand()`
 * (player) or direct gameplay code (NPC / harness). Leaving the raw-tier
 * scales at their defaults would double-apply them, shrinking effective
 * authority. The shim documented this at its deletion point.
 */
export function airframeConfigFromLegacy(cfg: FixedWingPhysicsConfig): AirframeConfig {
  return {
    id: 'legacy',
    mass: { kg: cfg.mass, wingAreaM2: cfg.wingArea },
    engine: {
      maxThrustN: cfg.maxThrust,
      throttleResponsePerSec: cfg.throttleResponse,
      staticThrustFloor: 0.3,
    },
    aero: {
      stallSpeedMs: cfg.stallSpeed,
      vrSpeedMs: cfg.vrSpeed,
      v2SpeedMs: cfg.v2Speed,
      maxSpeedMs: cfg.maxSpeed,
      cl0: cfg.cl0,
      clAlpha: cfg.clAlpha,
      clMax: cfg.clMax,
      alphaStallDeg: cfg.alphaStallDeg,
      alphaMaxDeg: cfg.alphaMaxDeg,
      cd0: cfg.cd0,
      inducedDragK: cfg.inducedDragK,
      sideForceCoefficient: cfg.sideForceCoefficient,
      trimAlphaDeg: cfg.trimAlphaDeg,
      groundEffectStrength: cfg.groundEffectStrength,
    },
    authority: {
      elevator: cfg.elevatorPower,
      aileron: cfg.aileronPower,
      rudder: cfg.rudderPower,
      maxPitchRate: cfg.maxPitchRate,
      maxRollRate: cfg.maxRollRate,
      maxYawRate: cfg.maxYawRate,
      controlResponsePerSec: cfg.controlResponse,
    },
    stability: {
      pitch: cfg.pitchStability,
      rollLevel: cfg.rollLevelStrength,
      yaw: cfg.yawStability,
      pitchDamp: cfg.pitchDamping,
      rollDamp: cfg.rollDamping,
      yawDamp: cfg.yawDamping,
    },
    ground: {
      gearClearanceM: cfg.gearClearance,
      liftoffClearanceM: cfg.liftoffClearance,
      steeringRadPerSec: cfg.groundSteering,
      lateralFriction: cfg.groundLateralFriction,
      rollingResistance: cfg.rollingResistance,
      brakeDecelMs2: cfg.brakeDeceleration,
      maxGroundPitchDeg: 6,
      rotationPitchLimitDeg: cfg.rotationPitchLimitDeg,
    },
    feel: {
      // Neutralized: the command builder / gameplay code already scales
      // stick-like values to the final surface range. See doc block above.
      rawPitchScale: 1.0,
      rawRollScale: 1.0,
      rawYawScale: 1.0,
      assistPitchP: 0.07,
      assistPitchD: 0.004,
      assistRollP: 0.04,
      assistRollD: 0.008,
      assistMaxBankDeg: 45,
      assistMaxPitchDeg: 25,
      coordYawScale: 0.15,
      autoLevelStrength: 0.8,
    },
  };
}
