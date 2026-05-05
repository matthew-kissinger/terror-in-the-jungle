import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from './types';
import { AssetLoader } from '../assets/AssetLoader';
import {
  CombatantMeshFactory,
  NPC_CLOSE_MODEL_TARGET_HEIGHT,
  PIXEL_FORGE_NPC_STARTUP_CLIP_IDS,
  NPC_SPRITE_RENDER_Y_OFFSET,
  disposeCombatantMeshes,
  getPixelForgeNpcBucketKey,
  getPixelForgeNpcClipForCombatant,
  reportBucketOverflow,
  setPixelForgeNpcImpostorAttributes,
  updateCombatantTexture,
  type WalkFrameMap,
} from './CombatantMeshFactory';
import { CombatantShaderSettingsManager, setDamageFlash, updateShaderUniforms, type NPCShaderSettings, type ShaderPreset, type ShaderUniformSettings } from './CombatantShaders';
import { Logger } from '../../utils/Logger';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';
import { isDiagEnabled } from '../../core/PerfDiagnostics';
import { modelLoader } from '../assets/ModelLoader';
import {
  createCombatantHitProxyScratch,
  writeCombatantHitProxies,
  type CombatantHitProxy,
} from './CombatantBodyMetrics';
import { type PixelForgeNpcClipId } from '../../config/pixelForgeAssets';
import {
  getPixelForgeNpcPoolKey,
  getPixelForgeNpcRuntimeFaction,
  PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_SQ,
  PIXEL_FORGE_NPC_CLOSE_MODEL_LAZY_LOAD_FLAG,
  PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
  PIXEL_FORGE_NPC_RUNTIME_FACTIONS,
  sanitizePixelForgeNpcAnimationClip,
  type PixelForgeNpcFactionRuntimeConfig,
  type PixelForgeNpcPoolKey,
  type PixelForgeNpcWeaponRuntimeConfig,
} from './PixelForgeNpcRuntime';

/** Y bob amplitude in world units. */
const BOB_AMPLITUDE = 0.12;

/** Y bob speed multiplier. */
const BOB_SPEED = 3.0;
const TWO_PI = Math.PI * 2;
const NPC_IMPOSTOR_VIEW_COLUMNS = 7;
const NPC_IMPOSTOR_VIEW_FORWARD_OFFSET = Math.PI;
const HITBOX_DEBUG_MAX_ACTORS = 24;
const DEATH_TOTAL_DURATION_SECONDS = 8.7;
const DEATH_FALL_DURATION_SECONDS = 0.7;
const DEATH_GROUND_DURATION_SECONDS = 6.0;
const DEATH_FADEOUT_DURATION_SECONDS = 2.0;
const DEATH_FALL_PHASE = DEATH_FALL_DURATION_SECONDS / DEATH_TOTAL_DURATION_SECONDS;
const DEATH_GROUND_PHASE = DEATH_GROUND_DURATION_SECONDS / DEATH_TOTAL_DURATION_SECONDS;
const DEATH_FADEOUT_PHASE = DEATH_FADEOUT_DURATION_SECONDS / DEATH_TOTAL_DURATION_SECONDS;
const DEATH_FADE_START_PHASE = DEATH_FALL_PHASE + DEATH_GROUND_PHASE;
const DEATH_CLIP_HOLD_PROGRESS = 0.999;
const CLOSE_MODEL_FADE_EPSILON = 0.01;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getCombatantDeathProgress(combatant: Combatant): number {
  if (!combatant.isDying) return 0;
  return clamp01(combatant.deathProgress ?? 0);
}

function getCombatantDeathClipProgress(combatant: Combatant): number {
  const progress = getCombatantDeathProgress(combatant);
  if (progress <= 0) return 0;
  return Math.min(DEATH_CLIP_HOLD_PROGRESS, progress / DEATH_FALL_PHASE);
}

function getCombatantDeathOpacity(combatant: Combatant): number {
  if (!combatant.isDying) return 1;
  const progress = getCombatantDeathProgress(combatant);
  if (progress <= DEATH_FADE_START_PHASE) return 1;
  return clamp01(1 - (progress - DEATH_FADE_START_PHASE) / DEATH_FADEOUT_PHASE);
}

function isOneShotDeathClip(clipId: PixelForgeNpcClipId): boolean {
  return clipId === 'death_fall_back';
}

function isHitboxDebugEnabled(): boolean {
  if (!isDiagEnabled() || typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get('hitboxes');
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
  } catch {
    return false;
  }
}

interface CloseModelInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<PixelForgeNpcClipId, THREE.AnimationAction>;
  poolKey: PixelForgeNpcPoolKey;
  factionConfig: PixelForgeNpcFactionRuntimeConfig;
  weaponPivot?: THREE.Group;
  weaponRoot?: THREE.Group;
  weaponConfig: PixelForgeNpcWeaponRuntimeConfig;
  bones: Map<string, THREE.Object3D>;
  hasWeapon: boolean;
  boundsMinY: number;
  visualScale: number;
  materialStates: CloseModelMaterialState[];
  activeClip?: PixelForgeNpcClipId;
  combatantId?: string;
}

interface CloseModelMetrics {
  boundsMinY: number;
  visualScale: number;
}

interface CombatantRendererBillboardOptions {
  eagerCloseModelPools?: boolean;
}

interface CloseModelMaterialState {
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

export class CombatantRenderer {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;
  private meshFactory: CombatantMeshFactory;
  private factionMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private factionAuraMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private factionGroundMarkers: Map<string, THREE.InstancedMesh> = new Map();
  private soldierTextures: Map<string, THREE.Texture> = new Map();
  private factionMaterials: Map<string, THREE.ShaderMaterial> = new Map();
  private walkFrameTextures: WalkFrameMap = new Map();
  private playerSquadId?: string;
  private playerSquadDetected = false;
  private shaderSettings = new CombatantShaderSettingsManager();
  private combatantStates: Map<string, { state: number; damaged: number }> = new Map();
  private closeModelPools: Map<PixelForgeNpcPoolKey, CloseModelInstance[]> = new Map();
  private closeModelPoolLoads: Map<PixelForgeNpcPoolKey, Promise<void>> = new Map();
  private activeCloseModels: Map<string, CloseModelInstance> = new Map();
  private readonly closeModelOverflowLastLog = new Map<string, number>();
  private disposed = false;

  // Walk animation state
  private walkFrameTimer = 0;
  private currentWalkFrame: 'a' | 'b' = 'a';
  private elapsedTime = 0;

  // Scratch objects to avoid per-frame allocation
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchSpinMatrix = new THREE.Matrix4();
  private readonly scratchCameraDir = new THREE.Vector3();
  private readonly scratchCameraRight = new THREE.Vector3();
  private readonly scratchCameraForward = new THREE.Vector3();
  private readonly scratchCombatantForward = new THREE.Vector3();
  private readonly scratchToCombatant = new THREE.Vector3();
  private readonly scratchPosition = new THREE.Vector3();
  private readonly scratchUp = new THREE.Vector3(0, 1, 0);
  private readonly scratchTiltAxis = new THREE.Vector3();
  private readonly scratchPerpDir = new THREE.Vector3();
  private readonly scratchTiltMatrix = new THREE.Matrix4();
  private readonly scratchScaleMatrix = new THREE.Matrix4();
  private readonly scratchOutlineMatrix = new THREE.Matrix4();
  private readonly scratchMarkerMatrix = new THREE.Matrix4();
  private readonly scratchBounds = new THREE.Box3();
  private readonly scratchBoundsSize = new THREE.Vector3();
  private readonly renderWriteCounts = new Map<string, number>();
  private readonly renderCombatStates = new Map<string, number>();
  private readonly hitboxDebugEnabled = isHitboxDebugEnabled();
  private readonly hitboxDebugGroup = new THREE.Group();
  private readonly hitboxDebugProxies = createCombatantHitProxyScratch();
  private readonly hitboxDebugUp = new THREE.Vector3(0, 1, 0);
  private readonly hitboxHeadMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4f4f,
    transparent: true,
    opacity: 0.85,
    wireframe: true,
    depthTest: false,
  });
  private readonly hitboxBodyMaterial = new THREE.MeshBasicMaterial({
    color: 0x37d8ff,
    transparent: true,
    opacity: 0.72,
    wireframe: true,
    depthTest: false,
  });

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.meshFactory = new CombatantMeshFactory(scene, assetLoader);
    this.hitboxDebugGroup.name = 'PixelForgeHitboxDebugOverlay';
    this.hitboxDebugGroup.visible = this.hitboxDebugEnabled;
    this.scene.add(this.hitboxDebugGroup);
  }

  private stableHash01(id: string): number {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000) / 1000;
  }

  async createFactionBillboards(options: CombatantRendererBillboardOptions = {}): Promise<void> {
    const assets = this.meshFactory.createFactionBillboards(PIXEL_FORGE_NPC_STARTUP_CLIP_IDS);
    this.factionMeshes = assets.factionMeshes;
    this.factionAuraMeshes = assets.factionAuraMeshes;
    this.factionGroundMarkers = assets.factionGroundMarkers;
    this.soldierTextures = assets.soldierTextures;
    this.factionMaterials = assets.factionMaterials;
    this.walkFrameTextures = assets.walkFrameTextures;
    if (options.eagerCloseModelPools) {
      await this.createCloseModelPools();
    }
  }

  private ensureImpostorBucket(
    factionPrefix: Faction | 'SQUAD',
    clipId: PixelForgeNpcClipId,
  ): THREE.InstancedMesh | undefined {
    const key = getPixelForgeNpcBucketKey(factionPrefix, clipId);
    const existing = this.factionMeshes.get(key);
    if (existing) return existing;

    const bucket = this.meshFactory.createFactionImpostorBucket(factionPrefix, clipId);
    if (!bucket) return undefined;

    this.factionMeshes.set(bucket.key, bucket.mesh);
    this.factionGroundMarkers.set(bucket.key, bucket.marker);
    this.factionMaterials.set(bucket.key, bucket.material);
    this.soldierTextures.set(bucket.key, bucket.texture);
    this.renderWriteCounts.set(bucket.key, 0);
    this.renderCombatStates.set(bucket.key, 0);
    Logger.info('combat-renderer', `Lazy-created Pixel Forge NPC impostor bucket ${bucket.key}`);
    return bucket.mesh;
  }

  setPlayerSquadId(squadId: string | undefined): void {
    this.playerSquadId = squadId;
    this.playerSquadDetected = false;
    Logger.info('combat-renderer', ` Renderer: Player squad ID set to: ${squadId}`);
  }

  private async createCloseModelPools(): Promise<void> {
    const modelConfigs = [
      ...PIXEL_FORGE_NPC_RUNTIME_FACTIONS.map((config) => ({
        poolKey: config.runtimeFaction as PixelForgeNpcPoolKey,
        factionConfig: config,
      })),
      {
        poolKey: 'SQUAD' as PixelForgeNpcPoolKey,
        factionConfig: getPixelForgeNpcRuntimeFaction('SQUAD'),
      },
    ];

    for (const config of modelConfigs) {
      await this.createCloseModelPool(config.poolKey, config.factionConfig);
    }
  }

  private queueCloseModelPoolLoad(poolKey: PixelForgeNpcPoolKey): void {
    if (this.disposed || this.closeModelPools.has(poolKey) || this.closeModelPoolLoads.has(poolKey)) return;
    const factionConfig = getPixelForgeNpcRuntimeFaction(poolKey);
    const startLoad = async (): Promise<void> => {
      if (this.disposed) return;
      await this.createCloseModelPool(poolKey, factionConfig);
    };
    const loadPromise = new Promise<void>((resolve) => {
      const run = (): void => {
        startLoad()
          .catch((error) => {
            Logger.warn('combat-renderer', `Failed to lazily create Pixel Forge NPC close-model pool ${poolKey}`, error);
          })
          .finally(resolve);
      };
      const waitForLive = (): void => {
        if (this.disposed) {
          resolve();
          return;
        }
        if (!this.isCloseModelLazyLoadAllowed()) {
          setTimeout(waitForLive, 500);
          return;
        }
        this.scheduleIdleCloseModelLoad(run);
      };
      waitForLive();
    });
    this.closeModelPoolLoads.set(poolKey, loadPromise);
    loadPromise.finally(() => {
      this.closeModelPoolLoads.delete(poolKey);
    });
  }

  private isCloseModelLazyLoadAllowed(): boolean {
    if (typeof window === 'undefined') return true;
    return (window as unknown as Record<string, unknown>)[PIXEL_FORGE_NPC_CLOSE_MODEL_LAZY_LOAD_FLAG] === true;
  }

  private scheduleIdleCloseModelLoad(run: () => void): void {
    if (this.disposed) return;
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 250);
    }
  }

  private async createCloseModelPool(
    poolKey: PixelForgeNpcPoolKey,
    factionConfig: PixelForgeNpcFactionRuntimeConfig,
  ): Promise<void> {
    if (this.disposed || this.closeModelPools.has(poolKey)) return;

    const pool: CloseModelInstance[] = [];
    for (let i = 0; i < PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION; i++) {
      if (this.disposed) break;
      try {
        const model = await modelLoader.loadAnimatedModel(factionConfig.modelPath);
        const weaponRoot = await modelLoader.loadModel(factionConfig.weapon.modelPath);
        if (this.disposed) {
          modelLoader.disposeInstance(model.scene);
          modelLoader.disposeInstance(weaponRoot);
          break;
        }
        const weaponPivot = new THREE.Group();
        weaponPivot.name = `${factionConfig.weapon.id}_weapon_socket`;
        weaponPivot.visible = true;
        this.normalizeWeaponRoot(weaponRoot, factionConfig.weapon);
        weaponPivot.add(weaponRoot);
        model.scene.add(weaponPivot);
        model.scene.visible = false;
        model.scene.traverse((child) => {
          if (child instanceof THREE.Object3D) child.frustumCulled = false;
        });
        this.applyCloseModelMaterialTuning(model.scene, factionConfig);
        this.scene.add(model.scene);
        const mixer = new THREE.AnimationMixer(model.scene);
        const metrics = this.measureCloseModelMetrics(model.scene);
        const bones = this.collectBones(model.scene);
        pool.push({
          root: model.scene,
          mixer,
          actions: this.createActionMap(mixer, model.animations),
          poolKey,
          factionConfig,
          weaponPivot,
          weaponRoot,
          weaponConfig: factionConfig.weapon,
          bones,
          hasWeapon: bones.has(factionConfig.rightHandSocket) && bones.has(factionConfig.leftHandSocket),
          boundsMinY: metrics.boundsMinY,
          visualScale: metrics.visualScale,
          materialStates: this.collectCloseModelMaterialStates(model.scene),
        });
      } catch (error) {
        Logger.warn('combat-renderer', `Failed to create Pixel Forge NPC model from ${factionConfig.modelPath}`, error);
        break;
      }
    }

    if (this.disposed) {
      for (const instance of pool) {
        instance.mixer.stopAllAction();
        modelLoader.disposeInstance(instance.root);
      }
      return;
    }

    this.closeModelPools.set(poolKey, pool);
    Logger.info('combat-renderer', `Created Pixel Forge NPC close-model pool ${poolKey}: ${pool.length} models`);
  }

  private createActionMap(mixer: THREE.AnimationMixer, animations: THREE.AnimationClip[]): Map<PixelForgeNpcClipId, THREE.AnimationAction> {
    const actions = new Map<PixelForgeNpcClipId, THREE.AnimationAction>();
    for (const clip of animations) {
      if (this.isPixelForgeNpcClip(clip.name)) {
        const action = mixer.clipAction(sanitizePixelForgeNpcAnimationClip(clip));
        if (isOneShotDeathClip(clip.name)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
        }
        actions.set(clip.name, action);
      }
    }
    mixer.stopAllAction();
    return actions;
  }

  private isPixelForgeNpcClip(value: string): value is PixelForgeNpcClipId {
    return value === 'idle'
      || value === 'patrol_walk'
      || value === 'traverse_run'
      || value === 'advance_fire'
      || value === 'walk_fight_forward'
      || value === 'death_fall_back'
      || value === 'dead_pose';
  }

  private collectBones(root: THREE.Object3D): Map<string, THREE.Object3D> {
    const bones = new Map<string, THREE.Object3D>();
    root.traverse((child) => {
      if (child instanceof THREE.Bone) {
        bones.set(child.name, child);
      }
    });
    return bones;
  }

  private applyCloseModelMaterialTuning(
    root: THREE.Object3D,
    factionConfig: PixelForgeNpcFactionRuntimeConfig,
  ): void {
    const tuning = PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING[factionConfig.packageFaction];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => this.cloneTunedCloseMaterial(material, tuning));
      } else {
        child.material = this.cloneTunedCloseMaterial(child.material, tuning);
      }
    });
  }

  private cloneTunedCloseMaterial(
    material: THREE.Material,
    tuning: Record<string, number> | undefined,
  ): THREE.Material {
    const cloned = material.clone();
    if (cloned instanceof THREE.MeshStandardMaterial) {
      const materialNameParts = cloned.name.split('_');
      const materialToken = materialNameParts[materialNameParts.length - 1];
      const tunedColor = materialToken && tuning ? tuning[materialToken] : undefined;
      if (tunedColor !== undefined) {
        cloned.color.setHex(tunedColor);
      }
      const isUniformSurface =
        materialToken === 'uniform' ||
        materialToken === 'trousers' ||
        materialToken === 'headgear' ||
        materialToken === 'accent';
      if (isUniformSurface) {
        cloned.color.offsetHSL(0, 0.08, 0.1);
      }
      cloned.emissive.copy(cloned.color).multiplyScalar(isUniformSurface ? 0.16 : 0.06);
      cloned.emissiveIntensity = isUniformSurface ? 0.28 : 0.1;
      cloned.roughness = Math.max(cloned.roughness, 0.9);
      cloned.metalness = 0;
      cloned.needsUpdate = true;
    }
    return cloned;
  }

  private collectCloseModelMaterialStates(root: THREE.Object3D): CloseModelMaterialState[] {
    const states: CloseModelMaterialState[] = [];
    const seen = new Set<THREE.Material>();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (seen.has(material)) continue;
        seen.add(material);
        states.push({
          material,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        });
      }
    });
    return states;
  }

  private setCloseModelOpacity(instance: CloseModelInstance, opacity: number): void {
    const clamped = clamp01(opacity);
    for (const state of instance.materialStates) {
      const material = state.material;
      material.opacity = state.opacity * clamped;
      material.transparent = state.transparent || clamped < 0.999;
      material.depthWrite = clamped >= 0.999 ? state.depthWrite : false;
      material.needsUpdate = true;
    }
  }

  private normalizeWeaponRoot(root: THREE.Group, weapon: PixelForgeNpcWeaponRuntimeConfig): void {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const longAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = weapon.lengthMeters / longAxis;
    root.scale.setScalar(scale);

    const gripObject = this.findNamed(root, weapon.gripNames);
    const supportObject = this.findNamed(root, weapon.supportNames);
    const muzzleObject = this.findNamed(root, weapon.muzzleNames);
    const stockObject = this.findNamed(root, weapon.stockNames);
    const grip = this.centerOfObject(root, gripObject) ?? new THREE.Vector3();
    const support = this.centerOfObject(root, supportObject);
    const muzzle = this.centerOfObject(root, muzzleObject);
    const stock = this.centerOfObject(root, stockObject);
    const muzzleDirection = muzzle
      ? muzzle.clone().sub(grip)
      : new THREE.Vector3(1, 0, 0);
    const alignment = muzzleDirection.lengthSq() > 0.0001
      ? new THREE.Quaternion().setFromUnitVectors(muzzleDirection.normalize(), new THREE.Vector3(1, 0, 0))
      : new THREE.Quaternion();
    root.quaternion.copy(alignment);

    const transformLocal = (point: THREE.Vector3): THREE.Vector3 =>
      point.clone().multiplyScalar(scale).applyQuaternion(root.quaternion);
    const transformedGrip = transformLocal(grip);
    root.position.copy(transformedGrip.multiplyScalar(-1));
    root.userData.stockOffset = stock
      ? transformLocal(stock).sub(transformLocal(grip))
      : new THREE.Vector3(-0.28, 0.04, 0);
    root.userData.supportOffset = support
      ? transformLocal(support).sub(transformLocal(grip))
      : new THREE.Vector3(0.28, 0.02, 0);
    root.updateMatrixWorld(true);
  }

  private findNamed(root: THREE.Object3D, names: string[]): THREE.Object3D | undefined {
    for (const name of names) {
      let found: THREE.Object3D | undefined;
      root.traverse((child) => {
        if (!found && child.name === name) found = child;
      });
      if (found) return found;
    }
    return undefined;
  }

  private centerOfObject(root: THREE.Object3D, object: THREE.Object3D | undefined): THREE.Vector3 | undefined {
    if (!object) return undefined;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return undefined;
    return root.worldToLocal(box.getCenter(new THREE.Vector3()));
  }

  private measureCloseModelMetrics(root: THREE.Object3D): CloseModelMetrics {
    root.updateMatrixWorld(true);
    this.scratchBounds.setFromObject(root);
    this.scratchBounds.getSize(this.scratchBoundsSize);
    const height = this.scratchBoundsSize.y;
    if (!Number.isFinite(height) || height <= 0.01 || !Number.isFinite(this.scratchBounds.min.y)) {
      return {
        boundsMinY: 0,
        visualScale: NPC_CLOSE_MODEL_TARGET_HEIGHT / 1.8,
      };
    }

    return {
      boundsMinY: this.scratchBounds.min.y,
      visualScale: NPC_CLOSE_MODEL_TARGET_HEIGHT / height,
    };
  }

  updateWalkFrame(deltaTime: number): void {
    this.elapsedTime += deltaTime;
    this.walkFrameTimer += deltaTime;
    this.activeCloseModels.forEach((instance) => instance.mixer.update(deltaTime));
    this.factionMaterials.forEach((material) => {
      if (material.uniforms.time) {
        material.uniforms.time.value = this.elapsedTime;
      }
    });
  }

  private updateCloseModels(
    combatants: Map<string, Combatant>,
    playerPosition: THREE.Vector3,
  ): { closeModelIds: Set<string>; suppressedImpostorIds: Set<string> } {
    const candidates: Array<{ combatant: Combatant; distanceSq: number; poolKey: PixelForgeNpcPoolKey }> = [];
    combatants.forEach((combatant) => {
      if (combatant.state === CombatantState.DEAD && !combatant.isDying) return;
      const distanceSq = combatant.position.distanceToSquared(playerPosition);
      if (distanceSq > PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_SQ) return;
      const poolKey = getPixelForgeNpcPoolKey(combatant, this.playerSquadId);
      candidates.push({ combatant, distanceSq, poolKey });
    });
    candidates.sort((a, b) => a.distanceSq - b.distanceSq);

    const selected = new Set<string>();
    const suppressedImpostorIds = new Set<string>();
    for (const candidate of candidates) {
      if (selected.size >= PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP) {
        suppressedImpostorIds.add(candidate.combatant.id);
        this.reportCloseModelOverflow(candidate.poolKey, candidate.distanceSq, 'total-cap');
        continue;
      }
      const instance = this.ensureCloseModel(candidate.combatant.id, candidate.poolKey);
      if (!instance) {
        if (!this.closeModelPools.has(candidate.poolKey)) {
          this.queueCloseModelPoolLoad(candidate.poolKey);
          continue;
        }
        suppressedImpostorIds.add(candidate.combatant.id);
        this.reportCloseModelOverflow(candidate.poolKey, candidate.distanceSq, 'pool-empty');
        continue;
      }
      selected.add(candidate.combatant.id);
      this.updateCloseModelInstance(instance, candidate.combatant, candidate.poolKey);
    }

    this.activeCloseModels.forEach((instance, combatantId) => {
      if (!selected.has(combatantId)) {
        this.releaseCloseModel(combatantId, instance);
      }
    });

    return { closeModelIds: selected, suppressedImpostorIds };
  }

  private ensureCloseModel(combatantId: string, poolKey: PixelForgeNpcPoolKey): CloseModelInstance | undefined {
    const active = this.activeCloseModels.get(combatantId);
    if (active) {
      if (active.poolKey === poolKey) return active;
      this.releaseCloseModel(combatantId, active);
    }

    const pool = this.closeModelPools.get(poolKey);
    const instance = pool?.pop();
    if (!instance) return undefined;

    instance.combatantId = combatantId;
    instance.root.visible = true;
    this.setCloseModelOpacity(instance, 1);
    instance.actions.forEach((action) => {
      action.paused = false;
      action.timeScale = 1;
    });
    this.activeCloseModels.set(combatantId, instance);
    return instance;
  }

  private releaseCloseModel(combatantId: string, instance: CloseModelInstance): void {
    this.activeCloseModels.delete(combatantId);
    instance.root.visible = false;
    instance.mixer.stopAllAction();
    this.setCloseModelOpacity(instance, 1);
    instance.actions.forEach((action) => {
      action.paused = false;
      action.time = 0;
      action.timeScale = 1;
      action.enabled = false;
    });
    instance.activeClip = undefined;
    instance.combatantId = undefined;
    const pool = this.closeModelPools.get(instance.poolKey);
    if (pool) pool.push(instance);
  }

  private updateCloseModelInstance(instance: CloseModelInstance, combatant: Combatant, poolKey: PixelForgeNpcPoolKey): void {
    const sourcePosition = combatant.renderedPosition ?? combatant.position;
    const terrainY = sourcePosition.y - NPC_Y_OFFSET;
    const scaledMinY = instance.boundsMinY * instance.visualScale * combatant.scale.y;
    combatant.billboardIndex = -1;
    instance.root.position.set(sourcePosition.x, terrainY - scaledMinY, sourcePosition.z);
    instance.root.rotation.set(0, Math.PI / 2 - combatant.visualRotation, 0);
    instance.root.scale.set(
      combatant.scale.x * instance.visualScale,
      combatant.scale.y * instance.visualScale,
      combatant.scale.z * instance.visualScale,
    );
    const deathOpacity = getCombatantDeathOpacity(combatant);
    this.setCloseModelOpacity(instance, deathOpacity);
    instance.root.visible = deathOpacity > CLOSE_MODEL_FADE_EPSILON;
    instance.root.updateMatrixWorld(true);

    const clipId = getPixelForgeNpcClipForCombatant(combatant);
    if (instance.activeClip !== clipId) {
      const next = instance.actions.get(clipId) ?? instance.actions.get('idle');
      if (next) {
        instance.mixer.stopAllAction();
        next.reset();
        next.paused = false;
        next.timeScale = 1;
        next.enabled = true;
        next.play();
        instance.activeClip = clipId;
      } else {
        Logger.warn('combat-renderer', `Missing Pixel Forge NPC clip ${clipId} for ${poolKey}`);
      }
    }
    this.syncCloseModelDeathAction(instance, combatant, clipId);
    this.updateWeaponSocket(instance);
  }

  private syncCloseModelDeathAction(
    instance: CloseModelInstance,
    combatant: Combatant,
    clipId: PixelForgeNpcClipId,
  ): void {
    const action = instance.actions.get('death_fall_back');
    if (!action) return;
    if (!combatant.isDying || !isOneShotDeathClip(clipId)) {
      action.paused = false;
      return;
    }

    const clipDuration = Math.max(0.001, action.getClip().duration);
    const clipProgress = getCombatantDeathClipProgress(combatant);
    action.enabled = true;
    action.time = clipDuration * clipProgress;
    action.paused = clipProgress >= DEATH_CLIP_HOLD_PROGRESS;
  }

  private reportCloseModelOverflow(poolKey: PixelForgeNpcPoolKey, distanceSq: number, reason: string): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const key = `${poolKey}:${reason}`;
    const last = this.closeModelOverflowLastLog.get(key);
    if (last !== undefined && now - last < 1000) return;
    this.closeModelOverflowLastLog.set(key, now);
    Logger.warn(
      'combat-renderer',
      `Pixel Forge close NPC ${reason} for ${poolKey} at ${Math.sqrt(distanceSq).toFixed(1)}m; suppressing near impostor fallback`,
    );
  }

  private updateWeaponSocket(instance: CloseModelInstance): void {
    if (!instance.weaponPivot || !instance.weaponRoot) {
      instance.hasWeapon = false;
      return;
    }

    const right = this.getBoneWorldPosition(instance, instance.factionConfig.rightHandSocket);
    const leftShoulder = this.getBoneWorldPosition(instance, 'LeftArm') ?? this.getBoneWorldPosition(instance, 'LeftShoulder');
    const rightShoulder = this.getBoneWorldPosition(instance, 'RightArm') ?? this.getBoneWorldPosition(instance, 'RightShoulder');
    if (!right) {
      instance.hasWeapon = false;
      return;
    }

    const up = new THREE.Vector3(0, 1, 0);
    const travelForward = this.getRootForward(instance.root);
    travelForward.y = 0;
    if (travelForward.lengthSq() < 0.0001) travelForward.set(0, 0, 1);
    travelForward.normalize();

    const torsoForward = this.getBodyForward(instance);
    torsoForward.y = 0;
    if (torsoForward.lengthSq() < 0.0001) torsoForward.set(0, 0, 1);
    torsoForward.normalize();

    const forward = instance.weaponConfig.socketMode === 'shouldered-forward' ? travelForward : torsoForward;
    let actorRight = new THREE.Vector3().crossVectors(forward, up).normalize();
    if (leftShoulder && rightShoulder) {
      const shoulderSpan = rightShoulder.clone().sub(leftShoulder);
      shoulderSpan.y = 0;
      if (shoulderSpan.lengthSq() > 0.0001) {
        shoulderSpan.normalize();
        if (shoulderSpan.dot(actorRight) < 0) shoulderSpan.multiplyScalar(-1);
        actorRight = shoulderSpan;
      }
    }
    const cleanUp = new THREE.Vector3().crossVectors(actorRight, forward).normalize();
    const worldMatrix = new THREE.Matrix4().makeBasis(forward, cleanUp, actorRight);
    const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(worldMatrix);
    if (instance.weaponConfig.pitchTrimDeg) {
      worldQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        THREE.MathUtils.degToRad(instance.weaponConfig.pitchTrimDeg),
      ));
    }

    const parent = instance.weaponPivot.parent ?? instance.root;
    parent.updateMatrixWorld(true);
    const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
    instance.weaponPivot.quaternion.copy(parentQuaternion.invert().multiply(worldQuaternion));

    const shoulder = rightShoulder ?? right;
    const shoulderCenter = leftShoulder && rightShoulder
      ? leftShoulder.clone().lerp(rightShoulder, 0.5)
      : shoulder.clone().sub(actorRight.clone().multiplyScalar(0.12));
    const shoulderPocket = shoulder.clone()
      .lerp(shoulderCenter, 0.42)
      .add(cleanUp.clone().multiplyScalar(-0.035));
    const stockOffset = this.getWeaponOffset(instance.weaponRoot, 'stockOffset', new THREE.Vector3(-0.28, 0.04, 0));
    const stockWorldOffset = stockOffset.applyQuaternion(worldQuaternion);
    const stockAnchoredGrip = shoulderPocket.clone()
      .add(forward.clone().multiplyScalar(instance.weaponConfig.forwardHold + instance.weaponConfig.gripOffset))
      .sub(stockWorldOffset);
    const desiredWorldPosition = stockAnchoredGrip.add(actorRight.clone().multiplyScalar(0.006));
    instance.weaponPivot.position.copy(parent.worldToLocal(desiredWorldPosition.clone()));
    instance.weaponPivot.updateMatrixWorld(true);

    const supportOffset = this.getWeaponOffset(instance.weaponRoot, 'supportOffset', new THREE.Vector3(0.28, 0.02, 0));
    const supportTarget = desiredWorldPosition.clone().add(supportOffset.applyQuaternion(worldQuaternion));
    const axes = { forward, cleanUp, actorRight };
    this.solveArmToTarget(instance, 'Right', desiredWorldPosition, axes);
    this.solveArmToTarget(instance, 'Left', supportTarget, axes);
    instance.root.updateMatrixWorld(true);
    instance.weaponPivot.updateMatrixWorld(true);
    instance.hasWeapon = true;
  }

  private getWeaponOffset(root: THREE.Object3D, key: 'stockOffset' | 'supportOffset', fallback: THREE.Vector3): THREE.Vector3 {
    const value = root.userData[key];
    return value instanceof THREE.Vector3 ? value.clone() : fallback;
  }

  private getBoneWorldPosition(instance: CloseModelInstance, name: string): THREE.Vector3 | undefined {
    const bone = instance.bones.get(name);
    return bone ? bone.getWorldPosition(new THREE.Vector3()) : undefined;
  }

  private getRootForward(root: THREE.Object3D): THREE.Vector3 {
    const quaternion = root.getWorldQuaternion(new THREE.Quaternion());
    return new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  }

  private getBodyForward(instance: CloseModelInstance): THREE.Vector3 {
    const body = instance.bones.get('Hips') ?? instance.bones.get('Spine') ?? instance.root;
    const quaternion = body.getWorldQuaternion(new THREE.Quaternion());
    return new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  }

  private solveArmToTarget(
    instance: CloseModelInstance,
    side: 'Right' | 'Left',
    target: THREE.Vector3,
    axes: { forward: THREE.Vector3; cleanUp: THREE.Vector3; actorRight: THREE.Vector3 },
  ): void {
    const upper = instance.bones.get(`${side}Arm`);
    const fore = instance.bones.get(`${side}ForeArm`);
    const hand = instance.bones.get(`${side}Hand`);
    if (!upper || !fore || !hand) return;

    instance.root.updateMatrixWorld(true);
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbowNow = fore.getWorldPosition(new THREE.Vector3());
    const handNow = hand.getWorldPosition(new THREE.Vector3());
    const upperLength = Math.max(0.001, shoulder.distanceTo(elbowNow));
    const foreLength = Math.max(0.001, elbowNow.distanceTo(handNow));
    const reach = Math.max(0.08, upperLength + foreLength - 0.025);
    const targetVector = target.clone().sub(shoulder);
    const distance = targetVector.length();
    if (distance < 0.001) return;

    const direction = targetVector.clone().normalize();
    const clampedTarget = distance > reach
      ? shoulder.clone().add(direction.clone().multiplyScalar(reach))
      : target.clone();
    const clampedDistance = Math.min(distance, reach);
    const sideSign = side === 'Right' ? 1 : -1;
    const pole = shoulder.clone()
      .add(axes.cleanUp.clone().multiplyScalar(-0.24))
      .add(axes.actorRight.clone().multiplyScalar(0.22 * sideSign))
      .add(axes.forward.clone().multiplyScalar(0.04));
    let planeNormal = direction.clone().cross(pole.clone().sub(shoulder)).normalize();
    if (planeNormal.lengthSq() < 0.0001) {
      planeNormal = axes.actorRight.clone().multiplyScalar(sideSign);
    }
    const bendDirection = planeNormal.clone().cross(direction).normalize();
    const along = (upperLength * upperLength - foreLength * foreLength + clampedDistance * clampedDistance)
      / (2 * clampedDistance);
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    const elbow = shoulder.clone()
      .add(direction.clone().multiplyScalar(along))
      .add(bendDirection.multiplyScalar(height));

    this.setBoneDirectionWorld(upper, elbow.clone().sub(shoulder));
    instance.root.updateMatrixWorld(true);
    const elbowWorld = fore.getWorldPosition(new THREE.Vector3());
    this.setBoneDirectionWorld(fore, clampedTarget.clone().sub(elbowWorld));
    instance.root.updateMatrixWorld(true);
  }

  private setBoneDirectionWorld(bone: THREE.Object3D, directionWorld: THREE.Vector3): void {
    if (!bone.parent) return;
    const direction = directionWorld.clone().normalize();
    if (direction.lengthSq() < 0.0001) return;
    const parentInv = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const targetLocal = direction.applyQuaternion(parentInv).normalize();
    bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetLocal);
    bone.updateMatrixWorld(true);
  }

  private getImpostorViewColumn(combatant: Combatant): number {
    const sourcePosition = combatant.renderedPosition ?? combatant.position;
    const toCameraX = this.camera.position.x - sourcePosition.x;
    const toCameraZ = this.camera.position.z - sourcePosition.z;
    const worldAngle = Math.atan2(toCameraZ, toCameraX);
    const localAngle =
      ((worldAngle - combatant.visualRotation + NPC_IMPOSTOR_VIEW_FORWARD_OFFSET) % TWO_PI + TWO_PI) % TWO_PI;
    return Math.floor((localAngle / TWO_PI) * NPC_IMPOSTOR_VIEW_COLUMNS) % NPC_IMPOSTOR_VIEW_COLUMNS;
  }

  updateBillboards(combatants: Map<string, Combatant>, playerPosition: THREE.Vector3): void {
    const { closeModelIds, suppressedImpostorIds } = this.updateCloseModels(combatants, playerPosition);
    this.factionMeshes.forEach(mesh => mesh.count = 0);
    this.factionAuraMeshes.forEach(mesh => mesh.count = 0);
    this.factionGroundMarkers.forEach(mesh => mesh.count = 0);
    const RENDER_DISTANCE_SQ = 400 * 400;
    this.renderWriteCounts.clear();
    this.renderCombatStates.clear();
    this.factionMeshes.forEach((_mesh, key) => {
      this.renderWriteCounts.set(key, 0);
      this.renderCombatStates.set(key, 0);
    });

    const matrix = this.scratchMatrix;
    this.camera.getWorldDirection(this.scratchCameraDir);
    const cameraAngle = Math.atan2(this.scratchCameraDir.x, this.scratchCameraDir.z);

    combatants.forEach(combatant => {
      if (closeModelIds.has(combatant.id)) return;
      if (suppressedImpostorIds.has(combatant.id)) {
        combatant.billboardIndex = -1;
        return;
      }
      if (combatant.state === CombatantState.DEAD && !combatant.isDying) return;
      if (combatant.position.distanceToSquared(playerPosition) > RENDER_DISTANCE_SQ) return;

      const poolKey = getPixelForgeNpcPoolKey(combatant, this.playerSquadId);
      const isPlayerSquad = poolKey === 'SQUAD';
      if (isPlayerSquad && !this.playerSquadDetected) this.playerSquadDetected = true;
      const factionPrefix = poolKey;
      const clipId = getPixelForgeNpcClipForCombatant(combatant);
      const key = getPixelForgeNpcBucketKey(factionPrefix, clipId);

      const mesh = this.ensureImpostorBucket(factionPrefix, clipId);
      if (!mesh) return;
      const capacity = (mesh.instanceMatrix as any).count ?? mesh.count;
      const index = this.renderWriteCounts.get(key) ?? 0;
      if (index >= capacity) {
        // Surface the overflow instead of silently dropping. Rate-limited per-bucket-per-second.
        reportBucketOverflow(key);
        return;
      }

      // Billboard rotation: face camera
      matrix.makeRotationY(cameraAngle);

      const scaleX = Math.abs(combatant.scale.x);

      // Position with Y bob for walking NPCs.
      // Prefer interpolated rendered position when available so dt-amortized
      // logical jumps (low-LOD crowds) do not visually teleport. Falls back
      // to logical position for any combatant not yet touched by the
      // CombatantRenderInterpolator (e.g. freshly spawned this frame).
      const sourcePosition = combatant.renderedPosition ?? combatant.position;
      this.scratchPosition.copy(sourcePosition);
      this.scratchPosition.y += NPC_SPRITE_RENDER_Y_OFFSET;
      let finalPosition = this.scratchPosition;
      let finalScaleX = scaleX;
      let finalScaleY = combatant.scale.y;
      let finalScaleZ = combatant.scale.z;
      const deathOpacity = getCombatantDeathOpacity(combatant);
      const impostorAnimationProgress =
        clipId === 'death_fall_back' ? getCombatantDeathClipProgress(combatant) : 0;

      if ((clipId === 'patrol_walk' || clipId === 'traverse_run') && !combatant.isDying) {
        const bobPhase = this.stableHash01(combatant.id) * Math.PI * 2;
        const bobY = Math.sin(this.elapsedTime * BOB_SPEED + bobPhase) * BOB_AMPLITUDE;
        finalPosition.y += bobY;
      }

      // Death animation
      if (combatant.isDying && combatant.deathProgress !== undefined) {
          const FALL_PHASE = DEATH_FALL_PHASE;
          const GROUND_PHASE = DEATH_GROUND_PHASE;
          const FADEOUT_PHASE = DEATH_FADEOUT_PHASE;

          const progress = getCombatantDeathProgress(combatant);
          const animType = combatant.deathAnimationType || 'fallback';

          if (animType === 'shatter') {
            const seed = this.stableHash01(combatant.id);
            const spinBias = 0.8 + seed * 1.2;
            const spreadBias = 1.0 + seed * 0.9;
            const deathDir = combatant.deathDirection ?? this.scratchTiltAxis.set(0, 0, -1);
            this.scratchPerpDir.set(-deathDir.z, 0, deathDir.x).normalize();

            if (progress < FALL_PHASE) {
              const t = progress / FALL_PHASE;
              const pop = Math.sin(t * Math.PI);
              finalPosition.x += deathDir.x * pop * (0.9 * spreadBias);
              finalPosition.z += deathDir.z * pop * (0.9 * spreadBias);
              finalPosition.x += this.scratchPerpDir.x * pop * ((seed - 0.5) * 1.4);
              finalPosition.z += this.scratchPerpDir.z * pop * ((seed - 0.5) * 1.4);
              finalPosition.y += 0.25 + pop * 0.45;
              const spinY = (0.8 + t * 2.4) * Math.PI * spinBias;
              const spinZ = (0.2 + t * 1.4) * Math.PI * (0.6 + seed);
              this.scratchSpinMatrix.makeRotationY(spinY);
              matrix.multiply(this.scratchSpinMatrix);
              this.scratchSpinMatrix.makeRotationZ(spinZ);
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleX *= 1.05 + pop * (0.45 + seed * 0.2);
              finalScaleY *= Math.max(0.3, 1.0 - pop * 0.65);
              finalScaleZ *= 1.02 + pop * 0.25;
            } else if (progress < FALL_PHASE + GROUND_PHASE) {
              const t = (progress - FALL_PHASE) / GROUND_PHASE;
              finalPosition.x += deathDir.x * (1.9 * spreadBias);
              finalPosition.z += deathDir.z * (1.9 * spreadBias);
              finalPosition.x += this.scratchPerpDir.x * (seed - 0.5) * 1.8;
              finalPosition.z += this.scratchPerpDir.z * (seed - 0.5) * 1.8;
              finalPosition.y -= 0.8 + t * 1.0;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * (0.55 + seed * 0.35));
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleX *= 1.25 + seed * 0.2;
              finalScaleY *= 0.18;
              finalScaleZ *= 1.18 + (1 - seed) * 0.15;
            } else {
              const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;
              finalPosition.x += deathDir.x * (1.9 * spreadBias);
              finalPosition.z += deathDir.z * (1.9 * spreadBias);
              finalPosition.x += this.scratchPerpDir.x * (seed - 0.5) * 1.8;
              finalPosition.z += this.scratchPerpDir.z * (seed - 0.5) * 1.8;
              finalPosition.y -= 1.8 + fadeProgress * 2.0;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * (0.55 + seed * 0.35));
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleX *= 1.25 + seed * 0.2;
              finalScaleY *= 0.18;
              finalScaleZ *= 1.18 + (1 - seed) * 0.15;
            }
          } else if (animType === 'spinfall') {
            if (progress < FALL_PHASE) {
              const fallProgress = progress / FALL_PHASE;
              const easeOut = 1 - Math.pow(1 - fallProgress, 2);
              if (combatant.deathDirection) {
                const fallDistance = 2.5;
                finalPosition.x += combatant.deathDirection.x * easeOut * fallDistance;
                finalPosition.z += combatant.deathDirection.z * easeOut * fallDistance;
              }
              const dropHeight = 4.0;
              finalPosition.y += dropHeight * (1 - easeOut) - dropHeight;
              const spinAngle = easeOut * Math.PI * 2;
              this.scratchSpinMatrix.makeRotationZ(spinAngle);
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleY *= 1 - (easeOut * 0.3);
            } else if (progress < FALL_PHASE + GROUND_PHASE) {
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 2.5;
                finalPosition.z += combatant.deathDirection.z * 2.5;
              }
              finalPosition.y -= 4.0;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * 2);
              matrix.multiply(this.scratchSpinMatrix);
              const groundProgress = (progress - FALL_PHASE) / GROUND_PHASE;
              const settle = Math.max(0, (1 - groundProgress * 4) * 0.1);
              finalPosition.y += settle;
              finalScaleY *= 0.7;
            } else {
              const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 2.5;
                finalPosition.z += combatant.deathDirection.z * 2.5;
              }
              finalPosition.y -= 4.0 + fadeProgress * 2.0;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * 2);
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleY *= 0.7;
            }
          } else if (animType === 'crumple') {
            if (progress < FALL_PHASE) {
              const fallProgress = progress / FALL_PHASE;
              const easeOut = 1 - Math.pow(1 - fallProgress, 2);
              if (combatant.deathDirection) {
                const fallDistance = 0.5;
                finalPosition.x += combatant.deathDirection.x * easeOut * fallDistance;
                finalPosition.z += combatant.deathDirection.z * easeOut * fallDistance;
              }
              finalScaleY *= 1 - (easeOut * 0.8);
              finalPosition.y -= easeOut * 2.5;
            } else if (progress < FALL_PHASE + GROUND_PHASE) {
              const groundProgress = (progress - FALL_PHASE) / GROUND_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 0.5;
                finalPosition.z += combatant.deathDirection.z * 0.5;
              }
              finalPosition.y -= 2.5;
              finalScaleY *= 0.2;
              const settle = Math.max(0, (1 - groundProgress * 4) * 0.05);
              finalPosition.y += settle;
            } else {
              const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 0.5;
                finalPosition.z += combatant.deathDirection.z * 0.5;
              }
              finalPosition.y -= 2.5 + fadeProgress * 2.0;
              finalScaleY *= 0.2;
            }
          } else {
            if (progress < FALL_PHASE) {
              const fallProgress = progress / FALL_PHASE;
              const easeOut = 1 - Math.pow(1 - fallProgress, 2);
              if (combatant.deathDirection) {
                const fallDistance = 1.5;
                finalPosition.x += combatant.deathDirection.x * easeOut * fallDistance;
                finalPosition.z += combatant.deathDirection.z * easeOut * fallDistance;
              }
              const dropHeight = 3.5;
              finalPosition.y += dropHeight * (1 - easeOut) - dropHeight;
              const rotationAngle = easeOut * Math.PI * 0.45;
              if (combatant.deathDirection) {
                this.scratchTiltAxis.set(-combatant.deathDirection.z, 0, combatant.deathDirection.x);
              } else {
                this.scratchTiltAxis.set(1, 0, 0);
              }
              this.scratchTiltMatrix.makeRotationAxis(this.scratchTiltAxis.normalize(), rotationAngle);
              matrix.multiply(this.scratchTiltMatrix);
              finalScaleY *= 1 - (easeOut * 0.2);
            } else if (progress < FALL_PHASE + GROUND_PHASE) {
              const groundProgress = (progress - FALL_PHASE) / GROUND_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 1.5;
                finalPosition.z += combatant.deathDirection.z * 1.5;
              }
              finalPosition.y -= 3.5;
              if (combatant.deathDirection) {
                this.scratchTiltAxis.set(-combatant.deathDirection.z, 0, combatant.deathDirection.x);
              } else {
                this.scratchTiltAxis.set(1, 0, 0);
              }
              this.scratchTiltMatrix.makeRotationAxis(this.scratchTiltAxis.normalize(), Math.PI * 0.45);
              matrix.multiply(this.scratchTiltMatrix);
              const settle = Math.max(0, (1 - groundProgress * 4) * 0.1);
              finalPosition.y += settle;
              finalScaleY *= 0.8;
            } else {
              const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 1.5;
                finalPosition.z += combatant.deathDirection.z * 1.5;
              }
              finalPosition.y -= 3.5 + fadeProgress * 2.0;
              if (combatant.deathDirection) {
                this.scratchTiltAxis.set(-combatant.deathDirection.z, 0, combatant.deathDirection.x);
              } else {
                this.scratchTiltAxis.set(1, 0, 0);
              }
              this.scratchTiltMatrix.makeRotationAxis(this.scratchTiltAxis.normalize(), Math.PI * 0.45);
              matrix.multiply(this.scratchTiltMatrix);
              finalScaleY *= 0.8;
            }
          }
      }

      matrix.setPosition(finalPosition);
      this.scratchScaleMatrix.makeScale(finalScaleX, finalScaleY, finalScaleZ);
      matrix.multiply(this.scratchScaleMatrix);
      mesh.setMatrixAt(index, matrix);
      setPixelForgeNpcImpostorAttributes(
        mesh,
        index,
        this.stableHash01(combatant.id),
        this.getImpostorViewColumn(combatant),
        impostorAnimationProgress,
        deathOpacity,
      );
      combatant.billboardIndex = index;

      const outlineMesh = this.factionAuraMeshes.get(key);
      if (outlineMesh) {
        this.scratchOutlineMatrix.copy(matrix);
        const outlineScale = 1.2 * Math.max(0.001, deathOpacity);
        this.scratchScaleMatrix.makeScale(outlineScale, outlineScale, outlineScale);
        this.scratchOutlineMatrix.multiply(this.scratchScaleMatrix);
        outlineMesh.setMatrixAt(index, this.scratchOutlineMatrix);
      }
      // Use the same interpolated source as the impostor so marker and actor
      // stay co-located when dt amortization smooths the visible position.
      const markerMesh = this.factionGroundMarkers.get(key);
      if (markerMesh) {
        this.scratchMarkerMatrix.makeRotationX(-Math.PI / 2);
        this.scratchMarkerMatrix.setPosition(sourcePosition.x, sourcePosition.y - NPC_Y_OFFSET + 0.08, sourcePosition.z);
        const markerScale = Math.max(0.001, deathOpacity);
        this.scratchScaleMatrix.makeScale(markerScale, markerScale, markerScale);
        this.scratchMarkerMatrix.multiply(this.scratchScaleMatrix);
        markerMesh.setMatrixAt(index, this.scratchMarkerMatrix);
      }

      this.renderWriteCounts.set(key, index + 1);
      const currentCombatState = this.renderCombatStates.get(key) ?? 0;
      let combatStateWeight = currentCombatState;
      if (combatant.state === CombatantState.ENGAGING || combatant.state === CombatantState.SUPPRESSING) {
        combatStateWeight = Math.max(combatStateWeight, 1.0);
      } else if (combatant.state === CombatantState.ALERT) {
        combatStateWeight = Math.max(combatStateWeight, 0.5);
      }
      this.renderCombatStates.set(key, combatStateWeight);
    });

    this.factionMeshes.forEach((mesh, key) => {
      const written = this.renderWriteCounts.get(key) ?? 0;
      const previousCount = mesh.count;
      mesh.count = written;
      if (written > 0 || previousCount !== written) {
        mesh.instanceMatrix.needsUpdate = true;
      }
      const outlineMesh = this.factionAuraMeshes.get(key);
      if (outlineMesh) {
        const previousOutlineCount = outlineMesh.count;
        outlineMesh.count = written;
        if (written > 0 || previousOutlineCount !== written) {
          outlineMesh.instanceMatrix.needsUpdate = true;
        }
      }
      const markerMesh = this.factionGroundMarkers.get(key);
      if (markerMesh) {
        const previousMarkerCount = markerMesh.count;
        markerMesh.count = written;
        if (written > 0 || previousMarkerCount !== written) {
          markerMesh.instanceMatrix.needsUpdate = true;
        }
      }
      const outlineMaterial = this.factionMaterials.get(key);
      if (outlineMaterial && outlineMaterial instanceof THREE.ShaderMaterial) {
        outlineMaterial.uniforms.combatState.value = this.renderCombatStates.get(key) ?? 0;
      }
    });

    this.updateHitboxDebugOverlay(combatants, playerPosition);
  }

  private updateHitboxDebugOverlay(combatants: Map<string, Combatant>, playerPosition: THREE.Vector3): void {
    if (!this.hitboxDebugEnabled) return;

    this.clearHitboxDebugOverlay();
    const candidates = Array.from(combatants.values())
      .filter(combatant => combatant.state !== CombatantState.DEAD || combatant.isDying)
      .map(combatant => ({
        combatant,
        distanceSq: (combatant.renderedPosition ?? combatant.position).distanceToSquared(playerPosition),
      }))
      .sort((a, b) => a.distanceSq - b.distanceSq)
      .slice(0, HITBOX_DEBUG_MAX_ACTORS);

    for (const { combatant } of candidates) {
      const proxies = writeCombatantHitProxies(this.hitboxDebugProxies, combatant, 'visual');
      for (const proxy of proxies) {
        this.addHitboxDebugProxy(proxy);
      }
    }
  }

  private addHitboxDebugProxy(proxy: CombatantHitProxy): void {
    if (proxy.kind === 'sphere') {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(proxy.radius, 10, 8),
        proxy.isHead ? this.hitboxHeadMaterial : this.hitboxBodyMaterial,
      );
      mesh.position.copy(proxy.center);
      mesh.renderOrder = 999;
      this.hitboxDebugGroup.add(mesh);
      return;
    }

    const length = proxy.start.distanceTo(proxy.end);
    if (length <= 0.0001) return;
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(proxy.radius, length, 4, 8),
      this.hitboxBodyMaterial,
    );
    mesh.position.copy(proxy.start).add(proxy.end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      this.hitboxDebugUp,
      this.scratchPerpDir.subVectors(proxy.end, proxy.start).normalize(),
    );
    mesh.renderOrder = 999;
    this.hitboxDebugGroup.add(mesh);
  }

  private clearHitboxDebugOverlay(): void {
    for (const child of this.hitboxDebugGroup.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }
    this.hitboxDebugGroup.clear();
  }

  // Update shader time and global uniforms
  updateShaderUniforms(_deltaTime: number): void {
    updateShaderUniforms(this.factionMaterials, this.camera, this.scene);
  }

  // Handle damage flash for specific combatant
  setDamageFlash(combatantId: string, intensity: number): void {
    setDamageFlash(this.combatantStates, combatantId, intensity);
  }

  // Apply a preset configuration
  applyPreset(preset: ShaderPreset): void {
    this.shaderSettings.applyPreset(preset);
    Logger.info('combat-renderer', ` Applied NPC shader preset: ${preset}`);
  }

  // Get current shader settings
  getShaderSettings(): NPCShaderSettings {
    return this.shaderSettings.getSettings();
  }

  // Toggle specific effects
  toggleCelShading(): void {
    this.shaderSettings.toggleCelShading();
  }

  toggleRimLighting(): void {
    this.shaderSettings.toggleRimLighting();
  }

  toggleAura(): void {
    this.shaderSettings.toggleAura();
  }

  setShaderSettings(settings: Partial<ShaderUniformSettings>): void {
    this.shaderSettings.setSettings(settings);
  }

  updateCombatantTexture(combatant: Combatant): void {
    const poolKey = getPixelForgeNpcPoolKey(combatant, this.playerSquadId);
    this.ensureImpostorBucket(poolKey, getPixelForgeNpcClipForCombatant(combatant));
    updateCombatantTexture(this.soldierTextures, combatant);
  }


  dispose(): void {
    this.disposed = true;
    this.clearHitboxDebugOverlay();
    this.hitboxHeadMaterial.dispose();
    this.hitboxBodyMaterial.dispose();
    this.scene.remove(this.hitboxDebugGroup);
    this.activeCloseModels.forEach((instance) => {
      instance.mixer.stopAllAction();
      modelLoader.disposeInstance(instance.root);
    });
    this.activeCloseModels.clear();
    this.closeModelPools.forEach((pool) => {
      for (const instance of pool) {
        instance.mixer.stopAllAction();
        modelLoader.disposeInstance(instance.root);
      }
    });
    this.closeModelPools.clear();
    this.closeModelPoolLoads.clear();
    disposeCombatantMeshes(this.scene, {
      factionMeshes: this.factionMeshes,
      factionAuraMeshes: this.factionAuraMeshes,
      factionGroundMarkers: this.factionGroundMarkers,
      soldierTextures: this.soldierTextures,
      factionMaterials: this.factionMaterials,
      walkFrameTextures: this.walkFrameTextures
    });
    this.combatantStates.clear();
  }
}
