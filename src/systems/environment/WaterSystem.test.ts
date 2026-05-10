import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { WaterSystem } from './WaterSystem';
import type { ISkyRuntime } from '../../types/SystemInterfaces';
import type { AssetLoader } from '../assets/AssetLoader';
import type { HydrologyBakeArtifact } from '../terrain/hydrology/HydrologyBake';

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
 * Most tests intentionally do NOT exercise `WaterSystem.init()` because it
 * loads textures and touches the DOM overlay. The behavior under test is the
 * sun-sync contract exposed via `setAtmosphereSystem`, the private `sun`
 * vector, and the standard-material water control surface.
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

function makeSystemWithScene(): { scene: THREE.Scene; system: WaterSystem } {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  // AssetLoader is only consulted from `init()`, which we do not invoke here.
  const assetLoader = {} as unknown as AssetLoader;
  return { scene, system: new WaterSystem(scene, camera, assetLoader) };
}

function makeSystem(): WaterSystem {
  return makeSystemWithScene().system;
}

function makeHydrologyArtifact(): HydrologyBakeArtifact {
  return {
    schemaVersion: 1,
    width: 2,
    height: 2,
    cellSizeMeters: 10,
    depressionHandling: 'epsilon-fill',
    transform: {
      originX: 0,
      originZ: 0,
      cellSizeMeters: 10,
    },
    thresholds: {
      accumulationP90Cells: 2,
      accumulationP95Cells: 4,
      accumulationP98Cells: 8,
      accumulationP99Cells: 16,
    },
    masks: {
      wetCandidateCells: [1],
      channelCandidateCells: [1],
    },
    channelPolylines: [
      {
        headCell: 0,
        outletCell: 1,
        lengthCells: 2,
        lengthMeters: 20,
        maxAccumulationCells: 16,
        points: [
          { cell: 0, x: -5, z: 0, elevationMeters: 2, accumulationCells: 8 },
          { cell: 1, x: 15, z: 0, elevationMeters: 1, accumulationCells: 16 },
        ],
      },
    ],
  };
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

  it('disabled water does not report underwater positions', () => {
    const system = makeSystem();

    system.setEnabled(false);

    expect(system.isEnabled()).toBe(false);
    expect(system.isUnderwater(new THREE.Vector3(0, -10, 0))).toBe(false);
    expect(system.getWaterSurfaceY(new THREE.Vector3(0, -10, 0))).toBeNull();
    expect(system.getWaterDepth(new THREE.Vector3(0, -10, 0))).toBe(0);
    expect(system.getDebugInfo().cameraUnderwater).toBe(false);
  });

  it('reports global water surface and depth while the global plane is active', () => {
    const system = makeSystem();

    expect(system.getWaterSurfaceY(new THREE.Vector3(45, 12, -20))).toBe(0);
    expect(system.getWaterDepth(new THREE.Vector3(45, -2.5, -20))).toBeCloseTo(2.5, 5);
    expect(system.isUnderwater(new THREE.Vector3(45, -0.25, -20))).toBe(true);
    expect(system.isUnderwater(new THREE.Vector3(45, 0.25, -20))).toBe(false);
  });

  it('disabling water clears an active underwater state', () => {
    const system = makeSystem();
    const weather = { setUnderwater: vi.fn() };
    system.setWeatherSystem(weather as any);
    (system as unknown as { wasUnderwater: boolean }).wasUnderwater = true;

    system.setEnabled(false);

    expect(weather.setUnderwater).toHaveBeenCalledWith(false);
  });

  it('renders hydrology river surfaces independently of the global water plane toggle', () => {
    const { scene, system } = makeSystemWithScene();

    system.setHydrologyChannels(makeHydrologyArtifact());
    system.setEnabled(false);

    const info = system.getDebugInfo();
    expect(info.enabled).toBe(false);
    expect(info.hydrologyRiverMaterialProfile).toBe('natural_channel_gradient');
    expect(info.hydrologyRiverVisible).toBe(true);
    expect(info.hydrologyChannelCount).toBe(1);
    expect(info.hydrologySegmentCount).toBe(1);
    expect(scene.getObjectByName('hydrology-river-surfaces')).toBeDefined();
  });

  it('suppresses the global water plane when hydrology river surfaces are present', () => {
    const { system } = makeSystemWithScene();
    const fakeWater = { visible: false };
    (system as unknown as { water: { visible: boolean } }).water = fakeWater;

    system.setEnabled(true);
    expect(fakeWater.visible).toBe(true);

    system.setHydrologyChannels(makeHydrologyArtifact());

    expect(fakeWater.visible).toBe(false);
    expect(system.getWaterSurfaceY(new THREE.Vector3(5, 1, 0))).toBeCloseTo(1.85, 5);
    expect(system.getWaterDepth(new THREE.Vector3(5, 1, 0))).toBeCloseTo(0.85, 5);
    expect(system.isUnderwater(new THREE.Vector3(5, 1, 0))).toBe(true);
    expect(system.getWaterSurfaceY(new THREE.Vector3(5, 1, 10))).toBeNull();
    expect(system.getWaterDepth(new THREE.Vector3(5, 1, 10))).toBe(0);

    system.setHydrologyChannels(null);
    expect(fakeWater.visible).toBe(true);
  });

  it('applies global water color to the standard material', () => {
    const system = makeSystem();
    const material = new THREE.MeshStandardMaterial();
    (system as unknown as { water: { material: THREE.MeshStandardMaterial } }).water = { material };

    system.setWaterColor(0x123456);

    expect(material.color.getHex()).toBe(0x123456);
  });

  it('maps global water distortion requests onto normal-map scale', () => {
    const system = makeSystem();
    const material = new THREE.MeshStandardMaterial();
    (system as unknown as { water: { material: THREE.MeshStandardMaterial } }).water = { material };

    system.setDistortionScale(2.35);

    expect(material.normalScale.x).toBeCloseTo(0.18, 5);
    expect(material.normalScale.y).toBeCloseTo(0.18, 5);
  });

  it('builds hydrology river surfaces with bank-to-channel vertex color coverage', () => {
    const { scene, system } = makeSystemWithScene();

    system.setHydrologyChannels(makeHydrologyArtifact());

    const mesh = scene.getObjectByName('hydrology-river-surface-mesh') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    const position = mesh.geometry.getAttribute('position');
    const color = mesh.geometry.getAttribute('color');
    const index = mesh.geometry.getIndex();

    expect(position.count).toBe(6);
    expect(color.count).toBe(position.count);
    expect(color.itemSize).toBe(4);
    expect(index?.count).toBe(12);
    expect(mesh.material.vertexColors).toBe(true);
    expect(mesh.material.emissiveIntensity).toBeLessThan(0.05);
  });

  it('clears hydrology river surfaces when the next mode has no hydrology bake', () => {
    const { scene, system } = makeSystemWithScene();

    system.setHydrologyChannels(makeHydrologyArtifact());
    system.setHydrologyChannels(null);

    const info = system.getDebugInfo();
    expect(info.hydrologyRiverVisible).toBe(false);
    expect(info.hydrologyRiverMaterialProfile).toBe('none');
    expect(info.hydrologyChannelCount).toBe(0);
    expect(info.hydrologySegmentCount).toBe(0);
    expect(scene.getObjectByName('hydrology-river-surfaces')).toBeUndefined();
  });
});
