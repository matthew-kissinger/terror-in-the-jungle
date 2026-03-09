import * as THREE from 'three';
import type { Faction } from '../combat/types';

export type VehicleCategory = 'helicopter' | 'fixed_wing' | 'ground' | 'watercraft';
export type SeatRole = 'pilot' | 'gunner' | 'passenger';

export interface VehicleSeat {
  index: number;
  role: SeatRole;
  occupantId: string | null; // combatant ID or 'player'
  localOffset: THREE.Vector3;
  exitOffset: THREE.Vector3;
  weaponMountIndex?: number;
}

export interface IVehicle {
  readonly vehicleId: string;
  readonly category: VehicleCategory;
  readonly faction: Faction;

  // Occupancy
  getSeats(): readonly VehicleSeat[];
  enterVehicle(occupantId: string, preferredRole?: SeatRole): number | null;
  exitVehicle(occupantId: string): THREE.Vector3 | null;
  getOccupant(seatIndex: number): string | null;
  getPilotId(): string | null;
  hasFreeSeats(role?: SeatRole): boolean;

  // State
  getPosition(): THREE.Vector3;
  getQuaternion(): THREE.Quaternion;
  getVelocity(): THREE.Vector3;
  isDestroyed(): boolean;
  getHealthPercent(): number;

  // Lifecycle
  update(dt: number): void;
  dispose(): void;
}
