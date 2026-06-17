// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import {
  optimizeStaticModelDrawCalls as optimizePackageStaticModelDrawCalls,
  shouldOptimizeMesh as shouldOptimizePackageMesh,
  type DrawCallOptimizationStrategy,
} from '@game-field-kits/three-model-optimizer';

interface DrawCallOptimizationResult {
  sourceMeshCount: number;
  mergedMeshCount: number;
  skippedMeshCount: number;
}

interface OwnerSummaryEntry {
  ownerKey: string;
  ownerLabel: string;
  ownerType: string | null;
  sourceMeshCount: number;
  sourceTriangleCount: number;
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
  const existingGeneratedMeshes = collectGeneratedMeshes(root);
  const ownerSummary = collectOptimizableOwnerSummary(root, options?.excludeMesh);
  normalizeInterleavedGeometryAttributes(root, options?.excludeMesh);

  const result = optimizePackageStaticModelDrawCalls(root, {
    batchNamePrefix: options?.batchNamePrefix,
    excludeMesh: options?.excludeMesh,
    strategy: options?.strategy,
    minBucketSize: options?.minBucketSize ?? 1,
  });

  applyOwnerSummaryToGeneratedMeshes(root, existingGeneratedMeshes, ownerSummary);

  return {
    sourceMeshCount: result.sourceMeshCount,
    mergedMeshCount: result.mergedMeshCount,
    skippedMeshCount: result.skippedMeshCount,
  };
}

function collectGeneratedMeshes(root: THREE.Object3D): WeakSet<THREE.Mesh> {
  const meshes = new WeakSet<THREE.Mesh>();
  root.traverse((child) => {
    if (isMesh(child) && child.userData.generatedOptimizedMesh === true) {
      meshes.add(child);
    }
  });
  return meshes;
}

function collectOptimizableOwnerSummary(
  root: THREE.Object3D,
  excludeMesh?: (mesh: THREE.Mesh) => boolean,
): OwnerSummaryEntry[] {
  const summaries = new Map<string, OwnerSummaryEntry>();
  root.traverse((child) => {
    if (!isMesh(child) || !shouldOptimizePackageMesh(child, { excludeMesh })) {
      return;
    }
    const owner = ownerInfoFor(child);
    if (!owner) {
      return;
    }
    const summary = summaries.get(owner.ownerKey) ?? {
      ...owner,
      sourceMeshCount: 0,
      sourceTriangleCount: 0,
    };
    summary.sourceMeshCount += 1;
    summary.sourceTriangleCount += triangleCountFor(child.geometry);
    summaries.set(owner.ownerKey, summary);
  });
  return Array.from(summaries.values())
    .sort((a, b) => b.sourceMeshCount - a.sourceMeshCount || b.sourceTriangleCount - a.sourceTriangleCount)
    .slice(0, 16);
}

function applyOwnerSummaryToGeneratedMeshes(
  root: THREE.Object3D,
  existingGeneratedMeshes: WeakSet<THREE.Mesh>,
  ownerSummary: OwnerSummaryEntry[],
): void {
  if (ownerSummary.length === 0) {
    return;
  }
  root.traverse((child) => {
    if (!isMesh(child) || child.userData.generatedOptimizedMesh !== true || existingGeneratedMeshes.has(child)) {
      return;
    }
    child.userData.perfOwnerSummary = ownerSummary;
  });
}

function ownerInfoFor(object: THREE.Object3D): Pick<OwnerSummaryEntry, 'ownerKey' | 'ownerLabel' | 'ownerType'> | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const data = current.userData;
    const ownerKey = data.perfOwnerKey;
    if (typeof ownerKey === 'string' && ownerKey.length > 0) {
      const ownerLabel = data.perfOwnerLabel;
      const ownerType = data.perfOwnerType;
      return {
        ownerKey,
        ownerLabel: typeof ownerLabel === 'string' && ownerLabel.length > 0 ? ownerLabel : ownerKey,
        ownerType: typeof ownerType === 'string' && ownerType.length > 0 ? ownerType : null,
      };
    }
    current = current.parent;
  }
  return null;
}

function triangleCountFor(geometry: THREE.BufferGeometry): number {
  const indexCount = Number(geometry.index?.count ?? 0);
  if (indexCount > 0) {
    return Math.round(indexCount / 3);
  }
  const positionCount = Number(geometry.attributes.position?.count ?? 0);
  return positionCount > 0 ? Math.round(positionCount / 3) : 0;
}

function isMesh(value: THREE.Object3D): value is THREE.Mesh {
  return value instanceof THREE.Mesh || (value as THREE.Object3D & { isMesh?: boolean }).isMesh === true;
}

function normalizeInterleavedGeometryAttributes(
  root: THREE.Object3D,
  excludeMesh?: (mesh: THREE.Mesh) => boolean,
): void {
  root.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }

    const mesh = child;
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

