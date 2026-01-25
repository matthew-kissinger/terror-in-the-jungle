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
    private playerSMGPool: THREE.Audio[] = [];
    private positionalGunshotPool: THREE.PositionalAudio[] = [];
    private deathSoundPool: THREE.PositionalAudio[] = [];
    private playerReloadPool: THREE.Audio[] = [];
    private explosionSoundPool: THREE.PositionalAudio[] = [];

    // Ambient sounds
    private ambientSounds: THREE.Audio[] = [];
    private currentAmbientTrack?: string;

    // Pool sizes
    private readonly GUNSHOT_POOL_SIZE = AUDIO_POOL_SIZES.gunshot;
    private readonly DEATH_POOL_SIZE = AUDIO_POOL_SIZES.death;
    private readonly RELOAD_POOL_SIZE = 3; // Only need a few reload sounds
    private readonly EXPLOSION_POOL_SIZE = AUDIO_POOL_SIZES.explosion;

    // Sound configurations
    private readonly soundConfigs: Record<string, SoundConfig> = SOUND_CONFIGS;

    // Audio ducking state for combat emphasis
    private isDucking = false;
    private duckingProgress = 0;
    private readonly DUCKING_AMOUNT = 0.4; // Reduce ambient to 40% during combat
    private readonly DUCK_FADE_TIME = 0.3; // Fade in/out time in seconds
    private lastCombatSoundTime = 0;
    private readonly COMBAT_TIMEOUT = 2000; // 2 seconds after last shot before unduck

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

        // Initialize SMG gunshot pool
        for (let i = 0; i < this.GUNSHOT_POOL_SIZE; i++) {
            const sound = new THREE.Audio(this.listener);
            const buffer = this.audioBuffers.get('playerSMG');
            if (buffer) {
                sound.setBuffer(buffer);
                sound.setVolume(this.soundConfigs.playerSMG.volume || 0.75);
            }
            this.playerSMGPool.push(sound);
        }

        // Initialize explosion sound pool
        for (let i = 0; i < this.EXPLOSION_POOL_SIZE; i++) {
            const sound = new THREE.PositionalAudio(this.listener);
            const buffer = this.audioBuffers.get('grenadeExplosion');
            if (buffer) {
                sound.setBuffer(buffer);
                sound.setVolume(this.soundConfigs.grenadeExplosion.volume || 0.9);
                sound.setRefDistance(this.soundConfigs.grenadeExplosion.refDistance || 15);
                sound.setMaxDistance(this.soundConfigs.grenadeExplosion.maxDistance || 150);
                sound.setRolloffFactor(this.soundConfigs.grenadeExplosion.rolloffFactor || 1.5);
                sound.setDistanceModel('linear');
            }
            this.explosionSoundPool.push(sound);
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

    // Play explosion sound at position
    playExplosionAt(position: THREE.Vector3): void {
        const sound = this.getAvailablePositionalSound(this.explosionSoundPool);
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

    /**
     * Play hit feedback sound using Web Audio API
     * Creates procedural sounds for immediate feedback
     */
    playHitFeedback(type: 'hit' | 'headshot' | 'kill'): void {
        const audioContext = this.listener.context;

        // Create oscillator and gain nodes
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const filterNode = audioContext.createBiquadFilter();

        // Configure based on hit type
        let frequency = 800;
        let duration = 0.1;
        let volume = 0.3;

        switch (type) {
            case 'headshot':
                // Higher pitch with reverb tail
                frequency = 1200;
                duration = 0.15;
                volume = 0.4;
                filterNode.type = 'highpass';
                filterNode.frequency.value = 800;
                break;
            case 'kill':
                // Low thud with bass
                frequency = 300;
                duration = 0.2;
                volume = 0.5;
                filterNode.type = 'lowpass';
                filterNode.frequency.value = 500;
                break;
            default:
                // Normal hit - short click/snap
                frequency = 800;
                duration = 0.1;
                volume = 0.3;
                filterNode.type = 'bandpass';
                filterNode.frequency.value = 800;
                filterNode.Q.value = 2;
                break;
        }

        // Configure oscillator
        oscillator.type = type === 'kill' ? 'sawtooth' : 'sine';
        oscillator.frequency.value = frequency;

        // Configure gain envelope (ADSR-like)
        const now = audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // Attack
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration); // Decay/Release

        // Connect nodes
        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Play sound
        oscillator.start(now);
        oscillator.stop(now + duration);

        // Add subtle white noise for headshots
        if (type === 'headshot') {
            this.addNoiseLayer(duration, 0.15);
        }
    }

    /**
     * Add white noise layer for richer hit sounds
     */
    private addNoiseLayer(duration: number, volume: number): void {
        const audioContext = this.listener.context;
        const bufferSize = audioContext.sampleRate * duration;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }

        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = audioContext.createGain();
        const noiseFilter = audioContext.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;

        const now = audioContext.currentTime;
        noiseGain.gain.setValueAtTime(volume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioContext.destination);

        noise.start(now);
        noise.stop(now + duration);
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
        // Update audio ducking for combat emphasis
        this.updateAudioDucking(deltaTime);
    }

    /**
     * Update audio ducking - reduce ambient sounds during combat
     */
    private updateAudioDucking(deltaTime: number): void {
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
        for (const sound of this.ambientSounds) {
            const baseVolume = this.soundConfigs.jungle1?.volume || 0.3;
            sound.setVolume(baseVolume * duckMultiplier);
        }
    }

    /**
     * Enhanced weapon sound playback with pitch/volume variation and layered sounds
     * @param weaponType - Type of weapon: 'rifle', 'shotgun', or 'smg'
     */
    playPlayerWeaponSound(weaponType: 'rifle' | 'shotgun' | 'smg' = 'rifle'): void {
        // Mark combat time for audio ducking
        this.lastCombatSoundTime = performance.now();

        // Select appropriate pool and config based on weapon type
        let pool: THREE.Audio[];
        let configKey: string;

        switch (weaponType) {
            case 'shotgun':
                pool = this.playerGunshotPool;
                configKey = 'playerShotgun';
                break;
            case 'smg':
                pool = this.playerSMGPool;
                configKey = 'playerSMG';
                break;
            default: // rifle
                pool = this.playerGunshotPool;
                configKey = 'playerGunshot';
        }

        // Get sound from pool
        const sound = this.getAvailableSound(pool);
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

        // Add procedural bass layer for more punch
        this.addWeaponBassLayer(weaponType);

        // Add supersonic crack layer for rifles and SMGs
        if (weaponType === 'rifle' || weaponType === 'smg') {
            this.addSupersonicCrack(0.3);
        }
    }

    /**
     * Add procedural bass/thump layer to weapon sound for extra punch
     */
    private addWeaponBassLayer(weaponType: 'rifle' | 'shotgun' | 'smg'): void {
        const audioContext = this.listener.context;

        // Create oscillator for bass thump
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const filterNode = audioContext.createBiquadFilter();

        // Configure based on weapon type
        let frequency = 80; // Base frequency
        let duration = 0.08;
        let volume = 0.25;

        switch (weaponType) {
            case 'shotgun':
                frequency = 60; // Lower, heavier thump
                duration = 0.12;
                volume = 0.35;
                break;
            case 'smg':
                frequency = 100; // Higher, snappier
                duration = 0.06;
                volume = 0.2;
                break;
        }

        // Configure oscillator - sawtooth for rich harmonics
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = frequency;

        // Configure low-pass filter for bass emphasis
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 300;
        filterNode.Q.value = 0.5;

        // Configure gain envelope
        const now = audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.005); // Fast attack
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration); // Decay

        // Connect nodes
        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Play sound
        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    /**
     * Add supersonic bullet crack/snap sound
     */
    private addSupersonicCrack(volume: number = 0.25): void {
        const audioContext = this.listener.context;

        // Create white noise for crack
        const bufferSize = audioContext.sampleRate * 0.05; // 50ms
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }

        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = audioContext.createGain();
        const noiseFilter = audioContext.createBiquadFilter();

        // High-pass filter for sharp crack
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 2000;
        noiseFilter.Q.value = 2.0;

        const now = audioContext.currentTime;
        noiseGain.gain.setValueAtTime(volume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioContext.destination);

        noise.start(now);
        noise.stop(now + 0.05);
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
        this.lastCombatSoundTime = performance.now();

        const sound = this.getAvailablePositionalSound(this.positionalGunshotPool);
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
        const sound = this.getAvailableSound(this.playerReloadPool);
        if (!sound) return;

        // Use reload sound with pitch variation for switch
        sound.setPlaybackRate(1.2 + Math.random() * 0.2);
        sound.setVolume(0.4);
        sound.play();
    }

    /**
     * Play bullet whiz/crack sound when bullets pass close to player
     * @param bulletPosition - Position where bullet passed close
     * @param playerPosition - Player's current position
     */
    playBulletWhizSound(bulletPosition: THREE.Vector3, playerPosition: THREE.Vector3): void {
        const distance = bulletPosition.distanceTo(playerPosition);

        // Only play whiz sound for very close near-misses (within 3 meters)
        if (distance > 3) return;

        const audioContext = this.listener.context;

        // Create white noise for bullet whiz
        const bufferSize = audioContext.sampleRate * 0.08; // 80ms
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }

        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = audioContext.createGain();
        const noiseFilter = audioContext.createBiquadFilter();

        // Band-pass filter for characteristic whiz sound
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1500 + Math.random() * 1000; // Vary frequency
        noiseFilter.Q.value = 3.0;

        // Volume based on proximity - closer = louder
        const proximityFactor = 1 - (distance / 3);
        const baseVolume = 0.4 * proximityFactor;

        const now = audioContext.currentTime;
        noiseGain.gain.setValueAtTime(baseVolume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioContext.destination);

        noise.start(now);
        noise.stop(now + 0.08);
    }

    dispose(): void {
        // Stop all sounds
        for (const sound of this.playerGunshotPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.playerSMGPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.positionalGunshotPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.deathSoundPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.explosionSoundPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.ambientSounds) {
            if (sound.isPlaying) sound.stop();
        }

        // Clear pools
        this.playerGunshotPool = [];
        this.playerSMGPool = [];
        this.positionalGunshotPool = [];
        this.deathSoundPool = [];
        this.playerReloadPool = [];
        this.explosionSoundPool = [];
        this.ambientSounds = [];

        // Clear buffers
        this.audioBuffers.clear();

        console.log('[AudioManager] Disposed');
    }
}