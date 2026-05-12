import * as THREE from 'three';
import {
  PIXEL_FORGE_NPC_FACTIONS,
  type PixelForgeNpcClipId,
  type PixelForgeNpcFactionAsset,
} from '../../config/pixelForgeAssets';
import { Combatant, CombatantState, Faction, isBlufor } from './types';

export type PixelForgeNpcPoolKey = Faction | 'SQUAD';
export type PixelForgeNpcWeaponId = 'm16a1' | 'ak47';

export interface PixelForgeNpcWeaponRuntimeConfig {
  id: PixelForgeNpcWeaponId;
  modelPath: string;
  lengthMeters: number;
  gripNames: string[];
  supportNames: string[];
  muzzleNames: string[];
  stockNames: string[];
  pitchTrimDeg: number;
  forwardHold: number;
  gripOffset: number;
  socketMode: 'shouldered-forward';
}

export interface PixelForgeNpcFactionRuntimeConfig {
  runtimeFaction: Faction;
  packageFaction: PixelForgeNpcFactionAsset['packageFaction'];
  modelPath: string;
  rightHandSocket: 'RightHand';
  leftHandSocket: 'LeftHand';
  weapon: PixelForgeNpcWeaponRuntimeConfig;
}

export interface PixelForgeNpcImposterMaterialTuning {
  readabilityStrength: number;
  npcExposure: number;
  minNpcLight: number;
  npcTopLight: number;
  horizontalCropExpansion: number;
  parityScale: number;
  parityLift: number;
  paritySaturation: number;
}

/**
 * Runtime-mutable Pixel Forge impostor / close-model distance + selection config.
 *
 * The values here are intentionally writable so the live tuning panel and
 * future LOD work can adjust them without touching constant exports. The
 * "constant" exports below remain for callers that read once at startup, but
 * new consumers should prefer `getPixelForgeNpcCloseModelDistanceMeters()`
 * and friends so changes from the tuning panel take effect immediately.
 *
 * Close-model materialization policy (Phase F slice 1):
 * - Steady-state cap is `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP` active GLBs.
 * - A `hardNearReserve*` bubble around the player allows a bounded number of
 *   extra GLBs when the cluster inside that bubble overflows the steady cap.
 * - The trigger is real-time density (every-frame distance check), not a
 *   spawn-time snapshot. The legacy name "spawn-residency" was misleading;
 *   the policy serves any dense cluster (spawn, contested objective, midgame
 *   firefight), not only the first reveal.
 * - Beyond the reserve, additional close-radius actors render as impostors.
 *   That is the designed materialization tier, not a failure: capping close
 *   GLBs preserves frame budget at high combatant counts.
 */
export const PixelForgeNpcDistanceConfig = {
  /** Radius (meters) within which an NPC is eligible to render as a 3D close model. */
  closeModelDistanceMeters: 120,
  /**
   * Hard-near bubble where turn-pop is more damaging than spending a close
   * slot on a currently off-screen actor.
   */
  hardNearDistanceMeters: 32,
  /** Priority boost for actors inside `hardNearDistanceMeters`. */
  hardNearWeight: 20,
  /**
   * Hard-near cluster reserve bubble (meters). Actors inside this radius are
   * counted toward the cluster-density signal that lifts the close-model cap.
   * Replaces the former `spawnResidencyDistanceMeters`; the bubble is
   * evaluated every frame, not at spawn time.
   */
  hardNearReserveDistanceMeters: 64,
  /**
   * Maximum extra close-model slots available when the hard-near cluster
   * overflows `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP`. Scales effective cap
   * from the steady value up to `TOTAL_CAP + hardNearReserveExtraCap`.
   */
  hardNearReserveExtraCap: 6,
  /** Priority boost for actors inside the hard-near reserve bubble. */
  hardNearReserveWeight: 12,
  /**
   * Priority boost for combatants in active combat (ENGAGING / SUPPRESSING /
   * ADVANCING). Phase F budget arbiter v1: an actor currently shooting or
   * being shot at should render as a close GLB even when distance priority
   * alone would relegate it to impostor. Sized between `squadWeight` (4) and
   * `onScreenWeight` (10) so it composes naturally with the other priority
   * terms without dominating the hard-near reserve.
   */
  inActiveCombatWeight: 8,
  /** Selection priority weight for combatants whose AABB lies inside the camera frustum. */
  onScreenWeight: 10,
  /** Selection priority weight for combatants in the player's squad. */
  squadWeight: 4,
  /** Selection priority weight for the inverse-distance term. */
  distanceWeight: 1,
  /** Selection priority weight for combatants seen on-screen within `recentlyVisibleMs`. */
  recentlyVisibleWeight: 0.5,
  /** Debounce window (ms) to avoid rapid swap thrash when a combatant flickers off-screen. */
  recentlyVisibleMs: 800,
  /**
   * Velocity-squared threshold below which an impostor holds its idle frame.
   * Roughly (0.2 m/s)^2.
   */
  idleVelocitySq: 0.04,
  /** Frames advanced per meter of horizontal travel (~1 cycle every 0.6 m). */
  framesPerMeter: 1 / 0.6,
};

export function getPixelForgeNpcCloseModelDistanceMeters(): number {
  return PixelForgeNpcDistanceConfig.closeModelDistanceMeters;
}

export function getPixelForgeNpcCloseModelDistanceSq(): number {
  const meters = PixelForgeNpcDistanceConfig.closeModelDistanceMeters;
  return meters * meters;
}

/**
 * @deprecated Read `getPixelForgeNpcCloseModelDistanceMeters()` so tuning-panel
 * edits take effect at runtime. Retained for callers that snapshot at startup.
 */
export const PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS =
  PixelForgeNpcDistanceConfig.closeModelDistanceMeters;
/**
 * @deprecated Read `getPixelForgeNpcCloseModelDistanceSq()` so tuning-panel
 * edits take effect at runtime.
 */
export const PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_SQ =
  PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS * PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS;
export const PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP = 8;
/**
 * Maximum extra close-model slots above `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP`
 * granted when the hard-near cluster around the player overflows the steady
 * cap. The effective cap therefore ranges from `TOTAL_CAP` up to
 * `TOTAL_CAP + HARD_NEAR_RESERVE_EXTRA_CAP`. This replaces the former
 * `*_SPAWN_RESIDENCY_EXTRA_CAP` constant (kept as a deprecated alias for
 * one cycle) and serves any dense close-range cluster, not only the first
 * reveal.
 */
export const PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP = 6;
/** @deprecated Use `PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP`. */
export const PIXEL_FORGE_NPC_CLOSE_MODEL_SPAWN_RESIDENCY_EXTRA_CAP =
  PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP;
export const PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION =
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP + PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP;
export const PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION = 4;
export const PIXEL_FORGE_NPC_CLOSE_MODEL_TOP_UP_BATCH = 2;
export const PIXEL_FORGE_NPC_CLOSE_MODEL_LAZY_LOAD_FLAG = '__TIJ_ALLOW_NPC_CLOSE_MODEL_LAZY_LOAD__';

export const PIXEL_FORGE_NPC_WEAPONS: Record<PixelForgeNpcWeaponId, PixelForgeNpcWeaponRuntimeConfig> = {
  m16a1: {
    id: 'm16a1',
    modelPath: 'weapons/m16a1.glb',
    lengthMeters: 0.99,
    gripNames: ['Joint_PistolGrip', 'Mesh_GripBody', 'Mesh_TriggerGuardBottom', 'Mesh_LowerReceiver'],
    supportNames: ['Mesh_HandguardBotL', 'Mesh_HandguardBotR', 'Mesh_HandguardTop', 'Mesh_DeltaRing'],
    muzzleNames: ['Mesh_FlashHider', 'Mesh_Barrel', 'Mesh_FrontSightPost'],
    stockNames: ['Mesh_StockButt', 'Mesh_Buttplate', 'Mesh_StockTube'],
    pitchTrimDeg: 5,
    forwardHold: 0.11,
    gripOffset: 0,
    socketMode: 'shouldered-forward',
  },
  ak47: {
    id: 'ak47',
    modelPath: 'weapons/ak47.glb',
    lengthMeters: 0.9,
    gripNames: ['Mesh_PistolGrip', 'Mesh_TriggerGuardBot', 'Mesh_Receiver'],
    supportNames: ['Mesh_LowerHandguard', 'Mesh_UpperHandguard', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_MuzzleBrake', 'Mesh_FrontSightPost', 'Mesh_Barrel'],
    stockNames: ['Mesh_ButtPad', 'Mesh_Stock', 'Mesh_StockComb'],
    pitchTrimDeg: 5,
    forwardHold: 0.11,
    gripOffset: 0,
    socketMode: 'shouldered-forward',
  },
};

const RUNTIME_FACTION_VALUES: Record<PixelForgeNpcFactionAsset['runtimeFaction'], Faction> = {
  US: Faction.US,
  ARVN: Faction.ARVN,
  NVA: Faction.NVA,
  VC: Faction.VC,
};

export const PIXEL_FORGE_NPC_RUNTIME_FACTIONS: readonly PixelForgeNpcFactionRuntimeConfig[] =
  PIXEL_FORGE_NPC_FACTIONS.map((faction) => ({
    runtimeFaction: RUNTIME_FACTION_VALUES[faction.runtimeFaction],
    packageFaction: faction.packageFaction,
    modelPath: faction.modelPath,
    rightHandSocket: 'RightHand',
    leftHandSocket: 'LeftHand',
    weapon: PIXEL_FORGE_NPC_WEAPONS[faction.primaryWeapon],
  }));

const RUNTIME_FACTION_BY_POOL_KEY = new Map<PixelForgeNpcPoolKey, PixelForgeNpcFactionRuntimeConfig>();
for (const faction of PIXEL_FORGE_NPC_RUNTIME_FACTIONS) {
  RUNTIME_FACTION_BY_POOL_KEY.set(faction.runtimeFaction, faction);
}
RUNTIME_FACTION_BY_POOL_KEY.set('SQUAD', RUNTIME_FACTION_BY_POOL_KEY.get(Faction.US)!);

export const PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING: Partial<
  Record<PixelForgeNpcFactionAsset['packageFaction'], Record<string, number>>
> = {
  usArmy: {
    uniform: 0x748662,
    trousers: 0x617257,
    headgear: 0x8a946f,
    accent: 0x4d8fd8,
  },
  arvn: {
    uniform: 0x6f8468,
    trousers: 0x5c7059,
    headgear: 0x8e9973,
    accent: 0x38b8a8,
  },
  nva: {
    uniform: 0x77714f,
    trousers: 0x696445,
    headgear: 0x8a815d,
    accent: 0xb24f43,
  },
  vc: {
    uniform: 0x5c4c36,
    trousers: 0x4d422f,
    headgear: 0xc8b98a,
  },
};

export const PIXEL_FORGE_NPC_IMPOSTER_MATERIAL_TUNING: Record<
  PixelForgeNpcFactionAsset['packageFaction'],
  PixelForgeNpcImposterMaterialTuning
> = {
  usArmy: {
    readabilityStrength: 0.38,
    npcExposure: 1.2,
    minNpcLight: 0.92,
    npcTopLight: 0.16,
    horizontalCropExpansion: 1.7,
    parityScale: 1.8,
    parityLift: 0.08,
    paritySaturation: 1.6,
  },
  arvn: {
    readabilityStrength: 0.38,
    npcExposure: 1.2,
    minNpcLight: 0.92,
    npcTopLight: 0.16,
    horizontalCropExpansion: 1.7,
    parityScale: 1.7,
    parityLift: 0.06,
    paritySaturation: 1.25,
  },
  nva: {
    readabilityStrength: 0.38,
    npcExposure: 1.2,
    minNpcLight: 0.92,
    npcTopLight: 0.16,
    horizontalCropExpansion: 1.7,
    parityScale: 1.45,
    parityLift: 0.04,
    paritySaturation: 2.4,
  },
  vc: {
    readabilityStrength: 0.38,
    npcExposure: 1.2,
    minNpcLight: 0.92,
    npcTopLight: 0.16,
    horizontalCropExpansion: 1.7,
    parityScale: 1.75,
    parityLift: 0.06,
    paritySaturation: 2.3,
  },
};

const ROOT_MOTION_STRIPPED_CLIPS = new Set<PixelForgeNpcClipId>([
  'patrol_walk',
  'traverse_run',
  'advance_fire',
  'walk_fight_forward',
]);

export function getPixelForgeNpcRuntimeFaction(poolKey: PixelForgeNpcPoolKey): PixelForgeNpcFactionRuntimeConfig {
  const config = RUNTIME_FACTION_BY_POOL_KEY.get(poolKey);
  if (!config) {
    throw new Error(`Missing Pixel Forge NPC runtime config for ${poolKey}`);
  }
  return config;
}

export function getPixelForgeNpcPoolKey(combatant: Combatant, playerSquadId?: string): PixelForgeNpcPoolKey {
  const isPlayerSquad = combatant.squadId === playerSquadId && isBlufor(combatant.faction);
  return isPlayerSquad ? 'SQUAD' : combatant.faction;
}

export function getPixelForgeNpcRuntimeClip(combatant: Combatant): PixelForgeNpcClipId {
  if (combatant.state === CombatantState.DEAD) {
    return combatant.isDying ? 'death_fall_back' : 'dead_pose';
  }

  switch (combatant.state) {
    case CombatantState.PATROLLING:
      return 'patrol_walk';
    case CombatantState.RETREATING:
    case CombatantState.SEEKING_COVER:
      return 'traverse_run';
    case CombatantState.ENGAGING:
    case CombatantState.SUPPRESSING:
    case CombatantState.ADVANCING:
      return 'walk_fight_forward';
    case CombatantState.BOARDING:
    case CombatantState.IN_VEHICLE:
    case CombatantState.DISMOUNTING:
    case CombatantState.ALERT:
    case CombatantState.DEFENDING:
    case CombatantState.IDLE:
    default:
      return 'idle';
  }
}

export function sanitizePixelForgeNpcAnimationClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const sanitized = clip.clone();
  if (!isPixelForgeLoopClipWithRootMotionPolicy(sanitized.name)) {
    return sanitized;
  }

  sanitized.tracks = sanitized.tracks.map((track) => {
    const cloned = track.clone();
    if (!isHipsPositionTrack(cloned) || cloned.getValueSize() < 3 || cloned.times.length < 2) {
      return cloned;
    }

    const times = cloned.times;
    const values = cloned.values as Float32Array | number[];
    const firstIndex = 0;
    const lastIndex = (times.length - 1) * 3;
    const netX = values[lastIndex] - values[firstIndex];
    const netZ = values[lastIndex + 2] - values[firstIndex + 2];
    const duration = times[times.length - 1] - times[0];
    if (!Number.isFinite(duration) || duration <= 0 || Math.hypot(netX, netZ) < 0.00001) {
      return cloned;
    }

    for (let i = 0; i < times.length; i++) {
      const progress = (times[i] - times[0]) / duration;
      const valueIndex = i * 3;
      values[valueIndex] -= netX * progress;
      values[valueIndex + 2] -= netZ * progress;
    }
    return cloned;
  });

  return sanitized;
}

export function getPixelForgeClipHorizontalNetDisplacement(clip: THREE.AnimationClip): THREE.Vector2 {
  const track = clip.tracks.find(isHipsPositionTrack);
  if (!track || track.getValueSize() < 3 || track.times.length < 2) {
    return new THREE.Vector2(0, 0);
  }
  const values = track.values as Float32Array | number[];
  const firstIndex = 0;
  const lastIndex = (track.times.length - 1) * 3;
  return new THREE.Vector2(
    values[lastIndex] - values[firstIndex],
    values[lastIndex + 2] - values[firstIndex + 2],
  );
}

function isPixelForgeLoopClipWithRootMotionPolicy(value: string): value is PixelForgeNpcClipId {
  return ROOT_MOTION_STRIPPED_CLIPS.has(value as PixelForgeNpcClipId);
}

function isHipsPositionTrack(track: THREE.KeyframeTrack): boolean {
  const normalized = track.name.toLowerCase().replace(/mixamorig:/g, '');
  return /(^|[/.])hips\.position$/.test(normalized);
}
