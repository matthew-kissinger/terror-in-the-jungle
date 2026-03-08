import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { FootstepAudioSystem } from './FootstepAudioSystem';
import { TerrainType } from '../../types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { FootstepSynthesis } from './FootstepSynthesis';

// Mocks
vi.mock('../../utils/Logger');
vi.mock('./FootstepSynthesis');

// Mock THREE.js audio classes to avoid window/DOM dependencies
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    AudioListener: vi.fn(),
    Audio: vi.fn(),
    PositionalAudio: vi.fn(),
  };
});

describe('FootstepAudioSystem', () => {
  let system: FootstepAudioSystem;
  let listener: THREE.AudioListener;
  let mockTerrainSystem: ITerrainRuntime;

  // Mock AudioContext and AudioNodes
  const mockAudioContext = {
    currentTime: 0,
    destination: {},
    createGain: vi.fn().mockReturnValue({ 
      gain: { 
        setValueAtTime: vi.fn(), 
        exponentialRampToValueAtTime: vi.fn() 
      },
      connect: vi.fn().mockReturnThis() 
    }),
    createOscillator: vi.fn().mockReturnValue({ 
      frequency: { value: 0 }, 
      start: vi.fn(), 
      stop: vi.fn(), 
      connect: vi.fn().mockReturnThis() 
    }),
    createBufferSource: vi.fn().mockReturnValue({ 
      buffer: null, 
      playbackRate: { value: 1 }, 
      start: vi.fn(), 
      stop: vi.fn(), 
      connect: vi.fn().mockReturnThis() 
    }),
    createBiquadFilter: vi.fn().mockReturnValue({ 
      frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, 
      Q: { value: 0 }, 
      connect: vi.fn().mockReturnThis() 
    }),
    createBuffer: vi.fn().mockReturnValue({ 
      getChannelData: vi.fn().mockReturnValue(new Float32Array(100)) 
    }),
    createChannelMerger: vi.fn().mockReturnValue({ 
      connect: vi.fn() 
    })
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup Mock Implementations using regular functions to support 'new'
    const eventDispatcherMethods = {
      addEventListener: vi.fn(),
      hasEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    (THREE.AudioListener as any).mockImplementation(function() {
      return {
        isObject3D: true,
        ...eventDispatcherMethods,
        context: mockAudioContext,
        getInput: vi.fn(),
        removeFilter: vi.fn(),
        setFilter: vi.fn(),
        getFilter: vi.fn(),
        setMasterVolume: vi.fn(),
        getMasterVolume: vi.fn(),
        updateMatrixWorld: vi.fn(),
        removeFromParent: vi.fn(),
      };
    });

    (THREE.Audio as any).mockImplementation(function() {
      return {
        isObject3D: true,
        ...eventDispatcherMethods,
        isPlaying: false,
        play: vi.fn(),
        stop: vi.fn(),
        setBuffer: vi.fn(),
        setVolume: vi.fn(),
        setPlaybackRate: vi.fn(),
        connect: vi.fn(),
        removeFromParent: vi.fn(),
      };
    });

    (THREE.PositionalAudio as any).mockImplementation(function() {
      return {
        isObject3D: true,
        ...eventDispatcherMethods,
        isPlaying: false,
        play: vi.fn(),
        stop: vi.fn(),
        setBuffer: vi.fn(),
        setVolume: vi.fn(),
        setRefDistance: vi.fn(),
        setMaxDistance: vi.fn(),
        setRolloffFactor: vi.fn(),
        setDistanceModel: vi.fn(),
        getOutput: vi.fn().mockReturnValue({}),
        connect: vi.fn(),
        removeFromParent: vi.fn(),
      };
    });

    // Now safe to instantiate listener (uses mock)
    listener = new THREE.AudioListener();
    
    // Mock FootstepSynthesis methods to return a starter function that returns duration
    const mockStarter = vi.fn().mockReturnValue(0.5); // 0.5s duration
    (FootstepSynthesis.createGrassFootstep as any).mockReturnValue(mockStarter);
    (FootstepSynthesis.createMudFootstep as any).mockReturnValue(mockStarter);
    (FootstepSynthesis.createWaterFootstep as any).mockReturnValue(mockStarter);
    (FootstepSynthesis.createRockFootstep as any).mockReturnValue(mockStarter);

    // Create system
    system = new FootstepAudioSystem(listener);
    
    mockTerrainSystem = {
      getHeightAt: vi.fn().mockReturnValue(10),
      getEffectiveHeightAt: vi.fn().mockReturnValue(10),
      getPlayableWorldSize: vi.fn(() => 2000),
      getWorldSize: vi.fn(() => 2000),
      isTerrainReady: vi.fn(() => true),
      hasTerrainAt: vi.fn(() => true),
      getActiveTerrainTileCount: vi.fn(() => 0),
      setSurfaceWetness: vi.fn(),
      updatePlayerPosition: vi.fn(),
      registerCollisionObject: vi.fn(),
      unregisterCollisionObject: vi.fn(),
      raycastTerrain: vi.fn(() => ({ hit: false })),
    };
    system.setTerrainSystem(mockTerrainSystem);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize audio pools on construction', () => {
      const playerPool = (system as any).playerFootstepPool;
      const aiPool = (system as any).aiFootstepPool;

      expect(playerPool.length).toBe(4);
      expect(aiPool.length).toBe(8);
    });
  });

  describe('detectTerrainType', () => {
    it('should return GRASS if terrain system is not set', () => {
      const systemNoChunks = new FootstepAudioSystem(listener);
      const type = (systemNoChunks as any).detectTerrainType(new THREE.Vector3(0, 0, 0));
      expect(type).toBe(TerrainType.GRASS);
    });

    it('should return WATER if height < 1.0', () => {
      vi.mocked(mockTerrainSystem.getHeightAt).mockReturnValue(0.5);
      const type = (system as any).detectTerrainType(new THREE.Vector3(0, 0, 0));
      expect(type).toBe(TerrainType.WATER);
    });

    it('should return MUD if height < 3.0', () => {
      vi.mocked(mockTerrainSystem.getHeightAt).mockReturnValue(2.5);
      const type = (system as any).detectTerrainType(new THREE.Vector3(0, 0, 0));
      expect(type).toBe(TerrainType.MUD);
    });

    it('should return ROCK if slope > 0.5', () => {
      vi.mocked(mockTerrainSystem.getHeightAt).mockImplementation((x: number, _z: number) => {
        // Base height 10.
        // detectTerrainType checks center, center+1, center-1 for X and Z.
        // Logic: 
        // slopeX = abs(h(x+1) - h(x-1)) / 2
        // To get slope > 0.5, we need difference > 1.0
        
        if (x > 0) return 12; // x+1
        if (x < 0) return 10; // x-1
        return 10; // center
      });

      const type = (system as any).detectTerrainType(new THREE.Vector3(0, 10, 0));
      expect(type).toBe(TerrainType.ROCK);
    });

    it('should return GRASS otherwise', () => {
      vi.mocked(mockTerrainSystem.getHeightAt).mockReturnValue(10); // High enough, flat
      const type = (system as any).detectTerrainType(new THREE.Vector3(0, 0, 0));
      expect(type).toBe(TerrainType.GRASS);
    });
  });

  describe('playPlayerFootstep', () => {
    it('should not play if not moving', () => {
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, false);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
    });

    it('should remain silent while audio is disabled', () => {
      system.playPlayerFootstep(new THREE.Vector3(), false, 0.6, true);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
    });

    it('should not trigger on walk interval while disabled', () => {
      system.playPlayerFootstep(new THREE.Vector3(), false, 0.1, true);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();

      system.playPlayerFootstep(new THREE.Vector3(), false, 0.41, true);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
    });

    it('should not trigger on run interval while disabled', () => {
      system.playPlayerFootstep(new THREE.Vector3(), true, 0.1, true);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();

      system.playPlayerFootstep(new THREE.Vector3(), true, 0.3, true);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
    });

    it('should not select terrain sound while disabled', () => {
      vi.mocked(mockTerrainSystem.getHeightAt).mockReturnValue(0.5); // Water
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, true);
      expect(FootstepSynthesis.createWaterFootstep).not.toHaveBeenCalled();
    });

    it('should reset step timer when not moving', () => {
      // Move timer close to threshold
      system.playPlayerFootstep(new THREE.Vector3(), false, 0.4, true); 
      // Stop moving
      system.playPlayerFootstep(new THREE.Vector3(), false, 0.1, false);
      // Resume moving - should start from 0, so 0.1s shouldn't trigger
      system.playPlayerFootstep(new THREE.Vector3(), false, 0.1, true);
      
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
    });

    it('should use correct volume for GRASS', () => {
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, true);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
    });

    it('should use correct volume for ROCK', () => {
      vi.mocked(mockTerrainSystem.getHeightAt).mockReturnValue(10); // Base
      // Mock slope > 0.5
      vi.mocked(mockTerrainSystem.getHeightAt).mockImplementation((x: number) => x > 0 ? 12 : 10);
      
      system.playPlayerFootstep(new THREE.Vector3(0, 10, 0), false, 1.0, true);
      expect(FootstepSynthesis.createRockFootstep).not.toHaveBeenCalled();
    });
  });

  describe('terrain configurations', () => {
    it('should use correct volume for MUD', () => {
      vi.mocked(mockTerrainSystem.getHeightAt).mockReturnValue(2.5); // Mud
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, true);
      expect(FootstepSynthesis.createMudFootstep).not.toHaveBeenCalled();
    });

    it('should use correct volume for WATER', () => {
      vi.mocked(mockTerrainSystem.getHeightAt).mockReturnValue(0.5); // Water
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, true);
      expect(FootstepSynthesis.createWaterFootstep).not.toHaveBeenCalled();
    });
  });

  describe('playLandingSound', () => {
    it('should no-op while audio is disabled', () => {
      const spy = vi.spyOn(FootstepSynthesis, 'createGrassFootstep');
      system.playLandingSound(new THREE.Vector3(), 2.0);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('playAIFootstep', () => {
    const playerPos = new THREE.Vector3(0, 0, 0);

    it('should return false if too far from player', () => {
      const farPos = new THREE.Vector3(31, 0, 0); // Range is 30
      const result = system.playAIFootstep(farPos, playerPos);
      expect(result).toBe(false);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
    });

    it('should play AI footstep within range', () => {
      const nearPos = new THREE.Vector3(10, 0, 0);
      const result = system.playAIFootstep(nearPos, playerPos);
      expect(result).toBe(true);
    });

    it('should populate AI pool on construction', () => {
      const aiPool = (system as any).aiFootstepPool;
      expect(aiPool.length).toBe(8);
    });
  });

  describe('dispose', () => {
    it('should be safe when pools are empty', () => {
      system.dispose();
      expect((system as any).playerFootstepPool.length).toBe(0);
      expect((system as any).aiFootstepPool.length).toBe(0);
    });

    it('should clear pools', () => {
      system.dispose();
      expect((system as any).playerFootstepPool.length).toBe(0);
      expect((system as any).aiFootstepPool.length).toBe(0);
    });
  });
});
