import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

/**
 * Terrain types for footstep sound variation
 */
export enum TerrainType {
  GRASS = 'grass',
  MUD = 'mud',
  WATER = 'water',
  ROCK = 'rock'
}

/**
 * Configuration for footstep sounds per terrain type
 */
interface FootstepConfig {
  type: TerrainType;
  volume: number;
  pitchRange: [number, number];
  walkInterval: number;  // Seconds between steps when walking
  runInterval: number;   // Seconds between steps when running
}

/**
 * Footstep audio system with terrain-based sound variation
 * Supports both player and AI combatant footsteps
 */
export class FootstepAudioSystem implements GameSystem {
  private listener: THREE.AudioListener;
  private chunkManager?: ImprovedChunkManager;
  
  // Audio pools for player (non-positional)
  private playerFootstepPool: THREE.Audio[] = [];
  private readonly PLAYER_POOL_SIZE = 4;
  
  // Audio pools for AI (positional)
  private aiFootstepPool: THREE.PositionalAudio[] = [];
  private readonly AI_POOL_SIZE = 8;
  
  // Player footstep timing
  private playerStepTimer = 0;
  private lastPlayerPosition = new THREE.Vector3();
  
  // AI footstep tracking (limit concurrent sounds)
  private readonly MAX_CONCURRENT_AI_FOOTSTEPS = 5;
  private readonly AI_FOOTSTEP_RANGE = 30; // Only play within 30m
  
  // Terrain-based configurations
  private readonly terrainConfigs: Record<TerrainType, FootstepConfig> = {
    [TerrainType.GRASS]: {
      type: TerrainType.GRASS,
      volume: 0.3,
      pitchRange: [0.9, 1.1],
      walkInterval: 0.5,
      runInterval: 0.35
    },
    [TerrainType.MUD]: {
      type: TerrainType.MUD,
      volume: 0.35,
      pitchRange: [0.7, 0.9],
      walkInterval: 0.55,
      runInterval: 0.4
    },
    [TerrainType.WATER]: {
      type: TerrainType.WATER,
      volume: 0.4,
      pitchRange: [0.8, 1.0],
      walkInterval: 0.52,
      runInterval: 0.38
    },
    [TerrainType.ROCK]: {
      type: TerrainType.ROCK,
      volume: 0.35,
      pitchRange: [1.0, 1.2],
      walkInterval: 0.48,
      runInterval: 0.33
    }
  };

  constructor(listener: THREE.AudioListener) {
    this.listener = listener;
    this.initializeAudioPools();
  }

  async init(): Promise<void> {
    console.log('[FootstepAudioSystem] Initialized');
  }

  update(deltaTime: number): void {
    // Player footstep updates handled externally via playPlayerFootstep
    // AI footsteps handled externally via playAIFootstep
  }

  dispose(): void {
    // Stop all playing sounds
    this.playerFootstepPool.forEach(sound => {
      if (sound.isPlaying) sound.stop();
    });
    
    this.aiFootstepPool.forEach(sound => {
      if (sound.isPlaying) sound.stop();
    });
    
    this.playerFootstepPool = [];
    this.aiFootstepPool = [];
    
    console.log('[FootstepAudioSystem] Disposed');
  }

  /**
   * Initialize audio object pools
   */
  private initializeAudioPools(): void {
    // Player footstep pool (non-positional)
    for (let i = 0; i < this.PLAYER_POOL_SIZE; i++) {
      const sound = new THREE.Audio(this.listener);
      this.playerFootstepPool.push(sound);
    }
    
    // AI footstep pool (positional)
    for (let i = 0; i < this.AI_POOL_SIZE; i++) {
      const sound = new THREE.PositionalAudio(this.listener);
      sound.setRefDistance(5);
      sound.setMaxDistance(30);
      sound.setRolloffFactor(2);
      sound.setDistanceModel('linear');
      this.aiFootstepPool.push(sound);
    }
  }

  /**
   * Play player footstep sound
   * @param position Player position
   * @param isRunning Whether player is running
   * @param deltaTime Time since last frame
   * @param isMoving Whether player is actively moving
   */
  playPlayerFootstep(
    position: THREE.Vector3,
    isRunning: boolean,
    deltaTime: number,
    isMoving: boolean
  ): void {
    if (!isMoving) {
      this.playerStepTimer = 0;
      return;
    }
    
    // Detect terrain type
    const terrainType = this.detectTerrainType(position);
    const config = this.terrainConfigs[terrainType];
    
    // Check if it's time for next step
    const stepInterval = isRunning ? config.runInterval : config.walkInterval;
    this.playerStepTimer += deltaTime;
    
    if (this.playerStepTimer >= stepInterval) {
      this.playerStepTimer = 0;
      this.playProceduralFootstep(terrainType, config, false);
    }
  }

  /**
   * Play footstep for landing after jump
   * @param position Landing position
   * @param impactVelocity Vertical velocity at impact (for volume)
   */
  playLandingSound(position: THREE.Vector3, impactVelocity: number = 1): void {
    const terrainType = this.detectTerrainType(position);
    const config = this.terrainConfigs[terrainType];
    
    // Landing sound is louder and lower pitched
    const volume = Math.min(0.6, config.volume * (1 + Math.abs(impactVelocity) * 0.2));
    const pitchMultiplier = 0.85; // Lower pitch for impact
    
    this.playProceduralFootstep(terrainType, config, false, volume, pitchMultiplier);
  }

  /**
   * Play AI combatant footstep (positional audio)
   * @param position Combatant position
   * @param playerPosition Player position (for distance check)
   * @param isRunning Whether combatant is running
   */
  playAIFootstep(
    position: THREE.Vector3,
    playerPosition: THREE.Vector3,
    isRunning: boolean = false
  ): boolean {
    // Check distance - don't play if too far
    const distance = position.distanceTo(playerPosition);
    if (distance > this.AI_FOOTSTEP_RANGE) {
      return false;
    }
    
    // Check concurrent limit
    const playingSounds = this.aiFootstepPool.filter(s => s.isPlaying).length;
    if (playingSounds >= this.MAX_CONCURRENT_AI_FOOTSTEPS) {
      return false;
    }
    
    // Detect terrain and play sound
    const terrainType = this.detectTerrainType(position);
    const config = this.terrainConfigs[terrainType];
    
    this.playProceduralFootstep(terrainType, config, true, undefined, undefined, position);
    return true;
  }

  /**
   * Detect terrain type based on position
   */
  private detectTerrainType(position: THREE.Vector3): TerrainType {
    if (!this.chunkManager) {
      return TerrainType.GRASS; // Default
    }
    
    const height = getHeightQueryCache().getHeightAt(position.x, position.z);
    const waterLevel = 1.0; // Water surface level
    const nearWaterThreshold = 2.0; // Muddy area near water
    
    // Water: below water level
    if (height < waterLevel) {
      return TerrainType.WATER;
    }
    
    // Mud: near water edge
    if (height < waterLevel + nearWaterThreshold) {
      return TerrainType.MUD;
    }
    
    // Calculate slope to detect rocky areas
    const sampleDist = 1.0;
    const h1 = getHeightQueryCache().getHeightAt(position.x + sampleDist, position.z);
    const h2 = getHeightQueryCache().getHeightAt(position.x - sampleDist, position.z);
    const h3 = getHeightQueryCache().getHeightAt(position.x, position.z + sampleDist);
    const h4 = getHeightQueryCache().getHeightAt(position.x, position.z - sampleDist);
    
    const slopeX = Math.abs(h1 - h2) / (sampleDist * 2);
    const slopeZ = Math.abs(h3 - h4) / (sampleDist * 2);
    const slope = Math.max(slopeX, slopeZ);
    
    // Rock: steep slopes
    if (slope > 0.5) {
      return TerrainType.ROCK;
    }
    
    // Default: grass
    return TerrainType.GRASS;
  }

  /**
   * Play procedural footstep sound using Web Audio API
   */
  private playProceduralFootstep(
    terrainType: TerrainType,
    config: FootstepConfig,
    isPositional: boolean,
    volumeOverride?: number,
    pitchMultiplier: number = 1.0,
    position?: THREE.Vector3
  ): void {
    const audioContext = this.listener.context;
    
    // Random pitch variation
    const pitchVariation = config.pitchRange[0] + 
      Math.random() * (config.pitchRange[1] - config.pitchRange[0]);
    const finalPitch = pitchVariation * pitchMultiplier;
    
    const volume = volumeOverride !== undefined ? volumeOverride : config.volume;
    
    // Generate terrain-specific procedural sound
    switch (terrainType) {
      case TerrainType.GRASS:
        this.playGrassFootstep(volume, finalPitch, isPositional, position);
        break;
      case TerrainType.MUD:
        this.playMudFootstep(volume, finalPitch, isPositional, position);
        break;
      case TerrainType.WATER:
        this.playWaterFootstep(volume, finalPitch, isPositional, position);
        break;
      case TerrainType.ROCK:
        this.playRockFootstep(volume, finalPitch, isPositional, position);
        break;
    }
  }

  /**
   * Grass footstep: soft rustle with filtered noise
   */
  private playGrassFootstep(volume: number, pitch: number, isPositional: boolean, position?: THREE.Vector3): void {
    const audioContext = this.listener.context;
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
    
    // Connect audio chain
    if (isPositional && position) {
      const sound = this.getAvailablePositionalSound();
      if (sound) {
        this.setupPositionalChain(sound, position, noise, filter, gain, duration);
      }
    } else {
      noise.connect(filter).connect(gain).connect(audioContext.destination);
      noise.start(now);
      noise.stop(now + duration);
    }
  }

  /**
   * Mud footstep: squelchy low-frequency sound
   */
  private playMudFootstep(volume: number, pitch: number, isPositional: boolean, position?: THREE.Vector3): void {
    const audioContext = this.listener.context;
    const duration = 0.15;
    
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
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(volume * 0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    // Add noise component
    const noiseBuffer = this.createNoiseBuffer(duration, 0.3);
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    if (isPositional && position) {
      const sound = this.getAvailablePositionalSound();
      if (sound) {
        // Mix oscillator and noise
        const merger = audioContext.createChannelMerger(2);
        osc.connect(filter).connect(gain).connect(merger, 0, 0);
        noise.connect(noiseGain).connect(merger, 0, 1);
        
        this.setupPositionalChain(sound, position, merger, null, null, duration, () => {
          osc.start(now);
          osc.stop(now + duration);
          noise.start(now);
          noise.stop(now + duration);
        });
      }
    } else {
      osc.connect(filter).connect(gain).connect(audioContext.destination);
      noise.connect(noiseGain).connect(audioContext.destination);
      
      osc.start(now);
      osc.stop(now + duration);
      noise.start(now);
      noise.stop(now + duration);
    }
  }

  /**
   * Water footstep: splash with pitch sweep
   */
  private playWaterFootstep(volume: number, pitch: number, isPositional: boolean, position?: THREE.Vector3): void {
    const audioContext = this.listener.context;
    const duration = 0.18;
    
    // Noise burst for splash
    const noiseBuffer = this.createNoiseBuffer(duration, 0.5);
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.playbackRate.value = pitch;
    
    // Band-pass with frequency sweep
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    const now = audioContext.currentTime;
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + duration);
    filter.Q.value = 2.0;
    
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(volume * 1.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    if (isPositional && position) {
      const sound = this.getAvailablePositionalSound();
      if (sound) {
        this.setupPositionalChain(sound, position, noise, filter, gain, duration);
      }
    } else {
      noise.connect(filter).connect(gain).connect(audioContext.destination);
      noise.start(now);
      noise.stop(now + duration);
    }
  }

  /**
   * Rock footstep: hard tap with high frequencies
   */
  private playRockFootstep(volume: number, pitch: number, isPositional: boolean, position?: THREE.Vector3): void {
    const audioContext = this.listener.context;
    const duration = 0.08;
    
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
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    // Add noise click
    const noiseBuffer = this.createNoiseBuffer(duration * 0.5, 0.6);
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.5);
    
    if (isPositional && position) {
      const sound = this.getAvailablePositionalSound();
      if (sound) {
        const merger = audioContext.createChannelMerger(2);
        osc.connect(filter).connect(gain).connect(merger, 0, 0);
        noise.connect(noiseGain).connect(merger, 0, 1);
        
        this.setupPositionalChain(sound, position, merger, null, null, duration, () => {
          osc.start(now);
          osc.stop(now + duration);
          noise.start(now);
          noise.stop(now + duration * 0.5);
        });
      }
    } else {
      osc.connect(filter).connect(gain).connect(audioContext.destination);
      noise.connect(noiseGain).connect(audioContext.destination);
      
      osc.start(now);
      osc.stop(now + duration);
      noise.start(now);
      noise.stop(now + duration * 0.5);
    }
  }

  /**
   * Create noise buffer for procedural sounds
   */
  private createNoiseBuffer(duration: number, amplitude: number): AudioBuffer {
    const audioContext = this.listener.context;
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * amplitude;
    }
    
    return buffer;
  }

  /**
   * Setup positional audio chain
   */
  private setupPositionalChain(
    sound: THREE.PositionalAudio,
    position: THREE.Vector3,
    source: AudioNode | AudioBufferSourceNode | OscillatorNode,
    filter: BiquadFilterNode | null,
    gain: GainNode | null,
    duration: number,
    onStart?: () => void
  ): void {
    // Create temporary object at position
    const tempObj = new THREE.Object3D();
    tempObj.position.copy(position);
    tempObj.add(sound);
    
    // Connect to positional audio output
    const output = sound.getOutput();
    if (filter && gain) {
      source.connect(filter).connect(gain).connect(output);
    } else if (filter) {
      source.connect(filter).connect(output);
    } else if (gain) {
      source.connect(gain).connect(output);
    } else {
      source.connect(output);
    }
    
    // Start sound
    if (onStart) {
      onStart();
    } else if (source instanceof AudioBufferSourceNode || source instanceof OscillatorNode) {
      const now = this.listener.context.currentTime;
      source.start(now);
      source.stop(now + duration);
    }
    
    // Cleanup
    setTimeout(() => {
      tempObj.remove(sound);
    }, duration * 1000 + 100);
  }

  /**
   * Get available player footstep sound from pool
   */
  private getAvailablePlayerSound(): THREE.Audio | null {
    for (const sound of this.playerFootstepPool) {
      if (!sound.isPlaying) {
        return sound;
      }
    }
    // All playing, reuse first
    this.playerFootstepPool[0].stop();
    return this.playerFootstepPool[0];
  }

  /**
   * Get available AI footstep sound from pool
   */
  private getAvailablePositionalSound(): THREE.PositionalAudio | null {
    for (const sound of this.aiFootstepPool) {
      if (!sound.isPlaying) {
        return sound;
      }
    }
    // All playing, reuse first
    this.aiFootstepPool[0].stop();
    return this.aiFootstepPool[0];
  }

  /**
   * Set chunk manager for terrain detection
   */
  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }
}
