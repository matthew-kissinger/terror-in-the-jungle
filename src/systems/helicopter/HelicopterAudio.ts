import * as THREE from 'three';
import { HelicopterPhysics } from './HelicopterPhysics';
import { Logger } from '../../utils/Logger';

/**
 * Manages helicopter audio system including rotor blade sounds.
 * Handles audio initialization, playback, and volume/playback rate updates.
 */
export class HelicopterAudio {
  private audioListener?: THREE.AudioListener;
  private rotorAudio: Map<string, THREE.PositionalAudio> = new Map();
  private audioLoader = new THREE.AudioLoader();

  /**
   * Set the audio listener for 3D positional audio.
   */
  setAudioListener(listener: THREE.AudioListener): void {
    this.audioListener = listener;
  }

  /**
   * Initialize audio for a helicopter.
   */
  initialize(helicopterId: string, helicopter: THREE.Group): void {
    if (!this.audioListener) {
      console.warn('🚁🔊 No audio listener available for helicopter audio');
      return;
    }

    // Create positional audio for helicopter rotor blades
    const rotorAudio = new THREE.PositionalAudio(this.audioListener);

    // Load rotor blade audio
    this.audioLoader.load(
      `${import.meta.env.BASE_URL}assets/RotorBlades.ogg`,
      (buffer) => {
        rotorAudio.setBuffer(buffer);
        rotorAudio.setLoop(true);
        rotorAudio.setVolume(0.0); // Start silent
        rotorAudio.setRefDistance(25); // Can be heard from 25 units away
        rotorAudio.setRolloffFactor(0.8); // Less aggressive rolloff for better audibility
        rotorAudio.setMaxDistance(100); // Ensure it can be heard at reasonable distance

        // Don't start playing immediately - wait for control
        Logger.debug('helicopter', '🚁🔊 Helicopter rotor audio loaded and ready - volume:', rotorAudio.getVolume());
      },
      undefined,
      (error) => {
        console.error('🚁🔊 Failed to load helicopter rotor audio:', error);
      }
    );

    // Attach audio to helicopter
    helicopter.add(rotorAudio);
    this.rotorAudio.set(helicopterId, rotorAudio);
  }

  /**
   * Update helicopter audio based on engine state and player control.
   */
  update(
    helicopterId: string,
    deltaTime: number,
    physics: HelicopterPhysics | undefined,
    isPlayerControlling: boolean
  ): void {
    const rotorAudio = this.rotorAudio.get(helicopterId);
    if (!rotorAudio) return;

    let targetVolume: number;
    let targetPlaybackRate: number;

    if (isPlayerControlling && physics) {
      // Player is controlling - ensure audio is playing
      if (!rotorAudio.isPlaying) {
        rotorAudio.play();
        Logger.debug('helicopter', '🚁🔊 Starting helicopter rotor audio');
      }

      // Use physics data
      const controls = physics.getControls();
      const state = physics.getState();

      // Calculate volume primarily based on collective (thrust)
      const baseVolume = 0.3; // Always some idle sound
      const thrustVolume = controls.collective * 0.7; // Thrust contributes most to volume
      const engineVolume = state.engineRPM * 0.2; // Engine RPM adds some variation

      targetVolume = Math.min(1.0, baseVolume + thrustVolume + engineVolume);

      // Calculate playback rate based on total engine activity
      const basePlaybackRate = 0.9;
      const thrustRate = controls.collective * 0.3;
      const rpmRate = state.engineRPM * 0.2;

      targetPlaybackRate = basePlaybackRate + thrustRate + rpmRate;

      // Debug logging occasionally
      if (Math.random() < 0.02) { // 2% of frames
        Logger.debug('helicopter', `🚁🔊 Controlled Audio: collective=${controls.collective.toFixed(2)}, RPM=${state.engineRPM.toFixed(2)}, volume=${targetVolume.toFixed(2)}, rate=${targetPlaybackRate.toFixed(2)}`);
      }
    } else {
      // Helicopter not controlled - stop audio
      if (rotorAudio.isPlaying) {
        rotorAudio.stop();
        Logger.debug('helicopter', '🚁🔊 Stopping helicopter rotor audio');
      }
      targetVolume = 0.0;
      targetPlaybackRate = 0.8;
    }

    // Faster transitions for more responsive audio
    const volumeTransitionSpeed = 4.0 * deltaTime;
    const rateTransitionSpeed = 3.0 * deltaTime;

    // Apply smooth volume changes
    const currentVolume = rotorAudio.getVolume();
    const newVolume = THREE.MathUtils.lerp(currentVolume, targetVolume, volumeTransitionSpeed);
    rotorAudio.setVolume(newVolume);

    // Apply smooth playback rate changes
    try {
      if (rotorAudio.source) {
        const currentRate = rotorAudio.getPlaybackRate();
        const newRate = THREE.MathUtils.lerp(currentRate, targetPlaybackRate, rateTransitionSpeed);
        rotorAudio.setPlaybackRate(newRate);
      }
    } catch (error) {
      // Playback rate control not supported or not ready, skip
    }
  }

  /**
   * Clean up audio for a helicopter.
   */
  dispose(helicopterId: string): void {
    const audio = this.rotorAudio.get(helicopterId);
    if (audio) {
      if (audio.isPlaying) {
        audio.stop();
      }
      audio.disconnect();
      this.rotorAudio.delete(helicopterId);
    }
  }

  /**
   * Clean up all audio.
   */
  disposeAll(): void {
    this.rotorAudio.forEach(audio => {
      if (audio.isPlaying) {
        audio.stop();
      }
      audio.disconnect();
    });
    this.rotorAudio.clear();
  }
}
