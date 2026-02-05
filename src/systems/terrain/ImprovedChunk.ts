import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { AssetLoader } from '../assets/AssetLoader';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { BillboardInstance } from '../../types';
import { VegetationData } from './ChunkWorkerPool';
import { ChunkHeightGenerator } from './ChunkHeightGenerator';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';
import { TerrainMeshFactory } from './TerrainMeshFactory';
import { ChunkWorkerAdapter } from './ChunkWorkerAdapter';

// Extend Three.js BufferGeometry with BVH methods
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Module-level scratch objects to avoid per-call allocations
const _raycastRaycaster = new THREE.Raycaster();
const _raycastOrigin = new THREE.Vector3();
const _raycastDirection = new THREE.Vector3(0, -1, 0);

export class ImprovedChunk {
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;
  private chunkX: number;
  private chunkZ: number;
  private size: number;
  private segments: number = 32;
  
  // Terrain data
  private heightData: Float32Array;
  private terrainMesh?: THREE.Mesh;
  private terrainGeometry?: THREE.BufferGeometry;
  
  // Billboard instances - Full jungle layers
  private globalBillboardSystem: GlobalBillboardSystem;
  // Ground cover
  private fernInstances: BillboardInstance[] = [];          // Dense everywhere
  private elephantEarInstances: BillboardInstance[] = [];   // Sprinkled
  // Mid-level
  private fanPalmInstances: BillboardInstance[] = [];       // Near water/slopes
  private coconutInstances: BillboardInstance[] = [];       // Water edges
  private arecaInstances: BillboardInstance[] = [];         // Everywhere mid
  // Canopy giants
  private dipterocarpInstances: BillboardInstance[] = [];   // Rare huge
  private banyanInstances: BillboardInstance[] = [];        // Rare huge
  
  // Generation
  private noiseGenerator: NoiseGenerator;
  private isGenerated = false;
  
  // Debug
  private debugMode = false;

  // Skip terrain mesh rendering (GPU terrain handles visuals)
  private skipTerrainMesh: boolean;

  // Cached position (computed once, never changes)
  private _position: THREE.Vector3;

  constructor(
    scene: THREE.Scene,
    assetLoader: AssetLoader,
    chunkX: number,
    chunkZ: number,
    size: number,
    noiseGenerator: NoiseGenerator,
    globalBillboardSystem: GlobalBillboardSystem,
    skipTerrainMesh: boolean = false
  ) {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    this.noiseGenerator = noiseGenerator;
    this.globalBillboardSystem = globalBillboardSystem;
    this.skipTerrainMesh = skipTerrainMesh;

    // Initialize height data array
    const dataSize = (this.segments + 1) * (this.segments + 1);
    this.heightData = new Float32Array(dataSize);

    // Cache position (chunk position never changes after construction)
    this._position = new THREE.Vector3(
      this.chunkX * this.size + this.size / 2,
      0,
      this.chunkZ * this.size + this.size / 2
    );
  }

  async generate(): Promise<void> {
    if (this.isGenerated) return;

    // Generate height data first (always needed for vegetation placement)
    this.heightData = ChunkHeightGenerator.generateHeightData(
      this.chunkX,
      this.chunkZ,
      this.size,
      this.segments,
      this.noiseGenerator
    );

    // Create terrain mesh (skip if GPU terrain handles visuals)
    if (!this.skipTerrainMesh) {
      this.terrainMesh = TerrainMeshFactory.createTerrainMesh(
        this.heightData,
        this.chunkX,
        this.chunkZ,
        this.size,
        this.segments,
        this.assetLoader,
        this.debugMode
      );
      this.terrainGeometry = this.terrainMesh.geometry as THREE.BufferGeometry;
      this.scene.add(this.terrainMesh);

      // Debug verification
      const testHeight = this.getHeightAtLocal(this.size / 2, this.size / 2);
      Logger.info('terrain', ` Chunk (${this.chunkX}, ${this.chunkZ}) center height: ${testHeight.toFixed(2)}`);
    }

    // Generate vegetation positioned on terrain
    const vegetation = ChunkVegetationGenerator.generateVegetation(
      this.chunkX,
      this.chunkZ,
      this.size,
      (localX, localZ) => this.getHeightAtLocal(localX, localZ)
    );
    this.fernInstances = vegetation.fernInstances;
    this.elephantEarInstances = vegetation.elephantEarInstances;
    this.fanPalmInstances = vegetation.fanPalmInstances;
    this.coconutInstances = vegetation.coconutInstances;
    this.arecaInstances = vegetation.arecaInstances;
    this.dipterocarpInstances = vegetation.dipterocarpInstances;
    this.banyanInstances = vegetation.banyanInstances;

    // Register instances with global system
    const chunkKey = `${this.chunkX},${this.chunkZ}`;
    this.globalBillboardSystem.addChunkInstances(
      chunkKey,
      this.fernInstances,
      this.elephantEarInstances,
      this.fanPalmInstances,
      this.coconutInstances,
      this.arecaInstances,
      this.dipterocarpInstances,
      this.banyanInstances
    );


    this.isGenerated = true;
    Logger.info('terrain', ` ImprovedChunk (${this.chunkX}, ${this.chunkZ}) generated`);
  }

  /**
   * Generate chunk from worker-provided geometry data
   * Used when web workers are available for parallel terrain generation
   * @param bvhAlreadyComputed - If true, skip BVH computation (already done in worker)
   */
  async generateFromWorker(
    workerGeometry: THREE.BufferGeometry,
    workerHeightData: Float32Array,
    workerVegetation?: VegetationData,
    bvhAlreadyComputed: boolean = false
  ): Promise<void> {
    if (this.isGenerated) return;

    // Use worker-provided height data
    this.heightData = workerHeightData;

    // Delegate to ChunkWorkerAdapter for worker data processing
    const result = await ChunkWorkerAdapter.applyWorkerData(
      this.scene,
      this.assetLoader,
      this.chunkX,
      this.chunkZ,
      this.size,
      this.globalBillboardSystem,
      this.debugMode,
      this.skipTerrainMesh,
      workerGeometry,
      workerHeightData,
      workerVegetation,
      bvhAlreadyComputed,
      (localX, localZ) => this.getHeightAtLocal(localX, localZ)
    );

    // Apply results
    this.terrainMesh = result.terrainMesh;
    this.terrainGeometry = result.terrainGeometry;
    this.fernInstances = result.fernInstances;
    this.elephantEarInstances = result.elephantEarInstances;
    this.fanPalmInstances = result.fanPalmInstances;
    this.coconutInstances = result.coconutInstances;
    this.arecaInstances = result.arecaInstances;
    this.dipterocarpInstances = result.dipterocarpInstances;
    this.banyanInstances = result.banyanInstances;

    this.isGenerated = true;
  }


  /**
   * Get height at local chunk coordinates using direct height data lookup
   */
  private getHeightAtLocal(localX: number, localZ: number): number {
    // Clamp to chunk bounds
    localX = Math.max(0, Math.min(this.size, localX));
    localZ = Math.max(0, Math.min(this.size, localZ));
    
    // Convert to grid coordinates
    const gridX = (localX / this.size) * this.segments;
    const gridZ = (localZ / this.size) * this.segments;
    
    // Get integer grid positions
    const x0 = Math.floor(gridX);
    const x1 = Math.min(x0 + 1, this.segments);
    const z0 = Math.floor(gridZ);
    const z1 = Math.min(z0 + 1, this.segments);
    
    // Get fractional parts for interpolation
    const fx = gridX - x0;
    const fz = gridZ - z0;
    
    // Get heights at corners - using correct indexing
    const getIndex = (x: number, z: number) => z * (this.segments + 1) + x;
    
    const h00 = this.heightData[getIndex(x0, z0)];
    const h10 = this.heightData[getIndex(x1, z0)];
    const h01 = this.heightData[getIndex(x0, z1)];
    const h11 = this.heightData[getIndex(x1, z1)];
    
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    
    return h0 * (1 - fz) + h1 * fz;
  }

  /**
   * Get height at world coordinates using height data
   */
  getHeightAt(worldX: number, worldZ: number): number {
    // Convert to local coordinates
    const localX = worldX - (this.chunkX * this.size);
    const localZ = worldZ - (this.chunkZ * this.size);

    // Check bounds
    if (localX < 0 || localX > this.size || localZ < 0 || localZ > this.size) {
      return 0;
    }

    // Use direct height data lookup (works even without terrain mesh)
    return this.getHeightAtLocal(localX, localZ);
  }

  /**
   * Alternative: Get height using raycasting (more accurate for complex terrain)
   */
  getHeightAtRaycast(worldX: number, worldZ: number): number {
    if (!this.terrainMesh) return 0;

    // Reuse scratch objects instead of allocating per call
    _raycastOrigin.set(worldX, 1000, worldZ);
    _raycastRaycaster.set(_raycastOrigin, _raycastDirection);

    // Intersect with terrain mesh (uses BVH for speed)
    const intersects = _raycastRaycaster.intersectObject(this.terrainMesh);

    if (intersects.length > 0) {
      return intersects[0].point.y;
    }

    return 0;
  }

  dispose(): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      
      if (this.terrainGeometry) {
        (this.terrainGeometry as any).disposeBoundsTree();
        this.terrainGeometry.dispose();
      }
      
      if (this.terrainMesh.material instanceof THREE.Material) {
        this.terrainMesh.material.dispose();
      }
    }
    
    // Remove instances from global system
    const chunkKey = `${this.chunkX},${this.chunkZ}`;
    this.globalBillboardSystem.removeChunkInstances(chunkKey);
  }

  setVisible(visible: boolean): void {
    if (this.terrainMesh) {
      this.terrainMesh.visible = visible;
    }
  }

  getPosition(): THREE.Vector3 {
    return this._position;
  }

  isInBounds(worldX: number, worldZ: number): boolean {
    const baseX = this.chunkX * this.size;
    const baseZ = this.chunkZ * this.size;
    return worldX >= baseX && worldX < baseX + this.size &&
           worldZ >= baseZ && worldZ < baseZ + this.size;
  }

  setLODLevel(_level: number): void {
    // Future: Implement LOD switching
  }

  /**
   * Get the terrain mesh for raycasting operations
   */
  getTerrainMesh(): THREE.Mesh | undefined {
    return this.terrainMesh;
  }
}