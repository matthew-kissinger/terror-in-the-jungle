import * as THREE from 'three';
import { Faction } from '../combat/types';
import type { IVehicle, SeatRole, VehicleSeat } from './IVehicle';
import {
  TrackedVehiclePhysics,
  type TrackedVehiclePhysicsConfig,
} from './TrackedVehiclePhysics';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

/**
 * Tank IVehicle implementation. Sibling of `GroundVehicle` (the wheeled
 * M151 jeep) per docs/rearch/TANK_SYSTEMS_2026-05-13.md §"Integration
 * surface": both implement `category = 'ground'`, but the tank composes
 * `TrackedVehiclePhysics` (skid-steer) instead of `GroundVehiclePhysics`
 * (Ackermann). No subclass.
 *
 * The chassis-slice ships only the driver seat hookup the cycle brief
 * calls out; the gunner seat is declared up front so the player-adapter
 * and cycle #9 turret work can mount onto it without changing this
 * surface. Loader + commander are exposed as passenger seats with no
 * functional binding, mirroring `DEFAULT_M151_SEATS`.
 *
 * Sibling-PR coordination: the parallel `tank-player-adapter` task
 * built `TankPlayerAdapter` against a structural `ITankModel` stub.
 * This class satisfies that stub:
 *
 *   readonly id, position, quaternion, category: 'ground'
 *   setControls(throttleAxis, turnAxis, brake): void
 *   getSeats(): Array<{ role: SeatRole; exitOffset: THREE.Vector3 }>
 *   occupy(seatRole, occupantId): boolean
 *   release(seatRole): void
 *   getForwardSpeed(): number
 *
 * After this PR + the adapter PR merge, the adapter swaps its local
 * stub for the real `Tank` import.
 */

const DEFAULT_M48_SEATS: VehicleSeat[] = [
  // Driver: front-left of the hull (M48 driver's hatch on the left of
  // the glacis), seated, exits to the front-left of the chassis.
  { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(-0.6, 1.4, -2.2), exitOffset: new THREE.Vector3(-2.6, 0, -2.2) },
  // Gunner: turret-mounted. Position is the turret-ring centre; the
  // cycle #9 turret rig will refine to "right of the breech."
  { index: 1, role: 'gunner', occupantId: null, localOffset: new THREE.Vector3(0.4, 2.2, 0.0), exitOffset: new THREE.Vector3(2.6, 0, 0) },
  // Loader: left of the breech, no functional binding in v1.
  { index: 2, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(-0.4, 2.2, 0.4), exitOffset: new THREE.Vector3(-2.6, 0, 0.4) },
  // Commander: turret-roof cupola, no functional binding in v1.
  { index: 3, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.4, 2.6, 0.4), exitOffset: new THREE.Vector3(2.6, 0, 0.4) },
];

const _scratchPos = new THREE.Vector3();

export class Tank implements IVehicle {
  readonly category = 'ground' as const;
  readonly faction: Faction;
  private readonly seats: VehicleSeat[];
  private readonly velocity = new THREE.Vector3();
  private destroyed = false;
  private readonly physics: TrackedVehiclePhysics;
  private terrain: ITerrainRuntime | null = null;

  constructor(
    readonly vehicleId: string,
    private readonly object: THREE.Object3D,
    faction: Faction = Faction.US,
    seats: VehicleSeat[] = DEFAULT_M48_SEATS,
    physicsConfig?: Partial<TrackedVehiclePhysicsConfig>,
  ) {
    this.faction = faction;
    this.seats = seats.map((seat) => ({
      ...seat,
      localOffset: seat.localOffset.clone(),
      exitOffset: seat.exitOffset.clone(),
    }));

    // Seed physics state from the object's current world transform so
    // the first update doesn't snap the chassis to the origin — same
    // pattern GroundVehicle uses for the M151.
    object.getWorldPosition(_scratchPos);
    this.physics = new TrackedVehiclePhysics(_scratchPos, physicsConfig);
    if (object.quaternion) {
      this.physics.setQuaternion(object.quaternion);
    }
  }

  // ---------- ITankModel structural shape (sibling-PR coordination) ----------

  /** Stable id alias the adapter uses (mirrors `vehicleId`). */
  get id(): string {
    return this.vehicleId;
  }

  /** Live world-space position reference (matches the rendered object). */
  get position(): THREE.Vector3 {
    return this.object.position;
  }

  /** Live world-space orientation reference. */
  get quaternion(): THREE.Quaternion {
    return this.object.quaternion;
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

  getPhysics(): TrackedVehiclePhysics {
    return this.physics;
  }

  /**
   * Skid-steer driver input. Delegates straight through to the physics
   * layer so the adapter never has to know about `TrackedVehiclePhysics`.
   */
  setControls(throttleAxis: number, turnAxis: number, brake: boolean): void {
    this.physics.setControls(throttleAxis, turnAxis, brake);
  }

  setTracksBlown(blown: boolean): void {
    this.physics.setTracksBlown(blown);
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

  /** Role-based seat occupy used by `TankPlayerAdapter` (ITankModel). */
  occupy(seatRole: SeatRole, occupantId: string): boolean {
    return this.enterVehicle(occupantId, seatRole) !== null;
  }

  /** Role-based seat release used by `TankPlayerAdapter` (ITankModel). */
  release(seatRole: SeatRole): void {
    const seat = this.seats.find(candidate => candidate.role === seatRole && candidate.occupantId !== null);
    if (seat) seat.occupantId = null;
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

  /** Forward-axis speed (m/s) used by the adapter's HUD readout. */
  getForwardSpeed(): number {
    return this.physics.getForwardSpeed();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  getHealthPercent(): number {
    return this.destroyed ? 0 : 1;
  }

  // ---------- Per-frame integration ----------

  /**
   * Step the chassis simulation and write the integrated pose back to
   * the scene object. Safe to call without a terrain reference (the
   * physics layer treats the surface as flat-and-infinite until
   * `setTerrain` is called).
   */
  update(dt: number): void {
    if (this.destroyed || dt <= 0) return;
    this.physics.update(dt, this.terrain);

    const state = this.physics.getState();
    this.object.position.copy(state.position);
    this.object.quaternion.copy(state.quaternion);
    this.velocity.copy(state.velocity);
  }

  dispose(): void {
    this.destroyed = true;
    this.physics.dispose();
    this.object.removeFromParent();
  }
}
