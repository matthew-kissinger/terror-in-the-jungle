// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../../utils/Logger';
import * as THREE from 'three'

/** Weapon-type identity used to resolve the per-weapon ADS sight-line offset. */
export type WeaponAdsType = 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher' | 'marksman' | 'sks'

type AdsOffset = { x: number; y: number; z: number }

/**
 * Handles weapon animations: ADS transitions, recoil, idle bob, sway, pump action
 */
export class WeaponAnimations {
  // ADS state
  private isADS = false
  private adsProgress = 0 // 0..1
  private readonly ADS_TIME = 0.18 // seconds (baseline transition time)
  // Handling-speed penalty multiplier on the ADS transition time (1.0 = none).
  // Heavier ammo loads set this > 1.0 so aiming-down-sights is slower; the
  // baseline (STANDARD load) keeps the effective ADS time at ADS_TIME exactly.
  private adsTimeFactor = 1


  // Recoil recovery with spring physics
  private weaponRecoilOffset = { x: 0, y: 0, z: 0, rotX: 0 }
  private weaponRecoilVelocity = { x: 0, y: 0, z: 0, rotX: 0 }
  private readonly RECOIL_SPRING_STIFFNESS = 120
  private readonly RECOIL_SPRING_DAMPING = 15
  // Viewmodel-recoil saturation. The underdamped spring had no positional clamp,
  // so at automatic fire rates the up/back offset stacked (~2.5x a single shot)
  // and the gun rode visibly high in the frame. These cap how far the viewmodel
  // rides; the incoming impulse is also scaled by remaining headroom (see
  // applyRecoilImpulse) so it eases into the plateau rather than hard-walling.
  // Each ceiling sits above a single shot's peak (y~0.040, z~-0.073, rotX~0.004),
  // so single-shot kick is visually unchanged; sustained fire holds below them.
  private readonly RECOIL_MAX_Y = 0.055     // up offset ceiling (world units)
  private readonly RECOIL_MAX_ROTX = 0.018  // pitch-rotation ceiling (radians)
  private readonly RECOIL_MAX_Z = 0.11      // backward offset ceiling (world units)
  private readonly RECOIL_MAX_X = 0.045     // horizontal offset ceiling (world units)
  private readonly RECOIL_MAX_RECOVERY_STEP = 1 / 60
  private readonly RECOIL_MAX_RECOVERY_DT = 0.12

  // Idle motion
  private idleTime = 0
  private bobOffset = { x: 0, y: 0 }
  private swayOffset = { x: 0, y: 0 }

  // Base position (relative to screen)
  private readonly basePosition = { x: 0.5, y: -0.6, z: -0.82 }
  // ADS sight-line drop: y tuned against the center crosshair via headless
  // screenshot alignment (the rifle's front sight post lands on the reticle).
  // Previously -0.18, which sat the gun body above the crosshair so iron sights
  // never lined up. See tools/weapon/capture-ads-align.mjs.
  // This is the GLOBAL DEFAULT (tuned for the M16); weapons whose body occludes
  // the sight line at this pose get a per-weapon override in adsPositionOverrides.
  private readonly adsPosition: AdsOffset = { x: 0.0, y: -0.44, z: -0.55 }
  // Per-weapon ADS sight-line overrides, keyed by weapon type. The bulky M60
  // ('lmg') is taller and longer than the M16, so the default pose lays its
  // receiver across the sight line. Dropping it lower (more negative y) and
  // pulling it slightly back (more negative z) clears the iron sights while
  // leaving every other gun on the M16-tuned default. Weapons absent from this
  // table fall back to adsPosition. ADS timing/recoil/hip pose are unchanged.
  private readonly adsPositionOverrides: Partial<Record<WeaponAdsType, AdsOffset>> = {
    lmg: { x: 0.0, y: -0.6, z: -0.62 },
    // The Dragunov is long with a high scope line; drop it lower and pull it
    // slightly back so the optic sits on the reticle at the deeper marksman zoom.
    marksman: { x: 0.0, y: -0.5, z: -0.6 },
  }

  // Per-weapon ADS FOV-zoom divisor. ADS lerps the FOV from baseFOV toward
  // baseFOV/divisor, so a LARGER divisor = tighter ("more zoomed") sight picture.
  // Weapons absent from this table use ADS_FOV_DIVISOR_DEFAULT (the shared
  // baseFOV/1.3 that every iron-sight weapon used before). Only the marksman
  // overrides it here, for the "scope" feel — no other weapon changes.
  private readonly ADS_FOV_DIVISOR_DEFAULT = 1.3
  private readonly adsFovDivisorOverrides: Partial<Record<WeaponAdsType, number>> = {
    marksman: 2.6,
  }

  private baseFOV = 75 // Store base FOV for zoom effect
  private camera?: THREE.Camera

  // Pump-action animation state (for shotgun)
  private pumpAnimationProgress = 0
  private isPumpAnimating = false
  private readonly PUMP_ANIMATION_TIME = 0.35 // Quick pump action
  private pumpGripRef?: THREE.Object3D
  private readonly SWAY_SPEED_FACTOR_CAP_SQ = 100

  constructor(camera: THREE.Camera) {
    this.camera = camera
    if (camera instanceof THREE.PerspectiveCamera) {
      this.baseFOV = camera.fov
    }
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera
    if (camera instanceof THREE.PerspectiveCamera) {
      this.baseFOV = camera.fov
    }
  }

  setPumpGripRef(ref: THREE.Object3D | undefined): void {
    this.pumpGripRef = ref
  }

  update(deltaTime: number, isMoving: boolean, lookVelocity: THREE.Vector3, weaponType?: WeaponAdsType): void {
    // Update idle animation
    this.idleTime += deltaTime

    // Calculate idle bobbing
    if (isMoving) {
      // Walking bob - bigger movements
      this.bobOffset.x = Math.sin(this.idleTime * 8) * 0.04
      this.bobOffset.y = Math.abs(Math.sin(this.idleTime * 8)) * 0.06
    } else {
      // Gentle breathing motion when standing
      this.bobOffset.x = Math.sin(this.idleTime * 2) * 0.01
      this.bobOffset.y = Math.sin(this.idleTime * 2) * 0.02
    }

    // Mouse-look sway (small)
    const lookVelocitySq = lookVelocity.lengthSq()
    const speedFactor = lookVelocitySq >= this.SWAY_SPEED_FACTOR_CAP_SQ ? 1 : Math.sqrt(lookVelocitySq) / 10
    this.swayOffset.x = THREE.MathUtils.lerp(this.swayOffset.x, speedFactor * 0.02, 8 * deltaTime)
    this.swayOffset.y = THREE.MathUtils.lerp(this.swayOffset.y, speedFactor * 0.02, 8 * deltaTime)

    // ADS transition (effective time = baseline * handling penalty factor)
    const target = this.isADS ? 1 : 0
    const adsTime = this.ADS_TIME * this.adsTimeFactor
    const k = adsTime > 0 ? Math.min(1, deltaTime / adsTime) : 1
    this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, target, k)

    // Apply FOV zoom when ADS. The zoom divisor is per-weapon (the marksman
    // zooms deeper for the "scope" feel); unlisted weapons use the shared default.
    if (this.camera instanceof THREE.PerspectiveCamera) {
      const divisor = this.getADSFovDivisor(weaponType)
      const targetFOV = THREE.MathUtils.lerp(this.baseFOV, this.baseFOV / divisor, this.adsProgress)
      if (this.camera.fov !== targetFOV) {
        this.camera.fov = targetFOV
        this.camera.updateProjectionMatrix()
      }
    }

    // Apply recoil recovery spring physics
    this.updateRecoilRecovery(deltaTime)

    // Update pump animation (shotgun)
    if (this.isPumpAnimating) {
      this.updatePumpAnimation(deltaTime)
    }
  }

  /** Callback fired when ADS state changes. */
  onADSChange?: (ads: boolean) => void

  setADS(enabled: boolean): void {
    if (this.isADS !== enabled) {
      this.isADS = enabled
      this.onADSChange?.(enabled)
    }
  }

  getADS(): boolean {
    return this.isADS
  }

  getADSProgress(): number {
    return this.adsProgress
  }

  /**
   * Scale the ADS-transition time by a handling penalty factor (1.0 = no
   * penalty / baseline). Values > 1.0 slow the aim-down-sights transition;
   * used by the selectable ammo load so heavier reserves cost handling speed.
   * Clamped to a sane floor so a bad value can never speed ADS up.
   */
  setAdsTimeFactor(factor: number): void {
    this.adsTimeFactor = Number.isFinite(factor) ? Math.max(1, factor) : 1
  }

  applyRecoilImpulse(recoilMultiplier: number): void {
    // Scale each impulse component by the spring's remaining headroom toward its
    // saturation ceiling. A rested viewmodel (offset ~0) gets the full kick, so a
    // single shot is unchanged; under sustained fire the offset approaches the cap
    // and the headroom shrinks toward 0, easing the gun onto a believable plateau
    // instead of stacking ever higher. updateRecoilRecovery() also hard-clamps the
    // offsets as a backstop.
    const headroomZ = THREE.MathUtils.clamp(1 - -this.weaponRecoilOffset.z / this.RECOIL_MAX_Z, 0, 1)
    const headroomY = THREE.MathUtils.clamp(1 - this.weaponRecoilOffset.y / this.RECOIL_MAX_Y, 0, 1)
    const headroomRotX = THREE.MathUtils.clamp(1 - this.weaponRecoilOffset.rotX / this.RECOIL_MAX_ROTX, 0, 1)
    const headroomX = THREE.MathUtils.clamp(1 - Math.abs(this.weaponRecoilOffset.x) / this.RECOIL_MAX_X, 0, 1)

    this.weaponRecoilVelocity.z -= 2.2 * recoilMultiplier * headroomZ // Backward kick
    this.weaponRecoilVelocity.y += 1.2 * recoilMultiplier * headroomY // Upward kick
    this.weaponRecoilVelocity.rotX += 0.12 * recoilMultiplier * headroomRotX // Rotation kick

    // Small random horizontal kick for variety
    this.weaponRecoilVelocity.x += (Math.random() - 0.5) * 0.4 * headroomX
  }

  getRecoilOffset(): { x: number; y: number; z: number; rotX: number } {
    return this.weaponRecoilOffset
  }

  getBobOffset(): { x: number; y: number } {
    return this.bobOffset
  }

  getSwayOffset(): { x: number; y: number } {
    return this.swayOffset
  }

  getBasePosition(): { x: number; y: number; z: number } {
    return this.basePosition
  }

  /**
   * Resolve the ADS sight-line offset for the active weapon. Returns the
   * per-weapon override when one exists (e.g. the bulky M60 'lmg'), otherwise the
   * M16-tuned global default. Call with no argument to get the default.
   */
  getADSPosition(weaponType?: WeaponAdsType): { x: number; y: number; z: number } {
    if (weaponType) {
      const override = this.adsPositionOverrides[weaponType]
      if (override) return override
    }
    return this.adsPosition
  }

  /**
   * Resolve the ADS FOV-zoom divisor for the active weapon. Returns the
   * per-weapon override when one exists (e.g. the marksman's deeper "scope"
   * zoom), otherwise the shared default. Call with no argument for the default.
   */
  getADSFovDivisor(weaponType?: WeaponAdsType): number {
    if (weaponType) {
      const override = this.adsFovDivisorOverrides[weaponType]
      if (override !== undefined) return override
    }
    return this.ADS_FOV_DIVISOR_DEFAULT
  }

  startPumpAnimation(): void {
    // Don't start a new pump animation if one is already playing
    if (this.isPumpAnimating) return

    this.isPumpAnimating = true
    this.pumpAnimationProgress = 0
    Logger.info('player', 'Pump action!')
  }

  getPumpOffset(): { x: number; y: number; z: number } {
    return { x: 0, y: 0, z: 0 } // Pump animation is handled on pumpGripRef directly
  }

  getIsPumpAnimating(): boolean {
    return this.isPumpAnimating
  }

  private updateRecoilRecovery(deltaTime: number): void {
    const recoveryDt = THREE.MathUtils.clamp(deltaTime, 0, this.RECOIL_MAX_RECOVERY_DT)
    if (recoveryDt <= 0) return

    const steps = Math.max(1, Math.ceil(recoveryDt / this.RECOIL_MAX_RECOVERY_STEP))
    const stepDt = recoveryDt / steps
    for (let i = 0; i < steps; i++) {
      this.integrateRecoilRecoveryStep(stepDt)
    }
  }

  private integrateRecoilRecoveryStep(deltaTime: number): void {
    // Spring physics for smooth recoil recovery
    const springForceX = -this.weaponRecoilOffset.x * this.RECOIL_SPRING_STIFFNESS
    const springForceY = -this.weaponRecoilOffset.y * this.RECOIL_SPRING_STIFFNESS
    const springForceZ = -this.weaponRecoilOffset.z * this.RECOIL_SPRING_STIFFNESS
    const springForceRotX = -this.weaponRecoilOffset.rotX * this.RECOIL_SPRING_STIFFNESS

    // Apply damping
    const dampingX = -this.weaponRecoilVelocity.x * this.RECOIL_SPRING_DAMPING
    const dampingY = -this.weaponRecoilVelocity.y * this.RECOIL_SPRING_DAMPING
    const dampingZ = -this.weaponRecoilVelocity.z * this.RECOIL_SPRING_DAMPING
    const dampingRotX = -this.weaponRecoilVelocity.rotX * this.RECOIL_SPRING_DAMPING

    // Update velocity
    this.weaponRecoilVelocity.x += (springForceX + dampingX) * deltaTime
    this.weaponRecoilVelocity.y += (springForceY + dampingY) * deltaTime
    this.weaponRecoilVelocity.z += (springForceZ + dampingZ) * deltaTime
    this.weaponRecoilVelocity.rotX += (springForceRotX + dampingRotX) * deltaTime

    // Update position
    this.weaponRecoilOffset.x += this.weaponRecoilVelocity.x * deltaTime
    this.weaponRecoilOffset.y += this.weaponRecoilVelocity.y * deltaTime
    this.weaponRecoilOffset.z += this.weaponRecoilVelocity.z * deltaTime
    this.weaponRecoilOffset.rotX += this.weaponRecoilVelocity.rotX * deltaTime

    // Saturate the viewmodel offset so sustained fire holds a believable height
    // instead of riding ever higher in the frame. The headroom-scaled impulse
    // normally keeps us below these; this is the hard backstop.
    this.saturateRecoilOffset()
  }

  private saturateRecoilOffset(): void {
    this.weaponRecoilOffset.x = this.saturateRecoilComponent(
      this.weaponRecoilOffset.x,
      'x',
      this.RECOIL_MAX_X
    )
    this.weaponRecoilOffset.y = this.saturateRecoilComponent(
      this.weaponRecoilOffset.y,
      'y',
      this.RECOIL_MAX_Y
    )
    this.weaponRecoilOffset.z = this.saturateRecoilComponent(
      this.weaponRecoilOffset.z,
      'z',
      this.RECOIL_MAX_Z
    )
    this.weaponRecoilOffset.rotX = this.saturateRecoilComponent(
      this.weaponRecoilOffset.rotX,
      'rotX',
      this.RECOIL_MAX_ROTX
    )
  }

  private saturateRecoilComponent(
    value: number,
    axis: keyof typeof this.weaponRecoilVelocity,
    limit: number
  ): number {
    const clamped = THREE.MathUtils.clamp(value, -limit, limit)
    if (clamped !== value && Math.sign(this.weaponRecoilVelocity[axis]) === Math.sign(value)) {
      this.weaponRecoilVelocity[axis] = 0
    }
    return clamped
  }

  private updatePumpAnimation(deltaTime: number): void {
    if (!this.isPumpAnimating) return

    // Update pump animation progress
    this.pumpAnimationProgress += deltaTime / this.PUMP_ANIMATION_TIME

    if (this.pumpAnimationProgress >= 1) {
      this.pumpAnimationProgress = 1
      this.isPumpAnimating = false
      return
    }

    // Calculate pump animation based on progress
    this.calculatePumpAnimation(this.pumpAnimationProgress)
  }

  private calculatePumpAnimation(progress: number): void {
    // Two-stage pump animation:
    // Stage 1 (0-50%): Pull pump grip backward
    // Stage 2 (50-100%): Push pump grip forward

    let pumpPosition = 0

    if (progress < 0.5) {
      // Stage 1: Pull back
      const t = progress / 0.5
      const ease = this.easeOutCubic(t)
      pumpPosition = -0.2 * ease // Pull backward
    } else {
      // Stage 2: Push forward
      const t = (progress - 0.5) / 0.5
      const ease = this.easeInOutQuad(t)
      pumpPosition = -0.2 * (1 - ease) // Return to normal
    }

    // Apply to pump grip if it exists
    if (this.pumpGripRef) {
      // Store original position if not already stored
      if (!this.pumpGripRef.userData.originalX) {
        this.pumpGripRef.userData.originalX = this.pumpGripRef.position.x
      }
      // Move pump grip along X axis (barrel direction)
      this.pumpGripRef.position.x = this.pumpGripRef.userData.originalX + pumpPosition
    }
  }

  // Easing functions
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  reset(): void {
    this.isADS = false
    this.adsProgress = 0
    this.weaponRecoilOffset = { x: 0, y: 0, z: 0, rotX: 0 }
    this.weaponRecoilVelocity = { x: 0, y: 0, z: 0, rotX: 0 }
    this.idleTime = 0
    this.bobOffset = { x: 0, y: 0 }
    this.swayOffset = { x: 0, y: 0 }
  }
}
