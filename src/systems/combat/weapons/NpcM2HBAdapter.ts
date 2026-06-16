// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { VehicleManager } from '../../vehicle/VehicleManager';
import type { M2HBEmplacementSystem } from './M2HBEmplacement';
import type { Emplacement } from '../../vehicle/Emplacement';
import {
  DEFAULT_FOV_HALF_ANGLE_RAD,
  INpcEmplacementQuery,
  INpcEmplacementVehicle,
  INpcEmplacementWeapon,
} from '../ai/EmplacementSeekHelper';

/**
 * Adapter between the live M2HB weapon stack (`M2HBEmplacementSystem` +
 * `Emplacement` + `M2HBWeapon`) and the duck-typed surface the NPC-gunner
 * emplacement-seek path consumes
 * (`INpcEmplacementQuery` / `INpcEmplacementWeapon`).
 *
 * Why this exists:
 *   - The combat-AI tree (`src/systems/combat/ai/`) intentionally does
 *     not import from the vehicle / weapon trees. The adapter is the
 *     translation layer at the swap boundary.
 *   - `M2HBEmplacementSystem.tryFire` is a system-level method that
 *     takes (vehicleId, origin, aimDir); the AI side wants a
 *     per-emplacement `tryFire()` with no arguments. The adapter binds
 *     each call to a specific vehicleId and computes the live origin +
 *     forward from the bound `Emplacement`'s yaw/pitch on demand.
 *   - The field-of-fire cone is derived from the live barrel pose
 *     (`Emplacement.getYaw()` / `getPitch()` / `getPosition()`) so an
 *     NPC won't try to mount a tripod whose barrel can't reach the
 *     threat. The local-frame yaw+pitch forward is composed with the
 *     emplacement's `getQuaternion()` so PBR-mounted (or otherwise
 *     parented) tripods report world-correct aim — same composition as
 *     `M2HBEmplacement.computeBarrelForward` (B1 fix, 48406eb0).
 *
 * Production wiring:
 *   const adapter = createNpcM2HBAdapter(vehicleManager, m2hbSystem);
 *   aiStateEngage.setEmplacementQuery(adapter.query);
 *   aiStateEngage.setEmplacementWeaponResolver(adapter.resolveWeapon);
 *   aiStateEngage.setNpcVehicleBoarding(npcVehicleController);
 *
 * The bootstrap-level call is deferred to a follow-up — the M2HB system
 * isn't yet instantiated in `SystemInitializer` (no scenario spawns
 * tripods today). When the scenario wiring lands, the three setters
 * above complete the loop. Until then, the AI path stays dormant.
 */

const _muzzleScratch = new THREE.Vector3();
const _forwardScratch = new THREE.Vector3();
/**
 * Scratch quaternion for composing the emplacement's world rotation
 * onto the locally-derived barrel forward. Required for tripods that
 * live under a rotated parent (e.g. the PBR's aft mount on a hull at
 * 180° local rotation). Mirrors the `_scratchWorldQuat` slot in
 * `M2HBEmplacement.computeBarrelForward` (B1 fix in 48406eb0).
 */
const _worldQuatScratch = new THREE.Quaternion();
/** M2HB barrel cone half-angle. Matches the helper's default fallback. */
const M2HB_CONE_HALF_ANGLE_RAD = DEFAULT_FOV_HALF_ANGLE_RAD;
/** Muzzle elevation above the tripod base, metres. Matches M2HBEmplacement.computeMuzzleOrigin. */
const MUZZLE_HEIGHT_M = 0.95;
/** Muzzle forward offset along the barrel, metres. Matches M2HBEmplacement.computeMuzzleOrigin. */
const MUZZLE_FORWARD_M = 0.6;

export interface NpcM2HBAdapter {
  /** Pass to `AIStateEngage.setEmplacementQuery`. */
  readonly query: INpcEmplacementQuery;
  /** Pass to `AIStateEngage.setEmplacementWeaponResolver`. */
  resolveWeapon(vehicleId: string): INpcEmplacementWeapon | null;
  /**
   * Per-frame tick — when a mounted NPC gunner has a target, call this
   * to issue one fire request. Returns true if the round cycled. The
   * integration layer (CombatantAI's mounted-update path) computes the
   * world-space origin + aim direction and forwards them here.
   */
  fire(vehicleId: string, origin: THREE.Vector3, aimDir: THREE.Vector3): boolean;
}

/**
 * Build the adapter. Reads the M2HB system + VehicleManager from the
 * outer scope and returns a fresh `INpcEmplacementWeapon` shape per
 * `resolveWeapon` call (the weapon is cheap; allocating per call avoids
 * a per-binding cache that would need invalidation on unregister).
 */
export function createNpcM2HBAdapter(
  vehicleManager: VehicleManager,
  m2hbSystem: M2HBEmplacementSystem,
): NpcM2HBAdapter {
  function getEmplacement(vehicleId: string): Emplacement | null {
    const vehicle = vehicleManager.getVehicle(vehicleId);
    if (!vehicle || vehicle.category !== 'emplacement') return null;
    return vehicle as Emplacement;
  }

  /**
   * Compute the muzzle origin + barrel forward for a given emplacement,
   * using the same convention as `M2HBEmplacement.computeMuzzleOrigin` /
   * `computeBarrelForward` so the cone the AI consults matches the
   * direction live rounds will travel. Writes into the supplied scratch
   * vectors and returns whether the lookup succeeded.
   *
   * The local-frame forward derived from yaw + pitch is composed with
   * the emplacement's world quaternion so a tripod that lives under a
   * rotated parent (e.g. the PBR's aft M2HB mount on a hull rotated
   * 180°) reports its barrel in the correct world direction. Mirrors
   * the B1 fix to `M2HBEmplacement.computeBarrelForward` and
   * `EmplacementPlayerAdapter.computeBarrelCamera` (commit 48406eb0).
   * For an identity world quaternion (ground tripod at yaw=0) the
   * composition is a no-op, so cycle-#6 emplacement behaviour is
   * preserved.
   */
  function readBarrelPose(
    vehicleId: string,
    muzzleOut: THREE.Vector3,
    forwardOut: THREE.Vector3,
  ): boolean {
    const emp = getEmplacement(vehicleId);
    if (!emp) return false;
    const yaw = emp.getYaw();
    const pitch = emp.getPitch();
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    forwardOut.set(-sy * cp, sp, -cy * cp);
    // `getQuaternion()` allocates a fresh quaternion; copy into the
    // scratch slot to keep the per-call allocation count bounded.
    _worldQuatScratch.copy(emp.getQuaternion());
    forwardOut.applyQuaternion(_worldQuatScratch);
    muzzleOut.copy(emp.getPosition());
    muzzleOut.y += MUZZLE_HEIGHT_M;
    muzzleOut.addScaledVector(forwardOut, MUZZLE_FORWARD_M);
    return true;
  }

  const query: INpcEmplacementQuery = {
    getVehiclesInRadius(center: THREE.Vector3, radius: number): readonly INpcEmplacementVehicle[] {
      // VehicleManager returns every vehicle in the radius; filter to
      // emplacements here so the helper's downstream loop has less to
      // discard. The structural `INpcEmplacementVehicle` shape is a
      // subset of `IVehicle` so the cast is safe.
      const all = vehicleManager.getVehiclesInRadius(center, radius);
      const out: INpcEmplacementVehicle[] = [];
      for (const v of all) {
        if (v.category === 'emplacement') {
          out.push(v as unknown as INpcEmplacementVehicle);
        }
      }
      return out;
    },
    forEachVehicleInRadius(
      center: THREE.Vector3,
      radius: number,
      visitor: (vehicle: INpcEmplacementVehicle) => void,
    ): void {
      vehicleManager.forEachVehicleInRadius(center, radius, vehicle => {
        if (vehicle.category === 'emplacement') {
          visitor(vehicle as unknown as INpcEmplacementVehicle);
        }
      });
    },
  };

  function resolveWeapon(vehicleId: string): INpcEmplacementWeapon | null {
    const weapon = m2hbSystem.getWeapon(vehicleId);
    if (!weapon) return null;
    const emp = getEmplacement(vehicleId);
    if (!emp) return null;
    // Allocate a fresh wrapper per call. The wrapper holds no state of
    // its own; cone vectors are owned by the closure and freshly written
    // on every `getFieldOfFireCone()` call so callers see current pose.
    const coneOrigin = new THREE.Vector3();
    const coneDirection = new THREE.Vector3();
    return {
      tryFire(): boolean {
        if (!readBarrelPose(vehicleId, _muzzleScratch, _forwardScratch)) return false;
        return m2hbSystem.tryFire(vehicleId, _muzzleScratch, _forwardScratch);
      },
      isEmpty(): boolean {
        return weapon.isEmpty();
      },
      getFieldOfFireCone() {
        readBarrelPose(vehicleId, coneOrigin, coneDirection);
        return {
          origin: coneOrigin,
          direction: coneDirection,
          halfAngleRad: M2HB_CONE_HALF_ANGLE_RAD,
        };
      },
    };
  }

  return {
    query,
    resolveWeapon,
    fire(vehicleId: string, origin: THREE.Vector3, aimDir: THREE.Vector3): boolean {
      return m2hbSystem.tryFire(vehicleId, origin, aimDir);
    },
  };
}
