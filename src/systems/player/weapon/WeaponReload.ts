import * as THREE from 'three'
import { AudioManager } from '../../audio/AudioManager'

/**
 * Handles reload state machine and magazine animations
 */
export class WeaponReload {
  // Reload animation state
  private reloadAnimationProgress = 0
  private isReloadAnimating = false
  private readonly RELOAD_ANIMATION_TIME = 2.5
  private reloadRotation = { x: 0, y: 0, z: 0 }
  private reloadTranslation = { x: 0, y: 0, z: 0 }
  private magazineOffset = { x: 0, y: 0, z: 0 } // Magazine animation offset
  private magazineRotation = { x: 0, y: 0, z: 0 } // Magazine rotation during reload
  private magazineRef?: THREE.Object3D
  private audioManager?: AudioManager

  constructor() {}

  setMagazineRef(ref: THREE.Object3D | undefined): void {
    this.magazineRef = ref
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager
  }

  startReload(canReload: () => boolean): boolean {
    if (this.isReloadAnimating) return false

    if (canReload()) {
      this.isReloadAnimating = true
      this.reloadAnimationProgress = 0

      // Play reload sound if available
      if (this.audioManager) {
        this.audioManager.playReloadSound()
      }
      return true
    }
    return false
  }

  update(deltaTime: number): void {
    if (!this.isReloadAnimating) return

    // Update reload animation progress
    this.reloadAnimationProgress += deltaTime / this.RELOAD_ANIMATION_TIME

    if (this.reloadAnimationProgress >= 1) {
      this.reloadAnimationProgress = 1
      this.isReloadAnimating = false
      // Reset animation values
      this.reloadRotation = { x: 0, y: 0, z: 0 }
      this.reloadTranslation = { x: 0, y: 0, z: 0 }
      this.magazineOffset = { x: 0, y: 0, z: 0 }
      this.magazineRotation = { x: 0, y: 0, z: 0 }

      // Reset magazine to default position
      if (this.magazineRef) {
        this.magazineRef.position.set(0.2, -0.25, 0)
        this.magazineRef.rotation.set(0, 0, 0.1)
      }
      return
    }

    // Calculate reload animation based on progress
    this.calculateReloadAnimation(this.reloadAnimationProgress)
  }

  isAnimating(): boolean {
    return this.isReloadAnimating
  }

  getReloadRotation(): { x: number; y: number; z: number } {
    return this.reloadRotation
  }

  getReloadTranslation(): { x: number; y: number; z: number } {
    return this.reloadTranslation
  }

  getMagazineOffset(): { x: number; y: number; z: number } {
    return this.magazineOffset
  }

  getMagazineRotation(): { x: number; y: number; z: number } {
    return this.magazineRotation
  }

  private calculateReloadAnimation(progress: number): void {
    // Multi-stage reload animation with magazine detachment
    // Stage 1 (0-20%): Tilt gun right to expose magazine
    // Stage 2 (20-40%): Pull magazine out downward
    // Stage 3 (40-50%): Magazine falls away, pause
    // Stage 4 (50-70%): Insert new magazine from below
    // Stage 5 (70-85%): Rotate gun back to center
    // Stage 6 (85-100%): Chamber round (slight pull back)

    if (progress < 0.2) {
      // Stage 1: Tilt gun right
      const t = progress / 0.2
      const ease = this.easeInOutQuad(t)
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25) * ease // Tilt right
      this.reloadRotation.y = THREE.MathUtils.degToRad(15) * ease // Turn slightly
      this.reloadTranslation.x = 0.15 * ease // Move right slightly
    } else if (progress < 0.4) {
      // Stage 2: Pull mag out downward
      const t = (progress - 0.2) / 0.2
      const ease = this.easeOutCubic(t)
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25)
      this.reloadRotation.y = THREE.MathUtils.degToRad(15)
      this.reloadTranslation.x = 0.15

      // Magazine detaches and drops
      this.magazineOffset.y = -0.4 * ease // Drop down
      this.magazineOffset.x = -0.1 * ease // Slight left movement
      this.magazineRotation.z = THREE.MathUtils.degToRad(-15) * ease // Tilt as it drops
    } else if (progress < 0.5) {
      // Stage 3: Magazine fully detached, pause
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25)
      this.reloadRotation.y = THREE.MathUtils.degToRad(15)
      this.reloadTranslation.x = 0.15

      // Magazine fully dropped
      this.magazineOffset.y = -0.6 // Off screen
      this.magazineOffset.x = -0.15
      this.magazineRotation.z = THREE.MathUtils.degToRad(-20)
    } else if (progress < 0.7) {
      // Stage 4: Insert new mag from below
      const t = (progress - 0.5) / 0.2
      const ease = this.easeInCubic(t)
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25)
      this.reloadRotation.y = THREE.MathUtils.degToRad(15)
      this.reloadTranslation.x = 0.15

      // Magazine slides back up into place
      this.magazineOffset.y = -0.6 + (0.6 * ease) // Rise from below
      this.magazineOffset.x = -0.15 + (0.15 * ease) // Move back to center
      this.magazineRotation.z = THREE.MathUtils.degToRad(-20) * (1 - ease) // Straighten
    } else if (progress < 0.85) {
      // Stage 5: Rotate gun back to center
      const t = (progress - 0.7) / 0.15
      const ease = this.easeInOutQuad(t)
      this.reloadRotation.z = THREE.MathUtils.degToRad(-25) * (1 - ease)
      this.reloadRotation.y = THREE.MathUtils.degToRad(15) * (1 - ease)
      this.reloadTranslation.x = 0.15 * (1 - ease)

      // Magazine locked in place
      this.magazineOffset.y = 0
      this.magazineOffset.x = 0
      this.magazineRotation.z = 0
    } else {
      // Stage 6: Chamber round (slight pull back)
      const t = (progress - 0.85) / 0.15
      const ease = this.easeOutCubic(t)
      const pullBack = ease < 0.5 ? ease * 2 : (1 - ease) * 2
      this.reloadTranslation.z = -0.05 * pullBack // Pull back slightly
      this.reloadRotation.x = THREE.MathUtils.degToRad(-3) * pullBack // Slight upward kick

      // Magazine stays in place
      this.magazineOffset.y = 0
      this.magazineOffset.x = 0
      this.magazineRotation.z = 0
    }

    // Update magazine position if it exists
    if (this.magazineRef) {
      this.magazineRef.position.x = 0.2 + this.magazineOffset.x
      this.magazineRef.position.y = -0.25 + this.magazineOffset.y
      this.magazineRef.position.z = 0 + this.magazineOffset.z

      this.magazineRef.rotation.x = this.magazineRotation.x
      this.magazineRef.rotation.y = this.magazineRotation.y
      this.magazineRef.rotation.z = 0.1 + this.magazineRotation.z
    }
  }

  // Easing functions
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  private easeInCubic(t: number): number {
    return t * t * t
  }
}
