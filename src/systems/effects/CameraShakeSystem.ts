import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { GameEventBus } from '../../core/GameEventBus';

interface ShakeState {
  intensity: number;
  duration: number;
  elapsed: number;
  frequency: number; // Shake frequency in Hz
}

// ── Shake parameters ──
const MAX_INTENSITY = 2.5;
const DEFAULT_FREQUENCY = 20;
const NOISE_TIME_SCALE = 10;

// Explosion shake
const EXPLOSION_SHAKE_RADIUS_MULT = 1.5;
const EXPLOSION_INTENSITY = 1.5;
const EXPLOSION_BASE_DURATION = 0.3;
const EXPLOSION_DURATION_SCALE = 0.2;
const EXPLOSION_FREQUENCY = 25;

// Damage shake
const DAMAGE_INTENSITY_DIVISOR = 50;
const DAMAGE_MAX_INTENSITY = 1.2;
const DAMAGE_BASE_DURATION = 0.15;
const DAMAGE_DURATION_SCALE = 0.15;
const DAMAGE_FREQUENCY = 30;

// Nearby death shake
const DEATH_SHAKE_MAX_DISTANCE = 20;
const DEATH_SHAKE_INTENSITY = 0.15;
const DEATH_SHAKE_DURATION = 0.2;
const DEATH_SHAKE_FREQUENCY = 15;

// Recoil shake
const RECOIL_INTENSITY = 0.08;
const RECOIL_DURATION = 0.06;
const RECOIL_FREQUENCY = 25;

// Envelope
const SHAKE_FADE_FRACTION = 0.3;
const SHAKE_MAX_ANGLE_PER_UNIT = 0.6; // degrees

export class CameraShakeSystem implements GameSystem {
  private activeShakes: ShakeState[] = [];
  private noiseOffset: number = 0;
  private readonly MAX_INTENSITY = MAX_INTENSITY;
  private readonly DEFAULT_FREQUENCY = DEFAULT_FREQUENCY;
  private camera?: THREE.Camera;
  private eventUnsubscribes: (() => void)[] = [];

  async init(): Promise<void> {
    Logger.info('effects', 'Initializing Camera Shake System...');

    // Subscribe to explosion events for distance-based shake.
    // GrenadeEffects already calls playerController.applyExplosionShake directly,
    // so this subscription is a migration target. It will only fire when a camera
    // reference has been set via setCamera().
    this.eventUnsubscribes.push(
      GameEventBus.subscribe('explosion', (e) => {
        if (!this.camera) return;
        this.shakeFromExplosion(e.position, this.camera.position, e.radius);
      }),
    );
  }

  update(deltaTime: number): void {
    this.noiseOffset += deltaTime * NOISE_TIME_SCALE;

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

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  dispose(): void {
    for (const unsub of this.eventUnsubscribes) unsub();
    this.eventUnsubscribes.length = 0;
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

    const effectiveRadius = maxRadius * EXPLOSION_SHAKE_RADIUS_MULT;
    if (distance > effectiveRadius) return;

    const falloff = Math.max(0, 1 - (distance / effectiveRadius));
    const intensity = EXPLOSION_INTENSITY * falloff * falloff;
    const duration = EXPLOSION_BASE_DURATION + (EXPLOSION_DURATION_SCALE * falloff);

    this.shake(intensity, duration, EXPLOSION_FREQUENCY);
  }

  /**
   * Apply shake from player taking damage
   * @param damageAmount Amount of damage taken
   */
  shakeFromDamage(damageAmount: number): void {
    const intensity = Math.min(damageAmount / DAMAGE_INTENSITY_DIVISOR, DAMAGE_MAX_INTENSITY);
    const duration = DAMAGE_BASE_DURATION + (intensity * DAMAGE_DURATION_SCALE);

    this.shake(intensity, duration, DAMAGE_FREQUENCY);
  }

  /**
   * Apply shake from nearby combatant death
   * @param deathPos Position of death
   * @param playerPos Player camera position
   */
  shakeFromNearbyDeath(deathPos: THREE.Vector3, playerPos: THREE.Vector3): void {
    const distance = deathPos.distanceTo(playerPos);
    if (distance > DEATH_SHAKE_MAX_DISTANCE) return;

    const falloff = Math.max(0, 1 - (distance / DEATH_SHAKE_MAX_DISTANCE));
    const intensity = DEATH_SHAKE_INTENSITY * falloff;

    this.shake(intensity, DEATH_SHAKE_DURATION, DEATH_SHAKE_FREQUENCY);
  }

  /**
   * Apply subtle recoil shake from weapon firing
   */
  shakeFromRecoil(): void {
    this.shake(RECOIL_INTENSITY, RECOIL_DURATION, RECOIL_FREQUENCY);
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
      const fadeOut = Math.min(1, remainingTime / (shake.duration * SHAKE_FADE_FRACTION));
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
      const maxAngleRad = THREE.MathUtils.degToRad(shake.intensity * SHAKE_MAX_ANGLE_PER_UNIT);
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
      const fadeOut = Math.min(1, (shake.duration - shake.elapsed) / (shake.duration * SHAKE_FADE_FRACTION));
      return sum + (shake.intensity * fadeOut);
    }, 0);
  }
}
