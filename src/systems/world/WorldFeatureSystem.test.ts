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

    expect(scene.children.length).toBeGreaterThanOrEqual(6);
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
    expect(worldPositions.map((p) => Number(p.z.toFixed(2)))).toEqual([-176, -176, -176]);
    expect(worldPositions.map((p) => Number(p.x.toFixed(2)))).toEqual([38, 120, 202]);
    expect(fixedWingCalls[0][4]).toEqual(expect.objectContaining({
      standId: 'stand_a1',
      taxiRoute: expect.any(Array),
      runwayStart: expect.objectContaining({ id: 'south_departure' }),
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
    const placed = scene.children[0];
    expect(placed.position.x).toBeGreaterThan(10.5);
    expect(placed.position.y).toBeLessThan(8);
  });

  it('optimizes generic static placements before adding them to the scene', async () => {
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
});
