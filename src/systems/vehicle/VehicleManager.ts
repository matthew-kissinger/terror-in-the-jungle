import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import type { Faction } from '../combat/types';
import type { IVehicle, VehicleCategory } from './IVehicle';
import type {
  M2HBEmplacementSystem,
} from '../combat/weapons/M2HBEmplacement';
import {
  spawnScenarioM2HBEmplacements,
  type M2HBScenarioMode,
} from '../combat/weapons/M2HBEmplacementSpawn';

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

  /**
   * Sibling lookup for the EmplacementPlayerAdapter and the NPC-gunner
   * controller: resolve the active emplacement an occupant is seated
   * on without scanning every category. Returns null when the occupant
   * is not seated in an emplacement.
   */
  getEmplacementByOccupant(occupantId: string): IVehicle | null {
    const v = this.getVehicleByOccupant(occupantId);
    return v && v.category === 'emplacement' ? v : null;
  }

  /**
   * Query unoccupied friendly emplacements within a radius — used by
   * the `emplacement-npc-gunner` sibling task to score "mount this
   * gun" actions. Iteration is O(N) over all vehicles; emplacement
   * counts are tiny (single-digit per scenario) so this is fine.
   */
  getFreeEmplacementsByFaction(faction: Faction, center: THREE.Vector3, radius: number): IVehicle[] {
    const result: IVehicle[] = [];
    const radiusSq = radius * radius;
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.category !== 'emplacement') continue;
      if (vehicle.faction !== faction) continue;
      if (!vehicle.hasFreeSeats('gunner')) continue;
      _diff.subVectors(vehicle.getPosition(), center);
      if (_diff.lengthSq() <= radiusSq) result.push(vehicle);
    }
    return result;
  }

  /**
   * Scenario-time spawn entry for the M2HB emplacements that ship in
   * `cycle-vekhikl-2-stationary-weapons` (Open Frontier US base + A
   * Shau NVA bunker overlook). Each spawn registers an `Emplacement`
   * with this manager and a weapon binding with `m2hbSystem`.
   *
   * Callers pass an optional `resolvePosition` to translate the
   * spawn-table's logical position into a final world-space point
   * (e.g. snap to terrain via `terrainSystem.getHeightAt`,
   * geo-to-world projection for A Shau anchors); the default returns
   * the table position unchanged.
   *
   * Returns the registered vehicle ids so the composer / scenario
   * runtime can tear them down on mode switch.
   */
  spawnScenarioM2HBEmplacements(args: {
    scene: THREE.Scene;
    m2hbSystem: M2HBEmplacementSystem;
    modes: M2HBScenarioMode[];
    resolvePosition?: (mode: M2HBScenarioMode, base: THREE.Vector3) => THREE.Vector3;
  }): string[] {
    const spawned = spawnScenarioM2HBEmplacements({
      modes: args.modes,
      scene: args.scene,
      vehicleManager: this,
      m2hbSystem: args.m2hbSystem,
      resolvePosition: args.resolvePosition,
    });
    return spawned.map(s => s.vehicleId);
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
