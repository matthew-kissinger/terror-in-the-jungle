import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _rootWorldInverse = new THREE.Matrix4();
const _localMatrix = new THREE.Matrix4();

export interface DrawCallOptimizationResult {
  sourceMeshCount: number;
  mergedMeshCount: number;
  skippedMeshCount: number;
}

interface MergeBucket {
  geometries: THREE.BufferGeometry[];
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
}

/**
 * Collapse static leaf meshes into one mesh per material to cut draw calls.
 * Animated/control meshes can be excluded via `excludeMesh`.
 */
export function optimizeStaticModelDrawCalls(
  root: THREE.Object3D,
  options?: {
    batchNamePrefix?: string;
    excludeMesh?: (mesh: THREE.Mesh) => boolean;
  },
): DrawCallOptimizationResult {
  root.updateMatrixWorld(true);
  _rootWorldInverse.copy(root.matrixWorld).invert();

  const excludeMesh = options?.excludeMesh;
  const sourceMeshes: THREE.Mesh[] = [];
  const buckets = new Map<string, MergeBucket>();
  let skippedMeshCount = 0;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    if (child.children.length > 0 || Array.isArray(child.material)) {
      skippedMeshCount++;
      return;
    }

    if (excludeMesh?.(child)) {
      skippedMeshCount++;
      return;
    }

    child.updateWorldMatrix(true, false);
    _localMatrix.multiplyMatrices(_rootWorldInverse, child.matrixWorld);

    const geometry = child.geometry.clone();
    geometry.applyMatrix4(_localMatrix);

    const material = child.material;
    const bucketKey = material.uuid;
    const bucket = buckets.get(bucketKey);
    if (bucket) {
      bucket.geometries.push(geometry);
      bucket.castShadow ||= child.castShadow;
      bucket.receiveShadow ||= child.receiveShadow;
    } else {
      buckets.set(bucketKey, {
        geometries: [geometry],
        material: material.clone(),
        castShadow: child.castShadow,
        receiveShadow: child.receiveShadow,
      });
    }

    sourceMeshes.push(child);
  });

  if (sourceMeshes.length <= 1) {
    for (const bucket of buckets.values()) {
      for (const geometry of bucket.geometries) {
        geometry.dispose();
      }
      bucket.material.dispose();
    }
    return {
      sourceMeshCount: sourceMeshes.length,
      mergedMeshCount: 0,
      skippedMeshCount,
    };
  }

  let mergedMeshCount = 0;
  let batchIndex = 0;
  for (const bucket of buckets.values()) {
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(bucket.geometries, false);
    for (const geometry of bucket.geometries) {
      geometry.dispose();
    }

    if (!mergedGeometry) {
      bucket.material.dispose();
      skippedMeshCount += bucket.geometries.length;
      continue;
    }

    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();

    const mergedMesh = new THREE.Mesh(mergedGeometry, bucket.material);
    mergedMesh.name = `${options?.batchNamePrefix ?? 'merged'}_${batchIndex++}`;
    mergedMesh.castShadow = bucket.castShadow;
    mergedMesh.receiveShadow = bucket.receiveShadow;
    mergedMesh.userData.generatedMergedGeometry = true;
    root.add(mergedMesh);
    mergedMeshCount++;
  }

  for (const mesh of sourceMeshes) {
    mesh.removeFromParent();
  }
  pruneEmptyGroups(root);

  return {
    sourceMeshCount: sourceMeshes.length,
    mergedMeshCount,
    skippedMeshCount,
  };
}

function pruneEmptyGroups(root: THREE.Object3D): void {
  const groupsToRemove: THREE.Group[] = [];

  root.traverse((child) => {
    if (child === root || !(child instanceof THREE.Group)) {
      return;
    }
    if (child.children.length === 0) {
      groupsToRemove.push(child);
    }
  });

  for (const group of groupsToRemove) {
    group.removeFromParent();
  }
}
