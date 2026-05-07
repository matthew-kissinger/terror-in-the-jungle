import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameMode } from '../../config/gameModeTypes';
import { WorldFeatureSystem } from './WorldFeatureSystem';
import { modelLoader } from '../assets/ModelLoader';
import { BuildingModels } from '../assets/modelPaths';

vi.mock('../assets/ModelLoader', () => ({
  modelLoader: {
    loadModel: vi.fn(async () => {
      const THREE = await import('three');
      const group = new THREE.Group();
      const left = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1, 2),
        new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 0.8, metalness: 0.1 }),
      );
      left.position.x = -1.5;
      const right = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1, 2),
        new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 0.8, metalness: 0.1 }),
      );
      right.position.x = 1.5;
      group.add(left);
      group.add(right);
      return group;
    }),
  },
}));

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('WorldFeatureSystem', () => {
  let scene: THREE.Scene;
  let system: WorldFeatureSystem;
  let terrainManager: any;
  let currentConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();
    scene = new THREE.Scene();
    system = new WorldFeatureSystem(scene);
    terrainManager = {
      isTerrainReady: vi.fn(() => true),
      hasTerrainAt: vi.fn(() => true),
      getHeightAt: vi.fn(() => 5),
      getNormalAt: vi.fn((_x: number, _z: number, target?: THREE.Vector3) => (target ?? new THREE.Vector3()).set(0, 1, 0)),
      registerCollisionObject: vi.fn(),
      unregisterCollisionObject: vi.fn(),
    };
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'build_now_village',
          kind: 'village',
          position: new THREE.Vector3(10, 0, 20),
          prefabId: 'village_cluster_small',
        },
      ],
    };
    system.setTerrainManager(terrainManager);
    system.setGameModeManager({
      getCurrentConfig: () => currentConfig,
    } as any);
  });

  it('spawns prefab-backed world feature objects once terrain is ready', async () => {
    system.update(0.016);
    await flushPromises();

    expect(scene.children.length).toBeGreaterThan(0);
  });

  it('spawns generator-backed airfield placements for airfield features', async () => {
    currentConfig = {
      id: GameMode.A_SHAU_VALLEY,
      features: [
        {
          id: 'test_airfield',
          kind: 'airfield',
          position: new THREE.Vector3(120, 0, -80),
          placement: { yaw: Math.PI * 0.25 },
          templateId: 'forward_strip',
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].name).toBe('WorldStaticFeatureBatchRoot');
    expect(vi.mocked(modelLoader.loadModel).mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it('spawns fixed-wing aircraft from local stand offsets without double-rotating them', async () => {
    const fixedWingModel = {
      createAircraftAtSpot: vi.fn(async () => true),
      attachNPCPilot: vi.fn(() => true),
    };
    system.setFixedWingModel(fixedWingModel as any);
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'test_airfield_main',
          kind: 'airfield',
          position: new THREE.Vector3(120, 0, -80),
          placement: { yaw: Math.PI * 0.5 },
          templateId: 'us_airbase',
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    const fixedWingCalls = fixedWingModel.createAircraftAtSpot.mock.calls;
    expect(fixedWingCalls).toHaveLength(3);
    const worldPositions = fixedWingCalls.map((call) => call[2] as THREE.Vector3);
    // Aircraft are parked in a clean row at apron-centerline lateral=105 with
    // along offsets [70, -70, 0] for A-1 / AC-47 / F-4. Center at (120, -80),
    // heading π/2 → world.x = center.x + along, world.z = center.z - lateral.
    expect(worldPositions.map((p) => Number(p.z.toFixed(2)))).toEqual([-185, -185, -185]);
    expect(worldPositions.map((p) => Number(p.x.toFixed(2)))).toEqual([190, 50, 120]);
    expect(fixedWingCalls[0][4]).toEqual(expect.objectContaining({
      standId: 'stand_a1',
      taxiRoute: expect.any(Array),
      runwayStart: expect.objectContaining({ id: 'north_departure' }),
    }));
    expect(fixedWingCalls[2][4]).toEqual(expect.objectContaining({
      standId: 'stand_f4',
      runwayStart: expect.objectContaining({ id: 'north_departure' }),
    }));
  });

  it('clears previously spawned objects when switching to a mode without static features', async () => {
    system.update(0.016);
    await flushPromises();
    expect(scene.children.length).toBeGreaterThan(0);

    currentConfig = {
      id: GameMode.ZONE_CONTROL,
      features: [],
    };
    system.update(0.016);
    await flushPromises();

    expect(scene.children.length).toBe(0);
  });

  it('nudges terrain-snapped placements away from cliff lips onto flatter nearby ground', async () => {
    terrainManager.getHeightAt = vi.fn((x: number, z: number) => {
      if (Math.abs(x - 10) < 1.2 && Math.abs(z - 20) < 1.2) {
        return 11;
      }
      return 5;
    });
    terrainManager.getNormalAt = vi.fn((x: number, z: number, target?: THREE.Vector3) => {
      const normal = target ?? new THREE.Vector3();
      if (Math.abs(x - 10) < 1.2 && Math.abs(z - 20) < 1.2) {
        return normal.set(0.5, 0.7, 0);
      }
      return normal.set(0, 1, 0);
    });
    currentConfig = {
      id: GameMode.ZONE_CONTROL,
      features: [
        {
          id: 'rough_motor_pool',
          kind: 'village',
          position: new THREE.Vector3(10, 0, 20),
          staticPlacements: [
            {
              modelPath: 'mock_vehicle.glb',
              offset: new THREE.Vector3(0, 0, 0),
              registerCollision: true,
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    expect(scene.children.length).toBe(1);
    const bounds = new THREE.Box3().setFromObject(scene.children[0]);
    const center = bounds.getCenter(new THREE.Vector3());
    expect(center.x).toBeGreaterThan(10.5);
    expect(center.y).toBeLessThan(8);
  });

  it('samples the full footprint of large buildings before accepting cliff-edge placement', async () => {
    const largeBuilding = new THREE.Group();
    largeBuilding.add(new THREE.Mesh(
      new THREE.BoxGeometry(12, 1, 12),
      new THREE.MeshStandardMaterial({ color: 0x4a5a2a }),
    ));
    vi.mocked(modelLoader.loadModel).mockResolvedValueOnce(largeBuilding);

    terrainManager.getHeightAt = vi.fn((x: number, z: number) => {
      if (Math.abs(x) < 1.5 && Math.abs(z - 11.25) < 0.75) {
        return 18;
      }
      return 5;
    });
    currentConfig = {
      id: GameMode.ZONE_CONTROL,
      features: [
        {
          id: 'large_edge_building',
          kind: 'village',
          position: new THREE.Vector3(0, 0, 0),
          staticPlacements: [
            {
              modelPath: BuildingModels.WAREHOUSE,
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    const bounds = new THREE.Box3().setFromObject(scene.children[0]);
    const center = bounds.getCenter(new THREE.Vector3());
    expect(center.distanceTo(new THREE.Vector3(0, center.y, 0))).toBeGreaterThan(4);
  });

  it('optimizes generic static placements inside the shared world feature layer', async () => {
    currentConfig = {
      id: GameMode.ZONE_CONTROL,
      features: [
        {
          id: 'optimized_static_feature',
          kind: 'village',
          position: new THREE.Vector3(10, 0, 20),
          staticPlacements: [
            {
              modelPath: 'mock_vehicle.glb',
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    expect(vi.mocked(modelLoader.loadModel)).toHaveBeenCalledWith('mock_vehicle.glb');

    const placed = scene.children[0];
    let meshCount = 0;
    placed.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
      }
    });

    expect(meshCount).toBe(1);
  });

  it('batches compatible static placements across features in the same culling sector', async () => {
    currentConfig = {
      id: GameMode.ZONE_CONTROL,
      features: [
        {
          id: 'near_feature_a',
          kind: 'village',
          position: new THREE.Vector3(10, 0, 20),
          staticPlacements: [
            {
              modelPath: 'near_a.glb',
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
        {
          id: 'near_feature_b',
          kind: 'village',
          position: new THREE.Vector3(120, 0, 80),
          staticPlacements: [
            {
              modelPath: 'near_b.glb',
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    const root = scene.children[0];
    const sectors = root.children.filter((child) => child.name.startsWith('WorldFeatureSector_'));
    let meshCount = 0;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
      }
    });

    expect(sectors).toHaveLength(1);
    expect(meshCount).toBe(1);
  });

  it('uses BatchedMesh for placement profiles that opt into batched world props', async () => {
    currentConfig = {
      id: GameMode.ZONE_CONTROL,
      features: [
        {
          id: 'batched_static_feature',
          kind: 'village',
          position: new THREE.Vector3(10, 0, 20),
          staticPlacements: [
            {
              modelPath: BuildingModels.WAREHOUSE,
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    const placed = scene.children[0];
    let batchedMeshCount = 0;
    placed.traverse((child) => {
      if ((child as THREE.BatchedMesh).isBatchedMesh) {
        batchedMeshCount++;
      }
    });

    expect(batchedMeshCount).toBe(1);
  });

  it('distance-culls static feature groups instead of keeping every base visible', async () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 30, 0);
    system = new WorldFeatureSystem(scene, camera);
    system.setTerrainManager(terrainManager);
    system.setGameModeManager({
      getCurrentConfig: () => currentConfig,
    } as any);
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'near_base',
          kind: 'village',
          position: new THREE.Vector3(0, 0, 0),
          staticPlacements: [
            {
              modelPath: 'near_base.glb',
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
        {
          id: 'far_base',
          kind: 'village',
          position: new THREE.Vector3(1600, 0, 0),
          staticPlacements: [
            {
              modelPath: 'far_base.glb',
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();
    system.update(0.016);

    const root = scene.children.find((child) => child.name === 'WorldStaticFeatureBatchRoot') as THREE.Group;
    const sectors = root.children.filter((child) => child.name.startsWith('WorldFeatureSector_'));
    const near = sectors.find((child) => child.visible);
    const far = sectors.find((child) => !child.visible);

    expect(near?.visible).toBe(true);
    expect(far?.visible).toBe(false);

    camera.position.set(1600, 30, 0);
    system.update(0.016);

    expect(near?.visible).toBe(false);
    expect(far?.visible).toBe(true);
  });

  it('frustum-culls distant static feature sectors that are behind the camera', async () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    camera.position.set(0, 30, 0);
    camera.lookAt(0, 20, -100);
    camera.updateMatrixWorld(true);
    system = new WorldFeatureSystem(scene, camera);
    system.setTerrainManager(terrainManager);
    system.setGameModeManager({
      getCurrentConfig: () => currentConfig,
    } as any);
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'front_base',
          kind: 'village',
          position: new THREE.Vector3(0, 0, -500),
          staticPlacements: [
            {
              modelPath: 'front_base.glb',
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
        {
          id: 'rear_base',
          kind: 'village',
          position: new THREE.Vector3(0, 0, 500),
          staticPlacements: [
            {
              modelPath: 'rear_base.glb',
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();
    system.update(0.016);

    const root = scene.children.find((child) => child.name === 'WorldStaticFeatureBatchRoot') as THREE.Group;
    const sectors = root.children.filter((child) => child.name.startsWith('WorldFeatureSector_'));
    const front = sectors.find((child) => child.name.endsWith('0,-1'));
    const rear = sectors.find((child) => child.name.endsWith('0,0'));

    expect(front?.visible).toBe(true);
    expect(rear?.visible).toBe(false);
  });
});
