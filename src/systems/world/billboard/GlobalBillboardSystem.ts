import * as THREE from 'three';
import { GameSystem, BillboardInstance } from '../../../types';
import { AssetLoader } from '../../assets/AssetLoader';
import { GPUBillboardSystem } from './GPUBillboardSystem';
import { BillboardVegetationTypes } from './BillboardVegetationTypes';
import { BillboardInstanceManager } from './BillboardInstanceManager';
import { BillboardRenderer } from './BillboardRenderer';
import { Logger } from '../../../utils/Logger';

export class GlobalBillboardSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;

  // GPU system for vegetation (performance critical)
  private gpuVegetationSystem: GPUBillboardSystem;

  // CPU system kept for NPCs (AI integration)
  private vegetationTypes: BillboardVegetationTypes;
  private instanceManager!: BillboardInstanceManager;
  private renderer!: BillboardRenderer;

  // Toggle to use GPU for vegetation
  private useGPUForVegetation = true;

  // Exclusion zones where vegetation should not spawn
  private exclusionZones: Array<{ x: number; z: number; radius: number }> = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;

    // Initialize GPU system for vegetation
    this.gpuVegetationSystem = new GPUBillboardSystem(scene, assetLoader);

    // Keep CPU system for potential NPC use
    this.vegetationTypes = new BillboardVegetationTypes(scene, assetLoader);
  }

  async init(): Promise<void> {
    if (this.useGPUForVegetation) {
      // Use GPU for vegetation (high performance)
      await this.gpuVegetationSystem.initialize();
      Logger.info('World', 'Using GPU billboard system for vegetation');
    } else {
      // Fallback to CPU system if needed
      const meshes = await this.vegetationTypes.initializeAll();
      this.instanceManager = new BillboardInstanceManager(meshes);
      this.renderer = new BillboardRenderer(this.camera, meshes, this.instanceManager);
      Logger.info('World', 'Using CPU billboard system');
    }
  }

  update(deltaTime: number, fog?: THREE.FogExp2 | null): void {
    if (this.useGPUForVegetation) {
      this.gpuVegetationSystem.update(this.camera, deltaTime, fog);
    } else if (this.renderer) {
      this.renderer.update(deltaTime);
    }
  }

  dispose(): void {
    if (this.useGPUForVegetation) {
      this.gpuVegetationSystem.dispose();
    } else if (this.vegetationTypes) {
      this.vegetationTypes.dispose();
    }
    Logger.info('World', 'Global Billboard System disposed');
  }

  /**
   * Add billboard instances for a specific chunk
   */
  addChunkInstances(
    chunkKey: string,
    fernInstances?: BillboardInstance[],
    elephantEarInstances?: BillboardInstance[],
    fanPalmInstances?: BillboardInstance[],
    coconutInstances?: BillboardInstance[],
    arecaInstances?: BillboardInstance[],
    dipterocarpInstances?: BillboardInstance[],
    banyanInstances?: BillboardInstance[]
  ): void {
    if (this.useGPUForVegetation) {
      // Filter all vegetation types through exclusion zones
      const filteredFern = fernInstances ? this.filterVegetationInstances(fernInstances) : undefined;
      const filteredElephantEar = elephantEarInstances ? this.filterVegetationInstances(elephantEarInstances) : undefined;
      const filteredFanPalm = fanPalmInstances ? this.filterVegetationInstances(fanPalmInstances) : undefined;
      const filteredCoconut = coconutInstances ? this.filterVegetationInstances(coconutInstances) : undefined;
      const filteredAreca = arecaInstances ? this.filterVegetationInstances(arecaInstances) : undefined;
      const filteredDipterocarp = dipterocarpInstances ? this.filterVegetationInstances(dipterocarpInstances) : undefined;
      const filteredBanyan = banyanInstances ? this.filterVegetationInstances(banyanInstances) : undefined;

      // Convert to GPU format and add
      const types: Array<[string, BillboardInstance[] | undefined]> = [
        ['fern', filteredFern],
        ['elephantEar', filteredElephantEar],
        ['fanPalm', filteredFanPalm],
        ['coconut', filteredCoconut],
        ['areca', filteredAreca],
        ['dipterocarp', filteredDipterocarp],
        ['banyan', filteredBanyan]
      ];

      let totalAdded = 0;
      for (const [type, instances] of types) {
        if (instances && instances.length > 0) {
          this.gpuVegetationSystem.addChunkInstances(chunkKey, type, instances);
          totalAdded += instances.length;
        }
      }

      if (totalAdded > 0) {
        Logger.debug('World', `GPU: Added ${totalAdded} vegetation instances for chunk ${chunkKey}`);
      }
    } else if (this.instanceManager) {
      // Filter vegetation for CPU system too
      this.instanceManager.addChunkInstances(
        chunkKey,
        fernInstances ? this.filterVegetationInstances(fernInstances) : fernInstances,
        elephantEarInstances ? this.filterVegetationInstances(elephantEarInstances) : elephantEarInstances,
        fanPalmInstances ? this.filterVegetationInstances(fanPalmInstances) : fanPalmInstances,
        coconutInstances ? this.filterVegetationInstances(coconutInstances) : coconutInstances,
        arecaInstances ? this.filterVegetationInstances(arecaInstances) : arecaInstances,
        dipterocarpInstances ? this.filterVegetationInstances(dipterocarpInstances) : dipterocarpInstances,
        banyanInstances ? this.filterVegetationInstances(banyanInstances) : banyanInstances
      );
    }
  }

  /**
   * Remove billboard instances for a specific chunk
   */
  removeChunkInstances(chunkKey: string): void {
    if (this.useGPUForVegetation) {
      this.gpuVegetationSystem.removeChunkInstances(chunkKey);
    } else if (this.instanceManager) {
      this.instanceManager.removeChunkInstances(chunkKey);
    }
  }

  /**
   * Add an exclusion zone where vegetation should not spawn and clear existing vegetation
   */
  addExclusionZone(x: number, z: number, radius: number): void {
    this.exclusionZones.push({ x, z, radius });
    Logger.info('World', `Added vegetation exclusion zone at (${x}, ${z}) with radius ${radius}`);

    // Clear existing vegetation in this area by regenerating affected chunks
    this.clearVegetationInArea(x, z, radius);
  }

  /**
   * Clear existing vegetation in a specific area by removing instances
   */
  private clearVegetationInArea(x: number, z: number, radius: number): void {
    if (this.useGPUForVegetation) {
      Logger.info('World', `Clearing existing vegetation in ${radius}m radius around (${x}, ${z})`);
      this.gpuVegetationSystem.clearInstancesInArea(x, z, radius);
    }
  }

  /**
   * Check if a position is within any exclusion zone
   */
  private isInExclusionZone(x: number, z: number): boolean {
    for (const zone of this.exclusionZones) {
      const distance = Math.sqrt((x - zone.x) ** 2 + (z - zone.z) ** 2);
      if (distance <= zone.radius) {
        return true;
      }
    }
    return false;
  }

  /**
   * Filter vegetation instances to exclude those in exclusion zones
   */
  private filterVegetationInstances(instances: BillboardInstance[]): BillboardInstance[] {
    if (this.exclusionZones.length === 0) {
      return instances;
    }

    return instances.filter(instance => !this.isInExclusionZone(instance.position.x, instance.position.z));
  }

  /**
   * Get total number of active instances by type
   */
  getInstanceCount(type: 'fern' | 'elephantEar' | 'fanPalm' | 'coconut' | 'areca' | 'dipterocarp' | 'banyan'): number {
    if (this.instanceManager) {
      return this.instanceManager.getInstanceCount(type);
    }
    return 0;
  }

  /**
   * Get debug information about the system
   */
  getDebugInfo(): { [key: string]: number } {
    if (this.useGPUForVegetation) {
      return this.gpuVegetationSystem.getDebugInfo();
    } else if (this.instanceManager) {
      return this.instanceManager.getDebugInfo();
    }
    return { chunksTracked: 0 };
  }
}