import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { BillboardInstance } from '../../types';
import { VegetationData } from './ChunkWorkerPool';
import { ChunkHeightGenerator } from './ChunkHeightGenerator';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';
import { TerrainMeshFactory } from './TerrainMeshFactory';
import { ChunkWorkerAdapter } from './ChunkWorkerAdapter';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { BiomeTexturePool } from './BiomeTexturePool';
import { BiomeClassificationRule, getBiome } from '../../config/biomes';
import { classifyBiome, computeSlopeDeg } from './BiomeClassifier';
import { HeightQueryCache } from './HeightQueryCache';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const _raycastRaycaster = new THREE.Raycaster();
const _raycastOrigin = new THREE.Vector3();
const _raycastDirection = new THREE.Vector3(0, -1, 0);

export class ImprovedChunk {
  private scene: THREE.Scene;
  private chunkX: number;
  private chunkZ: number;
  private size: number;
  private segments: number = 32;

  private heightData: Float32Array;
  private terrainMesh?: THREE.Mesh;
  private terrainGeometry?: THREE.BufferGeometry;

  private globalBillboardSystem: GlobalBillboardSystem;
  private vegetationMap: Map<string, BillboardInstance[]> = new Map();

  private noiseGenerator: NoiseGenerator;
  private isGenerated = false;
  private debugMode = false;
  private skipTerrainMesh: boolean;
  private _position: THREE.Vector3;

  private biomeTexturePool: BiomeTexturePool;
  private biomeRules: BiomeClassificationRule[] | undefined;
  private defaultBiomeId: string;
  private heightQueryCache: HeightQueryCache;

  biomeId: string;

  constructor(
    scene: THREE.Scene,
    chunkX: number,
    chunkZ: number,
    size: number,
    noiseGenerator: NoiseGenerator,
    globalBillboardSystem: GlobalBillboardSystem,
    biomeTexturePool: BiomeTexturePool,
    heightQueryCache: HeightQueryCache,
    defaultBiomeId: string = 'denseJungle',
    biomeRules?: BiomeClassificationRule[],
    skipTerrainMesh: boolean = false,
  ) {
    this.scene = scene;
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    this.noiseGenerator = noiseGenerator;
    this.globalBillboardSystem = globalBillboardSystem;
    this.biomeTexturePool = biomeTexturePool;
    this.heightQueryCache = heightQueryCache;
    this.defaultBiomeId = defaultBiomeId;
    this.biomeRules = biomeRules;
    this.skipTerrainMesh = skipTerrainMesh;
    this.biomeId = defaultBiomeId;

    const dataSize = (this.segments + 1) * (this.segments + 1);
    this.heightData = new Float32Array(dataSize);

    this._position = new THREE.Vector3(
      this.chunkX * this.size + this.size / 2,
      0,
      this.chunkZ * this.size + this.size / 2
    );
  }

  private classifyChunkBiome(): void {
    const cx = this.chunkX * this.size + this.size / 2;
    const cz = this.chunkZ * this.size + this.size / 2;
    const elevation = this.heightQueryCache.getHeightAt(cx, cz);
    const slope = computeSlopeDeg(cx, cz, 4.0, (x, z) => this.heightQueryCache.getHeightAt(x, z));
    this.biomeId = classifyBiome(elevation, slope, this.biomeRules, this.defaultBiomeId);
  }

  async generate(): Promise<void> {
    if (this.isGenerated) return;

    this.heightData = ChunkHeightGenerator.generateHeightData(
      this.chunkX, this.chunkZ, this.size, this.segments, this.noiseGenerator
    );

    this.classifyChunkBiome();

    if (!this.skipTerrainMesh) {
      const material = this.biomeTexturePool.getMaterial(this.biomeId, this.debugMode);
      this.terrainMesh = TerrainMeshFactory.createTerrainMesh(
        this.heightData, this.chunkX, this.chunkZ, this.size, this.segments,
        material,
      );
      this.terrainGeometry = this.terrainMesh.geometry as THREE.BufferGeometry;
      this.scene.add(this.terrainMesh);

      const testHeight = this.getHeightAtLocal(this.size / 2, this.size / 2);
      Logger.info('terrain', ` Chunk (${this.chunkX}, ${this.chunkZ}) biome=${this.biomeId} center height: ${testHeight.toFixed(2)}`);
    }

    const biome = getBiome(this.biomeId);
    const activeTypes = this.globalBillboardSystem.getActiveVegetationTypes();

    this.vegetationMap = ChunkVegetationGenerator.generateVegetation(
      this.chunkX, this.chunkZ, this.size,
      (localX, localZ) => this.getHeightAtLocal(localX, localZ),
      activeTypes, biome.vegetationPalette,
    );

    const chunkKey = `${this.chunkX},${this.chunkZ}`;
    this.globalBillboardSystem.addChunkInstances(chunkKey, this.vegetationMap);

    this.isGenerated = true;
    Logger.info('terrain', ` ImprovedChunk (${this.chunkX}, ${this.chunkZ}) generated`);
  }

  async generateFromWorker(
    workerGeometry: THREE.BufferGeometry,
    workerHeightData: Float32Array,
    workerVegetation?: VegetationData,
    bvhAlreadyComputed: boolean = false,
    workerBiomeId?: string,
  ): Promise<void> {
    if (this.isGenerated) return;

    this.heightData = workerHeightData;

    if (workerBiomeId) {
      this.biomeId = workerBiomeId;
    } else {
      this.classifyChunkBiome();
    }

    const biome = getBiome(this.biomeId);
    const material = this.biomeTexturePool.getMaterial(this.biomeId, this.debugMode);
    const activeTypes = this.globalBillboardSystem.getActiveVegetationTypes();

    const result = await ChunkWorkerAdapter.applyWorkerData(
      this.scene, material,
      this.chunkX, this.chunkZ, this.size,
      this.globalBillboardSystem,
      this.skipTerrainMesh,
      workerGeometry, workerHeightData, workerVegetation, bvhAlreadyComputed,
      (localX, localZ) => this.getHeightAtLocal(localX, localZ),
      activeTypes, biome.vegetationPalette,
    );

    this.terrainMesh = result.terrainMesh;
    this.terrainGeometry = result.terrainGeometry;
    this.vegetationMap = result.vegetationMap;

    this.isGenerated = true;
  }

  private getHeightAtLocal(localX: number, localZ: number): number {
    localX = Math.max(0, Math.min(this.size, localX));
    localZ = Math.max(0, Math.min(this.size, localZ));

    const gridX = (localX / this.size) * this.segments;
    const gridZ = (localZ / this.size) * this.segments;

    const x0 = Math.floor(gridX);
    const x1 = Math.min(x0 + 1, this.segments);
    const z0 = Math.floor(gridZ);
    const z1 = Math.min(z0 + 1, this.segments);

    const fx = gridX - x0;
    const fz = gridZ - z0;

    const getIndex = (x: number, z: number) => z * (this.segments + 1) + x;

    const h00 = this.heightData[getIndex(x0, z0)];
    const h10 = this.heightData[getIndex(x1, z0)];
    const h01 = this.heightData[getIndex(x0, z1)];
    const h11 = this.heightData[getIndex(x1, z1)];

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;

    return h0 * (1 - fz) + h1 * fz;
  }

  getHeightAt(worldX: number, worldZ: number): number {
    const localX = worldX - (this.chunkX * this.size);
    const localZ = worldZ - (this.chunkZ * this.size);
    if (localX < 0 || localX > this.size || localZ < 0 || localZ > this.size) return 0;
    return this.getHeightAtLocal(localX, localZ);
  }

  getHeightAtRaycast(worldX: number, worldZ: number): number {
    if (!this.terrainMesh) return 0;
    _raycastOrigin.set(worldX, 1000, worldZ);
    _raycastRaycaster.set(_raycastOrigin, _raycastDirection);
    const intersects = _raycastRaycaster.intersectObject(this.terrainMesh);
    if (intersects.length > 0) return intersects[0].point.y;
    return 0;
  }

  dispose(): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      if (this.terrainGeometry) {
        (this.terrainGeometry as any).disposeBoundsTree();
        this.terrainGeometry.dispose();
      }
      // Do NOT dispose the material - it's shared via BiomeTexturePool
    }
    const chunkKey = `${this.chunkX},${this.chunkZ}`;
    this.globalBillboardSystem.removeChunkInstances(chunkKey);
  }

  setVisible(visible: boolean): void {
    if (this.terrainMesh) this.terrainMesh.visible = visible;
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

  getTerrainMesh(): THREE.Mesh | undefined {
    return this.terrainMesh;
  }
}
