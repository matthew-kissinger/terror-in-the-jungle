/**
 * Shared fixture for air-support mission unit tests.
 *
 * The four mission update functions (napalm/spooky/rocket_run/recon) operate on
 * a plain `AirSupportMission` object plus injected dependencies. This factory
 * builds a mission in the same shape `AirSupportManager.spawnMission` produces:
 * an `active` mission with an empty `missionData` bag, ready to be passed to the
 * matching `init*` then `update*` function.
 *
 *   import { createAirSupportMission } from '../../test-utils/airSupportMission';
 *   const mission = createAirSupportMission('napalm', { x: 100, z: 100 });
 */
import * as THREE from 'three';
import type { AirSupportMission, AirSupportType } from '../systems/airsupport/AirSupportTypes';

export interface AirSupportMissionOverrides {
  /** Target world position (y defaults to 0). */
  x?: number;
  z?: number;
  /** Approach direction (normalized by the factory). Defaults to +Z (south->north). */
  approach?: THREE.Vector3;
}

export function createAirSupportMission(
  type: AirSupportType,
  overrides: AirSupportMissionOverrides = {},
): AirSupportMission {
  const x = overrides.x ?? 0;
  const z = overrides.z ?? 0;
  const approach = (overrides.approach ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
  return {
    id: `test_${type}`,
    type,
    aircraft: new THREE.Group(),
    state: 'active',
    elapsed: 0,
    duration: 30,
    targetPosition: new THREE.Vector3(x, 0, z),
    approachDirection: approach,
    missionData: {},
  };
}

/**
 * A flat-ground terrain height probe (always returns the same height, default 0).
 * Mission code calls this as `getTerrainHeight(x, z)`.
 */
export function flatTerrainHeight(height = 0): (x: number, z: number) => number {
  return () => height;
}
