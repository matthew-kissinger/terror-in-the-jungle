import * as THREE from 'three';
import { BillboardInstance } from '../../types';
import { MathUtils } from '../../utils/Math';

/**
 * Generates vegetation instances for terrain chunks.
 * Handles placement of all vegetation layers (ferns, palms, trees, etc.)
 */
export class ChunkVegetationGenerator {
  /**
   * Generate all vegetation instances for a chunk
   * @param chunkX Chunk X coordinate
   * @param chunkZ Chunk Z coordinate
   * @param size Chunk size in world units
   * @param getHeightAtLocal Function to get height at local chunk coordinates
   * @returns Object containing arrays of BillboardInstance for each vegetation type
   */
  static generateVegetation(
    chunkX: number,
    chunkZ: number,
    size: number,
    getHeightAtLocal: (localX: number, localZ: number) => number
  ): {
    fernInstances: BillboardInstance[];
    elephantEarInstances: BillboardInstance[];
    fanPalmInstances: BillboardInstance[];
    coconutInstances: BillboardInstance[];
    arecaInstances: BillboardInstance[];
    dipterocarpInstances: BillboardInstance[];
    banyanInstances: BillboardInstance[];
  } {
    const baseX = chunkX * size;
    const baseZ = chunkZ * size;

    // Fixed density calculations - tuned for performance across many chunks
    const DENSITY_PER_UNIT = 1.0 / 128.0; // Reduced base density: 1 item per 128 square units

    const fernInstances: BillboardInstance[] = [];
    const elephantEarInstances: BillboardInstance[] = [];
    const fanPalmInstances: BillboardInstance[] = [];
    const coconutInstances: BillboardInstance[] = [];
    const arecaInstances: BillboardInstance[] = [];
    const dipterocarpInstances: BillboardInstance[] = [];
    const banyanInstances: BillboardInstance[] = [];

    // LAYER 1: Dense fern ground cover (covers most areas)
    const fernCount = Math.floor(size * size * DENSITY_PER_UNIT * 6.0); // Reduced multiplier
    for (let i = 0; i < fernCount; i++) {
      const localX = Math.random() * size;
      const localZ = Math.random() * size;
      const height = getHeightAtLocal(localX, localZ);
      
      fernInstances.push({
        position: new THREE.Vector3(baseX + localX, height + 0.2, baseZ + localZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(2.4, 3.6),
          MathUtils.randomInRange(2.4, 3.6),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }
    
    // LAYER 1B: Elephant ear plants sprinkled in
    const elephantEarCount = Math.floor(size * size * DENSITY_PER_UNIT * 0.8); // Reduced
    for (let i = 0; i < elephantEarCount; i++) {
      const localX = Math.random() * size;
      const localZ = Math.random() * size;
      const height = getHeightAtLocal(localX, localZ);
      
      elephantEarInstances.push({
        position: new THREE.Vector3(baseX + localX, height + 0.8, baseZ + localZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(1.0, 1.5),
          MathUtils.randomInRange(1.0, 1.5),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }
    
    // LAYER 2: Fan Palm Clusters - varied elevation, especially slopes
    const fanPalmCount = Math.floor(size * size * DENSITY_PER_UNIT * 0.5); // Reduced
    for (let i = 0; i < fanPalmCount; i++) {
      const localX = Math.random() * size;
      const localZ = Math.random() * size;
      const height = getHeightAtLocal(localX, localZ);
      
      fanPalmInstances.push({
        position: new THREE.Vector3(baseX + localX, height + 0.6, baseZ + localZ),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(0.8, 1.2),
          MathUtils.randomInRange(0.8, 1.2),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }
    
    // LAYER 2B: Coconut Palms - common throughout
    const coconutPoints = MathUtils.poissonDiskSampling(size, size, 12);
    const maxCoconuts = Math.floor(size * size * DENSITY_PER_UNIT * 0.3); // Reduced
    for (let i = 0; i < Math.min(coconutPoints.length * 0.5, maxCoconuts); i++) {
      const point = coconutPoints[i];
      const height = getHeightAtLocal(point.x, point.y);
      
      // Coconuts are common throughout
      if (Math.random() < 0.8) { // 80% chance instead of elevation-based
        coconutInstances.push({
          position: new THREE.Vector3(baseX + point.x, height + 2.0, baseZ + point.y),
          scale: new THREE.Vector3(
            MathUtils.randomInRange(0.8, 1.0),
            MathUtils.randomInRange(0.9, 1.1),
            1
          ),
          rotation: 0 // Billboards always face camera, no rotation needed
        });
      }
    }
    
    // LAYER 3: Areca Palm Clusters - everywhere as mid-size
    const arecaPoints = MathUtils.poissonDiskSampling(size, size, 8);
    const maxAreca = Math.floor(size * size * DENSITY_PER_UNIT * 0.4); // Reduced
    for (let i = 0; i < Math.min(arecaPoints.length * 0.8, maxAreca); i++) {
      const point = arecaPoints[i];
      const height = getHeightAtLocal(point.x, point.y);
      
      arecaInstances.push({
        position: new THREE.Vector3(baseX + point.x, height + 1.6, baseZ + point.y),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(0.8, 1.0),
          MathUtils.randomInRange(0.8, 1.0),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }
    
    // LAYER 4: Giant Canopy Trees - Common throughout
    const giantTreePoints = MathUtils.poissonDiskSampling(size, size, 16);
    const maxGiantTrees = Math.floor(size * size * DENSITY_PER_UNIT * 0.15); // Reduced
    for (let i = 0; i < Math.min(giantTreePoints.length, maxGiantTrees); i++) {
      const point = giantTreePoints[i];
      const height = getHeightAtLocal(point.x, point.y);
      
      // Alternate between Dipterocarp and Banyan
      if (i % 2 === 0) {
        dipterocarpInstances.push({
          position: new THREE.Vector3(baseX + point.x, height + 8.0, baseZ + point.y),
          scale: new THREE.Vector3(
            MathUtils.randomInRange(0.9, 1.1),
            MathUtils.randomInRange(0.9, 1.1),
            1
          ),
          rotation: 0 // Billboards always face camera, no rotation needed
        });
      } else {
        banyanInstances.push({
          position: new THREE.Vector3(baseX + point.x, height + 7.0, baseZ + point.y),
          scale: new THREE.Vector3(
            MathUtils.randomInRange(0.9, 1.1),
            MathUtils.randomInRange(0.9, 1.1),
            1
          ),
          rotation: 0 // Billboards always face camera, no rotation needed
        });
      }
    }

    return {
      fernInstances,
      elephantEarInstances,
      fanPalmInstances,
      coconutInstances,
      arecaInstances,
      dipterocarpInstances,
      banyanInstances
    };
  }
}
