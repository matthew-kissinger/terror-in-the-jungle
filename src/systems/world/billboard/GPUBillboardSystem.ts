import * as THREE from 'three';
import { AssetLoader } from '../../assets/AssetLoader';
import { Logger } from '../../../utils/Logger';
import { GPUBillboardVegetation, GPUVegetationConfig } from './BillboardBufferManager';

// Re-export for public API compatibility
export type { GPUVegetationConfig };

// Manager for multiple vegetation types
export class GPUBillboardSystem {
  private vegetationTypes: Map<string, GPUBillboardVegetation> = new Map();
  private chunkInstances: Map<string, Map<string, number[]>> = new Map();
  private chunkBounds: Map<string, THREE.Box2> = new Map();
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;

  constructor(scene: THREE.Scene, assetLoader: AssetLoader) {
    this.scene = scene;
    this.assetLoader = assetLoader;
  }

  async initialize(): Promise<void> {
    Logger.info('vegetation', 'Initializing GPU billboard system');

    // Initialize each vegetation type with GPU instancing
    const configs: Array<[string, GPUVegetationConfig]> = [
      ['fern', {
        maxInstances: 100000,  // Reduced from 200k
        texture: this.assetLoader.getTexture('Fern')!,
        width: 1.5,
        height: 2.0,
        fadeDistance: 200,  // Reduced fade distance
        maxDistance: 250
      }],
      ['elephantEar', {
        maxInstances: 30000,  // Reduced from 50k
        texture: this.assetLoader.getTexture('ElephantEarPlants')!,
        width: 2.5,
        height: 3.0,
        fadeDistance: 250,
        maxDistance: 300
      }],
      ['fanPalm', {
        maxInstances: 25000,  // Reduced from 40k
        texture: this.assetLoader.getTexture('FanPalmCluster')!,
        width: 3,
        height: 4,
        fadeDistance: 300,
        maxDistance: 350
      }],
      ['coconut', {
        maxInstances: 20000,  // Reduced from 30k
        texture: this.assetLoader.getTexture('CoconutPalm')!,
        width: 5,
        height: 7,
        fadeDistance: 350,
        maxDistance: 400
      }],
      ['areca', {
        maxInstances: 30000,  // Reduced from 50k
        texture: this.assetLoader.getTexture('ArecaPalmCluster')!,
        width: 4,
        height: 6,
        fadeDistance: 300,
        maxDistance: 350
      }],
      ['dipterocarp', {
        maxInstances: 10000,
        texture: this.assetLoader.getTexture('DipterocarpGiant')!,
        width: 15,
        height: 20,
        fadeDistance: 500,
        maxDistance: 600
      }],
      ['banyan', {
        maxInstances: 10000,
        texture: this.assetLoader.getTexture('TwisterBanyan')!,
        width: 14,
        height: 18,
        fadeDistance: 500,
        maxDistance: 600
      }]
    ];

    for (const [type, config] of configs) {
      if (config.texture) {
        const vegetation = new GPUBillboardVegetation(this.scene, config);
        this.vegetationTypes.set(type, vegetation);
        Logger.info('vegetation', `GPU billboard ${type} configured (max ${config.maxInstances})`);
      }
    }

    Logger.info('vegetation', 'GPU billboard system initialized');
  }

  // Add instances for a chunk
  addChunkInstances(
    chunkKey: string,
    type: string,
    instances: Array<{position: THREE.Vector3, scale: THREE.Vector3, rotation: number}>
  ): void {
    const vegetation = this.vegetationTypes.get(type);
    if (!vegetation) return;

    const indices = vegetation.addInstances(instances);

    if (!this.chunkInstances.has(chunkKey)) {
      this.chunkInstances.set(chunkKey, new Map());
    }

    this.chunkInstances.get(chunkKey)!.set(type, indices);

    // Update chunk bounds for spatial optimization
    let bounds = this.chunkBounds.get(chunkKey);
    if (!bounds) {
      bounds = new THREE.Box2();
      bounds.makeEmpty();
      this.chunkBounds.set(chunkKey, bounds);
    }

    for (const instance of instances) {
      const x = instance.position.x;
      const z = instance.position.z;

      if (x < bounds.min.x) bounds.min.x = x;
      if (z < bounds.min.y) bounds.min.y = z;
      if (x > bounds.max.x) bounds.max.x = x;
      if (z > bounds.max.y) bounds.max.y = z;
    }
  }

  // Remove all instances for a chunk
  removeChunkInstances(chunkKey: string): void {
    const chunkData = this.chunkInstances.get(chunkKey);
    if (!chunkData) return;

    let totalRemoved = 0;
    chunkData.forEach((indices, type) => {
      const vegetation = this.vegetationTypes.get(type);
      if (vegetation) {
        vegetation.removeInstances(indices);
        totalRemoved += indices.length;
      }
    });

    this.chunkInstances.delete(chunkKey);
    this.chunkBounds.delete(chunkKey);
    Logger.debug('vegetation', `GPU: Removed ${totalRemoved} vegetation instances for chunk ${chunkKey}`);
  }

  // Update all vegetation (called every frame)
  update(camera: THREE.Camera, deltaTime: number, fog?: THREE.FogExp2 | null): void {
    const time = performance.now() * 0.001; // Convert to seconds

    this.vegetationTypes.forEach(vegetation => {
      vegetation.update(camera, time, fog);
    });
  }

  // Get debug info
  getDebugInfo(): { [key: string]: number } {
    const info: { [key: string]: number } = {};

    this.vegetationTypes.forEach((vegetation, type) => {
      info[`${type}Active`] = vegetation.getInstanceCount();
      info[`${type}HighWater`] = vegetation.getHighWaterMark();
      info[`${type}Free`] = vegetation.getFreeSlotCount();
    });

    info.chunksTracked = this.chunkInstances.size;

    return info;
  }

  /**
   * Clear vegetation instances in a specific area
   */
  clearInstancesInArea(centerX: number, centerZ: number, radius: number): void {
    Logger.info('vegetation', `Clearing vegetation radius=${radius} around (${centerX}, ${centerZ})`);

    let totalCleared = 0;
    const radiusSq = radius * radius;
    const center = new THREE.Vector2(centerX, centerZ);

    // Use chunk bounds to skip chunks that are out of range
    this.chunkBounds.forEach((bounds, chunkKey) => {
      // Check if this chunk's bounding box is within range of the clearing circle
      // Distance from point to box
      const distSq = bounds.distanceToPoint(center) ** 2;
      if (distSq > radiusSq) {
        return; // Skip this chunk
      }

      const chunkData = this.chunkInstances.get(chunkKey);
      if (!chunkData) return;

      chunkData.forEach((indices, type) => {
        const vegetation = this.vegetationTypes.get(type);
        if (!vegetation) return;

        const positions = vegetation.getInstancePositions();
        const indicesToRemove: number[] = [];
        
        // Filter the indices in this chunk
        const remainingIndices: number[] = [];

        for (const index of indices) {
          const i3 = index * 3;
          const x = positions[i3];
          const z = positions[i3 + 2];

          const dx = x - centerX;
          const dz = z - centerZ;
          if (dx * dx + dz * dz <= radiusSq) {
            indicesToRemove.push(index);
          } else {
            remainingIndices.push(index);
          }
        }

        if (indicesToRemove.length > 0) {
          vegetation.removeInstances(indicesToRemove);
          totalCleared += indicesToRemove.length;
          
          // Update the chunk's instance list
          if (remainingIndices.length === 0) {
            chunkData.delete(type);
          } else {
            chunkData.set(type, remainingIndices);
          }
        }
      });

      // If all types are cleared for this chunk, remove chunk data
      if (chunkData.size === 0) {
        this.chunkInstances.delete(chunkKey);
        this.chunkBounds.delete(chunkKey);
      }
    });

    Logger.info('vegetation', `Cleared ${totalCleared} vegetation instances`);
  }

  // Dispose all resources
  dispose(): void {
    this.vegetationTypes.forEach(vegetation => vegetation.dispose());
    this.vegetationTypes.clear();
    this.chunkInstances.clear();
  }
}
