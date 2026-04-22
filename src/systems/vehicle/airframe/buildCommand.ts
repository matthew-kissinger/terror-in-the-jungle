/**
 * Single translation from player intent + current state to control-surface
 * command. This is the ONLY file that knows about the two tiers. The sim is
 * oblivious to input source and tier.
 *
 * See docs/rearch/E6-vehicle-physics-design.md section 4.
 */

import * as THREE from 'three';
import type {
  AirframeCommand,
  AirframeConfig,
  AirframeIntent,
  AirframeState,
} from './types';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function buildAirframeCommand(
  intent: AirframeIntent,
  state: AirframeState,
  cfg: AirframeConfig,
): AirframeCommand {
  // Orbit hold is an alternate input source, not a separate sim mode.
  if (intent.orbit && !state.weightOnWheels) {
    return buildOrbitCommand(intent.orbit, state);
  }

  // Ground and raw tier both map stick → surface deflection directly.
  if (intent.tier === 'raw' || state.weightOnWheels) {
    return {
      elevator: clamp(intent.pitch * cfg.feel.rawPitchScale, -1, 1),
      aileron: clamp(intent.roll * cfg.feel.rawRollScale, -1, 1),
      rudder: clamp(intent.yaw * cfg.feel.rawYawScale, -1, 1),
      throttle: clamp(intent.throttle, 0, 1),
      brake: state.weightOnWheels ? clamp(intent.brake, 0, 1) : 0,
      assist: false,
    };
  }

  // Assist tier: stick sets attitude targets, PD converts error to command.
  const { feel } = cfg;
  const rollIntentActive = Math.abs(intent.roll) >= 0.05;
  const pitchIntentActive = Math.abs(intent.pitch) >= 0.05;

  let aileron = 0;
  if (rollIntentActive) {
    const targetBankDeg = intent.roll * feel.assistMaxBankDeg;
    const errDeg = state.rollDeg - targetBankDeg;
    aileron = clamp(errDeg * feel.assistRollP - state.rollRateDeg * feel.assistRollD, -1, 1);
  } else {
    // Autolevel — proportional to bank angle, capped so we don't overcorrect.
    aileron = clamp(state.rollDeg * feel.autoLevelStrength * 0.02, -0.4, 0.4);
  }

  let elevator = 0;
  if (pitchIntentActive) {
    const targetPitchDeg = intent.pitch * feel.assistMaxPitchDeg;
    const errDeg = targetPitchDeg - state.pitchDeg;
    elevator = clamp(errDeg * feel.assistPitchP - state.pitchRateDeg * feel.assistPitchD, -1, 1);
  }
  // Hands-off assist: leave the elevator at 0 here. Airframe.ts owns the
  // single altitude-hold PD that fires when the pitch stick is neutral in
  // assist tier; it overrides cmd.elevator with a captured-altitude PD
  // loop. Adding any cruise-hold term here would fight that PD.

  // Turn coordination: yaw added proportional to bank.
  const coordYaw = -clamp(state.rollDeg / 40, -1, 1) * feel.coordYawScale;
  const rudder = clamp(intent.yaw * feel.rawYawScale + coordYaw, -1, 1);

  return {
    elevator,
    aileron,
    rudder,
    throttle: clamp(intent.throttle, 0, 1),
    brake: 0,
    assist: true,
  };
}

function buildOrbitCommand(
  orbit: NonNullable<AirframeIntent['orbit']>,
  state: AirframeState,
): AirframeCommand {
  const dx = state.position.x - orbit.centerX;
  const dz = state.position.z - orbit.centerZ;
  const currentRadius = Math.max(Math.hypot(dx, dz), 1);
  const radiusErr = (currentRadius - orbit.radiusM) / orbit.radiusM;
  const speed = Math.max(state.airspeedMs, 1);
  const requiredBankDeg = THREE.MathUtils.radToDeg(
    Math.atan((speed * speed) / Math.max(orbit.radiusM * 9.81, 1)),
  );
  const nominalBankDeg = Math.max(orbit.bankDeg, requiredBankDeg);
  const targetBankDeg = clamp(
    (nominalBankDeg + clamp(radiusErr * 30, -8, 8)) * orbit.direction,
    -30,
    30,
  );
  const aileron = clamp((state.rollDeg - targetBankDeg) / 15, -1, 1);
  const elevator = clamp((1.5 - state.verticalSpeedMs) * 0.1, -0.15, 0.3);
  return {
    elevator,
    aileron,
    rudder: 0.2 * orbit.direction,
    throttle: 0.65,
    brake: 0,
    assist: true,
  };
}
