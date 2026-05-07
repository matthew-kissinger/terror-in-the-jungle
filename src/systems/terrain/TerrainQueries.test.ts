import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock HeightQueryCache
vi.mock('./HeightQueryCache', () => {
  const cache = {
    getHeightAt: vi.fn().mockReturnValue(10),
    getProvider: vi.fn().mockReturnValue({ getHeightAt: () => 10, getWorkerConfig: () => ({ type: 'noise', seed: 1 }) }),
  };
  return {
    getHeightQueryCache: () => cache,
    HeightQueryCache: class {},
  };
});

import { TerrainQueries } from './TerrainQueries';
import type { LOSAccelerator } from '../combat/LOSAccelerator';

function makeMockLOS(): LOSAccelerator {
  return {
    checkLineOfSight: vi.fn().mockReturnValue({ clear: true }),
    registerChunk: vi.fn(),
    unregisterChunk: vi.fn(),
    batchCheckLineOfSight: vi.fn(),
    getStats: vi.fn(),
    clear: vi.fn(),
  } as any;
}

describe('TerrainQueries', () => {
  let queries: TerrainQueries;
  let mockLOS: LOSAccelerator;

  beforeEach(() => {
    mockLOS = makeMockLOS();
    queries = new TerrainQueries(mockLOS);
  });

  it('getHeightAt delegates to HeightQueryCache', () => {
    const h = queries.getHeightAt(10, 20);
    expect(h).toBe(10);
  });

  it('getEffectiveHeightAt returns low standable collision surfaces', () => {
    const obj = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1, 4),
      new THREE.MeshBasicMaterial(),
    );
    obj.position.set(10, 10.25, 20);
    obj.updateMatrixWorld(true);

    queries.registerCollisionObject('box1', obj);

    const h = queries.getEffectiveHeightAt(10, 20);
    expect(h).toBe(10.75);
  });

  it('ignores tall generic collision bounds for effective height but keeps collision checks', () => {
    const obj = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial(),
    );
    obj.position.set(0, 12, 0);
    obj.updateMatrixWorld(true);

    queries.registerCollisionObject('building_box', obj);

    expect(queries.getEffectiveHeightAt(0, 0)).toBe(10);
    expect(queries.checkObjectCollision(new THREE.Vector3(0, 12, 0), 0)).toBe(true);
  });

  it('allows helipad collision surfaces to contribute to effective height', () => {
    const obj = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial(),
    );
    obj.position.set(0, 12, 0);
    obj.userData.type = 'helipad';
    obj.updateMatrixWorld(true);

    queries.registerCollisionObject('helipad_box', obj);

    expect(queries.getEffectiveHeightAt(0, 0)).toBe(14);
  });

  it('raycastTerrain delegates to LOSAccelerator', () => {
    const origin = new THREE.Vector3(0, 50, 0);
    const dir = new THREE.Vector3(0, -1, 0);

    queries.raycastTerrain(origin, dir, 100);

    expect(mockLOS.checkLineOfSight).toHaveBeenCalled();
  });

  it('raycastTerrain returns hit info when LOS is blocked', () => {
    (mockLOS.checkLineOfSight as any).mockReturnValue({
      clear: false,
      hitPoint: new THREE.Vector3(0, 10, 0),
      distance: 40,
    });

    const result = queries.raycastTerrain(
      new THREE.Vector3(0, 50, 0),
      new THREE.Vector3(0, -1, 0),
      100,
    );

    expect(result.hit).toBe(true);
    expect(result.distance).toBe(40);
  });

  it('registerCollisionObject and unregisterCollisionObject', () => {
    const obj = new THREE.Object3D();
    queries.registerCollisionObject('test', obj);
    queries.unregisterCollisionObject('test');

    // Should not throw
    expect(true).toBe(true);
  });

  it('keeps static low collision bounds cached after registration', () => {
    const obj = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1, 4),
      new THREE.MeshBasicMaterial(),
    );
    obj.position.set(0, 10.25, 0);
    obj.updateMatrixWorld(true);

    queries.registerCollisionObject('static_box', obj);
    expect(queries.getEffectiveHeightAt(0, 0)).toBe(10.75);

    obj.position.set(0, 20, 0);
    obj.updateMatrixWorld(true);

    expect(queries.getEffectiveHeightAt(0, 0)).toBe(10.75);
  });

  it('recomputes dynamic collision bounds without treating them as effective ground', () => {
    const obj = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial(),
    );
    obj.position.set(0, 12, 0);
    obj.updateMatrixWorld(true);

    queries.registerCollisionObject('dynamic_box', obj, { dynamic: true });
    expect(queries.getEffectiveHeightAt(0, 0)).toBe(10);

    obj.position.set(0, 20, 0);
    obj.updateMatrixWorld(true);

    expect(queries.getEffectiveHeightAt(0, 0)).toBe(10);
    expect(queries.checkObjectCollision(new THREE.Vector3(0, 20, 0), 0)).toBe(true);
  });

  it('getLOSAccelerator returns the injected accelerator', () => {
    expect(queries.getLOSAccelerator()).toBe(mockLOS);
  });
});
