// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three'
import { ShotCommand, ShotCommandFactory } from './ShotCommand'

type DamageProvider = {
  computeDamage(distance: number, headshot: boolean): number
}

// Module-level scratch vectors to eliminate per-shot allocations
const _origin = new THREE.Vector3()
const _direction = new THREE.Vector3()
const _pelletRays: THREE.Ray[] = []
const _pelletDirections: THREE.Vector3[] = []
const _damageAdapters = new WeakMap<DamageProvider, (distance: number, headshot: boolean) => number>()

function getDamageAdapter(gunCore: DamageProvider): (distance: number, headshot: boolean) => number {
  let adapter = _damageAdapters.get(gunCore)
  if (!adapter) {
    adapter = (distance: number, headshot: boolean) => gunCore.computeDamage(distance, headshot)
    _damageAdapters.set(gunCore, adapter)
  }
  return adapter
}

/**
 * Builds ShotCommand instances from weapon state.
 * Handles weapon type detection, ray computation, and command creation.
 */
export class WeaponShotCommandBuilder {
  /**
   * Create a ShotCommand with all firing data captured at validation time
   */
  static createShotCommand(
    gunCore: any,
    camera: THREE.Camera,
    weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher',
    isShotgun: boolean,
    isADS: boolean
  ): ShotCommand {
    const damage = getDamageAdapter(gunCore)

    if (isShotgun) {
      // Get pellet rays from gunplay core
      const pelletRays = gunCore.computePelletRays(camera, _pelletRays)
      camera.getWorldPosition(_origin)
      camera.getWorldDirection(_direction)
      _pelletDirections.length = pelletRays.length
      for (let i = 0; i < pelletRays.length; i++) {
        _pelletDirections[i] = pelletRays[i].direction
      }

      return ShotCommandFactory.createShotgunShot(
        _origin,
        _direction,
        _pelletDirections,
        damage,
        isADS
      )
    } else {
      // Single shot - compute ray with spread
      const spread = gunCore.getSpreadDeg()
      const ray = gunCore.computeShotRay(camera, spread)

      return ShotCommandFactory.createSingleShot(
        ray.origin,
        ray.direction,
        weaponType === 'shotgun' ? 'rifle' : weaponType,
        damage,
        isADS
      )
    }
  }
}
