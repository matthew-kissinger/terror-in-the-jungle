// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  createAtmosphereScreenState,
  projectAtmosphereToScreen,
  type AtmosphereColorSource,
} from './AtmosphereScreenProjection';

function makeAtmosphere(sun: THREE.Vector3, horizon: THREE.Color): AtmosphereColorSource {
  return {
    getSunDirection: (out) => out.copy(sun),
    getHorizonColor: (out) => out.copy(horizon),
  };
}

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 10000);
  camera.position.set(0, 2, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * Behavior contract for the atmosphere screen projection. It is a pure CPU
 * helper, so the observable behavior is fully testable: the sun in front of the
 * camera projects on-screen with finite clamped UV; the sun behind the camera
 * (or below it) reads off-screen; and the live horizon colour is copied into the
 * state as the fog tint.
 */
describe('atmosphere screen projection', () => {
  it('projects a sun in front of the camera to on-screen UV', () => {
    const camera = makeCamera();
    // Camera looks down -Z by default; put the sun ahead and slightly up.
    const atmosphere = makeAtmosphere(new THREE.Vector3(0, 0.2, -1).normalize(), new THREE.Color(0.5, 0.6, 0.55));
    const state = projectAtmosphereToScreen(atmosphere, camera, createAtmosphereScreenState());

    expect(state.sunOnScreen).toBe(true);
    expect(state.sunScreenU).toBeGreaterThanOrEqual(0);
    expect(state.sunScreenU).toBeLessThanOrEqual(1);
    expect(state.sunScreenV).toBeGreaterThanOrEqual(0);
    expect(state.sunScreenV).toBeLessThanOrEqual(1);
  });

  it('reports the sun off-screen when it is behind the camera', () => {
    const camera = makeCamera();
    // Sun directly behind the camera (camera faces -Z, sun toward +Z).
    const atmosphere = makeAtmosphere(new THREE.Vector3(0, 0.1, 1).normalize(), new THREE.Color(0.4, 0.4, 0.4));
    const state = projectAtmosphereToScreen(atmosphere, camera, createAtmosphereScreenState());

    expect(state.sunOnScreen).toBe(false);
    // UV stays clamped/finite even when off-screen so the post graph never NaNs.
    expect(Number.isFinite(state.sunScreenU)).toBe(true);
    expect(Number.isFinite(state.sunScreenV)).toBe(true);
  });

  it('copies the live horizon colour into the fog tint', () => {
    const camera = makeCamera();
    const horizon = new THREE.Color(0.32, 0.41, 0.5);
    const atmosphere = makeAtmosphere(new THREE.Vector3(0, 1, 0), horizon);
    const state = projectAtmosphereToScreen(atmosphere, camera, createAtmosphereScreenState());

    expect(state.fogColor.r).toBeCloseTo(0.32, 5);
    expect(state.fogColor.g).toBeCloseTo(0.41, 5);
    expect(state.fogColor.b).toBeCloseTo(0.5, 5);
  });
});
