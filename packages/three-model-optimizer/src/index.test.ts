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

  it('collapses distinct material INSTANCES that share palette values into one bucket', () => {
    // The bucket key is value-based, not identity-based: separately-constructed
    // materials with the same color/roughness/metalness must co-batch. This is
    // the material-signature canonicalization that lets a palette-cohesive batch
    // (war assets: 113 flat materials -> 19 signatures) collapse to a few draws.
    // Locking it here guards against a regression to uuid/identity keying.
    const root = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      root.add(makeMesh(`prop-${i}`, new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0 })));
    }

    const result = optimizeStaticModelDrawCalls(root, { strategy: 'merge' });

    expect(result.sourceMeshCount).toBe(5);
    expect(result.bucketCount).toBe(1);
    expect(result.optimizedMeshCount).toBe(1);
  });

  it('merges materials whose scalars differ below the quantization step', () => {
    // 0.900 vs 0.9004 roughness is below MERGE_KEY_SCALAR_STEP (1e-3) and far
    // below perceptual threshold, so they share a bucket instead of fragmenting
    // into two draws (robustness against generator float drift).
    const root = new THREE.Group();
    root.add(makeMesh('a', new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9, metalness: 0 })));
    root.add(makeMesh('b', new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9004, metalness: 0 })));

    const result = optimizeStaticModelDrawCalls(root, { strategy: 'merge' });

    expect(result.bucketCount).toBe(1);
    expect(result.optimizedMeshCount).toBe(1);
  });

  it('keeps genuinely different colors in separate buckets', () => {
    const root = new THREE.Group();
    root.add(makeMesh('olive-a', new THREE.MeshStandardMaterial({ color: 0x7a6430, roughness: 0.95 })));
    root.add(makeMesh('olive-b', new THREE.MeshStandardMaterial({ color: 0x7a6430, roughness: 0.95 })));
    root.add(makeMesh('rust-a', new THREE.MeshStandardMaterial({ color: 0x320604, roughness: 0.8 })));
    root.add(makeMesh('rust-b', new THREE.MeshStandardMaterial({ color: 0x320604, roughness: 0.8 })));

    const result = optimizeStaticModelDrawCalls(root, { strategy: 'merge' });

    // Two palette colors -> two buckets -> two merged draws (not one, not four).
    expect(result.bucketCount).toBe(2);
    expect(result.optimizedMeshCount).toBe(2);
  });

  it('keeps differently-textured materials in separate buckets (atlasing is out of scope)', () => {
    // A single draw binds one texture, so meshes with different maps CANNOT
    // merge without a texture atlas. The key must stay texture-aware; collapsing
    // them is the atlasing lever (a later move), not a bucket-key change.
    const root = new THREE.Group();
    const texA = new THREE.Texture();
    const texB = new THREE.Texture();
    root.add(makeMesh('hut', new THREE.MeshStandardMaterial({ color: 0xffffff, map: texA })));
    root.add(makeMesh('barn', new THREE.MeshStandardMaterial({ color: 0xffffff, map: texB })));

    const result = optimizeStaticModelDrawCalls(root, { strategy: 'merge' });

    expect(result.bucketCount).toBe(2);
    expect(result.optimizedMeshCount).toBe(0); // each bucket has 1 entry -> nothing to merge
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