// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameMode } from '../../config/gameModeTypes';
import { WorldFeatureSystem } from './WorldFeatureSystem';
import { modelLoader } from '../assets/ModelLoader';
import { BuildingModels, GroundVehicleModels, StructureModels } from '../assets/modelPaths';

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

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });
  return meshes;
}

function makeNamedMockModel(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
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
  group.add(left, right);
  return group;
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

  it('tags world features with stable perf owner metadata for render attribution', async () => {
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'metadata_village',
          kind: 'village',
          position: new THREE.Vector3(10, 0, 20),
          staticPlacements: [
            {
              id: 'hut_a',
              modelPath: BuildingModels.STILT_HOUSE,
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    const root = scene.children.find((child) => child.name === 'WorldStaticFeatureBatchRoot') as THREE.Group;
    const sector = root.children.find((child) => child.name.startsWith('WorldFeatureSector_')) as THREE.Group;
    const meshes = collectMeshes(root);

    expect(root.userData.perfCategory).toBe('world_static_features');
    expect(sector.userData.perfOwnerType).toBe('world_feature_sector');
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((mesh) => {
      let current: THREE.Object3D | null = mesh;
      while (current) {
        if (typeof current.userData.perfOwnerKey === 'string') return true;
        current = current.parent;
      }
      return false;
    })).toBe(true);
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

  it('registers M151 placements as ground vehicles with optimized static body meshes', async () => {
    const vehicleManager = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
    system.setVehicleManager(vehicleManager as any);
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'test_motor_pool',
          kind: 'village',
          position: new THREE.Vector3(10, 0, 20),
          staticPlacements: [
            {
              id: 'm151',
              modelPath: GroundVehicleModels.M151_JEEP,
              offset: new THREE.Vector3(0, 0, 0),
              registerCollision: true,
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    expect(vehicleManager.register).toHaveBeenCalledTimes(1);
    const vehicle = vehicleManager.register.mock.calls[0][0];
    expect(vehicle.vehicleId).toBe('test_motor_pool_m151');
    expect(vehicle.category).toBe('ground');
    expect(vehicle.hasFreeSeats('pilot')).toBe(true);
    expect(vehicle.getPosition().y).toBeCloseTo(5.45);
    expect(scene.children.some((child) => child.userData.perfCategory === 'ground_vehicles')).toBe(true);
    expect(terrainManager.registerCollisionObject).toHaveBeenCalledWith(
      'test_motor_pool_m151',
      expect.any(Object),
      { dynamic: true },
    );

    let meshCount = 0;
    let frozenMeshCount = 0;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
        if (!child.matrixAutoUpdate || !child.matrixWorldAutoUpdate) {
          frozenMeshCount++;
        }
      }
    });
    expect(meshCount).toBe(1);
    expect(frozenMeshCount).toBe(0);

    currentConfig = {
      id: GameMode.TEAM_DEATHMATCH,
      features: [],
    };
    system.update(0.016);
    await flushPromises();

    expect(vehicleManager.unregister).toHaveBeenCalledWith('test_motor_pool_m151');
  });

  it('registers promoted support-truck placements as ground vehicles', async () => {
    const vehicleManager = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
    system.setVehicleManager(vehicleManager as any);
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'test_motor_pool',
          kind: 'village',
          position: new THREE.Vector3(10, 0, 20),
          staticPlacements: [
            {
              id: 'm35',
              modelPath: GroundVehicleModels.M35_TRUCK,
              offset: new THREE.Vector3(0, 0, 0),
              registerCollision: true,
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();

    expect(vehicleManager.register).toHaveBeenCalledTimes(1);
    const vehicle = vehicleManager.register.mock.calls[0][0];
    expect(vehicle.vehicleId).toBe('test_motor_pool_m35');
    expect(vehicle.category).toBe('ground');
    expect(vehicle.hasFreeSeats('pilot')).toBe(true);
    const placed = scene.children.find((child) => child.userData.worldFeatureGroundVehicleId === 'test_motor_pool_m35');
    expect(placed).toBeDefined();
    expect(placed?.userData.perfCategory).toBe('ground_vehicles');
    expect(collectMeshes(placed as THREE.Object3D)).toHaveLength(1);
    expect(placed?.userData.groundVehicleDrawCallOptimization).toMatchObject({
      sourceMeshCount: 2,
      mergedMeshCount: 1,
    });
    expect(terrainManager.registerCollisionObject).toHaveBeenCalledWith(
      'test_motor_pool_m35',
      expect.any(Object),
      { dynamic: true },
    );
  });

  it('distance-culls dynamic support vehicles without unregistering them', async () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    camera.position.set(0, 30, 0);
    system = new WorldFeatureSystem(scene, camera);
    system.setTerrainManager(terrainManager);
    const vehicleManager = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
    system.setVehicleManager(vehicleManager as any);
    system.setGameModeManager({
      getCurrentConfig: () => currentConfig,
    } as any);
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'near_motor_pool',
          kind: 'village',
          position: new THREE.Vector3(0, 0, 0),
          staticPlacements: [{ id: 'm35', modelPath: GroundVehicleModels.M35_TRUCK, offset: new THREE.Vector3(0, 0, 0) }],
        },
        {
          id: 'far_motor_pool',
          kind: 'village',
          position: new THREE.Vector3(1600, 0, 0),
          staticPlacements: [{ id: 'm35', modelPath: GroundVehicleModels.M35_TRUCK, offset: new THREE.Vector3(0, 0, 0) }],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();
    system.update(0.016);

    const near = scene.children.find((child) => child.userData.worldFeatureGroundVehicleId === 'near_motor_pool_m35');
    const far = scene.children.find((child) => child.userData.worldFeatureGroundVehicleId === 'far_motor_pool_m35');
    expect(vehicleManager.register).toHaveBeenCalledTimes(2);
    expect(near?.visible).toBe(true);
    expect(far?.visible).toBe(false);

    camera.position.set(1600, 30, 0);
    system.update(0.016);

    expect(near?.visible).toBe(false);
    expect(far?.visible).toBe(true);
    expect(vehicleManager.unregister).not.toHaveBeenCalled();
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

  it('skips static feature frustum refresh while camera pose is unchanged', async () => {
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
          id: 'static_visibility_feature',
          kind: 'village',
          position: new THREE.Vector3(0, 0, -500),
          staticPlacements: [
            {
              modelPath: 'static_visibility.glb',
              offset: new THREE.Vector3(0, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();
    const frustumSpy = vi.spyOn(THREE.Frustum.prototype, 'setFromProjectionMatrix');
    frustumSpy.mockClear();

    system.update(0.016);

    expect(frustumSpy).not.toHaveBeenCalled();

    camera.position.x += 2;
    camera.updateMatrixWorld(true);
    system.update(0.016);

    expect(frustumSpy).toHaveBeenCalledTimes(1);
    frustumSpy.mockRestore();
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

  it('uses optimized static content bounds for sector frustum culling', async () => {
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
          id: 'large_footprint_rear_base',
          kind: 'village',
          position: new THREE.Vector3(0, 0, 500),
          footprint: { shape: 'circle', radius: 700 },
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
    const sector = root.children.find((child) => child.name.startsWith('WorldFeatureSector_'));
    expect(sector?.visible).toBe(false);

    camera.lookAt(0, 20, 500);
    camera.updateMatrixWorld(true);
    system.update(0.016);

    expect(sector?.visible).toBe(true);
  });

  it('close-culls micro-detail props without hiding the containing feature sector', async () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    camera.position.set(0, 30, 0);
    camera.lookAt(0, 10, -150);
    camera.updateMatrixWorld(true);
    system = new WorldFeatureSystem(scene, camera);
    system.setTerrainManager(terrainManager);
    system.setGameModeManager({
      getCurrentConfig: () => currentConfig,
    } as any);
    vi.mocked(modelLoader.loadModel)
      .mockResolvedValueOnce(makeNamedMockModel(BuildingModels.BUNKER_NVA))
      .mockResolvedValueOnce(makeNamedMockModel(StructureModels.SUPPLY_CRATE));
    currentConfig = {
      id: GameMode.OPEN_FRONTIER,
      features: [
        {
          id: 'detail_lod_bunker',
          kind: 'village',
          position: new THREE.Vector3(0, 0, -150),
          staticPlacements: [
            {
              id: 'bunker',
              modelPath: BuildingModels.BUNKER_NVA,
              offset: new THREE.Vector3(0, 0, 0),
            },
            {
              id: 'supply',
              modelPath: StructureModels.SUPPLY_CRATE,
              offset: new THREE.Vector3(6, 0, 0),
            },
          ],
        },
      ],
    };

    system.update(0.016);
    await flushPromises();
    system.update(0.016);

    const root = scene.children.find((child) => child.name === 'WorldStaticFeatureBatchRoot') as THREE.Group;
    const sector = root.children.find((child) => child.name.startsWith('WorldFeatureSector_')) as THREE.Group;
    const detail = root.getObjectByName(StructureModels.SUPPLY_CRATE) as THREE.Group;
    const detailMeshes = collectMeshes(detail);
    const nonDetailMeshes = collectMeshes(root).filter((mesh) => {
      let current: THREE.Object3D | null = mesh;
      while (current) {
        if (current === detail) return false;
        current = current.parent;
      }
      return true;
    });
    expect(sector.visible).toBe(true);
    expect(detail.visible).toBe(false);
    expect(detail.userData.worldFeatureDetailRenderDistanceM).toBe(110);
    expect(detailMeshes).toHaveLength(1);
    expect(detailMeshes.every((mesh) => !mesh.castShadow && mesh.receiveShadow)).toBe(true);
    expect(detailMeshes.every((mesh) => mesh.userData.worldFeatureDetailShadowCaster === false)).toBe(true);
    expect(nonDetailMeshes.length).toBeGreaterThan(0);
    expect(nonDetailMeshes.every((mesh) => mesh.castShadow && mesh.receiveShadow)).toBe(true);

    camera.position.set(0, 30, -55);
    camera.lookAt(0, 10, -150);
    camera.updateMatrixWorld(true);
    system.update(0.016);

    expect(detail.visible).toBe(true);
    const worldPositionSpy = vi.spyOn(detail, 'getWorldPosition');

    let detailVisible = detail.visible;
    let visibleWrites = 0;
    Object.defineProperty(detail, 'visible', {
      configurable: true,
      get: () => detailVisible,
      set: (value: boolean) => {
        visibleWrites++;
        detailVisible = value;
      },
    });
    const hypot = vi.spyOn(Math, 'hypot');

    system.update(0.016);

    expect(hypot).not.toHaveBeenCalled();
    expect(visibleWrites).toBe(0);
    expect(detail.visible).toBe(true);

    camera.position.set(0, 30, 0);
    camera.lookAt(0, 10, -150);
    camera.updateMatrixWorld(true);
    system.update(0.016);

    expect(detail.visible).toBe(false);
    expect(visibleWrites).toBe(1);
    expect(worldPositionSpy).not.toHaveBeenCalled();
    worldPositionSpy.mockRestore();
    hypot.mockRestore();
  });
});
