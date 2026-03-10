import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { MapFeatureDefinition, StaticModelPlacementConfig } from '../../config/gameModeTypes';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { Logger } from '../../utils/Logger';
import { modelLoader } from '../assets/ModelLoader';
import { getModelPlacementProfile } from '../assets/ModelPlacementProfiles';
import { prepareModelForPlacement } from '../assets/ModelPlacementUtils';
import { AIRFIELD_TEMPLATES } from './AirfieldTemplates';
import { generateAirfieldLayout } from './AirfieldLayoutGenerator';
import { GameModeManager } from './GameModeManager';
import { getWorldFeaturePrefab } from './WorldFeaturePrefabs';

const _rotatedOffset = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);

/**
 * Global scale multiplier for placed structures.
 * NPC billboards are 7 units tall (PlaneGeometry 5x7) but real structures
 * are modeled at roughly 1:1 meter scale. This multiplier brings structures
 * to a visually proportional size next to the oversized billboard soldiers.
 */
const STRUCTURE_SCALE = 2.5;

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
      const object = await modelLoader.loadModel(placement.modelPath);
      prepareModelForPlacement(object, placement.modelPath);

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
      const baseY = placement.terrainSnap === false
        ? feature.position.y + _rotatedOffset.y
        : this.terrainManager.getHeightAt(worldX, worldZ);

      object.position.set(worldX, baseY + (placement.heightOffset ?? 0), worldZ);
      object.rotation.y = featureYaw + (placement.yaw ?? 0);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.scene.add(object);
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
}
