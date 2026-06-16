// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

export const TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS = 640;

const TERRAIN_SHADOW_BOUND_MOTION_MARGIN_METERS = 64;

export function computeTerrainShadowBoundRadius(light: THREE.DirectionalLight | null | undefined): number {
  if (!light) {
    return TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS;
  }
  const shadowCamera = light.shadow.camera;
  if (!(shadowCamera instanceof THREE.OrthographicCamera)) {
    return TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS;
  }

  const halfWidth = Math.abs(shadowCamera.right - shadowCamera.left) * 0.5;
  const halfHeight = Math.abs(shadowCamera.top - shadowCamera.bottom) * 0.5;
  const halfDiagonal = Math.hypot(halfWidth, halfHeight);
  const far = Math.max(0, shadowCamera.far);
  const target = light.target.position;
  const dx = light.position.x - target.x;
  const dy = light.position.y - target.y;
  const dz = light.position.z - target.z;
  const length = Math.hypot(dx, dy, dz);
  const horizontalFraction = length > 1e-5 ? Math.hypot(dx, dz) / length : 1;

  return Math.max(
    TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS,
    far * horizontalFraction + halfDiagonal + TERRAIN_SHADOW_BOUND_MOTION_MARGIN_METERS,
  );
}
