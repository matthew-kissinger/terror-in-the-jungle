import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { NoiseHeightProvider } from './NoiseHeightProvider';

/**
 * Generates height data for terrain chunks using multi-layer noise composition.
 * Delegates to NoiseHeightProvider for the actual height algorithm.
 */
export class ChunkHeightGenerator {
  /**
   * Generate height at a specific world position using multi-layer noise
   */
  static generateHeightAt(
    worldX: number,
    worldZ: number,
    noiseGenerator: NoiseGenerator
  ): number {
    return NoiseHeightProvider.calculateHeight(worldX, worldZ, noiseGenerator);
  }

  /**
   * Generate height data array for a chunk
   */
  static generateHeightData(
    chunkX: number,
    chunkZ: number,
    size: number,
    segments: number,
    noiseGenerator: NoiseGenerator
  ): Float32Array {
    const worldOffsetX = chunkX * size;
    const worldOffsetZ = chunkZ * size;
    const resolution = segments;
    const dataSize = (resolution + 1) * (resolution + 1);
    const heightData = new Float32Array(dataSize);

    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const worldX = worldOffsetX + (x / resolution) * size;
        const worldZ = worldOffsetZ + (z / resolution) * size;

        const height = NoiseHeightProvider.calculateHeight(worldX, worldZ, noiseGenerator);

        const idx = z * (resolution + 1) + x;
        heightData[idx] = height;
      }
    }

    return heightData;
  }
}
