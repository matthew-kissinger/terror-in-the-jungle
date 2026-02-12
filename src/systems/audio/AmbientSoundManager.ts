import * as THREE from 'three';
import { SOUND_CONFIGS } from '../../config/audio';

/**
 * Manages ambient sound playback with sequential track switching.
 */
export class AmbientSoundManager {
    private listener: THREE.AudioListener;
    private audioBuffers: Map<string, AudioBuffer>;
    private ambientSounds: THREE.Audio[] = [];
    private currentAmbientTrack?: string;
    private isPlaying = false;
    private nextTrackTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(listener: THREE.AudioListener, audioBuffers: Map<string, AudioBuffer>) {
        this.listener = listener;
        this.audioBuffers = audioBuffers;
    }

    /**
     * Start playing ambient sounds
     */
    start(): void {
        if (this.ambientSounds.length === 0 && !this.isPlaying) {
            this.isPlaying = true;
            this.playNextTrack();
        }
    }

    /**
     * Get current ambient sounds array (for ducking system)
     */
    getAmbientSounds(): THREE.Audio[] {
        return this.ambientSounds;
    }

    /**
     * Set ambient volume
     */
    setVolume(volume: number): void {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        for (const sound of this.ambientSounds) {
            sound.setVolume(clampedVolume * (SOUND_CONFIGS.jungle1.volume || 0.3));
        }
    }

    /**
     * Play next ambient track in sequence
     */
    private playNextTrack(): void {
        if (!this.isPlaying) return;

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
        sound.setVolume(SOUND_CONFIGS[nextTrack].volume || 0.3);
        sound.setLoop(false); // Don't loop individual tracks

        // Schedule next track when this one ends
        sound.onEnded = () => {
            // Small gap between tracks for natural feel
            this.nextTrackTimeout = setTimeout(() => this.playNextTrack(), 2000);
        };

        sound.play();
        this.ambientSounds.push(sound);
    }

    /**
     * Stop all ambient sounds
     */
    stop(): void {
        this.isPlaying = false;
        if (this.nextTrackTimeout) {
            clearTimeout(this.nextTrackTimeout);
            this.nextTrackTimeout = null;
        }
        this.ambientSounds.forEach(sound => {
            if (sound.isPlaying) sound.stop();
        });
        this.ambientSounds = [];
    }

    /**
     * Dispose ambient sound manager
     */
    dispose(): void {
        this.stop();
        if (this.nextTrackTimeout) {
            clearTimeout(this.nextTrackTimeout);
            this.nextTrackTimeout = null;
        }
    }
}
