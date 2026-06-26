// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { optimizeStaticModelDrawCalls } from '../assets/ModelDrawCallOptimizer';
import { GroundVehicleModels } from '../assets/modelPaths';
import { Logger } from '../../utils/Logger';

export const GROUND_VEHICLE_PERF_CATEGORY = 'ground_vehicles';

const GROUND_VEHICLE_OPTIMIZED_RESOURCE_KEY = 'groundVehicleOptimizedGeneratedResource';
const GROUND_VEHICLE_RENDER_RADIUS_KEY = 'groundVehicleRenderCullRadius';
const OPTIMIZABLE_DYNAMIC_GROUND_VEHICLES = new Set<string>([
  GroundVehicleModels.M151_JEEP,
  // Legacy + Kiln (kiln-war-2026-06) art paths both optimize — the placement
  // resolves to whichever the ?vehicleArt flag selects.
  GroundVehicleModels.M35_TRUCK,
  GroundVehicleModels.M35_DEUCE_A_HALF,
  GroundVehicleModels.M113_APC,
  GroundVehicleModels.M113_ARMORED_PERSONNEL_CARRIER,
  GroundVehicleModels.ZIL_157,
  GroundVehicleModels.ZIL_157_SIX_WHEEL,
]);
const _bounds = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _cameraInverse = new THREE.Matrix4();
const _viewProjection = new THREE.Matrix4();
const _frustum = new THREE.Frustum();

export function prepareDynamicGroundVehicleForRendering(object: THREE.Object3D, modelPath: string): void {
  object.userData.perfCategory = GROUND_VEHICLE_PERF_CATEGORY;
  object.updateMatrixWorld(true);
  _bounds.setFromObject(object).getSize(_size);
  object.userData[GROUND_VEHICLE_RENDER_RADIUS_KEY] = Math.max(_size.x, _size.z, 1) * 0.5;
  optimizeDynamicGroundVehicleDrawCalls(object, modelPath);
}

export function updateDynamicGroundVehicleVisibility(
  entries: ReadonlyArray<{ object: THREE.Object3D; vehicleId?: string }>,
  camera: THREE.Camera,
  options: { renderDistanceM: number; hysteresisM: number; alwaysVisibleM: number },
): void {
  camera.updateMatrixWorld(true);
  _cameraInverse.copy(camera.matrixWorld).invert();
  _viewProjection.multiplyMatrices(camera.projectionMatrix, _cameraInverse);
  _frustum.setFromProjectionMatrix(_viewProjection);

  const cameraX = camera.position.x;
  const cameraZ = camera.position.z;
  for (const entry of entries) {
    if (!entry.vehicleId) continue;
    const object = entry.object;
    object.getWorldPosition(_center);
    const radius = Number(object.userData[GROUND_VEHICLE_RENDER_RADIUS_KEY] ?? 0);
    const dx = _center.x - cameraX;
    const dz = _center.z - cameraZ;
    const limit = (object.visible ? options.renderDistanceM + options.hysteresisM : options.renderDistanceM) + radius;
    const limitSq = limit * limit;
    const distanceSq = dx * dx + dz * dz;
    const alwaysVisibleLimit = options.alwaysVisibleM + radius;
    const closeEnough = distanceSq <= alwaysVisibleLimit * alwaysVisibleLimit;
    let shouldBeVisible = distanceSq <= limitSq;
    if (shouldBeVisible && !closeEnough) {
      _sphere.center.copy(_center);
      _sphere.radius = radius;
      shouldBeVisible = _frustum.intersectsSphere(_sphere);
    }
    if (object.visible !== shouldBeVisible) {
      object.visible = shouldBeVisible;
    }
  }
}

export function optimizeDynamicGroundVehicleDrawCalls(object: THREE.Object3D, modelPath: string): void {
  if (!OPTIMIZABLE_DYNAMIC_GROUND_VEHICLES.has(modelPath)) {
    return;
  }

  try {
    const result = optimizeStaticModelDrawCalls(object, {
      batchNamePrefix: 'ground_vehicle',
      strategy: 'merge',
      minBucketSize: 1,
    });
    object.userData.groundVehicleDrawCallOptimization = result;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.generatedOptimizedMesh === true) {
        child.userData.perfCategory = GROUND_VEHICLE_PERF_CATEGORY;
        child.userData[GROUND_VEHICLE_OPTIMIZED_RESOURCE_KEY] = true;
      }
    });
  } catch (error) {
    Logger.warn('world', `Failed to optimize ground vehicle model ${modelPath}`, error);
  }
}

export function disposeGeneratedGroundVehicleResources(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || child.userData[GROUND_VEHICLE_OPTIMIZED_RESOURCE_KEY] !== true) {
      return;
    }
    child.geometry.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material.dispose();
    }
  });
}
