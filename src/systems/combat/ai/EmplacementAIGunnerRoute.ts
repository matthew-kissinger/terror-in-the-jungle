// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three'
import { Combatant, ITargetable, isAlly, isTargetAlive } from '../types'
import {
  EmplacementMountTracker,
  INpcEmplacementWeapon,
  enemyInFieldOfFire,
} from './EmplacementSeekHelper'

/**
 * NPC emplacement-gunner firing route (F5 activation, `npc-m2hb-gunners`
 * task).
 *
 * Sibling of `TankAIGunnerRoute`: extracted from `CombatantAI` so the
 * IN_VEHICLE branch stays focused. The combat-AI tree calls into this route
 * when an NPC combatant is mounted in a friendly emplacement's gunner seat
 * and has acquired a target through the existing rifle target-acquisition
 * pipeline.
 *
 * Method (per campaign fork F5):
 *   1. Acquisition is unchanged — `CombatantAI` hands us the target it
 *      picked with `findNearestEnemy`. Only the *firing* path differs.
 *   2. Slew the barrel toward the target via `Emplacement.setAim(yaw,pitch)`.
 *      The emplacement enforces its own slew cap + pitch envelope; the route
 *      just requests the angles.
 *   3. Fire through the M2HB adapter (`fire(vehicleId, origin, aimDir)`) only
 *      while the target sits inside the barrel's field-of-fire cone — a
 *      static gunner that can't bear on the enemy holds fire.
 *   4. Note every in-cone tick on the shared `EmplacementMountTracker` so the
 *      >5 s stale-target dismount predicate can fire.
 *   5. When `shouldDismount` trips (belt empty OR target out of cone > 5 s),
 *      order the gunner off the tripod so it returns to normal combat.
 *
 * Attribution: the adapter's `fire` routes NPC shots through
 * `CombatantSystem.handleNpcEmplacementShot`, which credits the gunner
 * combatant (not PLAYER) — same separation the tank route keeps by routing
 * through the cannon's own kill accounting.
 */

/**
 * Per-tick context the route needs from the vehicle/weapon side. Built by
 * the composer's context provider for any combatant whose `state ===
 * IN_VEHICLE` and whose vehicle is a friendly emplacement with this
 * combatant in the gunner seat. Returning `null` from the provider skips
 * the route (the combatant is not a mounted emplacement gunner).
 */
export interface EmplacementGunnerContext {
  /** Live vehicle id (used for the adapter fire call + dismount order). */
  vehicleId: string
  /** Emplacement pose surface — barrel position + slew command. */
  emplacement: EmplacementAimSurface
  /** Weapon surface — cone + belt-empty gate. */
  weapon: INpcEmplacementWeapon
  /** Fire one round. Returns true when a round left the barrel. */
  fire(origin: THREE.Vector3, aimDir: THREE.Vector3): boolean
  /** Order the gunner off the tripod. Returns true when accepted. */
  orderDismount(): boolean
}

/**
 * Minimal aim surface the route drives on the live `Emplacement`. A subset
 * of `Emplacement` so the combat-AI tree avoids a hard import of the vehicle
 * class (and tests pass a one-line fake).
 */
export interface EmplacementAimSurface {
  getPosition(): THREE.Vector3
  getYaw(): number
  getPitch(): number
  setAim(targetYaw: number, targetPitch: number): void
}

// Module-level scratch so the hot path never allocates.
const _toTarget = new THREE.Vector3()
const _muzzle = new THREE.Vector3()
const _aimDir = new THREE.Vector3()

/** Muzzle height above the tripod base — matches M2HBEmplacement.computeMuzzleOrigin. */
const MUZZLE_HEIGHT_M = 0.95

/**
 * Emplacement-mounted NPC firing route. Stateless aside from the shared
 * `EmplacementMountTracker` (owned by AIStateEngage, passed in) that records
 * the last in-cone time for the stale-target dismount window.
 */
export class EmplacementAIGunnerRoute {
  constructor(private readonly mountTracker: EmplacementMountTracker) {}

  /**
   * Evaluate the mounted gunner for one tick: slew, gate on cone, fire, and
   * dismount when the belt runs dry or the threat leaves the cone > 5 s.
   *
   * `nowMs` MUST be `performance.now()` (wall clock) so the 5 s stale-target
   * window is doctrine-tied and does not stretch under TimeScale pause /
   * bullet-time — same contract the tracker documents.
   */
  evaluate(
    combatant: Combatant,
    ctx: EmplacementGunnerContext,
    target: ITargetable | null | undefined,
    nowMs: number,
  ): void {
    const { emplacement, weapon } = ctx

    // Dismount when the belt is empty or the target has been out of cone
    // for > 5 s. Checked first so a depleted gunner leaves promptly even
    // with no live target this tick.
    if (this.mountTracker.shouldDismount(combatant, weapon, nowMs)) {
      if (ctx.orderDismount()) {
        this.mountTracker.reset(combatant)
      }
      return
    }

    // No live / hostile target — hold fire but stay mounted (the stale-cone
    // timer above eventually dismounts if the threat never returns).
    if (!target || !isTargetAlive(target) || isAlly(combatant.faction, target.faction)) {
      return
    }

    // Slew the barrel toward the target. Yaw/pitch use the same convention
    // as M2HBEmplacement.computeBarrelForward: yaw=0,pitch=0 -> local -Z,
    // yaw rotates around Y, pitch is positive-up. The emplacement clamps to
    // its mechanical envelope and caps the slew rate internally.
    const empPos = emplacement.getPosition()
    _muzzle.copy(empPos)
    _muzzle.y += MUZZLE_HEIGHT_M
    _toTarget.subVectors(target.position, _muzzle)
    const horizontalRange = Math.hypot(_toTarget.x, _toTarget.z)
    const desiredYaw = Math.atan2(-_toTarget.x, -_toTarget.z)
    const desiredPitch = Math.atan2(_toTarget.y, Math.max(horizontalRange, 1e-3))
    emplacement.setAim(desiredYaw, desiredPitch)

    // Cone gate: fire only while the threat sits inside the barrel's current
    // field of fire. The cone reflects the barrel pose *after* the last
    // slew step, so a gunner mid-traverse holds fire until it bears.
    const cone = weapon.getFieldOfFireCone()
    if (!enemyInFieldOfFire(cone, target.position)) {
      return
    }

    // In cone — refresh the stale-target timer and fire down the barrel.
    this.mountTracker.markThreatInCone(combatant, nowMs)
    _aimDir.copy(cone.direction)
    ctx.fire(cone.origin, _aimDir)
  }
}
