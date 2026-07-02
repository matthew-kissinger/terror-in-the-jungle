// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

/**
 * Shared ground-vehicle physics math. Both the wheeled (`GroundVehiclePhysics`)
 * and tracked (`TrackedVehiclePhysics`) chassis consume the same terrain
 * contract and conform their attitude the same way, so the slope-gate
 * conversion and the heading-hold conform quaternion live here rather than
 * being copied into each integrator.
 */

const _conformQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _yawAxis = new THREE.Vector3(0, 1, 0);
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Drive-authority scale for a slope. `slopeDeficit` is the runtime
 * `ITerrainRuntime.getSlopeAt` value (0..1, `1 - normal.y`), NOT an angle;
 * `maxClimbSlope` is a true surface angle in radians. Converts the deficit to
 * an angle (`acos(1 - deficit)`), then fades drive from 1 down to
 * `slopeDriveFloor` as the angle approaches the ceiling and to 0 at/above it.
 */
export function slopeDriveFactor(
  slopeDeficit: number,
  maxClimbSlope: number,
  slopeDriveFloor: number,
): number {
  const slopeAngle = Math.acos(THREE.MathUtils.clamp(1 - slopeDeficit, -1, 1));
  if (slopeAngle <= 0 || maxClimbSlope <= 0) return 1;
  if (slopeAngle >= maxClimbSlope) return 0;
  return Math.max(
    THREE.MathUtils.clamp(slopeDriveFloor, 0, 1),
    THREE.MathUtils.clamp(1 - slopeAngle / maxClimbSlope, 0, 1),
  );
}

/**
 * Write the chassis pose into `out` from the persisted `heading`, keeping the
 * heading exact and smoothing only the tilt so a cross-slope chassis holds its
 * pointing instead of weathervaning (the euler-YXZ re-extraction defect this
 * whole module exists to avoid). `smoothedNormal` is mutated in place.
 *
 *   - Grounded: advance the smoothed ground normal one fixed step (exponential
 *     lerp toward `sampledNormal`, time constant `conformTau`; `<= 0` hard-snaps)
 *     and compose `tilt * Ry(heading)`.
 *   - Airborne: `Ry(heading)` with no tilt, and relax `smoothedNormal` back to
 *     world-up so the next grounded conform starts upright.
 */
export function conformOrHoldPose(
  out: THREE.Quaternion,
  grounded: boolean,
  heading: number,
  sampledNormal: THREE.Vector3,
  smoothedNormal: THREE.Vector3,
  conformTau: number,
  deltaTime: number,
): void {
  _yawQuat.setFromAxisAngle(_yawAxis, heading);
  if (!grounded) {
    smoothedNormal.copy(_worldUp);
    out.copy(_yawQuat).normalize();
    return;
  }
  const blend = conformTau > 0 ? Math.min(deltaTime / conformTau, 1) : 1;
  smoothedNormal.lerp(sampledNormal, blend);
  if (smoothedNormal.lengthSq() < 1e-6) smoothedNormal.copy(_worldUp);
  else smoothedNormal.normalize();
  _conformQuat.setFromUnitVectors(_worldUp, smoothedNormal);
  out.multiplyQuaternions(_conformQuat, _yawQuat).normalize();
}
