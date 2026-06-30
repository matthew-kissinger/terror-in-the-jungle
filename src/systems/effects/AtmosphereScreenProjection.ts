// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

/**
 * Projects the analytic sun direction and live horizon/fog colour into the
 * screen-space inputs the P6 post stack needs for atmospheric depth.
 *
 * NEW SIBLING module by design: `AtmosphereSystem.ts` (~698 LOC) is at/near the
 * source budget ceiling, so this screen-projection helper lives on its own
 * rather than growing the atmosphere god module (see brief P6b). It is a pure
 * CPU helper — it reads `AtmosphereSystem` getters and a camera, and writes the
 * scalar/vector uniform inputs the post pipeline feeds its TSL graph. It owns no
 * render pass and no TSL graph itself, so it is backend-agnostic by
 * construction (no WebGPU/WebGL coupling).
 *
 * The post stack uses the projected sun UV to bias atmospheric haze toward the
 * sun and the horizon colour as the fog tint, keeping the post-grade coherent
 * with the live time-of-day state (the `check:tod-coherence` gate).
 */

/** Minimal read surface the projection needs from the atmosphere system. */
export interface AtmosphereColorSource {
  getSunDirection(out: THREE.Vector3): THREE.Vector3;
  getHorizonColor(out: THREE.Color): THREE.Color;
}

export interface AtmosphereScreenState {
  /** Sun position in screen UV space (0-1). Clamped; see `sunOnScreen`. */
  sunScreenU: number;
  sunScreenV: number;
  /** True when the sun direction projects in front of the camera and on-screen. */
  sunOnScreen: boolean;
  /** Live horizon colour used as the atmospheric fog tint. */
  fogColor: THREE.Color;
}

export function createAtmosphereScreenState(): AtmosphereScreenState {
  return {
    sunScreenU: 0.5,
    sunScreenV: 0.5,
    sunOnScreen: false,
    fogColor: new THREE.Color(1, 1, 1),
  };
}

/**
 * Project the live sun direction to screen UV and copy the horizon colour into
 * `state`. Returns the same `state` for chaining. A point far along the sun
 * direction from the camera is projected through the camera; behind-camera or
 * off-screen projections set `sunOnScreen = false` and clamp the UV so the post
 * graph degrades gracefully (no NaN, no off-screen glow leak).
 */
export function projectAtmosphereToScreen(
  atmosphere: AtmosphereColorSource,
  camera: THREE.Camera,
  state: AtmosphereScreenState,
  scratchDir: THREE.Vector3 = _scratchDir,
  scratchPoint: THREE.Vector3 = _scratchPoint,
): AtmosphereScreenState {
  atmosphere.getSunDirection(scratchDir);
  atmosphere.getHorizonColor(state.fogColor);

  // A distant point along the sun direction, projected through the camera.
  scratchPoint.copy(camera.getWorldPosition(_scratchCamPos)).addScaledVector(scratchDir, SUN_PROJECTION_DISTANCE);
  scratchPoint.project(camera);

  // project() returns NDC in [-1,1] with z>1 when behind the near/far range.
  const onScreen =
    scratchPoint.z >= -1 &&
    scratchPoint.z <= 1 &&
    scratchPoint.x >= -1 &&
    scratchPoint.x <= 1 &&
    scratchPoint.y >= -1 &&
    scratchPoint.y <= 1;

  state.sunOnScreen = onScreen && Number.isFinite(scratchPoint.x) && Number.isFinite(scratchPoint.y);
  state.sunScreenU = clamp01(scratchPoint.x * 0.5 + 0.5);
  state.sunScreenV = clamp01(scratchPoint.y * 0.5 + 0.5);
  return state;
}

const SUN_PROJECTION_DISTANCE = 5000;

const _scratchDir = new THREE.Vector3();
const _scratchPoint = new THREE.Vector3();
const _scratchCamPos = new THREE.Vector3();

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
