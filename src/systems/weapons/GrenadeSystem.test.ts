import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { GrenadeSystem } from './GrenadeSystem';
import { GrenadeType } from '../combat/types';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock spatialGridManager
vi.mock('../combat/SpatialGridManager', () => ({
  spatialGridManager: {
    getIsInitialized: vi.fn().mockReturnValue(false),
    queryRadius: vi.fn().mockReturnValue([]),
  },
}));

// Mock spawnSmokeCloud
vi.mock('../effects/SmokeCloudSystem', () => ({
  spawnSmokeCloud: vi.fn(),
}));

// Mock window for GrenadeHandView
if (typeof global.window === 'undefined') {
  (global as any).window = {
    innerWidth: 1024,
    innerHeight: 768,
  };
}

describe('GrenadeSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let grenadeSystem: GrenadeSystem;
  let mockInventory: any;
  let mockAudioManager: any;
  let mockChunkManager: any;
  let mockCombatantSystem: any;
  let mockExplosionEffectsPool: any;
  let mockPlayerController: any;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 0, 10);
    
    mockChunkManager = {
      getEffectiveHeightAt: vi.fn().mockReturnValue(0),
    };

    grenadeSystem = new GrenadeSystem(scene, camera, mockChunkManager as any);
    
    mockInventory = {
      canUseGrenade: vi.fn().mockReturnValue(true),
      useGrenade: vi.fn().mockReturnValue(true),
    };
    grenadeSystem.setInventoryManager(mockInventory as any);

    mockAudioManager = {
      play: vi.fn(),
      playExplosionAt: vi.fn(),
      getListener: vi.fn().mockReturnValue({
        context: {
          createOscillator: vi.fn().mockReturnValue({
            connect: vi.fn(),
            frequency: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
          }),
          createGain: vi.fn().mockReturnValue({
            connect: vi.fn(),
            gain: {
              setValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
          }),
          destination: {},
          currentTime: 0,
        },
      }),
    };
    grenadeSystem.setAudioManager(mockAudioManager as any);

    mockCombatantSystem = {
      getCombatantsInRange: vi.fn().mockReturnValue([]),
      applyExplosionDamage: vi.fn(),
      combatants: new Map(),
    };
    grenadeSystem.setCombatantSystem(mockCombatantSystem as any);

    mockExplosionEffectsPool = {
      spawn: vi.fn(),
      update: vi.fn(),
    };
    grenadeSystem.setExplosionEffectsPool(mockExplosionEffectsPool as any);

    mockPlayerController = {
      applyExplosionShake: vi.fn(),
    };
    grenadeSystem.setPlayerController(mockPlayerController as any);
  });

  afterEach(() => {
    grenadeSystem.dispose();
    vi.clearAllMocks();
  });

  it('should initialize correctly', () => {
    expect(grenadeSystem).toBeDefined();
    expect(grenadeSystem.isCurrentlyAiming()).toBe(false);
    expect(grenadeSystem.getGrenadeType()).toBe(GrenadeType.FRAG);
  });

  describe('Aiming and Power', () => {
    it('should start aiming when grenades are available', () => {
      grenadeSystem.startAiming();
      expect(grenadeSystem.isCurrentlyAiming()).toBe(true);
      
      const state = grenadeSystem.getAimingState();
      expect(state.isAiming).toBe(true);
      expect(state.power).toBe(0.3);
    });

    it('should not start aiming when no grenades are available', () => {
      mockInventory.canUseGrenade.mockReturnValue(false);
      grenadeSystem.startAiming();
      expect(grenadeSystem.isCurrentlyAiming()).toBe(false);
    });

    it('should increase throw power while aiming over time', () => {
      grenadeSystem.startAiming();
      
      // Power builds up over 2 seconds from 0.3 to 1.0
      // Update by 1 second
      grenadeSystem.update(1.0);
      
      const state = grenadeSystem.getAimingState();
      expect(state.power).toBeCloseTo(0.65); // 0.3 + (1/2)*0.7
      
      // Update by another 1 second
      grenadeSystem.update(1.0);
      expect(grenadeSystem.getAimingState().power).toBe(1.0);
    });

    it('should cap throw power at 1.0', () => {
      grenadeSystem.startAiming();
      grenadeSystem.update(5.0); // well over 2 seconds
      expect(grenadeSystem.getAimingState().power).toBe(1.0);
    });

    it('should cancel throwing and reset power', () => {
      grenadeSystem.startAiming();
      grenadeSystem.update(1.0);
      grenadeSystem.cancelThrow();
      
      expect(grenadeSystem.isCurrentlyAiming()).toBe(false);
      expect(grenadeSystem.getAimingState().power).toBe(0.3);
    });

    it('should allow manual power adjustment', () => {
      grenadeSystem.startAiming();
      grenadeSystem.adjustPower(0.5);
      expect(grenadeSystem.getAimingState().power).toBe(0.8);
      
      grenadeSystem.adjustPower(-1.0);
      expect(grenadeSystem.getAimingState().power).toBe(0.3); // Minimum cap
    });
  });

  describe('Throwing', () => {
    it('should throw a grenade and add it to active list', () => {
      grenadeSystem.startAiming();
      const success = grenadeSystem.throwGrenade();
      
      expect(success).toBe(true);
      expect(grenadeSystem.isCurrentlyAiming()).toBe(false);
      expect(mockInventory.useGrenade).toHaveBeenCalled();
      expect(mockAudioManager.play).not.toHaveBeenCalledWith('grenadeThrow', expect.any(THREE.Vector3));
      
      // Check private grenades list via @ts-ignore
      expect((grenadeSystem as any).grenades.length).toBe(1);
    });

    it('should not throw if not aiming', () => {
      const success = grenadeSystem.throwGrenade();
      expect(success).toBe(false);
      expect(mockInventory.useGrenade).not.toHaveBeenCalled();
    });

    it('should cancel throw if inventory.useGrenade fails', () => {
      grenadeSystem.startAiming();
      mockInventory.useGrenade.mockReturnValue(false);
      
      const success = grenadeSystem.throwGrenade();
      expect(success).toBe(false);
      expect(grenadeSystem.isCurrentlyAiming()).toBe(false);
    });
  });

  describe('Cooking', () => {
    it('should start cooking when aiming', () => {
      grenadeSystem.startAiming();
      grenadeSystem.startCooking();
      
      expect(grenadeSystem.getAimingState().cookingTime).toBe(0);
      expect(mockAudioManager.play).not.toHaveBeenCalledWith('grenadePinPull');
    });

    it('should not start cooking if not aiming', () => {
      grenadeSystem.startCooking();
      expect(mockAudioManager.play).not.toHaveBeenCalledWith('grenadePinPull');
    });

    it('should update cooking time during update', () => {
      grenadeSystem.startAiming();
      grenadeSystem.startCooking();
      
      grenadeSystem.update(1.5);
      expect(grenadeSystem.getAimingState().cookingTime).toBe(1.5);
    });

    it('should explode in hand if cooked too long', () => {
      grenadeSystem.startAiming();
      grenadeSystem.startCooking();
      
      // Default FUSE_TIME is 3.5
      grenadeSystem.update(3.6);
      
      expect(grenadeSystem.isCurrentlyAiming()).toBe(false);
      expect(mockExplosionEffectsPool.spawn).toHaveBeenCalled();
      expect(mockAudioManager.playExplosionAt).toHaveBeenCalled();
      expect(mockPlayerController.applyExplosionShake).toHaveBeenCalled();
    });

    it('should reduce fuse time of thrown grenade if cooked', () => {
      grenadeSystem.startAiming();
      grenadeSystem.startCooking();
      grenadeSystem.update(1.0);
      
      grenadeSystem.throwGrenade();
      
      const grenade = (grenadeSystem as any).grenades[0];
      // Original fuse is 3.5, cooked for 1s, remaining should be 2.5
      expect(grenade.fuseTime).toBeCloseTo(2.5);
    });
  });

  describe('Grenade Types', () => {
    it('should support changing grenade types', () => {
      grenadeSystem.setGrenadeType(GrenadeType.SMOKE);
      expect(grenadeSystem.getGrenadeType()).toBe(GrenadeType.SMOKE);
      
      grenadeSystem.setGrenadeType(GrenadeType.FLASHBANG);
      expect(grenadeSystem.getGrenadeType()).toBe(GrenadeType.FLASHBANG);
    });

    it('should spawn grenade with correct type', () => {
      grenadeSystem.setGrenadeType(GrenadeType.SMOKE);
      grenadeSystem.startAiming();
      grenadeSystem.throwGrenade();
      
      const grenade = (grenadeSystem as any).grenades[0];
      expect(grenade.type).toBe(GrenadeType.SMOKE);
    });
  });

  describe('Active Grenades Update', () => {
    it('should update grenade physics and fuse', () => {
      grenadeSystem.startAiming();
      grenadeSystem.throwGrenade();
      
      const grenade = (grenadeSystem as any).grenades[0];
      const initialPos = grenade.position.clone();
      const initialFuse = grenade.fuseTime;
      
      grenadeSystem.update(0.1);
      
      expect(grenade.fuseTime).toBeLessThan(initialFuse);
      expect(grenade.position.equals(initialPos)).toBe(false);
    });

    it('should explode and remove grenade when fuse reaches zero', () => {
      grenadeSystem.startAiming();
      grenadeSystem.throwGrenade();
      
      const grenade = (grenadeSystem as any).grenades[0];
      const fuse = grenade.fuseTime;
      
      grenadeSystem.update(fuse + 0.1);
      
      expect((grenadeSystem as any).grenades.length).toBe(0);
      expect(mockExplosionEffectsPool.spawn).toHaveBeenCalled();
    });
  });

  describe('Utility methods', () => {
    it('should show/hide grenade in hand', () => {
      // This mainly tests that it doesn't crash as it calls sub-component
      grenadeSystem.showGrenadeInHand(true);
      grenadeSystem.showGrenadeInHand(false);
    });

    it('should return overlay scene and camera', () => {
      expect(grenadeSystem.getGrenadeOverlayScene()).toBeInstanceOf(THREE.Scene);
      expect(grenadeSystem.getGrenadeOverlayCamera()).toBeInstanceOf(THREE.Camera);
    });
  });
});
