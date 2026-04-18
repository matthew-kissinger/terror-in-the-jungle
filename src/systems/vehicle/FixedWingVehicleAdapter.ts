import * as THREE from 'three';
import type { IVehicle, VehicleSeat, SeatRole, VehicleCategory } from './IVehicle';
import type { FixedWingModel } from './FixedWingModel';
import type { Faction } from '../combat/types';
import { getFixedWingDisplayInfo } from './FixedWingConfigs';

/**
 * Adapts a FixedWingModel aircraft instance into the IVehicle interface.
 * Follows the same pattern as HelicopterVehicleAdapter.
 */
export class FixedWingVehicleAdapter implements IVehicle {
  readonly vehicleId: string;
  readonly category: VehicleCategory = 'fixed_wing';
  readonly faction: Faction;

  private fixedWingModel: FixedWingModel;
  private seats: VehicleSeat[];

  private _pos = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _vel = new THREE.Vector3();

  constructor(
    vehicleId: string,
    configKey: string,
    faction: Faction,
    fixedWingModel: FixedWingModel,
  ) {
    this.vehicleId = vehicleId;
    this.faction = faction;
    this.fixedWingModel = fixedWingModel;

    const display = getFixedWingDisplayInfo(configKey);
    const seatCount = display?.seats ?? 1;

    this.seats = [];
    // Seat 0 is always the pilot
    this.seats.push({
      index: 0,
      role: 'pilot',
      occupantId: null,
      localOffset: new THREE.Vector3(0, 0.5, 1),
      exitOffset: new THREE.Vector3(-3, 0, 0),
    });
    for (let i = 1; i < seatCount; i++) {
      this.seats.push({
        index: i,
        role: 'passenger',
        occupantId: null,
        localOffset: new THREE.Vector3(0, 0.3, -0.5 * i),
        exitOffset: new THREE.Vector3(-3, 0, -i),
      });
    }
  }

  getSeats(): readonly VehicleSeat[] {
    return this.seats;
  }

  enterVehicle(occupantId: string, preferredRole?: SeatRole): number | null {
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
    this.fixedWingModel.getAircraftPositionTo(this.vehicleId, this._pos);
    return this._pos;
  }

  getQuaternion(): THREE.Quaternion {
    this.fixedWingModel.getAircraftQuaternionTo(this.vehicleId, this._quat);
    return this._quat;
  }

  getVelocity(): THREE.Vector3 {
    if (!this.fixedWingModel.getAircraftVelocityTo(this.vehicleId, this._vel)) {
      this._vel.set(0, 0, 0);
    }
    return this._vel;
  }

  isDestroyed(): boolean {
    return false; // No health system this pass
  }

  getHealthPercent(): number {
    return 100;
  }

  update(_dt: number): void {
    // No-op: FixedWingModel handles its own updates
  }

  dispose(): void {
    for (const seat of this.seats) {
      seat.occupantId = null;
    }
  }
}
