// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { optimizeStaticModelDrawCalls } from '../assets/ModelDrawCallOptimizer';

export const FIXED_WING_PERF_CATEGORY = 'fixed_wing_aircraft';

export function optimizeFixedWingStaticDrawCalls(
  root: THREE.Object3D,
  configKey: string,
  propellerNames: ReadonlySet<string>,
): { sourceMeshCount: number; mergedMeshCount: number } {
  prepareFixedWingModelForStaticOptimization(root, propellerNames);
  const result = optimizeStaticModelDrawCalls(root, {
    batchNamePrefix: `${configKey.toLowerCase()}_static`,
    excludeMesh: (mesh) => isFixedWingPropellerMesh(mesh, propellerNames),
  });
  markFixedWingPerfCategory(root);
  return result;
}

export function prepareFixedWingModelForStaticOptimization(
  root: THREE.Object3D,
  propellerNames: ReadonlySet<string>,
): void {
  markFixedWingPerfCategory(root);
  bakeOpaqueFixedWingMaterialColors(root, (mesh) => isFixedWingPropellerMesh(mesh, propellerNames));
}

export function isFixedWingPropellerMesh(mesh: THREE.Mesh, propellerNames: ReadonlySet<string>): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current) {
    const nodeName = current.name.toLowerCase();
    for (const propName of propellerNames) {
      if (nodeName.includes(propName)) {
        return true;
      }
    }
    if (nodeName.includes('propeller') || nodeName.includes('prop')) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function markFixedWingPerfCategory(root: THREE.Object3D): void {
  root.userData.perfCategory = FIXED_WING_PERF_CATEGORY;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.userData.perfCategory = FIXED_WING_PERF_CATEGORY;
    }
  });
}

function bakeOpaqueFixedWingMaterialColors(
  root: THREE.Object3D,
  excludeMesh: (mesh: THREE.Mesh) => boolean,
): void {
  const sharedMaterials = new Map<string, THREE.MeshStandardMaterial>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || excludeMesh(child)) {
      return;
    }
    if (!(child.material instanceof THREE.MeshStandardMaterial) || shouldKeepFixedWingMaterialSeparate(child.material)) {
      return;
    }
    const position = child.geometry.getAttribute('position');
    if (!position) {
      return;
    }

    const sourceMaterial = child.material;
    const materialKey = fixedWingVertexColorMaterialKey(sourceMaterial);
    let sharedMaterial = sharedMaterials.get(materialKey);
    if (!sharedMaterial) {
      sharedMaterial = sourceMaterial.clone();
      sharedMaterial.name = `${sourceMaterial.name || 'fixed_wing'}_vertex_color`;
      sharedMaterial.color.setRGB(1, 1, 1);
      sharedMaterial.vertexColors = true;
      sharedMaterial.needsUpdate = true;
      sharedMaterials.set(materialKey, sharedMaterial);
    }

    child.geometry = child.geometry.clone();
    const color = sourceMaterial.color;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const offset = i * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    child.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    child.material = sharedMaterial;
  });
}

function shouldKeepFixedWingMaterialSeparate(material: THREE.MeshStandardMaterial): boolean {
  return material.transparent
    || material.opacity < 1
    || material.alphaTest > 0
    || material.map !== null
    || material.alphaMap !== null
    || material.normalMap !== null
    || material.roughnessMap !== null
    || material.metalnessMap !== null
    || material.emissiveMap !== null
    || material.aoMap !== null;
}

function fixedWingVertexColorMaterialKey(material: THREE.MeshStandardMaterial): string {
  return JSON.stringify({
    type: material.type,
    side: material.side,
    roughness: material.roughness,
    metalness: material.metalness,
    emissive: material.emissive.getHexString(),
    emissiveIntensity: material.emissiveIntensity,
    flatShading: material.flatShading,
    fog: material.fog,
    toneMapped: material.toneMapped,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    blending: material.blending,
    premultipliedAlpha: material.premultipliedAlpha,
  });
}
