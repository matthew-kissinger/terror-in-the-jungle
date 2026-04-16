import * as THREE from 'three';
import type { FixedWingPhysicsConfig, FixedWingPilotProfile } from './FixedWingConfigs';
import type { FixedWingCommand, FixedWingFlightSnapshot } from './FixedWingPhysics';

export type FixedWingPilotMode = 'assisted' | 'direct_stick';

export type FixedWingControlPhase =
  | 'taxi'
  | 'takeoff_roll'
  | 'rotation'
  | 'initial_climb'
  | 'flight'
  | 'approach'
  | 'landing_rollout';

export interface FixedWingPilotIntent {
  throttleStep: number;
  throttleTarget: number;
  pitchIntent: number;
  bankIntent: number;
  yawIntent: number;
  brake: number;
  pilotMode: FixedWingPilotMode;
  assistEnabled: boolean;
  orbitHoldEnabled: boolean;
  orbitCenterX: number;
  orbitCenterZ: number;
  orbitRadius: number;
  orbitBankDeg: number;
  orbitTurnDirection: -1 | 1;
  directPitchInput: number;
  directRollInput: number;
  directYawInput: number;
}

interface FixedWingPilotCommandContext {
  positionX: number;
  positionZ: number;
}

interface PilotTuning {
  pitchScale: number;
  rollScale: number;
  yawScale: number;
  coordinatedYawScale: number;
  autoLevelStrength: number;
  gravityCompStrength: number;
  maxAssistBankDeg: number;
  maxAssistPitchDeg: number;
}

const CONTROL_PHASE_APPROACH_ALTITUDE = 120;
const CONTROL_PHASE_INITIAL_CLIMB_ALTITUDE = 50;
const CONTROL_PHASE_TAXI_SPEED = 6;

const PILOT_TUNING: Record<FixedWingPilotProfile, PilotTuning> = {
  trainer: {
    pitchScale: 0.85,
    rollScale: 0.75,
    yawScale: 0.45,
    coordinatedYawScale: 0.15,
    autoLevelStrength: 0.8,
    gravityCompStrength: 0.2,
    maxAssistBankDeg: 45,
    maxAssistPitchDeg: 25,
  },
  fast_jet: {
    pitchScale: 0.9,
    rollScale: 0.9,
    yawScale: 0.35,
    coordinatedYawScale: 0.12,
    autoLevelStrength: 0.7,
    gravityCompStrength: 0.15,
    maxAssistBankDeg: 55,
    maxAssistPitchDeg: 28,
  },
  gunship: {
    pitchScale: 0.7,
    rollScale: 0.55,
    yawScale: 0.4,
    coordinatedYawScale: 0.18,
    autoLevelStrength: 0.9,
    gravityCompStrength: 0.25,
    maxAssistBankDeg: 35,
    maxAssistPitchDeg: 20,
  },
};

export function createIdleFixedWingPilotIntent(): FixedWingPilotIntent {
  return {
    throttleStep: 0,
    throttleTarget: 0,
    pitchIntent: 0,
    bankIntent: 0,
    yawIntent: 0,
    brake: 0,
    pilotMode: 'assisted',
    assistEnabled: false,
    orbitHoldEnabled: false,
    orbitCenterX: 0,
    orbitCenterZ: 0,
    orbitRadius: 0,
    orbitBankDeg: 0,
    orbitTurnDirection: -1,
    directPitchInput: 0,
    directRollInput: 0,
    directYawInput: 0,
  };
}

export function deriveFixedWingControlPhase(
  snapshot: Pick<FixedWingFlightSnapshot, 'phase' | 'airspeed' | 'verticalSpeed' | 'altitudeAGL' | 'weightOnWheels'>,
  cfg: FixedWingPhysicsConfig,
): FixedWingControlPhase {
  if (snapshot.phase === 'landing_rollout') {
    return 'landing_rollout';
  }

  if (snapshot.weightOnWheels) {
    if (snapshot.airspeed <= Math.max(CONTROL_PHASE_TAXI_SPEED, cfg.vrSpeed * 0.2)) {
      return 'taxi';
    }
    if (snapshot.airspeed < cfg.vrSpeed * 0.9) {
      return 'takeoff_roll';
    }
    return 'rotation';
  }

  if (
    snapshot.altitudeAGL <= CONTROL_PHASE_APPROACH_ALTITUDE
    && snapshot.verticalSpeed < -4
    && snapshot.airspeed <= cfg.v2Speed * 1.3
  ) {
    return 'approach';
  }

  if (
    snapshot.altitudeAGL <= CONTROL_PHASE_INITIAL_CLIMB_ALTITUDE
    && snapshot.airspeed <= cfg.v2Speed * 1.15
  ) {
    return 'initial_climb';
  }

  return 'flight';
}

/**
 * Arcade-feel fixed-wing pilot command builder.
 *
 * Stick input maps directly to pitch/roll/yaw command scaled by per-profile authority.
 * When airborne with assist on, auto-level gently rolls toward zero, gravity
 * compensation nudges nose up if altitude is bleeding off, and turn coordination
 * adds yaw proportional to bank. Orbit hold keeps the command builder usable by
 * AC-47 gunship mode without routing players through it.
 *
 * Stall protection forces nose-down and level; the physics layer owns alpha
 * protection, ground stabilization, and liftoff gating.
 */
export function buildFixedWingPilotCommand(
  snapshot: FixedWingFlightSnapshot,
  cfg: FixedWingPhysicsConfig,
  pilotProfile: FixedWingPilotProfile,
  intent: FixedWingPilotIntent,
  context?: FixedWingPilotCommandContext,
): FixedWingCommand {
  const tuning = PILOT_TUNING[pilotProfile];
  const pitchInput = THREE.MathUtils.clamp(intent.pitchIntent, -1, 1);
  const rollInput = THREE.MathUtils.clamp(intent.bankIntent, -1, 1);
  const yawInput = THREE.MathUtils.clamp(intent.yawIntent, -1, 1);

  const orbitActive = Boolean(
    intent.orbitHoldEnabled
    && !snapshot.weightOnWheels
    && context
    && intent.orbitRadius > 1,
  );

  let pitchCommand = 0;
  let rollCommand = 0;
  let yawCommand = 0;

  if (orbitActive && context) {
    const deltaX = context.positionX - intent.orbitCenterX;
    const deltaZ = context.positionZ - intent.orbitCenterZ;
    const currentRadius = Math.max(Math.hypot(deltaX, deltaZ), 1);
    const radiusError = (currentRadius - intent.orbitRadius) / intent.orbitRadius;
    const turnSpeed = Math.max(snapshot.airspeed, snapshot.forwardAirspeed, 1);
    const requiredBankDeg = THREE.MathUtils.radToDeg(
      Math.atan((turnSpeed * turnSpeed) / Math.max(intent.orbitRadius * 9.81, 1)),
    );
    const nominalBankDeg = Math.max(intent.orbitBankDeg, requiredBankDeg);
    const bankCorrectionDeg = THREE.MathUtils.clamp(radiusError * 30, -8, 8);
    const targetBankDeg = THREE.MathUtils.clamp(
      (nominalBankDeg + bankCorrectionDeg) * intent.orbitTurnDirection,
      -30,
      30,
    );

    rollCommand = THREE.MathUtils.clamp((snapshot.rollDeg - targetBankDeg) / 12, -1, 1) * 0.8;
    rollCommand -= snapshot.rollRateDeg / 85;

    const climbBias = THREE.MathUtils.clamp((1.5 - snapshot.verticalSpeed) * 0.1, -0.15, 0.3);
    pitchCommand = climbBias - snapshot.pitchRateDeg / 60;

    yawCommand = intent.orbitTurnDirection * 0.2;
  } else {
    const mergedPitchInput = intent.pilotMode === 'direct_stick'
      ? THREE.MathUtils.clamp(pitchInput + intent.directPitchInput * 0.7, -1, 1)
      : pitchInput;
    const mergedRollInput = intent.pilotMode === 'direct_stick'
      ? THREE.MathUtils.clamp(rollInput + intent.directRollInput * 0.7, -1, 1)
      : rollInput;
    const mergedYawInput = intent.pilotMode === 'direct_stick'
      ? THREE.MathUtils.clamp(yawInput + intent.directYawInput * 0.7, -1, 1)
      : yawInput;

    yawCommand = mergedYawInput * tuning.yawScale;

    const rollIntentActive = Math.abs(mergedRollInput) >= 0.05;
    const pitchIntentActive = Math.abs(mergedPitchInput) >= 0.05;

    // Sign note: positive rollCommand drives rollDeg negative (Euler Z extraction
    // from local-axis roll). Bank target uses `(current - target)` for convergent
    // negative feedback. Pitch sign is opposite: positive pitchCommand raises pitchDeg.
    // Rate terms (rollRateDeg, pitchRateDeg) provide damping that cancels banking
    // momentum before the aircraft wraps through inverted.
    if (!snapshot.weightOnWheels && intent.assistEnabled) {
      // rollRateDeg has opposite sign to d(rollDeg)/dt because positive rollRate rotates
      // around local -Z axis which maps to negative Euler Z accumulation. Rate-damping
      // term subtracts rollRateDeg so D acts in the conventional PD sense.
      if (rollIntentActive) {
        const targetBankDeg = mergedRollInput * tuning.maxAssistBankDeg;
        const errorTerm = (snapshot.rollDeg - targetBankDeg) / 25;
        const rateTerm = -snapshot.rollRateDeg / 120;
        rollCommand = THREE.MathUtils.clamp(errorTerm + rateTerm, -1, 1) * tuning.rollScale;
      } else {
        const combined = (snapshot.rollDeg - snapshot.rollRateDeg * 0.25) / 50;
        rollCommand = THREE.MathUtils.clamp(combined, -0.4, 0.4) * tuning.autoLevelStrength;
      }

      if (pitchIntentActive) {
        const targetPitchDeg = mergedPitchInput * tuning.maxAssistPitchDeg;
        const errorTerm = (targetPitchDeg - snapshot.pitchDeg) / 14;
        const rateTerm = -snapshot.pitchRateDeg / 140;
        pitchCommand = THREE.MathUtils.clamp(errorTerm + rateTerm, -1, 1) * tuning.pitchScale;
      } else if (
        intent.throttleTarget > 0.2
        && snapshot.airspeed >= cfg.stallSpeed * 0.9
      ) {
        const altitudeLossRate = Math.max(0, -snapshot.verticalSpeed);
        pitchCommand = THREE.MathUtils.smoothstep(altitudeLossRate, 0, 6) * tuning.gravityCompStrength;
      }

      yawCommand -= THREE.MathUtils.clamp(snapshot.rollDeg / 40, -1, 1) * tuning.coordinatedYawScale;
    } else {
      pitchCommand = mergedPitchInput * tuning.pitchScale;
      // Positive stick must bank the aircraft in the same direction as the old
      // codebase's convention; sign of command is opposite to sign of resulting
      // rollDeg, so flip the input.
      rollCommand = -mergedRollInput * tuning.rollScale;
    }
  }

  if (snapshot.isStalled) {
    pitchCommand = Math.min(pitchCommand, -0.3);
    rollCommand *= 0.4;
    yawCommand = 0;
  }

  if (snapshot.weightOnWheels) {
    rollCommand = 0;
  }

  return {
    throttleTarget: THREE.MathUtils.clamp(intent.throttleTarget, 0, 1),
    pitchCommand: THREE.MathUtils.clamp(pitchCommand, -1, 1),
    rollCommand: THREE.MathUtils.clamp(rollCommand, -1, 1),
    yawCommand: THREE.MathUtils.clamp(yawCommand, -1, 1),
    brake: snapshot.weightOnWheels ? THREE.MathUtils.clamp(intent.brake, 0, 1) : 0,
    freeLook: false,
    stabilityAssist: intent.assistEnabled,
  };
}
