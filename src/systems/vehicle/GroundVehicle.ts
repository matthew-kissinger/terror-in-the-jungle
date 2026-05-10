import * as THREE from 'three';
import { Faction } from '../combat/types';
import { GroundVehicleModels } from '../assets/modelPaths';
import type { IVehicle, SeatRole, VehicleSeat } from './IVehicle';

const DEFAULT_M151_SEATS: VehicleSeat[] = [
  { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(-0.35, 0.8, 0.35), exitOffset: new THREE.Vector3(-2, 0, 0) },
  { index: 1, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.35, 0.8, 0.35), exitOffset: new THREE.Vector3(2, 0, 0) },
  { index: 2, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(-0.35, 0.8, -0.45), exitOffset: new THREE.Vector3(-2, 0, -1.5) },
  { index: 3, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.35, 0.8, -0.45), exitOffset: new THREE.Vector3(2, 0, -1.5) },
];

export function isM151ModelPath(modelPath: string): boolean {
  return modelPath === GroundVehicleModels.M151_JEEP;
}

export class GroundVehicle implements IVehicle {
  readonly category = 'ground' as const;
  readonly faction: Faction;
  private readonly seats: VehicleSeat[];
  private readonly velocity = new THREE.Vector3();
  private destroyed = false;

  constructor(
    readonly vehicleId: string,
    private readonly object: THREE.Object3D,
    faction: Faction = Faction.US,
    seats: VehicleSeat[] = DEFAULT_M151_SEATS,
  ) {
    this.faction = faction;
    this.seats = seats.map((seat) => ({
      ...seat,
      localOffset: seat.localOffset.clone(),
      exitOffset: seat.exitOffset.clone(),
    }));
  }

  getSeats(): readonly VehicleSeat[] {
    return this.seats;
  }

  enterVehicle(occupantId: string, preferredRole?: SeatRole): number | null {
    const seat = this.seats.find(candidate =>
      candidate.occupantId === null && (!preferredRole || candidate.role === preferredRole)
    ) ?? this.seats.find(candidate => candidate.occupantId === null);

    if (!seat) return null;
    seat.occupantId = occupantId;
    return seat.index;
  }

  exitVehicle(occupantId: string): THREE.Vector3 | null {
    const seat = this.seats.find(candidate => candidate.occupantId === occupantId);
    if (!seat) return null;
    seat.occupantId = null;
    return this.getPosition().add(seat.exitOffset);
  }

  getOccupant(seatIndex: number): string | null {
    return this.seats[seatIndex]?.occupantId ?? null;
  }

  getPilotId(): string | null {
    return this.seats.find(seat => seat.role === 'pilot')?.occupantId ?? null;
  }

  hasFreeSeats(role?: SeatRole): boolean {
    return this.seats.some(seat => seat.occupantId === null && (!role || seat.role === role));
  }

  getPosition(): THREE.Vector3 {
    return this.object.getWorldPosition(new THREE.Vector3());
  }

  getQuaternion(): THREE.Quaternion {
    return this.object.getWorldQuaternion(new THREE.Quaternion());
  }

  getVelocity(): THREE.Vector3 {
    return this.velocity.clone();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  getHealthPercent(): number {
    return this.destroyed ? 0 : 1;
  }

  update(_dt: number): void {
    void _dt;
  }

  dispose(): void {
    this.destroyed = true;
    this.object.removeFromParent();
  }
}
