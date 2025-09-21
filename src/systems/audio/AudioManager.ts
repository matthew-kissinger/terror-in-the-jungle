import * as THREE from 'three';
import { GameSystem } from '../../types';
import { AUDIO_POOL_SIZES, SOUND_CONFIGS, SoundConfig } from '../../config/audio';

export class AudioManager implements GameSystem {
    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private listener: THREE.AudioListener;

    // Audio buffers
    private audioBuffers: Map<string, AudioBuffer> = new Map();
    private audioLoader: THREE.AudioLoader;

    // Sound pools for frequently used sounds
    private playerGunshotPool: THREE.Audio[] = [];
    private positionalGunshotPool: THREE.PositionalAudio[] = [];
    private deathSoundPool: THREE.PositionalAudio[] = [];
    private playerReloadPool: THREE.Audio[] = [];

    // Ambient sounds
    private ambientSounds: THREE.Audio[] = [];
    private currentAmbientTrack?: string;

    // Pool sizes
    private readonly GUNSHOT_POOL_SIZE = AUDIO_POOL_SIZES.gunshot;
    private readonly DEATH_POOL_SIZE = AUDIO_POOL_SIZES.death;
    private readonly RELOAD_POOL_SIZE = 3; // Only need a few reload sounds

    // Sound configurations
    private readonly soundConfigs: Record<string, SoundConfig> = SOUND_CONFIGS;

    constructor(scene: THREE.Scene, camera: THREE.Camera) {
        this.scene = scene;
        this.camera = camera;

        // Create audio listener and attach to camera
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);

        this.audioLoader = new THREE.AudioLoader();

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
        this.initializeSoundPools();

        // Don't start ambient sounds until game starts
        // this.startAmbientSounds();

        console.log('[AudioManager] Audio system initialized');
    }

    // Call this when the game actually starts
    public startAmbient(): void {
        if (this.ambientSounds.length === 0) {
            this.startAmbientSounds();
        }
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

    private initializeSoundPools(): void {
        // Initialize player gunshot pool (non-positional)
        for (let i = 0; i < this.GUNSHOT_POOL_SIZE; i++) {
            const sound = new THREE.Audio(this.listener);
            const buffer = this.audioBuffers.get('playerGunshot');
            if (buffer) {
                sound.setBuffer(buffer);
                sound.setVolume(this.soundConfigs.playerGunshot.volume || 1);
            }
            this.playerGunshotPool.push(sound);
        }

        // Initialize positional gunshot pool
        for (let i = 0; i < this.GUNSHOT_POOL_SIZE; i++) {
            const sound = new THREE.PositionalAudio(this.listener);
            const buffer = this.audioBuffers.get('otherGunshot');
            if (buffer) {
                sound.setBuffer(buffer);
                sound.setVolume(this.soundConfigs.otherGunshot.volume || 1);
                sound.setRefDistance(this.soundConfigs.otherGunshot.refDistance || 10);
                sound.setMaxDistance(this.soundConfigs.otherGunshot.maxDistance || 100);
                sound.setRolloffFactor(this.soundConfigs.otherGunshot.rolloffFactor || 1);

                // Set distance model to linear for more predictable falloff
                sound.setDistanceModel('linear');
            }
            this.positionalGunshotPool.push(sound);
        }

        // Initialize death sound pools
        for (let i = 0; i < this.DEATH_POOL_SIZE; i++) {
            // Ally death sounds
            const allySound = new THREE.PositionalAudio(this.listener);
            const allyBuffer = this.audioBuffers.get('allyDeath');
            if (allyBuffer) {
                allySound.setBuffer(allyBuffer);
                allySound.setVolume(this.soundConfigs.allyDeath.volume || 1);
                allySound.setRefDistance(this.soundConfigs.allyDeath.refDistance || 5);
                allySound.setMaxDistance(this.soundConfigs.allyDeath.maxDistance || 50);
                allySound.setRolloffFactor(this.soundConfigs.allyDeath.rolloffFactor || 2);
                allySound.setDistanceModel('linear');
            }

            // Enemy death sounds
            const enemySound = new THREE.PositionalAudio(this.listener);
            const enemyBuffer = this.audioBuffers.get('enemyDeath');
            if (enemyBuffer) {
                enemySound.setBuffer(enemyBuffer);
                enemySound.setVolume(this.soundConfigs.enemyDeath.volume || 1);
                enemySound.setRefDistance(this.soundConfigs.enemyDeath.refDistance || 5);
                enemySound.setMaxDistance(this.soundConfigs.enemyDeath.maxDistance || 50);
                enemySound.setRolloffFactor(this.soundConfigs.enemyDeath.rolloffFactor || 2);
                enemySound.setDistanceModel('linear');
            }

            this.deathSoundPool.push(allySound, enemySound);
        }

        // Initialize reload sound pool
        for (let i = 0; i < this.RELOAD_POOL_SIZE; i++) {
            const sound = new THREE.Audio(this.listener);
            const buffer = this.audioBuffers.get('playerReload');
            if (buffer) {
                sound.setBuffer(buffer);
                sound.setVolume(this.soundConfigs.playerReload?.volume || 0.6);
            }
            this.playerReloadPool.push(sound);
        }
    }

    private startAmbientSounds(): void {
        // Play jungle ambient sounds sequentially, not overlapping
        this.playNextAmbientTrack();
    }

    private playNextAmbientTrack(): void {
        // Clear any existing ambient sounds
        this.ambientSounds.forEach(sound => {
            if (sound.isPlaying) sound.stop();
        });
        this.ambientSounds = [];

        // Alternate between jungle1 and jungle2
        const currentTrack = this.currentAmbientTrack || 'jungle1';
        const nextTrack = currentTrack === 'jungle1' ? 'jungle2' : 'jungle1';
        this.currentAmbientTrack = nextTrack;

        const buffer = this.audioBuffers.get(nextTrack);
        if (!buffer) return;

        const sound = new THREE.Audio(this.listener);
        sound.setBuffer(buffer);
        sound.setVolume(this.soundConfigs[nextTrack].volume || 0.3);
        sound.setLoop(false); // Don't loop individual tracks

        // Schedule next track when this one ends
        sound.onEnded = () => {
            // Small gap between tracks for natural feel
            setTimeout(() => this.playNextAmbientTrack(), 2000);
        };

        sound.play();
        this.ambientSounds.push(sound);
    }

    // Play player's own gunshot (non-positional)
    playPlayerGunshot(): void {
        const sound = this.getAvailableSound(this.playerGunshotPool);
        if (sound && !sound.isPlaying) {
            sound.play();
        }
    }

    // Play reload sound
    playReloadSound(): void {
        const sound = this.getAvailableSound(this.playerReloadPool);
        if (sound && !sound.isPlaying) {
            sound.play();
        }
    }

    // Play other combatant's gunshot (positional)
    playGunshotAt(position: THREE.Vector3): void {
        const sound = this.getAvailablePositionalSound(this.positionalGunshotPool);
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
        const soundPool = this.deathSoundPool.filter((_, i) => i % 2 === soundIndex);

        const sound = this.getAvailablePositionalSound(soundPool);
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

    // Helper to get available non-positional sound from pool
    private getAvailableSound(pool: THREE.Audio[]): THREE.Audio | null {
        for (const sound of pool) {
            if (!sound.isPlaying) {
                return sound;
            }
        }
        // If all sounds are playing, stop and reuse the first one
        if (pool.length > 0) {
            pool[0].stop();
            return pool[0];
        }
        return null;
    }

    // Helper to get available positional sound from pool
    private getAvailablePositionalSound(pool: THREE.PositionalAudio[]): THREE.PositionalAudio | null {
        for (const sound of pool) {
            if (!sound.isPlaying) {
                return sound;
            }
        }
        // If all sounds are playing, stop and reuse the first one
        if (pool.length > 0) {
            pool[0].stop();
            return pool[0];
        }
        return null;
    }

    // Set master volume
    setMasterVolume(volume: number): void {
        this.listener.setMasterVolume(Math.max(0, Math.min(1, volume)));
    }

    // Set ambient volume
    setAmbientVolume(volume: number): void {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        for (const sound of this.ambientSounds) {
            sound.setVolume(clampedVolume * (this.soundConfigs.jungle1.volume || 0.3));
        }
    }

    // Mute/unmute all sounds
    toggleMute(): void {
        const currentVolume = this.listener.getMasterVolume();
        this.listener.setMasterVolume(currentVolume > 0 ? 0 : 1);
    }

    // Get the audio listener for other systems
    getListener(): THREE.AudioListener {
        return this.listener;
    }

    update(deltaTime: number): void {
        // Audio system doesn't need per-frame updates in this implementation
        // Three.js handles positional audio updates automatically
    }

    dispose(): void {
        // Stop all sounds
        for (const sound of this.playerGunshotPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.positionalGunshotPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.deathSoundPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.ambientSounds) {
            if (sound.isPlaying) sound.stop();
        }

        // Clear pools
        this.playerGunshotPool = [];
        this.positionalGunshotPool = [];
        this.deathSoundPool = [];
        this.playerReloadPool = [];
        this.ambientSounds = [];

        // Clear buffers
        this.audioBuffers.clear();

        console.log('[AudioManager] Disposed');
    }
}