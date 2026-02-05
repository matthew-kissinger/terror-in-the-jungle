import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { AmmoSupplySystem } from './AmmoSupplySystem';
import { ZoneManager, CaptureZone } from '../world/ZoneManager';
import { InventoryManager } from '../player/InventoryManager';
import { FirstPersonWeapon } from '../player/FirstPersonWeapon';
import { Faction } from '../combat/types';
import { Logger } from '../../utils/Logger';

// Mock Logger to prevent console output during tests
vi.spyOn(Logger, 'info').mockImplementation(() => { });

// Mock performance.now() for time-based tests
let mockPerformanceTime = 0;
vi.spyOn(performance, "now").mockImplementation(() => mockPerformanceTime);

// Mock window.setTimeout and clearTimeout
const mockSetTimeout = vi.fn((callback: Function, ms?: number) => {
  return Symbol(); // Return a unique ID
});
const mockClearTimeout = vi.fn((id: Symbol) => { });

const mockDiv = {
  style: {},
  textContent: '',
  parentNode: null,
  appendChild: vi.fn(),
  removeChild: vi.fn(),
};

const mockBody = {
  appendChild: vi.fn(),
  removeChild: vi.fn(),
};

vi.stubGlobal('window', {
  setTimeout: mockSetTimeout,
  clearTimeout: mockClearTimeout,
});

vi.stubGlobal('document', {
  createElement: vi.fn((tagName: string) => {
    if (tagName === 'div') {
      return mockDiv;
    }
    return { style: {}, textContent: '', parentNode: null };
  }),
  body: mockBody,
});


describe('AmmoSupplySystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let ammoSupplySystem: AmmoSupplySystem;
  let mockZoneManager: ZoneManager;
  let mockInventoryManager: InventoryManager;
  let mockFirstPersonWeapon: FirstPersonWeapon;
  let mockCaptureZoneUS: CaptureZone;
  let mockCaptureZoneENEMY: CaptureZone;

  const CRATE_SIZE = 1.5;
  const PROXIMITY_RANGE = 5.0;
  const RESUPPLY_COOLDOWN_SECONDS = 30; // Matches system constant
  const GRENADE_REFILL_AMOUNT = 3;
  const SANDBAG_REFILL_AMOUNT = 5;

  beforeEach(() => {
    // Reset mocks and state before each test
    vi.clearAllMocks();
    mockPerformanceTime = 0;

    // Reset mockDiv and mockBody state
    mockDiv.style = {};
    mockDiv.textContent = '';
    mockDiv.parentNode = null;
    mockDiv.appendChild.mockClear();
    mockDiv.removeChild.mockClear();
    mockBody.appendChild.mockClear();
    mockBody.removeChild.mockClear();

    // Mock THREE.Scene
    scene = new THREE.Scene();
    vi.spyOn(scene, 'add');
    vi.spyOn(scene, 'remove');

    // Mock THREE.Camera
    camera = new THREE.PerspectiveCamera();
    // Directly assign a mock function to getWorldPosition
    camera.getWorldPosition = vi.fn((target: THREE.Vector3) => {
      target.set(0, 0, 0); // Default player position
      return target;
    });

    // Mock Three.js object dispose methods
    vi.spyOn(THREE.BoxGeometry.prototype, 'dispose').mockImplementation(() => { });
    vi.spyOn(THREE.MeshStandardMaterial.prototype, 'dispose').mockImplementation(() => { });
    vi.spyOn(THREE.MeshBasicMaterial.prototype, 'dispose').mockImplementation(() => { });

  afterEach(() => {
    // Clean up created meshes if any to prevent memory leaks in test environment
    ammoSupplySystem.dispose();
  });

  it('should initialize correctly', async () => {
    await ammoSupplySystem.init();
    expect(Logger.info).toHaveBeenCalledWith('weapons', 'Initializing Ammo Supply System...');
    expect(document.createElement).toHaveBeenCalledWith('div');
    expect(document.body.appendChild).toHaveBeenCalled();
  });

  it('should create ammo crates for friendly zones on first update', () => {
    ammoSupplySystem.update(0); // Initial update to create crates

    // Expect one crate for the US-owned zone
    expect(scene.add).toHaveBeenCalledTimes(1); // Only for mockCaptureZoneUS
    const addedObject = (scene.add as vi.Mock).mock.calls[0][0];
    expect(addedObject).toBeInstanceOf(THREE.Group);
    expect(addedObject.position.y).toBeCloseTo(CRATE_SIZE / 2); // Should be elevated
    expect(addedObject.position.x).toBeCloseTo(mockCaptureZoneUS.position.x);
    expect(addedObject.position.z).toBeCloseTo(mockCaptureZoneUS.position.z);

    // Enemy zone should not have a visible crate
    // No scene.add for the enemy zone
    expect(mockZoneManager.getAllZones).toHaveBeenCalled();
    // Verify that the crate for the US zone is active and visible, enemy zone not
    // Directly inspecting private `crates` map
    const crates = (ammoSupplySystem as any).crates;
    expect(crates.size).toBe(1);
    expect(crates.get(mockCaptureZoneUS.id).isActive).toBe(true);
    expect(crates.get(mockCaptureZoneUS.id).mesh.visible).toBe(true);
  });

  it('should not create crates for enemy zones', () => {
    // Change US zone to ENEMY and ENEMY zone to US to test both scenarios
    mockCaptureZoneUS.owner = Faction.ENEMY;
    mockCaptureZoneENEMY.owner = Faction.US;
    mockCaptureZoneUS.position.set(100, 0, 100);
    mockCaptureZoneENEMY.position.set(200, 0, 200);

    ammoSupplySystem.update(0);

    expect(scene.add).toHaveBeenCalledTimes(1); // Only for mockCaptureZoneENEMY
    const addedObject = (scene.add as vi.Mock).mock.calls[0][0];
    expect(addedObject.position.x).toBeCloseTo(mockCaptureZoneENEMY.position.x);

    const crates = (ammoSupplySystem as any).crates;
    expect(crates.size).toBe(1);
    expect(crates.get(mockCaptureZoneENEMY.id).isActive).toBe(true);
    expect(crates.get(mockCaptureZoneENEMY.id).mesh.visible).toBe(true);
    expect(crates.get(mockCaptureZoneUS.id)).toBeUndefined(); // No crate for US (now enemy) zone
  });


  it('should update crate visibility based on zone ownership changes', () => {
    ammoSupplySystem.update(0); // Initial update, US zone crate created and visible
    let crates = (ammoSupplySystem as any).crates;
    expect(crates.get(mockCaptureZoneUS.id).mesh.visible).toBe(true);

    // Change US zone owner to ENEMY
    mockCaptureZoneUS.owner = Faction.ENEMY;
    ammoSupplySystem.update(0); // Update system
    expect(crates.get(mockCaptureZoneUS.id).mesh.visible).toBe(false); // Should be hidden

    // Change US zone owner back to US
    mockCaptureZoneUS.owner = Faction.US;
    ammoSupplySystem.update(0); // Update system
    expect(crates.get(mockCaptureZoneUS.id).mesh.visible).toBe(true); // Should be visible again
  });

  it('should update crate position to match zone position', () => {
    ammoSupplySystem.update(0); // Create crate
    let crates = (ammoSupplySystem as any).crates;
    const crate = crates.get(mockCaptureZoneUS.id);
    expect(crate.mesh.position.x).toBeCloseTo(mockCaptureZoneUS.position.x);

    // Change zone position
    mockCaptureZoneUS.position.set(20, 5, 20);
    ammoSupplySystem.update(0);
    expect(crate.mesh.position.x).toBeCloseTo(mockCaptureZoneUS.position.x);
    expect(crate.mesh.position.y).toBeCloseTo(mockCaptureZoneUS.position.y + CRATE_SIZE / 2); // Still elevated
    expect(crate.mesh.position.z).toBeCloseTo(mockCaptureZoneUS.position.z);
  });

  it('should dispose of all crate meshes and the popup element', () => {
    ammoSupplySystem.update(0); // Create some crates
    expect(scene.add).toHaveBeenCalled();

    const crates = (ammoSupplySystem as any).crates;
    const crateMesh = crates.get(mockCaptureZoneUS.id).mesh;
    const glowMesh = crates.get(mockCaptureZoneUS.id).glowMesh;

    // Spy on dispose methods of geometry and material
    const boxGeometryDisposeSpy = vi.spyOn(crateMesh.children[0].geometry, 'dispose');
    const boxMaterialDisposeSpy = vi.spyOn(crateMesh.children[0].material, 'dispose');
    const glowGeometryDisposeSpy = vi.spyOn(glowMesh.geometry, 'dispose');
    const glowMaterialDisposeSpy = vi.spyOn(glowMesh.material, 'dispose');

    ammoSupplySystem.dispose();

    expect(scene.remove).toHaveBeenCalledWith(crateMesh);
    expect(boxGeometryDisposeSpy).toHaveBeenCalled();
    expect(boxMaterialDisposeSpy).toHaveBeenCalled();
    expect(glowGeometryDisposeSpy).toHaveBeenCalled();
    expect(glowMaterialDisposeSpy).toHaveBeenCalled();

    expect(document.body.removeChild).toHaveBeenCalledWith((ammoSupplySystem as any).popupElement);
    expect((ammoSupplySystem as any).crates.size).toBe(0);
    expect(Logger.info).toHaveBeenCalledWith('weapons', 'Ammo Supply System disposed');
  });

  describe('Proximity and Resupply Logic', () => {
    let playerPosition: THREE.Vector3;
    let usCratePosition: THREE.Vector3;

    beforeEach(() => {
      // Ensure crate is created and active
      ammoSupplySystem.update(0);
      playerPosition = (camera.getWorldPosition as vi.Mock).mock.results[0].value;
      usCratePosition = mockCaptureZoneUS.position;

      // Ensure initial player inventory/ammo is low
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
    });

    it('should not resupply if player is out of range', () => {
      playerPosition.set(100, 0, 100); // Far away from crate
      ammoSupplySystem.update(0);

      expect(mockInventoryManager.addGrenades).not.toHaveBeenCalled();
      expect(mockInventoryManager.addSandbags).not.toHaveBeenCalled();
      // Ammo resupply is indirect, so we check Grenades/Sandbags as direct side effects
    });

    it('should resupply if player is in range and not on cooldown', () => {
      playerPosition.copy(usCratePosition).add(new THREE.Vector3(1, 0, 1)); // In range
      expect(playerPosition.distanceTo(usCratePosition)).toBeLessThan(PROXIMITY_RANGE);

      ammoSupplySystem.update(0); // Trigger resupply
      expect(mockInventoryManager.addGrenades).toHaveBeenCalledWith(GRENADE_REFILL_AMOUNT);
      expect(mockInventoryManager.addSandbags).toHaveBeenCalledWith(SANDBAG_REFILL_AMOUNT);
      expect(mockSetTimeout).toHaveBeenCalled(); // Popup should be shown
      expect(Logger.info).toHaveBeenCalledWith('weapons', expect.stringContaining('Resupplied at Alpha'));

      // Check cooldown is set (private access for verification)
      const crates = (ammoSupplySystem as any).crates;
      const crate = crates.get(mockCaptureZoneUS.id);
      expect(crate.playerCooldowns.get('player')).toBeCloseTo(mockPerformanceTime / 1000 + RESUPPLY_COOLDOWN_SECONDS);
    });

    it('should not resupply if player is on cooldown', () => {
      playerPosition.copy(usCratePosition); // In range
      ammoSupplySystem.update(0); // First resupply, sets cooldown

      mockPerformanceTime += (RESUPPLY_COOLDOWN_SECONDS - 5) * 1000; // Advance time, but still on cooldown
      vi.clearAllMocks(); // Clear previous resupply calls

      ammoSupplySystem.update(0); // Try to resupply again
      expect(mockInventoryManager.addGrenades).not.toHaveBeenCalled();
      expect(mockInventoryManager.addSandbags).not.toHaveBeenCalled();
      expect(mockSetTimeout).not.toHaveBeenCalled(); // No popup
    });

    it('should resupply again after cooldown expires', () => {
      playerPosition.copy(usCratePosition); // In range
      ammoSupplySystem.update(0); // First resupply, sets cooldown

      mockPerformanceTime += (RESUPPLY_COOLDOWN_SECONDS + 1) * 1000; // Advance time past cooldown
      vi.clearAllMocks(); // Clear previous resupply calls

      ammoSupplySystem.update(0); // Try to resupply again
      expect(mockInventoryManager.addGrenades).toHaveBeenCalledWith(GRENADE_REFILL_AMOUNT);
      expect(mockInventoryManager.addSandbags).toHaveBeenCalledWith(SANDBAG_REFILL_AMOUNT);
      expect(mockSetTimeout).toHaveBeenCalled(); // New popup
    });

    it('should not resupply if player is already fully supplied', () => {
      playerPosition.copy(usCratePosition); // In range

      // Mock managers to return full state
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

      ammoSupplySystem.update(0);
      expect(mockInventoryManager.addGrenades).not.toHaveBeenCalled();
      expect(mockInventoryManager.addSandbags).not.toHaveBeenCalled();
      expect(mockSetTimeout).not.toHaveBeenCalled(); // No popup
      expect(Logger.info).not.toHaveBeenCalledWith('weapons', expect.stringContaining('Resupplied at Alpha'));
    });

    it('should show popup with correct items when resupplying', () => {
      playerPosition.copy(usCratePosition); // In range

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

      // Test all items
      ammoSupplySystem.update(0);
      expect((document.createElement as vi.Mock).mock.results[0].value.textContent).toBe('+AMMO + GRENADES + SANDBAGS');
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);

      // Test only grenades
      mockPerformanceTime += (RESUPPLY_COOLDOWN_SECONDS + 1) * 1000; // Advance time past cooldown
      vi.clearAllMocks();
      mockFirstPersonWeapon.getAmmoState.mockReturnValue({ // Full ammo
        currentMagazine: 30, maxMagazine: 30, reserveAmmo: 90, maxReserve: 90,
      });
      ammoSupplySystem.update(0);
      expect((document.createElement as vi.Mock).mock.results[0].value.textContent).toBe('+GRENADES + SANDBAGS');

      // Test only sandbags
      mockPerformanceTime += (RESUPPLY_COOLDOWN_SECONDS + 1) * 1000; // Advance time past cooldown
      vi.clearAllMocks();
      mockInventoryManager.getState.mockReturnValue({ // Full grenades
        grenades: 5, maxGrenades: 5, sandbags: 0, maxSandbags: 10,
      });
      ammoSupplySystem.update(0);
      expect((document.createElement as vi.Mock).mock.results[0].value.textContent).toBe('+AMMO + SANDBAGS');
    });

    it('should update glow opacity based on proximity and cooldown', () => {
      // Ensure initial crate
      ammoSupplySystem.update(0);
      const crates = (ammoSupplySystem as any).crates;
      const crate = crates.get(mockCaptureZoneUS.id);
      const glowMaterial = crate.glowMesh.material as THREE.MeshBasicMaterial;

      // Far away, normal glow
      playerPosition.set(100, 0, 100);
      mockPerformanceTime = 0;
      ammoSupplySystem.update(0);
      // Opacity should be pulsing around 0.3 + sin(0) * 0.2 = 0.3
      expect(glowMaterial.opacity).toBeCloseTo(0.3);
      expect(glowMaterial.color.getHex()).toBe(0x00ff00);

      // In range, ready for resupply (bright pulsing green)
      playerPosition.copy(usCratePosition);
      mockPerformanceTime = 500; // advance time for glow calculation
      ammoSupplySystem.update(0);
      // Opacity should be pulsing around 0.5 + sin(glowTime*2*GLOW_PULSE_SPEED) * 0.3
      // glowTime = 0.5, GLOW_PULSE_SPEED = 2.0. sin(0.5*2*2) = sin(2) ~ 0.9
      // opacity = 0.5 + 0.9 * 0.3 = 0.77
      expect(glowMaterial.opacity).toBeGreaterThan(0.5);
      expect(glowMaterial.color.getHex()).toBe(0x00ff00);

      // Trigger resupply to go on cooldown
      ammoSupplySystem.update(0); // This will happen at mockPerformanceTime=500
      expect(crate.playerCooldowns.get('player')).toBeCloseTo(0.5 + RESUPPLY_COOLDOWN_SECONDS);

      // In range, on cooldown (dim red glow)
      mockPerformanceTime = (RESUPPLY_COOLDOWN_SECONDS - 5) * 1000; // Still on cooldown
      ammoSupplySystem.update(0);
      expect(glowMaterial.opacity).toBeCloseTo(0.2);
      expect(glowMaterial.color.getHex()).toBe(0xff0000);

      // In range, cooldown expired (back to bright pulsing green)
      mockPerformanceTime = (RESUPPLY_COOLDOWN_SECONDS + 1) * 1000;
      ammoSupplySystem.update(0);
      expect(glowMaterial.opacity).toBeGreaterThan(0.5); // Back to bright pulse
      expect(glowMaterial.color.getHex()).toBe(0x00ff00);
    });
  });
});
