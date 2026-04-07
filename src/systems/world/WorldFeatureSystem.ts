import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { MapFeatureDefinition, StaticModelPlacementConfig } from '../../config/gameModeTypes';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { Logger } from '../../utils/Logger';
import { freezeTransform } from '../../utils/SceneUtils';
import { modelLoader } from '../assets/ModelLoader';
import { getModelPlacementProfile } from '../assets/ModelPlacementProfiles';
import { prepareModelForPlacement } from '../assets/ModelPlacementUtils';
import { optimizeStaticModelDrawCalls } from '../assets/ModelDrawCallOptimizer';
import { AIRFIELD_TEMPLATES } from './AirfieldTemplates';
import { generateAirfieldLayout } from './AirfieldLayoutGenerator';
import { GameModeManager } from './GameModeManager';
import { getWorldFeaturePrefab } from './WorldFeaturePrefabs';
import type { NavmeshSystem } from '../navigation/NavmeshSystem';
import { FixedWingModel } from '../vehicle/FixedWingModel';

const _rotatedOffset = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _placementBounds = new THREE.Box3();
const _placementSize = new THREE.Vector3();
const _placementNormal = new THREE.Vector3();

/**
 * Global scale multiplier for placed structures.
 * NPC billboards are 7 units tall (PlaneGeometry 5x7) but real structures
 * are modeled at roughly 1:1 meter scale. This multiplier brings structures
 * to a visually proportional size next to the oversized billboard soldiers.
 */
const STRUCTURE_SCALE = 2.5;
const WORLD_FEATURE_FLAT_SPAN_TARGET = 0.7;
const WORLD_FEATURE_MIN_SEARCH_RADIUS = 1.5;
const WORLD_FEATURE_MAX_SEARCH_RADIUS_SMALL = 8;
const WORLD_FEATURE_MAX_SEARCH_RADIUS_LARGE = 3.5;
const WORLD_FEATURE_SAMPLE_DIRECTIONS = 8;

interface TerrainPlacementCandidate {
  x: number;
  z: number;
  y: number;
  score: number;
  heightSpan: number;
}

interface SpawnedFeatureObject {
  id: string;
  object: THREE.Object3D;
  collisionRegistered: boolean;
}

interface WorldFeatureSystemDependencies {
  terrainManager: ITerrainRuntime;
  gameModeManager: GameModeManager;
}

export class WorldFeatureSystem implements GameSystem {
  private readonly scene: THREE.Scene;
  private terrainManager?: ITerrainRuntime;
  private gameModeManager?: GameModeManager;
  private navmeshSystem?: NavmeshSystem;
  private fixedWingModel?: FixedWingModel;
  private spawnedObjects: SpawnedFeatureObject[] = [];
  private buildInFlight = false;
  private builtModeId: string | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    Logger.info('world', 'Initializing World Feature System...');
  }

  configureDependencies(dependencies: WorldFeatureSystemDependencies): void {
    this.setTerrainManager(dependencies.terrainManager);
    this.setGameModeManager(dependencies.gameModeManager);
  }

  setTerrainManager(terrainManager: ITerrainRuntime): void {
    this.terrainManager = terrainManager;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  setNavmeshSystem(navmeshSystem: NavmeshSystem): void {
    this.navmeshSystem = navmeshSystem;
  }

  setFixedWingModel(fixedWingModel: FixedWingModel): void {
    this.fixedWingModel = fixedWingModel;
  }

  update(_deltaTime: number): void {
    if (!this.terrainManager || !this.gameModeManager || this.buildInFlight) {
      return;
    }

    const config = this.gameModeManager.getCurrentConfig();
    if (this.builtModeId === config.id) {
      return;
    }

    const featuresToBuild = config.features?.filter((feature) => this.hasStaticPlacements(feature)) ?? [];
    if (featuresToBuild.length === 0) {
      this.clearSpawnedObjects();
      this.builtModeId = config.id;
      return;
    }

    if (!this.terrainManager.isTerrainReady()) {
      return;
    }

    if (!this.terrainManager.hasTerrainAt(featuresToBuild[0].position.x, featuresToBuild[0].position.z)) {
      return;
    }

    this.buildInFlight = true;
    void this.rebuildForMode(config.id, featuresToBuild);
  }

  dispose(): void {
    this.clearSpawnedObjects();
  }

  private async rebuildForMode(modeId: string, features: MapFeatureDefinition[]): Promise<void> {
    this.clearSpawnedObjects();

    try {
      for (const feature of features) {
        await this.spawnFeature(feature);
      }
      this.builtModeId = modeId;
      Logger.info('world', `Spawned ${this.spawnedObjects.length} world feature objects for mode "${modeId}"`);
    } finally {
      this.buildInFlight = false;
    }
  }

  private async spawnFeature(feature: MapFeatureDefinition): Promise<void> {
    const placements = this.resolvePlacements(feature);
    if (placements.length === 0 || !this.terrainManager) {
      return;
    }

    const featureYaw = feature.placement?.yaw ?? 0;
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i];

      // Route fixed-wing aircraft to FixedWingModel for interactive spawning
      if (this.fixedWingModel && FixedWingModel.isFixedWingModelPath(placement.modelPath)) {
        _rotatedOffset.copy(placement.offset).applyAxisAngle(_upAxis, featureYaw);
        const worldPos = new THREE.Vector3(
          feature.position.x + _rotatedOffset.x,
          feature.position.y,
          feature.position.z + _rotatedOffset.z,
        );
        const heading = featureYaw + (placement.yaw ?? 0);
        const spotId = `${feature.id}_fw_${i}`;
        this.fixedWingModel.createAircraftAtSpot(spotId, placement.modelPath, worldPos, heading);
        continue;
      }

      const object = await modelLoader.loadModel(placement.modelPath);
      prepareModelForPlacement(object, placement.modelPath);
      this.optimizeStaticPlacementObject(object, placement.modelPath);

      const profile = getModelPlacementProfile(placement.modelPath);

      object.scale.multiplyScalar(STRUCTURE_SCALE);
      if (placement.uniformScale && placement.uniformScale !== 1) {
        object.scale.multiplyScalar(placement.uniformScale);
      }
      if (profile.displayScale !== undefined && profile.displayScale !== 1) {
        object.scale.multiplyScalar(profile.displayScale);
      }

      _rotatedOffset.copy(placement.offset).applyAxisAngle(_upAxis, featureYaw);
      const worldX = feature.position.x + _rotatedOffset.x;
      const worldZ = feature.position.z + _rotatedOffset.z;
      const terrainPlacement = placement.terrainSnap === false
        ? {
            x: worldX,
            y: feature.position.y + _rotatedOffset.y,
            z: worldZ,
          }
        : this.resolveTerrainPlacement(worldX, worldZ, object);

      object.position.set(
        terrainPlacement.x,
        terrainPlacement.y + (placement.heightOffset ?? 0),
        terrainPlacement.z
      );
      object.rotation.y = featureYaw + (placement.yaw ?? 0);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.scene.add(object);
      freezeTransform(object);
      const objectId = `${feature.id}_${placement.id ?? i}`;
      const collisionRegistered = placement.registerCollision === true && profile.collisionMode === 'bounds';
      if (collisionRegistered) {
        this.terrainManager.registerCollisionObject(objectId, object);
      }

      this.spawnedObjects.push({
        id: objectId,
        object,
        collisionRegistered,
      });
    }
  }

  private optimizeStaticPlacementObject(object: THREE.Object3D, modelPath: string): void {
    const result = optimizeStaticModelDrawCalls(object, {
      batchNamePrefix: modelPath.replace(/[/.]/g, '_'),
    });

    if (result.sourceMeshCount > 1 && result.mergedMeshCount > 0) {
      Logger.info(
        'world',
        `Optimized static placement ${modelPath}: ${result.sourceMeshCount} leaf meshes -> ${result.mergedMeshCount} batches`,
      );
    }
  }

  private resolvePlacements(feature: MapFeatureDefinition): StaticModelPlacementConfig[] {
    const prefab = getWorldFeaturePrefab(feature);
    const prefabPlacements = prefab?.placements ?? [];
    const generatedPlacements = this.resolveGeneratedPlacements(feature);
    const featurePlacements = feature.staticPlacements ?? [];
    return [...prefabPlacements, ...generatedPlacements, ...featurePlacements];
  }

  private hasStaticPlacements(feature: MapFeatureDefinition): boolean {
    return this.resolvePlacements(feature).length > 0;
  }

  private resolveGeneratedPlacements(feature: MapFeatureDefinition): StaticModelPlacementConfig[] {
    if (feature.kind !== 'airfield' || !feature.templateId) {
      return [];
    }

    const template = AIRFIELD_TEMPLATES[feature.templateId];
    if (!template) {
      Logger.warn('world', `Unknown airfield template "${feature.templateId}" on feature "${feature.id}"`);
      return [];
    }

    return generateAirfieldLayout(
      template,
      feature.position,
      feature.placement?.yaw ?? 0,
      feature.seedHint ?? feature.id,
    ).placements;
  }

  private clearSpawnedObjects(): void {
    for (const entry of this.spawnedObjects) {
      if (typeof (modelLoader as any).disposeInstance === 'function') {
        modelLoader.disposeInstance(entry.object);
      } else {
        this.scene.remove(entry.object);
        entry.object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((material) => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
      if (entry.collisionRegistered && this.terrainManager) {
        this.terrainManager.unregisterCollisionObject(entry.id);
      }
    }
    this.spawnedObjects = [];
    this.builtModeId = null;
  }

  private resolveTerrainPlacement(
    baseX: number,
    baseZ: number,
    object: THREE.Object3D,
  ): { x: number; y: number; z: number } {
    if (!this.terrainManager) {
      return { x: baseX, y: 0, z: baseZ };
    }

    const footprintRadius = this.estimatePlacementFootprintRadius(object);
    const baseCandidate = this.scoreTerrainPlacementCandidate(baseX, baseZ, baseX, baseZ, footprintRadius);
    if (baseCandidate.score === Number.POSITIVE_INFINITY) {
      return {
        x: baseX,
        y: this.terrainManager.getHeightAt(baseX, baseZ),
        z: baseZ,
      };
    }

    if (baseCandidate.heightSpan <= WORLD_FEATURE_FLAT_SPAN_TARGET) {
      return baseCandidate;
    }

    const maxSearchRadius = footprintRadius <= 4.5
      ? WORLD_FEATURE_MAX_SEARCH_RADIUS_SMALL
      : WORLD_FEATURE_MAX_SEARCH_RADIUS_LARGE;
    const searchRadius = THREE.MathUtils.clamp(
      footprintRadius * 0.8,
      WORLD_FEATURE_MIN_SEARCH_RADIUS,
      maxSearchRadius,
    );

    let best = baseCandidate;
    const ringRadii = [searchRadius * 0.5, searchRadius];
    for (const radius of ringRadii) {
      for (let sampleIndex = 0; sampleIndex < WORLD_FEATURE_SAMPLE_DIRECTIONS; sampleIndex++) {
        const angle = (sampleIndex / WORLD_FEATURE_SAMPLE_DIRECTIONS) * Math.PI * 2;
        const candidate = this.scoreTerrainPlacementCandidate(
          baseX + Math.cos(angle) * radius,
          baseZ + Math.sin(angle) * radius,
          baseX,
          baseZ,
          footprintRadius,
        );
        if (candidate.score < best.score) {
          best = candidate;
        }
      }
    }

    return best;
  }

  private estimatePlacementFootprintRadius(object: THREE.Object3D): number {
    object.updateMatrixWorld(true);
    _placementBounds.setFromObject(object);
    _placementBounds.getSize(_placementSize);
    return THREE.MathUtils.clamp(
      Math.max(_placementSize.x, _placementSize.z) * 0.5,
      1.25,
      10,
    );
  }

  private scoreTerrainPlacementCandidate(
    x: number,
    z: number,
    baseX: number,
    baseZ: number,
    footprintRadius: number,
  ): TerrainPlacementCandidate {
    if (!this.terrainManager?.hasTerrainAt(x, z)) {
      return { x, y: 0, z, score: Number.POSITIVE_INFINITY, heightSpan: Number.POSITIVE_INFINITY };
    }

    const sampleRadius = THREE.MathUtils.clamp(footprintRadius * 0.55, 1.1, 5.5);
    const samples = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.7, 0.7],
      [-0.7, 0.7],
      [0.7, -0.7],
      [-0.7, -0.7],
    ] as const;

    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    let sumHeight = 0;
    let centerHeight = 0;

    for (let i = 0; i < samples.length; i++) {
      const [offsetX, offsetZ] = samples[i];
      const sampleX = x + offsetX * sampleRadius;
      const sampleZ = z + offsetZ * sampleRadius;
      if (!this.terrainManager.hasTerrainAt(sampleX, sampleZ)) {
        return { x, y: 0, z, score: Number.POSITIVE_INFINITY, heightSpan: Number.POSITIVE_INFINITY };
      }

      const height = this.terrainManager.getHeightAt(sampleX, sampleZ);
      if (i === 0) {
        centerHeight = height;
      }
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
      sumHeight += height;
    }

    const meanHeight = sumHeight / samples.length;
    const heightSpan = maxHeight - minHeight;
    const normalY = typeof (this.terrainManager as any).getNormalAt === 'function'
      ? Number(this.terrainManager.getNormalAt(x, z, _placementNormal).y)
      : 1;
    const slopePenalty = 1 - THREE.MathUtils.clamp(normalY, 0, 1);
    const centerBias = Math.abs(centerHeight - meanHeight);
    const distancePenalty = Math.hypot(x - baseX, z - baseZ) * 0.18;

    // Corner height divergence: reject if any corner is too far from center
    const cornerMaxDivergence = Math.max(
      Math.abs(maxHeight - centerHeight),
      Math.abs(minHeight - centerHeight),
    );
    const cornerPenalty = cornerMaxDivergence > 1.5 ? 50 : cornerMaxDivergence * 3;

    // Navmesh walkability: penalize placements on unwalkable terrain
    let navmeshPenalty = 0;
    if (this.navmeshSystem?.isReady()) {
      if (!this.navmeshSystem.isPointOnNavmesh(new THREE.Vector3(x, meanHeight, z))) {
        navmeshPenalty = 20; // strong penalty for off-navmesh placement
      }
    }

    const score = heightSpan * 5 + centerBias * 2 + slopePenalty * 8 + distancePenalty + cornerPenalty + navmeshPenalty;
    const groundedY = meanHeight + Math.min(heightSpan * 0.15, 0.18);

    return {
      x,
      y: groundedY,
      z,
      score,
      heightSpan,
    };
  }
}
