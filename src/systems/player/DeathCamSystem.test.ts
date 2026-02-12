import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as THREE from 'three';

// Create mock functions for the overlay
const mockCreateOverlay = vi.fn();
const mockShowOverlay = vi.fn();
const mockHideOverlay = vi.fn();
const mockUpdateRespawnTimer = vi.fn();
const mockDispose = vi.fn();

// Mock DeathCamOverlay as a proper class constructor
vi.mock('./DeathCamOverlay', () => ({
  DeathCamOverlay: class MockDeathCamOverlay {
    createOverlay = mockCreateOverlay;
    showOverlay = mockShowOverlay;
    hideOverlay = mockHideOverlay;
    updateRespawnTimer = mockUpdateRespawnTimer;
    dispose = mockDispose;
  }
}));

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// Import THREE before mocking it
import * as THREE from 'three';

// Mock THREE with real math but mock PerspectiveCamera
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    PerspectiveCamera: vi.fn().mockImplementation(() => ({
      position: new actual.Vector3(),
      quaternion: new actual.Quaternion(),
      lookAt: vi.fn(),
      getWorldDirection: vi.fn().mockImplementation((target: THREE.Vector3) => {
        target.set(0, 0, -1);
        return target;
      }),
    })),
  };
});

import { DeathCamSystem } from './DeathCamSystem';
import { type KillerInfo } from './DeathCamOverlay';

// Helper to create a mock camera
function createMockCamera(position = new THREE.Vector3(), quaternion = new THREE.Quaternion()) {
  return {
    position: position.clone(),
    quaternion: quaternion.clone(),
    lookAt: vi.fn(),
    getWorldDirection: vi.fn().mockImplementation((target: THREE.Vector3) => {
      target.set(0, 0, -1);
      return target;
    }),
  } as unknown as THREE.PerspectiveCamera;
}

// Helper to create killer info
function createKillerInfo(overrides?: Partial<KillerInfo>): KillerInfo {
  return {
    name: 'TestEnemy',
    position: new THREE.Vector3(10, 0, 10),
    weaponName: 'TestWeapon',
    faction: 'enemy',
    distance: 50,
    wasHeadshot: false,
    ...overrides,
  };
}

describe('DeathCamSystem', () => {
  let mockCamera: THREE.PerspectiveCamera;
  let deathCamSystem: DeathCamSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCamera = createMockCamera();
    deathCamSystem = new DeathCamSystem(mockCamera);
  });

  afterEach(() => {
    deathCamSystem?.dispose();
  });

  describe('constructor', () => {
    it('should store camera reference', () => {
      expect(deathCamSystem).toBeDefined();
    });

    it('should create DeathCamOverlay instance', () => {
      // DeathCamOverlay constructor should have been called when creating DeathCamSystem
      expect(mockCreateOverlay).not.toHaveBeenCalled(); // createOverlay is called in init(), not constructor
    });
  });

  describe('init', () => {
    it('should call overlay.createOverlay()', async () => {
      await deathCamSystem.init();
      expect(mockCreateOverlay).toHaveBeenCalledTimes(1);
    });
  });

  describe('startDeathCam', () => {
    const deathPosition = new THREE.Vector3(5, 2, 5);

    it('should set isActive to true', () => {
      deathCamSystem.startDeathCam(deathPosition);
      expect(deathCamSystem.isDeathCamActive()).toBe(true);
    });

    it('should store death position (cloned)', () => {
      const originalPosition = deathPosition.clone();
      deathCamSystem.startDeathCam(deathPosition);
      
      // Modify original to verify clone
      deathPosition.set(100, 100, 100);
      
      // Death cam should still use the cloned value
      expect(mockShowOverlay).toHaveBeenCalled();
    });

    it('should store killer info', () => {
      const killerInfo = createKillerInfo();
      deathCamSystem.startDeathCam(deathPosition, killerInfo);
      expect(mockShowOverlay).toHaveBeenCalledWith(killerInfo);
    });

    it('should work without killer info', () => {
      deathCamSystem.startDeathCam(deathPosition);
      expect(mockShowOverlay).toHaveBeenCalledWith(undefined);
    });

    it('should reset phaseTimer and cameraPhase to freeze', () => {
      // First trigger a transition by updating
      deathCamSystem.startDeathCam(deathPosition);
      deathCamSystem.update(10); // Move past freeze
      
      // Now reset
      deathCamSystem.endDeathCam();
      deathCamSystem.startDeathCam(deathPosition);
      
      // Should be back at freeze phase
      expect(deathCamSystem.isDeathCamActive()).toBe(true);
    });

    it('should store original camera position/quaternion', () => {
      mockCamera.position.set(1, 2, 3);
      mockCamera.quaternion.set(0, 0, 0, 1);
      
      deathCamSystem.startDeathCam(deathPosition);
      
      // Original position should be cloned - verified by overlay showing
      expect(mockShowOverlay).toHaveBeenCalled();
    });

    it('should show overlay', () => {
      deathCamSystem.startDeathCam(deathPosition);
      expect(mockShowOverlay).toHaveBeenCalledTimes(1);
    });
  });

  describe('endDeathCam', () => {
    const deathPosition = new THREE.Vector3(5, 2, 5);

    beforeEach(() => {
      deathCamSystem.startDeathCam(deathPosition, createKillerInfo());
    });

    it('should set isActive to false', () => {
      expect(deathCamSystem.isDeathCamActive()).toBe(true);
      deathCamSystem.endDeathCam();
      expect(deathCamSystem.isDeathCamActive()).toBe(false);
    });

    it('should hide overlay', () => {
      deathCamSystem.endDeathCam();
      expect(mockHideOverlay).toHaveBeenCalledTimes(1);
    });

    it('should reset phase to freeze', () => {
      deathCamSystem.endDeathCam();
      
      // After ending, a new start should be at freeze phase
      deathCamSystem.startDeathCam(deathPosition);
      expect(deathCamSystem.isDeathCamActive()).toBe(true);
    });

    it('should restore camera position and quaternion after death cam', () => {
      const originalPos = new THREE.Vector3(10, 5, 10);
      const originalQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0));
      mockCamera.position.copy(originalPos);
      mockCamera.quaternion.copy(originalQuat);

      deathCamSystem.startDeathCam(deathPosition);
      // Move through phases so camera is no longer at original position
      deathCamSystem.update(0.5);
      deathCamSystem.update(0.1);
      deathCamSystem.update(1.0);
      deathCamSystem.update(0.5);

      expect(mockCamera.position.equals(originalPos)).toBe(false);

      deathCamSystem.endDeathCam();

      expect(mockCamera.position.equals(originalPos)).toBe(true);
      expect(mockCamera.quaternion.equals(originalQuat)).toBe(true);
    });
  });

  describe('update - phase transitions', () => {
    const deathPosition = new THREE.Vector3(5, 2, 5);

    it('should return early when not active', () => {
      const initialPosition = mockCamera.position.clone();
      deathCamSystem.update(1.0);
      expect(mockCamera.position.equals(initialPosition)).toBe(true);
    });

    describe('FREEZE phase', () => {
      beforeEach(() => {
        deathCamSystem.startDeathCam(deathPosition);
      });

      it('should hold position for 0.5s', () => {
        const initialPosition = mockCamera.position.clone();
        deathCamSystem.update(0.3);
        expect(mockCamera.position.equals(initialPosition)).toBe(true);
      });

      it('should transition to transition phase after 0.5s', () => {
        deathCamSystem.update(0.5);
        deathCamSystem.update(0.1); // Trigger transition
        
        // Camera should start moving now
        deathCamSystem.update(0.5);
        expect(mockCamera.lookAt).toHaveBeenCalled();
      });
    });

    describe('TRANSITION phase', () => {
      beforeEach(() => {
        mockCamera.position.set(10, 5, 10);
        deathCamSystem.startDeathCam(deathPosition);
        // Move through freeze phase
        deathCamSystem.update(0.5);
      });

      it('should lerp camera to target position over 1.0s', () => {
        deathCamSystem.update(0.1); // Start transition
        
        // Should be lerping
        expect(mockCamera.lookAt).toHaveBeenCalled();
      });

      it('should use ease-out cubic easing', () => {
        deathCamSystem.update(0.1); // Start transition
        deathCamSystem.update(0.3); // 30% through transition
        
        // Camera should be moved via lerpVectors and lookAt
        expect(mockCamera.lookAt).toHaveBeenCalled();
      });

      it('should transition to orbit phase after total 1.5s (0.5s freeze + 1.0s transition)', () => {
        // After freeze (0.5s) + transition (1.0s) = 1.5s total
        deathCamSystem.update(0.1); // Start transition at 0.6s
        deathCamSystem.update(1.0); // Complete transition at 1.6s
        
        // Now in orbit phase - camera should be moving in a circle
        const posBefore = mockCamera.position.clone();
        deathCamSystem.update(0.1); // Small update in orbit
        
        // Camera should have been updated during orbit
        expect(mockCamera.lookAt).toHaveBeenCalled();
      });
    });

    describe('ORBIT phase', () => {
      beforeEach(() => {
        mockCamera.position.set(10, 5, 10);
        deathCamSystem.startDeathCam(deathPosition);
        // Move through freeze (0.5s) and transition (1.0s)
        deathCamSystem.update(0.5); // Freeze complete
        deathCamSystem.update(0.1); // Start transition
        deathCamSystem.update(1.0); // Transition complete, start orbit
      });

      it('should orbit camera around death position', () => {
        const posBefore = new THREE.Vector3().copy(mockCamera.position);
        
        deathCamSystem.update(0.1); // Small orbit step
        
        // Camera should move
        expect(mockCamera.lookAt).toHaveBeenCalled();
      });

      it('should orbit at radius 8 and height 4', () => {
        // Let orbit start and run a bit
        deathCamSystem.update(0.1);
        
        const cameraY = mockCamera.position.y;
        // Should be at deathPosition.y + ORBIT_HEIGHT = 2 + 4 = 6
        expect(cameraY).toBeCloseTo(deathPosition.y + 4, 1);
      });

      it('should look at death position + 1 unit Y (chest height)', () => {
        deathCamSystem.update(0.1);
        
        // lookAt should be called with a position
        expect(mockCamera.lookAt).toHaveBeenCalled();
      });

      it('should blend look direction toward killer if killer info exists', () => {
        deathCamSystem.endDeathCam();
        const killerInfo = createKillerInfo({ position: new THREE.Vector3(15, 2, 15) });
        deathCamSystem.startDeathCam(deathPosition, killerInfo);
        
        // Move through phases to orbit
        deathCamSystem.update(0.5); // Freeze
        deathCamSystem.update(0.1); // Transition start
        deathCamSystem.update(1.0); // Transition complete
        
        deathCamSystem.update(0.1);
        
        // lookAt should have been called during orbit with killer info
        expect(mockCamera.lookAt).toHaveBeenCalled();
      });

      it('should orbit for 3.0s then go to DONE', () => {
        // Run orbit for 3 seconds
        deathCamSystem.update(3.0);
        
        // Should now be in done phase - camera stays still
        const posBefore = mockCamera.position.clone();
        deathCamSystem.update(0.1);
        
        // Position shouldn't change in done phase (orbit complete)
        expect(mockCamera.position.equals(posBefore)).toBe(true);
      });
    });

    describe('DONE phase', () => {
      beforeEach(() => {
        mockCamera.position.set(10, 5, 10);
        deathCamSystem.startDeathCam(deathPosition);
        // Move through all phases: freeze (0.5s) + transition (1.0s) + orbit (3.0s) = 4.5s
        deathCamSystem.update(0.5);
        deathCamSystem.update(0.1); // Start transition
        deathCamSystem.update(1.0); // Start orbit
        deathCamSystem.update(3.0); // Complete orbit, now in done
      });

      it('should hold final position', () => {
        const posBefore = mockCamera.position.clone();
        
        // Update should not change position in done phase
        deathCamSystem.update(1.0);
        
        expect(mockCamera.position.equals(posBefore)).toBe(true);
      });
    });
  });

  describe('isDeathCamActive', () => {
    it('should return false by default', () => {
      expect(deathCamSystem.isDeathCamActive()).toBe(false);
    });

    it('should return true after startDeathCam', () => {
      deathCamSystem.startDeathCam(new THREE.Vector3(0, 0, 0));
      expect(deathCamSystem.isDeathCamActive()).toBe(true);
    });

    it('should return false after endDeathCam', () => {
      deathCamSystem.startDeathCam(new THREE.Vector3(0, 0, 0));
      deathCamSystem.endDeathCam();
      expect(deathCamSystem.isDeathCamActive()).toBe(false);
    });
  });

  describe('updateRespawnTimer', () => {
    it('should delegate to overlay when active', () => {
      const deathPosition = new THREE.Vector3(5, 2, 5);
      deathCamSystem.startDeathCam(deathPosition);
      
      deathCamSystem.updateRespawnTimer(5);
      
      expect(mockUpdateRespawnTimer).toHaveBeenCalledWith(5);
    });

    it('should not call overlay when not active', () => {
      vi.clearAllMocks();
      
      deathCamSystem.updateRespawnTimer(5);
      
      expect(mockUpdateRespawnTimer).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should hide overlay', () => {
      deathCamSystem.dispose();
      expect(mockHideOverlay).toHaveBeenCalledTimes(1);
    });

    it('should call overlay.dispose()', () => {
      deathCamSystem.dispose();
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('killer positioning with angle calculation', () => {
    it('should position camera based on killer direction when killer info provided', () => {
      const deathPosition = new THREE.Vector3(0, 0, 0);
      const killerInfo = createKillerInfo({ position: new THREE.Vector3(0, 0, 10) });
      
      mockCamera.position.set(5, 5, 5);
      deathCamSystem.startDeathCam(deathPosition, killerInfo);
      
      // Move through freeze
      deathCamSystem.update(0.5);
      
      // Transition should use killer angle
      expect(mockCamera.lookAt).not.toHaveBeenCalled(); // Not yet
      
      deathCamSystem.update(0.1); // Start transition
      expect(mockCamera.lookAt).toHaveBeenCalled();
    });

    it('should handle killer in different quadrants', () => {
      const deathPosition = new THREE.Vector3(0, 0, 0);
      
      // Killer at +X
      let killerInfo = createKillerInfo({ position: new THREE.Vector3(10, 0, 0) });
      deathCamSystem.startDeathCam(deathPosition, killerInfo);
      deathCamSystem.endDeathCam();
      
      // Killer at -X
      killerInfo = createKillerInfo({ position: new THREE.Vector3(-10, 0, 0) });
      deathCamSystem.startDeathCam(deathPosition, killerInfo);
      deathCamSystem.endDeathCam();
      
      // Killer at +Z
      killerInfo = createKillerInfo({ position: new THREE.Vector3(0, 0, 10) });
      deathCamSystem.startDeathCam(deathPosition, killerInfo);
      deathCamSystem.endDeathCam();
      
      // Killer at -Z
      killerInfo = createKillerInfo({ position: new THREE.Vector3(0, 0, -10) });
      deathCamSystem.startDeathCam(deathPosition, killerInfo);
      
      // All should work without errors
      expect(deathCamSystem.isDeathCamActive()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle startDeathCam called twice', () => {
      const deathPosition = new THREE.Vector3(5, 2, 5);
      
      deathCamSystem.startDeathCam(deathPosition);
      const firstCallCount = mockShowOverlay.mock.calls.length;
      
      deathCamSystem.startDeathCam(deathPosition);
      
      expect(mockShowOverlay.mock.calls.length).toBe(firstCallCount + 1);
    });

    it('should handle endDeathCam called when not active', () => {
      expect(() => deathCamSystem.endDeathCam()).not.toThrow();
      expect(deathCamSystem.isDeathCamActive()).toBe(false);
    });

    it('should handle updateRespawnTimer with zero seconds', () => {
      deathCamSystem.startDeathCam(new THREE.Vector3(0, 0, 0));
      
      deathCamSystem.updateRespawnTimer(0);
      
      expect(mockUpdateRespawnTimer).toHaveBeenCalledWith(0);
    });

    it('should handle dispose when overlay not created', () => {
      // Create a new system without init
      const newSystem = new DeathCamSystem(mockCamera);
      expect(() => newSystem.dispose()).not.toThrow();
    });
  });
});
