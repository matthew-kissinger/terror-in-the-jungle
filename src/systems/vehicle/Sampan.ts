// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Faction } from '../combat/types';
import type { IVehicle, SeatRole, VehicleSeat } from './IVehicle';
import {
  WatercraftPhysics,
  type WatercraftPhysicsConfig,
} from './WatercraftPhysics';
import type { BuoyancySamplerLike } from '../environment/water/BuoyancyForce';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { VehicleDamageState, type VehicleDamageResult } from './VehicleDamage';

/**
 * Sampan: light unarmed Vietnamese river boat. First IVehicle to ride
 * the `WatercraftPhysics` hull-sample integrator authored in cycle #10
 * R1. Sibling of `GroundVehicle` (M151 jeep) and `Tank` (M48 Patton) —
 * same enter/exit/seat plumbing, different physics class.
 *
 * Sampan tuning (per cycle brief §"sampan-integration"):
 *   - Hull dimensions: ~6 m length x ~2 m beam x ~1.0 m freeboard.
 *   - Mass: ~500 kg (loaded weight for a wooden river craft).
 *   - Hull displacement: 0.6 m^3 (yields ~83% submerged equilibrium
 *     at 500 kg in fresh water: m / (rho * V) = 500 / (1000 * 0.6) =
 *     0.833 — the gunwale rides just above water, characteristic of a
 *     fully-laden flat-bottomed boat).
 *   - Engine power: 400 N (very low — a sampan is pole/paddle or a
 *     small outboard; sustained top speed is a few m/s).
 *   - Rudder authority: 1.2 rad/s (responsive at low speed for tight
 *     river turns).
 *   - Drag coefficient: 1.2 (water is dense; this combined with the
 *     low engine power keeps speeds in the realistic 2-3 m/s band).
 *   - Bridge clearance: 1.2 m (low silhouette — the WatercraftPhysics
 *     stub returns false today; the value is recorded for the R2
 *     bridge-detect wiring without locking a fence change).
 *
 * Seats: single `'pilot'` slot. The PBR sibling task adds gunner seats
 * for its M2HB twin mounts; the Sampan stays unarmed (per directives).
 */

const DEFAULT_SAMPAN_SEATS: VehicleSeat[] = [
  // Pilot: seated amidships, slightly above the waterline. Local origin
  // sits at the keel; the seat lifts the player onto the deck. Exit
  // offset points to the port side (-X) so the player steps off into
  // the water beside the hull when there is no nearby bank — the
  // WatercraftPlayerAdapter's getExitPlan walks this offset onto the
  // bank when one is in reach.
  {
    index: 0,
    role: 'pilot',
    occupantId: null,
    localOffset: new THREE.Vector3(0, 0.6, 0.5),
    exitOffset: new THREE.Vector3(-1.5, 0, 0),
  },
];

/** Default hull tuning (exported for tests + the spawn helper). */
export const SAMPAN_PHYSICS_CONFIG: Omit<WatercraftPhysicsConfig, 'initialPosition' | 'initialQuaternion'> = {
  // Four corner samples + center. Length along Z (chassis-forward
  // convention is -Z); beam along X. The mid sample keeps the
  // hull-plane reconstruction stable when only two corners are wet.
  hullSamplePoints: [
    new THREE.Vector3(-1.0, 0, -3.0), // bow-port
    new THREE.Vector3(+1.0, 0, -3.0), // bow-starboard
    new THREE.Vector3(-1.0, 0, +3.0), // stern-port
    new THREE.Vector3(+1.0, 0, +3.0), // stern-starboard
    new THREE.Vector3(0, 0, 0),       // midship
  ],
  hullDisplacement: 0.6,
  mass: 500,
  enginePower: 400,
  rudderAuthority: 1.2,
  dragCoefficient: 1.2,
  bridgeClearance: 1.2,
};

/** Bounding-box dimensions (m) used by the procedural fallback mesh. */
export const SAMPAN_HULL_DIMENSIONS = {
  length: 6.0,
  beam: 2.0,
  freeboard: 1.0,
} as const;

const _scratchPos = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const SAMPAN_MAX_HP = 90;

export class Sampan implements IVehicle {
  readonly category = 'watercraft' as const;
  readonly faction: Faction;
  private readonly seats: VehicleSeat[];
  private readonly velocity = new THREE.Vector3();
  private readonly damage = new VehicleDamageState(SAMPAN_MAX_HP);
  private readonly physics: WatercraftPhysics;
  private terrain: ITerrainRuntime | null = null;

  constructor(
    readonly vehicleId: string,
    private readonly object: THREE.Object3D,
    faction: Faction = Faction.NVA,
    seats: VehicleSeat[] = DEFAULT_SAMPAN_SEATS,
    physicsConfig: Partial<WatercraftPhysicsConfig> = {},
  ) {
    this.faction = faction;
    this.seats = seats.map((seat) => ({
      ...seat,
      localOffset: seat.localOffset.clone(),
      exitOffset: seat.exitOffset.clone(),
    }));

    // Seed physics from the mesh's current world transform so the first
    // update step doesn't snap the hull to the origin. Mirrors how
    // GroundVehicle / Tank seed their chassis state.
    object.getWorldPosition(_scratchPos);
    object.getWorldQuaternion(_scratchQuat);

    const merged: WatercraftPhysicsConfig = {
      ...SAMPAN_PHYSICS_CONFIG,
      ...physicsConfig,
      initialPosition: physicsConfig.initialPosition ?? _scratchPos.clone(),
      initialQuaternion: physicsConfig.initialQuaternion ?? _scratchQuat.clone(),
    };
    this.physics = new WatercraftPhysics(merged);
  }

  // ---------- Terrain + water sampler wiring ----------

  setTerrain(terrain: ITerrainRuntime | null): void {
    this.terrain = terrain;
  }

  /**
   * Inject the water sampler used per hull sample (typically the
   * runtime `WaterSystem`, which implements `BuoyancySamplerLike` via
   * `sampleWaterInteraction`). Idempotent. Passing `null` detaches the
   * hull from any water surface — buoyancy fades to zero and the
   * craft falls under gravity alone, useful for tests + scene tear-down.
   */
  setWaterSampler(sampler: BuoyancySamplerLike | null): void {
    this.physics.setWaterSampler(sampler);
  }

  // ---------- Physics access (for adapters / NPC pilots) ----------

  getPhysics(): WatercraftPhysics {
    return this.physics;
  }

  /**
   * Driver input. Throttle ∈ [-1,1] (positive = forward), rudder ∈
   * [-1,1] (positive = right turn under the watercraft convention; the
   * physics layer clamps both). The WatercraftPlayerAdapter forwards
   * here every frame; NPC pilots can drive this directly without
   * reaching into WatercraftPhysics.
   */
  setControls(throttle: number, rudder: number): void {
    this.physics.setControls(throttle, rudder);
  }

  /** Signed forward speed along the chassis-forward axis (m/s). */
  getForwardSpeed(): number {
    return this.physics.getForwardSpeed();
  }

  /** True when any hull sample is within ground-contact threshold of terrain Y. */
  isGrounded(): boolean {
    return this.physics.isGrounded();
  }

  // ---------- ITankModel-style live transform shape ----------

  /** Stable id alias mirroring `vehicleId` (matches Tank.id). */
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

  /** Role-based seat occupy used by `WatercraftPlayerAdapter`. */
  occupy(seatRole: SeatRole, occupantId: string): boolean {
    return this.enterVehicle(occupantId, seatRole) !== null;
  }

  /** Role-based seat release used by `WatercraftPlayerAdapter`. */
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

  isDestroyed(): boolean {
    return this.damage.isDestroyed();
  }

  getHealthPercent(): number {
    return this.damage.getHealthPercent();
  }

  applyDamage(amount: number, _hitPoint: THREE.Vector3): VehicleDamageResult {
    const result = this.damage.applyDamage(amount);
    if (result.destroyed) {
      this.setControls(0, 0);
    }
    return result;
  }

  // ---------- Per-frame integration ----------

  /**
   * Step the hull simulation and write the integrated pose back to the
   * scene object. Safe to call without a terrain reference (physics
   * treats terrain as absent for grounding queries, which is correct
   * for the open-water sailing path).
   */
  update(dt: number): void {
    if (this.isDestroyed() || dt <= 0) return;
    this.physics.update(dt, this.terrain ?? undefined);

    const state = this.physics.getState();
    this.object.position.copy(state.position);
    this.object.quaternion.copy(state.quaternion);
    this.velocity.copy(state.velocity);
  }

  dispose(): void {
    this.damage.destroy();
    this.physics.dispose();
    this.object.removeFromParent();
  }
}
