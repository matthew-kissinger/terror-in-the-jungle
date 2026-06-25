// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  collectSceneMeshStats,
  optimizeStaticModelDrawCalls,
  shouldOptimizeMesh,
} from './index';

function makeMesh(name: string, material = new THREE.MeshStandardMaterial({ color: 0x44aa66 })): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  return mesh;
}

describe('optimizeStaticModelDrawCalls', () => {
  it('merges compatible static meshes into one generated mesh', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x44aa66 });
    root.add(makeMesh('crate-a', material));
    root.add(makeMesh('crate-b', material));

    const result = optimizeStaticModelDrawCalls(root, {
      strategy: 'merge',
      batchNamePrefix: 'crate',
    });
    const stats = collectSceneMeshStats(root);

    expect(result.sourceMeshCount).toBe(2);
    expect(result.optimizedMeshCount).toBe(1);
    expect(result.removedMeshCount).toBe(2);
    expect(stats.meshCount).toBe(1);
    expect(root.children[0]?.name).toBe('crate_0');
  });

  it('keeps meshes selected by the preserve predicate', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x44aa66 });
    root.add(makeMesh('static-a', material));
    root.add(makeMesh('static-b', material));
    root.add(makeMesh('preserved-control', material));

    const result = optimizeStaticModelDrawCalls(root, {
      preserveMesh: (mesh) => mesh.name.includes('control'),
    });

    expect(result.optimizedMeshCount).toBe(1);
    expect(result.skippedMeshCount).toBe(1);
    expect(root.getObjectByName('preserved-control')).toBeDefined();
  });

  it('preserves animated or control-like meshes by default', () => {
    const skinned = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xaa6644 }),
    );
    const parentMesh = makeMesh('control-parent');
    parentMesh.add(new THREE.Object3D());

    expect(shouldOptimizeMesh(skinned)).toBe(false);
    expect(shouldOptimizeMesh(parentMesh)).toBe(false);
  });

  it('does not remove single-entry buckets that cannot reduce draw calls', () => {
    const root = new THREE.Group();
    root.add(makeMesh('red', new THREE.MeshStandardMaterial({ color: 0xff0000 })));
    root.add(makeMesh('blue', new THREE.MeshStandardMaterial({ color: 0x0000ff })));

    const result = optimizeStaticModelDrawCalls(root);

    expect(result.optimizedMeshCount).toBe(0);
    expect(result.removedMeshCount).toBe(0);
    expect(collectSceneMeshStats(root).meshCount).toBe(2);
  });

  it('can build a BatchedMesh for compatible repeated geometry', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x6688aa });
    root.add(makeMesh('crate-a', material));
    root.add(makeMesh('crate-b', material));

    const result = optimizeStaticModelDrawCalls(root, {
      strategy: 'batch',
      batchNamePrefix: 'batched-crate',
    });

    expect(result.optimizedMeshCount).toBe(1);
    expect(root.children[0]).toBeInstanceOf(THREE.BatchedMesh);
    expect(root.children[0]?.name).toBe('batched-crate_0');
  });
});