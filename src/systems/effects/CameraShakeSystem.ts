import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';

interface ShakeState {
  intensity: number;
  duration: number;
  elapsed: number;
  frequency: number; // Shake frequency in Hz
}

export class CameraShakeSystem implements GameSystem {
  private activeShakes: ShakeState[] = [];
  private noiseOffset: number = 0; // For Perlin-like noise
  private readonly MAX_INTENSITY = 2.5; // Cap intensity to prevent nausea
  private readonly DEFAULT_FREQUENCY = 20; // Default shake frequency (Hz)

  async init(): Promise<void> {
    Logger.info('effects', 'Initializing Camera Shake System...');
  }

  update(deltaTime: number): void {
    this.noiseOffset += deltaTime * 10; // Advance noise time

    // Update and remove expired shakes
    for (let i = this.activeShakes.length - 1; i >= 0; i--) {
      const shake = this.activeShakes[i];
      shake.elapsed += deltaTime;

      if (shake.elapsed >= shake.duration) {
        const last = this.activeShakes.length - 1;
        if (i !== last) {
          this.activeShakes[i] = this.activeShakes[last];
        }
        this.activeShakes.pop();
      }
    }
  }

  dispose(): void {
    this.activeShakes = [];
  }

  /**
   * Apply a generic camera shake
   * @param intensity Shake strength (0.1 = subtle, 1.0 = strong, 2.0+ = very intense)
   * @param duration Duration in seconds
   * @param frequency Shake frequency in Hz (optional, default 20Hz)
   */
  shake(intensity: number, duration: number, frequency?: number): void {
    this.activeShakes.push({
      intensity: Math.min(intensity, this.MAX_INTENSITY),
      duration,
      elapsed: 0,
      frequency: frequency || this.DEFAULT_FREQUENCY
    });
  }

  /**
   * Apply shake from explosion with distance-based falloff
   * @param explosionPos Position of explosion
   * @param playerPos Player camera position
   * @param maxRadius Maximum damage radius
   */
  shakeFromExplosion(explosionPos: THREE.Vector3, playerPos: THREE.Vector3, maxRadius: number): void {
    const distance = explosionPos.distanceTo(playerPos);

    if (distance > maxRadius * 1.5) return; // No shake beyond 1.5x radius

    // Falloff curve: full intensity at epicenter, 0 at 1.5x radius
    const falloff = Math.max(0, 1 - (distance / (maxRadius * 1.5)));
    const intensity = 1.5 * falloff * falloff; // Quadratic falloff for more punch

    // Longer shake for closer explosions
    const duration = 0.3 + (0.2 * falloff);

    this.shake(intensity, duration, 25); // Higher frequency for explosions
  }

  /**
   * Apply shake from player taking damage
   * @param damageAmount Amount of damage taken
   */
  shakeFromDamage(damageAmount: number): void {
    // Scale: 10 damage = 0.2 intensity, 50 damage = 1.0 intensity
    const intensity = Math.min(damageAmount / 50, 1.2);
    const duration = 0.15 + (intensity * 0.15); // 0.15-0.3s based on damage

    this.shake(intensity, duration, 30); // Fast shake for hit feedback
  }

  /**
   * Apply shake from nearby combatant death
   * @param deathPos Position of death
   * @param playerPos Player camera position
   */
  shakeFromNearbyDeath(deathPos: THREE.Vector3, playerPos: THREE.Vector3): void {
    const distance = deathPos.distanceTo(playerPos);
    const MAX_DEATH_SHAKE_DISTANCE = 20; // Only shake if death is within 20 units

    if (distance > MAX_DEATH_SHAKE_DISTANCE) return;

    // Falloff: full intensity at 0, zero at max distance
    const falloff = Math.max(0, 1 - (distance / MAX_DEATH_SHAKE_DISTANCE));
    const intensity = 0.15 * falloff; // Subtle shake
    const duration = 0.2;

    this.shake(intensity, duration, 15); // Low frequency for body impact
  }

  /**
   * Apply subtle recoil shake from weapon firing
   */
  shakeFromRecoil(): void {
    this.shake(0.08, 0.06, 25); // Very subtle, short shake
  }

  /**
   * Get current camera shake offset to apply to camera rotation
   * Returns offset in radians for pitch and yaw
   */
  getCurrentShakeOffset(): { pitch: number; yaw: number } {
    if (this.activeShakes.length === 0) {
      return { pitch: 0, yaw: 0 };
    }

    let totalPitch = 0;
    let totalYaw = 0;

    // Sum all active shakes
    for (const shake of this.activeShakes) {
      // Calculate decay envelope (smooth fade out)
      const remainingTime = shake.duration - shake.elapsed;
      const fadeOut = Math.min(1, remainingTime / (shake.duration * 0.3)); // Fade last 30%
      const envelope = fadeOut;

      // Use noise-like oscillation based on frequency
      const timePhase = this.noiseOffset * shake.frequency;

      // Generate pseudo-Perlin noise using multiple sine waves
      const noise1 = Math.sin(timePhase);
      const noise2 = Math.sin(timePhase * 1.7 + 100);
      const noise3 = Math.sin(timePhase * 2.3 + 200);

      // Combine noise for organic feel
      const noiseX = (noise1 + noise2 * 0.5 + noise3 * 0.3) / 1.8;
      const noiseY = (Math.sin(timePhase * 1.3 + 50) + Math.sin(timePhase * 2.1 + 150) * 0.5) / 1.5;

      // Apply intensity and envelope
      const maxAngleRad = THREE.MathUtils.degToRad(shake.intensity * 0.6); // Max 0.6 deg per unit
      totalYaw += noiseX * maxAngleRad * envelope;
      totalPitch += noiseY * maxAngleRad * envelope;
    }

    return { pitch: totalPitch, yaw: totalYaw };
  }

  /**
   * Check if any shakes are active
   */
  isShaking(): boolean {
    return this.activeShakes.length > 0;
  }

  /**
   * Get total shake intensity (for debug/visualization)
   */
  getTotalIntensity(): number {
    return this.activeShakes.reduce((sum, shake) => {
      const fadeOut = Math.min(1, (shake.duration - shake.elapsed) / (shake.duration * 0.3));
      return sum + (shake.intensity * fadeOut);
    }, 0);
  }
}
