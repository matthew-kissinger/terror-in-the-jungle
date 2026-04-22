/**
 * Aircraft vs. building collision integration test.
 *
 * Exercises the real sweep path the airframe uses in flight:
 *   terrainProbe.sweep() -> terrain.raycastTerrain() -> LOSAccelerator.
 *
 * Validates the cycle-2026-04-22 fix: buildings registered with the LOS
 * accelerator are picked up by aircraft terrain sweeps. Before the fix,
 * an aircraft could phase through hangars and towers because only terrain
 * chunks were registered with the accelerator.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { TerrainQueries } from '../terrain/TerrainQueries';
import { createRuntimeTerrainProbe } from '../vehicle/airframe/terrainProbe';

// Flat ground at y=0; aircraft flies at y=10. The building extends from y=0
// to y=20 in the x range [90, 110]. A west->east sweep at y=10 must hit it.
vi.mock('../terrain/HeightQueryCache', () => {
  const cache = {
    getHeightAt: vi.fn(() => 0),
    getSlopeAt: vi.fn(() => 0),
    getNormalAt: vi.fn(() => new THREE.Vector3(0, 1, 0)),
    getProvider: vi.fn().mockReturnValue({
      getHeightAt: () => 0,
      getWorkerConfig: () => ({ type: 'noise', seed: 1 }),
    }),
  };
  return {
    getHeightQueryCache: () => cache,
    HeightQueryCache: class {},
  };
});

function makeBuildingMesh(
  center: THREE.Vector3,
  size: { width: number; height: number; depth: number },
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size.width, size.height, size.depth);
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.copy(center);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('aircraft-building-collision (integration)', () => {
  let accelerator: LOSAccelerator;
  let queries: TerrainQueries;

  beforeEach(() => {
    accelerator = new LOSAccelerator();
    queries = new TerrainQueries(accelerator);
  });

  it('aircraft sweep through a registered hangar reports a hit at the near face', () => {
    // Hangar centered at (100, 10, 0), 20m x 20m x 20m -> x in [90, 110].
    const hangar = makeBuildingMesh(
      new THREE.Vector3(100, 10, 0),
      { width: 20, height: 20, depth: 20 },
    );
    accelerator.registerStaticObstacle('main_airbase_hangar', hangar);

    // Build the runtime terrain probe against a ITerrainRuntime surface.
    const terrain = {
      getHeightAt: () => 0,
      getNormalAt: (_x: number, _z: number, out?: THREE.Vector3) =>
        (out ?? new THREE.Vector3()).set(0, 1, 0),
      raycastTerrain: (origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) =>
        queries.raycastTerrain(origin, direction, maxDistance),
    } as any;

    const probe = createRuntimeTerrainProbe(terrain);

    // Aircraft sweeps from x=0 to x=200 at y=10 (right through the building).
    const from = new THREE.Vector3(0, 10, 0);
    const to = new THREE.Vector3(200, 10, 0);
    const hit = probe.sweep(from, to);

    expect(hit).not.toBeNull();
    // Near face is at x=90 (center 100 - half-width 10).
    expect(hit!.point.x).toBeGreaterThanOrEqual(89);
    expect(hit!.point.x).toBeLessThanOrEqual(92);
  });

  it('aircraft sweep well above the hangar does not intersect it', () => {
    // Hangar roof at y=20; aircraft sweeping at y=60 should miss.
    const hangar = makeBuildingMesh(
      new THREE.Vector3(100, 10, 0),
      { width: 20, height: 20, depth: 20 },
    );
    accelerator.registerStaticObstacle('main_airbase_hangar', hangar);

    const terrain = {
      getHeightAt: () => 0,
      getNormalAt: (_x: number, _z: number, out?: THREE.Vector3) =>
        (out ?? new THREE.Vector3()).set(0, 1, 0),
      raycastTerrain: (origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) =>
        queries.raycastTerrain(origin, direction, maxDistance),
    } as any;

    const probe = createRuntimeTerrainProbe(terrain);

    const from = new THREE.Vector3(0, 60, 0);
    const to = new THREE.Vector3(200, 60, 0);
    const hit = probe.sweep(from, to);

    expect(hit).toBeNull();
  });

  it('both a hangar and a tower registered on the same map are individually collidable', () => {
    const hangar = makeBuildingMesh(
      new THREE.Vector3(100, 10, 0),
      { width: 20, height: 20, depth: 20 },
    );
    const tower = makeBuildingMesh(
      new THREE.Vector3(200, 25, 0),
      { width: 8, height: 50, depth: 8 },
    );
    accelerator.registerStaticObstacle('main_airbase_hangar', hangar);
    accelerator.registerStaticObstacle('main_airbase_tower', tower);

    const terrain = {
      getHeightAt: () => 0,
      getNormalAt: (_x: number, _z: number, out?: THREE.Vector3) =>
        (out ?? new THREE.Vector3()).set(0, 1, 0),
      raycastTerrain: (origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) =>
        queries.raycastTerrain(origin, direction, maxDistance),
    } as any;

    const probe = createRuntimeTerrainProbe(terrain);

    // Sweep that hits only the hangar (y=10, hangar range y=0..20, tower y=0..50).
    // A sweep from x=0 to x=120 at y=10 hits the hangar first.
    const hangarHit = probe.sweep(
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(120, 10, 0),
    );
    expect(hangarHit).not.toBeNull();
    expect(hangarHit!.point.x).toBeGreaterThanOrEqual(89);
    expect(hangarHit!.point.x).toBeLessThanOrEqual(92);

    // Sweep above the hangar but into the tower (y=40; tower extends to y=50).
    const towerHit = probe.sweep(
      new THREE.Vector3(150, 40, 0),
      new THREE.Vector3(220, 40, 0),
    );
    expect(towerHit).not.toBeNull();
    expect(towerHit!.point.x).toBeGreaterThanOrEqual(195);
    expect(towerHit!.point.x).toBeLessThanOrEqual(201);
  });

  it('unregistering a building restores clear line of sight through it', () => {
    const hangar = makeBuildingMesh(
      new THREE.Vector3(100, 10, 0),
      { width: 20, height: 20, depth: 20 },
    );
    accelerator.registerStaticObstacle('transient_hangar', hangar);

    const terrain = {
      getHeightAt: () => 0,
      getNormalAt: (_x: number, _z: number, out?: THREE.Vector3) =>
        (out ?? new THREE.Vector3()).set(0, 1, 0),
      raycastTerrain: (origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) =>
        queries.raycastTerrain(origin, direction, maxDistance),
    } as any;

    const probe = createRuntimeTerrainProbe(terrain);

    const from = new THREE.Vector3(0, 10, 0);
    const to = new THREE.Vector3(200, 10, 0);

    expect(probe.sweep(from, to)).not.toBeNull();

    accelerator.unregisterStaticObstacle('transient_hangar');

    expect(probe.sweep(from, to)).toBeNull();
  });
});
