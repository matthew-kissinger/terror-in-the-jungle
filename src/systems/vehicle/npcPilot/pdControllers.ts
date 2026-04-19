/**
 * PD controllers for the NPC fixed-wing pilot. Pure functions that take the
 * current observation and return clamped scalar inputs in the Airframe
 * intent convention (pitch/roll/yaw: -1..1; throttle: 0..1).
 *
 * Gains are deliberately conservative — a "stable but slow" pilot is far
 * more forgiving than an aggressive one that oscillates on authority bounds.
 */

import * as THREE from 'three';

const PITCH_OUT_LIMIT = 0.8;
const ROLL_OUT_LIMIT = 0.8;
const YAW_OUT_LIMIT = 0.5;

/** Pitch command from altitude error, damped by vs and pitch rate. */
export function altitudeHold(
  targetAltitudeAGLm: number,
  currentAltitudeAGLm: number,
  verticalSpeedMs: number,
  pitchRateDegPerSec: number,
): number {
  const altErr = targetAltitudeAGLm - currentAltitudeAGLm;
  const kpAlt = 0.003;
  const kdVs = 0.04;
  const kdPitchRate = 0.004;
  const raw = altErr * kpAlt - verticalSpeedMs * kdVs - pitchRateDegPerSec * kdPitchRate;
  return THREE.MathUtils.clamp(raw, -PITCH_OUT_LIMIT, PITCH_OUT_LIMIT);
}

/** Bank command to roll toward a desired heading. Positive output rolls right. */
export function headingHold(
  desiredHeadingDeg: number,
  currentHeadingDeg: number,
  rollDeg: number,
  rollRateDegPerSec: number,
): number {
  let err = desiredHeadingDeg - currentHeadingDeg;
  while (err > 180) err -= 360;
  while (err < -180) err += 360;

  const maxBankDeg = 30;
  const targetBankDeg = THREE.MathUtils.clamp(err * 0.35, -maxBankDeg, maxBankDeg);
  const bankErr = targetBankDeg - rollDeg;
  const kpBank = 0.04;
  const kdRate = 0.006;
  const raw = bankErr * kpBank - rollRateDegPerSec * kdRate;
  return THREE.MathUtils.clamp(raw, -ROLL_OUT_LIMIT, ROLL_OUT_LIMIT);
}

/** Small yaw proportional to bank so the aircraft doesn't skid through turns. */
export function coordinatedYaw(rollDeg: number): number {
  const coordYawScale = 0.01;
  return THREE.MathUtils.clamp(rollDeg * coordYawScale, -YAW_OUT_LIMIT, YAW_OUT_LIMIT);
}

/** Throttle servo on airspeed error, clamped to [idleFloor, 1]. */
export function airspeedHold(
  targetAirspeedMs: number,
  currentAirspeedMs: number,
  idleFloor = 0.35,
): number {
  const err = targetAirspeedMs - currentAirspeedMs;
  const kp = 0.03;
  return THREE.MathUtils.clamp(0.5 + err * kp, idleFloor, 1.0);
}

/** Desired heading in degrees (0..360) from a delta on the xz plane. */
export function headingToTargetDeg(dx: number, dz: number): number {
  // Airframe: heading 0 corresponds to forward = -Z. A delta of (0, -1)
  // (due north) should yield heading 0. heading = atan2(dx, -dz) * (180/PI).
  const rad = Math.atan2(dx, -dz);
  const deg = (rad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export function horizontalDistance(x: number, z: number, x0: number, z0: number): number {
  const dx = x - x0;
  const dz = z - z0;
  return Math.sqrt(dx * dx + dz * dz);
}
