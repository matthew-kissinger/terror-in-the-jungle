// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  /**
   * Simulation lane. Renamed 2026-05-13 from `lodLevel`. Drives AI/movement
   * cadence and update-cap accounting. Values preserve previous semantics:
   * - `high`: full AI tick, every-frame movement, terrain raycast budget.
   * - `medium`: simplified AI, dynamic-interval scheduling.
   * - `low`: basic kinematic update, no combat AI.
   * - `culled`: no update on the close cadence; distant-sim or noop.
   */
  simLane: 'high' | 'medium' | 'low' | 'culled';
  /**
   * Render lane assigned by the materialization pipeline. Added 2026-05-13
   * alongside the `lodLevel`->`simLane` rename so the v2 budget arbiter has
   * a separate write surface for render decisions:
   * - `close-glb`: animated Pixel Forge GLB instance.
   * - `impostor`: crop-atlas billboard (current default for visible NPCs).
   * - `silhouette`: low-detail billboard (not yet emitted; reserved for R2).
   * - `cluster`: squad-shaped scene proxy (not yet emitted; reserved for R4).
   * - `culled`: no draw this frame.
   */
  renderLane: 'close-glb' | 'impostor' | 'silhouette' | 'cluster' | 'culled';
  distanceSq?: number;
  isObjectiveFocused?: boolean;
  isRejoiningSquad?: boolean;
  /**
   * Wall-clock timestamp (performance.now()) when this combatant last entered
   * the rejoining-squad state. Cleared when the rejoin completes or the
   * watchdog timeout fires (NpcLodConfig.rejoinTimeoutMs). See
   * docs/tasks/npc-unfreeze-and-stuck.md.
   */
  rejoinStartedAtMs?: number;
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
  /**
   * Accumulated ms of contour-stall (contour-activated + low-progress).
   * Used by the terrain solver to detect oscillation around a navmesh
   * waypoint that points across un-traversable terrain. When the accumulator
   * crosses {@code CONTOUR_STALL_REROUTE_MS}, the cached navmesh path is
   * invalidated so the next tick fetches a route that accounts for the
   * obstacle. Reset to 0 on meaningful progress or when contour disengages.
   */
  movementContourStallMs?: number;
  /**
   * Wall-clock timestamp (performance.now()) until which the cached
   * {@code movementContourSign} may be reused without re-scoring left/right
   * contour candidates. Contour re-scoring is the dominant per-tick terrain
   * sampling cost for a stalled NPC; while an NPC stays contour-blocked the
   * chosen side is stable, so the score is cached for a short window and the
   * contour direction is rebuilt from the (freshly sampled) support normal.
   * See {@code NPC_CONTOUR_RESCORE_INTERVAL_MS}.
   */
  movementContourRescoreAtMs?: number;
  /**
   * Set by the terrain solver when this high-LOD NPC was contour-stalled inside
   * a friendly crowd, requesting that the next movement tick coast (skip the
   * spacing query + terrain-aware solve) to halve its worst-case per-frame
   * cost. Only consulted when {@code NpcLodConfig.crowdStallStaggerEnabled} is
   * on (default off). Cleared after the skipped tick.
   */
  movementStaggerSkipNext?: boolean;
  vehicleId?: string;
  vehicleSeatIndex?: number;
}

export enum SquadCommand {
  FOLLOW_ME = 'follow_me',
  PATROL_HERE = 'patrol_here',
  ATTACK_HERE = 'attack_here',
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
  /**
   * Persistence-leash radius (metres) resolved at command-issue time from
   * `SquadCommandConfig` per order type (HOLD/ATTACK/PATROL). Used by the
   * acquisition leash gate (SVYAZ-4 Stage 2) so a standing order survives
   * contact: the squad engages threats near `commandPosition` but will not
   * chase a bait enemy past `leashRadius + engageBandPastLeash`. Undefined for
   * non-leashed orders (FOLLOW / FALL BACK / STAND DOWN / none); the gate then
   * falls back to the live config value for the order type.
   */
  commandLeashRadius?: number;
  /**
   * Wall-clock timestamp (performance.now()) when the leader was first
   * observed idle. Cleared when the leader starts moving again. Followers
   * use this to escape leader-idle deadlock after NpcLodConfig.squadFollowStaleMs.
   */
  leaderIdleSinceMs?: number;
}

export enum GrenadeType {
  FRAG = 'frag',
  SMOKE = 'smoke',
  FLASHBANG = 'flashbang'
}
