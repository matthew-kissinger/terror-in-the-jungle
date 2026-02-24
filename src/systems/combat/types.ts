import * as THREE from 'three';
import { WeaponSpec, GunplayCore } from '../weapons/GunplayCore';

export enum Faction {
  US = 'US',
  ARVN = 'ARVN',
  NVA = 'NVA',
  VC = 'VC'
}

export enum Alliance {
  BLUFOR = 'BLUFOR',
  OPFOR = 'OPFOR'
}

const FACTION_ALLIANCE: Record<Faction, Alliance> = {
  [Faction.US]: Alliance.BLUFOR,
  [Faction.ARVN]: Alliance.BLUFOR,
  [Faction.NVA]: Alliance.OPFOR,
  [Faction.VC]: Alliance.OPFOR,
};

export function getAlliance(faction: Faction): Alliance {
  return FACTION_ALLIANCE[faction];
}

export function isAlly(a: Faction, b: Faction): boolean {
  return FACTION_ALLIANCE[a] === FACTION_ALLIANCE[b];
}

export function isEnemy(a: Faction, b: Faction): boolean {
  return FACTION_ALLIANCE[a] !== FACTION_ALLIANCE[b];
}

export function isBlufor(faction: Faction): boolean {
  return FACTION_ALLIANCE[faction] === Alliance.BLUFOR;
}

export function isOpfor(faction: Faction): boolean {
  return FACTION_ALLIANCE[faction] === Alliance.OPFOR;
}

export function getEnemyAlliance(alliance: Alliance): Alliance {
  return alliance === Alliance.BLUFOR ? Alliance.OPFOR : Alliance.BLUFOR;
}

export interface AISkillProfile {
  reactionDelayMs: number;
  aimJitterAmplitude: number;
  burstLength: number;
  burstPauseMs: number;
  leadingErrorFactor: number;
  suppressionResistance: number;
  visualRange: number;
  fieldOfView: number;
  firstShotAccuracy: number;
  burstDegradation: number;
}

export enum CombatantState {
  IDLE = 'idle',
  PATROLLING = 'patrolling',
  ALERT = 'alert',
  ENGAGING = 'engaging',
  SUPPRESSING = 'suppressing',
  ADVANCING = 'advancing',
  RETREATING = 'retreating',
  SEEKING_COVER = 'seeking_cover',
  DEFENDING = 'defending',
  DEAD = 'dead'
}

export interface Combatant {
  id: string;
  faction: Faction;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: number;
  visualRotation: number;
  rotationVelocity: number;
  scale: THREE.Vector3;
  health: number;
  maxHealth: number;
  state: CombatantState;
  previousState?: CombatantState;
  weaponSpec: WeaponSpec;
  gunCore: GunplayCore;
  skillProfile: AISkillProfile;
  lastShotTime: number;
  currentBurst: number;
  burstCooldown: number;
  target?: Combatant | null;
  lastKnownTargetPos?: THREE.Vector3;
  reactionTimer: number;
  suppressionLevel: number;
  alertTimer: number;
  isFullAuto: boolean;
  panicLevel: number;
  lastHitTime: number;
  consecutiveMisses: number;
  squadId?: string;
  squadRole?: 'leader' | 'follower';
  wanderAngle: number;
  timeToDirectionChange: number;
  destinationPoint?: THREE.Vector3;
  currentTexture?: THREE.Texture;
  billboardIndex?: number;
  lastUpdateTime: number;
  lastZoneEvalTime?: number;
  updatePriority: number;
  lodLevel: 'high' | 'medium' | 'low' | 'culled';
  distanceSq?: number;
  isPlayerProxy?: boolean;
  isObjectiveFocused?: boolean;
  isRejoiningSquad?: boolean;
  coverPosition?: THREE.Vector3;
  lastCoverSeekTime?: number;
  inCover?: boolean;
  suppressionTarget?: THREE.Vector3;
  suppressionEndTime?: number;
  lastSuppressedTime?: number;
  nearMissCount?: number;
  isDying?: boolean;
  deathProgress?: number;
  deathStartTime?: number;
  deathDirection?: THREE.Vector3;
  deathAnimationType?: 'fallback' | 'crumple' | 'spinfall' | 'shatter';
  defendingZoneId?: string;
  defensePosition?: THREE.Vector3;
  lastDefenseReassignTime?: number;
  isFlankingMove?: boolean;
  damageHistory?: Array<{ attackerId: string; damage: number; timestamp: number }>;
  kills: number;
  deaths: number;
  flashDisorientedUntil?: number; // Timestamp when flashbang disorientation ends
  terrainSampleX?: number;
  terrainSampleZ?: number;
  terrainSampleHeight?: number;
  terrainSampleTimeMs?: number;
}

export enum SquadCommand {
  FOLLOW_ME = 'follow_me',
  PATROL_HERE = 'patrol_here',
  RETREAT = 'retreat',
  HOLD_POSITION = 'hold_position',
  FREE_ROAM = 'free_roam',
  NONE = 'none'
}

export interface Squad {
  id: string;
  faction: Faction;
  members: string[];
  leaderId?: string;
  objective?: THREE.Vector3;
  formation: 'line' | 'wedge' | 'column';
  isPlayerControlled?: boolean;
  currentCommand?: SquadCommand;
  commandPosition?: THREE.Vector3;
}

export enum GrenadeType {
  FRAG = 'frag',
  SMOKE = 'smoke',
  FLASHBANG = 'flashbang'
}
