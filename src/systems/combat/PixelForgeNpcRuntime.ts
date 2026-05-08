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

export const PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS = 64;
export const PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_SQ =
  PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS * PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS;
export const PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP = 8;
export const PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION = PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP;
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
