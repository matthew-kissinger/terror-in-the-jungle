import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import type { IVehicle, VehicleCategory } from './IVehicle';

// Scratch vector for distance calculations
const _diff = new THREE.Vector3();

export class VehicleManager implements GameSystem {
  private vehicles: Map<string, IVehicle> = new Map();

  async init(): Promise<void> {
    Logger.debug('vehicle', 'Initializing Vehicle Manager...');
  }

  register(vehicle: IVehicle): void {
    if (this.vehicles.has(vehicle.vehicleId)) {
      Logger.warn('vehicle', `Vehicle ${vehicle.vehicleId} already registered`);
      return;
    }
    this.vehicles.set(vehicle.vehicleId, vehicle);
  }

  unregister(vehicleId: string): void {
    this.vehicles.delete(vehicleId);
  }

  getVehicle(vehicleId: string): IVehicle | null {
    return this.vehicles.get(vehicleId) ?? null;
  }

  getVehiclesInRadius(center: THREE.Vector3, radius: number): IVehicle[] {
    const result: IVehicle[] = [];
    const radiusSq = radius * radius;
    for (const vehicle of this.vehicles.values()) {
      _diff.subVectors(vehicle.getPosition(), center);
      if (_diff.lengthSq() <= radiusSq) {
        result.push(vehicle);
      }
    }
    return result;
  }

  getVehiclesByCategory(category: VehicleCategory): IVehicle[] {
    const result: IVehicle[] = [];
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.category === category) {
        result.push(vehicle);
      }
    }
    return result;
  }

  getVehicleByOccupant(occupantId: string): IVehicle | null {
    for (const vehicle of this.vehicles.values()) {
      for (const seat of vehicle.getSeats()) {
        if (seat.occupantId === occupantId) {
          return vehicle;
        }
      }
    }
    return null;
  }

  /**
   * Convenience lookup the GroundVehiclePlayerAdapter (and sibling
   * ground-vehicle wiring) uses to resolve the player's active jeep
   * without scanning every vehicle category. Returns null when the
   * occupant is not seated in a ground vehicle.
   */
  getGroundVehicleByOccupant(occupantId: string): IVehicle | null {
    const v = this.getVehicleByOccupant(occupantId);
    return v && v.category === 'ground' ? v : null;
  }

  getAllVehicles(): IVehicle[] {
    return Array.from(this.vehicles.values());
  }

  getVehicleCount(): number {
    return this.vehicles.size;
  }

  update(deltaTime: number): void {
    // Helicopters and fixed-wing aircraft are stepped by their own dedicated
    // systems (HelicopterModel / FixedWingModel); their IVehicle adapters
    // implement update() as a no-op so this dispatch is safe to fan out
    // across every registered vehicle. Ground vehicles own their physics step
    // here because they have no parallel manager. See
    // docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md.
    for (const vehicle of this.vehicles.values()) {
      vehicle.update(deltaTime);
    }
  }

  dispose(): void {
    this.vehicles.clear();
  }
}
