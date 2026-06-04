// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { PlayerState } from '../../../types';

// Scratch vectors local to the steep-terrain-flow resolution. These were
// previously module-level scratch in PlayerMovement; they are read and
// written only within `applySteepTerrainFlow` in a single synchronous call,
// so isolating them here keeps the per-frame math byte-identical while
// removing them from the PlayerMovement facade.
const _uphillDirection = new THREE.Vector3();
const _terrainFlowDirection = new THREE.Vector3();
const _terrainFlowTargetVelocity = new THREE.Vector3();
const _contourA = new THREE.Vector3();
const _contourB = new THREE.Vector3();
const _horizontalVelocity = new THREE.Vector3();

// Steep-terrain contour-flow tuning. Mirrors the values that lived in
// PlayerMovement before the split — do not change without re-verifying the
// player-leap / steep-uphill regression tests.
export const PLAYER_STEEP_FLOW_SPEED_FACTOR = 0.82;
export const PLAYER_STEEP_FLOW_MIN_SPEED = 1.4;
export const PLAYER_STEEP_FLOW_LERP = 0.58;

export interface SteepTerrainFlowParams {
  playerState: PlayerState;
  newPosition: THREE.Vector3;
  targetSupportNormal: THREE.Vector3;
  requestedMoveX: number;
  requestedMoveZ: number;
  deltaTime: number;
}

/**
 * Redirect blocked steep-uphill movement along the terrain contour instead of
 * stalling the player at a wall. Mutates `playerState.velocity` (x/z) and
 * `newPosition` (x/z) in place and returns whether the flow consumed the
 * movement (i.e. the player should be treated as blocked-but-sliding).
 *
 * Extracted verbatim from `PlayerMovement.applySteepTerrainFlow`; the
 * ordering, branch structure, and scalar math are unchanged so per-frame
 * behavior and determinism are preserved.
 */
export function applySteepTerrainFlow({
  playerState,
  newPosition,
  targetSupportNormal,
  requestedMoveX,
  requestedMoveZ,
  deltaTime,
}: SteepTerrainFlowParams): boolean {
  const downhillLength = Math.hypot(targetSupportNormal.x, targetSupportNormal.z);
  if (downhillLength <= 0.001) {
    return false;
  }

  _uphillDirection.set(
    -targetSupportNormal.x / downhillLength,
    0,
    -targetSupportNormal.z / downhillLength,
  );

  const desiredDirection = _terrainFlowDirection.set(
    requestedMoveX !== 0 || requestedMoveZ !== 0 ? requestedMoveX : playerState.velocity.x,
    0,
    requestedMoveX !== 0 || requestedMoveZ !== 0 ? requestedMoveZ : playerState.velocity.z,
  );
  if (desiredDirection.lengthSq() <= 0.0001) {
    return false;
  }

  desiredDirection.projectOnPlane(targetSupportNormal);
  desiredDirection.y = 0;

  const uphillDot = downhillLength > 0.001 ? desiredDirection.dot(_uphillDirection) : 0;
  if (uphillDot > 0) {
    desiredDirection.addScaledVector(_uphillDirection, -uphillDot);
  }

  if (desiredDirection.lengthSq() <= 0.0001) {
    _contourA.set(-_uphillDirection.z, 0, _uphillDirection.x);
    _contourB.set(_uphillDirection.z, 0, -_uphillDirection.x);
    const contourAAlignment = _contourA.dot(_horizontalVelocity.set(playerState.velocity.x, 0, playerState.velocity.z));
    const contourBAlignment = _contourB.dot(_horizontalVelocity);
    desiredDirection.copy(contourAAlignment >= contourBAlignment ? _contourA : _contourB);
  }

  desiredDirection.normalize();

  const currentSpeed = Math.hypot(playerState.velocity.x, playerState.velocity.z);
  const flowedSpeed = Math.max(PLAYER_STEEP_FLOW_MIN_SPEED, currentSpeed * PLAYER_STEEP_FLOW_SPEED_FACTOR);
  const targetVelocity = _terrainFlowTargetVelocity.copy(desiredDirection).multiplyScalar(flowedSpeed);
  playerState.velocity.x = THREE.MathUtils.lerp(
    playerState.velocity.x,
    targetVelocity.x,
    PLAYER_STEEP_FLOW_LERP,
  );
  playerState.velocity.z = THREE.MathUtils.lerp(
    playerState.velocity.z,
    targetVelocity.z,
    PLAYER_STEEP_FLOW_LERP,
  );
  newPosition.x = playerState.position.x + playerState.velocity.x * deltaTime;
  newPosition.z = playerState.position.z + playerState.velocity.z * deltaTime;
  return true;
}
