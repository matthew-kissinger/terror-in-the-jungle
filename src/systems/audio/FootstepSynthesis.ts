import * as THREE from 'three';
import { TerrainType } from '../../types';

/**
 * Interface for a function that starts a synthesized sound
 * @returns duration of the sound in seconds
 */
export type SynthesisStarter = (destination: AudioNode) => number;

/**
 * Procedural footstep audio synthesis
 */
export class FootstepSynthesis {
  /**
   * Create noise buffer for procedural sounds
   */
  static createNoiseBuffer(audioContext: BaseAudioContext, duration: number, amplitude: number): AudioBuffer {
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * amplitude;
    }
    
    return buffer;
  }

  /**
   * Grass footstep: soft rustle with filtered noise
   */
  static createGrassFootstep(audioContext: BaseAudioContext, volume: number, pitch: number): SynthesisStarter {
    return (destination: AudioNode) => {
      const duration = 0.12;
      
      // Create noise buffer
      const bufferSize = audioContext.sampleRate * duration;
      const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      
      // Generate brown noise (softer than white noise)
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + white * 0.05) / 1.05;
        lastOut = data[i];
        data[i] *= 0.4; // Soft volume
      }
      
      const noise = audioContext.createBufferSource();
      noise.buffer = buffer;
      noise.playbackRate.value = pitch;
      
      // Band-pass filter for rustle
      const filter = audioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 300 + Math.random() * 200;
      filter.Q.value = 1.5;
      
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      noise.connect(filter).connect(gain).connect(destination);
      noise.start(now);
      noise.stop(now + duration);
      
      return duration;
    };
  }

  /**
   * Mud footstep: squelchy low-frequency sound
   */
  static createMudFootstep(audioContext: BaseAudioContext, volume: number, pitch: number): SynthesisStarter {
    return (destination: AudioNode) => {
      const duration = 0.15;
      const now = audioContext.currentTime;
      
      // Create squelch with oscillator + noise
      const osc = audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 80 * pitch;
      
      // Low-pass filter for muddy sound
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      filter.Q.value = 2.0;
      
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(volume * 0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Add noise component
      const noiseBuffer = this.createNoiseBuffer(audioContext, duration, 0.3);
      const noise = audioContext.createBufferSource();
      noise.buffer = noiseBuffer;
      
      const noiseGain = audioContext.createGain();
      noiseGain.gain.setValueAtTime(volume * 0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Mix oscillator and noise
      const merger = audioContext.createChannelMerger(2);
      osc.connect(filter).connect(gain).connect(merger, 0, 0);
      noise.connect(noiseGain).connect(merger, 0, 1);
      merger.connect(destination);
      
      osc.start(now);
      osc.stop(now + duration);
      noise.start(now);
      noise.stop(now + duration);
      
      return duration;
    };
  }

  /**
   * Water footstep: splash with pitch sweep
   */
  static createWaterFootstep(audioContext: BaseAudioContext, volume: number, pitch: number): SynthesisStarter {
    return (destination: AudioNode) => {
      const duration = 0.18;
      const now = audioContext.currentTime;
      
      // Noise burst for splash
      const noiseBuffer = this.createNoiseBuffer(audioContext, duration, 0.5);
      const noise = audioContext.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.playbackRate.value = pitch;
      
      // Band-pass with frequency sweep
      const filter = audioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + duration);
      filter.Q.value = 2.0;
      
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(volume * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      noise.connect(filter).connect(gain).connect(destination);
      noise.start(now);
      noise.stop(now + duration);
      
      return duration;
    };
  }

  /**
   * Rock footstep: hard tap with high frequencies
   */
  static createRockFootstep(audioContext: BaseAudioContext, volume: number, pitch: number): SynthesisStarter {
    return (destination: AudioNode) => {
      const duration = 0.08;
      const now = audioContext.currentTime;
      
      // Short click/tap sound
      const osc = audioContext.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 1200 * pitch;
      
      // High-pass for sharp click
      const filter = audioContext.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      filter.Q.value = 1.0;
      
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
      
      // Add noise click
      const noiseBuffer = this.createNoiseBuffer(audioContext, duration * 0.5, 0.6);
      const noise = audioContext.createBufferSource();
      noise.buffer = noiseBuffer;
      
      const noiseGain = audioContext.createGain();
      noiseGain.gain.setValueAtTime(volume * 0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.5);
      
      // Mix oscillator and noise
      const merger = audioContext.createChannelMerger(2);
      osc.connect(filter).connect(gain).connect(merger, 0, 0);
      noise.connect(noiseGain).connect(merger, 0, 1);
      merger.connect(destination);
      
      osc.start(now);
      osc.stop(now + duration);
      noise.start(now);
      noise.stop(now + duration * 0.5);
      
      return duration;
    };
  }
}
