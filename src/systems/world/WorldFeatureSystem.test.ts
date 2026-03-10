import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameMode } from '../../config/gameModeTypes';
import { WorldFeatureSystem } from './WorldFeatureSystem';

vi.mock('../assets/ModelLoader', () => ({
  modelLoader: {
    loadModel: vi.fn(async () => {
      const THREE = await import('three');
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshBasicMaterial()));
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
});
