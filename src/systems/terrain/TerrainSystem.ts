import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { AssetLoader } from '../assets/AssetLoader';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { type BiomeClassificationRule } from '../../config/biomes';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { Logger } from '../../utils/Logger';
import { getHeightQueryCache } from './HeightQueryCache';
import { BakedHeightProvider } from './BakedHeightProvider';
import type { CompiledTerrainFeatureSet } from './TerrainFeatureTypes';

import { TerrainRenderRuntime } from './TerrainRenderRuntime';
import { TerrainRaycastRuntime } from './TerrainRaycastRuntime';
import { TerrainSurfaceRuntime } from './TerrainSurfaceRuntime';
import { TerrainQueries } from './TerrainQueries';
import { VegetationScatterer } from './VegetationScatterer';
import { TerrainWorkerPool } from './TerrainWorkerPool';
import { TerrainStreamingScheduler } from './streaming/TerrainStreamingScheduler';
import {
  buildTerrainVegetationRuntimeConfig,
} from './TerrainBiomeRuntimeConfig';
import { createTerrainConfig, computeDefaultLODRanges, computeMaxLODLevels, type TerrainSystemConfig, type TerrainRuntimeBootstrapConfig } from './TerrainConfig';

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
  private streamingScheduler: TerrainStreamingScheduler;

  // State
  private playerPosition = new THREE.Vector3();
  private readinessProbe = new THREE.Vector3();
  private isInitialized = false;
  private vegetationAddThrottleFrame = false;
  private frameCounter = 0;

  // Runtime bootstrap/config state
  private chunkSize = 64;
  private renderDistance = 6;
  private explicitWorldSize: number | null = null;
  private defaultBiomeId = 'denseJungle';
  private biomeRules: BiomeClassificationRule[] = [];
  private surfaceWetness = 0;
  private terrainFeatures: CompiledTerrainFeatureSet = {
    stamps: [],
    surfacePatches: [],
    vegetationExclusionZones: [],
    flowPaths: [],
  };

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
      visualMargin: 200,
      maxLODLevels: runtimeConfig.lodLevels,
    });

    this.surfaceRuntime = new TerrainSurfaceRuntime(assetLoader, this.config.splatmap, this.config.tileResolution - 1);
    const losAccelerator = new LOSAccelerator();
    this.raycastRuntime = new TerrainRaycastRuntime(losAccelerator);
    this.terrainQueries = new TerrainQueries(losAccelerator);
    this.vegetationScatterer = new VegetationScatterer(globalBillboardSystem, this.config.vegetationCellSize);
    this.vegetationScatterer.setWorldBounds(worldSize, this.config.visualMargin);
    this.workerPool = new TerrainWorkerPool();
    this.streamingScheduler = new TerrainStreamingScheduler();
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

    this.syncCpuHeightsToGpu();

    this.renderRuntime = new TerrainRenderRuntime(
      this.scene,
      this.camera,
      terrainMaterial,
      {
        worldSize: this.config.worldSize,
        visualMargin: this.config.visualMargin,
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

    this.frameCounter++;

    this.streamingScheduler.runStream('render', this.config.renderUpdateBudgetMs, () => {
      this.renderRuntime!.update();
      return { workUnits: 1, pendingUnits: 0 };
    });

    const vegetationBudget = this.computeVegetationFrameBudget(deltaTime);
    let vegetationDidWork = false;
    this.streamingScheduler.runStream('vegetation', this.config.vegetationUpdateBudgetMs, budgetMs => {
      const didWork = this.vegetationScatterer.updateBudgeted(this.playerPosition, {
        maxAddsPerFrame: vegetationBudget.maxAddsPerFrame,
        maxRemovalsPerFrame: Math.max(
          vegetationBudget.maxRemovalsPerFrame,
          Math.max(2, Math.floor(budgetMs * 6)),
        ),
      });
      vegetationDidWork = didWork;
      const pending = this.vegetationScatterer.getPendingCounts();
      return {
        workUnits: didWork ? 1 : 0,
        pendingUnits: pending.adds + pending.removals,
      };
    });

    // Stagger collision rebuild: skip on frames where vegetation did work
    // to avoid compounding expensive terrain operations in the same frame.
    const skipCollision = vegetationDidWork && (this.frameCounter % 2 === 0);
    if (!skipCollision) {
      this.streamingScheduler.runStream('collision', this.config.collisionUpdateBudgetMs, budgetMs => {
        const didWork = this.raycastRuntime.updateNearFieldMesh(
          this.playerPosition,
          this.config.bvhRadius,
          this.config.bvhRebuildThreshold,
          (x, z) => this.getHeightAt(x, z),
          Math.max(4, Math.floor(budgetMs * 10)),
        );
        return {
          workUnits: didWork ? 1 : 0,
          pendingUnits: this.raycastRuntime.getPendingRowCount(),
        };
      });
    }
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

  setTerrainFeatures(features: CompiledTerrainFeatureSet): void {
    this.terrainFeatures = {
      stamps: features.stamps.slice(),
      surfacePatches: features.surfacePatches.slice(),
      vegetationExclusionZones: features.vegetationExclusionZones.slice(),
      flowPaths: features.flowPaths.slice(),
    };
    this.surfaceRuntime.setFeatureSurfacePatches(this.terrainFeatures.surfacePatches);
    this.billboardSystem.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
    this.vegetationScatterer.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
    if (this.isInitialized) {
      this.vegetationScatterer.regenerateAll();
    }
  }

  /**
   * Async version of setTerrainFeatures - yields during vegetation regeneration
   * to avoid blocking the main thread on large maps.
   */
  async setTerrainFeaturesAsync(
    features: CompiledTerrainFeatureSet,
    onVegetationProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    this.terrainFeatures = {
      stamps: features.stamps.slice(),
      surfacePatches: features.surfacePatches.slice(),
      vegetationExclusionZones: features.vegetationExclusionZones.slice(),
      flowPaths: features.flowPaths.slice(),
    };
    this.surfaceRuntime.setFeatureSurfacePatches(this.terrainFeatures.surfacePatches);
    this.billboardSystem.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
    this.vegetationScatterer.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
    if (this.isInitialized) {
      await this.vegetationScatterer.regenerateAllAsync(onVegetationProgress);
    }
  }

  // ──── Height queries ────

  getHeightAt(x: number, z: number): number {
    return this.terrainQueries.getHeightAt(x, z);
  }

  getTerrainFlowPaths() {
    return this.terrainFeatures.flowPaths.slice();
  }

  getEffectiveHeightAt(x: number, z: number): number {
    return this.terrainQueries.getEffectiveHeightAt(x, z);
  }

  getSlopeAt(x: number, z: number): number {
    return this.terrainQueries.getSlopeAt(x, z);
  }

  getNormalAt(x: number, z: number, target?: THREE.Vector3): THREE.Vector3 {
    return this.terrainQueries.getNormalAt(x, z, target);
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
    return this.isInitialized
      && this.raycastRuntime.isReadyForPosition(
        this.playerPosition,
        Math.max(this.config.bvhRebuildThreshold, this.config.bvhRadius * 0.35),
      );
  }

  isAreaReadyAt(x: number, z: number): boolean {
    if (!this.hasTerrainAt(x, z)) {
      return false;
    }
    this.readinessProbe.set(x, 0, z);
    return this.raycastRuntime.isReadyForPosition(
      this.readinessProbe,
      Math.max(24, this.config.bvhRebuildThreshold),
    );
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

  getStreamingMetrics(): Array<{ name: string; budgetMs: number; timeMs: number; pendingUnits: number }> {
    return this.streamingScheduler.getMetrics().map(metric => ({
      name: metric.name,
      budgetMs: metric.budgetMs,
      timeMs: metric.emaMs,
      pendingUnits: metric.pendingUnits,
    }));
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

  setVisualMargin(visualMargin: number): void {
    if (!Number.isFinite(visualMargin)) return;
    const nextMargin = Math.max(0, visualMargin);
    if (nextMargin === this.config.visualMargin) return;

    this.config.visualMargin = nextMargin;
    this.vegetationScatterer.setWorldBounds(this.config.worldSize, this.config.visualMargin);

    if (this.isInitialized) {
      this.renderRuntime?.reconfigure({
        worldSize: this.config.worldSize,
        visualMargin: this.config.visualMargin,
        maxLODLevels: this.config.maxLODLevels,
        lodRanges: this.config.lodRanges,
        tileResolution: this.config.tileResolution,
      });
    }
  }

  getWorldSize(): number {
    return this.config.worldSize;
  }

  getPlayableWorldSize(): number {
    return this.config.worldSize;
  }

  getVisualMargin(): number {
    return this.config.visualMargin;
  }

  getVisualWorldSize(): number {
    return this.config.worldSize + this.config.visualMargin * 2;
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
    this.propagateTerrainSourceChanges();

    Logger.info('terrain', 'Heightmap re-baked from updated provider');
  }

  private computeVegetationFrameBudget(deltaTime: number): {
    maxAddsPerFrame: number;
    maxRemovalsPerFrame: number;
  } {
    const baseAdds = Math.max(1, Math.floor(this.config.vegetationUpdateBudgetMs * 1.5));
    const baseRemovals = Math.max(2, Math.floor(this.config.vegetationUpdateBudgetMs * 6));
    const frameMs = Math.max(0, deltaTime * 1000);

    // When traversal is already running hot, favor draining old cells and let new
    // cell activation yield for a frame instead of compounding the hitch.
    if (frameMs >= 24) {
      this.vegetationAddThrottleFrame = false;
      return {
        maxAddsPerFrame: 0,
        maxRemovalsPerFrame: Math.max(baseRemovals, 10),
      };
    }

    // Moderate pressure still allows progress, but only every other frame.
    if (frameMs >= 18) {
      const allowAddsThisFrame = this.vegetationAddThrottleFrame;
      this.vegetationAddThrottleFrame = !this.vegetationAddThrottleFrame;
      return {
        maxAddsPerFrame: allowAddsThisFrame ? baseAdds : 0,
        maxRemovalsPerFrame: Math.max(baseRemovals, 6),
      };
    }

    this.vegetationAddThrottleFrame = false;
    return {
      maxAddsPerFrame: baseAdds,
      maxRemovalsPerFrame: baseRemovals,
    };
  }

  private reconfigureWorld(): void {
    const newWorldSize = this.computeWorldSize();
    if (newWorldSize === this.config.worldSize) return;

    this.config.worldSize = newWorldSize;
    // Recompute LOD levels so vertex density stays sufficient at any world size.
    // Without this, large worlds (3200m+) get LOD 0 tiles too coarse for the
    // heightmap resolution, causing GPU mesh height to diverge from CPU queries.
    this.config.maxLODLevels = computeMaxLODLevels(
      newWorldSize,
      this.config.visualMargin,
      this.config.tileResolution - 1,
    );
    this.config.lodRanges = computeDefaultLODRanges(newWorldSize, this.config.maxLODLevels);
    this.vegetationScatterer.setWorldBounds(newWorldSize, this.config.visualMargin);

    if (this.isInitialized) {
      this.renderRuntime?.reconfigure({
        worldSize: this.config.worldSize,
        visualMargin: this.config.visualMargin,
        maxLODLevels: this.config.maxLODLevels,
        lodRanges: this.config.lodRanges,
        tileResolution: this.config.tileResolution,
      });
    }

    // Re-bake heightmap at new world size if initialized
    if (this.isInitialized) {
      const cache = getHeightQueryCache();
      this.surfaceRuntime.rebake(cache.getProvider(), this.config.worldSize, this.defaultBiomeId, this.biomeRules);
      this.propagateTerrainSourceChanges();
    }

    Logger.info('terrain', `Reconfigured: ${this.config.worldSize}m world, chunk=${this.chunkSize}, renderDist=${this.renderDistance}`);
  }

  private computeWorldSize(): number {
    return this.explicitWorldSize ?? (this.chunkSize * this.renderDistance * 2);
  }

  /**
   * After the GPU heightmap is baked, replace the HeightQueryCache provider
   * with one that bilinear-interpolates the same baked grid. This ensures
   * CPU height queries (collision, vegetation, BVH, AI) match the GPU surface.
   */
  private syncCpuHeightsToGpu(): void {
    const baked = this.surfaceRuntime.getBakedHeightmap();
    if (!baked) return;

    const cache = getHeightQueryCache();
    const bakedProvider = new BakedHeightProvider(
      baked.data,
      baked.gridSize,
      baked.worldSize,
      cache.getProvider().getWorkerConfig(),
    );
    cache.setProvider(bakedProvider);
  }

  private applyVegetationConfig(): void {
    const vegetationConfig = buildTerrainVegetationRuntimeConfig(this.defaultBiomeId, this.biomeRules);
    const { biomeIds, biomePalettes } = vegetationConfig;
    this.billboardSystem.configure(biomeIds);
    const activeTypes = this.billboardSystem.getActiveVegetationTypes();
    this.vegetationScatterer.configure(activeTypes, this.defaultBiomeId, biomePalettes, this.biomeRules);
    this.billboardSystem.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
    this.vegetationScatterer.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
  }

  private propagateTerrainSourceChanges(): void {
    this.syncCpuHeightsToGpu();

    const cache = getHeightQueryCache();
    const providerConfig = cache.getProvider().getWorkerConfig();
    this.workerPool.sendHeightProvider(providerConfig);

    this.raycastRuntime.forceRebuildNearFieldMesh(
      this.playerPosition,
      this.config.bvhRadius,
      (x, z) => this.getHeightAt(x, z),
    );

    this.vegetationScatterer.regenerateAll();
  }
}
