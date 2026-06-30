// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { SoundscapeBedHandle } from './SoundscapeDirector';

/**
 * Manages audio ducking - reduces ambient beds during combat for emphasis.
 *
 * Generalized for the layered `SoundscapeDirector` (cycle-2026-06-29): instead
 * of a single hardcoded ambient base volume, each bed reports the gain it holds
 * before ducking (`gainBeforeDuck`, which already folds in base volume, the
 * day/night crossfade weight, and the master scalar). Ducking multiplies that
 * per-bed gain by a shared duck factor, so the day/night mix and worldbuilder
 * volume are preserved while combat is emphasized.
 */
export class AudioDuckingSystem {
  private isDucking = false;
  private duckingProgress = 0;
  private readonly DUCKING_AMOUNT = 0.4; // Reduce ambient to 40% during combat
  private readonly DUCK_FADE_TIME = 0.3; // Fade in/out time in seconds
  private lastCombatSoundTime = 0;
  private hasCombatSound = false;
  private readonly COMBAT_TIMEOUT = 2000; // 2 seconds after last shot before unduck

  /**
   * Mark that a combat sound was played (triggers ducking)
   */
  markCombatSound(): void {
    this.lastCombatSoundTime = performance.now();
    this.hasCombatSound = true;
  }

  /**
   * Update ducking state and apply to ambient beds. Each bed's `gainBeforeDuck`
   * is the gain the director wants it to hold (base * crossfade * master); the
   * duck multiplier scales every bed uniformly, preserving the mix.
   */
  update(deltaTime: number, beds: SoundscapeBedHandle[]): void {
    if (!this.hasCombatSound && !this.isDucking && this.duckingProgress === 0) {
      return;
    }

    const now = performance.now();
    const timeSinceLastShot = now - this.lastCombatSoundTime;

    // Determine if we should be ducking based on recent combat
    const shouldDuck = timeSinceLastShot < this.COMBAT_TIMEOUT;

    if (shouldDuck && !this.isDucking) {
      this.isDucking = true;
    } else if (!shouldDuck && this.isDucking && timeSinceLastShot > this.COMBAT_TIMEOUT + 500) {
      this.isDucking = false;
    }

    // Smoothly transition ducking amount
    const targetDucking = this.isDucking ? 1 : 0;
    const duckSpeed = 1 / this.DUCK_FADE_TIME;

    if (this.duckingProgress < targetDucking) {
      this.duckingProgress = Math.min(1, this.duckingProgress + duckSpeed * deltaTime);
    } else if (this.duckingProgress > targetDucking) {
      this.duckingProgress = Math.max(0, this.duckingProgress - duckSpeed * deltaTime);
    }

    // Apply ducking on top of each bed's director-supplied gain.
    const duckMultiplier = 1 - this.duckingProgress * this.DUCKING_AMOUNT;
    for (const bed of beds) {
      bed.sound.setVolume(bed.gainBeforeDuck * duckMultiplier);
    }
  }
}
