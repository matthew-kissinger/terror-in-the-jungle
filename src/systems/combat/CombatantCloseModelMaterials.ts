// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import {
  PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  type PixelForgeNpcFactionRuntimeConfig,
} from './PixelForgeNpcRuntime';

const SHARED_CLOSE_MODEL_MATERIAL_KEY = '__tijSharedNpcCloseMaterial';
const UNIQUE_CLOSE_MODEL_FADE_MATERIAL_KEY = '__tijUniqueNpcCloseFadeMaterial';

export interface CloseModelMaterialState {
  bindings: CloseModelMaterialBinding[];
  material: THREE.Material;
  baseMaterial: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

interface CloseModelMaterialBinding {
  mesh: THREE.Mesh;
  materialIndex: number | null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function applyCloseModelMaterialTuning(
  root: THREE.Object3D,
  factionConfig: PixelForgeNpcFactionRuntimeConfig,
  sharedMaterials: Map<string, THREE.Material>,
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => getSharedTunedCloseMaterial(
        sharedMaterials,
        material,
        factionConfig,
      ));
    } else {
      child.material = getSharedTunedCloseMaterial(sharedMaterials, child.material, factionConfig);
    }
  });
}

function getSharedTunedCloseMaterial(
  sharedMaterials: Map<string, THREE.Material>,
  material: THREE.Material,
  factionConfig: PixelForgeNpcFactionRuntimeConfig,
): THREE.Material {
  const tuning = PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING[factionConfig.packageFaction];
  const cacheKey = closeModelMaterialCacheKey(material, factionConfig.packageFaction, tuning);
  const cached = sharedMaterials.get(cacheKey);
  if (cached) return cached;
  const cloned = cloneTunedCloseMaterial(material, tuning);
  cloned.userData[SHARED_CLOSE_MODEL_MATERIAL_KEY] = true;
  sharedMaterials.set(cacheKey, cloned);
  return cloned;
}

function closeModelMaterialCacheKey(
  material: THREE.Material,
  packageFaction: PixelForgeNpcFactionRuntimeConfig['packageFaction'],
  tuning: Record<string, number> | undefined,
): string {
  const standard = material instanceof THREE.MeshStandardMaterial ? material : null;
  const textureIds = standard
    ? [
        standard.map?.uuid ?? '',
        standard.normalMap?.uuid ?? '',
        standard.roughnessMap?.uuid ?? '',
        standard.metalnessMap?.uuid ?? '',
        standard.alphaMap?.uuid ?? '',
        standard.emissiveMap?.uuid ?? '',
      ].join(',')
    : '';
  const tuningKey = tuning
    ? Object.keys(tuning)
        .sort()
        .map((key) => `${key}:${tuning[key].toString(16)}`)
        .join(',')
    : '';
  return [
    packageFaction,
    material.type,
    material.name,
    material.transparent ? 'transparent' : 'opaque',
    material.opacity.toFixed(4),
    material.depthWrite ? 'depth-write' : 'no-depth-write',
    material.side,
    material.alphaTest.toFixed(4),
    material.blending,
    standard?.color.getHexString() ?? '',
    standard?.emissive.getHexString() ?? '',
    standard?.roughness.toFixed(3) ?? '',
    standard?.metalness.toFixed(3) ?? '',
    textureIds,
    tuningKey,
  ].join('|');
}

function cloneTunedCloseMaterial(
  material: THREE.Material,
  tuning: Record<string, number> | undefined,
): THREE.Material {
  const cloned = material.clone();
  if (cloned instanceof THREE.MeshStandardMaterial) {
    const materialNameParts = cloned.name.split('_');
    const materialToken = materialNameParts[materialNameParts.length - 1];
    const tunedColor = materialToken && tuning ? tuning[materialToken] : undefined;
    if (tunedColor !== undefined) {
      cloned.color.setHex(tunedColor);
    }
    const isUniformSurface =
      materialToken === 'uniform' ||
      materialToken === 'trousers' ||
      materialToken === 'headgear' ||
      materialToken === 'accent';
    if (isUniformSurface) {
      cloned.color.offsetHSL(0, 0.08, 0.1);
    }
    cloned.emissive.copy(cloned.color).multiplyScalar(isUniformSurface ? 0.16 : 0.06);
    cloned.emissiveIntensity = isUniformSurface ? 0.28 : 0.1;
    cloned.roughness = Math.max(cloned.roughness, 0.9);
    cloned.metalness = 0;
    cloned.needsUpdate = true;
  }
  return cloned;
}

export function collectCloseModelMaterialStates(root: THREE.Object3D): CloseModelMaterialState[] {
  const states: CloseModelMaterialState[] = [];
  const byMaterial = new Map<THREE.Material, CloseModelMaterialState>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) {
      child.material.forEach((material, materialIndex) => {
        collectCloseModelMaterialState(states, byMaterial, material, { mesh: child, materialIndex });
      });
      return;
    }
    collectCloseModelMaterialState(states, byMaterial, child.material, { mesh: child, materialIndex: null });
  });
  return states;
}

function collectCloseModelMaterialState(
  states: CloseModelMaterialState[],
  byMaterial: Map<THREE.Material, CloseModelMaterialState>,
  material: THREE.Material,
  binding: CloseModelMaterialBinding,
): void {
  const existing = byMaterial.get(material);
  if (existing) {
    existing.bindings.push(binding);
    return;
  }
  const state: CloseModelMaterialState = {
    bindings: [binding],
    material,
    baseMaterial: material,
    opacity: material.opacity,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
  };
  byMaterial.set(material, state);
  states.push(state);
}

function assignCloseModelMaterial(state: CloseModelMaterialState, material: THREE.Material): void {
  for (const binding of state.bindings) {
    if (binding.materialIndex === null) {
      binding.mesh.material = material;
      continue;
    }
    const materials = Array.isArray(binding.mesh.material)
      ? binding.mesh.material.slice()
      : [binding.mesh.material];
    materials[binding.materialIndex] = material;
    binding.mesh.material = materials;
  }
  state.material = material;
}

function ensureCloseModelFadeMaterials(materialStates: CloseModelMaterialState[]): void {
  for (const state of materialStates) {
    if (state.material !== state.baseMaterial) continue;
    const material = state.baseMaterial.clone();
    material.userData[UNIQUE_CLOSE_MODEL_FADE_MATERIAL_KEY] = true;
    assignCloseModelMaterial(state, material);
  }
}

export function restoreCloseModelSharedMaterials(materialStates: CloseModelMaterialState[]): void {
  for (const state of materialStates) {
    if (state.material === state.baseMaterial) continue;
    const material = state.material;
    assignCloseModelMaterial(state, state.baseMaterial);
    if (material.userData[UNIQUE_CLOSE_MODEL_FADE_MATERIAL_KEY] === true) {
      material.dispose();
    }
  }
}

export function disposeSharedCloseModelMaterials(sharedMaterials: Map<string, THREE.Material>): void {
  sharedMaterials.forEach((material) => material.dispose());
  sharedMaterials.clear();
}

export function disposeCloseModelMaterialIfOwned(material: THREE.Material): void {
  if (material.userData[SHARED_CLOSE_MODEL_MATERIAL_KEY] === true) return;
  material.dispose();
}

export function setCloseModelOpacity(materialStates: CloseModelMaterialState[], opacity: number): void {
  const clamped = clamp01(opacity);
  if (clamped < 0.999) {
    ensureCloseModelFadeMaterials(materialStates);
  } else {
    restoreCloseModelSharedMaterials(materialStates);
  }
  for (const state of materialStates) {
    const material = state.material;
    const nextOpacity = state.opacity * clamped;
    const nextTransparent = state.transparent || clamped < 0.999;
    const nextDepthWrite = clamped >= 0.999 ? state.depthWrite : false;
    if (
      material.opacity === nextOpacity &&
      material.transparent === nextTransparent &&
      material.depthWrite === nextDepthWrite
    ) {
      continue;
    }
    const renderStateChanged =
      material.transparent !== nextTransparent ||
      material.depthWrite !== nextDepthWrite;
    material.opacity = nextOpacity;
    material.transparent = nextTransparent;
    material.depthWrite = nextDepthWrite;
    if (renderStateChanged) {
      material.needsUpdate = true;
    }
  }
}
