// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
const _barrelRotation = new THREE.Quaternion()
const _barrelAlignedPelletDirection = new THREE.Vector3()
const _launcherStartPos = new THREE.Vector3()
const _launcherVelocity = new THREE.Vector3()

const PLAYER_TRACER_FORWARD_PRESENTATION_DISTANCE = 1.35
const PLAYER_TRACER_OVERLAY_NDC_LIMIT = 1.15
const PLAYER_BARREL_FALLBACK_RIGHT = 0.18
const PLAYER_BARREL_FALLBACK_UP = -0.14

export type ShotOriginProjectionMode = 'overlay-muzzle' | 'ads-camera' | 'hip-camera'

export interface ShotOriginDiagnostics {
  weaponType: ShotCommand['weaponType']
  isADS: boolean
  projectionMode: ShotOriginProjectionMode
  damageRayOrigin: THREE.Vector3
  damageRayDirection: THREE.Vector3
  visualTracerStart: THREE.Vector3
  visualTracerEnd: THREE.Vector3
  overlayMuzzleNdc: THREE.Vector3 | null
}

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
  private readonly lastShotOriginDiagnostics: ShotOriginDiagnostics = {
    weaponType: 'rifle',
    isADS: false,
    projectionMode: 'hip-camera',
    damageRayOrigin: new THREE.Vector3(),
    damageRayDirection: new THREE.Vector3(),
    visualTracerStart: new THREE.Vector3(),
    visualTracerEnd: new THREE.Vector3(),
    overlayMuzzleNdc: null,
  }
  private hasLastShotOriginDiagnostics = false
  private lastTracerProjectionMode: ShotOriginProjectionMode = 'hip-camera'
  private readonly overlayMuzzleNdcForDiagnostics = new THREE.Vector3()
  private hasLastOverlayMuzzleNdc = false

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
    this.spawnBarrelAlignedTracer(command, result)

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
      _launcherStartPos.copy(_cameraPos).addScaledVector(_forward, 1.5)

      // M79 muzzle velocity ~40 m/s, slight upward arc
      _launcherVelocity.copy(_forward).multiplyScalar(40)
      _launcherVelocity.y += 3.0 // Slight upward boost for natural arc

      // Shorter fuse than hand grenades (2.0s vs 3.5s)
      this.grenadeSystem.spawnProjectile(_launcherStartPos, _launcherVelocity, 2.0)
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

  private spawnBarrelAlignedTracer(command: ShotCommand, result: ShotResult): void {
    this.resolveTracerStart(_barrelOrigin, command.isADS)
    this.resolveAimPoint(command, _aimPoint, result.hitPoint)
    _tracerEnd.copy(_aimPoint)

    _barrelDirection.subVectors(_aimPoint, _barrelOrigin)
    if (_barrelDirection.lengthSq() <= 0.0001) {
      _barrelDirection.copy(command.ray.direction)
    } else {
      _barrelDirection.normalize()
    }

    if (command.weaponType === 'shotgun' && command.pelletRays) {
      _barrelRotation.setFromUnitVectors(command.ray.direction, _barrelDirection)
      // Spawn 1 tracer per 3 pellets
      for (let i = 0; i < command.pelletRays.length; i += 3) {
        const pelletRay = command.pelletRays[i]
        const range = result.distance ?? 25
        _barrelAlignedPelletDirection
          .copy(pelletRay.direction)
          .applyQuaternion(_barrelRotation)
          .normalize()
        _tracerEnd.copy(_barrelOrigin).addScaledVector(_barrelAlignedPelletDirection, range)
        this.tracerPool.spawn(_barrelOrigin, _tracerEnd, 100)
      }
    } else {
      if (result.hitPoint) {
        _tracerEnd.copy(result.hitPoint)
      } else {
        _tracerEnd.copy(_aimPoint)
      }
      this.tracerPool.spawn(_barrelOrigin, _tracerEnd, 120)
    }
    this.recordShotOriginDiagnostics(command)
  }

  private resolveAimPoint(
    command: ShotCommand,
    target: THREE.Vector3,
    actualAimPoint?: THREE.Vector3,
  ): THREE.Vector3 {
    if (actualAimPoint) {
      return target.copy(actualAimPoint)
    }

    return target.copy(command.ray.origin).addScaledVector(command.ray.direction, 200)
  }

  private resolveTracerStart(target: THREE.Vector3, isADS: boolean): THREE.Vector3 {
    this.camera.getWorldPosition(_cameraPos)
    this.camera.getWorldDirection(_forward)
    this.lastTracerProjectionMode = isADS ? 'ads-camera' : 'hip-camera'
    this.hasLastOverlayMuzzleNdc = false

    if (this.muzzleRef && this.overlayCamera) {
      this.camera.updateMatrixWorld(true)
      this.overlayCamera.updateMatrixWorld(true)
      this.muzzleRef.updateWorldMatrix(true, false)
      this.muzzleRef.getWorldPosition(_muzzlePos)
      _overlayMuzzleNdc.copy(_muzzlePos).project(this.overlayCamera)
      this.overlayMuzzleNdcForDiagnostics.copy(_overlayMuzzleNdc)
      this.hasLastOverlayMuzzleNdc = true
      if (!isUsableOverlayMuzzleProjection(_overlayMuzzleNdc)) {
        return this.resolveCameraBasisTracerStart(target, isADS)
      }
      _muzzleRayPoint
        .set(_overlayMuzzleNdc.x, _overlayMuzzleNdc.y, 0.5)
        .unproject(this.camera)
      _barrelDirection.subVectors(_muzzleRayPoint, _cameraPos)
      if (_barrelDirection.lengthSq() > 0.0001) {
        this.lastTracerProjectionMode = 'overlay-muzzle'
        return target.copy(_cameraPos).addScaledVector(
          _barrelDirection.normalize(),
          PLAYER_TRACER_FORWARD_PRESENTATION_DISTANCE
        )
      }
    }

    return this.resolveCameraBasisTracerStart(target, isADS)
  }

  private resolveCameraBasisTracerStart(target: THREE.Vector3, isADS: boolean): THREE.Vector3 {
    if (isADS) {
      // ADS: barrel is centered on screen, use camera origin with small forward offset
      this.lastTracerProjectionMode = 'ads-camera'
      return target.copy(_cameraPos).addScaledVector(_forward, PLAYER_TRACER_FORWARD_PRESENTATION_DISTANCE)
    }

    this.camera.getWorldQuaternion(_cameraQuat)
    this.lastTracerProjectionMode = 'hip-camera'

    // Hip-fire: camera-relative offset to approximate barrel position.
    // Avoids NDC projection which can clamp to screen edges during recoil,
    // creating a visible second ray from the wrong origin.
    _cameraRight.set(1, 0, 0).applyQuaternion(_cameraQuat)
    _cameraUp.set(0, 1, 0).applyQuaternion(_cameraQuat)
    return target.copy(_cameraPos)
      .addScaledVector(_cameraRight, PLAYER_BARREL_FALLBACK_RIGHT)
      .addScaledVector(_cameraUp, PLAYER_BARREL_FALLBACK_UP)
      .addScaledVector(_forward, PLAYER_TRACER_FORWARD_PRESENTATION_DISTANCE)
  }

  private recordShotOriginDiagnostics(command: ShotCommand): void {
    this.lastShotOriginDiagnostics.weaponType = command.weaponType
    this.lastShotOriginDiagnostics.isADS = command.isADS
    this.lastShotOriginDiagnostics.projectionMode = this.lastTracerProjectionMode
    this.lastShotOriginDiagnostics.damageRayOrigin.copy(command.ray.origin)
    this.lastShotOriginDiagnostics.damageRayDirection.copy(command.ray.direction)
    this.lastShotOriginDiagnostics.visualTracerStart.copy(_barrelOrigin)
    this.lastShotOriginDiagnostics.visualTracerEnd.copy(_tracerEnd)
    this.lastShotOriginDiagnostics.overlayMuzzleNdc = this.hasLastOverlayMuzzleNdc
      ? this.overlayMuzzleNdcForDiagnostics
      : null
    this.hasLastShotOriginDiagnostics = true
  }

  getLastShotOriginDiagnostics(): ShotOriginDiagnostics | null {
    if (!this.hasLastShotOriginDiagnostics) return null
    return {
      weaponType: this.lastShotOriginDiagnostics.weaponType,
      isADS: this.lastShotOriginDiagnostics.isADS,
      projectionMode: this.lastShotOriginDiagnostics.projectionMode,
      damageRayOrigin: this.lastShotOriginDiagnostics.damageRayOrigin.clone(),
      damageRayDirection: this.lastShotOriginDiagnostics.damageRayDirection.clone(),
      visualTracerStart: this.lastShotOriginDiagnostics.visualTracerStart.clone(),
      visualTracerEnd: this.lastShotOriginDiagnostics.visualTracerEnd.clone(),
      overlayMuzzleNdc: this.lastShotOriginDiagnostics.overlayMuzzleNdc?.clone() ?? null,
    }
  }

  getGunCore(): GunplayCore {
    return this.gunCore
  }
}

function isUsableOverlayMuzzleProjection(ndc: THREE.Vector3): boolean {
  return Number.isFinite(ndc.x)
    && Number.isFinite(ndc.y)
    && Number.isFinite(ndc.z)
    && Math.abs(ndc.x) <= PLAYER_TRACER_OVERLAY_NDC_LIMIT
    && Math.abs(ndc.y) <= PLAYER_TRACER_OVERLAY_NDC_LIMIT
}
