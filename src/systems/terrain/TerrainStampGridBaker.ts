import type { IHeightProvider } from './IHeightProvider';
import { applyResolvedStamp, resolveTerrainStamps } from './StampedHeightProvider';
import type { TerrainStampConfig } from './TerrainFeatureTypes';

export function bakeStampedHeightmapGrid(
  sourceData: Float32Array,
  gridSize: number,
  worldSize: number,
  baseProvider: IHeightProvider,
  stamps: TerrainStampConfig[],
): Float32Array {
  if (stamps.length === 0) {
    return sourceData;
  }

  const resolvedStamps = resolveTerrainStamps(baseProvider, stamps);
  const nextData = new Float32Array(sourceData);
  const halfWorld = worldSize * 0.5;
  const step = worldSize / (gridSize - 1);

  for (const stamp of resolvedStamps) {
    const bounds = getStampBounds(stamp);
    const minX = clampIndex(Math.floor((bounds.minX + halfWorld) / step), gridSize);
    const maxX = clampIndex(Math.ceil((bounds.maxX + halfWorld) / step), gridSize);
    const minZ = clampIndex(Math.floor((bounds.minZ + halfWorld) / step), gridSize);
    const maxZ = clampIndex(Math.ceil((bounds.maxZ + halfWorld) / step), gridSize);

    for (let z = minZ; z <= maxZ; z++) {
      const worldZ = -halfWorld + z * step;
      const rowOffset = z * gridSize;
      for (let x = minX; x <= maxX; x++) {
        const worldX = -halfWorld + x * step;
        const index = rowOffset + x;
        nextData[index] = applyResolvedStamp(nextData[index], worldX, worldZ, stamp);
      }
    }
  }

  return nextData;
}

function getStampBounds(
  stamp: ReturnType<typeof resolveTerrainStamps>[number],
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  switch (stamp.kind) {
    case 'flatten_circle':
      return {
        minX: stamp.centerX - stamp.gradeRadius,
        maxX: stamp.centerX + stamp.gradeRadius,
        minZ: stamp.centerZ - stamp.gradeRadius,
        maxZ: stamp.centerZ + stamp.gradeRadius,
      };
    case 'flatten_capsule': {
      const minX = Math.min(stamp.startX, stamp.endX) - stamp.gradeRadius;
      const maxX = Math.max(stamp.startX, stamp.endX) + stamp.gradeRadius;
      const minZ = Math.min(stamp.startZ, stamp.endZ) - stamp.gradeRadius;
      const maxZ = Math.max(stamp.startZ, stamp.endZ) + stamp.gradeRadius;
      return { minX, maxX, minZ, maxZ };
    }
  }
}

function clampIndex(value: number, gridSize: number): number {
  return Math.max(0, Math.min(gridSize - 1, value));
}
