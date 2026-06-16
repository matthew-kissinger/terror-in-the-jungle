// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { updateDynamicGroundVehicleVisibility } from './GroundVehicleRenderOptimization';

const GROUND_VEHICLE_RENDER_RADIUS_KEY = 'groundVehicleRenderCullRadius';

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
  camera.position.set(0, 20, 0);
  camera.lookAt(0, 20, -100);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function makeVehicle(x: number, z: number, visible: boolean, radius = 0): THREE.Object3D {
  const object = new THREE.Object3D();
  object.position.set(x, 0, z);
  object.visible = visible;
  object.userData[GROUND_VEHICLE_RENDER_RADIUS_KEY] = radius;
  object.updateMatrixWorld(true);
  return object;
}

describe('GroundVehicleRenderOptimization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses squared distance and skips unchanged visible writes for close vehicles', () => {
    const camera = makeCamera();
    const object = makeVehicle(0, 0, true);
    let visible = true;
    let visibleWrites = 0;
    Object.defineProperty(object, 'visible', {
      configurable: true,
      get: () => visible,
      set: (value: boolean) => {
        visibleWrites++;
        visible = value;
      },
    });
    const hypot = vi.spyOn(Math, 'hypot');

    updateDynamicGroundVehicleVisibility([{ object, vehicleId: 'm35' }], camera, {
      renderDistanceM: 100,
      hysteresisM: 20,
      alwaysVisibleM: 50,
    });

    expect(hypot).not.toHaveBeenCalled();
    expect(visibleWrites).toBe(0);
    expect(object.visible).toBe(true);
  });

  it('preserves render-radius and hysteresis boundaries', () => {
    const camera = makeCamera();
    const object = makeVehicle(110, 0, false, 10);
    const entry = { object, vehicleId: 'm35' };
    const options = {
      renderDistanceM: 100,
      hysteresisM: 20,
      alwaysVisibleM: 200,
    };

    updateDynamicGroundVehicleVisibility([entry], camera, options);
    expect(object.visible).toBe(true);

    object.position.set(130, 0, 0);
    object.updateMatrixWorld(true);
    updateDynamicGroundVehicleVisibility([entry], camera, options);
    expect(object.visible).toBe(true);

    object.position.set(131, 0, 0);
    object.updateMatrixWorld(true);
    updateDynamicGroundVehicleVisibility([entry], camera, options);
    expect(object.visible).toBe(false);
  });

  it('still frustum-culls distant vehicles outside the view cone', () => {
    const camera = makeCamera();
    const object = makeVehicle(0, 100, true);

    updateDynamicGroundVehicleVisibility([{ object, vehicleId: 'm35' }], camera, {
      renderDistanceM: 500,
      hysteresisM: 0,
      alwaysVisibleM: 0,
    });

    expect(object.visible).toBe(false);
  });
});
