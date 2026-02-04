import * as THREE from 'three';
import { GameSystem } from '../../types';
import { SOUND_CONFIGS, SoundConfig } from '../../config/audio';
import { AudioPoolManager } from './AudioPoolManager';
import { AudioDuckingSystem } from './AudioDuckingSystem';
import { AmbientSoundManager } from './AmbientSoundManager';
import { AudioWeaponSounds } from './AudioWeaponSounds';
import { Logger } from '../../utils/Logger';

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
    private weaponSounds: AudioWeaponSounds;

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
        this.weaponSounds = new AudioWeaponSounds(this.scene, this.listener, this.poolManager, this.duckingSystem);

        // Resume AudioContext on first user interaction
        this.setupAudioContextResume();
    }

    private setupAudioContextResume(): void {
        const resumeAudio = () => {
            if (this.listener.context.state === 'suspended') {
                this.listener.context.resume().then(() => {
                    Logger.info('Audio', 'AudioContext resumed');
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
        Logger.info('Audio', 'Initializing audio system...');

        // Load all audio buffers
        await this.loadAllAudio();

        // Initialize sound pools
        this.poolManager.initializePools();

        Logger.info('Audio', 'Audio system initialized');
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
                    Logger.debug('Audio', `Loaded: ${key}`);
                    resolve();
                },
                (progress) => {
                    // Progress callback
                },
                (error) => {
                    Logger.error('Audio', `Failed to load ${key}:`, error);
                    reject(error);
                }
            );
        });
    }

    // Play player's own gunshot (non-positional) - delegates to weaponSounds
    playPlayerGunshot(): void {
        this.weaponSounds.playPlayerGunshot();
    }

    // Play reload sound - delegates to weaponSounds
    playReloadSound(): void {
        this.weaponSounds.playReloadSound();
    }

    // Play other combatant's gunshot (positional) - delegates to weaponSounds
    playGunshotAt(position: THREE.Vector3): void {
        this.weaponSounds.playGunshotAt(position);
    }

    // Play death sound at position - delegates to weaponSounds
    playDeathSound(position: THREE.Vector3, isAlly: boolean): void {
        this.weaponSounds.playDeathSound(position, isAlly);
    }

    // Play explosion sound at position - delegates to weaponSounds
    playExplosionAt(position: THREE.Vector3): void {
        this.weaponSounds.playExplosionAt(position);
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
            Logger.warn('Audio', `Sound not found: ${soundName}`);
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
    playPlayerWeaponSound(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' = 'rifle'): void {
        this.weaponSounds.playPlayerWeaponSound(weaponType);
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
        this.weaponSounds.playWeaponSoundAt(position, weaponType, listenerPosition);
    }

    /**
     * Play weapon switch sound effect
     */
    playWeaponSwitchSound(): void {
        this.weaponSounds.playWeaponSwitchSound();
    }

    /**
     * Play bullet whiz/crack sound when bullets pass close to player
     * Uses loaded WAV file from pool, falls back gracefully if not loaded
     */
    playBulletWhizSound(bulletPosition: THREE.Vector3, playerPosition: THREE.Vector3): void {
        this.weaponSounds.playBulletWhizSound(bulletPosition, playerPosition);
    }

    dispose(): void {
        // Dispose modules
        this.poolManager.dispose();
        this.ambientManager.dispose();

        // Clear buffers
        this.audioBuffers.clear();

        Logger.info('Audio', 'Disposed');
    }
}
