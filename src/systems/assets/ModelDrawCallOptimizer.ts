import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _rootWorldInverse = new THREE.Matrix4();
const _localMatrix = new THREE.Matrix4();

export interface DrawCallOptimizationResult {
  sourceMeshCount: number;
  mergedMeshCount: number;
  skippedMeshCount: number;
}

export type DrawCallOptimizationStrategy = 'merge' | 'batch';

interface MergeBucket {
  entries: BucketEntry[];
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
}

interface BucketEntry {
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
 * Collapse static leaf meshes into one mesh per material to cut draw calls.
 * Animated/control meshes can be excluded via `excludeMesh`.
 */
export function optimizeStaticModelDrawCalls(
  root: THREE.Object3D,
  options?: {
    batchNamePrefix?: string;
    excludeMesh?: (mesh: THREE.Mesh) => boolean;
    strategy?: DrawCallOptimizationStrategy;
  },
): DrawCallOptimizationResult {
  root.updateMatrixWorld(true);
  _rootWorldInverse.copy(root.matrixWorld).invert();

  const excludeMesh = options?.excludeMesh;
  const strategy = options?.strategy ?? 'merge';
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

    const material = child.material;
    const bucketKey = `${getMaterialMergeKey(material)}::${getGeometryLayoutKey(child.geometry)}`;
    const bucket = buckets.get(bucketKey);
    if (bucket) {
      bucket.entries.push({
        geometry: child.geometry,
        localMatrix: _localMatrix.clone(),
      });
      bucket.castShadow ||= child.castShadow;
      bucket.receiveShadow ||= child.receiveShadow;
    } else {
      buckets.set(bucketKey, {
        entries: [{
          geometry: child.geometry,
          localMatrix: _localMatrix.clone(),
        }],
        material,
        castShadow: child.castShadow,
        receiveShadow: child.receiveShadow,
      });
    }

    sourceMeshes.push(child);
  });

  if (sourceMeshes.length <= 1) {
    return {
      sourceMeshCount: sourceMeshes.length,
      mergedMeshCount: 0,
      skippedMeshCount,
    };
  }

  let mergedMeshCount = 0;
  if (strategy === 'batch') {
    mergedMeshCount = buildBatchedMeshes(root, buckets, options?.batchNamePrefix);
  } else {
    const mergeResult = buildMergedMeshes(root, buckets, options?.batchNamePrefix);
    mergedMeshCount = mergeResult.mergedMeshCount;
    skippedMeshCount += mergeResult.skippedMeshCount;
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

function buildMergedMeshes(
  root: THREE.Object3D,
  buckets: Map<string, MergeBucket>,
  batchNamePrefix?: string,
): Pick<DrawCallOptimizationResult, 'mergedMeshCount' | 'skippedMeshCount'> {
  let mergedMeshCount = 0;
  let skippedMeshCount = 0;
  let batchIndex = 0;
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
    mergedMesh.userData.generatedMergedGeometry = true;
    root.add(mergedMesh);
    mergedMeshCount++;
  }

  return {
    mergedMeshCount,
    skippedMeshCount,
  };
}

function buildBatchedMeshes(
  root: THREE.Object3D,
  buckets: Map<string, MergeBucket>,
  batchNamePrefix?: string,
): number {
  let batchedMeshCount = 0;
  let batchIndex = 0;

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
    batchedMesh.userData.generatedBatchedMesh = true;

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
    }

    batchedMesh.computeBoundingBox();
    batchedMesh.computeBoundingSphere();
    root.add(batchedMesh);
    batchedMeshCount++;

    for (const record of geometryRecords.values()) {
      record.geometry.dispose();
    }
  }

  return batchedMeshCount;
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

function getMaterialMergeKey(material: THREE.Material): string {
  const materialRecord = material as unknown as MaterialRecord;
  const commonKey = {
    type: material.type,
    transparent: material.transparent,
    alphaTest: material.alphaTest,
    side: material.side,
    opacity: material.opacity,
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
        roughness: material.roughness,
        metalness: material.metalness,
        emissiveIntensity: material.emissiveIntensity,
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
