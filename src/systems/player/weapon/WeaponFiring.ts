import * as THREE from 'three'
import { GunplayCore } from '../../weapons/GunplayCore'
import { CombatantSystem } from '../../combat/CombatantSystem'
import { TracerPool } from '../../effects/TracerPool'
import { MuzzleFlashSystem, MuzzleFlashVariant } from '../../effects/MuzzleFlashSystem'
import { ImpactEffectsPool } from '../../effects/ImpactEffectsPool'
import { AudioManager } from '../../audio/AudioManager'
import { PlayerStatsTracker } from '../PlayerStatsTracker'
import { ShotCommand, ShotCommandFactory, ShotResult } from './ShotCommand'
import { performanceTelemetry } from '../../debug/PerformanceTelemetry'
import { WeaponShotExecutor } from './WeaponShotExecutor'
import type { HUDSystem } from '../../../ui/hud/HUDSystem'
import type { GrenadeSystem } from '../../weapons/GrenadeSystem'

// Module-level scratch vectors to avoid per-shot allocations
const _muzzlePos = new THREE.Vector3()
const _overlayMuzzleNdc = new THREE.Vector3()
const _cameraPos = new THREE.Vector3()
const _cameraRight = new THREE.Vector3()
const _cameraUp = new THREE.Vector3()
const _cameraQuat = new THREE.Quaternion()
const _forward = new THREE.Vector3()
const _muzzleRayPoint = new THREE.Vector3()
const _barrelOrigin = new THREE.Vector3()
const _aimPoint = new THREE.Vector3()
const _barrelDirection = new THREE.Vector3()
const _tracerEnd = new THREE.Vector3()
const _pelletDirection = new THREE.Vector3()
const _barrelRotation = new THREE.Quaternion()

const PLAYER_BARREL_WORLD_DISTANCE = 0.95
const PLAYER_BARREL_FALLBACK_RIGHT = 0.18
const PLAYER_BARREL_FALLBACK_UP = -0.14

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
  private overlayCamera?: THREE.Camera
  private grenadeSystem?: GrenadeSystem

  constructor(
    camera: THREE.Camera,
    gunCore: GunplayCore,
    tracerPool: TracerPool,
    muzzleFlashSystem: MuzzleFlashSystem,
    impactEffectsPool: ImpactEffectsPool,
    overlayScene: THREE.Scene,
    overlayCamera?: THREE.Camera,
  ) {
    this.camera = camera
    this.gunCore = gunCore
    this.tracerPool = tracerPool
    this.muzzleFlashSystem = muzzleFlashSystem
    this.impactEffectsPool = impactEffectsPool
    this.overlayScene = overlayScene
    this.overlayCamera = overlayCamera
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

    const resolvedCommand = this.resolveBarrelAlignedCommand(command, _barrelOrigin, _aimPoint)

    // Execute based on weapon type
    let result: ShotResult
    if (resolvedCommand.weaponType === 'shotgun' && resolvedCommand.pelletRays) {
      result = this.shotExecutor.executeShotgunShot(resolvedCommand)
    } else {
      result = this.shotExecutor.executeSingleShot(resolvedCommand)
    }

    if (this.statsTracker) {
      this.statsTracker.registerShot(result.hit)
    }

    // Spawn muzzle flash
    this.spawnMuzzleFlash()

    // Spawn tracer
    this.spawnTracer(resolvedCommand, result, _barrelOrigin, _aimPoint)

    // Record in telemetry
    performanceTelemetry.recordShot(result.hit)

    return result
  }

  /**
   * Execute an M79 grenade launcher shot.
   * Spawns a grenade projectile instead of hitscan - damage comes from grenade explosion.
   */
  private executeLauncherShot(_command: ShotCommand): ShotResult {
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

  private spawnTracer(
    command: ShotCommand,
    result: ShotResult,
    tracerStart: THREE.Vector3,
    fallbackEnd: THREE.Vector3,
  ): void {
    if (command.weaponType === 'shotgun' && command.pelletRays) {
      // Spawn 1 tracer per 3 pellets
      for (let i = 0; i < command.pelletRays.length; i += 3) {
        const pelletRay = command.pelletRays[i]
        const range = result.distance ?? 25
        _tracerEnd.copy(pelletRay.origin).addScaledVector(pelletRay.direction, range)
        this.tracerPool.spawn(tracerStart, _tracerEnd, 100)
      }
    } else {
      if (result.hitPoint) {
        _tracerEnd.copy(result.hitPoint)
      } else {
        _tracerEnd.copy(fallbackEnd)
      }
      this.tracerPool.spawn(tracerStart, _tracerEnd, 120)
    }
  }

  private resolveBarrelAlignedCommand(
    command: ShotCommand,
    barrelOriginTarget: THREE.Vector3,
    aimPointTarget: THREE.Vector3,
  ): ShotCommand {
    this.resolveTracerStart(barrelOriginTarget)
    this.resolveAimPoint(command, aimPointTarget)

    _barrelDirection.subVectors(aimPointTarget, barrelOriginTarget)
    if (_barrelDirection.lengthSq() <= 0.0001) {
      _barrelDirection.copy(command.ray.direction)
    } else {
      _barrelDirection.normalize()
    }

    if (command.weaponType === 'shotgun' && command.pelletRays) {
      _barrelRotation.setFromUnitVectors(command.ray.direction, _barrelDirection)
      const pelletDirections = command.pelletRays.map((pelletRay) =>
        _pelletDirection.copy(pelletRay.direction).applyQuaternion(_barrelRotation).normalize().clone()
      )
      return ShotCommandFactory.createShotgunShot(
        barrelOriginTarget,
        _barrelDirection,
        pelletDirections,
        command.damage,
        command.isADS,
      )
    }

    return ShotCommandFactory.createSingleShot(
      barrelOriginTarget,
      _barrelDirection,
      command.weaponType === 'shotgun' ? 'rifle' : command.weaponType,
      command.damage,
      command.isADS,
    )
  }

  private resolveAimPoint(command: ShotCommand, target: THREE.Vector3): THREE.Vector3 {
    if (this.combatantSystem) {
      const preview = this.combatantSystem.resolvePlayerAimPoint(command.ray)
      return target.copy(preview.point)
    }

    return target.copy(command.ray.origin).addScaledVector(command.ray.direction, 200)
  }

  private resolveTracerStart(target: THREE.Vector3): THREE.Vector3 {
    this.camera.getWorldPosition(_cameraPos)
    this.camera.getWorldDirection(_forward)

    if (this.muzzleRef && this.overlayCamera) {
      this.muzzleRef.getWorldPosition(_muzzlePos)
      _overlayMuzzleNdc.copy(_muzzlePos).project(this.overlayCamera)
      const ndcX = THREE.MathUtils.clamp(_overlayMuzzleNdc.x, -0.98, 0.98)
      const ndcY = THREE.MathUtils.clamp(_overlayMuzzleNdc.y, -0.98, 0.98)
      _muzzleRayPoint.set(ndcX, ndcY, 0.5).unproject(this.camera)
      _barrelDirection.subVectors(_muzzleRayPoint, _cameraPos)
      if (_barrelDirection.lengthSq() > 0.0001) {
        _barrelDirection.normalize()
        return target.copy(_cameraPos).addScaledVector(_barrelDirection, PLAYER_BARREL_WORLD_DISTANCE)
      }
    }

    this.camera.getWorldQuaternion(_cameraQuat)
    _cameraRight.set(1, 0, 0).applyQuaternion(_cameraQuat).normalize()
    _cameraUp.set(0, 1, 0).applyQuaternion(_cameraQuat).normalize()
    return target.copy(_cameraPos)
      .addScaledVector(_cameraRight, PLAYER_BARREL_FALLBACK_RIGHT)
      .addScaledVector(_cameraUp, PLAYER_BARREL_FALLBACK_UP)
      .addScaledVector(_forward, PLAYER_BARREL_WORLD_DISTANCE)
  }

  getGunCore(): GunplayCore {
    return this.gunCore
  }
}
