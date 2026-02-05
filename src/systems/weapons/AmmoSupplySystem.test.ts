import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { AmmoSupplySystem } from './AmmoSupplySystem';
import { Faction } from '../combat/types';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AmmoSupplySystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let system: AmmoSupplySystem;
  let mockZoneManager: any;
  let mockInventoryManager: any;
  let mockFirstPersonWeapon: any;
  let mockPopupElement: any;

  beforeEach(() => {
    // Create basic THREE.js dependencies
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);

    // Mock DOM element for popup
    mockPopupElement = {
      style: {
        cssText: '',
        display: 'none',
      },
      textContent: '',
      parentNode: null as any,
      remove: vi.fn(),
    };

    // Mock document.body with removeChild capability
    const mockBody = {
      appendChild: vi.fn((el) => {
        el.parentNode = mockBody;
        return el;
      }),
      removeChild: vi.fn(),
    };

    // Mock document.createElement and document.body
    global.document = {
      createElement: vi.fn(() => mockPopupElement),
      body: mockBody,
    } as any;

    // Mock window.setTimeout and window.performance
    global.window = {
      setTimeout: vi.fn((cb, delay) => {
        return setTimeout(cb, delay);
      }) as any,
    } as any;

    // Mock performance.now
    global.performance = {
      now: vi.fn(() => Date.now()),
    } as any;

    // Mock ZoneManager
    mockZoneManager = {
      getAllZones: vi.fn().mockReturnValue([]),
    };

    // Mock InventoryManager
    mockInventoryManager = {
      getState: vi.fn().mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      }),
      addGrenades: vi.fn(),
      addSandbags: vi.fn(),
    };

    // Mock FirstPersonWeapon
    mockFirstPersonWeapon = {
      getAmmoState: vi.fn().mockReturnValue({
        currentMagazine: 0,
        maxMagazine: 30,
        reserveAmmo: 0,
        maxReserve: 90,
      }),
    };

    // Create system
    system = new AmmoSupplySystem(scene, camera);
  });

  afterEach(() => {
    if (system) {
      system.dispose();
    }
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize correctly', async () => {
      await system.init();
      expect(system).toBeDefined();
    });

    it('should create popup element on init', async () => {
      await system.init();
      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    it('should set dependencies via setters', () => {
      system.setZoneManager(mockZoneManager);
      system.setInventoryManager(mockInventoryManager);
      system.setFirstPersonWeapon(mockFirstPersonWeapon);

      // Should not throw
      expect(() => system.update(0.016)).not.toThrow();
    });
  });

  describe('Crate Creation', () => {
    let friendlyZone: any;

    beforeEach(() => {
      friendlyZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(10, 0, 10),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([friendlyZone]);
      system.setZoneManager(mockZoneManager);
    });

    it('should create crate for friendly zone', async () => {
      await system.init();
      system.update(0.016);

      // Check that a crate mesh was added to scene
      const crateGroups = scene.children.filter(
        (child) => child instanceof THREE.Group
      );
      expect(crateGroups.length).toBe(1);
    });

    it('should create crate with box geometry', async () => {
      await system.init();
      system.update(0.016);

      const crateGroup = scene.children[0] as THREE.Group;
      const boxMesh = crateGroup.children.find(
        (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry
      );
      expect(boxMesh).toBeDefined();
    });

    it('should create crate with yellow stripe markings', async () => {
      await system.init();
      system.update(0.016);

      const crateGroup = scene.children[0] as THREE.Group;
      const stripes = crateGroup.children.filter((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          return child.material.color.getHex() === 0xffff00;
        }
        return false;
      });
      expect(stripes.length).toBeGreaterThanOrEqual(2);
    });

    it('should create crate with glow mesh', async () => {
      await system.init();
      system.update(0.016);

      const crateGroup = scene.children[0] as THREE.Group;
      const glowMesh = crateGroup.children.find((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          return child.material.transparent === true && child.material.side === THREE.BackSide;
        }
        return false;
      });
      expect(glowMesh).toBeDefined();
    });

    it('should not create crate for enemy zone', async () => {
      friendlyZone.owner = Faction.OPFOR;
      await system.init();
      system.update(0.016);

      // Crate should exist but be invisible
      const crateGroup = scene.children[0] as THREE.Group;
      expect(crateGroup.visible).toBe(false);
    });

    it('should position crate at zone position', async () => {
      await system.init();
      system.update(0.016);

      const crateGroup = scene.children[0] as THREE.Group;
      expect(crateGroup.position.x).toBe(friendlyZone.position.x);
      expect(crateGroup.position.z).toBe(friendlyZone.position.z);
    });
  });

  describe('Zone Ownership Changes', () => {
    let zone: any;

    beforeEach(() => {
      zone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(10, 0, 10),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([zone]);
      system.setZoneManager(mockZoneManager);
    });

    it('should show crate when zone is captured by friendly', async () => {
      zone.owner = Faction.OPFOR;
      await system.init();
      system.update(0.016);

      const crateGroup = scene.children[0] as THREE.Group;
      expect(crateGroup.visible).toBe(false);

      // Capture zone
      zone.owner = Faction.US;
      system.update(0.016);

      expect(crateGroup.visible).toBe(true);
    });

    it('should hide crate when zone is captured by enemy', async () => {
      zone.owner = Faction.US;
      await system.init();
      system.update(0.016);

      const crateGroup = scene.children[0] as THREE.Group;
      expect(crateGroup.visible).toBe(true);

      // Lose zone
      zone.owner = Faction.OPFOR;
      system.update(0.016);

      expect(crateGroup.visible).toBe(false);
    });
  });

  describe('Proximity-based Resupply', () => {
    let friendlyZone: any;

    beforeEach(async () => {
      friendlyZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(0, 0, 0),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([friendlyZone]);
      system.setZoneManager(mockZoneManager);
      system.setInventoryManager(mockInventoryManager);
      system.setFirstPersonWeapon(mockFirstPersonWeapon);

      await system.init();
      system.update(0.016); // Create the crate
    });

    it('should resupply when player is in proximity range', () => {
      // Position camera within proximity range (5.0)
      camera.position.set(0, 0, 3);

      // Player needs supplies
      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });
      mockFirstPersonWeapon.getAmmoState.mockReturnValue({
        currentMagazine: 0,
        maxMagazine: 30,
        reserveAmmo: 0,
        maxReserve: 90,
      });

      system.update(0.016);

      expect(mockInventoryManager.addGrenades).toHaveBeenCalledWith(3);
      expect(mockInventoryManager.addSandbags).toHaveBeenCalledWith(5);
    });

    it('should not resupply when player is out of range', () => {
      // Position camera outside proximity range
      camera.position.set(0, 0, 10);

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      system.update(0.016);

      expect(mockInventoryManager.addGrenades).not.toHaveBeenCalled();
      expect(mockInventoryManager.addSandbags).not.toHaveBeenCalled();
    });

    it('should not resupply when player is already fully supplied', () => {
      camera.position.set(0, 0, 3);

      // Player already has full supplies
      mockInventoryManager.getState.mockReturnValue({
        grenades: 5,
        maxGrenades: 5,
        sandbags: 10,
        maxSandbags: 10,
      });
      mockFirstPersonWeapon.getAmmoState.mockReturnValue({
        currentMagazine: 30,
        maxMagazine: 30,
        reserveAmmo: 90,
        maxReserve: 90,
      });

      system.update(0.016);

      expect(mockInventoryManager.addGrenades).not.toHaveBeenCalled();
      expect(mockInventoryManager.addSandbags).not.toHaveBeenCalled();
    });

    it('should resupply only grenades when only grenades needed', () => {
      camera.position.set(0, 0, 3);

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 10, // Already full
        maxSandbags: 10,
      });
      mockFirstPersonWeapon.getAmmoState.mockReturnValue({
        currentMagazine: 30, // Already full
        maxMagazine: 30,
        reserveAmmo: 90,
        maxReserve: 90,
      });

      system.update(0.016);

      expect(mockInventoryManager.addGrenades).toHaveBeenCalledWith(3);
      expect(mockInventoryManager.addSandbags).not.toHaveBeenCalled();
    });

    it('should resupply only sandbags when only sandbags needed', () => {
      camera.position.set(0, 0, 3);

      mockInventoryManager.getState.mockReturnValue({
        grenades: 5, // Already full
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });
      mockFirstPersonWeapon.getAmmoState.mockReturnValue({
        currentMagazine: 30, // Already full
        maxMagazine: 30,
        reserveAmmo: 90,
        maxReserve: 90,
      });

      system.update(0.016);

      expect(mockInventoryManager.addGrenades).not.toHaveBeenCalled();
      expect(mockInventoryManager.addSandbags).toHaveBeenCalledWith(5);
    });
  });

  describe('Resupply Cooldown', () => {
    let friendlyZone: any;

    beforeEach(async () => {
      friendlyZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(0, 0, 0),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([friendlyZone]);
      system.setZoneManager(mockZoneManager);
      system.setInventoryManager(mockInventoryManager);
      system.setFirstPersonWeapon(mockFirstPersonWeapon);

      await system.init();
      system.update(0.016);
    });

    it('should apply cooldown after resupply', () => {
      camera.position.set(0, 0, 3);

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      // First resupply
      system.update(0.016);
      expect(mockInventoryManager.addGrenades).toHaveBeenCalledTimes(1);

      // Immediate second update should not resupply due to cooldown
      vi.clearAllMocks();
      system.update(0.016);
      expect(mockInventoryManager.addGrenades).not.toHaveBeenCalled();
    });

    it('should allow resupply after cooldown expires', () => {
      camera.position.set(0, 0, 3);

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      // First resupply
      system.update(0.016);
      expect(mockInventoryManager.addGrenades).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();

      // Simulate cooldown expiration (30 seconds + small buffer)
      const now = performance.now() / 1000;
      vi.spyOn(performance, 'now').mockReturnValue((now + 31) * 1000);

      // Should resupply again after cooldown
      system.update(0.016);
      expect(mockInventoryManager.addGrenades).toHaveBeenCalledTimes(1);
    });

    it('should update cooldowns on each update', () => {
      camera.position.set(0, 0, 3);

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      // Trigger resupply
      system.update(0.016);

      // Update multiple times
      for (let i = 0; i < 10; i++) {
        system.update(0.016);
      }

      // Should not crash
      expect(() => system.update(0.016)).not.toThrow();
    });
  });

  describe('Glow Effects', () => {
    let friendlyZone: any;
    let glowMaterial: THREE.MeshBasicMaterial;

    beforeEach(async () => {
      friendlyZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(0, 0, 0),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([friendlyZone]);
      system.setZoneManager(mockZoneManager);
      system.setInventoryManager(mockInventoryManager);
      system.setFirstPersonWeapon(mockFirstPersonWeapon);

      await system.init();
      system.update(0.016);

      // Find glow mesh
      const crateGroup = scene.children[0] as THREE.Group;
      const glowMesh = crateGroup.children.find((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          return child.material.transparent === true;
        }
        return false;
      }) as THREE.Mesh;

      glowMaterial = glowMesh.material as THREE.MeshBasicMaterial;
    });

    it('should pulse glow when out of range', () => {
      camera.position.set(0, 0, 10); // Out of range

      const opacities: number[] = [];
      for (let i = 0; i < 10; i++) {
        system.update(0.1);
        opacities.push(glowMaterial.opacity);
      }

      // Should have varying opacity (pulsing)
      const minOpacity = Math.min(...opacities);
      const maxOpacity = Math.max(...opacities);
      expect(maxOpacity).toBeGreaterThan(minOpacity);
    });

    it('should show bright green glow when in range and ready', () => {
      camera.position.set(0, 0, 3); // In range

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      system.update(0.016);

      expect(glowMaterial.color.getHex()).toBe(0x00ff00);
      expect(glowMaterial.opacity).toBeGreaterThan(0.3);
    });

    it('should show red glow when in range but on cooldown', () => {
      camera.position.set(0, 0, 3);

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      // Trigger resupply to start cooldown
      system.update(0.016);

      // Move away and come back (to reset proximity state)
      camera.position.set(0, 0, 10);
      system.update(0.016);
      camera.position.set(0, 0, 3);
      system.update(0.016);

      expect(glowMaterial.color.getHex()).toBe(0xff0000);
    });
  });

  describe('Popup UI', () => {
    let friendlyZone: any;

    beforeEach(async () => {
      friendlyZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(0, 0, 0),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([friendlyZone]);
      system.setZoneManager(mockZoneManager);
      system.setInventoryManager(mockInventoryManager);
      system.setFirstPersonWeapon(mockFirstPersonWeapon);

      await system.init();
      system.update(0.016);
    });

    it('should show popup when resupplied', () => {
      camera.position.set(0, 0, 3);

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      system.update(0.016);

      // Check popup element
      const popup = (system as any).popupElement as HTMLDivElement;
      expect(popup.style.display).toBe('block');
      expect(popup.textContent).toContain('GRENADES');
      expect(popup.textContent).toContain('SANDBAGS');
    });

    it('should hide popup after timeout', () => {
      vi.useFakeTimers();

      camera.position.set(0, 0, 3);
      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      system.update(0.016);

      const popup = (system as any).popupElement as HTMLDivElement;
      expect(popup.style.display).toBe('block');

      // Fast-forward 2 seconds
      vi.advanceTimersByTime(2000);

      expect(popup.style.display).toBe('none');

      vi.useRealTimers();
    });

    it('should clear existing timeout when showing new popup', () => {
      vi.useFakeTimers();

      camera.position.set(0, 0, 3);
      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      // First popup
      system.update(0.016);

      // Move away and come back after cooldown
      const now = performance.now() / 1000;
      vi.spyOn(performance, 'now').mockReturnValue((now + 31) * 1000);
      camera.position.set(0, 0, 10);
      system.update(0.016);
      camera.position.set(0, 0, 3);

      // Second popup (should clear first timeout)
      system.update(0.016);

      const popup = (system as any).popupElement as HTMLDivElement;
      expect(popup.style.display).toBe('block');

      vi.useRealTimers();
    });
  });

  describe('Dispose', () => {
    let friendlyZone: any;

    beforeEach(async () => {
      friendlyZone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(0, 0, 0),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([friendlyZone]);
      system.setZoneManager(mockZoneManager);

      await system.init();
      system.update(0.016);
    });

    it('should remove all crate meshes from scene', () => {
      expect(scene.children.length).toBeGreaterThan(0);

      system.dispose();

      expect(scene.children.length).toBe(0);
    });

    it('should dispose all crate geometries', () => {
      const crateGroup = scene.children[0] as THREE.Group;
      const disposeSpy = vi.fn();

      crateGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose = disposeSpy;
        }
      });

      system.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should dispose all crate materials', () => {
      const crateGroup = scene.children[0] as THREE.Group;
      const disposeSpy = vi.fn();

      crateGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose = disposeSpy;
          }
        }
      });

      system.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should remove popup element', () => {
      const popup = (system as any).popupElement as HTMLDivElement;
      const removeSpy = vi.spyOn(popup, 'remove');

      // Manually add to DOM for test
      popup.remove = removeSpy;
      Object.defineProperty(popup, 'parentNode', {
        value: document.body,
        writable: true,
      });

      system.dispose();

      // Should attempt to remove popup
      expect(() => system.dispose()).not.toThrow();
    });

    it('should clear crates map', () => {
      const crates = (system as any).crates as Map<string, any>;
      expect(crates.size).toBeGreaterThan(0);

      system.dispose();

      expect(crates.size).toBe(0);
    });
  });

  describe('Update without dependencies', () => {
    it('should not crash when zone manager is not set', async () => {
      await system.init();
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should not crash when inventory manager is not set', async () => {
      mockZoneManager.getAllZones.mockReturnValue([
        {
          id: 'zone1',
          name: 'Alpha',
          position: new THREE.Vector3(0, 0, 0),
          owner: Faction.US,
        },
      ]);

      system.setZoneManager(mockZoneManager);
      await system.init();

      camera.position.set(0, 0, 3);
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should not crash when weapon is not set', async () => {
      mockZoneManager.getAllZones.mockReturnValue([
        {
          id: 'zone1',
          name: 'Alpha',
          position: new THREE.Vector3(0, 0, 0),
          owner: Faction.US,
        },
      ]);

      system.setZoneManager(mockZoneManager);
      system.setInventoryManager(mockInventoryManager);
      await system.init();

      camera.position.set(0, 0, 3);
      expect(() => system.update(0.016)).not.toThrow();
    });
  });

  describe('Multiple zones', () => {
    beforeEach(async () => {
      const zones = [
        {
          id: 'zone1',
          name: 'Alpha',
          position: new THREE.Vector3(0, 0, 0),
          owner: Faction.US,
        },
        {
          id: 'zone2',
          name: 'Bravo',
          position: new THREE.Vector3(50, 0, 0),
          owner: Faction.US,
        },
        {
          id: 'zone3',
          name: 'Charlie',
          position: new THREE.Vector3(100, 0, 0),
          owner: Faction.OPFOR,
        },
      ];

      mockZoneManager.getAllZones.mockReturnValue(zones);
      system.setZoneManager(mockZoneManager);
      system.setInventoryManager(mockInventoryManager);
      system.setFirstPersonWeapon(mockFirstPersonWeapon);

      await system.init();
      system.update(0.016);
    });

    it('should create crates for all zones', () => {
      const crateGroups = scene.children.filter(
        (child) => child instanceof THREE.Group
      );
      expect(crateGroups.length).toBe(3);
    });

    it('should only show crates for friendly zones', () => {
      const visibleCrates = scene.children.filter(
        (child) => child instanceof THREE.Group && child.visible
      );
      expect(visibleCrates.length).toBe(2); // zone1 and zone2
    });

    it('should resupply from nearest crate in range', () => {
      camera.position.set(0, 0, 3); // Near zone1

      mockInventoryManager.getState.mockReturnValue({
        grenades: 0,
        maxGrenades: 5,
        sandbags: 0,
        maxSandbags: 10,
      });

      system.update(0.016);

      expect(mockInventoryManager.addGrenades).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle zone position changes', async () => {
      const zone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(0, 0, 0),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([zone]);
      system.setZoneManager(mockZoneManager);

      await system.init();
      system.update(0.016);

      const crateGroup = scene.children[0] as THREE.Group;
      expect(crateGroup.position.x).toBe(0);

      // Change zone position
      zone.position.set(20, 0, 20);
      system.update(0.016);

      expect(crateGroup.position.x).toBe(20);
      expect(crateGroup.position.z).toBe(20);
    });

    it('should handle partial ammo needs', () => {
      const zone = {
        id: 'zone1',
        name: 'Alpha',
        position: new THREE.Vector3(0, 0, 0),
        owner: Faction.US,
      };

      mockZoneManager.getAllZones.mockReturnValue([zone]);
      system.setZoneManager(mockZoneManager);
      system.setInventoryManager(mockInventoryManager);
      system.setFirstPersonWeapon(mockFirstPersonWeapon);

      camera.position.set(0, 0, 3);

      // Player has partial ammo
      mockFirstPersonWeapon.getAmmoState.mockReturnValue({
        currentMagazine: 15, // Half magazine
        maxMagazine: 30,
        reserveAmmo: 30, // Some reserve
        maxReserve: 90,
      });

      mockInventoryManager.getState.mockReturnValue({
        grenades: 5, // Full
        maxGrenades: 5,
        sandbags: 5, // Half
        maxSandbags: 10,
      });

      system.update(0.016);

      // Should only resupply sandbags
      expect(mockInventoryManager.addGrenades).not.toHaveBeenCalled();
      expect(mockInventoryManager.addSandbags).toHaveBeenCalledWith(5);
    });
  });
});
