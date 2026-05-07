import type { HeightProviderConfig } from './IHeightProvider';
import type { LoadedHydrologyBake } from './hydrology/HydrologyBakeManifest';

export interface PreparedHeightmapGrid {
  data: Float32Array;
  gridSize: number;
  workerConfig: HeightProviderConfig;
}

export interface PreparedTerrainSource {
  kind: 'procedural' | 'dem' | 'prebaked';
  preparedHeightmap?: PreparedHeightmapGrid;
  /** Optional hydrology cache preload for terrain material, vegetation, and water-surface consumers. */
  hydrologyBake?: LoadedHydrologyBake | null;
  /** Deterministic source identity for runtime navmesh cache invalidation. */
  terrainFingerprint?: string | number;
}
