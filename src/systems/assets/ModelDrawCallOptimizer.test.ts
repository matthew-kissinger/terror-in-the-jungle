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

  it('can preserve per-object batch instances instead of merging geometry', () => {
    const root = new THREE.Group();
    root.add(makeMesh(0x4a5a2a, -2));
    root.add(makeMesh(0x4a5a2a, 2));

    const result = optimizeStaticModelDrawCalls(root, { strategy: 'batch' });

    expect(result.sourceMeshCount).toBe(2);
    expect(result.mergedMeshCount).toBe(1);
    expect(countMeshes(root)).toBe(1);
    expect((root.children[0] as THREE.BatchedMesh).isBatchedMesh).toBe(true);
  });

  it('deinterleaves GLTFLoader-style attributes before static merging', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x4a5a2a });
    const interleaved = new THREE.InterleavedBuffer(new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]), 3);
    const interleavedGeometry = new THREE.BufferGeometry();
    interleavedGeometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
    interleavedGeometry.setIndex([0, 1, 2]);

    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      -1, 0, 0,
      0, -1, 0,
    ], 3));
    bufferGeometry.setIndex([0, 1, 2]);

    root.add(new THREE.Mesh(interleavedGeometry, material));
    root.add(new THREE.Mesh(bufferGeometry, material));

    const result = optimizeStaticModelDrawCalls(root);

    expect(result.sourceMeshCount).toBe(2);
    expect(result.mergedMeshCount).toBe(1);
    expect(countMeshes(root)).toBe(1);
  });
});
