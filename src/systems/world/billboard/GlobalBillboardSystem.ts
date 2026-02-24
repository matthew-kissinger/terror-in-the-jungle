import * as THREE from 'three';
import { GameSystem, BillboardInstance } from '../../../types';
import { AssetLoader } from '../../assets/AssetLoader';
import { GPUBillboardSystem } from './GPUBillboardSystem';
import { Logger } from '../../../utils/Logger';
import { VegetationTypeConfig, VEGETATION_TYPES } from '../../../config/vegetationTypes';
import { BiomeConfig, getBiome } from '../../../config/biomes';

export class GlobalBillboardSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;

  private gpuSystem: GPUBillboardSystem;

  private exclusionZones: Array<{ x: number; z: number; radius: number }> = [];

  /** The active vegetation types for the current biome/mode. */
  private activeTypes: VegetationTypeConfig[] = VEGETATION_TYPES;

  /** The active biome (used by generators to pick vegetation palette). */
  private activeBiome: BiomeConfig = getBiome('denseJungle');

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.gpuSystem = new GPUBillboardSystem(scene, assetLoader);
  }

  /**
   * Configure which biome / vegetation types are active before init().
   * Call this from the game mode setup before init().
   */
  configure(biomeId?: string): void {
    if (biomeId) {
      this.activeBiome = getBiome(biomeId);
    }

    // Filter vegetation types to only those present in the biome palette
    const paletteIds = new Set(this.activeBiome.vegetationPalette.map(e => e.typeId));
    this.activeTypes = VEGETATION_TYPES.filter(t => paletteIds.has(t.id));
  }

  getActiveBiome(): BiomeConfig {
    return this.activeBiome;
  }

  getActiveVegetationTypes(): VegetationTypeConfig[] {
    return this.activeTypes;
  }

  async init(): Promise<void> {
    await this.gpuSystem.initializeFromConfig(this.activeTypes);
    Logger.info('World', `Billboard system initialized (${this.activeTypes.length} types, biome=${this.activeBiome.id})`);
  }

  update(deltaTime: number, fog?: THREE.FogExp2 | null): void {
    this.gpuSystem.update(this.camera, deltaTime, fog);
  }

  dispose(): void {
    this.gpuSystem.dispose();
    Logger.info('World', 'Global Billboard System disposed');
  }

  /**
   * Add billboard instances for a chunk. Uses a generic map keyed by vegetation type id.
   */
  addChunkInstances(chunkKey: string, instancesByType: Map<string, BillboardInstance[]>): void {
    let totalAdded = 0;

    // Filter all types through exclusion zones, then forward to GPU system
    for (const [typeId, instances] of instancesByType) {
      if (instances.length === 0) continue;
      const filtered = this.filterVegetationInstances(instances);
      if (filtered.length === 0) continue;
      this.gpuSystem.addChunkInstances(chunkKey, typeId, filtered);
      totalAdded += filtered.length;
    }

    if (totalAdded > 0) {
      Logger.debug('World', `GPU: Added ${totalAdded} vegetation instances for chunk ${chunkKey}`);
    }
  }

  removeChunkInstances(chunkKey: string): void {
    this.gpuSystem.removeChunkInstances(chunkKey);
  }

  addExclusionZone(x: number, z: number, radius: number): void {
    this.exclusionZones.push({ x, z, radius });
    Logger.info('World', `Added vegetation exclusion zone at (${x}, ${z}) with radius ${radius}`);
    this.clearVegetationInArea(x, z, radius);
  }

  private clearVegetationInArea(x: number, z: number, radius: number): void {
    Logger.info('World', `Clearing existing vegetation in ${radius}m radius around (${x}, ${z})`);
    this.gpuSystem.clearInstancesInArea(x, z, radius);
  }

  private isInExclusionZone(x: number, z: number): boolean {
    for (const zone of this.exclusionZones) {
      const distance = Math.sqrt((x - zone.x) ** 2 + (z - zone.z) ** 2);
      if (distance <= zone.radius) return true;
    }
    return false;
  }

  private filterVegetationInstances(instances: BillboardInstance[]): BillboardInstance[] {
    if (this.exclusionZones.length === 0) return instances;
    return instances.filter(inst => !this.isInExclusionZone(inst.position.x, inst.position.z));
  }

  getDebugInfo(): { [key: string]: number } {
    return this.gpuSystem.getDebugInfo();
  }
}
