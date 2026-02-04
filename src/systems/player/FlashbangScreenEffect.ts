import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import type { IPlayerController } from '../../types/SystemInterfaces';

/**
 * Manages flashbang screen whiteout effect for the player.
 * Creates a full-screen white overlay that fades based on distance and angle to flashbang.
 */
export class FlashbangScreenEffect implements GameSystem {
  private overlayElement?: HTMLDivElement;
  private flashIntensity: number = 0;
  private flashDecayRate: number = 0; // Set per flash
  private playerController?: IPlayerController;

  // Tuning parameters
  private readonly FULL_BLIND_DISTANCE = 15; // Within 15m = full whiteout
  private readonly PARTIAL_BLIND_DISTANCE = 25; // 15-25m = partial whiteout
  private readonly FULL_BLIND_DURATION = 3.0; // 3 seconds fade for close flashbangs
  private readonly PARTIAL_BLIND_DURATION = 1.5; // 1.5 seconds fade for distant flashbangs

  async init(): Promise<void> {
    Logger.info('Combat', 'Initializing Flashbang Screen Effect...');
    this.createWhiteOverlay();
    Logger.info('Combat', 'Flashbang Screen Effect initialized');
  }

  update(deltaTime: number): void {
    if (this.flashIntensity > 0) {
      // Decay flash intensity
      this.flashIntensity = Math.max(0, this.flashIntensity - this.flashDecayRate * deltaTime);
      this.updateOverlay();
    }
  }

  dispose(): void {
    if (this.overlayElement) {
      this.overlayElement.remove();
      this.overlayElement = undefined;
    }
    Logger.info('Combat', 'Flashbang Screen Effect disposed');
  }

  /**
   * Trigger flashbang effect based on distance and angle to the flash
   * @param flashPosition Position of flashbang detonation
   * @param playerPosition Current player position
   * @param playerLookDirection Direction player is looking (normalized)
   */
  triggerFlash(
    flashPosition: THREE.Vector3,
    playerPosition: THREE.Vector3,
    playerLookDirection: THREE.Vector3
  ): void {
    const distance = flashPosition.distanceTo(playerPosition);

    // No effect beyond partial blind distance
    if (distance > this.PARTIAL_BLIND_DISTANCE) {
      return;
    }

    // Calculate base intensity from distance
    let baseIntensity = 0;
    let duration = 0;

    if (distance <= this.FULL_BLIND_DISTANCE) {
      // Full whiteout within close range
      baseIntensity = 1.0;
      duration = this.FULL_BLIND_DURATION;
    } else {
      // Partial whiteout at medium range - scale linearly
      const distanceRatio = (distance - this.FULL_BLIND_DISTANCE) /
                           (this.PARTIAL_BLIND_DISTANCE - this.FULL_BLIND_DISTANCE);
      baseIntensity = 1.0 - distanceRatio; // 1.0 at 15m, 0.0 at 25m
      duration = this.PARTIAL_BLIND_DURATION;
    }

    // Calculate angle factor - looking at flash increases intensity
    const directionToFlash = new THREE.Vector3()
      .subVectors(flashPosition, playerPosition)
      .normalize();

    const dotProduct = playerLookDirection.dot(directionToFlash);
    // dotProduct: 1 = looking directly at flash, -1 = looking away, 0 = perpendicular
    const angleFactor = Math.max(0, dotProduct); // Clamp negative values to 0

    // Combine distance and angle: base intensity * (0.5 + 0.5 * angle factor)
    // This means looking away gives 50% intensity, looking directly gives 100%
    const finalIntensity = baseIntensity * (0.5 + 0.5 * angleFactor);

    // Set flash intensity and decay rate
    this.flashIntensity = Math.min(1.0, Math.max(this.flashIntensity, finalIntensity));
    this.flashDecayRate = this.flashIntensity / duration;

    this.updateOverlay();

    Logger.debug(
      'Combat',
      `Flashbang triggered! Distance: ${distance.toFixed(1)}m, Angle: ${(angleFactor * 100).toFixed(0)}%, Intensity: ${(this.flashIntensity * 100).toFixed(0)}%`
    );
  }

  /**
   * Create the white overlay element for flashbang effect
   */
  private createWhiteOverlay(): void {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'flashbang-overlay';
    this.overlayElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
      opacity: 0;
      background: rgba(255, 255, 255, 1);
      transition: none;
    `;
    document.body.appendChild(this.overlayElement);
  }

  /**
   * Update overlay opacity based on current flash intensity
   */
  private updateOverlay(): void {
    if (!this.overlayElement) return;
    this.overlayElement.style.opacity = this.flashIntensity.toString();
  }

  /**
   * Get current flash intensity (0-1)
   */
  getFlashIntensity(): number {
    return this.flashIntensity;
  }

  /**
   * Check if player is currently flashed
   */
  isFlashed(): boolean {
    return this.flashIntensity > 0.1;
  }

  // System connections

  setPlayerController(controller: IPlayerController): void {
    this.playerController = controller;
  }
}
