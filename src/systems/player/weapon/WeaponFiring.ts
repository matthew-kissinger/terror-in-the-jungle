import * as THREE from 'three'
import { GunplayCore } from '../../weapons/GunplayCore'
import { CombatantSystem } from '../../combat/CombatantSystem'
import { TracerPool } from '../../effects/TracerPool'
import { MuzzleFlashSystem, MuzzleFlashVariant } from '../../effects/MuzzleFlashSystem'
import { ImpactEffectsPool } from '../../effects/ImpactEffectsPool'
import { AudioManager } from '../../audio/AudioManager'
import { PlayerStatsTracker } from '../PlayerStatsTracker'
import { ShotCommand, ShotResult } from './ShotCommand'
import { performanceTelemetry } from '../../debug/PerformanceTelemetry'
import { WeaponShotExecutor } from './WeaponShotExecutor'
import type { HUDSystem } from '../../../ui/hud/HUDSystem'
import type { GrenadeSystem } from '../../weapons/GrenadeSystem'

// Module-level scratch vectors to avoid per-shot allocations
const _negDirection = new THREE.Vector3()
const _muzzlePos = new THREE.Vector3()
const _cameraPos = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _tracerEnd = new THREE.Vector3()

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
  private muzzleFlashSystem: MuzzleFlashSystem
  private impactEffectsPool: ImpactEffectsPool
  private audioManager?: AudioManager
  private statsTracker?: PlayerStatsTracker
  private hudSystem?: HUDSystem
  private muzzleRef?: THREE.Object3D
  private shotExecutor?: WeaponShotExecutor
  private overlayScene: THREE.Scene
  private grenadeSystem?: GrenadeSystem

  constructor(
    camera: THREE.Camera,
    gunCore: GunplayCore,
    tracerPool: TracerPool,
    muzzleFlashSystem: MuzzleFlashSystem,
    impactEffectsPool: ImpactEffectsPool,
    overlayScene: THREE.Scene
  ) {
    this.camera = camera
    this.gunCore = gunCore
    this.tracerPool = tracerPool
    this.muzzleFlashSystem = muzzleFlashSystem
    this.impactEffectsPool = impactEffectsPool
    this.overlayScene = overlayScene
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

  setGrenadeSystem(grenadeSystem: GrenadeSystem): void {
    this.grenadeSystem = grenadeSystem
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

    // Launcher fires a grenade projectile instead of hitscan
    if (command.weaponType === 'launcher') {
      return this.executeLauncherShot(command)
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

    // Spawn tracer
    this.spawnTracer(command, result)

    // Record in telemetry
    performanceTelemetry.recordShot(result.hit)

    return result
  }

  /**
   * Execute an M79 grenade launcher shot.
   * Spawns a grenade projectile instead of hitscan - damage comes from grenade explosion.
   */
  private executeLauncherShot(command: ShotCommand): ShotResult {
    // Play launcher-specific sound (falls back to rifle sound)
    if (this.audioManager) {
      this.audioManager.playPlayerWeaponSound('rifle')
    }

    // Spawn muzzle flash
    this.spawnMuzzleFlash()

    // Spawn grenade projectile via GrenadeSystem
    if (this.grenadeSystem) {
      this.camera.getWorldPosition(_cameraPos)
      this.camera.getWorldDirection(_forward)

      // Start grenade slightly ahead of camera
      const startPos = _cameraPos.clone().addScaledVector(_forward, 1.5)

      // M79 muzzle velocity ~40 m/s, slight upward arc
      const velocity = _forward.clone().multiplyScalar(40)
      velocity.y += 3.0 // Slight upward boost for natural arc

      // Shorter fuse than hand grenades (2.0s vs 3.5s)
      this.grenadeSystem.spawnProjectile(startPos, velocity, 2.0)
    }

    // Record in telemetry (no hit - damage comes from explosion)
    performanceTelemetry.recordShot(false)

    return { hit: false, killed: false, headshot: false, damageDealt: 0 }
  }

  private spawnMuzzleFlash(): void {
    this.camera.getWorldDirection(_forward)

    // Map weapon type to variant
    let variant: MuzzleFlashVariant = MuzzleFlashVariant.RIFLE
    if (this.gunCore.isShotgun()) {
      variant = MuzzleFlashVariant.SHOTGUN
    }
    // SMG/Pistol detection would need core identity - default to RIFLE for now

    if (this.muzzleRef) {
      // Use actual muzzle world position from weapon model
      this.muzzleRef.getWorldPosition(_muzzlePos)
    } else {
      // Fallback: offset from camera
      this.camera.getWorldPosition(_cameraPos)
      _muzzlePos.copy(_cameraPos).addScaledVector(_forward, 1)
    }

    // Nudge upward in overlay-scene space so the burst stays with the gun
    // during the recoil kick (gun snaps up ~0.10 units in overlay world on fire).
    _muzzlePos.y += 0.03

    this.muzzleFlashSystem.spawnPlayer(this.overlayScene, _muzzlePos, _forward, variant)
  }

  private spawnTracer(command: ShotCommand, result: ShotResult): void {
    this.camera.getWorldPosition(_cameraPos)
    this.camera.getWorldDirection(_forward)
    // Start tracer slightly ahead of camera to avoid first-person clipping
    _cameraPos.addScaledVector(_forward, 2)

    if (command.weaponType === 'shotgun' && command.pelletRays) {
      // Spawn 1 tracer per 3 pellets
      for (let i = 0; i < command.pelletRays.length; i += 3) {
        const pelletRay = command.pelletRays[i]
        const range = result.distance ?? 25
        _tracerEnd.copy(pelletRay.origin).addScaledVector(pelletRay.direction, range)
        this.tracerPool.spawn(_cameraPos, _tracerEnd, 100)
      }
    } else {
      if (result.hitPoint) {
        _tracerEnd.copy(result.hitPoint)
      } else {
        _tracerEnd.copy(command.ray.origin).addScaledVector(command.ray.direction, 200)
      }
      this.tracerPool.spawn(_cameraPos, _tracerEnd, 120)
    }
  }

  getGunCore(): GunplayCore {
    return this.gunCore
  }
}
