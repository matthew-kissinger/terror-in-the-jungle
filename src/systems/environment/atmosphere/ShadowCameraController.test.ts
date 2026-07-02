// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ShadowCameraController } from './ShadowCameraController';
import { ShadowTruthConfig } from './ShadowTruthConfig';

/**
 * Behavior contract for the shadow-camera controller (`shadow-single-map-truth`).
 * We assert observable outcomes on the light's shadow camera: the ground under
 * the player ends up inside the depth column when the fix is ON, and flipping the
 * kill-switch OFF restores the exact legacy box.
 */

const LIGHT_DISTANCE = 500;

function makeLight(): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight();
  // Legacy fixed box: far 300 (inside the 500m light distance — the bug), no bias.
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 300;
  light.shadow.camera.left = -70;
  light.shadow.camera.right = 70;
  light.shadow.camera.top = 70;
  light.shadow.camera.bottom = -70;
  light.shadow.bias = 0;
  light.shadow.normalBias = 0;
  light.shadow.mapSize.set(2048, 2048);
  return light;
}

describe('ShadowCameraController', () => {
  const cameraTruthDefault = ShadowTruthConfig.cameraTruth;

  beforeEach(() => {
    ShadowTruthConfig.cameraTruth = true;
  });
  afterEach(() => {
    ShadowTruthConfig.cameraTruth = cameraTruthDefault;
  });

  it('places the light on the follow origin at the sun-direction offset', () => {
    const controller = new ShadowCameraController();
    const light = makeLight();
    const follow = new THREE.Object3D();
    follow.position.set(100, 20, -50);
    // High sun: offset points nearly straight up.
    const offset = new THREE.Vector3(0, 1, 0).multiplyScalar(LIGHT_DISTANCE);

    controller.placeAndFit(light, { offset, followTarget: follow, lightDistance: LIGHT_DISTANCE, devLog: false });

    // Light sits at target + offset; target sits on the follow origin.
    expect(light.position.y).toBeCloseTo(20 + LIGHT_DISTANCE, 3);
    expect(light.target.position.x).toBeCloseTo(100, 3);
    expect(light.target.position.z).toBeCloseTo(-50, 3);
  });

  it('fixes the legacy far-plane bug: the ground under the player lands inside the depth column', () => {
    const controller = new ShadowCameraController();
    const light = makeLight();
    const offset = new THREE.Vector3(0, 1, 0).multiplyScalar(LIGHT_DISTANCE);

    controller.placeAndFit(light, { offset, lightDistance: LIGHT_DISTANCE, devLog: false });

    // The target plane is LIGHT_DISTANCE from the light — must be inside [near, far].
    expect(light.shadow.camera.near).toBeLessThan(LIGHT_DISTANCE);
    expect(light.shadow.camera.far).toBeGreaterThan(LIGHT_DISTANCE);
    // And the legacy far=300 (inside the light distance) is gone.
    expect(light.shadow.camera.far).toBeGreaterThan(300);
  });

  it('applies a non-zero bias at grazing sun to clear acne', () => {
    const controller = new ShadowCameraController();
    const light = makeLight();
    // Shallow sun: mostly horizontal offset, small +Y.
    const offset = new THREE.Vector3(0.98, 0.2, 0).normalize().multiplyScalar(LIGHT_DISTANCE);

    controller.placeAndFit(light, { offset, lightDistance: LIGHT_DISTANCE, devLog: false });

    expect(light.shadow.bias).not.toBe(0);
    expect(light.shadow.normalBias).toBeGreaterThan(0);
  });

  it('restores the exact legacy box when the cameraTruth kill-switch flips OFF', () => {
    const controller = new ShadowCameraController();
    const light = makeLight();
    const offset = new THREE.Vector3(0, 1, 0).multiplyScalar(LIGHT_DISTANCE);

    // First frame ON captures the legacy config and applies the fit.
    controller.placeAndFit(light, { offset: offset.clone(), lightDistance: LIGHT_DISTANCE, devLog: false });
    expect(controller.getFit()).not.toBeNull();

    // Flip OFF: next frame restores the legacy box exactly.
    ShadowTruthConfig.cameraTruth = false;
    controller.placeAndFit(light, { offset: offset.clone(), lightDistance: LIGHT_DISTANCE, devLog: false });

    expect(light.shadow.camera.far).toBe(300);
    expect(light.shadow.camera.near).toBe(0.5);
    expect(light.shadow.bias).toBe(0);
    expect(light.shadow.normalBias).toBe(0);
    expect(controller.getFit()).toBeNull();
  });
});
