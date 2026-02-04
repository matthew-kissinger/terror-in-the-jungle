import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from '../combat/types';
import { GameSystem } from '../../types';

/**
 * Voice callout types for combat events
 */
export enum CalloutType {
  CONTACT = 'contact',              // Spotted an enemy
  TAKING_FIRE = 'taking_fire',      // Under fire
  GRENADE = 'grenade',              // Grenade warning
  MAN_DOWN = 'man_down',            // Teammate killed
  RELOADING = 'reloading',          // Reloading weapon
  TARGET_DOWN = 'target_down',      // Kill confirmed
  SUPPRESSING = 'suppressing',      // Laying down suppressive fire
  MOVING = 'moving',                // Moving to new position
  IN_COVER = 'in_cover'             // Reached cover
}

/**
 * Voice callout cooldown per combatant
 */
interface CalloutCooldown {
  combatantId: string;
  lastCalloutTime: number;
  lastCalloutType: CalloutType | null;
}

/**
 * VoiceCalloutSystem - Tactical audio feedback when NPCs take actions
 * Uses Web Audio API to generate procedural voice-like sounds as placeholders
 * for real voice assets to be added later
 */
export class VoiceCalloutSystem implements GameSystem {
  private listener: THREE.AudioListener;
  private scene: THREE.Scene;
  private audioContext: AudioContext;

  // Cooldown tracking
  private cooldowns: Map<string, CalloutCooldown> = new Map();
  private readonly GLOBAL_COOLDOWN_MS = 5000; // 5 seconds minimum between callouts per combatant
  private readonly TYPE_COOLDOWN_MS = 10000; // 10 seconds between same type of callout

  // Audio parameters for different callout types
  private calloutFrequencies: Record<CalloutType, number[]> = {
    [CalloutType.CONTACT]: [180, 220, 200],           // Rising tone
    [CalloutType.TAKING_FIRE]: [240, 200, 180],       // Falling tone (panic)
    [CalloutType.GRENADE]: [260, 280, 300, 320],      // Sharp ascending (warning)
    [CalloutType.MAN_DOWN]: [150, 140, 130],          // Low, somber
    [CalloutType.RELOADING]: [200, 180],              // Quick drop
    [CalloutType.TARGET_DOWN]: [160, 180, 200],       // Confident rise
    [CalloutType.SUPPRESSING]: [190, 200, 190],       // Steady tone
    [CalloutType.MOVING]: [180, 200],                 // Quick rise
    [CalloutType.IN_COVER]: [200, 180, 160]           // Falling (relief)
  };

  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly MAX_CALLOUT_DISTANCE = 50; // Only play callouts from NPCs within 50m of player

  constructor(scene: THREE.Scene, listener: THREE.AudioListener) {
    this.scene = scene;
    this.listener = listener;
    this.audioContext = listener.context;
  }

  async init(): Promise<void> {
    Logger.info('audio', '[VoiceCalloutSystem] Initialized');
  }

  /**
   * Update player position for distance-based callout filtering
   */
  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Trigger a voice callout from a combatant
   */
  triggerCallout(combatant: Combatant, type: CalloutType, position: THREE.Vector3): void {
    // Only trigger for living combatants
    if (combatant.state === CombatantState.DEAD) return;

    // Check distance to player - only play nearby callouts
    const distanceToPlayer = position.distanceTo(this.playerPosition);
    if (distanceToPlayer > this.MAX_CALLOUT_DISTANCE) return;

    // Check cooldowns
    if (!this.canTriggerCallout(combatant.id, type)) return;

    // Update cooldown
    this.cooldowns.set(combatant.id, {
      combatantId: combatant.id,
      lastCalloutTime: Date.now(),
      lastCalloutType: type
    });

    // Play positional callout
    this.playCallout(type, position, combatant.faction, distanceToPlayer);

    // Debug logging for nearby callouts
    if (distanceToPlayer < 20) {
      Logger.info('audio', `🗣️ ${combatant.faction} callout: ${type} at ${Math.floor(distanceToPlayer)}m`);
    }
  }

  /**
   * Check if combatant can trigger a callout (cooldown check)
   */
  private canTriggerCallout(combatantId: string, type: CalloutType): boolean {
    const cooldown = this.cooldowns.get(combatantId);
    if (!cooldown) return true;

    const now = Date.now();
    const timeSinceLastCallout = now - cooldown.lastCalloutTime;

    // Global cooldown check
    if (timeSinceLastCallout < this.GLOBAL_COOLDOWN_MS) return false;

    // Type-specific cooldown check
    if (cooldown.lastCalloutType === type && timeSinceLastCallout < this.TYPE_COOLDOWN_MS) {
      return false;
    }

    return true;
  }

  /**
   * Play procedural voice callout using Web Audio API
   */
  private playCallout(
    type: CalloutType,
    position: THREE.Vector3,
    faction: Faction,
    distanceToPlayer: number
  ): void {
    const frequencies = this.calloutFrequencies[type];
    const duration = 0.08 * frequencies.length; // 80ms per tone segment

    // Create positional audio source
    const sound = new THREE.PositionalAudio(this.listener);
    sound.setRefDistance(8);
    sound.setMaxDistance(this.MAX_CALLOUT_DISTANCE);
    sound.setRolloffFactor(2);
    sound.setDistanceModel('linear');

    // Create temporary object at position
    const tempObj = new THREE.Object3D();
    tempObj.position.copy(position);
    tempObj.add(sound);
    this.scene.add(tempObj);

    // Generate procedural callout using oscillators
    this.generateVoiceCallout(frequencies, duration, faction);

    // Clean up after sound finishes
    setTimeout(() => {
      tempObj.remove(sound);
      this.scene.remove(tempObj);
    }, duration * 1000 + 100);
  }

  /**
   * Generate procedural voice-like sound with multiple frequency components
   */
  private generateVoiceCallout(
    frequencies: number[],
    totalDuration: number,
    faction: Faction
  ): void {
    const now = this.audioContext.currentTime;
    const segmentDuration = totalDuration / frequencies.length;

    // Faction-specific pitch shift
    const factionPitchMultiplier = faction === Faction.US ? 1.0 : 0.85; // OPFOR slightly lower

    // Create voice formant using multiple oscillators (simulates vocal tract)
    frequencies.forEach((baseFreq, i) => {
      const startTime = now + i * segmentDuration;
      const freq = baseFreq * factionPitchMultiplier;

      // Fundamental frequency (vocal cord vibration)
      this.createVoiceComponent(freq, startTime, segmentDuration, 0.3);

      // First formant (chest resonance)
      this.createVoiceComponent(freq * 2.5, startTime, segmentDuration, 0.15);

      // Second formant (throat/mouth)
      this.createVoiceComponent(freq * 4.0, startTime, segmentDuration, 0.08);

      // Add noise component for consonants
      if (i === 0 || i === frequencies.length - 1) {
        this.createNoiseComponent(startTime, segmentDuration * 0.3, 0.12);
      }
    });
  }

  /**
   * Create a single voice frequency component (formant)
   */
  private createVoiceComponent(
    frequency: number,
    startTime: number,
    duration: number,
    volume: number
  ): void {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    const filterNode = this.audioContext.createBiquadFilter();

    // Use sawtooth for rich harmonics (voice-like)
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = frequency;

    // Add slight vibrato for natural voice quality
    const vibratoOsc = this.audioContext.createOscillator();
    const vibratoGain = this.audioContext.createGain();
    vibratoOsc.frequency.value = 5; // 5Hz vibrato
    vibratoGain.gain.value = 2; // ±2Hz variation
    vibratoOsc.connect(vibratoGain);
    vibratoGain.connect(oscillator.frequency);
    vibratoOsc.start(startTime);
    vibratoOsc.stop(startTime + duration);

    // Low-pass filter for warmth
    filterNode.type = 'lowpass';
    filterNode.frequency.value = frequency * 3;
    filterNode.Q.value = 1.0;

    // ADSR envelope
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + duration * 0.1); // Attack
    gainNode.gain.linearRampToValueAtTime(volume * 0.7, startTime + duration * 0.3); // Decay
    gainNode.gain.setValueAtTime(volume * 0.6, startTime + duration * 0.7); // Sustain
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration); // Release

    // Connect nodes
    oscillator.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // Play
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  /**
   * Create noise component for consonant sounds
   */
  private createNoiseComponent(
    startTime: number,
    duration: number,
    volume: number
  ): void {
    const bufferSize = this.audioContext.sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;

    const noiseGain = this.audioContext.createGain();
    const noiseFilter = this.audioContext.createBiquadFilter();

    // Band-pass filter for fricative sounds (s, sh, f sounds)
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2000 + Math.random() * 2000;
    noiseFilter.Q.value = 2.0;

    // Envelope
    noiseGain.gain.setValueAtTime(0, startTime);
    noiseGain.gain.linearRampToValueAtTime(volume, startTime + duration * 0.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.audioContext.destination);

    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  update(deltaTime: number): void {
    // Decay suppression levels and clean up old cooldowns
    const now = Date.now();
    const staleTime = 60000; // Remove cooldowns older than 1 minute

    this.cooldowns.forEach((cooldown, id) => {
      if (now - cooldown.lastCalloutTime > staleTime) {
        this.cooldowns.delete(id);
      }
    });
  }

  dispose(): void {
    this.cooldowns.clear();
    Logger.info('audio', '[VoiceCalloutSystem] Disposed');
  }
}
