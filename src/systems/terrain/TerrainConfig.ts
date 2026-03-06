import type { BiomeClassificationRule } from '../../config/biomes';

/**
 * Per-layer PBR terrain configuration (up to 4 layers for RGBA splatmap).
 */
export interface TerrainLayerConfig {
  id: string;
  albedoColor: number; // Fallback RGB hex when no texture loaded
  roughness: number;
  metalness: number;
  tileScale: number; // UV repeat per world unit
}

/**
 * Splatmap blending configuration.
 */
export interface SplatmapConfig {
  layers: TerrainLayerConfig[];
  triplanarSlopeThreshold: number; // dot(normal,up) below this uses triplanar (default 0.707 = 45 deg)
  antiTilingStrength: number; // 0 = none, 1 = full noise-based UV offset
}

/**
 * Top-level terrain system configuration.
 */
export interface TerrainSystemConfig {
  worldSize: number;
  visualMargin: number;
  maxLODLevels: number;
  lodRanges: number[]; // Per-level max distance from camera
  tileResolution: number; // Vertices per tile edge (e.g. 33 for 32 quads)
  heightProvider: 'noise' | 'dem';
  splatmap: SplatmapConfig;
  vegetationCellSize: number; // Cell size for vegetation scatter (metres)
  bvhRadius: number; // Near-field BVH mesh radius for raycasts
  bvhRebuildThreshold: number; // Rebuild BVH when player moves this far
  updateBudgetMs: number; // Per-frame budget for terrain update
}

/** Default 4-layer splatmap matching the existing biome textures. */
const DEFAULT_SPLATMAP: SplatmapConfig = {
  layers: [
    { id: 'grass', albedoColor: 0x3a5f0b, roughness: 0.85, metalness: 0.0, tileScale: 0.1 },
    { id: 'dirt', albedoColor: 0x6b4423, roughness: 0.9, metalness: 0.0, tileScale: 0.12 },
    { id: 'rock', albedoColor: 0x808080, roughness: 0.75, metalness: 0.05, tileScale: 0.08 },
    { id: 'sand', albedoColor: 0xc2b280, roughness: 0.95, metalness: 0.0, tileScale: 0.15 },
  ],
  triplanarSlopeThreshold: 0.707,
  antiTilingStrength: 0.3,
};

/**
 * Compute max LOD levels needed so LOD 0 vertex spacing stays ≤ targetSpacing.
 *
 * LOD 0 tile size = quadtreeWorldSize / 2^maxLODLevels.
 * Vertex spacing  = tileSize / tileQuads.
 * Solve for maxLODLevels ≥ log2(quadtreeWorldSize / (targetSpacing * tileQuads)).
 */
export function computeMaxLODLevels(
  worldSize: number,
  visualMargin: number,
  tileQuads: number = 32,
  targetSpacing: number = 4,
): number {
  const quadtreeSize = worldSize + visualMargin * 2;
  const needed = Math.ceil(Math.log2(quadtreeSize / (targetSpacing * tileQuads)));
  return Math.max(4, Math.min(8, needed));
}

/**
 * Compute default LOD ranges from world size and max LOD levels.
 * lodRanges[i] = baseTileSize * 4 * 2^i
 */
export function computeDefaultLODRanges(worldSize: number, maxLODLevels: number): number[] {
  const baseTileSize = worldSize / Math.pow(2, maxLODLevels);
  const ranges: number[] = [];
  for (let i = 0; i < maxLODLevels; i++) {
    ranges.push(baseTileSize * 4 * Math.pow(2, i));
  }
  return ranges;
}

/**
 * Build a complete config with sensible defaults.
 */
export function createTerrainConfig(overrides: Partial<TerrainSystemConfig> = {}): TerrainSystemConfig {
  const worldSize = overrides.worldSize ?? 1024;
  const maxLODLevels = overrides.maxLODLevels ?? 6;
  return {
    worldSize,
    visualMargin: overrides.visualMargin ?? 200,
    maxLODLevels,
    lodRanges: overrides.lodRanges ?? computeDefaultLODRanges(worldSize, maxLODLevels),
    tileResolution: overrides.tileResolution ?? 33,
    heightProvider: overrides.heightProvider ?? 'noise',
    splatmap: overrides.splatmap ?? DEFAULT_SPLATMAP,
    vegetationCellSize: overrides.vegetationCellSize ?? 128,
    bvhRadius: overrides.bvhRadius ?? 200,
    bvhRebuildThreshold: overrides.bvhRebuildThreshold ?? 50,
    updateBudgetMs: overrides.updateBudgetMs ?? 2,
  };
}

/**
 * Bootstrap terrain runtime config shape used by engine startup and mode wiring.
 */
export interface TerrainRuntimeBootstrapConfig {
  size: number;
  renderDistance: number;
  loadDistance: number;
  lodLevels: number;
  skipTerrainMesh?: boolean;
  defaultBiomeId?: string;
  biomeRules?: BiomeClassificationRule[];
}
