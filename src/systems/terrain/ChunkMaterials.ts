import * as THREE from 'three';
import { BiomeTexturePool } from './BiomeTexturePool';

/**
 * Creates materials for terrain chunks via the shared BiomeTexturePool.
 */
export class ChunkMaterials {
  static createTerrainMaterial(
    pool: BiomeTexturePool,
    biomeId: string,
    debugMode: boolean
  ): THREE.Material {
    return pool.getMaterial(biomeId, debugMode);
  }
}
