import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getWorldFeaturePrefab } from './WorldFeaturePrefabs';
import { GroundVehicleModels } from '../assets/modelPaths';
import type { MapFeatureDefinition, StaticModelPlacementConfig } from '../../config/gameModeTypes';

// Historical hull dimensions for the four ground vehicles that appear in
// the motor pool prefabs (length × width, metres). Sourced from the
// 2026-05-20 cycle brief; m48 width matches M48_HULL_DIMENSIONS.
const VEHICLE_HULLS: Record<string, { length: number; width: number }> = {
  [GroundVehicleModels.M35_TRUCK]: { length: 6.7, width: 2.4 },
  [GroundVehicleModels.M151_JEEP]: { length: 3.4, width: 1.6 },
  [GroundVehicleModels.M113_APC]: { length: 4.9, width: 2.7 },
  [GroundVehicleModels.M48_PATTON]: { length: 7.5, width: 3.6 },
};

const VEHICLE_PATHS = new Set(Object.keys(VEHICLE_HULLS));

interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function vehicleAabbAtYaw(placement: StaticModelPlacementConfig): AABB {
  const hull = VEHICLE_HULLS[placement.modelPath];
  if (!hull) {
    throw new Error(`No hull dimensions registered for ${placement.modelPath}`);
  }
  const halfLength = hull.length / 2;
  const halfWidth = hull.width / 2;
  const c = Math.abs(Math.cos(placement.yaw ?? 0));
  const s = Math.abs(Math.sin(placement.yaw ?? 0));
  // Length runs along the vehicle's local +Z axis (forward); rotating by
  // yaw produces an axis-aligned half-extent in world space.
  const halfExtentX = halfLength * s + halfWidth * c;
  const halfExtentZ = halfLength * c + halfWidth * s;
  return {
    minX: placement.offset.x - halfExtentX,
    maxX: placement.offset.x + halfExtentX,
    minZ: placement.offset.z - halfExtentZ,
    maxZ: placement.offset.z + halfExtentZ,
  };
}

function aabbClearance(a: AABB, b: AABB): number {
  // Positive separation along each axis; if either is positive the AABBs
  // do not overlap and clearance is the max gap. If both are negative
  // (overlap on both axes) clearance is negative.
  const gapX = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  const gapZ = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ);
  if (gapX >= 0 || gapZ >= 0) {
    return Math.max(gapX, gapZ);
  }
  // Overlapping on both axes — return negative penetration depth.
  return Math.max(gapX, gapZ);
}

function makeFeature(prefabId: string): MapFeatureDefinition {
  return {
    id: 'test_motor_pool',
    kind: 'firebase',
    position: new THREE.Vector3(),
    prefabId: prefabId as any,
  } as MapFeatureDefinition;
}

describe('motor_pool_heavy_of prefab', () => {
  const prefab = getWorldFeaturePrefab(makeFeature('motor_pool_heavy_of'));
  if (!prefab) {
    throw new Error('motor_pool_heavy_of prefab is missing');
  }
  const vehiclePlacements = prefab.placements.filter((p) => VEHICLE_PATHS.has(p.modelPath));

  it('does not place a dressing M48 (real Tank IVehicle owns this anchor)', () => {
    expect(vehiclePlacements.some((p) => p.modelPath === GroundVehicleModels.M48_PATTON)).toBe(false);
  });

  it('parks four-or-fewer distinct vehicle types with no duplicates', () => {
    const paths = vehiclePlacements.map((p) => p.modelPath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(vehiclePlacements.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps every vehicle pair ≥ 1.5 m apart at placement yaw', () => {
    const aabbs = vehiclePlacements.map((p) => ({ id: p.modelPath, box: vehicleAabbAtYaw(p) }));
    for (let i = 0; i < aabbs.length; i++) {
      for (let j = i + 1; j < aabbs.length; j++) {
        const clearance = aabbClearance(aabbs[i].box, aabbs[j].box);
        expect(
          clearance,
          `clearance between ${aabbs[i].id} and ${aabbs[j].id} should be ≥ 1.5 m, got ${clearance.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it('spreads vehicle yaws across at least 60° so the lot does not read as one rigid row', () => {
    const yaws = vehiclePlacements.map((p) => p.yaw ?? 0);
    const spread = Math.max(...yaws) - Math.min(...yaws);
    expect(spread).toBeGreaterThanOrEqual((Math.PI / 180) * 60);
  });

  it('keeps every placement inside the 36 m Open Frontier footprint radius', () => {
    for (const placement of prefab.placements) {
      const radius = Math.hypot(placement.offset.x, placement.offset.z);
      expect(
        radius,
        `${placement.modelPath} at offset (${placement.offset.x}, ${placement.offset.z}) sits ${radius.toFixed(2)} m from prefab center`,
      ).toBeLessThanOrEqual(36);
    }
  });

  it('moves crates off the parking strip so they no longer form a second row behind the vehicles', () => {
    const crateZs = prefab.placements
      .filter((p) => /AMMO_CRATE|SUPPLY_CRATE|FUEL_DRUM/.test(p.modelPath) || /crate|drum/i.test(p.modelPath))
      .map((p) => p.offset.z);
    // After the reflow the crates sit on the west flank (negative X, low |Z|),
    // not behind the vehicles at z ≈ 20. Assert no crate sits on the
    // parking strip alongside the vehicles.
    for (const z of crateZs) {
      expect(Math.abs(z)).toBeLessThan(15);
    }
  });
});

describe('motor_pool_heavy_ashau prefab', () => {
  const prefab = getWorldFeaturePrefab(makeFeature('motor_pool_heavy_ashau'));
  if (!prefab) {
    throw new Error('motor_pool_heavy_ashau prefab is missing');
  }

  it('preserves the dressing M48 Patton that A Shau Ta Bat owner-accepted in cycle-vekhikl-3', () => {
    expect(prefab.placements.some((p) => p.modelPath === GroundVehicleModels.M48_PATTON)).toBe(true);
  });

  it('keeps every placement inside the 34 m Ta Bat Armored Yard footprint radius', () => {
    for (const placement of prefab.placements) {
      const radius = Math.hypot(placement.offset.x, placement.offset.z);
      expect(
        radius,
        `${placement.modelPath} at offset (${placement.offset.x}, ${placement.offset.z}) sits ${radius.toFixed(2)} m from prefab center`,
      ).toBeLessThanOrEqual(34);
    }
  });
});
