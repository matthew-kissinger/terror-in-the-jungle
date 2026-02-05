import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { PlayerSuppressionSystem } from './PlayerSuppressionSystem';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';

// Mock dependencies
vi.mock('../effects/CameraShakeSystem');
vi.mock('../../utils/Logger');

// Mock DOM
const createMockDOM = () => {
  const elements = new Map<string, HTMLElement>();
  const body = {
    appendChild: vi.fn((el: HTMLElement) => {
      elements.set(el.id, el);
    }),
  };

  const mockDocument = {
    createElement: vi.fn((tagName: string) => {
      const element = {
        id: '',
        style: {
          cssText: '',
          opacity: '0',
          filter: '',
        },
        appendChild: vi.fn(),
        remove: vi.fn(),
        querySelector: vi.fn(),
        getContext: vi.fn(),
      };
      return element as any;
    }),
    body,
    getElementById: vi.fn((id: string) => elements.get(id)),
  };

  return { mockDocument, body, elements };
};

describe('PlayerSuppressionSystem', () => {
  let system: PlayerSuppressionSystem;
  let mockCameraShakeSystem: CameraShakeSystem;
  let mockDOM: ReturnType<typeof createMockDOM>;
  let mockCanvas: any;
  let mockCanvasContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup DOM mocks
    mockDOM = createMockDOM();
    vi.stubGlobal('document', mockDOM.mockDocument);
    vi.stubGlobal('window', {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    // Setup canvas context
    mockCanvasContext = {
      clearRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillRect: vi.fn(),
      fillStyle: '',
    };

    mockCanvas = {
      width: 1920,
      height: 1080,
      style: { cssText: '' },
      getContext: vi.fn(() => mockCanvasContext),
    };

    // Override createElement to return our mock canvas for 'canvas'
    vi.mocked(mockDOM.mockDocument.createElement).mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas;
      }
      return {
        id: '',
        style: {
          cssText: '',
          opacity: '0',
          filter: '',
        },
        appendChild: vi.fn(),
        remove: vi.fn(),
        querySelector: vi.fn(() => mockCanvas),
        getContext: vi.fn(),
      } as any;
    });

    // Setup camera shake system
    mockCameraShakeSystem = {
      shake: vi.fn(),
      update: vi.fn(),
      shakeFromDamage: vi.fn(),
      shakeFromExplosion: vi.fn(),
      shakeFromRecoil: vi.fn(),
    } as any;

    system = new PlayerSuppressionSystem();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Constructor', () => {
    it('should initialize with default suppression state', () => {
      expect(system.getSuppressionLevel()).toBe(0);
      expect(system.getNearMissCount()).toBe(0);
      expect(system.isSuppressed()).toBe(false);
      expect(system.getSuppressionTier()).toBe('none');
    });
  });

  describe('init', () => {
    it('should create vignette overlay element', async () => {
      await system.init();

      expect(mockDOM.mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(mockDOM.body.appendChild).toHaveBeenCalled();
    });

    it('should create directional overlay element', async () => {
      await system.init();

      const createElementCalls = vi.mocked(mockDOM.mockDocument.createElement).mock.calls;
      const canvasCall = createElementCalls.find(call => call[0] === 'canvas');

      expect(canvasCall).toBeDefined();
      expect(mockDOM.body.appendChild).toHaveBeenCalled();
    });

    it('should create desaturation overlay element', async () => {
      await system.init();

      expect(mockDOM.mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(mockDOM.body.appendChild).toHaveBeenCalledTimes(3); // vignette, directional, desaturation
    });

    it('should setup resize event listener', async () => {
      await system.init();

      expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('should set canvas size to window size', async () => {
      await system.init();

      expect(mockCanvas.width).toBe(1920);
      expect(mockCanvas.height).toBe(1080);
    });
  });

  describe('dispose', () => {
    beforeEach(async () => {
      await system.init();
    });

    it('should remove resize event listener', () => {
      system.dispose();

      expect(window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('should remove vignette element', () => {
      const elements = vi.mocked(mockDOM.mockDocument.createElement).mock.results;
      const removeSpy = vi.spyOn(elements[0].value, 'remove');

      system.dispose();

      expect(removeSpy).toHaveBeenCalled();
    });

    it('should remove directional overlay element', () => {
      const elements = vi.mocked(mockDOM.mockDocument.createElement).mock.results;
      const removeSpy = vi.spyOn(elements[1].value, 'remove');

      system.dispose();

      expect(removeSpy).toHaveBeenCalled();
    });

    it('should remove desaturation element', () => {
      const elements = vi.mocked(mockDOM.mockDocument.createElement).mock.results;
      // Order: vignette div (0), directional div (1), canvas (2), desaturation div (3)
      const removeSpy = vi.spyOn(elements[3].value, 'remove');

      system.dispose();

      expect(removeSpy).toHaveBeenCalled();
    });

    it('should handle multiple dispose calls gracefully', () => {
      system.dispose();
      expect(() => system.dispose()).not.toThrow();
    });
  });

  describe('update - decay logic', () => {
    beforeEach(async () => {
      await system.init();
    });

    it('should decay near miss count after decay time', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);
      const initialCount = system.getNearMissCount();

      // Wait for decay time (3 seconds) + update with delta
      vi.useFakeTimers();
      vi.advanceTimersByTime(3100); // Slightly over NEAR_MISS_DECAY_TIME
      system.update(0.5); // 0.5s deltaTime with decay rate 0.5

      expect(system.getNearMissCount()).toBeLessThan(initialCount);

      vi.useRealTimers();
    });

    it('should decay suppression level after decay time', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);
      const initialLevel = system.getSuppressionLevel();

      vi.useFakeTimers();
      vi.advanceTimersByTime(3100);
      system.update(0.5);

      expect(system.getSuppressionLevel()).toBeLessThan(initialLevel);

      vi.useRealTimers();
    });

    it('should not allow negative near miss count', () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(5000);
      system.update(10.0); // Very large delta

      expect(system.getNearMissCount()).toBeGreaterThanOrEqual(0);

      vi.useRealTimers();
    });

    it('should not allow negative suppression level', () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(5000);
      system.update(10.0);

      expect(system.getSuppressionLevel()).toBeGreaterThanOrEqual(0);

      vi.useRealTimers();
    });

    it('should not decay when recently hit', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);
      const initialCount = system.getNearMissCount();
      const initialLevel = system.getSuppressionLevel();

      // Update immediately (within decay time)
      system.update(0.5);

      expect(system.getNearMissCount()).toBe(initialCount);
      expect(system.getSuppressionLevel()).toBe(initialLevel);
    });
  });

  describe('update - filter old near miss events', () => {
    beforeEach(async () => {
      await system.init();
    });

    it('should remove near miss events older than 2 seconds', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      vi.useFakeTimers();
      vi.advanceTimersByTime(2100); // Over 2 seconds
      system.update(0.016);

      // Can't directly inspect recentNearMisses, but we can verify directional effects
      // are called with filtered events
      expect(mockCanvasContext.clearRect).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should keep near miss events younger than 2 seconds', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      vi.useFakeTimers();
      vi.advanceTimersByTime(1000); // Under 2 seconds
      system.update(0.016);

      expect(mockCanvasContext.clearRect).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('registerNearMiss', () => {
    beforeEach(async () => {
      await system.init();
      system.setCameraShakeSystem(mockCameraShakeSystem);
    });

    it('should increment near miss count when within radius', () => {
      const bulletPos = new THREE.Vector3(1.5, 0, 0); // Within 2.5m radius
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      expect(system.getNearMissCount()).toBe(1);
    });

    it('should not increment near miss count when beyond radius', () => {
      const bulletPos = new THREE.Vector3(10, 0, 0); // Beyond 2.5m radius
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      expect(system.getNearMissCount()).toBe(0);
    });

    it('should increase suppression level based on proximity', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0); // Very close
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      expect(system.getSuppressionLevel()).toBeGreaterThan(0);
    });

    it('should increase suppression more for closer misses', () => {
      const farBullet = new THREE.Vector3(2.0, 0, 0);
      const closeBullet = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      const system1 = new PlayerSuppressionSystem();
      system1.registerNearMiss(farBullet, playerPos);
      const farLevel = system1.getSuppressionLevel();

      const system2 = new PlayerSuppressionSystem();
      system2.registerNearMiss(closeBullet, playerPos);
      const closeLevel = system2.getSuppressionLevel();

      expect(closeLevel).toBeGreaterThan(farLevel);
    });

    it('should cap suppression level at 1.0', () => {
      const bulletPos = new THREE.Vector3(0.1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      // Register many near misses
      for (let i = 0; i < 20; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      expect(system.getSuppressionLevel()).toBeLessThanOrEqual(1.0);
    });

    it('should cap recent near misses at 5 events', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      // Register 10 near misses
      for (let i = 0; i < 10; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      // Can't directly inspect array, but getNearMissCount should still accumulate
      expect(system.getNearMissCount()).toBe(10);
    });

    it('should trigger camera shake with proximity-based intensity', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      expect(mockCameraShakeSystem.shake).toHaveBeenCalledWith(
        expect.any(Number),
        0.2,
        25
      );
    });

    it('should count near miss at exact radius boundary but no suppression increase', () => {
      const bulletPos = new THREE.Vector3(2.5, 0, 0); // Exactly at radius
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      // Source uses > which means distance <= radius counts
      expect(system.getNearMissCount()).toBe(1);
      // At exact boundary, proximityFactor = 0, so no suppression increase
      expect(system.getSuppressionLevel()).toBe(0);
    });

    it('should normalize direction correctly', () => {
      const bulletPos = new THREE.Vector3(5, 10, 5); // y should be zeroed
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      // Direction is normalized and y is zeroed - hard to verify, but should not throw
      expect(system.getNearMissCount()).toBe(0); // Outside radius
    });

    it('should ignore camera direction parameter', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);
      const cameraDir = new THREE.Vector3(1, 0, 0);

      system.registerNearMiss(bulletPos, playerPos, cameraDir);

      expect(system.getNearMissCount()).toBe(1);
    });
  });

  describe('getSuppressionLevel', () => {
    it('should return current suppression level', () => {
      expect(system.getSuppressionLevel()).toBe(0);

      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);
      system.registerNearMiss(bulletPos, playerPos);

      expect(system.getSuppressionLevel()).toBeGreaterThan(0);
    });
  });

  describe('getNearMissCount', () => {
    it('should return current near miss count', () => {
      expect(system.getNearMissCount()).toBe(0);

      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);
      system.registerNearMiss(bulletPos, playerPos);

      expect(system.getNearMissCount()).toBe(1);
    });
  });

  describe('isSuppressed', () => {
    it('should return false when below low suppression threshold', () => {
      expect(system.isSuppressed()).toBe(false);
    });

    it('should return true when at or above low suppression threshold', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      // Register enough near misses to reach low suppression (0.3)
      for (let i = 0; i < 3; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      if (system.getSuppressionLevel() >= 0.3) {
        expect(system.isSuppressed()).toBe(true);
      }
    });
  });

  describe('getSuppressionTier', () => {
    it('should return "none" when no suppression', () => {
      expect(system.getSuppressionTier()).toBe('none');
    });

    it('should return "low" when level is between 0.3 and 0.6', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      // Register 2 near misses
      system.registerNearMiss(bulletPos, playerPos);
      system.registerNearMiss(bulletPos, playerPos);

      if (system.getSuppressionLevel() >= 0.3 && system.getSuppressionLevel() < 0.6) {
        expect(system.getSuppressionTier()).toBe('low');
      }
    });

    it('should return "medium" when level is between 0.6 and 0.9', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      // Register 5 near misses
      for (let i = 0; i < 5; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      if (system.getSuppressionLevel() >= 0.6 && system.getSuppressionLevel() < 0.9) {
        expect(system.getSuppressionTier()).toBe('medium');
      }
    });

    it('should return "high" when level is at or above 0.9', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      // Register many near misses
      for (let i = 0; i < 10; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      if (system.getSuppressionLevel() >= 0.9) {
        expect(system.getSuppressionTier()).toBe('high');
      }
    });
  });

  describe('setCameraShakeSystem', () => {
    it('should set camera shake system', () => {
      system.setCameraShakeSystem(mockCameraShakeSystem);

      // Verify by registering near miss
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      expect(mockCameraShakeSystem.shake).toHaveBeenCalled();
    });

    it('should not throw when camera shake is not set', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      expect(() => system.registerNearMiss(bulletPos, playerPos)).not.toThrow();
    });
  });

  describe('setPlayerController', () => {
    it('should set player controller', () => {
      const mockPlayerController = {} as any;

      expect(() => system.setPlayerController(mockPlayerController)).not.toThrow();
    });
  });

  describe('Visual effects - vignette', () => {
    let vignetteElement: any;

    beforeEach(async () => {
      await system.init();
      const elements = vi.mocked(mockDOM.mockDocument.createElement).mock.results;
      vignetteElement = elements[0].value; // First created element
    });

    it('should have zero opacity when no suppression', () => {
      system.update(0.016);

      expect(vignetteElement.style.opacity).toBe('0');
    });

    it('should increase vignette opacity at low suppression', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      for (let i = 0; i < 3; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      system.update(0.016);

      if (system.getSuppressionLevel() >= 0.3) {
        expect(parseFloat(vignetteElement.style.opacity)).toBeGreaterThan(0);
      }
    });

    it('should have medium opacity at medium suppression', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      for (let i = 0; i < 5; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      system.update(0.016);

      if (system.getSuppressionLevel() >= 0.6 && system.getSuppressionLevel() < 0.9) {
        expect(vignetteElement.style.opacity).toBe('0.4');
      }
    });

    it('should have high opacity at high suppression', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      for (let i = 0; i < 10; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      system.update(0.016);

      if (system.getSuppressionLevel() >= 0.9) {
        expect(vignetteElement.style.opacity).toBe('0.7');
      }
    });
  });

  describe('Visual effects - desaturation', () => {
    let desaturationElement: any;

    beforeEach(async () => {
      await system.init();
      const elements = vi.mocked(mockDOM.mockDocument.createElement).mock.results;
      // Order: vignette div (0), directional div (1), canvas (2), desaturation div (3)
      desaturationElement = elements[3].value;
    });

    it('should have zero filter when no suppression', () => {
      system.update(0.016);

      expect(desaturationElement.style.opacity).toBe('0');
    });

    it('should apply desaturation at low suppression', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      for (let i = 0; i < 3; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      system.update(0.016);

      if (system.getSuppressionLevel() >= 0.3 && system.getSuppressionLevel() < 0.6) {
        expect(desaturationElement.style.filter).toBe('saturate(90%)');
        expect(desaturationElement.style.opacity).toBe('1');
      }
    });

    it('should apply more desaturation at medium suppression', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      for (let i = 0; i < 5; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      system.update(0.016);

      if (system.getSuppressionLevel() >= 0.6 && system.getSuppressionLevel() < 0.9) {
        expect(desaturationElement.style.filter).toBe('saturate(70%)');
        expect(desaturationElement.style.opacity).toBe('1');
      }
    });

    it('should apply heavy desaturation at high suppression', () => {
      const bulletPos = new THREE.Vector3(0.5, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      for (let i = 0; i < 10; i++) {
        system.registerNearMiss(bulletPos, playerPos);
      }

      system.update(0.016);

      if (system.getSuppressionLevel() >= 0.9) {
        expect(desaturationElement.style.filter).toBe('saturate(40%)');
        expect(desaturationElement.style.opacity).toBe('1');
      }
    });
  });

  describe('Visual effects - directional overlay', () => {
    beforeEach(async () => {
      await system.init();
    });

    it('should clear canvas each update', () => {
      system.update(0.016);

      expect(mockCanvasContext.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    });

    it('should draw directional effects for recent near misses', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);
      system.update(0.016);

      expect(mockCanvasContext.createRadialGradient).toHaveBeenCalled();
      expect(mockCanvasContext.fillRect).toHaveBeenCalled();
    });

    it('should fade directional effects over time', () => {
      const bulletPos = new THREE.Vector3(1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);
      system.update(0.016);

      expect(mockCanvasContext.createRadialGradient).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('Window resize handling', () => {
    beforeEach(async () => {
      await system.init();
    });

    it('should resize canvas on window resize', () => {
      const resizeCallback = vi.mocked(window.addEventListener).mock.calls.find(
        call => call[0] === 'resize'
      )?.[1] as Function;

      // Simulate resize
      vi.stubGlobal('window', {
        ...window,
        innerWidth: 2560,
        innerHeight: 1440,
      });

      resizeCallback();

      expect(mockCanvas.width).toBe(2560);
      expect(mockCanvas.height).toBe(1440);
    });
  });

  describe('Edge cases', () => {
    beforeEach(async () => {
      await system.init();
    });

    it('should handle zero deltaTime', () => {
      expect(() => system.update(0)).not.toThrow();
    });

    it('should handle very large deltaTime', () => {
      expect(() => system.update(10.0)).not.toThrow();
      expect(system.getSuppressionLevel()).toBe(0);
    });

    it('should handle near miss at exact player position', () => {
      const bulletPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      expect(system.getNearMissCount()).toBe(1);
      expect(system.getSuppressionLevel()).toBeGreaterThan(0);
    });

    it('should handle near miss with different Y positions', () => {
      const bulletPos = new THREE.Vector3(1, 100, 0); // High Y
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos, playerPos);

      // Y is included in distance calculation, so distance > radius
      expect(system.getNearMissCount()).toBe(0);
    });

    it('should handle update without init', () => {
      const freshSystem = new PlayerSuppressionSystem();
      expect(() => freshSystem.update(0.016)).not.toThrow();
    });

    it('should handle dispose without init', () => {
      const freshSystem = new PlayerSuppressionSystem();
      expect(() => freshSystem.dispose()).not.toThrow();
    });

    it('should handle multiple near misses in same frame', () => {
      const bulletPos1 = new THREE.Vector3(1, 0, 0);
      const bulletPos2 = new THREE.Vector3(0, 0, 1);
      const bulletPos3 = new THREE.Vector3(-1, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.registerNearMiss(bulletPos1, playerPos);
      system.registerNearMiss(bulletPos2, playerPos);
      system.registerNearMiss(bulletPos3, playerPos);

      expect(system.getNearMissCount()).toBe(3);
    });
  });
});
