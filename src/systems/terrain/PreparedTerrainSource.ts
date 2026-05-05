import type { HeightProviderConfig } from './IHeightProvider';

export interface PreparedHeightmapGrid {
  data: Float32Array;
  gridSize: number;
  workerConfig: HeightProviderConfig;
}

export interface PreparedTerrainSource {
  kind: 'procedural' | 'dem' | 'prebaked';
  preparedHeightmap?: PreparedHeightmapGrid;
  /** Deterministic source identity for runtime navmesh cache invalidation. */
  terrainFingerprint?: string | number;
}
