import * as THREE from 'three';
import { SOUND_CONFIGS } from '../../config/audio';

/**
 * Manages audio ducking - reduces ambient sounds during combat for emphasis.
 */
export class AudioDuckingSystem {
    private isDucking = false;
    private duckingProgress = 0;
    private readonly DUCKING_AMOUNT = 0.4; // Reduce ambient to 40% during combat
    private readonly DUCK_FADE_TIME = 0.3; // Fade in/out time in seconds
    private lastCombatSoundTime = 0;
    private readonly COMBAT_TIMEOUT = 2000; // 2 seconds after last shot before unduck

    /**
     * Mark that a combat sound was played (triggers ducking)
     */
    markCombatSound(): void {
        this.lastCombatSoundTime = performance.now();
    }

    /**
     * Update ducking state and apply to ambient sounds
     */
    update(deltaTime: number, ambientSounds: THREE.Audio[]): void {
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

        // Apply ducking to ambient sounds
        const duckMultiplier = 1 - (this.duckingProgress * this.DUCKING_AMOUNT);
        for (const sound of ambientSounds) {
            const baseVolume = SOUND_CONFIGS.jungle1?.volume || 0.3;
            sound.setVolume(baseVolume * duckMultiplier);
        }
    }
}
