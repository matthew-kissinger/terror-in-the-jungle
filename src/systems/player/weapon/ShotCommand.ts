// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three'

/**
 * Command pattern for weapon firing.
 *
 * All validation (canFire, ammo check) happens BEFORE creating this command.
 * Once created, the command contains all data needed for execution.
 * executeShot() performs no validation - it trusts the command is valid.
 *
 * This eliminates temporal coupling bugs where registerShot() invalidates
 * a second canFire() check.
 */
export interface ShotCommand {
  /** Primary ray for bullet trajectory */
  ray: THREE.Ray

  /** Weapon type for audio and effects */
  weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher'

  /** Damage calculator that takes distance and headshot flag */
  damage: (distance: number, headshot: boolean) => number

  /** Additional rays for shotgun pellets */
  pelletRays?: THREE.Ray[]

  /** Timestamp when command was created */
  timestamp: number

  /** Whether weapon is in ADS mode (affects spread display) */
  isADS: boolean
}

/**
 * Result of executing a shot command
 */
export interface ShotResult {
  /** Whether any target was hit */
  hit: boolean

  /** World position of hit (if any) */
  hitPoint?: THREE.Vector3

  /** Whether a kill occurred */
  killed: boolean

  /** Whether it was a headshot */
  headshot: boolean

  /** Total damage dealt */
  damageDealt: number

  /** Distance to target (for stats tracking) */
  distance?: number
}

/**
 * Factory for creating shot commands
 */
export class ShotCommandFactory {
  private static readonly placeholderRay = new THREE.Ray()
  private static readonly placeholderDamage = () => 0
  private static rayPool: THREE.Ray[] = []
  private static rayPoolIndex = 0
  private static pelletRayArrayPool: THREE.Ray[][] = []
  private static pelletRayArrayPoolIndex = 0
  private static commandPool: ShotCommand[] = []
  private static commandPoolIndex = 0

  /**
   * Get a ray from the pool (reused to avoid allocations)
   */
  static getRay(): THREE.Ray {
    if (this.rayPoolIndex >= this.rayPool.length) {
      this.rayPool.push(new THREE.Ray())
    }
    return this.rayPool[this.rayPoolIndex++]
  }

  /**
   * Reset the ray pool at the start of each frame
   */
  static resetPool(): void {
    this.rayPoolIndex = 0
    this.pelletRayArrayPoolIndex = 0
    this.commandPoolIndex = 0
  }

  /**
   * Get a pellet-ray array from the frame pool. Commands in the same frame get
   * distinct arrays; later frames reuse the containers just like Ray objects.
   */
  private static getPelletRayArray(): THREE.Ray[] {
    if (this.pelletRayArrayPoolIndex >= this.pelletRayArrayPool.length) {
      this.pelletRayArrayPool.push([])
    }
    const pelletRays = this.pelletRayArrayPool[this.pelletRayArrayPoolIndex++]
    pelletRays.length = 0
    return pelletRays
  }

  /**
   * Get a command container from the frame pool. Commands already carry pooled
   * Ray instances, so the whole command has the same frame-scoped lifetime.
   */
  private static getCommand(): ShotCommand {
    if (this.commandPoolIndex >= this.commandPool.length) {
      this.commandPool.push({
        ray: this.placeholderRay,
        weaponType: 'rifle',
        damage: this.placeholderDamage,
        timestamp: 0,
        isADS: false,
      })
    }
    const command = this.commandPool[this.commandPoolIndex++]
    command.pelletRays = undefined
    return command
  }

  /**
   * Create a single-shot command (rifle, SMG)
   */
  static createSingleShot(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    weaponType: 'rifle' | 'smg' | 'pistol' | 'lmg' | 'launcher',
    damage: (distance: number, headshot: boolean) => number,
    isADS: boolean
  ): ShotCommand {
    const ray = this.getRay()
    ray.origin.copy(origin)
    ray.direction.copy(direction).normalize()

    const command = this.getCommand()
    command.ray = ray
    command.weaponType = weaponType
    command.damage = damage
    command.timestamp = performance.now()
    command.isADS = isADS
    return command
  }

  /**
   * Create a shotgun shot command with multiple pellet rays
   */
  static createShotgunShot(
    origin: THREE.Vector3,
    baseDirection: THREE.Vector3,
    pelletDirections: THREE.Vector3[],
    damage: (distance: number, headshot: boolean) => number,
    isADS: boolean
  ): ShotCommand {
    const ray = this.getRay()
    ray.origin.copy(origin)
    ray.direction.copy(baseDirection).normalize()

    const pelletRays = this.getPelletRayArray()
    for (let i = 0; i < pelletDirections.length; i++) {
      const dir = pelletDirections[i]
      const pelletRay = this.getRay()
      pelletRay.origin.copy(origin)
      pelletRay.direction.copy(dir).normalize()
      pelletRays.push(pelletRay)
    }

    const command = this.getCommand()
    command.ray = ray
    command.weaponType = 'shotgun'
    command.damage = damage
    command.pelletRays = pelletRays
    command.timestamp = performance.now()
    command.isADS = isADS
    return command
  }
}
