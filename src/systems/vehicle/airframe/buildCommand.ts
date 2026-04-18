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
  } else {
    // Hands-off in assist: hold altitude by damping vertical speed toward 0.
    // Neutral stick means "hold altitude" to the player, so the sim injects
    // elevator proportional to verticalSpeedMs in addition to the pitch-
    // toward-trim term. No toggle, no mode — this is part of the assist
    // tier contract.
    // Cruise hold: neutral stick in assist means "maintain present
    // altitude." Damp vertical speed and keep pitch near trim; gains are
    // deliberately conservative to avoid phase-lagged oscillation.
    const pitchErrDeg = cfg.aero.trimAlphaDeg - state.pitchDeg;
    const vsTermDeg = -state.verticalSpeedMs * 2.0;
    elevator = clamp(
      pitchErrDeg * feel.assistPitchP * 0.25
        + vsTermDeg * feel.assistPitchP * 0.4
        - state.pitchRateDeg * feel.assistPitchD * 3,
      -0.25,
      0.25,
    );
  }

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
