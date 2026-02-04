import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { BillboardInstance } from '../../types';
import { AssetLoader } from '../assets/AssetLoader';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { ChunkTerrain } from './ChunkTerrain';
import { ChunkVegetation } from './ChunkVegetation';

export class Chunk {
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;
  private chunkX: number;
  private chunkZ: number;
  private size: number;
  private noiseGenerator: NoiseGenerator;
  private globalBillboardSystem: GlobalBillboardSystem;

  // Refactored modules
  private terrain: ChunkTerrain;
  private vegetation: ChunkVegetation;

  // Terrain mesh
  private terrainMesh?: THREE.Mesh;

  // Enemy instances (not refactored yet as they're not fully implemented)
  private enemyInstances: BillboardInstance[] = [];

  // LOD state
  private currentLOD = 0;
  private isVisible = true;
  private isGenerated = false;

  // Position in world coordinates
  private worldPosition: THREE.Vector3;

  constructor(
    scene: THREE.Scene,
    assetLoader: AssetLoader,
    chunkX: number,
    chunkZ: number,
    size: number,
    noiseGenerator: NoiseGenerator,
    globalBillboardSystem: GlobalBillboardSystem
  ) {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    this.noiseGenerator = noiseGenerator;
    this.globalBillboardSystem = globalBillboardSystem;

    // Initialize modules
    this.terrain = new ChunkTerrain(noiseGenerator, assetLoader, size, chunkX, chunkZ);
    this.vegetation = new ChunkVegetation(assetLoader, noiseGenerator, size, chunkX, chunkZ);

    // Calculate world position (center of chunk)
    this.worldPosition = new THREE.Vector3(
      chunkX * size + size / 2,
      0,
      chunkZ * size + size / 2
    );
  }

  async generate(): Promise<void> {
    if (this.isGenerated) return;

    try {
      // Generate terrain first
      this.terrain.generateHeightData();
      this.terrainMesh = this.terrain.createTerrainMesh(this.scene);

      // Mark terrain as ready
      this.isGenerated = true;
      Logger.info('terrain', `🌍 Generated chunk terrain (${this.chunkX}, ${this.chunkZ})`);

      // Add vegetation after a small delay
      setTimeout(async () => {
        try {
          // Generate vegetation with height sampling function
          await this.vegetation.generateVegetation(
            (x, z) => this.terrain.sampleHeight(x, z)
          );

          // Register instances with global billboard system
          this.addInstancesToGlobalSystem();

          // Generate enemies (sparse)
          await this.generateEnemies();

          Logger.info('terrain', `🌳 Added vegetation to chunk (${this.chunkX}, ${this.chunkZ})`);
        } catch (error) {
          Logger.error('terrain', `Failed to add vegetation to chunk (${this.chunkX}, ${this.chunkZ}):`, error);
        }
      }, 100);

    } catch (error) {
      Logger.error('terrain', `❌ Failed to generate chunk (${this.chunkX}, ${this.chunkZ}):`, error);
      throw error;
    }
  }

  private async generateEnemies(): Promise<void> {
    // Generate enemies sparsely (only some chunks have them)
    const shouldHaveEnemies = Math.random() < 0.3;
    if (!shouldHaveEnemies) return;

    const texture = this.assetLoader.getTexture('imp');
    if (!texture) return;

    // Implementation would be similar to trees but for enemies
    // For now, just track enemy instances for future AI system
  }

  private addInstancesToGlobalSystem(): void {
    const chunkKey = `${this.chunkX},${this.chunkZ}`;
    this.globalBillboardSystem.addChunkInstances(
      chunkKey,
      this.vegetation.grassInstances,
      this.vegetation.treeInstances,
      this.vegetation.mushroomInstances,
      this.vegetation.wheatInstances,
      this.vegetation.tree1Instances,
      this.vegetation.tree2Instances,
      this.vegetation.tree3Instances
    );
  }

  // LOD and visibility management
  setLODLevel(level: number): void {
    if (this.currentLOD === level) return;
    this.currentLOD = level;
    // LOD is now handled by the global billboard system
  }

  setVisible(visible: boolean): void {
    if (this.isVisible === visible) return;
    this.isVisible = visible;

    if (this.terrainMesh) {
      this.terrainMesh.visible = visible;
    }
    // Billboard visibility is handled by the global billboard system
  }

  dispose(): void {
    // Remove from scene and dispose resources
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      (this.terrainMesh.material as THREE.Material).dispose();
    }

    // Clear instance arrays
    this.vegetation.grassInstances.length = 0;
    this.vegetation.treeInstances.length = 0;
    this.vegetation.tree1Instances.length = 0;
    this.vegetation.tree2Instances.length = 0;
    this.vegetation.tree3Instances.length = 0;
    this.vegetation.mushroomInstances.length = 0;
    this.vegetation.wheatInstances.length = 0;
    this.enemyInstances.length = 0;
  }

  // Public accessors
  getPosition(): THREE.Vector3 {
    return this.worldPosition.clone();
  }

  getHeightAt(worldX: number, worldZ: number): number {
    // Convert world coordinates to local chunk coordinates
    const localX = worldX - (this.chunkX * this.size);
    const localZ = worldZ - (this.chunkZ * this.size);

    // Validate that we're within this chunk
    if (localX < 0 || localX > this.size || localZ < 0 || localZ > this.size) {
      Logger.warn('terrain', `Height requested outside chunk bounds: (${localX}, ${localZ})`);
      return 0;
    }

    return this.terrain.sampleHeight(localX, localZ);
  }

  isInBounds(worldX: number, worldZ: number): boolean {
    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;

    return worldX >= baseX && worldX < baseX + this.size &&
           worldZ >= baseZ && worldZ < baseZ + this.size;
  }

  getBiomeType(): string {
    return this.vegetation.getBiomeType();
  }
}