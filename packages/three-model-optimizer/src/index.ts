// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _rootWorldInverse = new THREE.Matrix4();
const _localMatrix = new THREE.Matrix4();

export type DrawCallOptimizationStrategy = 'merge' | 'batch';

export interface DrawCallOptimizationResult {
  strategy: DrawCallOptimizationStrategy;
  sourceMeshCount: number;
  optimizedMeshCount: number;
  mergedMeshCount: number;
  skippedMeshCount: number;
  removedMeshCount: number;
  bucketCount: number;
}

export interface OptimizeStaticModelOptions {
  strategy?: DrawCallOptimizationStrategy;
  batchNamePrefix?: string;
  minBucketSize?: number;
  preserveMesh?: (mesh: THREE.Mesh) => boolean;
  excludeMesh?: (mesh: THREE.Mesh) => boolean;
  includeMesh?: (mesh: THREE.Mesh) => boolean;
  materialKey?: (material: THREE.Material) => string;
}

export interface SceneMeshStats {
  meshCount: number;
  materialSlotCount: number;
  generatedMeshCount: number;
  preservedMeshCount: number;
}

interface MergeBucket {
  entries: BucketEntry[];
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
}

interface BucketEntry {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  localMatrix: THREE.Matrix4;
}

type MaterialRecord = Record<string, unknown>;

const TEXTURE_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
] as const;

/**
 * Collapse compatible static leaf meshes into one mesh per material/layout
 * bucket. The optimizer is conservative by default and leaves animated,
 * skinned, morph-target, multi-material, and parent/control meshes untouched.
 */
export function optimizeStaticModelDrawCalls(
  root: THREE.Object3D,
  options: OptimizeStaticModelOptions = {},
): DrawCallOptimizationResult {
  root.updateMatrixWorld(true);
  _rootWorldInverse.copy(root.matrixWorld).invert();

  const strategy = options.strategy ?? 'merge';
  const minBucketSize = Math.max(1, options.minBucketSize ?? 2);
  const sourceMeshes: THREE.Mesh[] = [];
  const buckets = new Map<string, MergeBucket>();
  let skippedMeshCount = 0;

  root.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }

    if (!shouldOptimizeMesh(child, options)) {
      skippedMeshCount++;
      return;
    }

    child.updateWorldMatrix(true, false);
    _localMatrix.multiplyMatrices(_rootWorldInverse, child.matrixWorld);

    const material = child.material;
    if (Array.isArray(material)) {
      skippedMeshCount++;
      return;
    }
    const materialKey = options.materialKey?.(material) ?? getMaterialMergeKey(material);
    const bucketKey = `${materialKey}::${getGeometryLayoutKey(child.geometry)}`;
    const bucket = buckets.get(bucketKey);
    const entry = {
      mesh: child,
      geometry: child.geometry,
      localMatrix: _localMatrix.clone(),
    };

    if (bucket) {
      bucket.entries.push(entry);
      bucket.castShadow ||= child.castShadow;
      bucket.receiveShadow ||= child.receiveShadow;
    } else {
      buckets.set(bucketKey, {
        entries: [entry],
        material,
        castShadow: child.castShadow,
        receiveShadow: child.receiveShadow,
      });
    }

    sourceMeshes.push(child);
  });

  const optimizableBuckets = new Map(
    [...buckets.entries()].filter(([, bucket]) => bucket.entries.length >= minBucketSize),
  );
  const singleEntrySkipped = [...buckets.values()]
    .filter((bucket) => bucket.entries.length < minBucketSize)
    .reduce((count, bucket) => count + bucket.entries.length, 0);
  skippedMeshCount += singleEntrySkipped;

  if (optimizableBuckets.size === 0) {
    return {
      strategy,
      sourceMeshCount: sourceMeshes.length,
      optimizedMeshCount: 0,
      mergedMeshCount: 0,
      skippedMeshCount,
      removedMeshCount: 0,
      bucketCount: buckets.size,
    };
  }

  const optimized = strategy === 'batch'
    ? buildBatchedMeshes(root, optimizableBuckets, options.batchNamePrefix)
    : buildMergedMeshes(root, optimizableBuckets, options.batchNamePrefix);

  for (const mesh of optimized.consumedMeshes) {
    mesh.removeFromParent();
  }
  pruneEmptyGroups(root);

  return {
    strategy,
    sourceMeshCount: sourceMeshes.length,
    optimizedMeshCount: optimized.optimizedMeshCount,
    mergedMeshCount: optimized.optimizedMeshCount,
    skippedMeshCount: skippedMeshCount + optimized.skippedMeshCount,
    removedMeshCount: optimized.consumedMeshes.size,
    bucketCount: buckets.size,
  };
}

export function collectSceneMeshStats(root: THREE.Object3D): SceneMeshStats {
  let meshCount = 0;
  let materialSlotCount = 0;
  let generatedMeshCount = 0;
  let preservedMeshCount = 0;

  root.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }
    meshCount++;
    materialSlotCount += Array.isArray(child.material) ? child.material.length : 1;
    if (child.userData.generatedOptimizedMesh === true) {
      generatedMeshCount++;
    }
    if (defaultPreserveMesh(child)) {
      preservedMeshCount++;
    }
  });

  return {
    meshCount,
    materialSlotCount,
    generatedMeshCount,
    preservedMeshCount,
  };
}

export function shouldOptimizeMesh(
  mesh: THREE.Mesh,
  options: Pick<OptimizeStaticModelOptions, 'includeMesh' | 'preserveMesh' | 'excludeMesh'> = {},
): boolean {
  if (options.includeMesh && !options.includeMesh(mesh)) {
    return false;
  }
  if (defaultPreserveMesh(mesh)) {
    return false;
  }
  if (options.excludeMesh?.(mesh)) {
    return false;
  }
  if (options.preserveMesh?.(mesh)) {
    return false;
  }
  return true;
}

function defaultPreserveMesh(mesh: THREE.Mesh): boolean {
  return (
    isSkinnedMesh(mesh) ||
    mesh.children.length > 0 ||
    Array.isArray(mesh.material) ||
    hasMorphTargets(mesh)
  );
}

function isMesh(value: THREE.Object3D): value is THREE.Mesh {
  return value instanceof THREE.Mesh || (value as THREE.Object3D & { isMesh?: boolean }).isMesh === true;
}

function isSkinnedMesh(value: THREE.Object3D): boolean {
  return value instanceof THREE.SkinnedMesh || (value as THREE.Object3D & { isSkinnedMesh?: boolean }).isSkinnedMesh === true;
}

function hasMorphTargets(mesh: THREE.Mesh): boolean {
  return Boolean(mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0);
}

function buildMergedMeshes(
  root: THREE.Object3D,
  buckets: Map<string, MergeBucket>,
  batchNamePrefix?: string,
): {
  optimizedMeshCount: number;
  skippedMeshCount: number;
  consumedMeshes: Set<THREE.Mesh>;
} {
  let optimizedMeshCount = 0;
  let skippedMeshCount = 0;
  let batchIndex = 0;
  const consumedMeshes = new Set<THREE.Mesh>();

  for (const bucket of buckets.values()) {
    const geometries = bucket.entries.map((entry) => {
      const geometry = entry.geometry.clone();
      geometry.applyMatrix4(entry.localMatrix);
      return geometry;
    });

    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);
    for (const geometry of geometries) {
      geometry.dispose();
    }

    if (!mergedGeometry) {
      skippedMeshCount += bucket.entries.length;
      continue;
    }

    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();

    const mergedMesh = new THREE.Mesh(mergedGeometry, bucket.material.clone());
    mergedMesh.name = `${batchNamePrefix ?? 'merged'}_${batchIndex++}`;
    mergedMesh.castShadow = bucket.castShadow;
    mergedMesh.receiveShadow = bucket.receiveShadow;
    mergedMesh.userData.generatedOptimizedMesh = true;
    mergedMesh.userData.generatedMergedGeometry = true;
    mergedMesh.userData.optimizationStrategy = 'merge';
    root.add(mergedMesh);
    optimizedMeshCount++;

    for (const entry of bucket.entries) {
      consumedMeshes.add(entry.mesh);
    }
  }

  return {
    optimizedMeshCount,
    skippedMeshCount,
    consumedMeshes,
  };
}

function buildBatchedMeshes(
  root: THREE.Object3D,
  buckets: Map<string, MergeBucket>,
  batchNamePrefix?: string,
): {
  optimizedMeshCount: number;
  skippedMeshCount: number;
  consumedMeshes: Set<THREE.Mesh>;
} {
  let optimizedMeshCount = 0;
  let batchIndex = 0;
  const consumedMeshes = new Set<THREE.Mesh>();

  for (const bucket of buckets.values()) {
    const geometryRecords = new Map<string, {
      geometry: THREE.BufferGeometry;
      geometryId: number;
    }>();
    let totalVertexCount = 0;
    let totalIndexCount = 0;

    for (const entry of bucket.entries) {
      if (geometryRecords.has(entry.geometry.uuid)) {
        continue;
      }

      const geometry = entry.geometry.clone();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometryRecords.set(entry.geometry.uuid, {
        geometry,
        geometryId: -1,
      });

      totalVertexCount += geometry.getAttribute('position').count;
      totalIndexCount += geometry.getIndex()?.count ?? 0;
    }

    const material = bucket.material.clone();
    const batchedMesh = new THREE.BatchedMesh(
      bucket.entries.length,
      totalVertexCount,
      totalIndexCount > 0 ? totalIndexCount : totalVertexCount * 2,
      material,
    );
    batchedMesh.name = `${batchNamePrefix ?? 'batched'}_${batchIndex++}`;
    batchedMesh.castShadow = bucket.castShadow;
    batchedMesh.receiveShadow = bucket.receiveShadow;
    batchedMesh.userData.generatedOptimizedMesh = true;
    batchedMesh.userData.generatedBatchedMesh = true;
    batchedMesh.userData.optimizationStrategy = 'batch';

    for (const record of geometryRecords.values()) {
      record.geometryId = batchedMesh.addGeometry(record.geometry);
    }

    for (const entry of bucket.entries) {
      const record = geometryRecords.get(entry.geometry.uuid);
      if (!record) {
        continue;
      }
      const instanceId = batchedMesh.addInstance(record.geometryId);
      batchedMesh.setMatrixAt(instanceId, entry.localMatrix);
      consumedMeshes.add(entry.mesh);
    }

    batchedMesh.computeBoundingBox();
    batchedMesh.computeBoundingSphere();
    root.add(batchedMesh);
    optimizedMeshCount++;

    for (const record of geometryRecords.values()) {
      record.geometry.dispose();
    }
  }

  return {
    optimizedMeshCount,
    skippedMeshCount: 0,
    consumedMeshes,
  };
}

function pruneEmptyGroups(root: THREE.Object3D): void {
  const groupsToRemove: THREE.Group[] = [];

  root.traverse((child) => {
    if (child === root || !isGroup(child)) {
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

function isGroup(value: THREE.Object3D): value is THREE.Group {
  return value instanceof THREE.Group || (value as THREE.Object3D & { isGroup?: boolean }).isGroup === true;
}

function getGeometryLayoutKey(geometry: THREE.BufferGeometry): string {
  const attributes = Object.entries(geometry.attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, attribute]) => ({
      name,
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
    }));

  return JSON.stringify({
    indexed: geometry.getIndex() !== null,
    attributes,
  });
}

/**
 * Quantization step for the continuous PBR scalars in the material merge key.
 * Two materials whose roughness/metalness differ by less than this share a
 * bucket (and so one draw). Color is already 8-bit quantized via getHexString.
 *
 * This is the "material signature canonicalization" lever: the bucket key is
 * value-based, not identity-based, so palette-cohesive art collapses to a small
 * set of buckets. A batch generated against a fixed palette (the war assets snap
 * 113 flat materials to 19 signatures) already collapses with exact compares;
 * quantization makes that robust to a future generator emitting 0.8999 vs 0.9
 * instead of fragmenting into separate draws. 1e-3 is far below perceptual
 * threshold, so the merged material is visually identical to each source.
 */
const MERGE_KEY_SCALAR_STEP = 1e-3;

function quantizeScalar(value: number | undefined): number {
  return Math.round((value ?? 0) / MERGE_KEY_SCALAR_STEP) * MERGE_KEY_SCALAR_STEP;
}

function getMaterialMergeKey(material: THREE.Material): string {
  const materialRecord = material as unknown as MaterialRecord;
  const commonKey = {
    type: material.type,
    transparent: material.transparent,
    alphaTest: quantizeScalar(material.alphaTest),
    side: material.side,
    opacity: quantizeScalar(material.opacity),
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    blending: material.blending,
    premultipliedAlpha: material.premultipliedAlpha,
    vertexColors: material.vertexColors,
    flatShading: 'flatShading' in material ? material.flatShading : false,
    fog: 'fog' in material ? materialRecord.fog : false,
    toneMapped: material.toneMapped,
    wireframe: 'wireframe' in material ? material.wireframe : false,
    visible: material.visible,
  };

  const standardKey = material instanceof THREE.MeshStandardMaterial
    ? {
        color: material.color.getHexString(),
        emissive: material.emissive.getHexString(),
        roughness: quantizeScalar(material.roughness),
        metalness: quantizeScalar(material.metalness),
        emissiveIntensity: quantizeScalar(material.emissiveIntensity),
      }
    : {
        color: 'color' in material && material.color instanceof THREE.Color
          ? material.color.getHexString()
          : null,
      };

  const textureKey = Object.fromEntries(
    TEXTURE_KEYS.map((key) => {
      const value = materialRecord[key];
      return [key, value instanceof THREE.Texture ? value.uuid : null];
    }),
  );

  return JSON.stringify({
    ...commonKey,
    ...standardKey,
    textures: textureKey,
  });
}