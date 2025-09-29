import * as THREE from 'three';
import { WeaponSpec, GunplayCore } from '../weapons/GunplayCore';

export enum Faction {
  US = 'US',
  OPFOR = 'OPFOR'
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
  updatePriority: number;
  lodLevel: 'high' | 'medium' | 'low' | 'culled';
  isPlayerProxy?: boolean;
  isObjectiveFocused?: boolean;
  isRejoiningSquad?: boolean;
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
