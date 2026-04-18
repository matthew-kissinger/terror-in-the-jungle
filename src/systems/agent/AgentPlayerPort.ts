/**
 * Structural ports AgentController consumes.
 *
 * Loose structural types that the concrete `PlayerController`,
 * `CombatantSystem`, and `ZoneManager` already satisfy. Tests use plain
 * object fakes; production uses the live engine. No imports from
 * `src/types/SystemInterfaces.ts` (see docs/INTERFACE_FENCE.md).
 */

import type { Faction } from '../combat/types';
import type { Vec3 } from './AgentTypes';

/** Three-like vector; `clone()` optional. */
export interface ReadVec3 {
  x: number;
  y: number;
  z: number;
  clone?: () => ReadVec3;
}

export interface PlayerControlPort {
  isPlayerDead(): boolean;
  getPosition(): ReadVec3;
  getVelocity(): ReadVec3;
  getYaw(): number;
  getPitch(): number;
  setViewAngles(yawRad: number, pitchRad: number): void;
  /**
   * Set per-tick movement intent in camera-relative axes.
   *  - `forward`: [-1, 1], positive is along the camera forward.
   *  - `strafe`:  [-1, 1], positive is to the camera right.
   * `{ 0, 0, false }` clears intent and hands control back to keyboard/touch.
   */
  applyMovementIntent(intent: { forward: number; strafe: number; sprint: boolean }): void;
  fireStart(): void;
  fireStop(): void;
  reload(): void;
  isInVehicle(): boolean;
  tryEnterNearbyVehicle(): string | null;
  tryExitVehicle(): boolean;
  getFaction(): Faction;
  getAmmoState(): { magazine: number; reserve: number };
  getHealth(): { hp: number; maxHp: number };
  isGrounded(): boolean;
  isRunning(): boolean;
  isCrouching(): boolean;
}

export interface PortCombatant {
  id: string;
  faction: Faction;
  position: ReadVec3;
  velocity?: ReadVec3;
  health: number;
  maxHealth?: number;
  state?: string;
  isDying?: boolean;
}

export interface CombatantQueryPort {
  getAllCombatants(): readonly PortCombatant[];
  getCombatantById(id: string): PortCombatant | null;
}

export interface PortZone {
  id: string;
  isHomeBase?: boolean;
  owner: Faction | 'contested' | 'neutral';
  position: ReadVec3;
  radius: number;
  captureProgress?: number;
}

export interface ZoneQueryPort {
  getZones(): readonly PortZone[];
}

export interface AgentControllerDeps {
  player: PlayerControlPort;
  combatants: CombatantQueryPort;
  zones?: ZoneQueryPort;
  now?: () => number;
}

export function toVec3Copy(v: ReadVec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}
