// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { AssetLoader } from '../assets/AssetLoader';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { type BiomeClassificationRule, type TerrainFarCanopyTintConfig } from '../../config/biomes';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { Logger } from '../../utils/Logger';
import { markStartup } from '../../core/StartupTelemetry';
import { getHeightQueryCache } from './HeightQueryCache';
import { createHeightProviderFromConfig } from './HeightProviderFactory';
import { BakedHeightProvider } from './BakedHeightProvider';
import type { IHeightProvider } from './IHeightProvider';
import type { CompiledTerrainFeatureSet } from './TerrainFeatureTypes';
import type { PreparedHeightmapGrid } from './PreparedTerrainSource';

import {
  TerrainRenderRuntime,
  type TerrainDebugTile,
  type TerrainRenderSelectionSyncResult,
  type TerrainRenderSubmissionStats,
} from './TerrainRenderRuntime';
import { createBakedTerrainHeightBoundsProvider } from './TerrainRenderHeightBounds';
import { TerrainRaycastRuntime } from './TerrainRaycastRuntime';
import { bakeGameplayQueryGrid, computeGameplayQueryGridSize, computeTerrainSurfaceGridSize, TerrainSurfaceRuntime } from './TerrainSurfaceRuntime';
import { TerrainQueries } from './TerrainQueries';
import { VisualExtentHeightProvider } from './VisualExtentHeightProvider';
import { TerrainWorkerPool } from './TerrainWorkerPool';
import { TerrainStreamingScheduler } from './streaming/TerrainStreamingScheduler';
import { buildTerrainVegetationRuntimeConfig } from './TerrainBiomeRuntimeConfig';
import { createTerrainConfig, computeDefaultLODRanges, computeSourceAwareMaxLODLevels, type TerrainSystemConfig, type TerrainRuntimeBootstrapConfig } from './TerrainConfig';
import { TerrainVegetationRuntime, type TerrainVegetationRuntimeDebugInfo } from './TerrainVegetationRuntime';

interface TerrainStreamingMetricDebug {
  name: string;
  budgetMs: number;
  timeMs: number;
  pendingUnits: number;
  debug?: TerrainVegetationRuntimeDebugInfo | TerrainRenderSubmissionStats;
}

interface TerrainModeSurfaceOptions {
  preparedHeightmap: PreparedHeightmapGrid | null;
  worldSize?: number;
  visualMargin: number;
  chunkSize?: number;
  renderDistance?: number;
  defaultBiomeId: string;
  biomeRules?: BiomeClassificationRule[];
  heightSampleSpacingMeters?: number;
}

interface TerrainAtmosphereLightingInput {
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  ambientColor: THREE.Color;
  directLightDirection: THREE.Vector3;
  daylightFactor: number;
  nightBlend: number;
  sunAboveHorizon: boolean;
}

const ATMOSPHERE_LIGHTING_EPSILON = 1e-5;

function readPerfTerrainBooleanFlag(name: string): boolean {
  if (!(import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1')) return false;
  if (typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value === null) return false;
    const normalized = value.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  } catch {
    return false;
  }
}

function isTerrainFarCanopyTintDisabledForPerf(): boolean {
  return readPerfTerrainBooleanFlag('perfDisableTerrainFarCanopyTint');
}

function isTerrainLowSunOcclusionDisabledForPerf(): boolean {
  return readPerfTerrainBooleanFlag('perfDisableTerrainLowSunOcclusion');
}

function smoothstep01(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

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
  private vegetationRuntime: TerrainVegetationRuntime;
  private workerPool: TerrainWorkerPool;
  private raycastRuntime: TerrainRaycastRuntime;
  private streamingScheduler: TerrainStreamingScheduler;

  // State
  private playerPosition = new THREE.Vector3();
  private readinessProbe = new THREE.Vector3();
  private atmosphereNightFillColor = new THREE.Color(0, 0, 0);
  private atmosphereDirectLightDirection = new THREE.Vector3(0, 1, 0);
  private nextAtmosphereDirectLightDirection = new THREE.Vector3(0, 1, 0);
  private atmosphereDaylightFactor = 1;
  private atmosphereLowSunOcclusionStrength = 0;
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
  private heightSampleSpacingMeters: number | null = null;
  private preparedHeightmap: PreparedHeightmapGrid | null = null;
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
    private readonly shadowLight: THREE.DirectionalLight | null = null,
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

    this.config = createTerrainConfig({ worldSize, visualMargin: 200, maxLODLevels: computeSourceAwareMaxLODLevels(worldSize, 200, 32) });

    this.surfaceRuntime = new TerrainSurfaceRuntime(assetLoader, this.config.splatmap, this.config.tileResolution - 1, this.config.lodRanges);
    const losAccelerator = new LOSAccelerator();
    this.raycastRuntime = new TerrainRaycastRuntime(losAccelerator);
    this.terrainQueries = new TerrainQueries(losAccelerator);
    this.vegetationRuntime = new TerrainVegetationRuntime(globalBillboardSystem, this.config.vegetationCellSize, scene, camera);
    this.vegetationRuntime.setWorldBounds(worldSize, this.config.visualMargin);
    this.workerPool = new TerrainWorkerPool();
    this.streamingScheduler = new TerrainStreamingScheduler();
  }

  // ──── GameSystem interface ────

  async init(): Promise<void> {
    if (this.isInitialized) return;

    const cache = getHeightQueryCache();
    let terrainMaterial: THREE.Material;
    try {
      terrainMaterial = this.createSurfaceMaterial(cache.getProvider());
    } catch (error) {
      Logger.error('terrain', error instanceof Error ? error.message : 'Failed to initialize terrain surface');
      return;
    }

    this.syncCpuHeightsToGpu();

    const terrainHeightBoundsForTile = createBakedTerrainHeightBoundsProvider(this.surfaceRuntime, this.getVisualWorldSize.bind(this));
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
      (x, z) => this.getHeightAt(x, z),
      this.shadowLight,
      terrainHeightBoundsForTile,
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
      const result = this.vegetationRuntime.updateBudgeted(this.playerPosition, budgetMs, vegetationBudget);
      vegetationDidWork = result.didWork;
      return {
        workUnits: result.didWork ? 1 : 0,
        pendingUnits: result.pendingUnits,
      };
    });
    this.vegetationRuntime.update(deltaTime); // hero impostor LOD swap: every frame, off the streaming budget

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
    this.vegetationRuntime.dispose();
    this.workerPool.dispose();
    this.raycastRuntime.dispose();

    this.isInitialized = false;
  }

  // ──── Player tracking ────

  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  setRenderCameraOverride(camera: THREE.PerspectiveCamera | null): void {
    this.renderRuntime?.setCameraOverride(camera);
  }

  syncRenderSelectionForCamera(camera: THREE.Camera | null | undefined): TerrainRenderSelectionSyncResult {
    if (!this.isInitialized || !this.renderRuntime) {
      return {
        didSync: false,
        reason: 'uninitialized',
        selectionRechecked: false,
        poseWasStale: false,
        projectionChanged: false,
        positionDeltaMeters: 0,
        rotationDeltaDeg: 0,
        tileCount: 0,
        tileSelectionSaturated: false, terrainBufferSubmitted: false, submissionClassification: null,
      };
    }
    return this.renderRuntime.syncSelectionForCamera(camera);
  }

  setSurfaceWetness(wetness: number): void {
    const clampedWetness = THREE.MathUtils.clamp(wetness, 0, 1);
    if (Math.abs(clampedWetness - this.surfaceWetness) < 0.001) {
      return;
    }
    this.surfaceWetness = clampedWetness;
    this.surfaceRuntime.setSurfaceWetness(clampedWetness);
  }

  setFarCanopyTint(farCanopyTint?: TerrainFarCanopyTintConfig): void {
    this.surfaceRuntime.setFarCanopyTint(
      isTerrainFarCanopyTintDisabledForPerf() ? { enabled: false } : farCanopyTint,
    );
  }

  setAtmosphereLighting(lighting: TerrainAtmosphereLightingInput): void {
    const daylightFactor = THREE.MathUtils.clamp(lighting.daylightFactor, 0, 1);
    this.nextAtmosphereDirectLightDirection.copy(lighting.directLightDirection);
    if (this.nextAtmosphereDirectLightDirection.lengthSq() < 1e-8) this.nextAtmosphereDirectLightDirection.set(0, 1, 0);
    else this.nextAtmosphereDirectLightDirection.normalize();
    const rawLowSunOcclusionStrength = lighting.sunAboveHorizon
      ? daylightFactor * (1 - smoothstep01(0.16, 0.5, this.nextAtmosphereDirectLightDirection.y)) * 0.85 : 0;
    const lowSunOcclusionStrength = isTerrainLowSunOcclusionDisabledForPerf()
      ? 0
      : rawLowSunOcclusionStrength;
    if (
      Math.abs(this.atmosphereDirectLightDirection.x - this.nextAtmosphereDirectLightDirection.x) <= ATMOSPHERE_LIGHTING_EPSILON
      && Math.abs(this.atmosphereDirectLightDirection.y - this.nextAtmosphereDirectLightDirection.y) <= ATMOSPHERE_LIGHTING_EPSILON
      && Math.abs(this.atmosphereDirectLightDirection.z - this.nextAtmosphereDirectLightDirection.z) <= ATMOSPHERE_LIGHTING_EPSILON
      && Math.abs(this.atmosphereDaylightFactor - daylightFactor) <= ATMOSPHERE_LIGHTING_EPSILON
      && Math.abs(this.atmosphereLowSunOcclusionStrength - lowSunOcclusionStrength) <= ATMOSPHERE_LIGHTING_EPSILON
    ) {
      return;
    }
    // Rig path is the only path (`legacy-path-deletion`). The rig's
    // ambientRadiance is the single night floor — driven into the terrain PBR
    // via the rig scene lights — so the legacy night-fill emissive re-shaping is
    // gone: pass a zero strength and a black fill (the night-fill emissive node
    // was DELETED from TerrainMaterial; these uniforms are inert declarations
    // kept for out-of-scope writers). The direct-light direction and
    // daylight factor still drive the horizon-occlusion relief that the rig path
    // retains ("keep the effect, kill the bespoke inputs").
    this.atmosphereDirectLightDirection.copy(this.nextAtmosphereDirectLightDirection);
    this.atmosphereDaylightFactor = daylightFactor;
    this.atmosphereLowSunOcclusionStrength = lowSunOcclusionStrength;
    this.atmosphereNightFillColor.setRGB(0, 0, 0);
    this.surfaceRuntime.setAtmosphereLighting({
      nightFillColor: this.atmosphereNightFillColor,
      nightFillStrength: 0,
      directLightDirection: this.atmosphereDirectLightDirection,
      daylightFactor,
      lowSunOcclusionStrength,
    });
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
    this.vegetationRuntime.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
    if (this.isInitialized) {
      this.vegetationRuntime.regenerateAll();
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
    this.vegetationRuntime.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
    if (this.isInitialized) {
      await this.vegetationRuntime.regenerateAllAsync(onVegetationProgress);
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

  /**
   * Baked GPU-coherent heightmap as a CPU-readable 1024²-capped grid (NOT the
   * 2304² source DEM); null until the surface has baked. Concrete-class facade
   * over the private surface runtime — deliberately NOT on the fenced
   * ITerrainRuntime — for the orbital topo map to read relief without coupling
   * to GPU heightmap internals.
   */
  getBakedHeightmap(): { data: Float32Array; gridSize: number; worldSize: number } | null {
    return this.isInitialized ? this.surfaceRuntime.getBakedHeightmap() : null;
  }

  // ──── Collision objects ────

  registerCollisionObject(
    id: string,
    object: THREE.Object3D,
    options?: {
      dynamic?: boolean;
    },
  ): void {
    this.terrainQueries.registerCollisionObject(id, object, options);
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
        terrainUniforms.debugWireframe.value = enabled ? 1 : 0;
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

  /** Additive debug accessor for artifact truth. See TerrainRenderRuntime. */
  getActiveTilesForDebug(): ReadonlyArray<TerrainDebugTile> {
    return this.renderRuntime?.getActiveTilesForDebug() ?? [];
  }

  wasLastTileSelectionSaturated(): boolean {
    return this.renderRuntime?.wasLastTileSelectionSaturated() ?? false;
  }

  /** Explicit fresh selection probe for interactive overlays only. */
  selectTilesForDebugOverlay(): ReadonlyArray<TerrainDebugTile> {
    return this.renderRuntime?.selectTilesForDebugOverlay() ?? [];
  }

  getRenderSubmissionStatsForDebug(): TerrainRenderSubmissionStats | null {
    return this.renderRuntime?.getSubmissionStatsForDebug() ?? null;
  }

  getChunkSize(): number {
    return this.chunkSize;
  }

  getStreamingMetrics(): TerrainStreamingMetricDebug[] {
    const vegetationDebug = this.vegetationRuntime.getDebugInfo();
    const renderDebug = this.getRenderSubmissionStatsForDebug();
    return this.streamingScheduler.getMetrics().map(metric => ({
      name: metric.name,
      budgetMs: metric.budgetMs,
      timeMs: metric.emaMs,
      pendingUnits: metric.pendingUnits,
      ...(metric.name === 'vegetation' ? { debug: vegetationDebug } : {}),
      ...(metric.name === 'render' && renderDebug ? { debug: renderDebug } : {}),
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

  setPreparedHeightmap(preparedHeightmap: PreparedHeightmapGrid | null): void {
    this.preparedHeightmap = preparedHeightmap;
  }

  async configureModeSurface(options: TerrainModeSurfaceOptions): Promise<void> {
    this.preparedHeightmap = options.preparedHeightmap;
    if (Number.isFinite(options.chunkSize) && options.chunkSize! > 0) {
      this.chunkSize = options.chunkSize!;
    }
    if (Number.isFinite(options.renderDistance) && options.renderDistance! > 0) {
      this.renderDistance = options.renderDistance!;
    }
    if (Number.isFinite(options.worldSize) && options.worldSize! > 0) {
      this.explicitWorldSize = options.worldSize!;
    }

    this.config.worldSize = this.computeWorldSize();
    this.config.visualMargin = Math.max(0, options.visualMargin);
    this.heightSampleSpacingMeters = Number.isFinite(options.heightSampleSpacingMeters) && options.heightSampleSpacingMeters! > 0 ? options.heightSampleSpacingMeters! : null;
    this.defaultBiomeId = options.defaultBiomeId;
    this.biomeRules = options.biomeRules ?? [];
    this.recomputeLodConfig();
    this.vegetationRuntime.setWorldBounds(this.config.worldSize, this.config.visualMargin);
    this.applyVegetationConfig();

    if (!this.isInitialized) return;

    this.renderRuntime?.reconfigure({
      worldSize: this.config.worldSize,
      visualMargin: this.config.visualMargin,
      maxLODLevels: this.config.maxLODLevels,
      lodRanges: this.config.lodRanges,
      tileResolution: this.config.tileResolution,
    });
    await this.rebakeSurfaceHeightmapAsync();
    this.propagateTerrainSourceChanges();

    Logger.info('terrain', `Mode surface configured: ${this.config.worldSize}m world, visualMargin=${this.config.visualMargin}m, chunk=${this.chunkSize}, renderDist=${this.renderDistance}`);
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
    this.recomputeLodConfig();
    this.vegetationRuntime.setWorldBounds(this.config.worldSize, this.config.visualMargin);

    if (this.isInitialized) {
      this.renderRuntime?.reconfigure({
        worldSize: this.config.worldSize,
        visualMargin: this.config.visualMargin,
        maxLODLevels: this.config.maxLODLevels,
        lodRanges: this.config.lodRanges,
        tileResolution: this.config.tileResolution,
      });
      this.rebakeSurfaceHeightmap();
      this.propagateTerrainSourceChanges();
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
        this.getVisualWorldSize(),
        this.defaultBiomeId,
        this.biomeRules,
      );
      this.vegetationRuntime.regenerateAll();
    }
  }

  /**
   * Re-bake the GPU heightmap, update material, send provider to workers,
   * and rebuild the BVH mesh. Called when the height provider changes
   * (e.g. new random seed at match start) without a world size change.
   */
  rebakeHeightmap(): void {
    if (!this.isInitialized) return;

    this.rebakeSurfaceHeightmap();
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
    this.recomputeLodConfig();
    this.vegetationRuntime.setWorldBounds(newWorldSize, this.config.visualMargin);

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
      this.rebakeSurfaceHeightmap();
      this.propagateTerrainSourceChanges();
    }

    Logger.info('terrain', `Reconfigured: ${this.config.worldSize}m world, chunk=${this.chunkSize}, renderDist=${this.renderDistance}`);
  }

  private computeWorldSize(): number {
    return this.explicitWorldSize ?? (this.chunkSize * this.renderDistance * 2);
  }

  private createSurfaceMaterial(provider: IHeightProvider): THREE.Material {
    const surfaceProvider = this.createVisualExtentProvider(provider);
    if (this.preparedHeightmap && this.config.visualMargin <= 0) {
      markStartup('terrain.heightmap.from-prebaked.begin');
      const material = this.surfaceRuntime.initializeFromPrebakedGrid(
        this.preparedHeightmap.data,
        this.preparedHeightmap.gridSize,
        this.config.worldSize,
        this.defaultBiomeId,
        this.biomeRules,
      );
      markStartup('terrain.heightmap.from-prebaked.end');
      return material;
    }

    markStartup('terrain.heightmap.from-provider.begin');
    const material = this.surfaceRuntime.initialize(
      surfaceProvider,
      this.config.worldSize,
      this.defaultBiomeId,
      this.biomeRules,
      this.getVisualWorldSize(),
    );
    markStartup('terrain.heightmap.from-provider.end');
    return material;
  }

  private rebakeSurfaceHeightmap(): void {
    const cache = getHeightQueryCache();
    const surfaceProvider = this.createVisualExtentProvider(cache.getProvider());

    if (this.preparedHeightmap && this.config.visualMargin <= 0) {
      markStartup('terrain.heightmap.from-prebaked.begin');
      this.surfaceRuntime.rebakeFromPrebakedGrid(
        this.preparedHeightmap.data,
        this.preparedHeightmap.gridSize,
        this.config.worldSize,
        this.defaultBiomeId,
        this.biomeRules,
      );
      markStartup('terrain.heightmap.from-prebaked.end');
      return;
    }

    markStartup('terrain.heightmap.from-provider.begin');
    this.surfaceRuntime.rebake(
      surfaceProvider,
      this.getVisualWorldSize(),
      this.defaultBiomeId,
      this.biomeRules,
      this.config.worldSize,
      this.config.visualMargin,
    );
    markStartup('terrain.heightmap.from-provider.end');
  }

  private async rebakeSurfaceHeightmapAsync(): Promise<void> {
    if (this.preparedHeightmap && this.config.visualMargin <= 0) {
      this.rebakeSurfaceHeightmap();
      return;
    }

    const cache = getHeightQueryCache();
    const surfaceWorldSize = this.getVisualWorldSize();
    const surfaceGridSize = computeTerrainSurfaceGridSize(surfaceWorldSize);

    if (this.preparedHeightmap) {
      markStartup('terrain.heightmap.from-prepared-visual-worker.begin');
      try {
        const result = await this.workerPool.bakePreparedVisualHeightmap(
          this.preparedHeightmap,
          this.config.worldSize,
          this.config.visualMargin,
          cache.getProvider().getWorkerConfig(),
          surfaceGridSize,
        );
        this.surfaceRuntime.rebakeFromPrebakedGrid(
          result.heightData,
          result.gridSize,
          result.worldSize,
          this.defaultBiomeId,
          this.biomeRules,
          {
            normalData: result.normalData,
            playableWorldSize: this.config.worldSize,
            visualMargin: this.config.visualMargin,
          },
        );
        markStartup('terrain.heightmap.from-prepared-visual-worker.end');
        return;
      } catch (error) {
        markStartup('terrain.heightmap.from-prepared-visual-worker.failed');
        Logger.warn('terrain', 'Prepared visual heightmap worker bake failed; falling back to provider bake', error);
      }
    }

    const surfaceProvider = this.createVisualExtentProvider(cache.getProvider());
    markStartup('terrain.heightmap.from-provider-worker.begin');
    try {
      const result = await this.workerPool.bakeHeightmapSurface(
        surfaceProvider.getWorkerConfig(),
        surfaceGridSize,
        surfaceWorldSize,
      );
      this.surfaceRuntime.rebakeFromPrebakedGrid(
        result.heightData,
        result.gridSize,
        result.worldSize,
        this.defaultBiomeId,
        this.biomeRules,
        {
          normalData: result.normalData,
          playableWorldSize: this.config.worldSize,
          visualMargin: this.config.visualMargin,
        },
      );
      markStartup('terrain.heightmap.from-provider-worker.end');
      return;
    } catch (error) {
      markStartup('terrain.heightmap.from-provider-worker.failed');
      Logger.warn('terrain', 'Provider heightmap worker bake failed; falling back to synchronous provider bake', error);
    }

    this.rebakeSurfaceHeightmap();
  }

  private recomputeLodConfig(): void {
    this.config.maxLODLevels = computeSourceAwareMaxLODLevels(this.config.worldSize, this.config.visualMargin, this.config.tileResolution - 1, undefined, this.heightSampleSpacingMeters);
    this.surfaceRuntime.setLodRanges(this.config.lodRanges = computeDefaultLODRanges(this.config.worldSize, this.config.maxLODLevels, this.config.visualMargin));
  }

  private createVisualExtentProvider(provider: IHeightProvider): IHeightProvider {
    if (this.config.visualMargin <= 0) return provider;
    return new VisualExtentHeightProvider(
      provider,
      createHeightProviderFromConfig(provider.getWorkerConfig()),
      this.config.worldSize,
      this.config.visualMargin,
    );
  }

  /**
   * After the GPU heightmap is baked, replace the HeightQueryCache provider with
   * one that bilinear-interpolates a baked grid, so CPU height queries (collision,
   * vegetation, BVH, AI) read a stable, GPU-coherent surface.
   *
   * Since ashau-load-freeze (2026-06-10) DEM-scale worlds bake the GPU surface
   * at the same 1024 cap the gameplay-query sizing targets, so the query grid
   * size equals the surface grid everywhere and we reuse the already-baked GPU
   * grid: render and collision interpolate ONE grid (residual divergence is
   * the rasterizer's triangle interpolation, ~±0.3m at LOD0). The finer-bake
   * branch below stays as the guard for any future world whose surface grid
   * is capped coarser than the query target — there we bake a CPU-only grid
   * from the live source provider over the same extent the GPU grid maps.
   */
  private syncCpuHeightsToGpu(): void {
    const baked = this.surfaceRuntime.getBakedHeightmap();
    if (!baked) return;

    const cache = getHeightQueryCache();
    // The worker config round-trips the ORIGINAL source identity (the DEM buffer
    // for A Shau) even through a prior BakedHeightProvider swap, so re-baking the
    // query grid always samples the full-resolution source — never a coarser
    // intermediate grid from an earlier sync.
    const workerConfig = cache.getProvider().getWorkerConfig();

    const queryGridSize = computeGameplayQueryGridSize(this.config.worldSize);
    if (queryGridSize > baked.gridSize) {
      const sourceProvider = createHeightProviderFromConfig(workerConfig);
      const queryData = bakeGameplayQueryGrid(sourceProvider, queryGridSize, baked.worldSize);
      cache.setProvider(
        new BakedHeightProvider(queryData, queryGridSize, baked.worldSize, workerConfig),
      );
      return;
    }

    cache.setProvider(
      new BakedHeightProvider(baked.data, baked.gridSize, baked.worldSize, workerConfig),
    );
  }

  private applyVegetationConfig(): void {
    const vegetationConfig = buildTerrainVegetationRuntimeConfig(
      this.defaultBiomeId,
      this.biomeRules,
      [],
    );
    const { biomeIds, biomePalettes } = vegetationConfig;
    this.billboardSystem.configure(biomeIds);
    const activeTypes = this.billboardSystem.getActiveVegetationTypes();
    this.vegetationRuntime.configure(
      activeTypes,
      this.defaultBiomeId,
      biomePalettes,
      this.biomeRules,
    );
    this.billboardSystem.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
    this.vegetationRuntime.setExclusionZones(this.terrainFeatures.vegetationExclusionZones);
  }

  private propagateTerrainSourceChanges(): void {
    markStartup('terrain.propagate.sync-cpu-heights.begin');
    this.syncCpuHeightsToGpu();
    markStartup('terrain.propagate.sync-cpu-heights.end');

    const cache = getHeightQueryCache();
    const providerConfig = cache.getProvider().getWorkerConfig();
    this.workerPool.sendHeightProvider(providerConfig);

    markStartup('terrain.propagate.bvh-rebuild.begin');
    this.raycastRuntime.forceRebuildNearFieldMesh(
      this.playerPosition,
      this.config.bvhRadius,
      (x, z) => this.getHeightAt(x, z),
    );
    markStartup('terrain.propagate.bvh-rebuild.end');

    markStartup('terrain.propagate.vegetation-regen.begin');
    this.vegetationRuntime.regenerateAll();
    markStartup('terrain.propagate.vegetation-regen.end');
  }
}
