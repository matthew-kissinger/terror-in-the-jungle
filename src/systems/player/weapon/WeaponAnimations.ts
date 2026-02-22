import { Logger } from '../../../utils/Logger';
import * as THREE from 'three'

/**
 * Handles weapon animations: ADS transitions, recoil, idle bob, sway, pump action
 */
export class WeaponAnimations {
  // ADS state
  private isADS = false
  private adsProgress = 0 // 0..1
  private readonly ADS_TIME = 0.18 // seconds

  // Recoil recovery with spring physics
  private weaponRecoilOffset = { x: 0, y: 0, z: 0, rotX: 0 }
  private weaponRecoilVelocity = { x: 0, y: 0, z: 0, rotX: 0 }
  private readonly RECOIL_SPRING_STIFFNESS = 120
  private readonly RECOIL_SPRING_DAMPING = 15

  // Idle motion
  private idleTime = 0
  private bobOffset = { x: 0, y: 0 }
  private swayOffset = { x: 0, y: 0 }

  // Base position (relative to screen)
  private readonly basePosition = { x: 0.5, y: -0.45, z: -0.75 }
  private readonly adsPosition = { x: 0.0, y: -0.18, z: -0.55 }

  private baseFOV = 75 // Store base FOV for zoom effect
  private camera?: THREE.Camera

  // Pump-action animation state (for shotgun)
  private pumpAnimationProgress = 0
  private isPumpAnimating = false
  private readonly PUMP_ANIMATION_TIME = 0.35 // Quick pump action
  private pumpGripRef?: THREE.Object3D

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

  update(deltaTime: number, isMoving: boolean, lookVelocity: THREE.Vector3): void {
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
    const speedFactor = Math.min(1, lookVelocity.length() / 10)
    this.swayOffset.x = THREE.MathUtils.lerp(this.swayOffset.x, speedFactor * 0.02, 8 * deltaTime)
    this.swayOffset.y = THREE.MathUtils.lerp(this.swayOffset.y, speedFactor * 0.02, 8 * deltaTime)

    // ADS transition
    const target = this.isADS ? 1 : 0
    const k = this.ADS_TIME > 0 ? Math.min(1, deltaTime / this.ADS_TIME) : 1
    this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, target, k)

    // Apply FOV zoom when ADS (reduced zoom for less disorientation)
    if (this.camera instanceof THREE.PerspectiveCamera) {
      const targetFOV = THREE.MathUtils.lerp(this.baseFOV, this.baseFOV / 1.3, this.adsProgress)
      this.camera.fov = targetFOV
      this.camera.updateProjectionMatrix()
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

  applyRecoilImpulse(recoilMultiplier: number): void {
    // Apply recoil impulse to weapon spring system
    this.weaponRecoilVelocity.z -= 2.2 * recoilMultiplier // Backward kick
    this.weaponRecoilVelocity.y += 1.2 * recoilMultiplier // Upward kick
    this.weaponRecoilVelocity.rotX += 0.12 * recoilMultiplier // Rotation kick

    // Small random horizontal kick for variety
    this.weaponRecoilVelocity.x += (Math.random() - 0.5) * 0.4
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

  getADSPosition(): { x: number; y: number; z: number } {
    return this.adsPosition
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
