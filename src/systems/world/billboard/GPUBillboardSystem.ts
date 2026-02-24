import * as THREE from 'three';
import { AssetLoader } from '../../assets/AssetLoader';
import { Logger } from '../../../utils/Logger';
import { GPUBillboardVegetation, GPUVegetationConfig } from './BillboardBufferManager';
import { VegetationTypeConfig } from '../../../config/vegetationTypes';

export type { GPUVegetationConfig };

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

  /**
   * Initialize from the vegetation type registry.
   * Only types whose texture is loaded will be created.
   */
  async initializeFromConfig(types: VegetationTypeConfig[]): Promise<void> {
    Logger.info('vegetation', 'Initializing GPU billboard system');

    for (const vegType of types) {
      const texture = this.assetLoader.getTexture(vegType.textureName);
      if (!texture) {
        Logger.warn('vegetation', `Texture not found for ${vegType.id} (${vegType.textureName}), skipping`);
        continue;
      }

      const config: GPUVegetationConfig = {
        maxInstances: vegType.maxInstances,
        texture,
        width: vegType.size,
        height: vegType.size,
        fadeDistance: vegType.fadeDistance,
        maxDistance: vegType.maxDistance,
      };

      const vegetation = new GPUBillboardVegetation(this.scene, config);
      this.vegetationTypes.set(vegType.id, vegetation);
      Logger.info('vegetation', `GPU billboard ${vegType.id} configured (max ${vegType.maxInstances})`);
    }

    Logger.info('vegetation', `GPU billboard system initialized with ${this.vegetationTypes.size} types`);
  }

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

  update(camera: THREE.Camera, _deltaTime: number, fog?: THREE.FogExp2 | null): void {
    const time = performance.now() * 0.001;
    this.vegetationTypes.forEach(vegetation => {
      vegetation.update(camera, time, fog);
    });
  }

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

  clearInstancesInArea(centerX: number, centerZ: number, radius: number): void {
    Logger.info('vegetation', `Clearing vegetation radius=${radius} around (${centerX}, ${centerZ})`);

    let totalCleared = 0;
    const radiusSq = radius * radius;
    const center = new THREE.Vector2(centerX, centerZ);

    this.chunkBounds.forEach((bounds, chunkKey) => {
      const distSq = bounds.distanceToPoint(center) ** 2;
      if (distSq > radiusSq) return;

      const chunkData = this.chunkInstances.get(chunkKey);
      if (!chunkData) return;

      chunkData.forEach((indices, type) => {
        const vegetation = this.vegetationTypes.get(type);
        if (!vegetation) return;

        const positions = vegetation.getInstancePositions();
        const indicesToRemove: number[] = [];
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
          if (remainingIndices.length === 0) {
            chunkData.delete(type);
          } else {
            chunkData.set(type, remainingIndices);
          }
        }
      });

      if (chunkData.size === 0) {
        this.chunkInstances.delete(chunkKey);
        this.chunkBounds.delete(chunkKey);
      }
    });

    Logger.info('vegetation', `Cleared ${totalCleared} vegetation instances`);
  }

  dispose(): void {
    this.vegetationTypes.forEach(vegetation => vegetation.dispose());
    this.vegetationTypes.clear();
    this.chunkInstances.clear();
  }
}
