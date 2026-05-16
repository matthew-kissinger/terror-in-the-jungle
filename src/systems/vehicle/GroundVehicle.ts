import * as THREE from 'three';
import { Faction } from '../combat/types';
import { GroundVehicleModels } from '../assets/modelPaths';
import type { IVehicle, SeatRole, VehicleSeat } from './IVehicle';
import {
  GroundVehiclePhysics,
  type GroundVehiclePhysicsConfig,
  type GroundVehicleControls,
} from './GroundVehiclePhysics';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

const DEFAULT_M151_SEATS: VehicleSeat[] = [
  { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(-0.35, 0.8, 0.35), exitOffset: new THREE.Vector3(-2, 0, 0) },
  { index: 1, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.35, 0.8, 0.35), exitOffset: new THREE.Vector3(2, 0, 0) },
  { index: 2, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(-0.35, 0.8, -0.45), exitOffset: new THREE.Vector3(-2, 0, -1.5) },
  { index: 3, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.35, 0.8, -0.45), exitOffset: new THREE.Vector3(2, 0, -1.5) },
];

/**
 * M151 jeep physics config: matches DEFAULT_PHYSICS in GroundVehiclePhysics
 * (M151 historical dimensions per docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md).
 * Exposed for tests and for follow-on vehicles that want to override individual
 * fields; the physics class merges over its own defaults so passing `undefined`
 * here yields the same simulation.
 */
export const M151_PHYSICS_CONFIG: Partial<GroundVehiclePhysicsConfig> = {
  mass: 1120,
  wheelbase: 2.06,
  trackWidth: 1.42,
  engineTorque: 240,
  maxSteer: 0.6,
  maxClimbSlope: 0.54,
};

export function isM151ModelPath(modelPath: string): boolean {
  return modelPath === GroundVehicleModels.M151_JEEP;
}

const _scratchPos = new THREE.Vector3();

export class GroundVehicle implements IVehicle {
  readonly category = 'ground' as const;
  readonly faction: Faction;
  private readonly seats: VehicleSeat[];
  private readonly velocity = new THREE.Vector3();
  private destroyed = false;
  private readonly physics: GroundVehiclePhysics;
  private terrain: ITerrainRuntime | null = null;

  constructor(
    readonly vehicleId: string,
    private readonly object: THREE.Object3D,
    faction: Faction = Faction.US,
    seats: VehicleSeat[] = DEFAULT_M151_SEATS,
    physicsConfig: Partial<GroundVehiclePhysicsConfig> = M151_PHYSICS_CONFIG,
  ) {
    this.faction = faction;
    this.seats = seats.map((seat) => ({
      ...seat,
      localOffset: seat.localOffset.clone(),
      exitOffset: seat.exitOffset.clone(),
    }));

    // Seed physics state from the object's current world transform so the first
    // update doesn't snap the vehicle to the origin.
    object.getWorldPosition(_scratchPos);
    this.physics = new GroundVehiclePhysics(_scratchPos, physicsConfig);
  }

  // ---------- Terrain wiring ----------

  setTerrain(terrain: ITerrainRuntime | null): void {
    this.terrain = terrain;
    if (terrain && typeof terrain.getPlayableWorldSize === 'function') {
      const worldSize = terrain.getPlayableWorldSize();
      if (Number.isFinite(worldSize) && worldSize > 0) {
        this.physics.setWorldHalfExtent(worldSize * 0.5);
      }
    }
  }

  // ---------- Physics access (for adapters / NPC drivers) ----------

  getPhysics(): GroundVehiclePhysics {
    return this.physics;
  }

  setEngineActive(active: boolean): void {
    this.physics.setEngineActive(active);
  }

  setControls(controls: Partial<GroundVehicleControls>): void {
    this.physics.setControls(controls);
  }

  // ---------- Seating ----------

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

  // ---------- Pose / state ----------

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

  // ---------- Per-frame integration ----------

  /**
   * Step the chassis simulation and write the integrated pose back to the
   * scene object. Safe to call without a terrain reference (physics treats
   * the surface as flat-and-infinite until `setTerrain` is called).
   */
  update(dt: number): void {
    if (this.destroyed || dt <= 0) return;
    this.physics.update(dt, this.terrain);

    const interpolated = this.physics.getInterpolatedState();
    this.object.position.copy(interpolated.position);
    this.object.quaternion.copy(interpolated.quaternion);
    this.velocity.copy(interpolated.velocity);
  }

  dispose(): void {
    this.destroyed = true;
    this.object.removeFromParent();
  }
}
