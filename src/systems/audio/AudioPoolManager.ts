import * as THREE from 'three';
import { AUDIO_POOL_SIZES, SOUND_CONFIGS, SoundConfig } from '../../config/audio';

/**
 * Manages audio pools for frequently used sounds.
 * Handles creation, retrieval, and release of pooled audio instances.
 */
export class AudioPoolManager {
    private listener: THREE.AudioListener;
    private scene: THREE.Scene;
    private audioBuffers: Map<string, AudioBuffer>;
    private soundConfigs: Record<string, SoundConfig> = SOUND_CONFIGS;

    // Sound pools for frequently used sounds
    private playerGunshotPool: THREE.Audio[] = [];
    private playerSMGPool: THREE.Audio[] = [];
    private positionalGunshotPool: THREE.PositionalAudio[] = [];
    private deathSoundPool: THREE.PositionalAudio[] = [];
    private playerReloadPool: THREE.Audio[] = [];
    private explosionSoundPool: THREE.PositionalAudio[] = [];
    private hitFeedbackPool: THREE.Audio[] = [];
    private bulletWhizPool: THREE.Audio[] = [];

    // Object3D pool for positional audio (avoids per-sound allocations)
    private object3DPool: THREE.Object3D[] = [];
    private readonly OBJECT3D_POOL_SIZE = 32;

    // Pool sizes
    private readonly GUNSHOT_POOL_SIZE = AUDIO_POOL_SIZES.gunshot;
    private readonly DEATH_POOL_SIZE = AUDIO_POOL_SIZES.death;
    private readonly RELOAD_POOL_SIZE = 3;
    private readonly EXPLOSION_POOL_SIZE = AUDIO_POOL_SIZES.explosion;

    constructor(listener: THREE.AudioListener, scene: THREE.Scene, audioBuffers: Map<string, AudioBuffer>) {
        this.listener = listener;
        this.scene = scene;
        this.audioBuffers = audioBuffers;
    }

    /**
     * Initialize all sound pools
     */
    initializePools(): void {
        this.initializeObject3DPool();
        this.initializeSoundPools();
        this.initializeHitFeedbackPool();
    }

    private initializeObject3DPool(): void {
        for (let i = 0; i < this.OBJECT3D_POOL_SIZE; i++) {
            this.object3DPool.push(new THREE.Object3D());
        }
    }

    private initializeHitFeedbackPool(): void {
        // Initialize hit feedback pool if hitMarker sound is loaded
        const hitBuffer = this.audioBuffers.get('hitMarker');
        if (hitBuffer) {
            for (let i = 0; i < 8; i++) {
                const sound = new THREE.Audio(this.listener);
                sound.setBuffer(hitBuffer);
                sound.setVolume(0.5);
                this.hitFeedbackPool.push(sound);
            }
        }

        // Initialize bullet whiz pool if bulletWhiz sound is loaded
        const whizBuffer = this.audioBuffers.get('bulletWhiz');
        if (whizBuffer) {
            for (let i = 0; i < 8; i++) {
                const sound = new THREE.Audio(this.listener);
                sound.setBuffer(whizBuffer);
                sound.setVolume(0.4);
                this.bulletWhizPool.push(sound);
            }
        }
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

    /**
     * Get available non-positional sound from pool
     */
    getAvailableSound(pool: THREE.Audio[]): THREE.Audio | null {
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
     * Get available positional sound from pool
     */
    getAvailablePositionalSound(pool: THREE.PositionalAudio[]): THREE.PositionalAudio | null {
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
     * Get pooled Object3D for positional audio
     */
    getPooledObject3D(): THREE.Object3D {
        // Find one not currently in scene
        for (const obj of this.object3DPool) {
            if (!obj.parent) {
                return obj;
            }
        }
        // All in use, create a new one (will be added to pool on release)
        const newObj = new THREE.Object3D();
        this.object3DPool.push(newObj);
        return newObj;
    }

    /**
     * Release Object3D back to pool
     */
    releaseObject3D(obj: THREE.Object3D): void {
        if (obj.parent) {
            obj.parent.remove(obj);
        }
        // Clear any children (like PositionalAudio)
        while (obj.children.length > 0) {
            obj.remove(obj.children[0]);
        }
    }

    // Pool getters
    getPlayerGunshotPool(): THREE.Audio[] { return this.playerGunshotPool; }
    getPlayerSMGPool(): THREE.Audio[] { return this.playerSMGPool; }
    getPositionalGunshotPool(): THREE.PositionalAudio[] { return this.positionalGunshotPool; }
    getDeathSoundPool(): THREE.PositionalAudio[] { return this.deathSoundPool; }
    getPlayerReloadPool(): THREE.Audio[] { return this.playerReloadPool; }
    getExplosionSoundPool(): THREE.PositionalAudio[] { return this.explosionSoundPool; }
    getHitFeedbackPool(): THREE.Audio[] { return this.hitFeedbackPool; }
    getBulletWhizPool(): THREE.Audio[] { return this.bulletWhizPool; }

    /**
     * Dispose all pools
     */
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

        for (const sound of this.hitFeedbackPool) {
            if (sound.isPlaying) sound.stop();
        }

        for (const sound of this.bulletWhizPool) {
            if (sound.isPlaying) sound.stop();
        }

        // Clear pools
        this.playerGunshotPool = [];
        this.playerSMGPool = [];
        this.positionalGunshotPool = [];
        this.deathSoundPool = [];
        this.playerReloadPool = [];
        this.explosionSoundPool = [];
        this.hitFeedbackPool = [];
        this.bulletWhizPool = [];
    }
}
