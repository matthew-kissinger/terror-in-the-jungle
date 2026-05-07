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
import { AIRFIELD_TEMPLATES, getAirfieldTemplateCompatibilityIssues } from './AirfieldTemplates';
import { generateAirfieldLayout } from './AirfieldLayoutGenerator';
import { GameModeManager } from './GameModeManager';
import { getWorldFeaturePrefab } from './WorldFeaturePrefabs';
import type { NavmeshSystem } from '../navigation/NavmeshSystem';
import { FixedWingModel } from '../vehicle/FixedWingModel';
import type { FixedWingSpawnMetadata } from '../vehicle/FixedWingOperations';
import type { LOSAccelerator } from '../combat/LOSAccelerator';

const _rotatedOffset = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _placementBounds = new THREE.Box3();
const _placementSize = new THREE.Vector3();
const _placementNormal = new THREE.Vector3();
const _featureSectorBounds = new THREE.Box3();
const _featureFrustum = new THREE.Frustum();
const _featureViewProjection = new THREE.Matrix4();
const _featureCameraInverse = new THREE.Matrix4();

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
const WORLD_FEATURE_MAX_SEARCH_RADIUS_LARGE = 24;
const WORLD_FEATURE_MAX_PLACEMENT_FOOTPRINT_RADIUS = 24;
const WORLD_FEATURE_MAX_PLACEMENT_SAMPLE_RADIUS = 18;
const WORLD_FEATURE_SAMPLE_DIRECTIONS = 8;
/**
 * Minimum horizontal footprint (meters) for a static placement to be registered
 * with the LOS accelerator as an aircraft-collidable obstacle. Tuned to include
 * buildings, hangars, towers, and bunkers while excluding small props
 * (barrels, ammo crates, fuel drums) that should not block an aircraft sweep.
 */
const BUILDING_LOS_MIN_FOOTPRINT_M = 3;
const WORLD_FEATURE_RENDER_DISTANCE_M = 900;
const WORLD_FEATURE_RENDER_HYSTERESIS_M = 80;
const WORLD_FEATURE_BATCH_SECTOR_SIZE_M = 700;
const WORLD_FEATURE_FRUSTUM_ALWAYS_VISIBLE_M = 180;
const WORLD_FEATURE_SECTOR_MIN_Y = -120;
const WORLD_FEATURE_SECTOR_MAX_Y = 420;

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
  losObstacleIds: string[];
}

interface WorldFeatureRenderSector {
  id: string;
  group: THREE.Group;
  visible: boolean;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface WorldFeatureSystemDependencies {
  terrainManager: ITerrainRuntime;
  gameModeManager: GameModeManager;
}

export class WorldFeatureSystem implements GameSystem {
  private readonly scene: THREE.Scene;
  private readonly camera?: THREE.Camera;
  private terrainManager?: ITerrainRuntime;
  private gameModeManager?: GameModeManager;
  private navmeshSystem?: NavmeshSystem;
  private fixedWingModel?: FixedWingModel;
  private losAccelerator?: LOSAccelerator;
  private spawnedObjects: SpawnedFeatureObject[] = [];
  private featureGroups: WorldFeatureRenderSector[] = [];
  private staticFeatureRoot: THREE.Group | null = null;
  private buildInFlight = false;
  private builtModeId: string | null = null;

  constructor(scene: THREE.Scene, camera?: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
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

  /**
   * Provide the LOS accelerator so spawned buildings can be registered as
   * aircraft-collidable obstacles. Without this, airframe terrain sweeps
   * see only the ground and phase through hangars and towers on takeoff.
   */
  setLOSAccelerator(losAccelerator: LOSAccelerator): void {
    this.losAccelerator = losAccelerator;
  }

  update(_deltaTime: number): void {
    if (!this.terrainManager || !this.gameModeManager || this.buildInFlight) {
      return;
    }

    const config = this.gameModeManager.getCurrentConfig();
    if (this.builtModeId === config.id) {
      this.updateFeatureVisibility();
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
    this.staticFeatureRoot = new THREE.Group();
    this.staticFeatureRoot.name = 'WorldStaticFeatureBatchRoot';
    this.staticFeatureRoot.userData.perfCategory = 'world_static_features';
    this.scene.add(this.staticFeatureRoot);

    try {
      for (const feature of features) {
        const featureGroup = this.createFeatureGroup(feature);
        await this.spawnFeature(feature, featureGroup);
      }
      for (const sector of this.featureGroups) {
        this.optimizeStaticFeatureGroup(sector.group);
      }
      this.updateFeatureVisibility();
      this.builtModeId = modeId;
      Logger.info('world', `Spawned ${this.spawnedObjects.length} world feature objects for mode "${modeId}"`);
    } finally {
      this.buildInFlight = false;
    }
  }

  private createFeatureGroup(feature: MapFeatureDefinition): THREE.Group {
    const sector = this.getOrCreateFeatureSector(feature.position);
    this.expandFeatureSectorBounds(sector, feature);

    const group = new THREE.Group();
    group.name = `WorldFeature_${feature.id}`;
    group.userData.perfCategory = 'world_static_features';
    sector.group.add(group);
    return group;
  }

  private getOrCreateFeatureSector(position: THREE.Vector3): WorldFeatureRenderSector {
    const sectorX = Math.floor(position.x / WORLD_FEATURE_BATCH_SECTOR_SIZE_M);
    const sectorZ = Math.floor(position.z / WORLD_FEATURE_BATCH_SECTOR_SIZE_M);
    const id = `${sectorX},${sectorZ}`;
    const existing = this.featureGroups.find((entry) => entry.id === id);
    if (existing) {
      return existing;
    }

    const group = new THREE.Group();
    group.name = `WorldFeatureSector_${id}`;
    group.userData.perfCategory = 'world_static_features';
    this.staticFeatureRoot?.add(group);

    const sector: WorldFeatureRenderSector = {
      id,
      group,
      visible: true,
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    };
    this.featureGroups.push(sector);
    return sector;
  }

  private expandFeatureSectorBounds(sector: WorldFeatureRenderSector, feature: MapFeatureDefinition): void {
    const radius = feature.footprint?.shape === 'circle'
      ? feature.footprint.radius
      : feature.footprint?.shape === 'rect' || feature.footprint?.shape === 'strip'
        ? Math.hypot(feature.footprint.width, feature.footprint.length) * 0.5
        : feature.footprint?.shape === 'polygon'
          ? Math.max(0, ...feature.footprint.points.map((point) => Math.hypot(point.x, point.z)))
        : 0;
    sector.minX = Math.min(sector.minX, feature.position.x - radius);
    sector.maxX = Math.max(sector.maxX, feature.position.x + radius);
    sector.minZ = Math.min(sector.minZ, feature.position.z - radius);
    sector.maxZ = Math.max(sector.maxZ, feature.position.z + radius);
  }

  private async spawnFeature(feature: MapFeatureDefinition, parent: THREE.Object3D): Promise<void> {
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
        const metadata = this.buildFixedWingSpawnMetadata(feature.position, featureYaw, placement);
        const spawned = await this.fixedWingModel.createAircraftAtSpot(
          spotId,
          placement.modelPath,
          worldPos,
          heading,
          metadata,
        );
        if (spawned && placement.npcAutoFlight) {
          this.attachNPCFlight(spotId, worldPos, featureYaw, placement, metadata);
        }
        continue;
      }

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
      const terrainPlacement = placement.terrainSnap === false
        ? {
            x: worldX,
            y: feature.position.y + _rotatedOffset.y,
            z: worldZ,
          }
        : placement.skipFlatSearch
          ? { x: worldX, y: this.terrainManager.getHeightAt(worldX, worldZ), z: worldZ }
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
      parent.add(object);
      freezeTransform(object);
      const objectId = `${feature.id}_${placement.id ?? i}`;
      const collisionRegistered = placement.registerCollision === true && profile.collisionMode === 'bounds';
      if (collisionRegistered) {
        this.terrainManager.registerCollisionObject(objectId, object);
      }

      const losObstacleIds = this.registerPlacementWithLOS(objectId, object);

      this.spawnedObjects.push({
        id: objectId,
        object,
        collisionRegistered,
        losObstacleIds,
      });
    }
  }

  private optimizeStaticFeatureGroup(group: THREE.Group): void {
    if (group.children.length === 0) {
      return;
    }

    const result = optimizeStaticModelDrawCalls(group, {
      batchNamePrefix: 'world_static_features',
      strategy: 'batch',
      minBucketSize: 2,
      excludeMesh: (mesh) => (mesh as THREE.BatchedMesh).isBatchedMesh === true,
    });

    if (result.sourceMeshCount > 1 && result.mergedMeshCount > 0) {
      Logger.info(
        'world',
        `Optimized world feature layer: ${result.sourceMeshCount} leaf meshes -> ${result.mergedMeshCount} shared batch(es)`,
      );
    }
  }

  private updateFeatureVisibility(): void {
    if (!this.camera || this.featureGroups.length === 0) {
      return;
    }

    const cameraX = this.camera.position.x;
    const cameraZ = this.camera.position.z;
    const showDistanceSq = WORLD_FEATURE_RENDER_DISTANCE_M * WORLD_FEATURE_RENDER_DISTANCE_M;
    const hideDistance = WORLD_FEATURE_RENDER_DISTANCE_M + WORLD_FEATURE_RENDER_HYSTERESIS_M;
    const hideDistanceSq = hideDistance * hideDistance;
    this.camera.updateMatrixWorld(true);
    _featureCameraInverse.copy(this.camera.matrixWorld).invert();
    _featureViewProjection.multiplyMatrices(this.camera.projectionMatrix, _featureCameraInverse);
    _featureFrustum.setFromProjectionMatrix(_featureViewProjection);

    for (const entry of this.featureGroups) {
      const distanceSq = this.horizontalDistanceToSectorBoundsSq(entry, cameraX, cameraZ);
      const insideRenderDistance = entry.visible
        ? distanceSq <= hideDistanceSq
        : distanceSq <= showDistanceSq;
      const closeEnoughToSkipFrustum = distanceSq <= WORLD_FEATURE_FRUSTUM_ALWAYS_VISIBLE_M * WORLD_FEATURE_FRUSTUM_ALWAYS_VISIBLE_M;
      const insideView = closeEnoughToSkipFrustum || this.sectorIntersectsCameraView(entry);
      const shouldBeVisible = insideRenderDistance && insideView;

      if (entry.visible === shouldBeVisible) {
        continue;
      }
      entry.visible = shouldBeVisible;
      entry.group.visible = shouldBeVisible;
    }
  }

  private horizontalDistanceToSectorBoundsSq(
    sector: WorldFeatureRenderSector,
    x: number,
    z: number,
  ): number {
    const dx = x < sector.minX
      ? sector.minX - x
      : x > sector.maxX
        ? x - sector.maxX
        : 0;
    const dz = z < sector.minZ
      ? sector.minZ - z
      : z > sector.maxZ
        ? z - sector.maxZ
        : 0;
    return dx * dx + dz * dz;
  }

  private sectorIntersectsCameraView(sector: WorldFeatureRenderSector): boolean {
    if (
      !Number.isFinite(sector.minX)
      || !Number.isFinite(sector.maxX)
      || !Number.isFinite(sector.minZ)
      || !Number.isFinite(sector.maxZ)
    ) {
      return true;
    }

    _featureSectorBounds.min.set(sector.minX, WORLD_FEATURE_SECTOR_MIN_Y, sector.minZ);
    _featureSectorBounds.max.set(sector.maxX, WORLD_FEATURE_SECTOR_MAX_Y, sector.maxZ);
    return _featureFrustum.intersectsBox(_featureSectorBounds);
  }

  /**
   * Register every collidable mesh inside a placement with the LOS accelerator
   * so airframe terrain sweeps see buildings, not just terrain. Returns the
   * ids used so they can be unregistered on teardown.
   *
   * Placements whose combined horizontal footprint is below
   * `BUILDING_LOS_MIN_FOOTPRINT_M` are skipped (small props, barrels, crates).
   * These features would otherwise pollute the cache without being realistic
   * aircraft hazards. World features (buildings, hangars, towers, bunkers)
   * all clear this threshold.
   */
  private registerPlacementWithLOS(objectId: string, root: THREE.Object3D): string[] {
    if (!this.losAccelerator) {
      return [];
    }

    root.updateMatrixWorld(true);
    _placementBounds.setFromObject(root);
    if (!isFinite(_placementBounds.min.x) || !isFinite(_placementBounds.max.x)) {
      return [];
    }
    _placementBounds.getSize(_placementSize);
    const horizontalFootprint = Math.max(_placementSize.x, _placementSize.z);
    if (horizontalFootprint < BUILDING_LOS_MIN_FOOTPRINT_M) {
      return [];
    }

    const ids: string[] = [];
    let meshIndex = 0;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const meshId = `${objectId}_mesh_${meshIndex++}`;
        this.losAccelerator!.registerStaticObstacle(meshId, child);
        ids.push(meshId);
      }
    });
    return ids;
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

    const compatibilityIssues = getAirfieldTemplateCompatibilityIssues(template);
    if (compatibilityIssues.length > 0) {
      const details = compatibilityIssues
        .map((issue) => `${issue.modelPath} requires ${issue.minimumRunwayLength}m, template has ${issue.actualRunwayLength}m`)
        .join('; ');
      Logger.warn('world', `Airfield template "${template.id}" has runway compatibility issues: ${details}`);
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
      if (this.losAccelerator && entry.losObstacleIds.length > 0) {
        for (const meshId of entry.losObstacleIds) {
          this.losAccelerator.unregisterStaticObstacle(meshId);
        }
      }
    }
    this.spawnedObjects = [];
    this.featureGroups = [];
    this.clearStaticFeatureRoot();
    this.builtModeId = null;
  }

  private clearStaticFeatureRoot(): void {
    if (!this.staticFeatureRoot) {
      return;
    }

    this.staticFeatureRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      if (child.userData.generatedOptimizedMesh === true) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.staticFeatureRoot.removeFromParent();
    this.staticFeatureRoot.clear();
    this.staticFeatureRoot = null;
  }

  /**
   * Translate a placement's `npcAutoFlight` hint into a concrete NPC pilot
   * mission and attach it to the just-spawned aircraft. Waypoint offset is
   * rotated from airfield-local to world space; home runway comes from the
   * placement's `fixedWingSpawn.runwayStart`.
   */
  private attachNPCFlight(
    aircraftId: string,
    spawnWorldPos: THREE.Vector3,
    featureYaw: number,
    placement: StaticModelPlacementConfig,
    metadata: FixedWingSpawnMetadata | undefined,
  ): void {
    if (!this.fixedWingModel || !placement.npcAutoFlight) {
      return;
    }
    const autoFlight = placement.npcAutoFlight;
    _rotatedOffset.copy(autoFlight.waypointOffset).applyAxisAngle(_upAxis, featureYaw);
    const waypointWorld = new THREE.Vector3(
      spawnWorldPos.x + _rotatedOffset.x,
      spawnWorldPos.y,
      spawnWorldPos.z + _rotatedOffset.z,
    );

    const runwayStart = metadata?.runwayStart;
    const home = runwayStart
      ? {
          runwayStart: runwayStart.position.clone(),
          runwayHeading: runwayStart.heading,
        }
      : {
          runwayStart: spawnWorldPos.clone(),
          runwayHeading: featureYaw + (placement.yaw ?? 0),
        };

    const mission = {
      kind: autoFlight.kind,
      waypoints: [
        {
          position: waypointWorld,
          altitudeAGLm: autoFlight.altitudeAGLm,
          airspeedMs: autoFlight.airspeedMs,
          arrivalKind: 'flyby' as const,
        },
      ],
      bingo: { fuelFraction: 0.1, ammoFraction: 0.05 },
      homeAirfield: home,
    };

    const attached = this.fixedWingModel.attachNPCPilot(aircraftId, mission);
    if (!attached) {
      Logger.warn('world', `Failed to attach NPC pilot to ${aircraftId}`);
    } else {
      Logger.info('world', `Attached NPC pilot to ${aircraftId} for ${autoFlight.kind} sortie`);
    }
  }

  private buildFixedWingSpawnMetadata(
    featurePosition: THREE.Vector3,
    featureYaw: number,
    placement: StaticModelPlacementConfig,
  ): FixedWingSpawnMetadata | undefined {
    const metadata = placement.fixedWingSpawn;
    if (!metadata) {
      return undefined;
    }

    const rotateLocalPoint = (point: THREE.Vector3): THREE.Vector3 => {
      _rotatedOffset.copy(point).applyAxisAngle(_upAxis, featureYaw);
      return new THREE.Vector3(
        featurePosition.x + _rotatedOffset.x,
        featurePosition.y + point.y,
        featurePosition.z + _rotatedOffset.z,
      );
    };

    return {
      standId: metadata.standId,
      taxiRoute: (metadata.taxiRoute ?? []).map((point) => rotateLocalPoint(point)),
      runwayStart: metadata.runwayStart
        ? {
            id: metadata.runwayStart.id,
            position: rotateLocalPoint(metadata.runwayStart.position),
            heading: featureYaw + metadata.runwayStart.heading,
            holdShortPosition: metadata.runwayStart.holdShortPosition
              ? rotateLocalPoint(metadata.runwayStart.holdShortPosition)
              : undefined,
            shortFinalDistance: metadata.runwayStart.shortFinalDistance ?? 160,
            shortFinalAltitude: metadata.runwayStart.shortFinalAltitude ?? 40,
          }
        : undefined,
    };
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
      WORLD_FEATURE_MAX_PLACEMENT_FOOTPRINT_RADIUS,
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

    const sampleRadius = THREE.MathUtils.clamp(
      footprintRadius * 0.75,
      1.1,
      WORLD_FEATURE_MAX_PLACEMENT_SAMPLE_RADIUS,
    );
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
