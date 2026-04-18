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

export interface ITargetable {
  id: string;
  faction: Faction;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  health: number;
  state: CombatantState;
  isDying?: boolean;
  kind?: 'combatant' | 'player';
}

export function isPlayerTarget(target: ITargetable | null | undefined): boolean {
  return !!target && (target.kind === 'player' || target.id === 'PLAYER');
}

export function isTargetAlive(target: ITargetable | null | undefined): boolean {
  return !!target
    && target.health > 0
    && target.state !== CombatantState.DEAD
    && !target.isDying;
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
  DEAD = 'dead',
  BOARDING = 'boarding',
  IN_VEHICLE = 'in_vehicle',
  DISMOUNTING = 'dismounting'
}

export type CombatantMovementIntent =
  | 'route_follow'
  | 'direct_push'
  | 'contour'
  | 'flank_arc'
  | 'cover_hop'
  | 'backtrack'
  | 'hold'

export interface Combatant extends ITargetable {
  id: string;
  faction: Faction;
  position: THREE.Vector3;
  /**
   * Rendered (on-screen) position. Owned by CombatantRenderInterpolator.
   * Lags `position` when logical dt amortization produces large jumps, so
   * low-LOD crowds do not visually teleport. Renderers should consume this
   * when writing instance matrices; fall back to `position` if unset.
   */
  renderedPosition?: THREE.Vector3;
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
  target?: ITargetable | null;
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
  movementIntent?: CombatantMovementIntent;
  movementAnchor?: THREE.Vector3;
  movementLastProgressTimeMs?: number;
  movementLastProgressDistanceSq?: number;
  movementLastGoodPosition?: THREE.Vector3;
  movementBacktrackPoint?: THREE.Vector3;
  movementContourSign?: -1 | 1;
  vehicleId?: string;
  vehicleSeatIndex?: number;
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
