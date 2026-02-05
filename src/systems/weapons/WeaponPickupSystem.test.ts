import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WeaponPickupSystem, WeaponType } from './WeaponPickupSystem';
import type { IPlayerController } from '../../types/SystemInterfaces';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock AssetLoader
vi.mock('../assets/AssetLoader');

// Mock DOM for UI creation
if (typeof document === 'undefined') {
  const mockElement = {
    style: {} as any,
    textContent: '',
    parentNode: null as any,
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  };

  const mockBody = {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  };

  vi.stubGlobal('document', {
    createElement: vi.fn().mockReturnValue(mockElement),
    body: mockBody,
  });

  const listeners: Record<string, Function[]> = {};
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type: string, callback: Function) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(callback);
    }),
    removeEventListener: vi.fn((type: string, callback: Function) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(l => l !== callback);
    }),
    dispatchEvent: vi.fn((event: any) => {
      const type = event.type;
      if (listeners[type]) {
        listeners[type].forEach(callback => callback(event));
      }
    }),
  });

  vi.stubGlobal('KeyboardEvent', class {
    type: string;
    code: string;
    constructor(type: string, init?: { code?: string }) {
      this.type = type;
      this.code = init?.code || '';
    }
  });
}

describe('WeaponPickupSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let assetLoader: any;
  let weaponPickupSystem: WeaponPickupSystem;
  let mockPlayerController: IPlayerController;

  beforeEach(async () => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);

    assetLoader = {
      loadTexture: vi.fn().mockResolvedValue(new THREE.Texture()),
    };

    weaponPickupSystem = new WeaponPickupSystem(scene, camera, assetLoader);

    mockPlayerController = {
      getPosition: vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0)),
      getVelocity: vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0)),
    } as any;

    await weaponPickupSystem.init();
    weaponPickupSystem.setPlayerController(mockPlayerController);

    vi.clearAllMocks();
  });

  afterEach(() => {
    weaponPickupSystem.dispose();
    vi.clearAllTimers();
  });

  describe('Constructor', () => {
    it('should initialize with provided scene, camera, and assetLoader', () => {
      const newSystem = new WeaponPickupSystem(scene, camera, assetLoader);
      expect(newSystem).toBeDefined();
    });

    it('should start with empty pickups map', () => {
      const pickups = (weaponPickupSystem as any).pickups;
      expect(pickups.size).toBe(0);
    });

    it('should initialize nextPickupId to 0', () => {
      const nextId = (weaponPickupSystem as any).nextPickupId;
      expect(nextId).toBe(0);
    });
  });

  describe('Initialization', () => {
    it('should create materials for each weapon type', async () => {
      const freshSystem = new WeaponPickupSystem(scene, camera, assetLoader);
      await freshSystem.init();

      const materials = (freshSystem as any).materials;
      expect(materials.size).toBe(3);
      expect(materials.has(WeaponType.RIFLE)).toBe(true);
      expect(materials.has(WeaponType.SHOTGUN)).toBe(true);
      expect(materials.has(WeaponType.SMG)).toBe(true);

      freshSystem.dispose();
    });

    it('should create materials with correct colors', async () => {
      const freshSystem = new WeaponPickupSystem(scene, camera, assetLoader);
      await freshSystem.init();

      const materials = (freshSystem as any).materials;
      expect(materials.get(WeaponType.RIFLE).color.getHex()).toBe(0x00ff00); // Green
      expect(materials.get(WeaponType.SHOTGUN).color.getHex()).toBe(0xff0000); // Red
      expect(materials.get(WeaponType.SMG).color.getHex()).toBe(0x0088ff); // Blue

      freshSystem.dispose();
    });

    it('should create materials with proper transparency settings', async () => {
      const freshSystem = new WeaponPickupSystem(scene, camera, assetLoader);
      await freshSystem.init();

      const materials = (freshSystem as any).materials;
      const rifleMaterial = materials.get(WeaponType.RIFLE);

      expect(rifleMaterial.transparent).toBe(true);
      expect(rifleMaterial.opacity).toBe(0.8);
      expect(rifleMaterial.depthWrite).toBe(false);
      expect(rifleMaterial.side).toBe(THREE.DoubleSide);

      freshSystem.dispose();
    });

    it('should create prompt UI element', async () => {
      const freshSystem = new WeaponPickupSystem(scene, camera, assetLoader);
      await freshSystem.init();

      expect(document.createElement).toHaveBeenCalledWith('div');
      const promptElement = (freshSystem as any).promptElement;
      expect(promptElement).toBeDefined();

      freshSystem.dispose();
    });

    it('should add keydown event listener', async () => {
      const freshSystem = new WeaponPickupSystem(scene, camera, assetLoader);
      await freshSystem.init();

      expect(window.addEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );

      freshSystem.dispose();
    });

    it('should store bound keydown handler', async () => {
      const freshSystem = new WeaponPickupSystem(scene, camera, assetLoader);
      await freshSystem.init();

      const boundHandler = (freshSystem as any).boundOnKeyDown;
      expect(boundHandler).toBeDefined();
      expect(typeof boundHandler).toBe('function');

      freshSystem.dispose();
    });
  });

  describe('spawnPickup', () => {
    it('should create a billboard mesh and add to scene', () => {
      const position = new THREE.Vector3(10, 0, 20);
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, position);

      expect(id).toBeDefined();
      expect(scene.children.length).toBeGreaterThan(0);

      const pickup = (weaponPickupSystem as any).pickups.get(id);
      expect(pickup).toBeDefined();
      expect(pickup.billboard).toBeInstanceOf(THREE.Mesh);
    });

    it('should position billboard at BILLBOARD_HEIGHT', () => {
      const position = new THREE.Vector3(5, 0, 10);
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, position);

      const pickup = (weaponPickupSystem as any).pickups.get(id);
      const BILLBOARD_HEIGHT = (weaponPickupSystem as any).BILLBOARD_HEIGHT;

      expect(pickup.billboard.position.y).toBe(BILLBOARD_HEIGHT);
      expect(pickup.billboard.position.x).toBe(position.x);
      expect(pickup.billboard.position.z).toBe(position.z);
    });

    it('should clone position to avoid reference sharing', () => {
      const position = new THREE.Vector3(1, 2, 3);
      const id = weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, position);

      const pickup = (weaponPickupSystem as any).pickups.get(id);
      expect(pickup.position).not.toBe(position);
      expect(pickup.position.equals(position)).toBe(true);

      position.set(99, 99, 99);
      expect(pickup.position.x).toBe(1);
    });

    it('should increment nextPickupId', () => {
      weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3());
      weaponPickupSystem.spawnPickup(WeaponType.SMG, new THREE.Vector3());

      const nextId = (weaponPickupSystem as any).nextPickupId;
      expect(nextId).toBe(2);
    });

    it('should return undefined if material not found', () => {
      // Clear materials to simulate missing material
      (weaponPickupSystem as any).materials.clear();

      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3());
      expect(id).toBeUndefined();
    });

    it('should use correct material for each weapon type', () => {
      const rifleId = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(1, 0, 0));
      const shotgunId = weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(2, 0, 0));
      const smgId = weaponPickupSystem.spawnPickup(WeaponType.SMG, new THREE.Vector3(3, 0, 0));

      const materials = (weaponPickupSystem as any).materials;
      const pickups = (weaponPickupSystem as any).pickups;

      expect(pickups.get(rifleId).billboard.material).toBe(materials.get(WeaponType.RIFLE));
      expect(pickups.get(shotgunId).billboard.material).toBe(materials.get(WeaponType.SHOTGUN));
      expect(pickups.get(smgId).billboard.material).toBe(materials.get(WeaponType.SMG));
    });

    it('should initialize rotation to 0', () => {
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3());
      const pickup = (weaponPickupSystem as any).pickups.get(id);

      expect(pickup.rotation).toBe(0);
    });

    it('should set spawnTime to current time', () => {
      const before = Date.now();
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3());
      const after = Date.now();

      const pickup = (weaponPickupSystem as any).pickups.get(id);
      expect(pickup.spawnTime).toBeGreaterThanOrEqual(before);
      expect(pickup.spawnTime).toBeLessThanOrEqual(after);
    });
  });

  describe('update', () => {
    it('should skip update if no player controller', () => {
      const systemWithoutPlayer = new WeaponPickupSystem(scene, camera, assetLoader);

      // Should not throw
      expect(() => {
        systemWithoutPlayer.update(0.016);
      }).not.toThrow();
    });

    it('should update player position from controller', () => {
      const playerPos = new THREE.Vector3(50, 10, 30);
      mockPlayerController.getPosition = vi.fn().mockReturnValue(playerPos);

      weaponPickupSystem.update(0.016);

      const internalPlayerPos = (weaponPickupSystem as any).playerPosition;
      expect(internalPlayerPos.x).toBe(50);
      expect(internalPlayerPos.y).toBe(10);
      expect(internalPlayerPos.z).toBe(30);
    });

    it('should apply bobbing animation to pickups', () => {
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      const pickup = (weaponPickupSystem as any).pickups.get(id);
      const BILLBOARD_HEIGHT = (weaponPickupSystem as any).BILLBOARD_HEIGHT;

      const initialY = pickup.billboard.position.y;
      expect(initialY).toBe(BILLBOARD_HEIGHT);

      // Update to advance time
      weaponPickupSystem.update(0.1);

      const newY = pickup.billboard.position.y;
      // Y should have changed due to bobbing
      expect(newY).not.toBe(BILLBOARD_HEIGHT);
    });

    it('should apply rotation animation to pickups', () => {
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      const pickup = (weaponPickupSystem as any).pickups.get(id);

      expect(pickup.billboard.rotation.y).toBe(0);

      weaponPickupSystem.update(1.0); // 1 second

      const ROTATION_SPEED = (weaponPickupSystem as any).ROTATION_SPEED;
      expect(pickup.rotation).toBeCloseTo(ROTATION_SPEED * 1.0, 2);
      expect(pickup.billboard.rotation.y).toBeCloseTo(ROTATION_SPEED * 1.0, 2);
    });

    it('should remove expired pickups', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      expect((weaponPickupSystem as any).pickups.size).toBe(1);

      // Advance time beyond PICKUP_LIFETIME (60000ms)
      vi.setSystemTime(now + 61000);
      weaponPickupSystem.update(0.016);

      expect((weaponPickupSystem as any).pickups.size).toBe(0);

      vi.useRealTimers();
    });

    it('should not remove pickups before lifetime expires', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      expect((weaponPickupSystem as any).pickups.size).toBe(1);

      // Advance time but not past PICKUP_LIFETIME
      vi.setSystemTime(now + 30000);
      weaponPickupSystem.update(0.016);

      expect((weaponPickupSystem as any).pickups.size).toBe(1);

      vi.useRealTimers();
    });

    it('should detect nearest pickup within radius', () => {
      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));

      // Spawn pickup within radius
      const PICKUP_RADIUS = (weaponPickupSystem as any).PICKUP_RADIUS;
      weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(1, 0, 0));

      weaponPickupSystem.update(0.016);

      const nearestPickup = (weaponPickupSystem as any).nearestPickup;
      expect(nearestPickup).toBeDefined();
      expect(nearestPickup.type).toBe(WeaponType.RIFLE);
    });

    it('should not detect pickup outside radius', () => {
      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));

      // Spawn pickup far away
      weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(100, 0, 100));

      weaponPickupSystem.update(0.016);

      const nearestPickup = (weaponPickupSystem as any).nearestPickup;
      expect(nearestPickup).toBeUndefined();
    });

    it('should find the closest pickup when multiple are in range', () => {
      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));

      weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(1.5, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(0.5, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SMG, new THREE.Vector3(1.0, 0, 0));

      weaponPickupSystem.update(0.016);

      const nearestPickup = (weaponPickupSystem as any).nearestPickup;
      expect(nearestPickup).toBeDefined();
      expect(nearestPickup.type).toBe(WeaponType.SHOTGUN); // Closest at 0.5 distance
    });

    it('should show prompt when near pickup', () => {
      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(1, 0, 0));

      const promptElement = (weaponPickupSystem as any).promptElement;
      promptElement.style.display = 'none';

      weaponPickupSystem.update(0.016);

      expect(promptElement.style.display).toBe('block');
      expect(promptElement.textContent).toContain('RIFLE');
      expect(promptElement.textContent).toContain('[E]');
    });

    it('should hide prompt when no pickup nearby', () => {
      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));

      const promptElement = (weaponPickupSystem as any).promptElement;
      promptElement.style.display = 'block';

      weaponPickupSystem.update(0.016);

      expect(promptElement.style.display).toBe('none');
    });
  });

  describe('onCombatantDeath', () => {
    it('should respect drop chance', () => {
      const position = new THREE.Vector3(10, 0, 20);

      // Mock Math.random to always fail drop check
      const originalRandom = Math.random;
      Math.random = vi.fn().mockReturnValue(0.99); // Above 30% DROP_CHANCE

      const spawned = weaponPickupSystem.onCombatantDeath(position);
      expect(spawned).toBe(false);

      Math.random = originalRandom;
    });

    it('should spawn pickup when drop chance succeeds', () => {
      const position = new THREE.Vector3(10, 0, 20);

      // Mock Math.random to always succeed
      const originalRandom = Math.random;
      Math.random = vi.fn().mockReturnValue(0.1); // Below 30% DROP_CHANCE

      const spawned = weaponPickupSystem.onCombatantDeath(position);
      expect(spawned).toBe(true);

      Math.random = originalRandom;
    });

    it('should offset spawn position vertically', () => {
      const position = new THREE.Vector3(5, 0, 10);

      const originalRandom = Math.random;
      Math.random = vi.fn()
        .mockReturnValueOnce(0.1) // Drop check succeeds
        .mockReturnValueOnce(0.5); // Random weapon type

      weaponPickupSystem.onCombatantDeath(position);

      const pickups = Array.from((weaponPickupSystem as any).pickups.values());
      expect(pickups.length).toBe(1);

      // Position should be offset by 0.5 in Y
      expect(pickups[0].position.y).toBe(0.5);
      expect(pickups[0].position.x).toBe(5);
      expect(pickups[0].position.z).toBe(10);

      Math.random = originalRandom;
    });

    it('should spawn random weapon types', () => {
      const position = new THREE.Vector3(0, 0, 0);
      const originalRandom = Math.random;

      // Test each weapon type spawn
      const weaponTypes = [WeaponType.RIFLE, WeaponType.SHOTGUN, WeaponType.SMG];

      weaponTypes.forEach((expectedType, index) => {
        Math.random = vi.fn()
          .mockReturnValueOnce(0.1) // Drop check
          .mockReturnValueOnce(index / 3); // Weapon type selection

        weaponPickupSystem.onCombatantDeath(position);
      });

      const pickups = Array.from((weaponPickupSystem as any).pickups.values());
      const spawnedTypes = pickups.map((p: any) => p.type);

      expect(spawnedTypes).toContain(WeaponType.RIFLE);
      expect(spawnedTypes).toContain(WeaponType.SHOTGUN);
      expect(spawnedTypes).toContain(WeaponType.SMG);

      Math.random = originalRandom;
    });
  });

  describe('Pickup Interaction', () => {
    it('should trigger pickup when E key pressed near pickup', () => {
      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(1, 0, 0));

      const callback = vi.fn();
      weaponPickupSystem.onWeaponPickup(callback);

      // Update to detect nearby pickup
      weaponPickupSystem.update(0.016);

      // Simulate E key press
      const event = new KeyboardEvent('keydown', { code: 'KeyE' });
      (weaponPickupSystem as any).onKeyDown(event);

      expect(callback).toHaveBeenCalledWith(WeaponType.SHOTGUN, WeaponType.RIFLE);
    });

    it('should not trigger pickup when other key pressed', () => {
      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(1, 0, 0));

      const callback = vi.fn();
      weaponPickupSystem.onWeaponPickup(callback);

      weaponPickupSystem.update(0.016);

      const event = new KeyboardEvent('keydown', { code: 'KeyW' });
      (weaponPickupSystem as any).onKeyDown(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not trigger pickup when no nearby pickup', () => {
      const callback = vi.fn();
      weaponPickupSystem.onWeaponPickup(callback);

      const event = new KeyboardEvent('keydown', { code: 'KeyE' });
      (weaponPickupSystem as any).onKeyDown(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not trigger pickup when no callback set', () => {
      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(1, 0, 0));

      weaponPickupSystem.update(0.016);

      // Should not throw when callback not set
      const event = new KeyboardEvent('keydown', { code: 'KeyE' });
      expect(() => {
        (weaponPickupSystem as any).onKeyDown(event);
      }).not.toThrow();
    });

    it('should remove pickup after being picked up', () => {
      vi.useFakeTimers();

      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));
      const id = weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(1, 0, 0));

      weaponPickupSystem.onWeaponPickup(vi.fn());
      weaponPickupSystem.update(0.016);

      expect((weaponPickupSystem as any).pickups.has(id)).toBe(true);

      const event = new KeyboardEvent('keydown', { code: 'KeyE' });
      (weaponPickupSystem as any).onKeyDown(event);

      // Need to flush the setTimeout for flash effect cleanup
      vi.runAllTimers();

      expect((weaponPickupSystem as any).pickups.has(id)).toBe(false);

      vi.useRealTimers();
    });

    it('should spawn pickup effect light', () => {
      vi.useFakeTimers();

      mockPlayerController.getPosition = vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(1, 0, 0));

      weaponPickupSystem.onWeaponPickup(vi.fn());
      weaponPickupSystem.update(0.016);

      // Track scene children before pickup
      const childrenBeforePickup = scene.children.length;

      const event = new KeyboardEvent('keydown', { code: 'KeyE' });
      (weaponPickupSystem as any).onKeyDown(event);

      // Flash light should be added to scene (pickup billboard removed, flash added)
      // Net result: same count or +1 if flash still present
      const childrenAfterPickup = scene.children.length;
      expect(childrenAfterPickup).toBeGreaterThanOrEqual(childrenBeforePickup - 1);

      // Check that a PointLight was added (flash effect)
      const hasPointLight = scene.children.some(child => child instanceof THREE.PointLight);
      expect(hasPointLight).toBe(true);

      // Flash light should be removed after 150ms
      vi.advanceTimersByTime(150);
      const hasPointLightAfter = scene.children.some(child => child instanceof THREE.PointLight);
      expect(hasPointLightAfter).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('removePickup', () => {
    it('should remove billboard from scene', () => {
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      const pickup = (weaponPickupSystem as any).pickups.get(id);
      const billboard = pickup.billboard;

      expect(scene.children).toContain(billboard);

      (weaponPickupSystem as any).removePickup(id);

      expect(scene.children).not.toContain(billboard);
    });

    it('should dispose billboard geometry', () => {
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      const pickup = (weaponPickupSystem as any).pickups.get(id);
      const geometry = pickup.billboard.geometry;

      const disposeSpy = vi.spyOn(geometry, 'dispose');

      (weaponPickupSystem as any).removePickup(id);

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should remove pickup from map', () => {
      const id = weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));

      expect((weaponPickupSystem as any).pickups.has(id)).toBe(true);

      (weaponPickupSystem as any).removePickup(id);

      expect((weaponPickupSystem as any).pickups.has(id)).toBe(false);
    });

    it('should handle removing non-existent pickup gracefully', () => {
      expect(() => {
        (weaponPickupSystem as any).removePickup('nonexistent');
      }).not.toThrow();
    });
  });

  describe('setPlayerController', () => {
    it('should store player controller reference', () => {
      const newController = {
        getPosition: vi.fn().mockReturnValue(new THREE.Vector3(5, 5, 5)),
        getVelocity: vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0)),
      } as any;

      weaponPickupSystem.setPlayerController(newController);

      const storedController = (weaponPickupSystem as any).playerController;
      expect(storedController).toBe(newController);
    });
  });

  describe('onWeaponPickup', () => {
    it('should store callback reference', () => {
      const callback = vi.fn();
      weaponPickupSystem.onWeaponPickup(callback);

      const storedCallback = (weaponPickupSystem as any).onWeaponPickedUp;
      expect(storedCallback).toBe(callback);
    });
  });

  describe('dispose', () => {
    it('should remove all pickups from scene', () => {
      weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(5, 0, 5));
      weaponPickupSystem.spawnPickup(WeaponType.SMG, new THREE.Vector3(10, 0, 10));

      const initialChildren = scene.children.length;
      expect(initialChildren).toBeGreaterThan(0);

      weaponPickupSystem.dispose();

      // All pickup billboards should be removed
      expect((weaponPickupSystem as any).pickups.size).toBe(0);
    });

    it('should dispose all pickup geometries', () => {
      weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(5, 0, 5));

      const pickups = Array.from((weaponPickupSystem as any).pickups.values());
      const disposeSpy1 = vi.spyOn(pickups[0].billboard.geometry, 'dispose');
      const disposeSpy2 = vi.spyOn(pickups[1].billboard.geometry, 'dispose');

      weaponPickupSystem.dispose();

      expect(disposeSpy1).toHaveBeenCalled();
      expect(disposeSpy2).toHaveBeenCalled();
    });

    it('should clear pickups map', () => {
      weaponPickupSystem.spawnPickup(WeaponType.RIFLE, new THREE.Vector3(0, 0, 0));
      weaponPickupSystem.spawnPickup(WeaponType.SHOTGUN, new THREE.Vector3(5, 0, 5));

      expect((weaponPickupSystem as any).pickups.size).toBeGreaterThan(0);

      weaponPickupSystem.dispose();

      expect((weaponPickupSystem as any).pickups.size).toBe(0);
    });

    it('should dispose all materials', () => {
      const materials = (weaponPickupSystem as any).materials;
      const rifleMaterialSpy = vi.spyOn(materials.get(WeaponType.RIFLE), 'dispose');
      const shotgunMaterialSpy = vi.spyOn(materials.get(WeaponType.SHOTGUN), 'dispose');
      const smgMaterialSpy = vi.spyOn(materials.get(WeaponType.SMG), 'dispose');

      weaponPickupSystem.dispose();

      expect(rifleMaterialSpy).toHaveBeenCalled();
      expect(shotgunMaterialSpy).toHaveBeenCalled();
      expect(smgMaterialSpy).toHaveBeenCalled();
    });

    it('should clear materials map', () => {
      expect((weaponPickupSystem as any).materials.size).toBe(3);

      weaponPickupSystem.dispose();

      expect((weaponPickupSystem as any).materials.size).toBe(0);
    });

    it('should remove prompt UI element', () => {
      const promptElement = (weaponPickupSystem as any).promptElement;
      promptElement.parentNode = document.body;

      const removeChildSpy = vi.spyOn(document.body, 'removeChild');

      weaponPickupSystem.dispose();

      expect(removeChildSpy).toHaveBeenCalledWith(promptElement);
    });

    it('should handle missing prompt parent gracefully', () => {
      const promptElement = (weaponPickupSystem as any).promptElement;
      promptElement.parentNode = null;

      expect(() => {
        weaponPickupSystem.dispose();
      }).not.toThrow();
    });

    it('should remove keydown event listener', () => {
      const boundHandler = (weaponPickupSystem as any).boundOnKeyDown;

      weaponPickupSystem.dispose();

      expect(window.removeEventListener).toHaveBeenCalledWith('keydown', boundHandler);
    });
  });
});
