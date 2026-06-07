// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

export interface TerrainPlacementSurface {
  getHeightAt?: (x: number, z: number) => number;
}

export interface WaterPlacementSurface {
  getWaterSurfaceY?: (position: THREE.Vector3) => number | null;
}

export type TerrainPlacementSource = 'base' | 'terrain' | 'water';

export interface TerrainPlacementResult {
  position: THREE.Vector3;
  source: TerrainPlacementSource;
}

export function resolveGroundPlacement(
  base: THREE.Vector3,
  terrainSystem: TerrainPlacementSurface,
): TerrainPlacementResult {
  const position = base.clone();
  const height = terrainSystem.getHeightAt?.(base.x, base.z);

  if (typeof height === 'number' && Number.isFinite(height)) {
    position.y = height;
    return { position, source: 'terrain' };
  }

  return { position, source: 'base' };
}

export function resolveWatercraftPlacement(
  base: THREE.Vector3,
  args: {
    terrainSystem: TerrainPlacementSurface;
    waterSystem?: WaterPlacementSurface | null;
    waterEnabled?: boolean;
    freeboardMeters?: number;
  },
): TerrainPlacementResult {
  const waterEnabled = args.waterEnabled === true;
  if (waterEnabled && typeof args.waterSystem?.getWaterSurfaceY === 'function') {
    const waterY = args.waterSystem.getWaterSurfaceY(base);
    if (typeof waterY === 'number' && Number.isFinite(waterY)) {
      const position = base.clone();
      position.y = waterY + (args.freeboardMeters ?? 0);
      return { position, source: 'water' };
    }
  }

  return resolveGroundPlacement(base, args.terrainSystem);
}
