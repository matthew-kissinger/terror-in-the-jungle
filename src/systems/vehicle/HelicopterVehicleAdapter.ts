import * as THREE from 'three';
import type { IVehicle, VehicleSeat, SeatRole, VehicleCategory } from './IVehicle';
import type { HelicopterModel } from '../helicopter/HelicopterModel';
import type { Faction } from '../combat/types';
import { getAircraftConfig } from '../helicopter/AircraftConfigs';

/**
 * Adapts an existing HelicopterModel helicopter instance into the IVehicle interface.
 * Does not own the helicopter - just bridges the existing system to the abstraction.
 */
export class HelicopterVehicleAdapter implements IVehicle {
  readonly vehicleId: string;
  readonly category: VehicleCategory = 'helicopter';
  readonly faction: Faction;

  private helicopterModel: HelicopterModel;
  private seats: VehicleSeat[];

  // Scratch vectors to avoid per-call allocation
  private _pos = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _vel = new THREE.Vector3();

  constructor(
    vehicleId: string,
    aircraftKey: string,
    faction: Faction,
    helicopterModel: HelicopterModel,
  ) {
    this.vehicleId = vehicleId;
    this.faction = faction;
    this.helicopterModel = helicopterModel;

    // Build seats from aircraft config
    const config = getAircraftConfig(aircraftKey);
    this.seats = [];
    // Seat 0 is always the pilot
    this.seats.push({
      index: 0,
      role: 'pilot',
      occupantId: null,
      localOffset: new THREE.Vector3(0, 0.5, 1),
      exitOffset: new THREE.Vector3(-2, 0, 0),
    });
    // Additional seats for passengers/gunners
    for (let i = 1; i < config.seats; i++) {
      const hasWeapon = config.weapons.some(
        (w, wi) => w.firingMode === 'crew' && wi === i - 1,
      );
      this.seats.push({
        index: i,
        role: hasWeapon ? 'gunner' : 'passenger',
        occupantId: null,
        localOffset: new THREE.Vector3(i % 2 === 0 ? -1 : 1, 0.3, -0.5 * i),
        exitOffset: new THREE.Vector3(i % 2 === 0 ? -3 : 3, 0, 0),
        weaponMountIndex: hasWeapon ? i - 1 : undefined,
      });
    }
  }

  getSeats(): readonly VehicleSeat[] {
    return this.seats;
  }

  enterVehicle(occupantId: string, preferredRole?: SeatRole): number | null {
    // Find a free seat matching the preferred role, or any free seat
    let seat: VehicleSeat | undefined;

    if (preferredRole) {
      seat = this.seats.find(s => s.role === preferredRole && s.occupantId === null);
    }
    if (!seat) {
      seat = this.seats.find(s => s.occupantId === null);
    }

    if (!seat) return null;
    seat.occupantId = occupantId;
    return seat.index;
  }

  exitVehicle(occupantId: string): THREE.Vector3 | null {
    const seat = this.seats.find(s => s.occupantId === occupantId);
    if (!seat) return null;

    seat.occupantId = null;

    // Compute exit position in world space
    const exitPos = seat.exitOffset.clone();
    const pos = this.getPosition();
    const quat = this.getQuaternion();
    exitPos.applyQuaternion(quat).add(pos);

    return exitPos;
  }

  getOccupant(seatIndex: number): string | null {
    return this.seats[seatIndex]?.occupantId ?? null;
  }

  getPilotId(): string | null {
    const pilotSeat = this.seats.find(s => s.role === 'pilot');
    return pilotSeat?.occupantId ?? null;
  }

  hasFreeSeats(role?: SeatRole): boolean {
    if (role) {
      return this.seats.some(s => s.role === role && s.occupantId === null);
    }
    return this.seats.some(s => s.occupantId === null);
  }

  getPosition(): THREE.Vector3 {
    this.helicopterModel.getHelicopterPositionTo(this.vehicleId, this._pos);
    return this._pos;
  }

  getQuaternion(): THREE.Quaternion {
    this.helicopterModel.getHelicopterQuaternionTo(this.vehicleId, this._quat);
    return this._quat;
  }

  getVelocity(): THREE.Vector3 {
    // Estimate from flight data
    const flightData = this.helicopterModel.getFlightData(this.vehicleId);
    if (flightData) {
      const headingRad = (flightData.heading * Math.PI) / 180;
      this._vel.set(
        Math.sin(headingRad) * flightData.airspeed,
        flightData.verticalSpeed,
        Math.cos(headingRad) * flightData.airspeed,
      );
    } else {
      this._vel.set(0, 0, 0);
    }
    return this._vel;
  }

  isDestroyed(): boolean {
    return this.helicopterModel.isHelicopterDestroyed(this.vehicleId);
  }

  getHealthPercent(): number {
    return this.helicopterModel.getHealthPercent(this.vehicleId);
  }

  update(_dt: number): void {
    // No-op: HelicopterModel handles its own updates
  }

  dispose(): void {
    // Clear seat occupants
    for (const seat of this.seats) {
      seat.occupantId = null;
    }
  }
}
