import * as THREE from 'three';
import { GameSystem, BillboardInstance } from '../../../types';
import { AssetLoader } from '../../assets/AssetLoader';
import { GPUBillboardSystem } from './GPUBillboardSystem';
import type { BillboardLighting } from './BillboardBufferManager';
import { Logger } from '../../../utils/Logger';
import { VegetationTypeConfig, VEGETATION_TYPES } from '../../../config/vegetationTypes';
import { BiomeConfig, getBiome } from '../../../config/biomes';
import type { TerrainExclusionZone } from '../../terrain/TerrainFeatureTypes';

export class GlobalBillboardSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;

  private gpuSystem: GPUBillboardSystem;
  private initialized = false;

  private exclusionZones: Array<{ x: number; z: number; radius: number }> = [];

  /** The active vegetation types for the current biome/mode. */
  private activeTypes: VegetationTypeConfig[] = VEGETATION_TYPES;

  /** Ordered biome set participating in the active mode/runtime. */
  private activeBiomes: BiomeConfig[] = [getBiome('denseJungle')];

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
  configure(biomeIds?: string | string[]): void {
    const ids = biomeIds === undefined
      ? ['denseJungle']
      : Array.isArray(biomeIds)
        ? biomeIds
        : [biomeIds];

    const seen = new Set<string>();
    this.activeBiomes = ids
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((id) => getBiome(id));

    // Filter vegetation types to the union of all biome palettes in play.
    const paletteIds = new Set(
      this.activeBiomes.flatMap((biome) => biome.vegetationPalette.map((entry) => entry.typeId))
    );
    this.activeTypes = VEGETATION_TYPES.filter(t => paletteIds.has(t.id));

    if (this.initialized) {
      this.rebuildGPUVegetationTypes();
    }
  }

  getActiveBiome(): BiomeConfig {
    return this.activeBiomes[0];
  }

  getActiveBiomes(): BiomeConfig[] {
    return [...this.activeBiomes];
  }

  getActiveVegetationTypes(): VegetationTypeConfig[] {
    return this.activeTypes;
  }

  async init(): Promise<void> {
    await this.gpuSystem.initializeFromConfig(this.activeTypes);
    this.initialized = true;
    Logger.info('World', `Billboard system initialized (${this.activeTypes.length} types, biomes=${this.activeBiomes.map(b => b.id).join(',')})`);
  }

  update(
    deltaTime: number,
    fog?: THREE.FogExp2 | null,
    lighting?: BillboardLighting | null,
  ): void {
    this.gpuSystem.update(this.camera, deltaTime, fog, lighting);
  }

  dispose(): void {
    this.gpuSystem.dispose();
    this.initialized = false;
    Logger.info('World', 'Global Billboard System disposed');
  }

  private rebuildGPUVegetationTypes(): void {
    this.gpuSystem.dispose();
    this.gpuSystem = new GPUBillboardSystem(this.scene, this.assetLoader);
    void this.gpuSystem.initializeFromConfig(this.activeTypes);
    Logger.info('World', `Billboard vegetation reconfigured (${this.activeTypes.length} types, biomes=${this.activeBiomes.map(b => b.id).join(',')})`);
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

  setExclusionZones(zones: TerrainExclusionZone[]): void {
    this.exclusionZones = zones.map((zone) => ({ x: zone.x, z: zone.z, radius: zone.radius }));
    for (const zone of this.exclusionZones) {
      this.clearVegetationInArea(zone.x, zone.z, zone.radius);
    }
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
