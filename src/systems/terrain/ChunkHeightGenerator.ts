import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { MathUtils } from '../../utils/Math';

/**
 * Generates height data for terrain chunks using multi-layer noise composition.
 * This module is shared between ImprovedChunk (main thread) and ChunkWorkerCode (web worker).
 */
export class ChunkHeightGenerator {
  /**
   * Generate height at a specific world position using multi-layer noise
   * @param worldX World X coordinate
   * @param worldZ World Z coordinate
   * @param noiseGenerator Noise generator instance (must match seed across threads)
   * @returns Height value (can be negative for underwater terrain)
   */
  static generateHeightAt(
    worldX: number,
    worldZ: number,
    noiseGenerator: NoiseGenerator
  ): number {
    // Continental/base terrain shape (very low frequency)
    let continentalHeight = noiseGenerator.noise(worldX * 0.001, worldZ * 0.001);
    
    // Mountain ridges using ridge noise (inverted absolute value)
    let ridgeNoise = 1 - Math.abs(noiseGenerator.noise(worldX * 0.003, worldZ * 0.003));
    ridgeNoise = Math.pow(ridgeNoise, 1.5);
    
    // Valley carving using erosion-like shaping
    let valleyNoise = noiseGenerator.noise(worldX * 0.008, worldZ * 0.008);
    valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);
    
    // Hills and medium features with varying persistence
    let hillNoise = 0;
    hillNoise += noiseGenerator.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
    hillNoise += noiseGenerator.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
    hillNoise += noiseGenerator.noise(worldX * 0.06, worldZ * 0.06) * 0.125;
    
    // Fine details
    let detailNoise = noiseGenerator.noise(worldX * 0.1, worldZ * 0.1) * 0.1;
    
    // Combine layers
    let height = 0;
    
    // Base elevation influenced by continental noise
    height += (continentalHeight * 0.5 + 0.5) * 30;
    
    // Add mountain ridges with smooth transitions
    const ridgeStrength = MathUtils.smoothstep(-0.3, 0.2, continentalHeight);
    height += ridgeNoise * 80 * ridgeStrength;
    
    // Carve valleys
    height += valleyNoise * 40;
    
    // Add hills with persistence falloff
    height += hillNoise * 35;
    
    // Add fine details
    height += detailNoise * 8;
    
    // Create water areas (lakes and rivers)
    const waterNoise = noiseGenerator.noise(worldX * 0.003, worldZ * 0.003);
    const riverNoise = noiseGenerator.noise(worldX * 0.01, worldZ * 0.01);
    
    // Lakes in low-lying areas
    if (waterNoise < -0.4 && height < 15) {
      height = -3 - waterNoise * 2; // Below water level (0)
    }
    // River valleys
    else if (Math.abs(riverNoise) < 0.1 && height < 25) {
      height = height * 0.3 - 2;
    }
    // Smooth lower valleys
    else if (height < 20) {
      height = height * 0.7;
    }
    
    // Allow negative heights for underwater terrain
    height = Math.max(-8, height);
    
    return height;
  }

  /**
   * Generate height data array for a chunk
   * @param chunkX Chunk X coordinate
   * @param chunkZ Chunk Z coordinate
   * @param size Chunk size in world units
   * @param segments Number of segments per chunk (resolution)
   * @param noiseGenerator Noise generator instance
   * @returns Float32Array of height values (row-major order: z * (segments + 1) + x)
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
    
    // Generate height data matching legacy terrain mapping (mountains, rivers, lakes)
    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const worldX = worldOffsetX + (x / resolution) * size;
        const worldZ = worldOffsetZ + (z / resolution) * size;
        
        const height = this.generateHeightAt(worldX, worldZ, noiseGenerator);
        
        // Store row-major (z, x)
        const idx = z * (resolution + 1) + x;
        heightData[idx] = height;
      }
    }
    
    return heightData;
  }
}
