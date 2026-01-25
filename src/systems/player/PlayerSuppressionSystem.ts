import * as THREE from 'three';
import { GameSystem } from '../../types';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';

export interface SuppressionState {
  level: number; // 0-1 suppression level
  nearMissCount: number; // Track recent near misses
  lastNearMissTime: number; // Timestamp of last near miss
  decayRate: number; // How fast suppression decays
}

export class PlayerSuppressionSystem implements GameSystem {
  private suppressionState: SuppressionState = {
    level: 0,
    nearMissCount: 0,
    lastNearMissTime: 0,
    decayRate: 0.5 // 0.5 units per second when not being shot at
  };

  // Tuning parameters
  private readonly NEAR_MISS_RADIUS = 2.5; // Distance in meters to count as near miss
  private readonly NEAR_MISS_DECAY_TIME = 3.0; // Seconds before near miss count starts decaying
  private readonly LOW_SUPPRESSION = 0.3; // 1-3 near misses
  private readonly MEDIUM_SUPPRESSION = 0.6; // 4-6 near misses
  private readonly HIGH_SUPPRESSION = 0.9; // 7+ near misses

  private cameraShakeSystem?: CameraShakeSystem;
  private vignetteElement?: HTMLDivElement;
  private playerController?: any;

  async init(): Promise<void> {
    console.log('🎯 Initializing Player Suppression System...');
    this.createVignetteOverlay();
    console.log('✅ Player Suppression System initialized');
  }

  update(deltaTime: number): void {
    // Decay suppression over time when not being shot at
    const timeSinceLastMiss = (Date.now() - this.suppressionState.lastNearMissTime) / 1000;

    if (timeSinceLastMiss > this.NEAR_MISS_DECAY_TIME) {
      // Decay near miss count
      this.suppressionState.nearMissCount = Math.max(
        0,
        this.suppressionState.nearMissCount - deltaTime * this.suppressionState.decayRate
      );

      // Decay suppression level faster when out of fire
      this.suppressionState.level = Math.max(
        0,
        this.suppressionState.level - deltaTime * this.suppressionState.decayRate
      );
    }

    // Update visual effects based on suppression level
    this.updateVisualEffects();
  }

  dispose(): void {
    if (this.vignetteElement) {
      this.vignetteElement.remove();
    }
    console.log('🧹 Player Suppression System disposed');
  }

  /**
   * Register a near miss from an enemy bullet
   * @param bulletPosition Position where bullet passed/impacted
   * @param playerPosition Current player position
   */
  registerNearMiss(bulletPosition: THREE.Vector3, playerPosition: THREE.Vector3): void {
    const distance = bulletPosition.distanceTo(playerPosition);

    // Only count if within suppression radius
    if (distance > this.NEAR_MISS_RADIUS) return;

    // Increment near miss count
    this.suppressionState.nearMissCount += 1;
    this.suppressionState.lastNearMissTime = Date.now();

    // Calculate proximity factor (closer = more intense)
    const proximityFactor = 1.0 - (distance / this.NEAR_MISS_RADIUS);

    // Increase suppression level based on proximity
    this.suppressionState.level = Math.min(
      1.0,
      this.suppressionState.level + 0.15 * proximityFactor
    );

    // Apply camera shake for near miss
    if (this.cameraShakeSystem) {
      const shakeIntensity = 0.15 * proximityFactor;
      this.cameraShakeSystem.shake(shakeIntensity, 0.2, 25);
    }

    console.log(`🔥 Near miss! Distance: ${distance.toFixed(1)}m, Suppression: ${(this.suppressionState.level * 100).toFixed(0)}%`);
  }

  /**
   * Create the vignette overlay element for visual feedback
   */
  private createVignetteOverlay(): void {
    this.vignetteElement = document.createElement('div');
    this.vignetteElement.id = 'suppression-vignette';
    this.vignetteElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
      opacity: 0;
      background: radial-gradient(circle at center, transparent 0%, transparent 40%, rgba(0, 0, 0, 0.8) 100%);
      transition: opacity 0.1s ease-out;
    `;
    document.body.appendChild(this.vignetteElement);
  }

  /**
   * Update visual effects based on current suppression level
   */
  private updateVisualEffects(): void {
    if (!this.vignetteElement) return;

    // Map suppression level to vignette opacity
    let opacity = 0;

    if (this.suppressionState.level >= this.HIGH_SUPPRESSION) {
      opacity = 0.7; // Very dark edges at high suppression
    } else if (this.suppressionState.level >= this.MEDIUM_SUPPRESSION) {
      opacity = 0.4; // Moderate darkening at medium suppression
    } else if (this.suppressionState.level >= this.LOW_SUPPRESSION) {
      opacity = 0.2; // Subtle darkening at low suppression
    }

    this.vignetteElement.style.opacity = opacity.toString();
  }

  /**
   * Get current suppression level (0-1)
   */
  getSuppressionLevel(): number {
    return this.suppressionState.level;
  }

  /**
   * Get current near miss count
   */
  getNearMissCount(): number {
    return this.suppressionState.nearMissCount;
  }

  /**
   * Check if player is currently suppressed
   */
  isSuppressed(): boolean {
    return this.suppressionState.level >= this.LOW_SUPPRESSION;
  }

  /**
   * Get suppression tier (low, medium, high)
   */
  getSuppressionTier(): 'none' | 'low' | 'medium' | 'high' {
    if (this.suppressionState.level >= this.HIGH_SUPPRESSION) return 'high';
    if (this.suppressionState.level >= this.MEDIUM_SUPPRESSION) return 'medium';
    if (this.suppressionState.level >= this.LOW_SUPPRESSION) return 'low';
    return 'none';
  }

  // System connections

  setCameraShakeSystem(system: CameraShakeSystem): void {
    this.cameraShakeSystem = system;
  }

  setPlayerController(controller: any): void {
    this.playerController = controller;
  }
}
