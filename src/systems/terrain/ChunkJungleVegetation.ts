import * as THREE from 'three';
import { BillboardInstance } from '../../types';
import { MathUtils } from '../../utils/Math';
import { VegetationData } from './ChunkWorkerPool';

export interface JungleVegetationInstances {
  fernInstances: BillboardInstance[];
  elephantEarInstances: BillboardInstance[];
  fanPalmInstances: BillboardInstance[];
  coconutInstances: BillboardInstance[];
  arecaInstances: BillboardInstance[];
  dipterocarpInstances: BillboardInstance[];
  banyanInstances: BillboardInstance[];
}

/**
 * Generates jungle vegetation for terrain chunks
 */
export class ChunkJungleVegetation {
  /**
   * Generate vegetation instances for a chunk
   * @param chunkX - Chunk X coordinate
   * @param chunkZ - Chunk Z coordinate
   * @param size - Chunk size in world units
   * @param getHeightAtLocal - Function to query height at local coordinates
   * @returns Vegetation instances grouped by type
   */
  static generateVegetation(
    chunkX: number,
    chunkZ: number,
    size: number,
    getHeightAtLocal: (localX: number, localZ: number) => number
  ): JungleVegetationInstances {
    const baseX = chunkX * size;
    const baseZ = chunkZ * size;

    const instances: JungleVegetationInstances = {
      fernInstances: [],
      elephantEarInstances: [],
      fanPalmInstances: [],
      coconutInstances: [],
      arecaInstances: [],
      dipterocarpInstances: [],
      banyanInstances: []
    };

    // Fixed density calculations - tuned for performance across many chunks
    const DENSITY_PER_UNIT = 1.0 / 128.0; // Reduced base density: 1 item per 128 square units

    // LAYER 1: Dense fern ground cover (covers most areas)
    const fernCount = Math.floor(size * size * DENSITY_PER_UNIT * 6.0); // Reduced multiplier
    for (let i = 0; i < fernCount; i++) {
      const localX = Math.random() * size;
      const localZ = Math.random() * size;
      const height = getHeightAtLocal(localX, localZ);

      instances.fernInstances.push({
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

      instances.elephantEarInstances.push({
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

      instances.fanPalmInstances.push({
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
        instances.coconutInstances.push({
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

      instances.arecaInstances.push({
        position: new THREE.Vector3(baseX + point.x, height + 1.6, baseZ + point.y),
        scale: new THREE.Vector3(
          MathUtils.randomInRange(0.8, 1.0),
          MathUtils.randomInRange(0.8, 1.0),
          1
        ),
        rotation: 0 // Billboards always face camera, no rotation needed
      });
    }

    // LAYER 4: Giant Canopy Trees - Common throughout jungle
    const giantTreePoints = MathUtils.poissonDiskSampling(size, size, 16);
    const maxGiantTrees = Math.floor(size * size * DENSITY_PER_UNIT * 0.15); // Reduced
    for (let i = 0; i < Math.min(giantTreePoints.length, maxGiantTrees); i++) {
      const point = giantTreePoints[i];
      const height = getHeightAtLocal(point.x, point.y);

      // Alternate between Dipterocarp and Banyan
      if (i % 2 === 0) {
        instances.dipterocarpInstances.push({
          position: new THREE.Vector3(baseX + point.x, height + 8.0, baseZ + point.y),
          scale: new THREE.Vector3(
            MathUtils.randomInRange(0.9, 1.1),
            MathUtils.randomInRange(0.9, 1.1),
            1
          ),
          rotation: 0 // Billboards always face camera, no rotation needed
        });
      } else {
        instances.banyanInstances.push({
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

    return instances;
  }

  /**
   * Apply vegetation positions computed by worker
   * @param veg - Worker-provided vegetation data
   * @returns Vegetation instances grouped by type
   */
  static applyWorkerVegetation(veg: VegetationData): JungleVegetationInstances {
    const instances: JungleVegetationInstances = {
      fernInstances: [],
      elephantEarInstances: [],
      fanPalmInstances: [],
      coconutInstances: [],
      arecaInstances: [],
      dipterocarpInstances: [],
      banyanInstances: []
    };

    // Convert worker data to BillboardInstance format
    for (const p of veg.fern) {
      instances.fernInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.elephantEar) {
      instances.elephantEarInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.fanPalm) {
      instances.fanPalmInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.coconut) {
      instances.coconutInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.areca) {
      instances.arecaInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.dipterocarp) {
      instances.dipterocarpInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }
    for (const p of veg.banyan) {
      instances.banyanInstances.push({
        position: new THREE.Vector3(p.x, p.y, p.z),
        scale: new THREE.Vector3(p.sx, p.sy, 1),
        rotation: 0
      });
    }

    return instances;
  }
}
