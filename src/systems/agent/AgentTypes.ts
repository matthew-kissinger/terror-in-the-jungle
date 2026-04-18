/**
 * Agent/player API — typed action and observation layer.
 *
 * See docs/rearch/E4-agent-player-api.md (on spike/E4-agent-player-api branch)
 * for the design memo. This module lets an external agent drive a
 * player-equivalent character via structured intent instead of keystroke
 * emulation. No changes to `src/types/SystemInterfaces.ts` (the fenced
 * interfaces); all types here are new and structural.
 */

import type { Faction } from '../combat/types';

export type AgentEntityId = string;

export type CommandRejectionReason =
  | 'rejected_controls_disabled'
  | 'rejected_in_vehicle'
  | 'rejected_not_in_vehicle'
  | 'rejected_invalid_target'
  | 'rejected_stabilization_window'
  | 'rejected_cooldown'
  | 'rejected_player_dead'
  | 'rejected_no_observation'
  | 'rejected_target_out_of_range';

export interface CommandHandle {
  readonly id: number;
  readonly accepted: boolean;
  readonly reason?: CommandRejectionReason;
}

/** Plain-object 3-vector kept serializable. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type AgentStance = 'walk' | 'sprint' | 'crouch';
export type AgentFireMode = 'single' | 'burst' | 'hold';

/** Discriminated union of agent actions dispatched by `AgentController.apply`. */
export type AgentAction =
  | { kind: 'move-to'; target: Vec3; stance?: AgentStance; tolerance?: number }
  | { kind: 'stop-moving' }
  | { kind: 'face-bearing'; yawRad: number; pitchRad?: number }
  | { kind: 'look-at'; target: Vec3 }
  | { kind: 'fire-at'; target: AgentEntityId | Vec3; mode: AgentFireMode }
  | { kind: 'cease-fire' }
  | { kind: 'reload' }
  | { kind: 'take-cover'; coverId: AgentEntityId }
  | { kind: 'enter-vehicle'; vehicleId?: AgentEntityId }
  | { kind: 'exit-vehicle' }
  | { kind: 'call-support'; supportKind: 'rally' | 'airstrike' | 'mortar' | 'resupply'; target?: Vec3 };

export interface OwnStateSnapshot {
  position: Vec3;
  velocity: Vec3;
  yawRad: number;
  pitchRad: number;
  healthAbs: number;
  healthFrac: number;
  ammoInMag: number;
  ammoReserve: number;
  stance: 'standing' | 'crouching';
  isRunning: boolean;
  isGrounded: boolean;
  isDead: boolean;
  inVehicle: { id: AgentEntityId; type: 'helicopter' | 'fixed_wing' | 'ground' } | null;
  faction: Faction;
}

export interface VisibleEntity {
  id: AgentEntityId;
  kind: 'combatant' | 'vehicle' | 'cover' | 'objective';
  faction?: Faction;
  position: Vec3;
  velocity?: Vec3;
  healthFrac?: number;
  /** Horizontal meters from own position. */
  distance: number;
  /** Signed angle relative to own yaw, in radians. Positive is right. */
  bearingRad: number;
}

export interface ObjectiveSnapshot {
  id: AgentEntityId;
  kind: 'zone' | 'homebase' | 'rally';
  position: Vec3;
  radius: number;
  owner: Faction | 'contested' | 'neutral';
  captureProgress: number;
}

export interface AgentObservation {
  tick: number;
  timeMs: number;
  ownState: OwnStateSnapshot;
  /** Bounded by AgentPerception.maxVisibleEntities. */
  visibleEntities: VisibleEntity[];
  objectives: ObjectiveSnapshot[];
}

export interface AgentPerception {
  visionRangeM: number;
  visionConeRad: number;
  maxVisibleEntities: number;
}

export const DEFAULT_PERCEPTION: AgentPerception = {
  visionRangeM: 220,
  visionConeRad: Math.PI,
  maxVisibleEntities: 48,
};

export function rejectedHandle(id: number, reason: CommandRejectionReason): CommandHandle {
  return { id, accepted: false, reason };
}

export function acceptedHandle(id: number): CommandHandle {
  return { id, accepted: true };
}
