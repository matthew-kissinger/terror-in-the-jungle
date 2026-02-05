import * as THREE from 'three';
import { GameSystem } from '../../types';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { Logger } from '../../utils/Logger';
import type { IPlayerController } from '../../types/SystemInterfaces';

export interface NearMissEvent {
  direction: THREE.Vector3; // Direction from player to bullet
  intensity: number; // 0-1 based on proximity
  timestamp: number;
}

export interface SuppressionState {
  level: number; // 0-1 suppression level
  nearMissCount: number; // Track recent near misses
  lastNearMissTime: number; // Timestamp of last near miss
  decayRate: number; // How fast suppression decays
  recentNearMisses: NearMissEvent[]; // Track directional near misses
}

export class PlayerSuppressionSystem implements GameSystem {
  private suppressionState: SuppressionState = {
    level: 0,
    nearMissCount: 0,
    lastNearMissTime: 0,
    decayRate: 0.5, // 0.5 units per second when not being shot at
    recentNearMisses: []
  };

  // Tuning parameters
  private readonly NEAR_MISS_RADIUS = 2.5; // Distance in meters to count as near miss
  private readonly NEAR_MISS_DECAY_TIME = 3.0; // Seconds before near miss count starts decaying
  private readonly LOW_SUPPRESSION = 0.3; // 1-3 near misses
  private readonly MEDIUM_SUPPRESSION = 0.6; // 4-6 near misses
  private readonly HIGH_SUPPRESSION = 0.9; // 7+ near misses

  private cameraShakeSystem?: CameraShakeSystem;
  private vignetteElement?: HTMLDivElement;
  private directionalOverlayElement?: HTMLDivElement;
  private directionalCanvas?: HTMLCanvasElement;
  private desaturationElement?: HTMLDivElement;
  private playerController?: IPlayerController;
  private boundOnResize: (() => void) | null = null;

  async init(): Promise<void> {
    Logger.info('Combat', 'Initializing Player Suppression System...');
    this.createVignetteOverlay();
    this.createDirectionalOverlay();
    this.createDesaturationOverlay();
    Logger.info('Combat', 'Player Suppression System initialized');
  }

  update(deltaTime: number): void {
    const now = Date.now();
    const timeSinceLastMiss = (now - this.suppressionState.lastNearMissTime) / 1000;

    // Decay recent near misses (remove events older than 2 seconds)
    this.suppressionState.recentNearMisses = this.suppressionState.recentNearMisses.filter(
      event => (now - event.timestamp) < 2000
    );

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
    if (this.boundOnResize) {
      window.removeEventListener('resize', this.boundOnResize);
      this.boundOnResize = null;
    }
    if (this.vignetteElement) {
      this.vignetteElement.remove();
    }
    if (this.directionalOverlayElement) {
      this.directionalOverlayElement.remove();
    }
    if (this.desaturationElement) {
      this.desaturationElement.remove();
    }
    Logger.info('Combat', 'Player Suppression System disposed');
  }

  /**
   * Register a near miss from an enemy bullet
   * @param bulletPosition Position where bullet passed/impacted
   * @param playerPosition Current player position
   * @param cameraDirection Optional camera direction for directional effects
   */
  registerNearMiss(bulletPosition: THREE.Vector3, playerPosition: THREE.Vector3, _cameraDirection?: THREE.Vector3): void {
    const distance = bulletPosition.distanceTo(playerPosition);

    // Only count if within suppression radius
    if (distance > this.NEAR_MISS_RADIUS) return;

    const now = Date.now();

    // Increment near miss count
    this.suppressionState.nearMissCount += 1;
    this.suppressionState.lastNearMissTime = now;

    // Calculate proximity factor (closer = more intense)
    const proximityFactor = 1.0 - (distance / this.NEAR_MISS_RADIUS);

    // Calculate direction from player to bullet
    const direction = new THREE.Vector3().subVectors(bulletPosition, playerPosition);
    direction.y = 0; // Keep horizontal for screen effects
    direction.normalize();

    // Add to recent near misses for directional effects
    this.suppressionState.recentNearMisses.push({
      direction: direction.clone(),
      intensity: proximityFactor,
      timestamp: now
    });

    // Cap at 5 most recent near misses to prevent accumulation
    if (this.suppressionState.recentNearMisses.length > 5) {
      this.suppressionState.recentNearMisses.shift();
    }

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

    Logger.debug('Combat', `Near miss! Distance: ${distance.toFixed(1)}m, Suppression: ${(this.suppressionState.level * 100).toFixed(0)}%`);
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
   * Create directional overlay canvas for near-miss directional effects
   */
  private createDirectionalOverlay(): void {
    this.directionalOverlayElement = document.createElement('div');
    this.directionalOverlayElement.id = 'suppression-directional';
    this.directionalOverlayElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 51;
    `;

    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = `
      width: 100%;
      height: 100%;
    `;

    this.directionalOverlayElement.appendChild(canvas);
    document.body.appendChild(this.directionalOverlayElement);

    // Handle window resize
    this.directionalCanvas = canvas;
    this.boundOnResize = () => {
      if (!this.directionalCanvas) return;
      this.directionalCanvas.width = window.innerWidth;
      this.directionalCanvas.height = window.innerHeight;
    };
    window.addEventListener('resize', this.boundOnResize);
  }

  /**
   * Create desaturation overlay for heavy suppression
   */
  private createDesaturationOverlay(): void {
    this.desaturationElement = document.createElement('div');
    this.desaturationElement.id = 'suppression-desaturation';
    this.desaturationElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 49;
      opacity: 0;
      background: transparent;
      backdrop-filter: saturate(100%);
      transition: opacity 0.2s ease-out, backdrop-filter 0.2s ease-out;
    `;
    document.body.appendChild(this.desaturationElement);
  }

  /**
   * Update visual effects based on current suppression level
   */
  private updateVisualEffects(): void {
    if (!this.vignetteElement) return;

    // Map suppression level to vignette opacity
    let vignetteOpacity = 0;

    if (this.suppressionState.level >= this.HIGH_SUPPRESSION) {
      vignetteOpacity = 0.7; // Very dark edges at high suppression
    } else if (this.suppressionState.level >= this.MEDIUM_SUPPRESSION) {
      vignetteOpacity = 0.4; // Moderate darkening at medium suppression
    } else if (this.suppressionState.level >= this.LOW_SUPPRESSION) {
      vignetteOpacity = 0.2; // Subtle darkening at low suppression
    }

    this.vignetteElement.style.opacity = vignetteOpacity.toString();

    // Update directional effects
    this.updateDirectionalEffects();

    // Update desaturation effect
    this.updateDesaturationEffect();
  }

  /**
   * Update directional screen effects based on recent near misses
   */
  private updateDirectionalEffects(): void {
    if (!this.directionalOverlayElement) return;

    const canvas = this.directionalOverlayElement.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Draw directional blur streaks for each recent near miss
    this.suppressionState.recentNearMisses.forEach(event => {
      const age = (now - event.timestamp) / 1000;
      const fadeFactor = Math.max(0, 1 - age / 2); // Fade over 2 seconds

      // Calculate angle for direction
      const angle = Math.atan2(event.direction.z, event.direction.x);

      // Calculate position on edge of screen
      const radius = Math.min(canvas.width, canvas.height) * 0.45;
      const edgeX = centerX + Math.cos(angle) * radius;
      const edgeY = centerY + Math.sin(angle) * radius;

      // Draw streaky blur effect from edge toward center
      const gradient = ctx.createRadialGradient(
        edgeX, edgeY, 0,
        edgeX, edgeY, 150
      );

      const opacity = event.intensity * fadeFactor * 0.3;
      gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
      gradient.addColorStop(0.3, `rgba(200, 200, 200, ${opacity * 0.5})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
  }

  /**
   * Update desaturation effect based on suppression level
   */
  private updateDesaturationEffect(): void {
    if (!this.desaturationElement) return;

    // Apply desaturation filter when heavily suppressed
    let desaturation = 0;

    if (this.suppressionState.level >= this.HIGH_SUPPRESSION) {
      desaturation = 60; // Heavy desaturation
    } else if (this.suppressionState.level >= this.MEDIUM_SUPPRESSION) {
      desaturation = 30; // Moderate desaturation
    } else if (this.suppressionState.level >= this.LOW_SUPPRESSION) {
      desaturation = 10; // Subtle desaturation
    }

    this.desaturationElement.style.filter = `saturate(${100 - desaturation}%)`;
    this.desaturationElement.style.opacity = this.suppressionState.level > 0 ? '1' : '0';
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

  setPlayerController(controller: IPlayerController): void {
    this.playerController = controller;
  }
}
