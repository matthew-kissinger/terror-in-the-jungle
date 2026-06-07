// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import {
  PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  type PixelForgeNpcFactionRuntimeConfig,
} from '../../../systems/combat/PixelForgeNpcRuntime';

export function cloneArmoryNpcMaterial(
  material: THREE.Material,
  factionConfig: PixelForgeNpcFactionRuntimeConfig,
): THREE.Material {
  const cloned = material.clone();
  if (!(cloned instanceof THREE.MeshStandardMaterial)) return cloned;
  const tuning = PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING[factionConfig.packageFaction];
  const materialNameParts = cloned.name.split('_');
  const token = materialNameParts[materialNameParts.length - 1];
  const tunedColor = token && tuning ? tuning[token] : undefined;
  if (tunedColor !== undefined) cloned.color.setHex(tunedColor);
  const isUniform = token === 'uniform' || token === 'trousers' || token === 'headgear' || token === 'accent';
  if (isUniform) cloned.color.offsetHSL(0, 0.08, 0.1);
  cloned.emissive.copy(cloned.color).multiplyScalar(isUniform ? 0.16 : 0.06);
  cloned.emissiveIntensity = isUniform ? 0.28 : 0.1;
  cloned.roughness = Math.max(cloned.roughness, 0.9);
  cloned.metalness = 0;
  cloned.needsUpdate = true;
  return cloned;
}
