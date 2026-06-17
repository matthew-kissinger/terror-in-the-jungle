// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  markPixelForgeNpcImpostorAttributesDirty,
  reportBucketOverflow,
  setPixelForgeNpcImpostorAttributes,
  updateCombatantTexture,
  type WalkFrameMap,
} from './CombatantMeshFactory';
import { CombatantShaderSettingsManager, setDamageFlash, updateShaderUniforms, type CombatantUniformMaterial, type NPCShaderSettings, type ShaderPreset, type ShaderUniformSettings } from './CombatantShaders';
import { Logger } from '../../utils/Logger';
import { GameEventBus } from '../../core/GameEventBus';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';
import { isDiagEnabled, isPerfDiagnosticsEnabled } from '../../core/PerfDiagnostics';
import { modelLoader } from '../assets/ModelLoader';
import {
  createCombatantHitProxyScratch,
  writeCombatantHitProxies,
  type CombatantHitProxy,
} from './CombatantBodyMetrics';
import { PIXEL_FORGE_NPC_CLIPS, type PixelForgeNpcClipId } from '../../config/pixelForgeAssets';
import {
  getPixelForgeNpcCloseModelDistanceMeters,
  getPixelForgeNpcCloseModelDistanceSq,
  getPixelForgeNpcPoolKey,
  getPixelForgeNpcRuntimeFaction,
  PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION,
  PIXEL_FORGE_NPC_CLOSE_MODEL_LAZY_LOAD_FLAG,
  PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOP_UP_BATCH,
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
  PIXEL_FORGE_NPC_RUNTIME_FACTIONS,
  PixelForgeNpcDistanceConfig,
  sanitizePixelForgeNpcAnimationClip,
  type PixelForgeNpcFactionRuntimeConfig,
  type PixelForgeNpcPoolKey,
  type PixelForgeNpcWeaponRuntimeConfig,
} from './PixelForgeNpcRuntime';
import { getPixelForgeNpcViewTileForCamera } from './PixelForgeNpcView';
import {
  CLOSE_MODEL_PROMOTION_BUDGET_PER_FRAME,
  compareCloseModelCandidates,
  createCloseModelFallbackCounts,
  createEmptyBillboardUpdateProfile,
  createEmptyCloseModelRuntimeStats,
  selectPreferredCloseModelCandidates,
  type BillboardUpdateProfile,
  type CloseModelCandidate,
  type CloseModelFallbackReason,
  type CloseModelFallbackRecord,
  type CloseModelPrewarmOptions,
  type CloseModelPrewarmSummary,
  type CloseModelRuntimeStats,
  type CombatantMaterializationReason,
  type CombatantMaterializationRenderMode,
  type CombatantMaterializationRow,
} from './CombatantCloseModelPolicy';

/**
 * Per-clip impostor metadata used by velocity-keyed cadence. Mirrors the values
 * fed to the impostor shader uniforms but materialized as a plain map so the
 * renderer can compute frame indices without poking shader state.
 */
const IMPOSTOR_CLIP_METADATA: Map<PixelForgeNpcClipId, { framesPerClip: number; durationSec: number }> =
  new Map(PIXEL_FORGE_NPC_CLIPS.map((c) => [c.id, { framesPerClip: c.framesPerClip, durationSec: c.durationSec }]));

/** Looping clips that should cycle in proportion to horizontal travel. */
const VELOCITY_DRIVEN_CLIPS: ReadonlySet<PixelForgeNpcClipId> = new Set<PixelForgeNpcClipId>([
  'patrol_walk',
  'traverse_run',
  'advance_fire',
  'walk_fight_forward',
]);

/** Y bob amplitude in world units. */
const BOB_AMPLITUDE = 0.12;

/** Y bob speed multiplier. */
const BOB_SPEED = 3.0;
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
const OPTIMIZED_WEAPON_RESOURCE_KEY = '__tijOptimizedNpcWeaponResource';
const MAX_MATERIALIZATION_PROFILE_ROWS = 120;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function markInstancedMatrixDirty(mesh: THREE.InstancedMesh, activeCount: number): void {
  const attribute = mesh.instanceMatrix;
  if (typeof attribute.clearUpdateRanges === 'function') {
    attribute.clearUpdateRanges();
  }
  if (activeCount > 0 && typeof attribute.addUpdateRange === 'function') {
    attribute.addUpdateRange(0, activeCount * attribute.itemSize);
  }
  attribute.needsUpdate = true;
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

function shouldApplyLegacyImpostorDeathTransform(clipId: PixelForgeNpcClipId): boolean {
  return !isOneShotDeathClip(clipId);
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

function isNpcCloseModelPerfIsolationEnabled(): boolean {
  if (!isPerfDiagnosticsEnabled() || typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get('perfDisableNpcCloseModels');
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

interface WeaponPoseAxes {
  forward: THREE.Vector3;
  cleanUp: THREE.Vector3;
  actorRight: THREE.Vector3;
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

function queueCloseModelPoolGrowthForDeferredDemand(
  candidates: CloseModelCandidate[],
  activeCloseModels: Map<string, CloseModelInstance>,
  closeModelPools: Map<PixelForgeNpcPoolKey, CloseModelInstance[]>,
  demandByPool: Map<PixelForgeNpcPoolKey, number>,
  queuePoolGrowth: (poolKey: PixelForgeNpcPoolKey) => boolean,
): void {
  demandByPool.clear();
  for (const candidate of candidates) {
    const active = activeCloseModels.get(candidate.combatant.id);
    if (active?.poolKey === candidate.poolKey) continue;
    demandByPool.set(candidate.poolKey, (demandByPool.get(candidate.poolKey) ?? 0) + 1);
  }

  for (const [poolKey, demand] of demandByPool) {
    const available = closeModelPools.get(poolKey)?.length ?? 0;
    if (available < demand) {
      queuePoolGrowth(poolKey);
    }
  }
}

function resolveCloseModelPromotionBudget(
  overrideBudget: number | null,
  effectiveActiveCap: number,
): number {
  const requested = overrideBudget ?? CLOSE_MODEL_PROMOTION_BUDGET_PER_FRAME;
  return Math.max(0, Math.min(effectiveActiveCap, Math.floor(requested)));
}

function releaseLowerPriorityStickyCloseModel(
  candidate: CloseModelCandidate,
  stickyActiveCandidates: CloseModelCandidate[],
  selected: Set<string>,
  activeCloseModels: Map<string, CloseModelInstance>,
  releaseCloseModel: (combatantId: string, instance: CloseModelInstance) => void,
): boolean {
  for (let i = stickyActiveCandidates.length - 1; i >= 0; i--) {
    const stickyCandidate = stickyActiveCandidates[i];
    const stickyId = stickyCandidate.combatant.id;
    if (!selected.has(stickyId)) continue;
    if (compareCloseModelCandidates(candidate, stickyCandidate) >= 0) continue;

    const instance = activeCloseModels.get(stickyId);
    if (!instance) continue;
    releaseCloseModel(stickyId, instance);
    selected.delete(stickyId);
    return true;
  }
  return false;
}

function resolveCloseModelActiveCap(candidates: CloseModelCandidate[], requestedMaxActive?: number): number {
  const hardNearReserveCount = candidates.reduce(
    (count, candidate) => count + (candidate.isInHardNearReserveBubble ? 1 : 0),
    0,
  );
  const extraCap = Math.min(
    Math.max(0, Math.floor(PixelForgeNpcDistanceConfig.hardNearReserveExtraCap)),
    Math.max(0, hardNearReserveCount - PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP),
  );
  const effectiveCap = PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP + extraCap;
  if (requestedMaxActive === undefined) {
    return effectiveCap;
  }
  return Math.max(0, Math.min(effectiveCap, Math.floor(requestedMaxActive)));
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
  private factionMaterials: Map<string, CombatantUniformMaterial> = new Map();
  private walkFrameTextures: WalkFrameMap = new Map();
  private playerSquadId?: string;
  private playerSquadDetected = false;
  private shaderSettings = new CombatantShaderSettingsManager();
  private combatantStates: Map<string, { state: number; damaged: number }> = new Map();
  private closeModelPools: Map<PixelForgeNpcPoolKey, CloseModelInstance[]> = new Map();
  private closeModelPoolLoads: Map<PixelForgeNpcPoolKey, Promise<void>> = new Map();
  private closeModelPoolTargets: Map<PixelForgeNpcPoolKey, number> = new Map();
  private activeCloseModels: Map<string, CloseModelInstance> = new Map();
  private readonly closeModelOverflowLastLog = new Map<string, number>();
  private readonly closeModelOverflowReportedThisUpdate = new Set<string>();
  private readonly closeModelFallbackRecords = new Map<string, CloseModelFallbackRecord>();
  private readonly closeModelSelectedIds = new Set<string>();
  private readonly closeModelSuppressedImpostorIds = new Set<string>();
  private readonly closeModelProspectiveIds = new Set<string>();
  private readonly closeModelPreferredCandidates: CloseModelCandidate[] = [];
  private readonly closeModelCandidateById = new Map<string, CloseModelCandidate>();
  private readonly closeModelStickyActiveCandidates: CloseModelCandidate[] = [];
  private readonly closeModelDemandByPool = new Map<PixelForgeNpcPoolKey, number>();
  private readonly stableHashByCombatantId = new Map<string, number>();
  // Tracks the most recent wall-clock time (ms) at which each combatant was on-screen.
  // Used by the close-model priority score to debounce rapid in/out frustum flicker.
  private readonly lastVisibleAtMsByCombatant = new Map<string, number>();
  // Per-combatant velocity-driven impostor frame accumulator. Advances proportional
  // to horizontal distance traveled so stationary NPCs hold their frame and moving
  // NPCs cycle frames at a cadence of `framesPerMeter`.
  private readonly impostorFrameAccumulator = new Map<string, number>();
  private closeModelRuntimeStats = createEmptyCloseModelRuntimeStats();
  private closeModelPromotionBudgetOverride: number | null = null;
  /**
   * Per-combatant render mode observed at the end of the previous
   * updateBillboards. Phase F slice 6 (tier-transition events) diffs this
   * against the current frame's render mode to emit
   * `materialization_tier_changed` events through {@link GameEventBus}.
   * Entries are pruned when combatants are removed (see
   * {@link emitMaterializationTierTransitions}).
   */
  private readonly previousRenderModes = new Map<string, CombatantMaterializationRenderMode>();
  private readonly materializationSeenIds = new Set<string>();
  private disposed = false;

  // Walk animation state
  private walkFrameTimer = 0;
  private currentWalkFrame: 'a' | 'b' = 'a';
  private elapsedTime = 0;
  /**
   * Most recent `deltaTime` accepted by `updateWalkFrame`, consumed once by
   * the next `updateBillboards` call to drive the impostor frame accumulator.
   * Falls back to wall-clock dt if `updateWalkFrame` was never called.
   */
  private pendingBillboardDeltaSec = 0;
  /** Last wall-clock ms `updateBillboards` ran; fallback dt source. */
  private lastBillboardUpdateMs = -1;

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
  private readonly scratchFrustum = new THREE.Frustum();
  private readonly scratchFrustumMatrix = new THREE.Matrix4();
  private readonly scratchOnScreenSphere = new THREE.Sphere();
  private readonly scratchWeaponRightHand = new THREE.Vector3();
  private readonly scratchWeaponLeftShoulder = new THREE.Vector3();
  private readonly scratchWeaponRightShoulder = new THREE.Vector3();
  private readonly scratchWeaponTravelForward = new THREE.Vector3();
  private readonly scratchWeaponTorsoForward = new THREE.Vector3();
  private readonly scratchWeaponForward = new THREE.Vector3();
  private readonly scratchWeaponActorRight = new THREE.Vector3();
  private readonly scratchWeaponShoulderSpan = new THREE.Vector3();
  private readonly scratchWeaponCleanUp = new THREE.Vector3();
  private readonly scratchWeaponWorldMatrix = new THREE.Matrix4();
  private readonly scratchWeaponWorldQuaternion = new THREE.Quaternion();
  private readonly scratchWeaponPitchQuaternion = new THREE.Quaternion();
  private readonly scratchWeaponParentQuaternion = new THREE.Quaternion();
  private readonly scratchWeaponObjectQuaternion = new THREE.Quaternion();
  private readonly scratchWeaponPitchAxis = new THREE.Vector3(0, 0, 1);
  private readonly scratchWeaponShoulderCenter = new THREE.Vector3();
  private readonly scratchWeaponShoulderPocket = new THREE.Vector3();
  private readonly scratchWeaponStockOffset = new THREE.Vector3();
  private readonly scratchWeaponStockWorldOffset = new THREE.Vector3();
  private readonly scratchWeaponStockAnchoredGrip = new THREE.Vector3();
  private readonly scratchWeaponDesiredWorldPosition = new THREE.Vector3();
  private readonly scratchWeaponLocalPosition = new THREE.Vector3();
  private readonly scratchWeaponSupportOffset = new THREE.Vector3();
  private readonly scratchWeaponSupportTarget = new THREE.Vector3();
  private readonly scratchWeaponTemp = new THREE.Vector3();
  private readonly scratchWeaponStockFallback = new THREE.Vector3(-0.28, 0.04, 0);
  private readonly scratchWeaponSupportFallback = new THREE.Vector3(0.28, 0.02, 0);
  private readonly scratchWeaponAxes: WeaponPoseAxes = {
    forward: this.scratchWeaponForward,
    cleanUp: this.scratchWeaponCleanUp,
    actorRight: this.scratchWeaponActorRight,
  };
  private readonly scratchArmShoulder = new THREE.Vector3();
  private readonly scratchArmElbowNow = new THREE.Vector3();
  private readonly scratchArmHandNow = new THREE.Vector3();
  private readonly scratchArmTargetVector = new THREE.Vector3();
  private readonly scratchArmDirection = new THREE.Vector3();
  private readonly scratchArmClampedTarget = new THREE.Vector3();
  private readonly scratchArmPole = new THREE.Vector3();
  private readonly scratchArmPlaneNormal = new THREE.Vector3();
  private readonly scratchArmBendDirection = new THREE.Vector3();
  private readonly scratchArmElbow = new THREE.Vector3();
  private readonly scratchArmElbowWorld = new THREE.Vector3();
  private readonly scratchArmUpperDirection = new THREE.Vector3();
  private readonly scratchArmForeDirection = new THREE.Vector3();
  private readonly scratchArmTemp = new THREE.Vector3();
  private readonly scratchBoneDirection = new THREE.Vector3();
  private readonly scratchBoneParentQuaternion = new THREE.Quaternion();
  private readonly scratchBoneTargetLocal = new THREE.Vector3();
  private readonly scratchBoneLocalForward = new THREE.Vector3(0, 1, 0);
  private readonly renderWriteCounts = new Map<string, number>();
  private readonly renderCombatStates = new Map<string, number>();
  private readonly dirtyImpostorAttributeBuckets = new Set<string>();
  private readonly hitboxDebugEnabled = isHitboxDebugEnabled();
  private readonly closeModelPerfIsolationEnabled = isNpcCloseModelPerfIsolationEnabled();
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
  private lastBillboardUpdateProfile = createEmptyBillboardUpdateProfile();

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
    const cached = this.stableHashByCombatantId.get(id);
    if (cached !== undefined) return cached;

    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const stableHash = ((hash >>> 0) % 1000) / 1000;
    this.stableHashByCombatantId.set(id, stableHash);
    return stableHash;
  }

  async createFactionBillboards(options: CombatantRendererBillboardOptions = {}): Promise<void> {
    const assets = this.meshFactory.createFactionBillboards(PIXEL_FORGE_NPC_STARTUP_CLIP_IDS);
    this.factionMeshes = assets.factionMeshes;
    this.factionAuraMeshes = assets.factionAuraMeshes;
    this.factionGroundMarkers = assets.factionGroundMarkers;
    this.soldierTextures = assets.soldierTextures;
    this.factionMaterials = assets.factionMaterials;
    this.walkFrameTextures = assets.walkFrameTextures;
    if (options.eagerCloseModelPools && !this.closeModelPerfIsolationEnabled) {
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

  getCloseModelRuntimeStats(): CloseModelRuntimeStats {
    return {
      ...this.closeModelRuntimeStats,
      fallbackCounts: { ...this.closeModelRuntimeStats.fallbackCounts },
      poolTargets: { ...this.closeModelRuntimeStats.poolTargets },
      poolAvailable: { ...this.closeModelRuntimeStats.poolAvailable },
    };
  }

  getCloseModelFallbackRecords(): CloseModelFallbackRecord[] {
    return Array.from(this.closeModelFallbackRecords.values()).map((record) => ({ ...record }));
  }

  getLastBillboardUpdateProfile(): BillboardUpdateProfile {
    return { ...this.lastBillboardUpdateProfile };
  }

  getNearestCombatantMaterializationRows(
    combatants: Map<string, Combatant>,
    playerPosition: THREE.Vector3,
    limit = 24,
  ): CombatantMaterializationRow[] {
    const rowLimit = Math.max(
      0,
      Math.min(
        MAX_MATERIALIZATION_PROFILE_ROWS,
        Math.floor(Number.isFinite(limit) ? limit : 24),
      ),
    );
    if (rowLimit === 0) return [];

    const closeRadiusMeters = getPixelForgeNpcCloseModelDistanceMeters();

    return Array.from(combatants.values())
      .map((combatant): CombatantMaterializationRow => {
        const closeModel = this.activeCloseModels.get(combatant.id);
        const fallback = this.closeModelFallbackRecords.get(combatant.id);
        const billboardIndex = typeof combatant.billboardIndex === 'number' ? combatant.billboardIndex : null;
        const renderMode: CombatantMaterializationRenderMode = closeModel
          ? 'close-glb'
          : billboardIndex !== null && billboardIndex >= 0
            ? 'impostor'
            : 'culled';
        const poolKey = closeModel?.poolKey ?? fallback?.poolKey ?? getPixelForgeNpcPoolKey(combatant, this.playerSquadId);
        const position = combatant.renderedPosition ?? combatant.position;
        const distanceMeters = combatant.position.distanceTo(playerPosition);
        const inActiveCombat = combatant.state === CombatantState.ENGAGING
          || combatant.state === CombatantState.SUPPRESSING
          || combatant.state === CombatantState.ADVANCING;
        const reason: CombatantMaterializationReason = (() => {
          if (renderMode === 'close-glb') return 'close-glb:active';
          if (renderMode === 'impostor') {
            if (fallback?.reason) return `impostor:${fallback.reason}`;
            if (distanceMeters > closeRadiusMeters) return 'impostor:beyond-close-radius';
            return 'impostor:not-prioritized';
          }
          // renderMode === 'culled'
          if (combatant.simLane === 'culled') return 'culled:lod-culled';
          return 'culled:no-billboard';
        })();

        return {
          combatantId: combatant.id,
          faction: combatant.faction,
          state: combatant.state,
          simLane: combatant.simLane,
          distanceMeters,
          position: {
            x: position.x,
            y: position.y,
            z: position.z,
          },
          renderMode,
          clipId: closeModel?.activeClip ?? getPixelForgeNpcClipForCombatant(combatant),
          poolKey,
          isPlayerSquad: poolKey === 'SQUAD',
          billboardIndex,
          hasCloseModelWeapon: closeModel?.hasWeapon ?? false,
          closeFallbackReason: fallback?.reason ?? null,
          reason,
          inActiveCombat,
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.combatantId.localeCompare(b.combatantId))
      .slice(0, rowLimit);
  }

  async prewarmCloseModelsForSpawn(
    combatants: Map<string, Combatant>,
    playerPosition: THREE.Vector3,
    options: CloseModelPrewarmOptions = {},
  ): Promise<CloseModelPrewarmSummary> {
    const startMs = performance.now();
    const emptySummary = (
      skippedReason: CloseModelPrewarmSummary['skippedReason'],
      candidatesWithinCloseRadius = 0,
      primedAssetPaths = 0,
    ): CloseModelPrewarmSummary => ({
      skippedReason,
      candidatesWithinCloseRadius,
      requestedPoolTargets: {},
      primedAssetPaths,
      renderedCloseModels: this.closeModelRuntimeStats.renderedCloseModels,
      fallbackCount: this.closeModelRuntimeStats.fallbackCount,
      fallbackCounts: { ...this.closeModelRuntimeStats.fallbackCounts },
      poolLoads: this.closeModelRuntimeStats.poolLoads,
      durationMs: performance.now() - startMs,
    });

    if (this.closeModelPerfIsolationEnabled) {
      return emptySummary('perf-isolation');
    }

    const primedAssetPaths = options.primeFactionAssets
      ? await this.preloadCloseModelFactionAssets()
      : 0;
    const seededPoolTargets = options.seedFullFactionPools
      ? await this.createCloseModelPools(PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION)
      : {};
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.refreshFrustum();
    const candidates = this.collectCloseModelCandidates(combatants, playerPosition, nowMs);
    if (candidates.length === 0) {
      const summary = emptySummary('no-candidates', 0, primedAssetPaths);
      summary.requestedPoolTargets = seededPoolTargets;
      return summary;
    }

    const maxActive = resolveCloseModelActiveCap(candidates, options.maxActive);
    if (maxActive <= 0) {
      return emptySummary('perf-isolation', candidates.length, primedAssetPaths);
    }

    const requestedPoolTargets: Record<string, number> = {};
    Object.assign(requestedPoolTargets, seededPoolTargets);
    const requestedByPool = new Map<PixelForgeNpcPoolKey, number>();
    const preferredCandidates = selectPreferredCloseModelCandidates(
      candidates,
      maxActive,
      this.closeModelPreferredCandidates,
    );
    for (const candidate of preferredCandidates) {
      requestedByPool.set(candidate.poolKey, (requestedByPool.get(candidate.poolKey) ?? 0) + 1);
    }

    for (const [poolKey, requestedCount] of requestedByPool) {
      const currentTotal = this.countCloseModelInstances(poolKey);
      const target = Math.min(
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
        Math.max(currentTotal, requestedCount),
      );
      requestedPoolTargets[String(poolKey)] = target;
      this.closeModelPoolTargets.set(poolKey, target);
      await this.createCloseModelPool(poolKey, getPixelForgeNpcRuntimeFaction(poolKey), target);
    }

    this.closeModelPromotionBudgetOverride = maxActive;
    try {
      this.updateBillboards(combatants, playerPosition);
    } finally {
      this.closeModelPromotionBudgetOverride = null;
    }
    const stats = this.getCloseModelRuntimeStats();
    return {
      skippedReason: 'none',
      candidatesWithinCloseRadius: stats.candidatesWithinCloseRadius,
      requestedPoolTargets,
      primedAssetPaths,
      renderedCloseModels: stats.renderedCloseModels,
      fallbackCount: stats.fallbackCount,
      fallbackCounts: stats.fallbackCounts,
      poolLoads: stats.poolLoads,
      durationMs: performance.now() - startMs,
    };
  }

  private async preloadCloseModelFactionAssets(): Promise<number> {
    const paths = new Set<string>();
    for (const config of PIXEL_FORGE_NPC_RUNTIME_FACTIONS) {
      paths.add(config.modelPath);
      paths.add(config.weapon.modelPath);
    }
    const squadConfig = getPixelForgeNpcRuntimeFaction('SQUAD');
    paths.add(squadConfig.modelPath);
    paths.add(squadConfig.weapon.modelPath);

    const preloadPaths = [...paths];
    await modelLoader.preload(preloadPaths);
    return preloadPaths.length;
  }

  private async createCloseModelPools(
    targetSize = PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION,
  ): Promise<Record<string, number>> {
    const target = Math.min(
      PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      Math.max(0, Math.floor(targetSize)),
    );
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

    const requestedPoolTargets: Record<string, number> = {};
    for (const config of modelConfigs) {
      this.closeModelPoolTargets.set(config.poolKey, target);
      requestedPoolTargets[String(config.poolKey)] = target;
      await this.createCloseModelPool(
        config.poolKey,
        config.factionConfig,
        target,
      );
    }
    return requestedPoolTargets;
  }

  private queueCloseModelPoolLoad(
    poolKey: PixelForgeNpcPoolKey,
    requestedTarget = PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION,
  ): void {
    if (this.disposed) return;
    const currentTotal = this.countCloseModelInstances(poolKey);
    const previousTarget = this.closeModelPoolTargets.get(poolKey) ?? currentTotal;
    const nextTarget = Math.min(
      PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      Math.max(requestedTarget, previousTarget, currentTotal),
    );
    if (currentTotal >= nextTarget) return;
    this.closeModelPoolTargets.set(poolKey, nextTarget);
    if (this.closeModelPoolLoads.has(poolKey)) return;
    const factionConfig = getPixelForgeNpcRuntimeFaction(poolKey);
    const startLoad = async (): Promise<void> => {
      if (this.disposed) return;
      while (!this.disposed) {
        const target = this.closeModelPoolTargets.get(poolKey) ?? nextTarget;
        const before = this.countCloseModelInstances(poolKey);
        if (before >= target) return;
        await this.createCloseModelPool(poolKey, factionConfig, target);
        const after = this.countCloseModelInstances(poolKey);
        if (after >= (this.closeModelPoolTargets.get(poolKey) ?? target) || after <= before) return;
      }
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
    targetSize = PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
  ): Promise<void> {
    if (this.disposed) return;

    const pool = this.closeModelPools.get(poolKey) ?? [];
    if (!this.closeModelPools.has(poolKey)) {
      this.closeModelPools.set(poolKey, pool);
    }
    const target = Math.min(
      PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      Math.max(0, Math.floor(targetSize)),
    );
    let total = this.countCloseModelInstances(poolKey);
    if (total >= target) return;

    const created: CloseModelInstance[] = [];
    for (; total < target; total++) {
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
        const optimizedWeaponRoot = this.createOptimizedWeaponRoot(weaponRoot, factionConfig.weapon);
        weaponPivot.add(optimizedWeaponRoot);
        model.scene.add(weaponPivot);
        model.scene.visible = false;
        this.configureCloseModelFrustumCulling(model.scene);
        this.applyCloseModelMaterialTuning(model.scene, factionConfig);
        this.scene.add(model.scene);
        const mixer = new THREE.AnimationMixer(model.scene);
        const metrics = this.measureCloseModelMetrics(model.scene);
        const bones = this.collectBones(model.scene);
        const instance: CloseModelInstance = {
          root: model.scene,
          mixer,
          actions: this.createActionMap(mixer, model.animations),
          poolKey,
          factionConfig,
          weaponPivot,
          weaponRoot: optimizedWeaponRoot,
          weaponConfig: factionConfig.weapon,
          bones,
          hasWeapon: bones.has(factionConfig.rightHandSocket) && bones.has(factionConfig.leftHandSocket),
          boundsMinY: metrics.boundsMinY,
          visualScale: metrics.visualScale,
          materialStates: this.collectCloseModelMaterialStates(model.scene),
        };
        pool.push(instance);
        created.push(instance);
      } catch (error) {
        Logger.warn('combat-renderer', `Failed to create Pixel Forge NPC model from ${factionConfig.modelPath}`, error);
        break;
      }
    }

    if (this.disposed) {
      for (const instance of created) {
        this.disposeCloseModelInstance(instance);
      }
      return;
    }

    Logger.info(
      'combat-renderer',
      `Created Pixel Forge NPC close-model pool ${poolKey}: `
        + `${pool.length}/${this.countCloseModelInstances(poolKey)} available/total models (target ${target})`,
    );
  }

  private configureCloseModelFrustumCulling(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.frustumCulled = true;
      if (!child.geometry.boundingSphere) {
        child.geometry.computeBoundingSphere();
      }
    });
  }

  private countCloseModelInstances(poolKey: PixelForgeNpcPoolKey): number {
    let total = this.closeModelPools.get(poolKey)?.length ?? 0;
    this.activeCloseModels.forEach((instance) => {
      if (instance.poolKey === poolKey) total++;
    });
    return total;
  }

  private queueCloseModelPoolGrowth(poolKey: PixelForgeNpcPoolKey): boolean {
    const currentTotal = this.countCloseModelInstances(poolKey);
    if (currentTotal >= PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION) return false;
    const nextTarget = Math.min(
      PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      Math.max(
        PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION,
        currentTotal + PIXEL_FORGE_NPC_CLOSE_MODEL_TOP_UP_BATCH,
      ),
    );
    this.queueCloseModelPoolLoad(poolKey, nextTarget);
    return true;
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
      const nextOpacity = state.opacity * clamped;
      const nextTransparent = state.transparent || clamped < 0.999;
      const nextDepthWrite = clamped >= 0.999 ? state.depthWrite : false;
      if (
        material.opacity === nextOpacity &&
        material.transparent === nextTransparent &&
        material.depthWrite === nextDepthWrite
      ) {
        continue;
      }
      const renderStateChanged =
        material.transparent !== nextTransparent ||
        material.depthWrite !== nextDepthWrite;
      material.opacity = nextOpacity;
      material.transparent = nextTransparent;
      material.depthWrite = nextDepthWrite;
      if (renderStateChanged) {
        material.needsUpdate = true;
      }
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

  private createOptimizedWeaponRoot(root: THREE.Group, weapon: PixelForgeNpcWeaponRuntimeConfig): THREE.Group {
    root.updateMatrixWorld(true);
    const sourceGeometries: THREE.BufferGeometry[] = [];
    let sourceMaterial: THREE.Material | undefined;
    const rootWorldInverse = root.matrixWorld.clone().invert();

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const geometry = child.geometry?.clone();
      if (!geometry) return;
      child.updateMatrixWorld(true);
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootWorldInverse, child.matrixWorld));
      for (const attributeName of Object.keys(geometry.attributes)) {
        if (attributeName !== 'position' && attributeName !== 'normal') {
          geometry.deleteAttribute(attributeName);
        }
      }
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      sourceGeometries.push(geometry);
      if (!sourceMaterial) {
        sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      }
    });

    const merged = sourceGeometries.length > 0
      ? BufferGeometryUtils.mergeGeometries(sourceGeometries, false)
      : null;
    for (const geometry of sourceGeometries) geometry.dispose();
    if (!merged) return root;

    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const material = sourceMaterial
      ? sourceMaterial.clone()
      : new THREE.MeshStandardMaterial({ color: 0x2f2f2b, roughness: 0.85, metalness: 0.1 });
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `${weapon.id}_optimized_weapon`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.userData[OPTIMIZED_WEAPON_RESOURCE_KEY] = true;

    const optimized = new THREE.Group();
    optimized.name = root.name || `${weapon.id}_weapon`;
    optimized.position.copy(root.position);
    optimized.quaternion.copy(root.quaternion);
    optimized.scale.copy(root.scale);
    optimized.userData.stockOffset = root.userData.stockOffset;
    optimized.userData.supportOffset = root.userData.supportOffset;
    optimized.userData.modelPath = root.userData.modelPath;
    optimized.userData.optimizedWeaponMesh = true;
    optimized.add(mesh);
    return optimized;
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
    this.pendingBillboardDeltaSec += deltaTime;
    this.activeCloseModels.forEach((instance) => instance.mixer.update(deltaTime));
    this.factionMaterials.forEach((material) => {
      if (material.uniforms?.time) {
        material.uniforms.time.value = this.elapsedTime;
      }
    });
  }

  private updateCloseModels(
    combatants: Map<string, Combatant>,
    playerPosition: THREE.Vector3,
  ): { closeModelIds: Set<string>; suppressedImpostorIds: Set<string> } {
    this.closeModelOverflowReportedThisUpdate.clear();
    this.closeModelFallbackRecords.clear();
    this.closeModelSelectedIds.clear();
    this.closeModelSuppressedImpostorIds.clear();
    this.closeModelProspectiveIds.clear();

    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.refreshFrustum();
    const candidates = this.collectCloseModelCandidates(combatants, playerPosition, nowMs);

    if (this.closeModelPerfIsolationEnabled) {
      this.activeCloseModels.forEach((instance, combatantId) => {
        this.releaseCloseModel(combatantId, instance);
      });
      for (const candidate of candidates) {
        this.recordCloseModelFallback(candidate, 'perf-isolation');
      }
      this.captureCloseModelRuntimeStats(candidates.length, 0);
      return {
        closeModelIds: this.closeModelSelectedIds,
        suppressedImpostorIds: this.closeModelSuppressedImpostorIds,
      };
    }

    const effectiveActiveCap = resolveCloseModelActiveCap(candidates);
    const prospectiveCandidates = selectPreferredCloseModelCandidates(
      candidates,
      effectiveActiveCap,
      this.closeModelPreferredCandidates,
    );
    queueCloseModelPoolGrowthForDeferredDemand(
      prospectiveCandidates,
      this.activeCloseModels,
      this.closeModelPools,
      this.closeModelDemandByPool,
      poolKey => this.queueCloseModelPoolGrowth(poolKey),
    );
    const promotionBudget = resolveCloseModelPromotionBudget(
      this.closeModelPromotionBudgetOverride,
      effectiveActiveCap,
    );
    let promotionBudgetRemaining = promotionBudget;
    let promotionsThisFrame = 0;
    let replacementsThisFrame = 0;

    const selected = this.closeModelSelectedIds;
    const prospectiveIds = this.closeModelProspectiveIds;
    const candidateById = this.closeModelCandidateById;
    const stickyActiveCandidates = this.closeModelStickyActiveCandidates;
    candidateById.clear();
    stickyActiveCandidates.length = 0;
    for (const candidate of candidates) {
      candidateById.set(candidate.combatant.id, candidate);
    }
    for (const candidate of prospectiveCandidates) prospectiveIds.add(candidate.combatant.id);

    this.activeCloseModels.forEach((instance, combatantId) => {
      const candidate = candidateById.get(combatantId);
      if (!candidate) {
        this.releaseCloseModel(combatantId, instance);
        return;
      }
      if (prospectiveIds.has(combatantId)) {
        selected.add(combatantId);
      } else {
        stickyActiveCandidates.push(candidate);
      }
    });
    stickyActiveCandidates.sort(compareCloseModelCandidates);
    for (const candidate of stickyActiveCandidates) {
      if (selected.size >= effectiveActiveCap) break;
      selected.add(candidate.combatant.id);
    }

    const orderedCandidates = this.canServeCloseModelCandidates(prospectiveCandidates)
      ? prospectiveCandidates
      : candidates.sort(compareCloseModelCandidates);

    for (const candidate of orderedCandidates) {
      if (selected.has(candidate.combatant.id)) {
        continue;
      }
      if (!prospectiveIds.has(candidate.combatant.id)) {
        this.recordCloseModelFallback(candidate, 'total-cap');
        this.reportCloseModelOverflowOnce(candidate.poolKey, candidate.distanceSq, 'total-cap');
        continue;
      }
      if (selected.size >= effectiveActiveCap) {
        if (
          promotionBudgetRemaining <= 0
          || !releaseLowerPriorityStickyCloseModel(
            candidate,
            stickyActiveCandidates,
            selected,
            this.activeCloseModels,
            (combatantId, instance) => this.releaseCloseModel(combatantId, instance),
          )
        ) {
          const reason: CloseModelFallbackReason = prospectiveIds.has(candidate.combatant.id)
            ? 'promotion-budget'
            : 'total-cap';
          this.recordCloseModelFallback(candidate, reason);
          this.reportCloseModelOverflowOnce(candidate.poolKey, candidate.distanceSq, reason);
          continue;
        }
        replacementsThisFrame++;
      }
      if (promotionBudgetRemaining <= 0) {
        const reason: CloseModelFallbackReason = prospectiveIds.has(candidate.combatant.id)
          ? 'promotion-budget'
          : 'total-cap';
        this.recordCloseModelFallback(candidate, reason);
        this.reportCloseModelOverflowOnce(candidate.poolKey, candidate.distanceSq, reason);
        continue;
      }
      const instance = this.ensureCloseModel(candidate.combatant.id, candidate.poolKey);
      if (!instance) {
        if (this.queueCloseModelPoolGrowth(candidate.poolKey)) {
          this.recordCloseModelFallback(candidate, 'pool-loading');
          this.reportCloseModelOverflowOnce(candidate.poolKey, candidate.distanceSq, 'pool-loading');
          continue;
        }
        this.recordCloseModelFallback(candidate, 'pool-empty');
        this.reportCloseModelOverflowOnce(candidate.poolKey, candidate.distanceSq, 'pool-empty');
        continue;
      }
      selected.add(candidate.combatant.id);
      promotionsThisFrame++;
      promotionBudgetRemaining--;
    }

    for (const candidate of candidates) {
      if (selected.has(candidate.combatant.id) || this.closeModelFallbackRecords.has(candidate.combatant.id)) {
        continue;
      }
      const reason: CloseModelFallbackReason = prospectiveIds.has(candidate.combatant.id)
        ? 'promotion-budget'
        : 'total-cap';
      this.recordCloseModelFallback(candidate, reason);
      this.reportCloseModelOverflowOnce(candidate.poolKey, candidate.distanceSq, reason);
    }

    this.activeCloseModels.forEach((instance, combatantId) => {
      if (!selected.has(combatantId)) return;
      const candidate = candidateById.get(combatantId);
      if (candidate) {
        this.updateCloseModelInstance(instance, candidate.combatant, candidate.poolKey);
      }
    });

    this.activeCloseModels.forEach((instance, combatantId) => {
      if (!selected.has(combatantId)) {
        this.releaseCloseModel(combatantId, instance);
      }
    });

    this.captureCloseModelRuntimeStats(
      candidates.length,
      selected.size,
      effectiveActiveCap,
      promotionBudget,
      promotionsThisFrame,
      replacementsThisFrame,
    );
    return {
      closeModelIds: selected,
      suppressedImpostorIds: this.closeModelSuppressedImpostorIds,
    };
  }

  private collectCloseModelCandidates(
    combatants: Map<string, Combatant>,
    playerPosition: THREE.Vector3,
    nowMs: number,
  ): CloseModelCandidate[] {
    const closeRadiusSq = getPixelForgeNpcCloseModelDistanceSq();
    const candidates: CloseModelCandidate[] = [];
    combatants.forEach((combatant) => {
      if (combatant.state === CombatantState.DEAD && !combatant.isDying) return;
      const distanceSq = combatant.position.distanceToSquared(playerPosition);
      if (distanceSq > closeRadiusSq) return;
      const poolKey = getPixelForgeNpcPoolKey(combatant, this.playerSquadId);

      const isOnScreen = this.isCombatantOnScreen(combatant);
      if (isOnScreen) this.lastVisibleAtMsByCombatant.set(combatant.id, nowMs);
      const lastVisibleAt = this.lastVisibleAtMsByCombatant.get(combatant.id);
      const recentlyVisible =
        lastVisibleAt !== undefined &&
        (nowMs - lastVisibleAt) <= PixelForgeNpcDistanceConfig.recentlyVisibleMs;
      const isPlayerSquad = poolKey === 'SQUAD';
      const distance = Math.sqrt(distanceSq);
      const isHardNear = distance <= PixelForgeNpcDistanceConfig.hardNearDistanceMeters;
      const isInHardNearReserveBubble =
        distance <= PixelForgeNpcDistanceConfig.hardNearReserveDistanceMeters;
      const isInActiveCombat = combatant.state === CombatantState.ENGAGING
        || combatant.state === CombatantState.SUPPRESSING
        || combatant.state === CombatantState.ADVANCING;
      const priorityScore =
        PixelForgeNpcDistanceConfig.hardNearReserveWeight * (isInHardNearReserveBubble ? 1 : 0) +
        PixelForgeNpcDistanceConfig.hardNearWeight * (isHardNear ? 1 : 0) +
        PixelForgeNpcDistanceConfig.onScreenWeight * (isOnScreen ? 1 : 0) +
        PixelForgeNpcDistanceConfig.inActiveCombatWeight * (isInActiveCombat ? 1 : 0) +
        PixelForgeNpcDistanceConfig.squadWeight * (isPlayerSquad ? 1 : 0) +
        PixelForgeNpcDistanceConfig.distanceWeight * (1 / Math.max(distance, 4)) +
        PixelForgeNpcDistanceConfig.recentlyVisibleWeight * (recentlyVisible && !isOnScreen ? 1 : 0);

      candidates.push({
        combatant,
        distanceSq,
        poolKey,
        isOnScreen,
        recentlyVisible,
        isPlayerSquad,
        isInHardNearReserveBubble,
        isInActiveCombat,
        priorityScore,
      });
    });
    return candidates;
  }

  private canServeCloseModelCandidates(candidates: CloseModelCandidate[]): boolean {
    const demandByPool = this.closeModelDemandByPool;
    demandByPool.clear();
    for (const candidate of candidates) {
      const active = this.activeCloseModels.get(candidate.combatant.id);
      if (active?.poolKey === candidate.poolKey) continue;
      demandByPool.set(candidate.poolKey, (demandByPool.get(candidate.poolKey) ?? 0) + 1);
    }

    for (const [poolKey, demand] of demandByPool) {
      const available = this.closeModelPools.get(poolKey)?.length ?? 0;
      if (available < demand) return false;
    }
    return true;
  }

  /**
   * Recompute the camera frustum for this update tick. Cheap (one matrix
   * multiply) and lets selection / visibility checks reuse the same value.
   */
  private refreshFrustum(): void {
    const proj = (this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).projectionMatrix;
    const view = this.camera.matrixWorldInverse;
    if (!proj || !view) return;
    this.scratchFrustumMatrix.multiplyMatrices(proj, view);
    this.scratchFrustum.setFromProjectionMatrix(this.scratchFrustumMatrix);
  }

  /**
   * Returns true when the combatant's body bounding sphere intersects the
   * current camera frustum. Used to bias close-model slots toward NPCs the
   * player can actually see.
   */
  private isCombatantOnScreen(combatant: Combatant): boolean {
    const sourcePosition = combatant.renderedPosition ?? combatant.position;
    // Body radius ~1.2 m; centered roughly at chest height above the foot anchor.
    this.scratchOnScreenSphere.center.set(sourcePosition.x, sourcePosition.y + 0.9, sourcePosition.z);
    this.scratchOnScreenSphere.radius = 1.2;
    return this.scratchFrustum.intersectsSphere(this.scratchOnScreenSphere);
  }

  private recordCloseModelFallback(candidate: CloseModelCandidate, reason: CloseModelFallbackReason): void {
    this.closeModelFallbackRecords.set(candidate.combatant.id, {
      combatantId: candidate.combatant.id,
      poolKey: candidate.poolKey,
      distanceMeters: Math.sqrt(candidate.distanceSq),
      reason,
    });
  }

  private captureCloseModelRuntimeStats(
    candidatesWithinCloseRadius: number,
    renderedCloseModels: number,
    closeModelActiveCap = PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
    promotionBudgetPerFrame = CLOSE_MODEL_PROMOTION_BUDGET_PER_FRAME,
    promotionsThisFrame = 0,
    replacementsThisFrame = 0,
  ): void {
    const fallbackCounts = createCloseModelFallbackCounts();
    const distances: number[] = [];
    this.closeModelFallbackRecords.forEach((record) => {
      fallbackCounts[record.reason] += 1;
      distances.push(record.distanceMeters);
    });

    const poolTargets: Record<string, number> = {};
    this.closeModelPoolTargets.forEach((target, key) => {
      poolTargets[String(key)] = target;
    });
    const poolAvailable: Record<string, number> = {};
    this.closeModelPools.forEach((pool, key) => {
      poolAvailable[String(key)] = pool.length;
    });

    this.closeModelRuntimeStats = {
      closeRadiusMeters: getPixelForgeNpcCloseModelDistanceMeters(),
      closeModelActiveCap,
      promotionBudgetPerFrame,
      promotionsThisFrame,
      replacementsThisFrame,
      candidatesWithinCloseRadius,
      renderedCloseModels,
      activeCloseModels: this.activeCloseModels.size,
      fallbackCount: this.closeModelFallbackRecords.size,
      fallbackCounts,
      nearestFallbackDistanceMeters: distances.length > 0 ? Math.min(...distances) : null,
      farthestFallbackDistanceMeters: distances.length > 0 ? Math.max(...distances) : null,
      poolLoads: this.closeModelPoolLoads.size,
      poolTargets,
      poolAvailable,
    };
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

  private disposeCloseModelInstance(instance: CloseModelInstance): void {
    instance.mixer.stopAllAction();
    instance.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child.userData[OPTIMIZED_WEAPON_RESOURCE_KEY] !== true) return;
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    });
    modelLoader.disposeInstance(instance.root);
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

  private reportCloseModelOverflow(poolKey: PixelForgeNpcPoolKey, distanceSq: number, reason: CloseModelFallbackReason): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const key = `${poolKey}:${reason}`;
    const last = this.closeModelOverflowLastLog.get(key);
    if (last !== undefined && now - last < 1000) return;
    this.closeModelOverflowLastLog.set(key, now);
    Logger.info(
      'combat-renderer',
      `Pixel Forge close NPC ${reason} for ${poolKey} at ${Math.sqrt(distanceSq).toFixed(1)}m; using impostor fallback`,
    );
  }

  private reportCloseModelOverflowOnce(poolKey: PixelForgeNpcPoolKey, distanceSq: number, reason: CloseModelFallbackReason): void {
    const key = `${poolKey}:${reason}`;
    if (this.closeModelOverflowReportedThisUpdate.has(key)) return;
    this.closeModelOverflowReportedThisUpdate.add(key);
    this.reportCloseModelOverflow(poolKey, distanceSq, reason);
  }

  private updateWeaponSocket(instance: CloseModelInstance): void {
    if (!instance.weaponPivot || !instance.weaponRoot) {
      instance.hasWeapon = false;
      return;
    }

    const right = this.getBoneWorldPosition(instance, instance.factionConfig.rightHandSocket, this.scratchWeaponRightHand);
    const leftShoulder = this.getBoneWorldPosition(instance, 'LeftArm', this.scratchWeaponLeftShoulder)
      ?? this.getBoneWorldPosition(instance, 'LeftShoulder', this.scratchWeaponLeftShoulder);
    const rightShoulder = this.getBoneWorldPosition(instance, 'RightArm', this.scratchWeaponRightShoulder)
      ?? this.getBoneWorldPosition(instance, 'RightShoulder', this.scratchWeaponRightShoulder);
    if (!right) {
      instance.hasWeapon = false;
      return;
    }

    const travelForward = this.getRootForward(instance.root, this.scratchWeaponTravelForward);
    travelForward.y = 0;
    if (travelForward.lengthSq() < 0.0001) travelForward.set(0, 0, 1);
    travelForward.normalize();

    const torsoForward = this.getBodyForward(instance, this.scratchWeaponTorsoForward);
    torsoForward.y = 0;
    if (torsoForward.lengthSq() < 0.0001) torsoForward.set(0, 0, 1);
    torsoForward.normalize();

    const forward = this.scratchWeaponForward.copy(
      instance.weaponConfig.socketMode === 'shouldered-forward' ? travelForward : torsoForward,
    );
    const actorRight = this.scratchWeaponActorRight.crossVectors(forward, this.scratchUp).normalize();
    if (leftShoulder && rightShoulder) {
      const shoulderSpan = this.scratchWeaponShoulderSpan.copy(rightShoulder).sub(leftShoulder);
      shoulderSpan.y = 0;
      if (shoulderSpan.lengthSq() > 0.0001) {
        shoulderSpan.normalize();
        if (shoulderSpan.dot(actorRight) < 0) shoulderSpan.multiplyScalar(-1);
        actorRight.copy(shoulderSpan);
      }
    }
    const cleanUp = this.scratchWeaponCleanUp.crossVectors(actorRight, forward).normalize();
    const worldMatrix = this.scratchWeaponWorldMatrix.makeBasis(forward, cleanUp, actorRight);
    const worldQuaternion = this.scratchWeaponWorldQuaternion.setFromRotationMatrix(worldMatrix);
    if (instance.weaponConfig.pitchTrimDeg) {
      worldQuaternion.multiply(this.scratchWeaponPitchQuaternion.setFromAxisAngle(
        this.scratchWeaponPitchAxis,
        THREE.MathUtils.degToRad(instance.weaponConfig.pitchTrimDeg),
      ));
    }

    const parent = instance.weaponPivot.parent ?? instance.root;
    parent.updateMatrixWorld(true);
    const parentQuaternion = parent.getWorldQuaternion(this.scratchWeaponParentQuaternion);
    instance.weaponPivot.quaternion.copy(parentQuaternion.invert().multiply(worldQuaternion));

    const shoulder = rightShoulder ?? right;
    const shoulderCenter = this.scratchWeaponShoulderCenter;
    if (leftShoulder && rightShoulder) {
      shoulderCenter.copy(leftShoulder).lerp(rightShoulder, 0.5);
    } else {
      shoulderCenter.copy(shoulder).sub(this.scratchWeaponTemp.copy(actorRight).multiplyScalar(0.12));
    }
    const shoulderPocket = this.scratchWeaponShoulderPocket.copy(shoulder)
      .lerp(shoulderCenter, 0.42)
      .add(this.scratchWeaponTemp.copy(cleanUp).multiplyScalar(-0.035));
    const stockOffset = this.getWeaponOffset(
      instance.weaponRoot,
      'stockOffset',
      this.scratchWeaponStockFallback,
      this.scratchWeaponStockOffset,
    );
    const stockWorldOffset = this.scratchWeaponStockWorldOffset.copy(stockOffset).applyQuaternion(worldQuaternion);
    const stockAnchoredGrip = this.scratchWeaponStockAnchoredGrip.copy(shoulderPocket)
      .add(this.scratchWeaponTemp.copy(forward).multiplyScalar(instance.weaponConfig.forwardHold + instance.weaponConfig.gripOffset))
      .sub(stockWorldOffset);
    const desiredWorldPosition = this.scratchWeaponDesiredWorldPosition.copy(stockAnchoredGrip)
      .add(this.scratchWeaponTemp.copy(actorRight).multiplyScalar(0.006));
    instance.weaponPivot.position.copy(parent.worldToLocal(this.scratchWeaponLocalPosition.copy(desiredWorldPosition)));
    instance.weaponPivot.updateMatrixWorld(true);

    const supportOffset = this.getWeaponOffset(
      instance.weaponRoot,
      'supportOffset',
      this.scratchWeaponSupportFallback,
      this.scratchWeaponSupportOffset,
    );
    const supportTarget = this.scratchWeaponSupportTarget.copy(desiredWorldPosition)
      .add(supportOffset.applyQuaternion(worldQuaternion));
    this.solveArmToTarget(instance, 'Right', desiredWorldPosition, this.scratchWeaponAxes);
    this.solveArmToTarget(instance, 'Left', supportTarget, this.scratchWeaponAxes);
    instance.root.updateMatrixWorld(true);
    instance.weaponPivot.updateMatrixWorld(true);
    instance.hasWeapon = true;
  }

  private getWeaponOffset(
    root: THREE.Object3D,
    key: 'stockOffset' | 'supportOffset',
    fallback: THREE.Vector3,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const value = root.userData[key];
    return out.copy(value instanceof THREE.Vector3 ? value : fallback);
  }

  private getBoneWorldPosition(
    instance: CloseModelInstance,
    name: string,
    out: THREE.Vector3,
  ): THREE.Vector3 | undefined {
    const bone = instance.bones.get(name);
    return bone ? bone.getWorldPosition(out) : undefined;
  }

  private getRootForward(root: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
    const quaternion = root.getWorldQuaternion(this.scratchWeaponObjectQuaternion);
    return out.set(0, 0, 1).applyQuaternion(quaternion).normalize();
  }

  private getBodyForward(instance: CloseModelInstance, out: THREE.Vector3): THREE.Vector3 {
    const body = instance.bones.get('Hips') ?? instance.bones.get('Spine') ?? instance.root;
    const quaternion = body.getWorldQuaternion(this.scratchWeaponObjectQuaternion);
    return out.set(0, 0, 1).applyQuaternion(quaternion).normalize();
  }

  private solveArmToTarget(
    instance: CloseModelInstance,
    side: 'Right' | 'Left',
    target: THREE.Vector3,
    axes: WeaponPoseAxes,
  ): void {
    const upper = instance.bones.get(`${side}Arm`);
    const fore = instance.bones.get(`${side}ForeArm`);
    const hand = instance.bones.get(`${side}Hand`);
    if (!upper || !fore || !hand) return;

    const shoulder = upper.getWorldPosition(this.scratchArmShoulder);
    const elbowNow = fore.getWorldPosition(this.scratchArmElbowNow);
    const handNow = hand.getWorldPosition(this.scratchArmHandNow);
    const upperLength = Math.max(0.001, shoulder.distanceTo(elbowNow));
    const foreLength = Math.max(0.001, elbowNow.distanceTo(handNow));
    const reach = Math.max(0.08, upperLength + foreLength - 0.025);
    const targetVector = this.scratchArmTargetVector.copy(target).sub(shoulder);
    const distance = targetVector.length();
    if (distance < 0.001) return;

    const direction = this.scratchArmDirection.copy(targetVector).normalize();
    const clampedTarget = this.scratchArmClampedTarget;
    if (distance > reach) {
      clampedTarget.copy(shoulder).add(this.scratchArmTemp.copy(direction).multiplyScalar(reach));
    } else {
      clampedTarget.copy(target);
    }
    const clampedDistance = Math.min(distance, reach);
    const sideSign = side === 'Right' ? 1 : -1;
    const pole = this.scratchArmPole.copy(shoulder)
      .add(this.scratchArmTemp.copy(axes.cleanUp).multiplyScalar(-0.24))
      .add(this.scratchArmTemp.copy(axes.actorRight).multiplyScalar(0.22 * sideSign))
      .add(this.scratchArmTemp.copy(axes.forward).multiplyScalar(0.04));
    const planeNormal = this.scratchArmPlaneNormal
      .crossVectors(direction, this.scratchArmTemp.copy(pole).sub(shoulder))
      .normalize();
    if (planeNormal.lengthSq() < 0.0001) {
      planeNormal.copy(axes.actorRight).multiplyScalar(sideSign);
    }
    const bendDirection = this.scratchArmBendDirection.crossVectors(planeNormal, direction).normalize();
    const along = (upperLength * upperLength - foreLength * foreLength + clampedDistance * clampedDistance)
      / (2 * clampedDistance);
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    const elbow = this.scratchArmElbow.copy(shoulder)
      .add(this.scratchArmTemp.copy(direction).multiplyScalar(along))
      .add(bendDirection.multiplyScalar(height));

    this.setBoneDirectionWorld(upper, this.scratchArmUpperDirection.copy(elbow).sub(shoulder));
    const elbowWorld = fore.getWorldPosition(this.scratchArmElbowWorld);
    this.setBoneDirectionWorld(fore, this.scratchArmForeDirection.copy(clampedTarget).sub(elbowWorld));
  }

  private setBoneDirectionWorld(bone: THREE.Object3D, directionWorld: THREE.Vector3): void {
    if (!bone.parent) return;
    const direction = this.scratchBoneDirection.copy(directionWorld);
    if (direction.lengthSq() < 0.0001) return;
    direction.normalize();
    const parentInv = bone.parent.getWorldQuaternion(this.scratchBoneParentQuaternion).invert();
    const targetLocal = this.scratchBoneTargetLocal.copy(direction).applyQuaternion(parentInv).normalize();
    bone.quaternion.setFromUnitVectors(this.scratchBoneLocalForward, targetLocal);
    bone.updateMatrixWorld(true);
  }

  private getImpostorViewTile(combatant: Combatant): { column: number; row: number } {
    const sourcePosition = combatant.renderedPosition ?? combatant.position;
    return getPixelForgeNpcViewTileForCamera(sourcePosition, this.camera.position, combatant.visualRotation);
  }

  /**
   * Returns the per-instance `phase` value to feed the impostor shader so the
   * displayed frame is keyed to the combatant's accumulated horizontal travel
   * instead of wall-clock time.
   *
   * Background: the impostor fragment shader computes
   *   loopFrame = floor(mod((time/duration + phase) * framesPerClip, framesPerClip))
   * For non-velocity clips (`idle`, death poses) we keep the original behavior:
   * `phase = stableHash01(id)` cycles each NPC at clip duration with a per-NPC
   * stagger.
   *
   * For velocity-driven walk/run clips we pick `phase` so the formula evaluates
   * to a velocity-keyed accumulator:
   *   `phase = stableHash + accumulator/framesPerClip - time/duration`
   * which collapses the time-driven cycle and replaces it with a frame index
   * advanced by `velocity * dt * framesPerMeter`. Idle (velocity below
   * `idleVelocitySq`) NPCs hold their stableHash-derived frame across ticks.
   */
  private computeVelocityKeyedImpostorPhase(
    combatant: Combatant,
    clipId: PixelForgeNpcClipId,
    deltaTimeSec: number,
  ): number {
    const stableHash = this.stableHash01(combatant.id);
    if (!VELOCITY_DRIVEN_CLIPS.has(clipId) || combatant.isDying) {
      // Non-walk clips keep the original time-keyed cycle for visual continuity.
      return stableHash;
    }
    const meta = IMPOSTOR_CLIP_METADATA.get(clipId);
    if (!meta || meta.framesPerClip <= 0 || meta.durationSec <= 0) return stableHash;

    const velocity = combatant.velocity;
    const horizontalSpeedSq =
      velocity ? velocity.x * velocity.x + velocity.z * velocity.z : 0;

    let accumulator = this.impostorFrameAccumulator.get(combatant.id) ?? 0;
    if (horizontalSpeedSq < PixelForgeNpcDistanceConfig.idleVelocitySq) {
      // Stationary: hold the current accumulator (and therefore the current frame).
    } else {
      const horizontalSpeed = Math.sqrt(horizontalSpeedSq);
      accumulator += horizontalSpeed * deltaTimeSec * PixelForgeNpcDistanceConfig.framesPerMeter;
    }
    this.impostorFrameAccumulator.set(combatant.id, accumulator);

    const timeOverDuration = this.elapsedTime / meta.durationSec;
    return stableHash + accumulator / meta.framesPerClip - timeOverDuration;
  }

  updateBillboards(combatants: Map<string, Combatant>, playerPosition: THREE.Vector3): void {
    const profile = createEmptyBillboardUpdateProfile();
    const closeModelStart = performance.now();
    const { closeModelIds, suppressedImpostorIds } = this.updateCloseModels(combatants, playerPosition);
    profile.closeModelMs = performance.now() - closeModelStart;

    const bucketResetStart = performance.now();
    this.factionMeshes.forEach(mesh => {
      mesh.count = 0;
      mesh.visible = false;
    });
    this.factionAuraMeshes.forEach(mesh => {
      mesh.count = 0;
      mesh.visible = false;
    });
    this.factionGroundMarkers.forEach(mesh => {
      mesh.count = 0;
      mesh.visible = false;
    });
    const RENDER_DISTANCE_SQ = 400 * 400;
    this.renderWriteCounts.clear();
    this.renderCombatStates.clear();
    this.dirtyImpostorAttributeBuckets.clear();
    this.factionMeshes.forEach((_mesh, key) => {
      this.renderWriteCounts.set(key, 0);
      this.renderCombatStates.set(key, 0);
    });
    profile.bucketResetMs = performance.now() - bucketResetStart;

    // Pull the deltaTime accumulated since the last `updateBillboards` call.
    // `updateWalkFrame` accepts the authoritative game-loop dt and feeds the
    // accumulator below; if it was never called this tick we fall back to a
    // wall-clock estimate. Clamp to a sane range so a long pause cannot
    // advance every NPC by hundreds of frames in one tick.
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const fallbackWallClockDt = this.lastBillboardUpdateMs >= 0
      ? Math.min(0.25, Math.max(0, (nowMs - this.lastBillboardUpdateMs) / 1000))
      : 0;
    const billboardDeltaSec = Math.min(
      0.25,
      this.pendingBillboardDeltaSec > 0 ? this.pendingBillboardDeltaSec : fallbackWallClockDt,
    );
    this.pendingBillboardDeltaSec = 0;
    this.lastBillboardUpdateMs = nowMs;

    const matrix = this.scratchMatrix;
    this.camera.getWorldDirection(this.scratchCameraDir);
    const cameraAngle = Math.atan2(this.scratchCameraDir.x, this.scratchCameraDir.z);

    const impostorWriteStart = performance.now();
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

      if (
        combatant.isDying
        && combatant.deathProgress !== undefined
        && shouldApplyLegacyImpostorDeathTransform(clipId)
      ) {
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
      const viewTile = this.getImpostorViewTile(combatant);
      const impostorPhase = this.computeVelocityKeyedImpostorPhase(combatant, clipId, billboardDeltaSec);
      setPixelForgeNpcImpostorAttributes(
        mesh,
        index,
        impostorPhase,
        viewTile.column,
        viewTile.row,
        impostorAnimationProgress,
        deathOpacity,
        false,
      );
      this.dirtyImpostorAttributeBuckets.add(key);
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
    profile.impostorWriteMs = performance.now() - impostorWriteStart;

    const finalizeStart = performance.now();
    this.factionMeshes.forEach((mesh, key) => {
      const written = this.renderWriteCounts.get(key) ?? 0;
      const previousCount = mesh.count;
      mesh.count = written;
      mesh.visible = written > 0;
      if (written > 0 || previousCount !== written) {
        markInstancedMatrixDirty(mesh, written);
      }
      if (written > 0 && this.dirtyImpostorAttributeBuckets.has(key)) {
        markPixelForgeNpcImpostorAttributesDirty(mesh, written);
      }
      const outlineMesh = this.factionAuraMeshes.get(key);
      if (outlineMesh) {
        const previousOutlineCount = outlineMesh.count;
        outlineMesh.count = written;
        outlineMesh.visible = written > 0;
        if (written > 0 || previousOutlineCount !== written) {
          markInstancedMatrixDirty(outlineMesh, written);
        }
      }
      const markerMesh = this.factionGroundMarkers.get(key);
      if (markerMesh) {
        const previousMarkerCount = markerMesh.count;
        markerMesh.count = written;
        markerMesh.visible = written > 0;
        if (written > 0 || previousMarkerCount !== written) {
          markInstancedMatrixDirty(markerMesh, written);
        }
      }
      const outlineMaterial = this.factionMaterials.get(key);
      if (outlineMaterial?.uniforms?.combatState) {
        outlineMaterial.uniforms.combatState.value = this.renderCombatStates.get(key) ?? 0;
      }
    });
    profile.finalizeMs = performance.now() - finalizeStart;

    const hitboxDebugStart = performance.now();
    this.updateHitboxDebugOverlay(combatants, playerPosition);
    profile.hitboxDebugMs = performance.now() - hitboxDebugStart;
    const materializationEventsStart = performance.now();
    this.emitMaterializationTierTransitions(combatants, playerPosition);
    profile.materializationEventsMs = performance.now() - materializationEventsStart;
    this.lastBillboardUpdateProfile = profile;
  }

  /**
   * Phase F slice 6 (tier-transition events): walk every combatant in the
   * current frame's view, compare its render mode to the previous frame's
   * recorded mode, and emit `materialization_tier_changed` on diff. Also
   * prunes entries for combatants that have been removed since last frame
   * so the diff map stays bounded.
   *
   * Cost is one Map lookup per combatant per frame plus event-bus emit on
   * transitions only. The event bus batches and flushes at end-of-frame, so
   * emitting here adds no synchronous fan-out cost to subscribers.
   */
  private emitMaterializationTierTransitions(
    combatants: Map<string, Combatant>,
    playerPosition: THREE.Vector3,
  ): void {
    const seen = this.materializationSeenIds;
    seen.clear();
    combatants.forEach((combatant) => {
      const id = combatant.id;
      seen.add(id);
      const hasCloseModel = this.activeCloseModels.has(id);
      const billboardIndex = typeof combatant.billboardIndex === 'number' ? combatant.billboardIndex : null;
      const currentRenderMode: CombatantMaterializationRenderMode = hasCloseModel
        ? 'close-glb'
        : billboardIndex !== null && billboardIndex >= 0
          ? 'impostor'
          : 'culled';
      // Mirror the current renderer decision onto the combatant. `silhouette`
      // and `cluster` are reserved for the v2 budget arbiter
      // (cycle-2026-05-13 R2/R4) and not emitted here. Pure-rename slice
      // (konveyer-materialization-lane-rename) preserves today's behavior.
      combatant.renderLane = currentRenderMode;
      const previous = this.previousRenderModes.get(id) ?? null;
      if (previous === currentRenderMode) return;

      const fallback = this.closeModelFallbackRecords.get(id);
      const distanceMeters = combatant.position.distanceTo(playerPosition);
      const reason: string = (() => {
        if (currentRenderMode === 'close-glb') return 'close-glb:active';
        if (currentRenderMode === 'impostor') {
          if (fallback?.reason) return `impostor:${fallback.reason}`;
          if (distanceMeters > getPixelForgeNpcCloseModelDistanceMeters()) return 'impostor:beyond-close-radius';
          return 'impostor:not-prioritized';
        }
        if (combatant.simLane === 'culled') return 'culled:lod-culled';
        return 'culled:no-billboard';
      })();

      GameEventBus.emit('materialization_tier_changed', {
        combatantId: id,
        fromRender: previous,
        toRender: currentRenderMode,
        reason,
        distanceMeters,
      });
      this.previousRenderModes.set(id, currentRenderMode);
    });
    // Prune entries for combatants no longer present this frame.
    if (this.previousRenderModes.size > seen.size) {
      this.previousRenderModes.forEach((_value, id) => {
        if (!seen.has(id)) {
          this.previousRenderModes.delete(id);
          this.stableHashByCombatantId.delete(id);
        }
      });
    }
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
      this.disposeCloseModelInstance(instance);
    });
    this.activeCloseModels.clear();
    this.closeModelPools.forEach((pool) => {
      for (const instance of pool) {
        this.disposeCloseModelInstance(instance);
      }
    });
    this.closeModelPools.clear();
    this.closeModelPoolLoads.clear();
    this.closeModelPoolTargets.clear();
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
