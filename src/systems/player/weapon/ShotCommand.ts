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
  weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol'

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
  private static rayPool: THREE.Ray[] = []
  private static rayPoolIndex = 0

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
  }

  /**
   * Create a single-shot command (rifle, SMG)
   */
  static createSingleShot(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    weaponType: 'rifle' | 'smg' | 'pistol',
    damage: (distance: number, headshot: boolean) => number,
    isADS: boolean
  ): ShotCommand {
    const ray = this.getRay()
    ray.origin.copy(origin)
    ray.direction.copy(direction).normalize()

    return {
      ray,
      weaponType,
      damage,
      timestamp: performance.now(),
      isADS
    }
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

    const pelletRays: THREE.Ray[] = pelletDirections.map(dir => {
      const pelletRay = this.getRay()
      pelletRay.origin.copy(origin)
      pelletRay.direction.copy(dir).normalize()
      return pelletRay
    })

    return {
      ray,
      weaponType: 'shotgun',
      damage,
      pelletRays,
      timestamp: performance.now(),
      isADS
    }
  }
}
