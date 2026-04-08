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

interface PilotAssistEnvelope {
  maxBankDeg: number;
  maxPitchDeg: number;
  rotationPitchDeg: number;
  climbTrimPitchDeg: number;
  climbPitchAuthorityDeg: number;
  approachPitchBiasDeg: number;
  pitchErrorForFullCommandDeg: number;
  bankErrorForFullCommandDeg: number;
  directPitchScale: number;
  directRollScale: number;
  directYawScale: number;
  coordinatedYawScale: number;
  pitchCommandGain: number;
  rollCommandGain: number;
  initialClimbPitchFloor: number;
  pitchRateDampingDegPerSec: number;
  rollRateDampingDegPerSec: number;
}

const CONTROL_PHASE_APPROACH_ALTITUDE = 120;
const CONTROL_PHASE_INITIAL_CLIMB_ALTITUDE = 50;
const CONTROL_PHASE_TAXI_SPEED = 6;

const PROFILE_ENVELOPES: Record<FixedWingPilotProfile, PilotAssistEnvelope> = {
  trainer: {
    maxBankDeg: 25,
    maxPitchDeg: 10,
    rotationPitchDeg: 8,
    climbTrimPitchDeg: 6.5,
    climbPitchAuthorityDeg: 1.2,
    approachPitchBiasDeg: -2,
    pitchErrorForFullCommandDeg: 7,
    bankErrorForFullCommandDeg: 16,
    directPitchScale: 0.35,
    directRollScale: 0.4,
    directYawScale: 0.2,
    coordinatedYawScale: 0.18,
    pitchCommandGain: 1.0,
    rollCommandGain: 0.7,
    initialClimbPitchFloor: 0.18,
    pitchRateDampingDegPerSec: 36,
    rollRateDampingDegPerSec: 65,
  },
  fast_jet: {
    maxBankDeg: 18,
    maxPitchDeg: 6,
    rotationPitchDeg: 6,
    climbTrimPitchDeg: 4.5,
    climbPitchAuthorityDeg: 0.8,
    approachPitchBiasDeg: -1.5,
    pitchErrorForFullCommandDeg: 6,
    bankErrorForFullCommandDeg: 18,
    directPitchScale: 0.5,
    directRollScale: 0.6,
    directYawScale: 0.22,
    coordinatedYawScale: 0.14,
    pitchCommandGain: 0.55,
    rollCommandGain: 0.08,
    initialClimbPitchFloor: 0.18,
    pitchRateDampingDegPerSec: 42,
    rollRateDampingDegPerSec: 85,
  },
  gunship: {
    maxBankDeg: 28,
    maxPitchDeg: 8,
    rotationPitchDeg: 6,
    climbTrimPitchDeg: 5,
    climbPitchAuthorityDeg: 3,
    approachPitchBiasDeg: -2,
    pitchErrorForFullCommandDeg: 7,
    bankErrorForFullCommandDeg: 18,
    directPitchScale: 0.3,
    directRollScale: 0.35,
    directYawScale: 0.2,
    coordinatedYawScale: 0.12,
    pitchCommandGain: 0.95,
    rollCommandGain: 0.55,
    initialClimbPitchFloor: 0.2,
    pitchRateDampingDegPerSec: 38,
    rollRateDampingDegPerSec: 70,
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

export function buildFixedWingPilotCommand(
  snapshot: FixedWingFlightSnapshot,
  cfg: FixedWingPhysicsConfig,
  pilotProfile: FixedWingPilotProfile,
  intent: FixedWingPilotIntent,
  context?: FixedWingPilotCommandContext,
): FixedWingCommand {
  const phase = deriveFixedWingControlPhase(snapshot, cfg);
  const envelope = PROFILE_ENVELOPES[pilotProfile];
  const pitchIntent = THREE.MathUtils.clamp(intent.pitchIntent, -1, 1);
  const bankIntent = THREE.MathUtils.clamp(intent.bankIntent, -1, 1);
  const yawIntent = THREE.MathUtils.clamp(intent.yawIntent, -1, 1);

  let targetPitchDeg = 0;
  let targetBankDeg = 0;
  let yawCommand = 0;
  const orbitHoldActive = intent.orbitHoldEnabled
    && !snapshot.weightOnWheels
    && context
    && intent.orbitRadius > 1;

  if (orbitHoldActive) {
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
    targetBankDeg = nominalBankDeg * intent.orbitTurnDirection + bankCorrectionDeg * intent.orbitTurnDirection;
    targetBankDeg = THREE.MathUtils.clamp(targetBankDeg, -envelope.maxBankDeg, envelope.maxBankDeg);
    targetPitchDeg = THREE.MathUtils.clamp(
      envelope.climbTrimPitchDeg * 0.45 + THREE.MathUtils.clamp((1.5 - snapshot.verticalSpeed) * 0.6, -2, 2),
      -4,
      envelope.maxPitchDeg * 0.7,
    );
    yawCommand = intent.orbitTurnDirection * 0.22;
  } else {
    switch (phase) {
    case 'taxi':
      yawCommand = yawIntent;
      break;
    case 'takeoff_roll':
      yawCommand = yawIntent;
      break;
    case 'rotation':
      targetPitchDeg = pitchIntent > 0.08
        ? envelope.rotationPitchDeg * Math.max(pitchIntent, 0.5)
        : envelope.climbTrimPitchDeg;
      yawCommand = yawIntent * 0.7;
      break;
    case 'initial_climb':
      targetPitchDeg = envelope.climbTrimPitchDeg + pitchIntent * envelope.climbPitchAuthorityDeg;
      targetPitchDeg += THREE.MathUtils.clamp((6 - snapshot.verticalSpeed) * 0.3, 0, 2.5);
      targetBankDeg = bankIntent * Math.min(envelope.maxBankDeg, 20);
      yawCommand = yawIntent * 0.4;
      break;
    case 'approach':
      targetPitchDeg = envelope.approachPitchBiasDeg + pitchIntent * (envelope.maxPitchDeg * 0.45);
      targetBankDeg = bankIntent * Math.min(envelope.maxBankDeg, 18);
      yawCommand = yawIntent * 0.55;
      break;
    case 'landing_rollout':
      yawCommand = yawIntent;
      break;
    case 'flight':
    default:
      targetPitchDeg = pitchIntent * (intent.assistEnabled ? envelope.maxPitchDeg * 0.6 : envelope.maxPitchDeg);
      targetBankDeg = bankIntent * envelope.maxBankDeg;
      yawCommand = yawIntent * 0.55;
      break;
    }
  }

  if (snapshot.isStalled) {
    targetPitchDeg = Math.min(targetPitchDeg, -4);
    targetBankDeg = THREE.MathUtils.clamp(targetBankDeg, -10, 10);
    yawCommand = 0;
  }

  if (!snapshot.weightOnWheels && intent.assistEnabled && !orbitHoldActive) {
    yawCommand += THREE.MathUtils.clamp(targetBankDeg / Math.max(envelope.maxBankDeg, 1), -1, 1) * envelope.coordinatedYawScale;
  }

  let pitchCommand = THREE.MathUtils.clamp(
    (targetPitchDeg - snapshot.pitchDeg) / envelope.pitchErrorForFullCommandDeg,
    -1,
    1,
  ) * envelope.pitchCommandGain;
  let rollCommand = THREE.MathUtils.clamp(
    (snapshot.rollDeg - targetBankDeg) / envelope.bankErrorForFullCommandDeg,
    -1,
    1,
  ) * envelope.rollCommandGain;

  pitchCommand -= snapshot.pitchRateDeg / envelope.pitchRateDampingDegPerSec;
  rollCommand -= snapshot.rollRateDeg / envelope.rollRateDampingDegPerSec;

  if (intent.pilotMode === 'direct_stick') {
    pitchCommand += THREE.MathUtils.clamp(intent.directPitchInput, -1, 1) * envelope.directPitchScale;
    rollCommand += THREE.MathUtils.clamp(intent.directRollInput, -1, 1) * envelope.directRollScale;
    yawCommand += THREE.MathUtils.clamp(intent.directYawInput, -1, 1) * envelope.directYawScale;
  }

  if (snapshot.weightOnWheels) {
    rollCommand = 0;
  }

  if (phase === 'rotation' && pitchIntent > 0.08) {
    pitchCommand = Math.max(pitchCommand, 0.85);
  }

  if (phase === 'initial_climb' && pitchIntent > 0.08) {
    pitchCommand = Math.max(pitchCommand, envelope.initialClimbPitchFloor);
  }

  if (phase === 'initial_climb' && snapshot.altitudeAGL < 8 && snapshot.verticalSpeed < 2) {
    pitchCommand = Math.max(pitchCommand, 0.4);
  }

  if (phase === 'initial_climb' && snapshot.altitudeAGL < 6 && snapshot.airspeed < cfg.v2Speed) {
    pitchCommand = Math.max(pitchCommand, 0.72);
  }

  if (!snapshot.weightOnWheels && intent.assistEnabled && Math.abs(bankIntent) < 0.05 && !orbitHoldActive) {
    const levelRollCommand = THREE.MathUtils.clamp(snapshot.rollDeg / 18, -1, 1) * 0.65;
    rollCommand += levelRollCommand;
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
