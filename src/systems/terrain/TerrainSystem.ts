import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { AssetLoader } from '../assets/AssetLoader';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { type BiomeClassificationRule } from '../../config/biomes';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { Logger } from '../../utils/Logger';
import { getHeightQueryCache } from './HeightQueryCache';

import { TerrainRenderRuntime } from './TerrainRenderRuntime';
import { TerrainRaycastRuntime } from './TerrainRaycastRuntime';
import { TerrainSurfaceRuntime } from './TerrainSurfaceRuntime';
import { TerrainQueries } from './TerrainQueries';
import { VegetationScatterer } from './VegetationScatterer';
import { TerrainWorkerPool } from './TerrainWorkerPool';
import {
  buildTerrainVegetationRuntimeConfig,
} from './TerrainBiomeRuntimeConfig';
import { createTerrainConfig, computeDefaultLODRanges, type TerrainSystemConfig, type TerrainRuntimeBootstrapConfig } from './TerrainConfig';

/**
 * Top-level terrain runtime facade. Implements GameSystem.
 *
 * The public surface is intentionally being reduced toward truthful runtime
 * semantics instead of preserving chunk-era compatibility stubs.
 */
export class TerrainSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private assetLoader: AssetLoader;
  private billboardSystem: GlobalBillboardSystem;

  // Core subsystems
  private config: TerrainSystemConfig;
  private renderRuntime: TerrainRenderRuntime | null = null;
  private surfaceRuntime: TerrainSurfaceRuntime;
  private terrainQueries: TerrainQueries;
  private vegetationScatterer: VegetationScatterer;
  private workerPool: TerrainWorkerPool;
  private raycastRuntime: TerrainRaycastRuntime;

  // State
  private playerPosition = new THREE.Vector3();
  private isInitialized = false;

  // Runtime bootstrap/config state
  private chunkSize = 64;
  private renderDistance = 6;
  private explicitWorldSize: number | null = null;
  private defaultBiomeId = 'denseJungle';
  private biomeRules: BiomeClassificationRule[] = [];
  private surfaceWetness = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    assetLoader: AssetLoader,
    globalBillboardSystem: GlobalBillboardSystem,
    runtimeConfig: TerrainRuntimeBootstrapConfig = { size: 64, renderDistance: 6, loadDistance: 7, lodLevels: 4 },
  ) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.billboardSystem = globalBillboardSystem;

    this.chunkSize = runtimeConfig.size;
    this.renderDistance = runtimeConfig.renderDistance;
    this.defaultBiomeId = runtimeConfig.defaultBiomeId ?? 'denseJungle';
    this.biomeRules = runtimeConfig.biomeRules ?? [];
    // Default world extent follows startup config until a mode sets an explicit map size.
    const worldSize = this.computeWorldSize();

    this.config = createTerrainConfig({
      worldSize,
      maxLODLevels: runtimeConfig.lodLevels,
    });

    this.surfaceRuntime = new TerrainSurfaceRuntime(assetLoader, this.config.splatmap, this.config.tileResolution - 1);
    const losAccelerator = new LOSAccelerator();
    this.raycastRuntime = new TerrainRaycastRuntime(losAccelerator);
    this.terrainQueries = new TerrainQueries(losAccelerator);
    this.vegetationScatterer = new VegetationScatterer(globalBillboardSystem, this.config.vegetationCellSize);
    this.vegetationScatterer.setWorldSize(worldSize);
    this.workerPool = new TerrainWorkerPool();
  }

  // ──── GameSystem interface ────

  async init(): Promise<void> {
    if (this.isInitialized) return;

    const cache = getHeightQueryCache();
    let terrainMaterial: THREE.MeshStandardMaterial;
    try {
      terrainMaterial = this.surfaceRuntime.initialize(
        cache.getProvider(),
        this.config.worldSize,
        this.defaultBiomeId,
        this.biomeRules,
      );
    } catch (error) {
      Logger.error('terrain', error instanceof Error ? error.message : 'Failed to initialize terrain surface');
      return;
    }

    this.renderRuntime = new TerrainRenderRuntime(
      this.scene,
      this.camera,
      terrainMaterial,
      {
        worldSize: this.config.worldSize,
        maxLODLevels: this.config.maxLODLevels,
        lodRanges: this.config.lodRanges,
        tileResolution: this.config.tileResolution,
      },
    );
    this.renderRuntime.init();

    // Build initial BVH near-field mesh
    this.raycastRuntime.forceRebuildNearFieldMesh(
      this.playerPosition,
      this.config.bvhRadius,
      (x, z) => this.getHeightAt(x, z),
    );

    this.applyVegetationConfig();

    // Send height provider to workers
    const providerConfig = cache.getProvider().getWorkerConfig();
    this.workerPool.sendHeightProvider(providerConfig);

    this.isInitialized = true;
    Logger.info('terrain', `TerrainSystem initialized: ${this.config.worldSize}m world, ${this.config.maxLODLevels} LOD levels`);
  }

  update(deltaTime: number): void {
    if (!this.isInitialized) return;
    if (!this.renderRuntime) return;

    this.renderRuntime.update();

    // Update vegetation
    this.vegetationScatterer.update(this.playerPosition);

    this.raycastRuntime.updateNearFieldMesh(
      this.playerPosition,
      this.config.bvhRadius,
      this.config.bvhRebuildThreshold,
      (x, z) => this.getHeightAt(x, z),
    );
  }

  dispose(): void {
    this.renderRuntime?.dispose();
    this.renderRuntime = null;
    this.surfaceRuntime.dispose();
    this.terrainQueries.dispose();
    this.vegetationScatterer.dispose();
    this.workerPool.dispose();
    this.raycastRuntime.dispose();

    this.isInitialized = false;
  }

  // ──── Player tracking ────

  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  setSurfaceWetness(wetness: number): void {
    const clampedWetness = THREE.MathUtils.clamp(wetness, 0, 1);
    if (Math.abs(clampedWetness - this.surfaceWetness) < 0.001) {
      return;
    }
    this.surfaceWetness = clampedWetness;
    this.surfaceRuntime.setSurfaceWetness(clampedWetness);
  }

  // ──── Height queries ────

  getHeightAt(x: number, z: number): number {
    return this.terrainQueries.getHeightAt(x, z);
  }

  getEffectiveHeightAt(x: number, z: number): number {
    return this.terrainQueries.getEffectiveHeightAt(x, z);
  }

  // ──── Collision objects ────

  registerCollisionObject(id: string, object: THREE.Object3D): void {
    this.terrainQueries.registerCollisionObject(id, object);
  }

  unregisterCollisionObject(id: string): void {
    this.terrainQueries.unregisterCollisionObject(id);
  }

  checkObjectCollision(position: THREE.Vector3, radius?: number): boolean {
    return this.terrainQueries.checkObjectCollision(position, radius);
  }

  // ──── Raycasting ────

  raycastTerrain(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): { hit: boolean; point?: THREE.Vector3; distance?: number } {
    return this.terrainQueries.raycastTerrain(origin, direction, maxDistance);
  }

  // ──── LOSAccelerator access ────

  getLOSAccelerator(): LOSAccelerator {
    return this.raycastRuntime.getLOSAccelerator();
  }

  isTerrainReady(): boolean {
    return this.isInitialized;
  }

  hasTerrainAt(x: number, z: number): boolean {
    if (!this.isInitialized) return false;
    const halfWorld = this.config.worldSize * 0.5;
    return x >= -halfWorld && x <= halfWorld && z >= -halfWorld && z <= halfWorld;
  }

  // ──── Worker pool ────

  getWorkerPool(): TerrainWorkerPool | null {
    return this.workerPool;
  }

  getWorkerStats(): { enabled: boolean; queueLength: number; busyWorkers: number; totalWorkers: number } | null {
    return this.workerPool.getStats();
  }

  getWorkerTelemetry(): {
    enabled: boolean; chunksGenerated: number; avgGenerationTimeMs: number;
    workersReady: number; duplicatesAvoided: number; queueLength: number;
    busyWorkers: number; inFlightChunks: number;
  } | null {
    return this.workerPool.getTelemetry();
  }

  // ──── Debug ────

  /**
   * Toggle LOD wireframe debug view. Color-codes tiles by LOD level
   * and dims morphing regions to visualize CDLOD transitions.
   */
  setDebugWireframe(enabled: boolean): void {
    try {
      const mat = this.surfaceRuntime.getMaterial();
      const terrainUniforms = mat.userData.terrainUniforms as Record<string, { value: unknown }> | undefined;
      if (terrainUniforms?.debugWireframe) {
        terrainUniforms.debugWireframe.value = enabled;
      }
      mat.wireframe = enabled;
      mat.needsUpdate = true;
    } catch {
      // Material not yet initialized
    }
  }

  // ──── Runtime metrics ────

  getActiveTerrainTileCount(): number {
    return this.renderRuntime?.getActiveTerrainTileCount() ?? 0;
  }

  getChunkSize(): number {
    return this.chunkSize;
  }

  // ──── Configuration ────

  setChunkSize(size: number): void {
    this.chunkSize = size;
    this.reconfigureWorld();
  }

  setRenderDistance(distance: number): void {
    this.renderDistance = distance;
    this.reconfigureWorld();
  }

  setWorldSize(worldSize: number): void {
    if (!Number.isFinite(worldSize) || worldSize <= 0) return;
    this.explicitWorldSize = worldSize;
    this.reconfigureWorld();
  }

  getWorldSize(): number {
    return this.config.worldSize;
  }

  setBiomeConfig(defaultBiomeId: string, biomeRules?: BiomeClassificationRule[]): void {
    this.defaultBiomeId = defaultBiomeId;
    this.biomeRules = biomeRules ?? [];
    this.applyVegetationConfig();

    if (this.isInitialized) {
      this.surfaceRuntime.updateBiomeMaterial(
        this.config.worldSize,
        this.defaultBiomeId,
        this.biomeRules,
      );
      this.vegetationScatterer.regenerateAll();
    }
  }

  /**
   * Re-bake the GPU heightmap, update material, send provider to workers,
   * and rebuild the BVH mesh. Called when the height provider changes
   * (e.g. new random seed at match start) without a world size change.
   */
  rebakeHeightmap(): void {
    if (!this.isInitialized) return;

    const cache = getHeightQueryCache();
    this.surfaceRuntime.rebake(cache.getProvider(), this.config.worldSize, this.defaultBiomeId, this.biomeRules);

    // Propagate new provider to workers
    const providerConfig = cache.getProvider().getWorkerConfig();
    this.workerPool.sendHeightProvider(providerConfig);

    this.raycastRuntime.forceRebuildNearFieldMesh(
      this.playerPosition,
      this.config.bvhRadius,
      (x, z) => this.getHeightAt(x, z),
    );

    // Regenerate vegetation for new terrain
    this.vegetationScatterer.regenerateAll();

    Logger.info('terrain', 'Heightmap re-baked from updated provider');
  }

  private reconfigureWorld(): void {
    const newWorldSize = this.computeWorldSize();
    if (newWorldSize === this.config.worldSize) return;

    this.config.worldSize = newWorldSize;
    this.config.lodRanges = computeDefaultLODRanges(newWorldSize, this.config.maxLODLevels);
    this.vegetationScatterer.setWorldSize(newWorldSize);

    if (this.isInitialized) {
      this.renderRuntime?.reconfigure({
        worldSize: this.config.worldSize,
        maxLODLevels: this.config.maxLODLevels,
        lodRanges: this.config.lodRanges,
        tileResolution: this.config.tileResolution,
      });
    }

    // Re-bake heightmap at new world size if initialized
    if (this.isInitialized) {
      const cache = getHeightQueryCache();
      this.surfaceRuntime.rebake(cache.getProvider(), this.config.worldSize, this.defaultBiomeId, this.biomeRules);
    }

    Logger.info('terrain', `Reconfigured: ${this.config.worldSize}m world, chunk=${this.chunkSize}, renderDist=${this.renderDistance}`);
  }

  private computeWorldSize(): number {
    return this.explicitWorldSize ?? (this.chunkSize * this.renderDistance * 2);
  }

  private applyVegetationConfig(): void {
    const vegetationConfig = buildTerrainVegetationRuntimeConfig(this.defaultBiomeId, this.biomeRules);
    const { biomeIds, biomePalettes } = vegetationConfig;
    this.billboardSystem.configure(biomeIds);
    const activeTypes = this.billboardSystem.getActiveVegetationTypes();
    this.vegetationScatterer.configure(activeTypes, this.defaultBiomeId, biomePalettes, this.biomeRules);
  }
}
