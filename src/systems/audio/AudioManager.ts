import * as THREE from 'three';
import { GameSystem } from '../../types';
import { SOUND_CONFIGS, SoundConfig } from '../../config/audio';
import { AudioPoolManager } from './AudioPoolManager';
import { AudioDuckingSystem } from './AudioDuckingSystem';
import { AmbientSoundManager } from './AmbientSoundManager';

export class AudioManager implements GameSystem {
    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private listener: THREE.AudioListener;

    // Audio buffers
    private audioBuffers: Map<string, AudioBuffer> = new Map();
    private audioLoader: THREE.AudioLoader;

    // Extracted modules
    private poolManager: AudioPoolManager;
    private duckingSystem: AudioDuckingSystem;
    private ambientManager: AmbientSoundManager;

    // Sound configurations
    private readonly soundConfigs: Record<string, SoundConfig> = SOUND_CONFIGS;

    constructor(scene: THREE.Scene, camera: THREE.Camera) {
        this.scene = scene;
        this.camera = camera;

        // Create audio listener and attach to camera
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);

        this.audioLoader = new THREE.AudioLoader();

        // Initialize modules (will be fully set up after audio loads)
        this.poolManager = new AudioPoolManager(this.listener, this.scene, this.audioBuffers);
        this.duckingSystem = new AudioDuckingSystem();
        this.ambientManager = new AmbientSoundManager(this.listener, this.audioBuffers);

        // Resume AudioContext on first user interaction
        this.setupAudioContextResume();
    }

    private setupAudioContextResume(): void {
        const resumeAudio = () => {
            if (this.listener.context.state === 'suspended') {
                this.listener.context.resume().then(() => {
                    console.log('[AudioManager] AudioContext resumed');
                });
            }
            // Remove listeners after first interaction
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
        };

        // Add listeners for user interaction
        document.addEventListener('click', resumeAudio);
        document.addEventListener('keydown', resumeAudio);
    }

    async init(): Promise<void> {
        console.log('[AudioManager] Initializing audio system...');

        // Load all audio buffers
        await this.loadAllAudio();

        // Initialize sound pools
        this.poolManager.initializePools();

        console.log('[AudioManager] Audio system initialized');
    }

    // Call this when the game actually starts
    public startAmbient(): void {
        this.ambientManager.start();
    }

    private async loadAllAudio(): Promise<void> {
        const loadPromises: Promise<void>[] = [];

        for (const [key, config] of Object.entries(this.soundConfigs)) {
            loadPromises.push(this.loadAudio(key, config.path));
        }

        await Promise.all(loadPromises);
    }

    private loadAudio(key: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.audioLoader.load(
                path,
                (buffer) => {
                    this.audioBuffers.set(key, buffer);
                    console.log(`[AudioManager] Loaded: ${key}`);
                    resolve();
                },
                (progress) => {
                    // Progress callback
                },
                (error) => {
                    console.error(`[AudioManager] Failed to load ${key}:`, error);
                    reject(error);
                }
            );
        });
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

    // Play other combatant's gunshot (positional)
    playGunshotAt(position: THREE.Vector3): void {
        const sound = this.poolManager.getAvailablePositionalSound(this.poolManager.getPositionalGunshotPool());
        if (sound && !sound.isPlaying) {
            // Create temporary object at position
            const tempObj = new THREE.Object3D();
            tempObj.position.copy(position);
            tempObj.add(sound);
            this.scene.add(tempObj);

            sound.play();

            // Clean up after sound finishes
            sound.onEnded = () => {
                tempObj.remove(sound);
                this.scene.remove(tempObj);
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
            // Create temporary object at position
            const tempObj = new THREE.Object3D();
            tempObj.position.copy(position);
            tempObj.add(sound);
            this.scene.add(tempObj);

            sound.play();

            // Clean up after sound finishes
            sound.onEnded = () => {
                tempObj.remove(sound);
                this.scene.remove(tempObj);
            };
        }
    }

    // Play explosion sound at position
    playExplosionAt(position: THREE.Vector3): void {
        const sound = this.poolManager.getAvailablePositionalSound(this.poolManager.getExplosionSoundPool());
        if (sound && !sound.isPlaying) {
            // Create temporary object at position
            const tempObj = new THREE.Object3D();
            tempObj.position.copy(position);
            tempObj.add(sound);
            this.scene.add(tempObj);

            sound.play();

            // Clean up after sound finishes
            sound.onEnded = () => {
                tempObj.remove(sound);
                this.scene.remove(tempObj);
            };
        }
    }

    /**
     * Play hit feedback sound from loaded WAV file pool
     * Falls back gracefully if no hitMarker sound is loaded
     */
    playHitFeedback(type: 'hit' | 'headshot' | 'kill'): void {
        // Use pooled sound if available
        const sound = this.poolManager.getAvailableSound(this.poolManager.getHitFeedbackPool());
        if (sound) {
            // Vary pitch based on hit type
            let pitch = 1.0;
            let volume = 0.5;
            switch (type) {
                case 'headshot':
                    pitch = 1.3;
                    volume = 0.6;
                    break;
                case 'kill':
                    pitch = 0.8;
                    volume = 0.7;
                    break;
            }
            sound.setPlaybackRate(pitch);
            sound.setVolume(volume);
            sound.play();
        }
        // If no hitMarker sound loaded, silently skip (no procedural fallback)
    }

    // Set master volume
    setMasterVolume(volume: number): void {
        this.listener.setMasterVolume(Math.max(0, Math.min(1, volume)));
    }

    // Set ambient volume
    setAmbientVolume(volume: number): void {
        this.ambientManager.setVolume(volume);
    }

    // Mute/unmute all sounds
    toggleMute(): void {
        const currentVolume = this.listener.getMasterVolume();
        this.listener.setMasterVolume(currentVolume > 0 ? 0 : 1);
    }

    // IAudioManager implementation
    play(soundName: string, position?: THREE.Vector3, volume: number = 1.0): void {
        const buffer = this.audioBuffers.get(soundName);
        if (!buffer) {
            console.warn(`[AudioManager] Sound not found: ${soundName}`);
            return;
        }

        if (position) {
            // Play positional sound
            const sound = new THREE.PositionalAudio(this.listener);
            sound.setBuffer(buffer);
            sound.setVolume(volume);
            sound.setRefDistance(10);
            sound.setMaxDistance(100);

            const tempObj = new THREE.Object3D();
            tempObj.position.copy(position);
            tempObj.add(sound);
            this.scene.add(tempObj);

            sound.play();
            sound.onEnded = () => {
                tempObj.remove(sound);
                this.scene.remove(tempObj);
            };
        } else {
            // Play global sound
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(buffer);
            sound.setVolume(volume);
            sound.play();
        }
    }

    // Get the audio listener for other systems
    getListener(): THREE.AudioListener {
        return this.listener;
    }

    update(deltaTime: number): void {
        // Update audio ducking for combat emphasis
        this.duckingSystem.update(deltaTime, this.ambientManager.getAmbientSounds());
    }

    /**
     * Enhanced weapon sound playback with pitch/volume variation and layered sounds
     * @param weaponType - Type of weapon: 'rifle', 'shotgun', or 'smg'
     */
    playPlayerWeaponSound(weaponType: 'rifle' | 'shotgun' | 'smg' = 'rifle'): void {
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

        // Create temporary object at position
        const tempObj = new THREE.Object3D();
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
        if (listenerPosition && sound.source) {
            const distance = position.distanceTo(listenerPosition);
            const audioContext = this.listener.context;
            const filter = audioContext.createBiquadFilter();

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
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0;

            sound.source.disconnect();
            sound.source.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(sound.getOutput());
        }

        sound.play();

        // Clean up after sound finishes
        sound.onEnded = () => {
            tempObj.remove(sound);
            this.scene.remove(tempObj);
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
        }
        // If no bulletWhiz sound loaded, silently skip
    }

    dispose(): void {
        // Dispose modules
        this.poolManager.dispose();
        this.ambientManager.dispose();

        // Clear buffers
        this.audioBuffers.clear();

        console.log('[AudioManager] Disposed');
    }
}
