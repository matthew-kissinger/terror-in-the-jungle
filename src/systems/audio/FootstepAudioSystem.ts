import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem, TerrainType } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

const FOOTSTEP_SOUND_PATHS: Record<TerrainType, string> = {
  [TerrainType.GRASS]: 'assets/optimized/footstepGrass.wav',
  [TerrainType.MUD]: 'assets/optimized/footstepMud.wav',
  [TerrainType.WATER]: 'assets/optimized/footstepWater.wav',
  [TerrainType.ROCK]: 'assets/optimized/footstepRock.wav'
};
const FOOTSTEP_AUDIO_ENABLED = false;

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
  private audioLoader = new THREE.AudioLoader();
  private footstepBuffers: Partial<Record<TerrainType, AudioBuffer>> = {};
  private chunkManager?: ImprovedChunkManager;
  
  // Audio pools for player (non-positional)
  private playerFootstepPool: THREE.Audio[] = [];
  private readonly PLAYER_POOL_SIZE = 4;
  
  // Audio pools for AI (positional)
  private aiFootstepPool: THREE.PositionalAudio[] = [];
  private readonly AI_POOL_SIZE = 8;
  
  // Player footstep timing
  private playerStepTimer = 0;
  
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
    if (FOOTSTEP_AUDIO_ENABLED) {
      this.initializeAudioPools();
    } else {
      Logger.info('audio', '[FootstepAudioSystem] Disabled (awaiting authored assets)');
    }
  }

  async init(): Promise<void> {
    if (!FOOTSTEP_AUDIO_ENABLED) return;
    await this.loadFootstepBuffers();
    Logger.info('audio', '[FootstepAudioSystem] Initialized');
  }

  update(_deltaTime: number): void {
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
    
    Logger.info('audio', '[FootstepAudioSystem] Disposed');
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
   */
  playPlayerFootstep(
    position: THREE.Vector3,
    isRunning: boolean,
    deltaTime: number,
    isMoving: boolean
  ): void {
    // TODO(audio): Re-enable when distinct terrain footstep assets are authored.
    if (!FOOTSTEP_AUDIO_ENABLED) return;

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
   */
  playLandingSound(position: THREE.Vector3, impactVelocity: number = 1): void {
    if (!FOOTSTEP_AUDIO_ENABLED) return;

    const terrainType = this.detectTerrainType(position);
    const config = this.terrainConfigs[terrainType];
    
    // Landing sound is louder and lower pitched
    const volume = Math.min(0.6, config.volume * (1 + Math.abs(impactVelocity) * 0.2));
    const pitchMultiplier = 0.85; // Lower pitch for impact
    
    this.playProceduralFootstep(terrainType, config, false, volume, pitchMultiplier);
  }

  /**
   * Play AI combatant footstep (positional audio)
   */
  playAIFootstep(
    position: THREE.Vector3,
    playerPosition: THREE.Vector3,
    _isRunning: boolean = false
  ): boolean {
    // TODO(audio): Re-enable when distinct terrain footstep assets are authored.
    if (!FOOTSTEP_AUDIO_ENABLED) return false;

    // Check distance - don't play if too far
    const distance = position.distanceTo(playerPosition);
    if (distance > this.AI_FOOTSTEP_RANGE) {
      return false;
    }
    
    // Check concurrent limit
    const playingCount = this.aiFootstepPool.filter(s => s.isPlaying).length;
    if (playingCount >= this.MAX_CONCURRENT_AI_FOOTSTEPS) {
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
      return TerrainType.GRASS;
    }
    
    const height = getHeightQueryCache().getHeightAt(position.x, position.z);
    const waterLevel = 1.0;
    const nearWaterThreshold = 2.0;
    
    if (height < waterLevel) {
      return TerrainType.WATER;
    }
    
    if (height < waterLevel + nearWaterThreshold) {
      return TerrainType.MUD;
    }
    
    const sampleDist = 1.0;
    const h1 = getHeightQueryCache().getHeightAt(position.x + sampleDist, position.z);
    const h2 = getHeightQueryCache().getHeightAt(position.x - sampleDist, position.z);
    const h3 = getHeightQueryCache().getHeightAt(position.x, position.z + sampleDist);
    const h4 = getHeightQueryCache().getHeightAt(position.x, position.z - sampleDist);
    
    const slopeX = Math.abs(h1 - h2) / (sampleDist * 2);
    const slopeZ = Math.abs(h3 - h4) / (sampleDist * 2);
    const slope = Math.max(slopeX, slopeZ);
    
    if (slope > 0.5) {
      return TerrainType.ROCK;
    }
    
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
    const buffer = this.footstepBuffers[terrainType];
    if (!buffer) return;

    const pitchVariation = config.pitchRange[0] + 
      Math.random() * (config.pitchRange[1] - config.pitchRange[0]);
    const finalPitch = pitchVariation * pitchMultiplier;
    const volume = volumeOverride !== undefined ? volumeOverride : config.volume;

    if (isPositional) {
      const sound = this.getAvailablePositionalSound();
      if (!sound) return;
      if (position) sound.position.copy(position);
      sound.setBuffer(buffer);
      sound.setPlaybackRate(finalPitch);
      sound.setVolume(volume);
      sound.play();
      return;
    }

    const sound = this.getAvailablePlayerSound();
    if (!sound) return;
    sound.setBuffer(buffer);
    sound.setPlaybackRate(finalPitch);
    sound.setVolume(volume);
    sound.play();
  }

  /**
   * Get available player footstep sound from pool
   */
  private getAvailablePlayerSound(): THREE.Audio | null {
    for (const sound of this.playerFootstepPool) {
      if (!sound.isPlaying) return sound;
    }
    this.playerFootstepPool[0].stop();
    return this.playerFootstepPool[0];
  }

  /**
   * Get available AI footstep sound from pool
   */
  private getAvailablePositionalSound(): THREE.PositionalAudio | null {
    for (const sound of this.aiFootstepPool) {
      if (!sound.isPlaying) return sound;
    }
    this.aiFootstepPool[0].stop();
    return this.aiFootstepPool[0];
  }

  /**
   * Set chunk manager for terrain detection
   */
  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  private async loadFootstepBuffers(): Promise<void> {
    if (!FOOTSTEP_AUDIO_ENABLED) return;
    const entries = Object.entries(FOOTSTEP_SOUND_PATHS) as Array<[TerrainType, string]>;
    await Promise.all(entries.map(async ([terrainType, path]) => {
      try {
        const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
          this.audioLoader.load(path, resolve, undefined, reject);
        });
        this.footstepBuffers[terrainType] = buffer;
      } catch {
        // Missing optional placeholder should not break runtime.
      }
    }));
  }
}
