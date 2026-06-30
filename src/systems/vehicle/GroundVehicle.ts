// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
import { VehicleDamageState, type VehicleDamageResult } from './VehicleDamage';

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
  // 2026-06-28 owner playtest: the jeep felt too slow/floaty. Stronger pull-away
  // torque + much lighter velocity damping (0.88 -> 0.95) raise the steady-state
  // cruise without turning into ice — damping still bleeds speed off-throttle, so
  // it stops feeling like it coasts forever.
  engineTorque: 520,
  gearRatio: 5.2,
  maxSteer: 0.58,
  maxClimbSlope: 0.76,
  rollingCoef: 85,
  velocityDamping: 0.95,
  angularDamping: 0.76,
  lateralGripDamping: 0.08,
  slopeDriveFloor: 0.65,
  slopeGravityScale: 0.28,
};

const M151_MAX_HP = 250;

const M35_TRUCK_SEATS: VehicleSeat[] = [
  { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(-0.45, 1.35, -1.15), exitOffset: new THREE.Vector3(-2.4, 0, -1) },
  { index: 1, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.45, 1.35, -1.15), exitOffset: new THREE.Vector3(2.4, 0, -1) },
  { index: 2, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(-0.55, 1.35, 1.1), exitOffset: new THREE.Vector3(-2.4, 0, 1.2) },
  { index: 3, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.55, 1.35, 1.1), exitOffset: new THREE.Vector3(2.4, 0, 1.2) },
];

const APC_SEATS: VehicleSeat[] = [
  { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(-0.55, 1.3, -1.15), exitOffset: new THREE.Vector3(-2.3, 0, -1.3) },
  { index: 1, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.55, 1.35, -0.9), exitOffset: new THREE.Vector3(2.3, 0, -1.1) },
  { index: 2, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(-0.45, 1.25, 0.75), exitOffset: new THREE.Vector3(-2.3, 0, 1.2) },
  { index: 3, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.45, 1.25, 0.75), exitOffset: new THREE.Vector3(2.3, 0, 1.2) },
];

const M35_PHYSICS_CONFIG: Partial<GroundVehiclePhysicsConfig> = {
  mass: 5900,
  wheelbase: 4.2,
  trackWidth: 1.9,
  engineTorque: 1800,
  gearRatio: 5.4,
  maxSteer: 0.46,
  maxClimbSlope: 0.66,
  rollingCoef: 260,
  airDragCoef: 4,
  velocityDamping: 0.87,
  angularDamping: 0.74,
  lateralGripDamping: 0.07,
  slopeDriveFloor: 0.6,
  slopeGravityScale: 0.28,
};

const APC_PHYSICS_CONFIG: Partial<GroundVehiclePhysicsConfig> = {
  mass: 12300,
  wheelbase: 3.4,
  trackWidth: 2.3,
  engineTorque: 2100,
  gearRatio: 5.2,
  maxSteer: 0.42,
  maxClimbSlope: 0.68,
  rollingCoef: 420,
  airDragCoef: 5,
  velocityDamping: 0.87,
  angularDamping: 0.74,
  lateralGripDamping: 0.06,
  slopeDriveFloor: 0.6,
  slopeGravityScale: 0.28,
};

interface GroundVehicleRuntimeProfile {
  seats: VehicleSeat[];
  physicsConfig: Partial<GroundVehiclePhysicsConfig>;
  maxHp: number;
}

// Legacy + Kiln (kiln-war-2026-06) art paths share one runtime profile per
// vehicle, so the placement promotes whichever path the ?vehicleArt flag
// resolves to (kiln in browser, legacy in node/SSR + when opted out).
const M35_TRUCK_PROFILE: GroundVehicleRuntimeProfile = {
  seats: M35_TRUCK_SEATS,
  physicsConfig: M35_PHYSICS_CONFIG,
  maxHp: 420,
};
const M113_APC_PROFILE: GroundVehicleRuntimeProfile = {
  seats: APC_SEATS,
  physicsConfig: APC_PHYSICS_CONFIG,
  maxHp: 650,
};

const GROUND_VEHICLE_RUNTIME_PROFILES: Record<string, GroundVehicleRuntimeProfile> = {
  [GroundVehicleModels.M151_JEEP]: {
    seats: DEFAULT_M151_SEATS,
    physicsConfig: M151_PHYSICS_CONFIG,
    maxHp: M151_MAX_HP,
  },
  [GroundVehicleModels.M35_TRUCK]: M35_TRUCK_PROFILE,
  [GroundVehicleModels.M35_DEUCE_A_HALF]: M35_TRUCK_PROFILE,
  // ZIL-157 reuses the wheeled-truck profile.
  [GroundVehicleModels.ZIL_157]: M35_TRUCK_PROFILE,
  [GroundVehicleModels.ZIL_157_SIX_WHEEL]: M35_TRUCK_PROFILE,
  [GroundVehicleModels.M113_APC]: M113_APC_PROFILE,
  [GroundVehicleModels.M113_ARMORED_PERSONNEL_CARRIER]: M113_APC_PROFILE,
};

export function isM151ModelPath(modelPath: string): boolean {
  return modelPath === GroundVehicleModels.M151_JEEP;
}

export function isGroundVehicleModelPath(modelPath: string): boolean {
  return GROUND_VEHICLE_RUNTIME_PROFILES[modelPath] !== undefined;
}

export function groundVehicleIdForPlacement(objectId: string, modelPath: string): string {
  const token = modelPath.replace(/^vehicles\/ground\//, '').replace(/\.glb$/, '').replace(/-/g, '_');
  return objectId.includes(token.split('_')[0]) ? objectId : `${objectId}_${token}`;
}

export function createGroundVehicleForModelPath(
  vehicleId: string,
  object: THREE.Object3D,
  modelPath: string,
  faction: Faction = Faction.US,
): GroundVehicle | null {
  const profile = GROUND_VEHICLE_RUNTIME_PROFILES[modelPath];
  if (!profile) return null;
  return new GroundVehicle(
    vehicleId,
    object,
    faction,
    profile.seats,
    profile.physicsConfig,
    profile.maxHp,
  );
}

const _scratchPos = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();

export class GroundVehicle implements IVehicle {
  readonly category = 'ground' as const;
  readonly faction: Faction;
  private readonly seats: VehicleSeat[];
  private readonly velocity = new THREE.Vector3();
  private readonly damage: VehicleDamageState;
  private readonly physics: GroundVehiclePhysics;
  private terrain: ITerrainRuntime | null = null;
  private collisionTerrain: ITerrainRuntime | null = null;

  constructor(
    readonly vehicleId: string,
    private readonly object: THREE.Object3D,
    faction: Faction = Faction.US,
    seats: VehicleSeat[] = DEFAULT_M151_SEATS,
    physicsConfig: Partial<GroundVehiclePhysicsConfig> = M151_PHYSICS_CONFIG,
    maxHp: number = M151_MAX_HP,
  ) {
    this.faction = faction;
    this.damage = new VehicleDamageState(maxHp);
    this.seats = seats.map((seat) => ({
      ...seat,
      localOffset: seat.localOffset.clone(),
      exitOffset: seat.exitOffset.clone(),
    }));

    // Seed physics state from the object's current world transform so the first
    // update doesn't snap the vehicle to the origin or discard placed yaw.
    object.getWorldPosition(_scratchPos);
    this.physics = new GroundVehiclePhysics(_scratchPos, physicsConfig);
    object.getWorldQuaternion(_scratchQuat);
    this.physics.setQuaternion(_scratchQuat);
  }

  // ---------- Terrain wiring ----------

  setTerrain(terrain: ITerrainRuntime | null): void {
    if (this.collisionTerrain !== terrain) {
      this.unregisterCollisionProxy();
      if (terrain) {
        terrain.registerCollisionObject(this.vehicleId, this.object, { dynamic: true });
        this.collisionTerrain = terrain;
      }
    }
    this.terrain = terrain;
    if (terrain && typeof terrain.getPlayableWorldSize === 'function') {
      const worldSize = terrain.getPlayableWorldSize();
      if (Number.isFinite(worldSize) && worldSize > 0) {
        this.physics.setWorldHalfExtent(worldSize * 0.5);
      }
    }

    // Rest the chassis on the surface the moment terrain is available. Placement
    // seeds the vehicle's world Y before terrain is wired, which can leave the
    // jeep clipped under the DEM and `isGrounded === false` — in that state the
    // drive force is gated to zero. Conforming here makes the vehicle grounded
    // (and drivable) from the first frame, and writes the rested pose back to
    // the scene object so `getPosition()` reports the surface height right away.
    if (terrain) {
      this.physics.conformToTerrain(terrain);
      const state = this.physics.getInterpolatedState();
      this.object.position.copy(state.position);
      this.object.quaternion.copy(state.quaternion);
    }
  }

  // ---------- Physics access (for adapters / NPC drivers) ----------

  getPhysics(): GroundVehiclePhysics {
    return this.physics;
  }

  getRenderRoot(): THREE.Object3D {
    return this.object;
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
    return this.damage.isDestroyed();
  }

  getHealthPercent(): number {
    return this.damage.getHealthPercent();
  }

  getHp(): number {
    return this.damage.getHp();
  }

  getMaxHp(): number {
    return this.damage.getMaxHp();
  }

  applyDamage(amount: number, _hitPoint: THREE.Vector3): VehicleDamageResult {
    const result = this.damage.applyDamage(amount);
    if (result.destroyed) {
      this.physics.setEngineActive(false);
    }
    return result;
  }

  // ---------- Per-frame integration ----------

  /**
   * Step the chassis simulation and write the integrated pose back to the
   * scene object. Safe to call without a terrain reference (physics treats
   * the surface as flat-and-infinite until `setTerrain` is called).
   */
  update(dt: number): void {
    if (this.isDestroyed() || dt <= 0) return;
    this.physics.update(dt, this.terrain);

    const interpolated = this.physics.getInterpolatedState();
    this.object.position.copy(interpolated.position);
    this.object.quaternion.copy(interpolated.quaternion);
    this.velocity.copy(interpolated.velocity);
  }

  dispose(): void {
    this.damage.destroy();
    this.unregisterCollisionProxy();
    this.object.removeFromParent();
  }

  private unregisterCollisionProxy(): void {
    this.collisionTerrain?.unregisterCollisionObject(this.vehicleId);
    this.collisionTerrain = null;
  }
}
