import * as THREE from 'three'
import { GunplayCore } from '../../weapons/GunplayCore'
import { CombatantSystem } from '../../combat/CombatantSystem'
import { CombatHitResult } from '../../combat/CombatantCombat'
import { TracerPool } from '../../effects/TracerPool'
import { MuzzleFlashSystem, MuzzleFlashVariant } from '../../effects/MuzzleFlashSystem'
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
  private muzzleFlashSystem: MuzzleFlashSystem
  private impactEffectsPool: ImpactEffectsPool
  private audioManager?: AudioManager
  private statsTracker?: PlayerStatsTracker
  private hudSystem?: HUDSystem
  private muzzleRef?: THREE.Object3D
  private shotExecutor?: WeaponShotExecutor
  private overlayScene: THREE.Scene

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

  getGunCore(): GunplayCore {
    return this.gunCore
  }
}
