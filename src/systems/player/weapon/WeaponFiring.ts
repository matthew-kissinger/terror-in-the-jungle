import * as THREE from 'three'
import { GunplayCore } from '../../weapons/GunplayCore'
import { CombatantSystem } from '../../combat/CombatantSystem'
import { CombatHitResult } from '../../combat/CombatantCombat'
import { TracerPool } from '../../effects/TracerPool'
import { MuzzleFlashPool } from '../../effects/MuzzleFlashPool'
import { ImpactEffectsPool } from '../../effects/ImpactEffectsPool'
import { AudioManager } from '../../audio/AudioManager'
import { PlayerStatsTracker } from '../PlayerStatsTracker'
import { ShotCommand, ShotResult } from './ShotCommand'
import { performanceTelemetry } from '../../debug/PerformanceTelemetry'
import { WeaponShotExecutor } from './WeaponShotExecutor'
import type { HUDSystem } from '../../../ui/hud/HUDSystem'

// Module-level scratch vectors to avoid per-shot allocations
const _negDirection = new THREE.Vector3()
const _muzzlePos = new THREE.Vector3()
const _cameraPos = new THREE.Vector3()
const _forward = new THREE.Vector3()

/**
 * Handles weapon firing execution. Uses command pattern to avoid temporal coupling.
 *
 * IMPORTANT: executeShot() performs NO validation. All checks (canFire, ammo, etc.)
 * must happen BEFORE creating the ShotCommand.
 */
export class WeaponFiring {
  private camera: THREE.Camera
  private combatantSystem?: CombatantSystem
  private gunCore: GunplayCore
  private tracerPool: TracerPool
  private muzzleFlashPool: MuzzleFlashPool
  private impactEffectsPool: ImpactEffectsPool
  private audioManager?: AudioManager
  private statsTracker?: PlayerStatsTracker
  private hudSystem?: HUDSystem
  private muzzleRef?: THREE.Object3D
  private shotExecutor?: WeaponShotExecutor

  constructor(
    camera: THREE.Camera,
    gunCore: GunplayCore,
    tracerPool: TracerPool,
    muzzleFlashPool: MuzzleFlashPool,
    impactEffectsPool: ImpactEffectsPool
  ) {
    this.camera = camera
    this.gunCore = gunCore
    this.tracerPool = tracerPool
    this.muzzleFlashPool = muzzleFlashPool
    this.impactEffectsPool = impactEffectsPool
  }

  setCombatantSystem(combatantSystem: CombatantSystem): void {
    this.combatantSystem = combatantSystem
    this.initializeShotExecutor()
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager
    this.initializeShotExecutor()
  }

  setStatsTracker(statsTracker: PlayerStatsTracker): void {
    this.statsTracker = statsTracker
    this.initializeShotExecutor()
  }

  setHUDSystem(hudSystem: HUDSystem): void {
    this.hudSystem = hudSystem
    this.initializeShotExecutor()
  }

  setMuzzleRef(muzzleRef: THREE.Object3D | undefined): void {
    this.muzzleRef = muzzleRef
  }

  setGunCore(gunCore: GunplayCore): void {
    this.gunCore = gunCore
  }

  private initializeShotExecutor(): void {
    if (this.combatantSystem) {
      this.shotExecutor = new WeaponShotExecutor(
        this.combatantSystem,
        this.impactEffectsPool,
        this.camera,
        this.audioManager,
        this.statsTracker,
        this.hudSystem
      )
    }
  }

  /**
   * Execute a shot command. NO VALIDATION - command is assumed valid.
   * All checks (canFire, ammo) happen before command creation.
   */
  executeShot(command: ShotCommand): ShotResult {
    if (!this.combatantSystem || !this.shotExecutor) {
      return { hit: false, killed: false, headshot: false, damageDealt: 0 }
    }

    // Play weapon-specific sound
    if (this.audioManager) {
      this.audioManager.playPlayerWeaponSound(command.weaponType)
    }

    // Execute based on weapon type
    let result: ShotResult
    if (command.weaponType === 'shotgun' && command.pelletRays) {
      result = this.shotExecutor.executeShotgunShot(command)
    } else {
      result = this.shotExecutor.executeSingleShot(command)
    }

    if (this.statsTracker) {
      this.statsTracker.registerShot(result.hit)
    }

    // Spawn muzzle flash
    this.spawnMuzzleFlash()

    // Record in telemetry
    performanceTelemetry.recordShot(result.hit)

    return result
  }

  /**
   * Legacy fire method - wraps executeShot for backward compatibility
   * @deprecated Use executeShot with ShotCommand instead
   */
  fire(isShotgun: boolean, weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' = 'rifle'): void {
    if (!this.combatantSystem) return

    // Play weapon-specific sound
    if (this.audioManager) {
      this.audioManager.playPlayerWeaponSound(weaponType)
    }

    // Check if shotgun - fire multiple pellets
    if (isShotgun) {
      this.fireShotgunPellets()
    } else {
      this.fireSingleShot()
    }

    this.spawnMuzzleFlash()
  }


  private fireSingleShot(): void {
    if (!this.combatantSystem) return

    // Spread and recoil
    const spread = this.gunCore.getSpreadDeg()
    const ray = this.gunCore.computeShotRay(this.camera, spread)

    // Hitscan damage application with enhanced result
    const result = this.combatantSystem.handlePlayerShot(ray, (d, head) => this.gunCore.computeDamage(d, head))
    if (this.statsTracker) {
      this.statsTracker.registerShot(!!result.hit)
    }

    // Spawn impact effect at hit point
    if (result.hit) {
      // Calculate impact normal (opposite of ray direction for now)
      _negDirection.copy(ray.direction).negate()
      this.impactEffectsPool.spawn(result.point, _negDirection)

      // Track shot as a hit in stats
      if (this.statsTracker) {
        // Mark previous shot as a hit by registering a new hit
        const damageDealt = result.damage || 0
        const isHeadshot = result.headshot || false

        if (damageDealt > 0) {
          this.statsTracker.addDamage(damageDealt)
        }
        if (isHeadshot) {
          this.statsTracker.addHeadshot()
        }

        // Track longest kill distance if this was a kill
        if (result.killed) {
          const shotOrigin = this.camera.position
          const targetPos = result.point
          const distance = shotOrigin.distanceTo(targetPos)
          this.statsTracker.updateLongestKill(distance)
        }
      }

      // Show hit marker and play hit sound
      if (this.hudSystem) {
        // Check if it's a kill or normal hit
        const hitType = result.killed ? 'kill' : result.headshot ? 'headshot' : 'hit'
        this.hudSystem.showHitMarker(hitType)

        // Play hit feedback sound
        if (this.audioManager) {
          this.audioManager.playHitFeedback(hitType as 'hit' | 'headshot' | 'kill')
        }

        // Spawn damage number
        const damageDealt = result.damage || 0
        const isHeadshot = result.headshot || false
        const isKill = result.killed || false
        if (damageDealt > 0) {
          this.hudSystem.spawnDamageNumber(result.point, damageDealt, isHeadshot, isKill)
        }
      }
    }
  }

  private fireShotgunPellets(): void {
    if (!this.combatantSystem) return

    // Generate pellet rays
    const pelletRays = this.gunCore.computePelletRays(this.camera)

    let totalDamage = 0
    let anyHit = false
    let bestHit: CombatHitResult | null = null
    let headshotHit = false
    let killedByShot = false

    // Fire each pellet
    for (const ray of pelletRays) {
      const result = this.combatantSystem.handlePlayerShot(ray, (d, head) => this.gunCore.computeDamage(d, head))

      if (result.hit) {
        anyHit = true
        totalDamage += result.damage || 0

        // Track best hit for visual feedback
        if (!bestHit || result.killed) {
          bestHit = result
        }

        // Track if any pellet was a headshot
        if (result.headshot) {
          headshotHit = true
        }

        // Track if any pellet killed
        if (result.killed) {
          killedByShot = true
        }

        // Spawn impact effect for each pellet
        _negDirection.copy(ray.direction).negate()
        this.impactEffectsPool.spawn(result.point, _negDirection)
      }
    }

    // Track stats for shotgun shot
    if (anyHit && this.statsTracker && bestHit) {
      if (totalDamage > 0) {
        this.statsTracker.addDamage(totalDamage)
      }
      if (headshotHit) {
        this.statsTracker.addHeadshot()
      }
      if (killedByShot) {
        const shotOrigin = this.camera.position
        const targetPos = bestHit.point
        const distance = shotOrigin.distanceTo(targetPos)
        this.statsTracker.updateLongestKill(distance)
      }
    }

    // Show consolidated feedback for the shot
    if (anyHit && this.hudSystem && bestHit) {
      const hitType: 'hit' | 'headshot' | 'kill' = bestHit.killed ? 'kill' : bestHit.headshot ? 'headshot' : 'hit'
      this.hudSystem.showHitMarker(hitType)

      // Play hit feedback sound
      if (this.audioManager) {
        this.audioManager.playHitFeedback(hitType)
      }

      // Show total damage dealt
      if (totalDamage > 0) {
        this.hudSystem.spawnDamageNumber(bestHit.point, totalDamage, bestHit.headshot || false, bestHit.killed || false)
      }
    }

    if (this.statsTracker) {
      this.statsTracker.registerShot(anyHit)
    }
  }

  private spawnMuzzleFlash(): void {
    this.camera.getWorldPosition(_cameraPos)
    this.camera.getWorldDirection(_forward)

    if (this.muzzleRef) {
      // Get muzzle world position for 3D scene flash
      this.muzzleRef.getWorldPosition(_muzzlePos)
      // Offset forward from camera position
      _muzzlePos.copy(_cameraPos).addScaledVector(_forward, 1.5)
    } else {
      _muzzlePos.copy(_cameraPos).addScaledVector(_forward, 1)
    }

    // Shotgun has a bigger muzzle flash
    const flashSize = this.gunCore.isShotgun() ? 1.6 : 1.2
    this.muzzleFlashPool.spawn(_muzzlePos, _forward, flashSize)
  }

  getGunCore(): GunplayCore {
    return this.gunCore
  }
}
