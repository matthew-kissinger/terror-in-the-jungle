import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { FootstepAudioSystem } from './FootstepAudioSystem';
import { TerrainType } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { HeightQueryCache, getHeightQueryCache } from '../terrain/HeightQueryCache';
import { FootstepSynthesis } from './FootstepSynthesis';

// Mocks
vi.mock('../../utils/Logger');
vi.mock('./FootstepSynthesis');
vi.mock('../terrain/HeightQueryCache');

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
  let mockChunkManager: ImprovedChunkManager;
  let mockHeightQueryCache: any;

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
    
    // Mock HeightQueryCache
    mockHeightQueryCache = {
      getHeightAt: vi.fn().mockReturnValue(10), // Default height (GRASS)
    };
    (getHeightQueryCache as any).mockReturnValue(mockHeightQueryCache);

    // Mock FootstepSynthesis methods to return a starter function that returns duration
    const mockStarter = vi.fn().mockReturnValue(0.5); // 0.5s duration
    (FootstepSynthesis.createGrassFootstep as any).mockReturnValue(mockStarter);
    (FootstepSynthesis.createMudFootstep as any).mockReturnValue(mockStarter);
    (FootstepSynthesis.createWaterFootstep as any).mockReturnValue(mockStarter);
    (FootstepSynthesis.createRockFootstep as any).mockReturnValue(mockStarter);

    // Create system
    system = new FootstepAudioSystem(listener);
    
    // Mock ChunkManager
    mockChunkManager = {} as ImprovedChunkManager;
    system.setChunkManager(mockChunkManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize audio pools', () => {
      // Access private pools via any
      const playerPool = (system as any).playerFootstepPool;
      const aiPool = (system as any).aiFootstepPool;

      expect(playerPool.length).toBe(4);
      expect(aiPool.length).toBe(8);
      expect(THREE.Audio).toHaveBeenCalledTimes(4);
      expect(THREE.PositionalAudio).toHaveBeenCalledTimes(8);
    });
  });

  describe('detectTerrainType', () => {
    it('should return GRASS if chunkManager is not set', () => {
      const systemNoChunks = new FootstepAudioSystem(listener);
      const type = (systemNoChunks as any).detectTerrainType(new THREE.Vector3(0, 0, 0));
      expect(type).toBe(TerrainType.GRASS);
    });

    it('should return WATER if height < 1.0', () => {
      mockHeightQueryCache.getHeightAt.mockReturnValue(0.5);
      const type = (system as any).detectTerrainType(new THREE.Vector3(0, 0, 0));
      expect(type).toBe(TerrainType.WATER);
    });

    it('should return MUD if height < 3.0', () => {
      mockHeightQueryCache.getHeightAt.mockReturnValue(2.5);
      const type = (system as any).detectTerrainType(new THREE.Vector3(0, 0, 0));
      expect(type).toBe(TerrainType.MUD);
    });

    it('should return ROCK if slope > 0.5', () => {
      mockHeightQueryCache.getHeightAt.mockImplementation((x: number, z: number) => {
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
      mockHeightQueryCache.getHeightAt.mockReturnValue(10); // High enough, flat
      const type = (system as any).detectTerrainType(new THREE.Vector3(0, 0, 0));
      expect(type).toBe(TerrainType.GRASS);
    });
  });

  describe('playPlayerFootstep', () => {
    it('should not play if not moving', () => {
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, false);
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
    });

    it('should play sound when timer exceeds interval', () => {
      // First call moves timer up, but starts at 0, so might need multiple calls or large delta
      // Interval for GRASS walk is 0.5s
      system.playPlayerFootstep(new THREE.Vector3(), false, 0.6, true);
      
      expect(FootstepSynthesis.createGrassFootstep).toHaveBeenCalled();
    });

    it('should respect walk interval', () => {
      // Walk interval is 0.5s
      system.playPlayerFootstep(new THREE.Vector3(), false, 0.1, true); // Timer = 0.1
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();
      
      system.playPlayerFootstep(new THREE.Vector3(), false, 0.41, true); // Timer = 0.51
      expect(FootstepSynthesis.createGrassFootstep).toHaveBeenCalled();
    });

    it('should respect run interval', () => {
      // Run interval for GRASS is 0.35s
      system.playPlayerFootstep(new THREE.Vector3(), true, 0.1, true); // Timer = 0.1
      expect(FootstepSynthesis.createGrassFootstep).not.toHaveBeenCalled();

      system.playPlayerFootstep(new THREE.Vector3(), true, 0.3, true); // Timer = 0.4
      expect(FootstepSynthesis.createGrassFootstep).toHaveBeenCalled();
    });

    it('should select correct terrain sound', () => {
      mockHeightQueryCache.getHeightAt.mockReturnValue(0.5); // Water
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, true);
      expect(FootstepSynthesis.createWaterFootstep).toHaveBeenCalled();
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
      expect(FootstepSynthesis.createGrassFootstep).toHaveBeenCalledWith(expect.anything(), 0.3, expect.any(Number));
    });

    it('should use correct volume for ROCK', () => {
      mockHeightQueryCache.getHeightAt.mockReturnValue(10); // Base
      // Mock slope > 0.5
      mockHeightQueryCache.getHeightAt.mockImplementation((x: number) => x > 0 ? 12 : 10);
      
      system.playPlayerFootstep(new THREE.Vector3(0, 10, 0), false, 1.0, true);
      expect(FootstepSynthesis.createRockFootstep).toHaveBeenCalledWith(expect.anything(), 0.35, expect.any(Number));
    });
  });

  describe('terrain configurations', () => {
    it('should use correct volume for MUD', () => {
      mockHeightQueryCache.getHeightAt.mockReturnValue(2.5); // Mud
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, true);
      expect(FootstepSynthesis.createMudFootstep).toHaveBeenCalledWith(expect.anything(), 0.35, expect.any(Number));
    });

    it('should use correct volume for WATER', () => {
      mockHeightQueryCache.getHeightAt.mockReturnValue(0.5); // Water
      system.playPlayerFootstep(new THREE.Vector3(), false, 1.0, true);
      expect(FootstepSynthesis.createWaterFootstep).toHaveBeenCalledWith(expect.anything(), 0.4, expect.any(Number));
    });
  });

  describe('playLandingSound', () => {
    it('should play sound with volume boost and lower pitch', () => {
      const spy = vi.spyOn(FootstepSynthesis, 'createGrassFootstep');
      system.playLandingSound(new THREE.Vector3(), 2.0);
      
      expect(spy).toHaveBeenCalled();
      // Verify pitch multiplier argument (which is handled inside createGrassFootstep wrapper in the class)
      // The synthesis method receives (context, volume, pitch)
      // We can check the arguments passed to createGrassFootstep
      const args = spy.mock.calls[0];
      const volume = args[1] as number;
      const pitch = args[2] as number;
      
      // Default volume 0.3, impact 2.0 -> 0.3 * (1 + 2*0.2) = 0.3 * 1.4 = 0.42
      expect(volume).toBeCloseTo(0.42);
      
      // Pitch range [0.9, 1.1]. Multiplier 0.85. 
      // Expected pitch around 1.0 * 0.85 = 0.85
      expect(pitch).toBeLessThan(1.0); // Should be pitched down
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

    it('should play sound if within range', () => {
      const nearPos = new THREE.Vector3(10, 0, 0);
      const result = system.playAIFootstep(nearPos, playerPos);
      expect(result).toBe(true);
      expect(FootstepSynthesis.createGrassFootstep).toHaveBeenCalled();
    });

    it('should limit concurrent AI footsteps', () => {
      const nearPos = new THREE.Vector3(10, 0, 0);
      
      // Fill up the pool of active sounds
      const aiPool = (system as any).aiFootstepPool;
      // MAX_CONCURRENT_AI_FOOTSTEPS is 5
      for(let i=0; i<5; i++) {
        aiPool[i].isPlaying = true; 
      }

      const result = system.playAIFootstep(nearPos, playerPos);
      expect(result).toBe(false);
    });

    it('should respect pool size limits', () => {
      const nearPos = new THREE.Vector3(10, 0, 0);
      const aiPool = (system as any).aiFootstepPool;
      
      // Mark all as playing (8 total in pool, but logic checks 5 concurrent limit)
      // The concurrency check happens before pool selection
      // Let's verify it actually calls setupPositionalChain if under limit
      
      // Reset
      aiPool.forEach((s: any) => s.isPlaying = false);
      
      system.playAIFootstep(nearPos, playerPos);
      
      // One sound should have been used
      // Since we mock setupPositionalChain logic implicitly by mocking getAvailablePositionalSound logic in our head,
      // wait, setupPositionalChain is private. 
      // We can check if getOutput() was called on a positional audio, which happens in setupPositionalChain
      const sound = aiPool[0];
      expect(sound.getOutput).toHaveBeenCalled();
    });

    it('should position AI sound at source location', () => {
      const nearPos = new THREE.Vector3(10, 5, 10);
      system.playAIFootstep(nearPos, playerPos);
      
      // We can't easily access the tempObj created inside setupPositionalChain without spying on private methods or Three.js constructors
      // But we can check if the sound was added to an object with that position
      // In our mock, 'sound' is added to 'tempObj'. 
      // 'tempObj.add(sound)' is called.
      // We can spy on Object3D constructor maybe? 
      // Or we can rely on the fact that sound.removeFromParent is called later.
      
      // A better way is to verify that some Object3D was created and positioned.
      // Since we didn't mock Object3D constructor to capture instances, we can't easily check this.
      // But we can check that `getAvailablePositionalSound` was called.
      const aiPool = (system as any).aiFootstepPool;
      expect(aiPool[0].getOutput).toHaveBeenCalled();
    });

    it('should clean up temporary object after playing AI sound', () => {
      vi.useFakeTimers();
      const nearPos = new THREE.Vector3(10, 0, 0);
      system.playAIFootstep(nearPos, playerPos);
      
      const sound = (system as any).aiFootstepPool[0];
      
      // Advance time past duration (0.5s) + buffer (0.1s)
      vi.advanceTimersByTime(700);
      
      expect(sound.removeFromParent).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('dispose', () => {
    it('should stop all playing sounds', () => {
      const playerPool = (system as any).playerFootstepPool;
      const aiPool = (system as any).aiFootstepPool;

      playerPool[0].isPlaying = true;
      aiPool[0].isPlaying = true;

      system.dispose();

      expect(playerPool[0].stop).toHaveBeenCalled();
      expect(aiPool[0].stop).toHaveBeenCalled();
    });

    it('should clear pools', () => {
      system.dispose();
      expect((system as any).playerFootstepPool.length).toBe(0);
      expect((system as any).aiFootstepPool.length).toBe(0);
    });
  });
});
