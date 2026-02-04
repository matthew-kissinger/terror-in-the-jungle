import * as THREE from 'three'
import { CombatantSystem } from '../../combat/CombatantSystem'
import { ImpactEffectsPool } from '../../effects/ImpactEffectsPool'
import { AudioManager } from '../../audio/AudioManager'
import { PlayerStatsTracker } from '../PlayerStatsTracker'
import { ShotCommand, ShotResult } from './ShotCommand'

// Module-level scratch vectors to avoid per-shot allocations
const _negDirection = new THREE.Vector3()

/**
 * Executes shot commands and handles hit processing, effects, and feedback.
 * Extracted from WeaponFiring to reduce file complexity.
 */
export class WeaponShotExecutor {
  constructor(
    private combatantSystem: CombatantSystem,
    private impactEffectsPool: ImpactEffectsPool,
    private camera: THREE.Camera,
    private audioManager?: AudioManager,
    private statsTracker?: PlayerStatsTracker,
    private hudSystem?: any
  ) {}

  executeSingleShot(command: ShotCommand): ShotResult {
    // Use the ray from the command - no recalculation
    const result = this.combatantSystem.handlePlayerShot(command.ray, command.damage)

    if (result.hit) {
      // Spawn impact effect
      _negDirection.copy(command.ray.direction).negate()
      this.impactEffectsPool.spawn(result.point, _negDirection)

      const damageDealt = (result as any).damage || 0
      const isHeadshot = (result as any).headshot || false
      const isKill = (result as any).killed || false

      // Track stats
      if (this.statsTracker) {
        if (damageDealt > 0) {
          this.statsTracker.addDamage(damageDealt)
        }
        if (isHeadshot) {
          this.statsTracker.addHeadshot()
        }
        if (isKill) {
          const distance = this.camera.position.distanceTo(result.point)
          this.statsTracker.updateLongestKill(distance)
        }
      }

      // Show HUD feedback
      if (this.hudSystem) {
        const hitType = isKill ? 'kill' : isHeadshot ? 'headshot' : 'hit'
        this.hudSystem.showHitMarker(hitType)

        if (this.audioManager) {
          this.audioManager.playHitFeedback(hitType as 'hit' | 'headshot' | 'kill')
        }

        if (damageDealt > 0) {
          this.hudSystem.spawnDamageNumber(result.point, damageDealt, isHeadshot, isKill)
        }
      }

      return {
        hit: true,
        hitPoint: result.point,
        killed: isKill,
        headshot: isHeadshot,
        damageDealt,
        distance: this.camera.position.distanceTo(result.point)
      }
    }

    return { hit: false, killed: false, headshot: false, damageDealt: 0 }
  }

  executeShotgunShot(command: ShotCommand): ShotResult {
    if (!command.pelletRays) {
      return { hit: false, killed: false, headshot: false, damageDealt: 0 }
    }

    let totalDamage = 0
    let anyHit = false
    let bestHit: any = null
    let headshotHit = false
    let killedByShot = false

    // Fire each pellet
    for (const pelletRay of command.pelletRays) {
      const result = this.combatantSystem.handlePlayerShot(pelletRay, command.damage)

      if (result.hit) {
        anyHit = true
        totalDamage += (result as any).damage || 0

        if (!bestHit || (result as any).killed) {
          bestHit = result
        }

        if ((result as any).headshot) {
          headshotHit = true
        }

        if ((result as any).killed) {
          killedByShot = true
        }

        // Spawn impact effect for each pellet
        _negDirection.copy(pelletRay.direction).negate()
        this.impactEffectsPool.spawn(result.point, _negDirection)
      }
    }

    // Track stats
    if (anyHit && this.statsTracker && bestHit) {
      if (totalDamage > 0) {
        this.statsTracker.addDamage(totalDamage)
      }
      if (headshotHit) {
        this.statsTracker.addHeadshot()
      }
      if (killedByShot) {
        const distance = this.camera.position.distanceTo(bestHit.point)
        this.statsTracker.updateLongestKill(distance)
      }
    }

    // Show HUD feedback
    if (anyHit && this.hudSystem && bestHit) {
      const hitType: 'hit' | 'headshot' | 'kill' = killedByShot ? 'kill' : headshotHit ? 'headshot' : 'hit'
      this.hudSystem.showHitMarker(hitType)

      if (this.audioManager) {
        this.audioManager.playHitFeedback(hitType)
      }

      if (totalDamage > 0) {
        this.hudSystem.spawnDamageNumber(bestHit.point, totalDamage, headshotHit, killedByShot)
      }
    }

    return {
      hit: anyHit,
      hitPoint: bestHit?.point,
      killed: killedByShot,
      headshot: headshotHit,
      damageDealt: totalDamage,
      distance: bestHit ? this.camera.position.distanceTo(bestHit.point) : undefined
    }
  }
}
