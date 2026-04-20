import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { WaterSystem } from './WaterSystem';
import type { ISkyRuntime } from '../../types/SystemInterfaces';
import type { AssetLoader } from '../assets/AssetLoader';

// Avoid pulling in the Logger implementation (which writes to the console)
// during these small unit tests.
vi.mock('../../utils/Logger');

/**
 * Behavior tests for the water-sun wiring introduced in
 * `atmosphere-sun-hemisphere-coupling`. The stub `sun` vector on
 * `WaterSystem` was never updated before this task; once an
 * `ISkyRuntime` is bound, water reflections must track the atmosphere's
 * sun direction.
 *
 * We intentionally do NOT exercise `WaterSystem.init()` (which loads a
 * texture + constructs a Three.js Water shader against a jsdom WebGL
 * stub). The behavior under test is the sun-sync contract exposed via
 * `setAtmosphereSystem` and the private `sun` vector.
 */

function makeAtmosphere(dir: THREE.Vector3): ISkyRuntime {
  return {
    getSunDirection: (out) => out.copy(dir),
    getSunColor: (out) => out,
    getSkyColorAtDirection: (_d, out) => out,
    getZenithColor: (out) => out,
    getHorizonColor: (out) => out,
  };
}

function makeSystem(): WaterSystem {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  // AssetLoader is only consulted from `init()`, which we do not invoke here.
  const assetLoader = {} as unknown as AssetLoader;
  return new WaterSystem(scene, camera, assetLoader);
}

describe('WaterSystem sun direction from atmosphere', () => {
  it('copies the atmosphere sun direction into its internal sun vector on bind', () => {
    const system = makeSystem();
    const atmosphere = makeAtmosphere(new THREE.Vector3(1, 2, 3).normalize());

    system.setAtmosphereSystem(atmosphere);

    // `sun` is private; read via a typed cast purely for verification.
    const sun = (system as unknown as { sun: THREE.Vector3 }).sun;
    const expected = new THREE.Vector3(1, 2, 3).normalize();
    expect(sun.x).toBeCloseTo(expected.x, 5);
    expect(sun.y).toBeCloseTo(expected.y, 5);
    expect(sun.z).toBeCloseTo(expected.z, 5);
  });

  it('stores a unit-length sun vector even if the atmosphere returns an unnormalized direction', () => {
    const system = makeSystem();
    const atmosphere = makeAtmosphere(new THREE.Vector3(2, 0, 0));

    system.setAtmosphereSystem(atmosphere);

    const sun = (system as unknown as { sun: THREE.Vector3 }).sun;
    expect(sun.length()).toBeCloseTo(1, 5);
  });
});
