import * as THREE from 'three';
import { GameSystem } from '../../types';
import { SOUND_CONFIGS, SoundConfig } from '../../config/audio';
import { AudioPoolManager } from './AudioPoolManager';
import { AudioDuckingSystem } from './AudioDuckingSystem';
import { AmbientSoundManager } from './AmbientSoundManager';
import { AudioWeaponSounds } from './AudioWeaponSounds';
import { Logger } from '../../utils/Logger';
import { GameEventBus } from '../../core/GameEventBus';
import { getWorldBuilderState } from '../../dev/worldBuilder/WorldBuilderConsole';
import { markStartup } from '../../core/StartupTelemetry';

// Boot-critical sounds are awaited by `init()` so the ambient layer can
// start the moment `startAmbient()` fires. Everything else (the SFX bank,
// hit-feedback, etc.) decodes in the background so it does not block the
// startup tail. Per `cycle-mobile-webgl2-fallback-fix` /
// `asset-audio-defer`: mobile-emulation startup spent ~31 s in
// `systems.audio.{begin,end}` awaiting the full bank; deferring SFX
// trims that tail below the playable-frame bracket.
const BOOT_CRITICAL_SOUND_KEYS: ReadonlyArray<string> = ['jungle1', 'jungle2'];

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
    private static loggedLoadFailures: Set<string> = new Set();
    private static loggedOptionalMissing: Set<string> = new Set();
    private hitFeedbackMissingLogged = false;
    private eventUnsubscribes: (() => void)[] = [];

    // Background SFX decode tracking. `init()` returns once the boot-critical
    // ambient bank is decoded; the SFX bank decodes in parallel and lets
    // first playable frame land sooner. `whenSfxReady()` is the test seam.
    private backgroundDecodePromise: Promise<void> | null = null;
    private sfxPoolsInitialized = false;
    // WorldBuilder ambient-mute tracker (dev-only, gated by Vite DCE in
    // retail). When the flag toggles we apply 0 or 1 to ambient volume once
    // per transition rather than every frame, so user/scene volume edits
    // outside the dev console aren't clobbered.
    private worldBuilderAmbientMuted = false;

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
            document.removeEventListener('touchend', resumeAudio);
        };

        // Add listeners for user interaction (touchend for mobile)
        document.addEventListener('click', resumeAudio);
        document.addEventListener('keydown', resumeAudio);
        document.addEventListener('touchend', resumeAudio);
    }

    async init(onProgress?: (loaded: number, total: number) => void): Promise<void> {
        Logger.info('Audio', 'Initializing audio system...');

        const entries = Object.entries(this.soundConfigs);
        const total = entries.length;
        const counter = { loaded: 0 };

        const bootCriticalEntries = entries.filter(([key]) => BOOT_CRITICAL_SOUND_KEYS.includes(key));
        const backgroundEntries = entries.filter(([key]) => !BOOT_CRITICAL_SOUND_KEYS.includes(key));

        // Boot-critical: only the ambient tracks needed by `startAmbient()`.
        // Awaiting these means the ambient layer is ready by the time mode
        // startup calls `startAmbient()` while letting the SFX bank decode
        // off the critical path.
        await this.loadAudioBank(bootCriticalEntries, counter, total, onProgress);

        // Subscribe to game events (additive - direct play calls still work).
        // npc_killed and explosion audio is still handled by direct calls from
        // CombatantDamage/GrenadeEffects. These subscriptions are wired for
        // events that lack a direct audio path today, and as migration targets
        // for the direct-call paths once dual-emit is validated.
        this.eventUnsubscribes.push(
            GameEventBus.subscribe('zone_captured', (_e) => {
                this.play('zoneCaptured', undefined, 0.6);
            }),
        );

        // Kick off SFX decode in the background. We DO NOT await this — the
        // intent is to overlap decode with the rest of system construction
        // and mode startup so the first playable frame lands sooner. Pools
        // initialize once the bank lands, so the first shot finds them ready.
        this.backgroundDecodePromise = this.loadBackgroundSfx(backgroundEntries, counter, total, onProgress);

        Logger.info('Audio', 'Audio system initialized (boot-critical bank ready; SFX decoding in background)');
    }

    // Call this when the game actually starts
    public startAmbient(): void {
        this.ambientManager.start();
    }

    /**
     * Test/diagnostic seam: awaits the background SFX decode if one is in
     * flight. Production code does NOT need to call this — the SFX pools
     * are initialized when the bank lands, and pre-decode `play()` calls
     * no-op gracefully via the `audioBuffers.get(...)` miss path.
     */
    public whenSfxReady(): Promise<void> {
        return this.backgroundDecodePromise ?? Promise.resolve();
    }

    private async loadBackgroundSfx(
        entries: Array<[string, SoundConfig]>,
        counter: { loaded: number },
        total: number,
        onProgress?: (loaded: number, total: number) => void,
    ): Promise<void> {
        markStartup('systems.audio.background.begin');
        await this.loadAudioBank(entries, counter, total, onProgress);
        // Pools depend on the SFX buffers being decoded. Initialize once
        // the bank lands so the first shot finds the pool populated.
        if (!this.sfxPoolsInitialized) {
            this.poolManager.initializePools();
            this.sfxPoolsInitialized = true;
        }
        markStartup('systems.audio.background.end');
    }

    private async loadAudioBank(
        entries: Array<[string, SoundConfig]>,
        counter: { loaded: number },
        total: number,
        onProgress?: (loaded: number, total: number) => void,
    ): Promise<void> {
        if (entries.length === 0) {
            onProgress?.(counter.loaded, Math.max(total, 1));
            return;
        }
        const loadPromises: Promise<{key: string, buffer?: AudioBuffer}>[] = [];

        for (const [key, config] of entries) {
            loadPromises.push(
                this.loadAudio(key, config.path)
                    .then(buffer => ({ key, buffer }))
                    .catch(() => {
                        const dedupeKey = `${key}:${config.path}`;
                        if (!AudioManager.loggedOptionalMissing.has(dedupeKey)) {
                            AudioManager.loggedOptionalMissing.add(dedupeKey);
                            Logger.warn('Audio', `Optional audio ${key} not found: ${config.path}`);
                        }
                        return { key, buffer: undefined };
                    })
                    .then(result => {
                        counter.loaded++;
                        onProgress?.(counter.loaded, total);
                        return result;
                    })
            );
        }

        const results = await Promise.all(loadPromises);
        for (const result of results) {
            if (result.buffer) {
                this.audioBuffers.set(result.key, result.buffer);
            }
        }
    }

    private loadAudio(key: string, path: string): Promise<AudioBuffer> {
        return new Promise((resolve, reject) => {
            this.audioLoader.load(
                path,
                (buffer) => {
                    Logger.debug('Audio', `Loaded: ${key}`);
                    resolve(buffer);
                },
                () => {
                    // Progress callback
                },
                (error) => {
                    const dedupeKey = `${key}:${path}`;
                    if (!AudioManager.loggedLoadFailures.has(dedupeKey)) {
                        AudioManager.loggedLoadFailures.add(dedupeKey);
                        const message = error instanceof Error ? error.message : String(error);
                        Logger.warn('Audio', `Failed to load ${key}: ${path} (${message})`);
                    }
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
            return;
        }

        if (!this.hitFeedbackMissingLogged) {
            this.hitFeedbackMissingLogged = true;
            Logger.warn('Audio', 'Missing optional hitMarker asset; hit feedback audio disabled');
        }
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

        const config = this.soundConfigs[soundName];

        if (position) {
            // Play positional sound
            const sound = new THREE.PositionalAudio(this.listener);
            sound.setBuffer(buffer);
            sound.setVolume((config?.volume || 1.0) * volume);
            sound.setRefDistance(config?.refDistance || 10);
            sound.setMaxDistance(config?.maxDistance || 100);
            if (config?.rolloffFactor !== undefined) {
                sound.setRolloffFactor(config.rolloffFactor);
            }

            const tempObj = new THREE.Object3D();
            tempObj.position.copy(position);
            tempObj.add(sound);
            tempObj.matrixAutoUpdate = true;
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
            sound.setVolume((config?.volume || 1.0) * volume);
            sound.play();
        }
    }

    playDistantCombat(volume: number): void {
        const clampedVolume = Math.max(0.01, Math.min(1, volume));
        const soundName = Math.random() < 0.25 ? 'grenadeExplosion' : 'otherGunshot';
        this.play(soundName, undefined, clampedVolume);
    }

    playThunder(volume: number = 0.4): void {
        // Reuse the deepest available low-frequency asset until a dedicated
        // thunder recording is added to the audio manifest.
        this.play('grenadeExplosion', undefined, Math.max(0.05, Math.min(1, volume)));
    }

    // Get the audio listener for other systems
    getListener(): THREE.AudioListener {
        return this.listener;
    }

    update(deltaTime: number): void {
        // Update audio ducking for combat emphasis
        this.duckingSystem.update(deltaTime, this.ambientManager.getAmbientSounds());
        this.applyWorldBuilderAmbientFlag();
    }

    private applyWorldBuilderAmbientFlag(): void {
        if (!import.meta.env.DEV) return;
        const wb = getWorldBuilderState();
        const shouldMute = Boolean(wb && wb.ambientAudioEnabled === false);
        if (shouldMute === this.worldBuilderAmbientMuted) return;
        this.worldBuilderAmbientMuted = shouldMute;
        this.ambientManager.setVolume(shouldMute ? 0 : 1);
    }

    /**
     * Enhanced weapon sound playback with pitch/volume variation and layered sounds
     * @param weaponType - Type of weapon: 'rifle', 'shotgun', or 'smg'
     */
    playPlayerWeaponSound(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher' = 'rifle'): void {
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
        // Unsubscribe from game events
        for (const unsub of this.eventUnsubscribes) unsub();
        this.eventUnsubscribes.length = 0;

        // Dispose modules
        this.poolManager.dispose();
        this.ambientManager.dispose();

        // Clear buffers
        this.audioBuffers.clear();

        Logger.info('Audio', 'Disposed');
    }
}
