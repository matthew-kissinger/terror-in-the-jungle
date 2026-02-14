import * as THREE from 'three';
import { SOUND_CONFIGS, SoundConfig } from '../../config/audio';
import { AudioPoolManager } from './AudioPoolManager';
import { AudioDuckingSystem } from './AudioDuckingSystem';
import { Logger } from '../../utils/Logger';

/**
 * Manages weapon-specific sound playback.
 * Handles player weapon sounds, positional weapon sounds, and weapon effects.
 */
export class AudioWeaponSounds {
    private scene: THREE.Scene;
    private listener: THREE.AudioListener;
    private poolManager: AudioPoolManager;
    private duckingSystem: AudioDuckingSystem;
    private soundConfigs: Record<string, SoundConfig> = SOUND_CONFIGS;
    private bulletWhizMissingLogged = false;

    // Reusable Object3D pool to avoid per-call allocations
    private readonly obj3dPool: THREE.Object3D[] = [];
    private readonly OBJ3D_POOL_SIZE = 16;

    private getPooledObject3D(): THREE.Object3D {
        return this.obj3dPool.pop() || new THREE.Object3D();
    }

    private returnPooledObject3D(obj: THREE.Object3D): void {
        obj.position.set(0, 0, 0);
        if (this.obj3dPool.length < this.OBJ3D_POOL_SIZE) {
            this.obj3dPool.push(obj);
        }
    }

    constructor(
        scene: THREE.Scene,
        listener: THREE.AudioListener,
        poolManager: AudioPoolManager,
        duckingSystem: AudioDuckingSystem
    ) {
        this.scene = scene;
        this.listener = listener;
        this.poolManager = poolManager;
        this.duckingSystem = duckingSystem;
    }

    // Play player's own gunshot (non-positional)
    playPlayerGunshot(): void {
        const sound = this.poolManager.getAvailableSound(this.poolManager.getPlayerGunshotPool());
        if (sound && !sound.isPlaying) {
            sound.play();
        }
    }

    // Play reload sound
    playReloadSound(): void {
        const sound = this.poolManager.getAvailableSound(this.poolManager.getPlayerReloadPool());
        if (sound && !sound.isPlaying) {
            sound.play();
        }
    }

    /**
     * Enhanced weapon sound playback with pitch/volume variation and layered sounds
     * @param weaponType - Type of weapon: 'rifle', 'shotgun', or 'smg'
     */
    playPlayerWeaponSound(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' = 'rifle'): void {
        // Mark combat time for audio ducking
        this.duckingSystem.markCombatSound();

        // Select appropriate pool and config based on weapon type
        let pool: THREE.Audio[];
        let configKey: string;

        switch (weaponType) {
            case 'shotgun':
                pool = this.poolManager.getPlayerGunshotPool();
                configKey = 'playerShotgun';
                break;
            case 'smg':
                pool = this.poolManager.getPlayerSMGPool();
                configKey = 'playerSMG';
                break;
            default: // rifle
                pool = this.poolManager.getPlayerGunshotPool();
                configKey = 'playerGunshot';
        }

        // Get sound from pool
        const sound = this.poolManager.getAvailableSound(pool);
        if (!sound) return;

        // Apply weapon-specific pitch variation for variety
        let pitchMin = 0.95;
        let pitchMax = 1.05;
        let volumeVariation = 0.95 + Math.random() * 0.1; // 95-105% volume variation

        switch (weaponType) {
            case 'shotgun':
                pitchMin = 0.90;
                pitchMax = 1.08;
                volumeVariation = 0.9 + Math.random() * 0.15; // More variation for shotgun
                break;
            case 'smg':
                pitchMin = 1.08;
                pitchMax = 1.18;
                volumeVariation = 0.92 + Math.random() * 0.12;
                break;
        }

        const pitchVariation = pitchMin + Math.random() * (pitchMax - pitchMin);
        sound.setPlaybackRate(pitchVariation);
        sound.setVolume((this.soundConfigs[configKey]?.volume || 0.85) * volumeVariation);
        sound.play();
    }

    // Play other combatant's gunshot (positional)
    playGunshotAt(position: THREE.Vector3): void {
        const sound = this.poolManager.getAvailablePositionalSound(this.poolManager.getPositionalGunshotPool());
        if (sound && !sound.isPlaying) {
            const tempObj = this.getPooledObject3D();
            tempObj.position.copy(position);
            tempObj.add(sound);
            this.scene.add(tempObj);

            sound.play();

            sound.onEnded = () => {
                tempObj.remove(sound);
                this.scene.remove(tempObj);
                this.returnPooledObject3D(tempObj);
            };
        }
    }

    // Play death sound at position
    playDeathSound(position: THREE.Vector3, isAlly: boolean): void {
        // Select appropriate sound from pool
        const soundIndex = isAlly ? 0 : 1; // Even indices for ally, odd for enemy
        const soundPool = this.poolManager.getDeathSoundPool().filter((_, i) => i % 2 === soundIndex);

        const sound = this.poolManager.getAvailablePositionalSound(soundPool);
        if (sound && !sound.isPlaying) {
            const tempObj = this.getPooledObject3D();
            tempObj.position.copy(position);
            tempObj.add(sound);
            this.scene.add(tempObj);

            sound.play();

            sound.onEnded = () => {
                tempObj.remove(sound);
                this.scene.remove(tempObj);
                this.returnPooledObject3D(tempObj);
            };
        }
    }

    // Play explosion sound at position
    playExplosionAt(position: THREE.Vector3): void {
        const sound = this.poolManager.getAvailablePositionalSound(this.poolManager.getExplosionSoundPool());
        if (sound && !sound.isPlaying) {
            const tempObj = this.getPooledObject3D();
            tempObj.position.copy(position);
            tempObj.add(sound);
            this.scene.add(tempObj);

            sound.play();

            sound.onEnded = () => {
                tempObj.remove(sound);
                this.scene.remove(tempObj);
                this.returnPooledObject3D(tempObj);
            };
        }
    }

    /**
     * Enhanced positional weapon sound with distance-based filtering
     * @param position - World position of the sound source
     * @param weaponType - Type of weapon: 'rifle' or 'shotgun'
     * @param listenerPosition - Optional camera position for distance calculation
     */
    playWeaponSoundAt(
        position: THREE.Vector3,
        weaponType: 'rifle' | 'shotgun' = 'rifle',
        listenerPosition?: THREE.Vector3
    ): void {
        // Mark combat time for audio ducking
        this.duckingSystem.markCombatSound();

        const sound = this.poolManager.getAvailablePositionalSound(this.poolManager.getPositionalGunshotPool());
        if (!sound) return;

        const tempObj = this.getPooledObject3D();
        tempObj.position.copy(position);
        tempObj.add(sound);
        this.scene.add(tempObj);

        // Apply weapon-specific pitch variation
        let pitchMin = 0.94;
        let pitchMax = 1.06;
        if (weaponType === 'shotgun') {
            pitchMin = 0.88;
            pitchMax = 1.10;
        }

        const pitchVariation = pitchMin + Math.random() * (pitchMax - pitchMin);
        sound.setPlaybackRate(pitchVariation);

        // Apply distance-based low-pass filtering if listener position is available
        let filter: BiquadFilterNode | null = null;
        let gainNode: GainNode | null = null;
        if (listenerPosition && sound.source) {
            const distance = position.distanceTo(listenerPosition);
            const audioContext = this.listener.context;
            filter = audioContext.createBiquadFilter();

            if (distance < 30) {
                // Close range - full bass and sharp attack
                filter.type = 'lowpass';
                filter.frequency.value = 8000;
                filter.Q.value = 0.5;
            } else if (distance < 80) {
                // Mid range - reduced bass
                filter.type = 'lowpass';
                filter.frequency.value = 4000 - (distance - 30) * 40;
                filter.Q.value = 1.0;
            } else {
                // Far range - high frequencies only
                filter.type = 'highpass';
                filter.frequency.value = 800;
                filter.Q.value = 2.0;
            }

            // Connect filter to audio chain
            gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0;

            sound.source.disconnect();
            sound.source.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(sound.getOutput());
        }

        sound.play();

        // Clean up after sound finishes - disconnect filter/gain nodes to prevent audio leak
        const capturedFilter = filter;
        const capturedGain = gainNode;
        sound.onEnded = () => {
            if (capturedFilter) {
                capturedFilter.disconnect();
            }
            if (capturedGain) {
                capturedGain.disconnect();
            }
            tempObj.remove(sound);
            this.scene.remove(tempObj);
            this.returnPooledObject3D(tempObj);
        };
    }

    /**
     * Play weapon switch sound effect
     */
    playWeaponSwitchSound(): void {
        const sound = this.poolManager.getAvailableSound(this.poolManager.getPlayerReloadPool());
        if (!sound) return;

        // Use reload sound with pitch variation for switch
        sound.setPlaybackRate(1.2 + Math.random() * 0.2);
        sound.setVolume(0.4);
        sound.play();
    }

    /**
     * Play bullet whiz/crack sound when bullets pass close to player
     * Uses loaded WAV file from pool, falls back gracefully if not loaded
     */
    playBulletWhizSound(bulletPosition: THREE.Vector3, playerPosition: THREE.Vector3): void {
        const distance = bulletPosition.distanceTo(playerPosition);

        // Only play whiz sound for very close near-misses (within 3 meters)
        if (distance > 3) return;

        // Use pooled sound if available
        const sound = this.poolManager.getAvailableSound(this.poolManager.getBulletWhizPool());
        if (sound) {
            // Volume based on proximity - closer = louder
            const proximityFactor = 1 - (distance / 3);
            sound.setVolume(0.4 * proximityFactor);
            // Slight pitch variation for variety
            sound.setPlaybackRate(0.9 + Math.random() * 0.2);
            sound.play();
            return;
        }
        if (!this.bulletWhizMissingLogged) {
            this.bulletWhizMissingLogged = true;
            // One-time warning keeps missing-asset visibility without runtime log spam.
            Logger.warn('audio', 'Missing optional bulletWhiz asset; near-miss SFX disabled');
        }
    }
}
