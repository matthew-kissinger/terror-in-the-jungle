import * as THREE from 'three';
import {
  optimizeStaticModelDrawCalls as optimizePackageStaticModelDrawCalls,
  type DrawCallOptimizationStrategy,
} from '@game-field-kits/three-model-optimizer';

interface DrawCallOptimizationResult {
  sourceMeshCount: number;
  mergedMeshCount: number;
  skippedMeshCount: number;
}

/**
 * TIJ compatibility wrapper around the sibling starter-kit optimizer package.
 * Keeps the historical result shape and `excludeMesh` option while the package
 * owns the reusable Three.js optimization implementation.
 */
export function optimizeStaticModelDrawCalls(
  root: THREE.Object3D,
  options?: {
    batchNamePrefix?: string;
    excludeMesh?: (mesh: THREE.Mesh) => boolean;
    strategy?: DrawCallOptimizationStrategy;
  },
): DrawCallOptimizationResult {
  const result = optimizePackageStaticModelDrawCalls(root, {
    batchNamePrefix: options?.batchNamePrefix,
    excludeMesh: options?.excludeMesh,
    strategy: options?.strategy,
    minBucketSize: 1,
  });

  return {
    sourceMeshCount: result.sourceMeshCount,
    mergedMeshCount: result.mergedMeshCount,
    skippedMeshCount: result.skippedMeshCount,
  };
}

