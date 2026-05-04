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
    minBucketSize?: number;
  },
): DrawCallOptimizationResult {
  normalizeInterleavedGeometryAttributes(root, options?.excludeMesh);

  const result = optimizePackageStaticModelDrawCalls(root, {
    batchNamePrefix: options?.batchNamePrefix,
    excludeMesh: options?.excludeMesh,
    strategy: options?.strategy,
    minBucketSize: options?.minBucketSize ?? 1,
  });

  return {
    sourceMeshCount: result.sourceMeshCount,
    mergedMeshCount: result.mergedMeshCount,
    skippedMeshCount: result.skippedMeshCount,
  };
}

function normalizeInterleavedGeometryAttributes(
  root: THREE.Object3D,
  excludeMesh?: (mesh: THREE.Mesh) => boolean,
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && (child as THREE.Object3D & { isMesh?: boolean }).isMesh !== true) {
      return;
    }

    const mesh = child as THREE.Mesh;
    if (excludeMesh?.(mesh)) {
      return;
    }

    for (const name of Object.keys(mesh.geometry.attributes)) {
      const attribute = mesh.geometry.getAttribute(name);
      if (isInterleavedAttribute(attribute)) {
        mesh.geometry.setAttribute(name, deinterleaveAttribute(attribute));
      }
    }
  });
}

function isInterleavedAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): attribute is THREE.InterleavedBufferAttribute {
  return (attribute as THREE.InterleavedBufferAttribute & { isInterleavedBufferAttribute?: boolean })
    .isInterleavedBufferAttribute === true;
}

function deinterleaveAttribute(attribute: THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const sourceArray = (attribute as unknown as { array: ArrayLike<number> }).array;
  const ArrayCtor = sourceArray.constructor as { new(length: number): ArrayLike<number> };
  const array = new ArrayCtor(attribute.count * attribute.itemSize);
  const writableArray = array as unknown as number[];
  const attributeWithComponents = attribute as THREE.InterleavedBufferAttribute & {
    getComponent?: (index: number, component: number) => number;
  };

  for (let index = 0; index < attribute.count; index++) {
    for (let component = 0; component < attribute.itemSize; component++) {
      const value = attributeWithComponents.getComponent
        ? attributeWithComponents.getComponent(index, component)
        : getAttributeComponent(attribute, index, component);
      writableArray[index * attribute.itemSize + component] = value;
    }
  }

  return new THREE.BufferAttribute(array as THREE.TypedArray, attribute.itemSize, attribute.normalized);
}

function getAttributeComponent(attribute: THREE.InterleavedBufferAttribute, index: number, component: number): number {
  if (component === 0) return attribute.getX(index);
  if (component === 1) return attribute.getY(index);
  if (component === 2) return attribute.getZ(index);
  if (component === 3) return attribute.getW(index);
  return 0;
}

