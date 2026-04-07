import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { optimizeStaticModelDrawCalls } from './ModelDrawCallOptimizer';

function makeMesh(color: number, x: number): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.x = x;
  return mesh;
}

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      count++;
    }
  });
  return count;
}

describe('optimizeStaticModelDrawCalls', () => {
  it('merges distinct material instances when their render state matches', () => {
    const root = new THREE.Group();
    root.add(makeMesh(0x4a5a2a, -2));
    root.add(makeMesh(0x4a5a2a, 2));

    const result = optimizeStaticModelDrawCalls(root);

    expect(result.sourceMeshCount).toBe(2);
    expect(result.mergedMeshCount).toBe(1);
    expect(countMeshes(root)).toBe(1);
  });

  it('keeps different material signatures separated', () => {
    const root = new THREE.Group();
    root.add(makeMesh(0x4a5a2a, -2));
    root.add(makeMesh(0x333333, 2));

    const result = optimizeStaticModelDrawCalls(root);

    expect(result.sourceMeshCount).toBe(2);
    expect(result.mergedMeshCount).toBe(2);
    expect(countMeshes(root)).toBe(2);
  });
});
