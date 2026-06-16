// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { AssetLoader } from '../../assets/AssetLoader';
import { Logger } from '../../../utils/Logger';
import { GPUBillboardVegetation, GPUVegetationConfig, BillboardLighting } from './BillboardBufferManager';
import { VegetationTypeConfig } from '../../../config/vegetationTypes';

function shouldDisableVegetationNormalMapsForProof(): boolean {
  const globalScope = globalThis as { __KB_LOAD_DISABLE_VEGETATION_NORMALS__?: boolean };
  return globalScope.__KB_LOAD_DISABLE_VEGETATION_NORMALS__ === true;
}

function distanceSqFromBoundsToPoint(bounds: THREE.Box2, x: number, z: number): number {
  let dx = 0;
  if (x < bounds.min.x) {
    dx = bounds.min.x - x;
  } else if (x > bounds.max.x) {
    dx = x - bounds.max.x;
  }

  let dz = 0;
  if (z < bounds.min.y) {
    dz = bounds.min.y - z;
  } else if (z > bounds.max.y) {
    dz = z - bounds.max.y;
  }

  return dx * dx + dz * dz;
}

function boundsIntersectsZone(
  bounds: THREE.Box2,
  zone: { x: number; z: number; radius: number; radiusSq?: number },
): boolean {
  const radiusSq = zone.radiusSq ?? zone.radius * zone.radius;
  return distanceSqFromBoundsToPoint(bounds, zone.x, zone.z) <= radiusSq;
}

function pointInsideZone(x: number, z: number, zone: { x: number; z: number; radius: number; radiusSq?: number }): boolean {
  const dx = x - zone.x;
  const dz = z - zone.z;
  return dx * dx + dz * dz <= (zone.radiusSq ?? zone.radius * zone.radius);
}

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
    const disableNormalMaps = shouldDisableVegetationNormalMapsForProof();
    if (disableNormalMaps) {
      Logger.info('vegetation', 'KB-LOAD proof mode: vegetation normal maps disabled for this run');
    }

    const textureNames = new Set<string>();
    for (const vegType of types) {
      textureNames.add(vegType.textureName);
      if (!disableNormalMaps && vegType.shaderProfile === 'normal-lit' && vegType.normalTextureName) {
        textureNames.add(vegType.normalTextureName);
      }
    }
    await this.assetLoader.ensureTexturesLoaded([...textureNames]);

    for (const vegType of types) {
      const texture = this.assetLoader.getTexture(vegType.textureName);
      if (!texture) {
        Logger.warn('vegetation', `Texture not found for ${vegType.id} (${vegType.textureName}), skipping`);
        continue;
      }
      const shaderProfile = disableNormalMaps ? 'hemisphere' : vegType.shaderProfile;
      const normalTexture = !disableNormalMaps && shaderProfile === 'normal-lit' && vegType.normalTextureName
        ? this.assetLoader.getTexture(vegType.normalTextureName)
        : undefined;

      const config: GPUVegetationConfig = {
        maxInstances: vegType.maxInstances,
        texture,
        width: vegType.size,
        height: vegType.size,
        fadeDistance: vegType.fadeDistance,
        maxDistance: vegType.maxDistance,
        representation: vegType.representation,
        atlasProfile: vegType.atlasProfile,
        shaderProfile,
      };
      if (normalTexture) config.normalTexture = normalTexture;
      if (vegType.imposterAtlas) config.imposterAtlas = vegType.imposterAtlas;

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

  update(
    camera: THREE.Camera,
    _deltaTime: number,
    fog?: THREE.FogExp2 | null,
    lighting?: BillboardLighting | null,
    playerWorldPosition?: THREE.Vector3 | null,
  ): void {
    const time = performance.now() * 0.001;
    for (const vegetation of this.vegetationTypes.values()) {
      vegetation.update(camera, time, fog, lighting, playerWorldPosition);
    }
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

    this.chunkBounds.forEach((bounds, chunkKey) => {
      const distSq = distanceSqFromBoundsToPoint(bounds, centerX, centerZ);
      if (distSq > radiusSq) return;

      const chunkData = this.chunkInstances.get(chunkKey);
      if (!chunkData) return;

      chunkData.forEach((indices, type) => {
        const vegetation = this.vegetationTypes.get(type);
        if (!vegetation) return;

        const positions = vegetation.getInstancePositions();
        let indicesToRemove: number[] | null = null;
        let writeIndex = 0;

        for (let i = 0; i < indices.length; i++) {
          const index = indices[i];
          const i3 = index * 3;
          const x = positions[i3];
          const z = positions[i3 + 2];
          const dx = x - centerX;
          const dz = z - centerZ;
          if (dx * dx + dz * dz <= radiusSq) {
            if (indicesToRemove === null) {
              indicesToRemove = [];
            }
            indicesToRemove.push(index);
          } else {
            if (indicesToRemove !== null) {
              indices[writeIndex] = index;
            }
            writeIndex++;
          }
        }

        if (indicesToRemove !== null) {
          vegetation.removeInstances(indicesToRemove);
          totalCleared += indicesToRemove.length;
          indices.length = writeIndex;
          if (indices.length === 0) {
            chunkData.delete(type);
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

  clearInstancesInZones(zones: ReadonlyArray<{ x: number; z: number; radius: number; radiusSq?: number }>): void {
    if (zones.length === 0) return;

    let totalCleared = 0;

    this.chunkBounds.forEach((bounds, chunkKey) => {
      let intersectsAnyZone = false;
      for (const zone of zones) {
        if (boundsIntersectsZone(bounds, zone)) {
          intersectsAnyZone = true;
          break;
        }
      }
      if (!intersectsAnyZone) return;

      const chunkData = this.chunkInstances.get(chunkKey);
      if (!chunkData) return;

      chunkData.forEach((indices, type) => {
        const vegetation = this.vegetationTypes.get(type);
        if (!vegetation) return;

        const positions = vegetation.getInstancePositions();
        let indicesToRemove: number[] | null = null;
        let writeIndex = 0;

        for (let i = 0; i < indices.length; i++) {
          const index = indices[i];
          const i3 = index * 3;
          const x = positions[i3];
          const z = positions[i3 + 2];
          let inZone = false;
          for (const zone of zones) {
            if (pointInsideZone(x, z, zone)) {
              inZone = true;
              break;
            }
          }
          if (inZone) {
            if (indicesToRemove === null) {
              indicesToRemove = [];
            }
            indicesToRemove.push(index);
          } else {
            if (indicesToRemove !== null) {
              indices[writeIndex] = index;
            }
            writeIndex++;
          }
        }

        if (indicesToRemove !== null) {
          vegetation.removeInstances(indicesToRemove);
          totalCleared += indicesToRemove.length;
          indices.length = writeIndex;
          if (indices.length === 0) {
            chunkData.delete(type);
          }
        }
      });

      if (chunkData.size === 0) {
        this.chunkInstances.delete(chunkKey);
        this.chunkBounds.delete(chunkKey);
      }
    });

    Logger.info('vegetation', `Cleared ${totalCleared} vegetation instances across ${zones.length} exclusion zones`);
  }

  dispose(): void {
    this.vegetationTypes.forEach(vegetation => vegetation.dispose());
    this.vegetationTypes.clear();
    this.chunkInstances.clear();
  }
}
