import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { TerrainRaycastRuntime } from './TerrainRaycastRuntime';
import type { LOSAccelerator } from '../combat/LOSAccelerator';

function createRuntime() {
  const losAccelerator = {
    registerChunk: vi.fn(),
    unregisterChunk: vi.fn(),
    clear: vi.fn(),
  } as unknown as LOSAccelerator;

  return {
    runtime: new TerrainRaycastRuntime(losAccelerator),
    losAccelerator: losAccelerator as unknown as {
      registerChunk: ReturnType<typeof vi.fn>;
      unregisterChunk: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
    },
  };
}

describe('TerrainRaycastRuntime', () => {
  it('reuses mesh buffers when the near-field grid size stays the same', () => {
    const { runtime, losAccelerator } = createRuntime();

    runtime.forceRebuildNearFieldMesh(new THREE.Vector3(0, 0, 0), 16, (x, z) => x + z);

    const firstMesh = (runtime as any).bvhMesh as THREE.Mesh;
    const firstGeometry = firstMesh.geometry as THREE.BufferGeometry;
    const firstPositionArray = (firstGeometry.getAttribute('position') as THREE.BufferAttribute).array;

    runtime.forceRebuildNearFieldMesh(new THREE.Vector3(12, 0, -8), 16, () => 42);

    const secondMesh = (runtime as any).bvhMesh as THREE.Mesh;
    const secondGeometry = secondMesh.geometry as THREE.BufferGeometry;
    const secondPositionArray = (secondGeometry.getAttribute('position') as THREE.BufferAttribute).array;

    expect(secondMesh).toBe(firstMesh);
    expect(secondGeometry).toBe(firstGeometry);
    expect(secondPositionArray).toBe(firstPositionArray);
    expect(losAccelerator.registerChunk).toHaveBeenCalledTimes(2);
    expect(losAccelerator.unregisterChunk).not.toHaveBeenCalled();
  });

  it('recreates mesh buffers when the near-field grid size changes', () => {
    const { runtime, losAccelerator } = createRuntime();

    runtime.forceRebuildNearFieldMesh(new THREE.Vector3(0, 0, 0), 16, () => 0);
    const firstMesh = (runtime as any).bvhMesh as THREE.Mesh;

    runtime.forceRebuildNearFieldMesh(new THREE.Vector3(0, 0, 0), 24, () => 0);
    const secondMesh = (runtime as any).bvhMesh as THREE.Mesh;

    expect(secondMesh).not.toBe(firstMesh);
    expect(losAccelerator.unregisterChunk).toHaveBeenCalledWith('bvh_nearfield');
  });
});
