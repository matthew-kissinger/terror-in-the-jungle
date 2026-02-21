import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { PlayerRespawnManager } from './PlayerRespawnManager';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { PlayerHealthSystem } from './PlayerHealthSystem';
import { GameModeManager } from '../world/GameModeManager';
import { InventoryManager } from './InventoryManager';
import { Faction } from '../combat/types';
import { RespawnUI } from './RespawnUI';
import { RespawnMapController } from './RespawnMapController';
import { GameMode } from '../../config/gameModes';

// Mock browser globals for Node.js environment
if (typeof document === 'undefined') {
  class MockEventTarget {
    listeners: Record<string, Function[]> = {};
    addEventListener(type: string, callback: Function) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(callback);
    }
    removeEventListener(type: string, callback: Function) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter(l => l !== callback);
    }
  }

  class MockElement extends MockEventTarget {
    parentNode: any = null;
    children: any[] = [];
    style: any = {};
    innerHTML: string = '';
    textContent: string = '';
    className: string = '';
    id: string = '';
    width: number = 0;
    height: number = 0;
    classList: {
      add: (className: string) => void;
      remove: (className: string) => void;
      contains: (className: string) => boolean;
    };

    constructor() {
      super();
      const classes = new Set<string>();
      this.classList = {
        add: (className: string) => { classes.add(className); },
        remove: (className: string) => { classes.delete(className); },
        contains: (className: string) => classes.has(className),
      };
    }

    appendChild(child: any) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }

    removeChild(child: any) {
      const index = this.children.indexOf(child);
      if (index > -1) {
        this.children.splice(index, 1);
        child.parentNode = null;
      }
      return child;
    }

    querySelector(selector: string) {
      return new MockElement();
    }

    querySelectorAll(selector: string) {
      return [new MockElement()];
    }

    setAttribute(name: string, value: string) {}
    getAttribute(name: string) { return ''; }

    // Canvas-specific method
    getContext(type: string) {
      return {
        fillStyle: '',
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 0 })),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        drawImage: vi.fn(),
      };
    }
  }

  const doc = new MockEventTarget() as any;
  doc.body = new MockElement();
  doc.head = new MockElement();
  doc.createElement = (tag: string) => new MockElement();
  doc.getElementById = (id: string) => new MockElement();

  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new MockEventTarget());
}

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock HeightQueryCache
vi.mock('../terrain/HeightQueryCache', () => ({
  getHeightQueryCache: vi.fn(() => ({
    getHeightAt: vi.fn((x: number, z: number) => 0),
  })),
}));

// Helper to create mock zones
function createMockZone(
  id: string,
  name: string,
  position: THREE.Vector3,
  state: ZoneState = ZoneState.NEUTRAL,
  isHomeBase = false,
  owner: Faction = Faction.NONE
) {
  return {
    id,
    name,
    position: position.clone(),
    state,
    isHomeBase,
    owner,
    radius: 50,
  };
}

describe('PlayerRespawnManager', () => {
  let respawnManager: PlayerRespawnManager;
  let mockScene: THREE.Scene;
  let mockCamera: THREE.Camera;
  let mockRespawnUI: RespawnUI;
  let mockMapController: RespawnMapController;
  let mockZoneManager: ZoneManager;
  let mockPlayerHealthSystem: PlayerHealthSystem;
  let mockGameModeManager: GameModeManager;
  let mockPlayerController: any;
  let mockFirstPersonWeapon: any;
  let mockInventoryManager: InventoryManager;

  beforeEach(() => {
    mockScene = new THREE.Scene();
    mockCamera = new THREE.PerspectiveCamera();

    // Create actual instance first
    respawnManager = new PlayerRespawnManager(mockScene, mockCamera);

    // Create mocks for UI modules and inject them
    mockRespawnUI = {
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      setRespawnClickCallback: vi.fn(),
      updateTimerDisplay: vi.fn(),
      resetSelectedSpawn: vi.fn(),
      updateSelectedSpawn: vi.fn(),
      getMapContainer: vi.fn(() => document.createElement('div')),
    } as unknown as RespawnUI;

    mockMapController = {
      setZoneSelectedCallback: vi.fn(),
      setZoneManager: vi.fn(),
      setGameModeManager: vi.fn(),
      showMap: vi.fn(),
      clearSelection: vi.fn(),
      stopMapUpdateInterval: vi.fn(),
      dispose: vi.fn(),
    } as unknown as RespawnMapController;

    // Inject mocks into the instance
    (respawnManager as any).respawnUI = mockRespawnUI;
    (respawnManager as any).mapController = mockMapController;

    // Create dependency mocks
    mockZoneManager = {
      getAllZones: vi.fn(() => [
        createMockZone('us_base', 'US Base', new THREE.Vector3(0, 0, -50), ZoneState.US_CONTROLLED, true, Faction.US),
        createMockZone('opfor_base', 'OPFOR Base', new THREE.Vector3(0, 0, 50), ZoneState.OPFOR_CONTROLLED, true, Faction.OPFOR),
        createMockZone('zone_a', 'Zone Alpha', new THREE.Vector3(100, 0, 100), ZoneState.US_CONTROLLED, false),
        createMockZone('zone_b', 'Zone Bravo', new THREE.Vector3(-100, 0, 100), ZoneState.CONTESTED, false),
      ]),
    } as unknown as ZoneManager;

    mockPlayerHealthSystem = {
      applySpawnProtection: vi.fn(),
    } as unknown as PlayerHealthSystem;

    mockGameModeManager = {
      canPlayerSpawnAtZones: vi.fn(() => true),
      getRespawnTime: vi.fn(() => 5),
      getSpawnProtectionDuration: vi.fn(() => 3),
      currentMode: 'zone_control',
      getWorldSize: vi.fn(() => 400),
    } as unknown as GameModeManager;

    mockPlayerController = {
      setPosition: vi.fn(),
      enableControls: vi.fn(),
      disableControls: vi.fn(),
    };

    mockFirstPersonWeapon = {
      enable: vi.fn(),
      disable: vi.fn(),
    };

    mockInventoryManager = {
      reset: vi.fn(),
    } as unknown as InventoryManager;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and init', () => {
    it('should initialize with scene and camera', () => {
      expect(respawnManager).toBeDefined();
      expect(respawnManager['scene']).toBe(mockScene);
      expect(respawnManager['camera']).toBe(mockCamera);
    });

    it('should setup UI callbacks on init', async () => {
      await respawnManager.init();

      expect(mockRespawnUI.setRespawnClickCallback).toHaveBeenCalled();
      expect(mockMapController.setZoneSelectedCallback).toHaveBeenCalled();
    });

    it('should initialize with respawn UI hidden', () => {
      expect(respawnManager['isRespawnUIVisible']).toBe(false);
    });

    it('should initialize with zero respawn timer', () => {
      expect(respawnManager['respawnTimer']).toBe(0);
    });

    it('should initialize with no selected spawn point', () => {
      expect(respawnManager['selectedSpawnPoint']).toBeUndefined();
    });
  });

  describe('setDependencies', () => {
    it('should set zone manager and pass to map controller', () => {
      respawnManager.setZoneManager(mockZoneManager);

      expect(respawnManager['zoneManager']).toBe(mockZoneManager);
      expect(mockMapController.setZoneManager).toHaveBeenCalledWith(mockZoneManager);
    });

    it('should set player health system', () => {
      respawnManager.setPlayerHealthSystem(mockPlayerHealthSystem);

      expect(respawnManager['playerHealthSystem']).toBe(mockPlayerHealthSystem);
    });

    it('should set game mode manager and pass to map controller', () => {
      respawnManager.setGameModeManager(mockGameModeManager);

      expect(respawnManager['gameModeManager']).toBe(mockGameModeManager);
      expect(mockMapController.setGameModeManager).toHaveBeenCalledWith(mockGameModeManager);
    });

    it('should set player controller', () => {
      respawnManager.setPlayerController(mockPlayerController);

      expect(respawnManager['playerController']).toBe(mockPlayerController);
    });

    it('should set first person weapon', () => {
      respawnManager.setFirstPersonWeapon(mockFirstPersonWeapon);

      expect(respawnManager['firstPersonWeapon']).toBe(mockFirstPersonWeapon);
    });

    it('should set inventory manager', () => {
      respawnManager.setInventoryManager(mockInventoryManager);

      expect(respawnManager['inventoryManager']).toBe(mockInventoryManager);
    });
  });

  describe('Callback registration', () => {
    it('should register respawn callback', () => {
      const callback = vi.fn();
      respawnManager.setRespawnCallback(callback);

      expect(respawnManager['onRespawnCallback']).toBe(callback);
    });

    it('should register death callback', () => {
      const callback = vi.fn();
      respawnManager.setDeathCallback(callback);

      expect(respawnManager['onDeathCallback']).toBe(callback);
    });

    it('should trigger respawn callback on respawn', () => {
      const callback = vi.fn();
      respawnManager.setRespawnCallback(callback);
      respawnManager.setZoneManager(mockZoneManager);

      respawnManager.respawnAtBase();

      expect(callback).toHaveBeenCalledWith(expect.any(THREE.Vector3));
    });

    it('should trigger death callback on player death', () => {
      const callback = vi.fn();
      respawnManager.setDeathCallback(callback);
      respawnManager.setGameModeManager(mockGameModeManager);

      respawnManager.onPlayerDeath();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('getSpawnableZones', () => {
    beforeEach(() => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setGameModeManager(mockGameModeManager);
    });

    it('should return US base and US controlled zones when spawning at zones is allowed', () => {
      vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(true);

      const zones = respawnManager.getSpawnableZones();

      expect(zones).toHaveLength(2); // US base + Zone Alpha (US controlled)
      expect(zones[0].id).toBe('us_base');
      expect(zones[1].id).toBe('zone_a');
    });

    it('should return only US base when spawning at zones is not allowed', () => {
      vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(false);

      const zones = respawnManager.getSpawnableZones();

      expect(zones).toHaveLength(1);
      expect(zones[0].id).toBe('us_base');
    });

    it('should return empty array when no zone manager', () => {
      respawnManager.setZoneManager(undefined as any);

      const zones = respawnManager.getSpawnableZones();

      expect(zones).toEqual([]);
    });

    it('should not include OPFOR base', () => {
      const zones = respawnManager.getSpawnableZones();

      expect(zones.every(z => z.id !== 'opfor_base')).toBe(true);
    });

    it('should not include contested zones', () => {
      const zones = respawnManager.getSpawnableZones();

      expect(zones.every(z => z.id !== 'zone_b')).toBe(true);
    });

    it('should clone zone positions', () => {
      const zones = respawnManager.getSpawnableZones();
      const originalZones = mockZoneManager.getAllZones();

      zones.forEach((zone) => {
        const originalZone = originalZones.find(z => z.id === zone.id);
        if (originalZone) {
          expect(zone.position).not.toBe(originalZone.position);
          expect(zone.position.equals(originalZone.position)).toBe(true);
        }
      });
    });
  });

  describe('canSpawnAtZone', () => {
    beforeEach(() => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setGameModeManager(mockGameModeManager);
    });

    it('should return true when game mode allows and US controlled zones exist', () => {
      vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(true);

      expect(respawnManager.canSpawnAtZone()).toBe(true);
    });

    it('should return false when game mode does not allow zone spawning', () => {
      vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(false);

      expect(respawnManager.canSpawnAtZone()).toBe(false);
    });

    it('should return false when no zone manager', () => {
      respawnManager.setZoneManager(undefined as any);

      expect(respawnManager.canSpawnAtZone()).toBe(false);
    });

    it('should return false when no game mode manager', () => {
      respawnManager.setGameModeManager(undefined as any);

      expect(respawnManager.canSpawnAtZone()).toBe(false);
    });

    it('should exclude home bases from non-base zone check', () => {
      vi.mocked(mockZoneManager.getAllZones).mockReturnValue([
        createMockZone('us_base', 'US Base', new THREE.Vector3(0, 0, -50), ZoneState.US_CONTROLLED, true, Faction.US),
      ]);
      vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(true);

      expect(respawnManager.canSpawnAtZone()).toBe(false);
    });
  });

  describe('respawnAtBase', () => {
    beforeEach(() => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setInventoryManager(mockInventoryManager);
      respawnManager.setFirstPersonWeapon(mockFirstPersonWeapon);
      respawnManager.setPlayerHealthSystem(mockPlayerHealthSystem);
      respawnManager.setGameModeManager(mockGameModeManager);
    });

    it('should respawn at US base position', () => {
      respawnManager.respawnAtBase();

      expect(mockPlayerController.setPosition).toHaveBeenCalledWith(expect.any(THREE.Vector3), 'respawn.manager');
      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];
      expect(callPosition.x).toBe(0);
      expect(callPosition.z).toBe(-50);
    });

    it('should respawn at default position when no zone manager', () => {
      respawnManager.setZoneManager(undefined as any);

      respawnManager.respawnAtBase();

      expect(mockPlayerController.setPosition).toHaveBeenCalledWith(expect.any(THREE.Vector3), 'respawn.manager');
      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];
      expect(callPosition.x).toBe(0);
      expect(callPosition.y).toBe(2); // terrain height (0) + player offset (2)
      expect(callPosition.z).toBe(-50);
    });

    it('should enable player controls', () => {
      respawnManager.respawnAtBase();

      expect(mockPlayerController.enableControls).toHaveBeenCalled();
    });

    it('should reset inventory', () => {
      respawnManager.respawnAtBase();

      expect(mockInventoryManager.reset).toHaveBeenCalled();
    });

    it('should enable weapon', () => {
      respawnManager.respawnAtBase();

      expect(mockFirstPersonWeapon.enable).toHaveBeenCalled();
    });

    it('should apply spawn protection', () => {
      respawnManager.respawnAtBase();

      expect(mockPlayerHealthSystem.applySpawnProtection).toHaveBeenCalledWith(3);
    });

    it('should use A Shau pressure spawn policy near contested objective', () => {
      (mockGameModeManager as any).currentMode = GameMode.A_SHAU_VALLEY;
      vi.mocked(mockZoneManager.getAllZones).mockReturnValue([
        createMockZone('us_base', 'US Base', new THREE.Vector3(0, 0, -50), ZoneState.US_CONTROLLED, true, Faction.US),
        { ...createMockZone('zone_us_forward', 'US Forward', new THREE.Vector3(100, 0, 100), ZoneState.US_CONTROLLED, false, Faction.US), ticketBleedRate: 2 },
        { ...createMockZone('zone_obj', 'Objective', new THREE.Vector3(220, 0, 220), ZoneState.CONTESTED, false, Faction.NONE), ticketBleedRate: 6 },
      ] as any);

      respawnManager.respawnAtBase();

      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];
      // Should no longer be base fallback.
      expect(callPosition.z).not.toBe(-50);
      // Should bias toward objective (higher than forward-base X/Z)
      expect(callPosition.x).toBeGreaterThan(100);
      expect(callPosition.z).toBeGreaterThan(100);
    });

    it('should use spawn protection from game mode manager', () => {
      vi.mocked(mockGameModeManager.getSpawnProtectionDuration).mockReturnValue(5);

      respawnManager.respawnAtBase();

      expect(mockPlayerHealthSystem.applySpawnProtection).toHaveBeenCalledWith(5);
    });

    it('should not apply spawn protection when duration is zero', () => {
      vi.mocked(mockGameModeManager.getSpawnProtectionDuration).mockReturnValue(0);

      respawnManager.respawnAtBase();

      expect(mockPlayerHealthSystem.applySpawnProtection).not.toHaveBeenCalled();
    });
  });

  describe('respawnAtSpecificZone', () => {
    beforeEach(() => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setInventoryManager(mockInventoryManager);
      respawnManager.setFirstPersonWeapon(mockFirstPersonWeapon);
      respawnManager.setPlayerHealthSystem(mockPlayerHealthSystem);
      respawnManager.setGameModeManager(mockGameModeManager);
    });

    it('should respawn at specified zone position', () => {
      respawnManager.respawnAtSpecificZone('zone_a');

      expect(mockPlayerController.setPosition).toHaveBeenCalledWith(expect.any(THREE.Vector3), 'respawn.manager');
      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];
      // Zone Alpha at (100, 0, 100) + offset (5, 2, 5)
      expect(callPosition.x).toBe(105);
      expect(callPosition.z).toBe(105);
    });

    it('should not respawn when zone not found', () => {
      respawnManager.respawnAtSpecificZone('non_existent_zone');

      expect(mockPlayerController.setPosition).not.toHaveBeenCalled();
    });

    it('should not respawn when no zone manager', () => {
      respawnManager.setZoneManager(undefined as any);

      respawnManager.respawnAtSpecificZone('zone_a');

      expect(mockPlayerController.setPosition).not.toHaveBeenCalled();
    });
  });

  describe('onPlayerDeath', () => {
    beforeEach(() => {
      respawnManager.setGameModeManager(mockGameModeManager);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setFirstPersonWeapon(mockFirstPersonWeapon);
      respawnManager.setZoneManager(mockZoneManager);
    });

    it('should disable player controls', () => {
      respawnManager.onPlayerDeath();

      expect(mockPlayerController.disableControls).toHaveBeenCalled();
    });

    it('should disable weapon', () => {
      respawnManager.onPlayerDeath();

      expect(mockFirstPersonWeapon.disable).toHaveBeenCalled();
    });

    it('should set respawn timer from game mode', () => {
      vi.mocked(mockGameModeManager.getRespawnTime).mockReturnValue(10);

      respawnManager.onPlayerDeath();

      expect(respawnManager['respawnTimer']).toBe(10);
    });

    it('should default to 5 second respawn timer when no game mode manager', () => {
      respawnManager.setGameModeManager(undefined as any);

      respawnManager.onPlayerDeath();

      expect(respawnManager['respawnTimer']).toBe(5);
    });

    it('should show respawn UI', () => {
      respawnManager.onPlayerDeath();

      expect(mockRespawnUI.show).toHaveBeenCalled();
    });

    it('should show map', () => {
      respawnManager.onPlayerDeath();

      expect(mockMapController.showMap).toHaveBeenCalled();
    });

    it('should reset selected spawn point', () => {
      respawnManager['selectedSpawnPoint'] = 'zone_a';

      respawnManager.onPlayerDeath();

      expect(respawnManager['selectedSpawnPoint']).toBeUndefined();
    });

    it('should update timer display', () => {
      respawnManager.onPlayerDeath();

      expect(mockRespawnUI.updateTimerDisplay).toHaveBeenCalled();
    });
  });

  describe('selectSpawnPointOnMap', () => {
    it('should set selected spawn point', () => {
      respawnManager['selectSpawnPointOnMap']('zone_a', 'Zone Alpha');

      expect(respawnManager['selectedSpawnPoint']).toBe('zone_a');
    });

    it('should update UI with zone name', () => {
      respawnManager['selectSpawnPointOnMap']('zone_a', 'Zone Alpha');

      expect(mockRespawnUI.updateSelectedSpawn).toHaveBeenCalledWith('Zone Alpha');
    });

    it('should update timer display', () => {
      respawnManager['selectSpawnPointOnMap']('zone_a', 'Zone Alpha');

      expect(mockRespawnUI.updateTimerDisplay).toHaveBeenCalled();
    });
  });

  describe('confirmRespawn', () => {
    beforeEach(() => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setInventoryManager(mockInventoryManager);
      respawnManager.setFirstPersonWeapon(mockFirstPersonWeapon);
      respawnManager.setPlayerHealthSystem(mockPlayerHealthSystem);
      respawnManager.setGameModeManager(mockGameModeManager);
      respawnManager['isRespawnUIVisible'] = true;
      respawnManager['availableSpawnPoints'] = [
        { id: 'zone_a', name: 'Zone Alpha', position: new THREE.Vector3(100, 0, 100), safe: true },
      ];
    });

    it('should not respawn when no spawn point selected', () => {
      respawnManager['selectedSpawnPoint'] = undefined;

      respawnManager['confirmRespawn']();

      expect(mockPlayerController.setPosition).not.toHaveBeenCalled();
    });

    it('should not respawn when spawn point not in available list', () => {
      respawnManager['selectedSpawnPoint'] = 'non_existent';

      respawnManager['confirmRespawn']();

      expect(mockPlayerController.setPosition).not.toHaveBeenCalled();
    });

    it('should respawn at selected spawn point with randomization', () => {
      respawnManager['selectedSpawnPoint'] = 'zone_a';

      respawnManager['confirmRespawn']();

      expect(mockPlayerController.setPosition).toHaveBeenCalledWith(expect.any(THREE.Vector3), 'respawn.manager');
      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];

      // Position should be near zone_a (100, 0, 100) with ±5 randomization
      expect(callPosition.x).toBeGreaterThanOrEqual(95);
      expect(callPosition.x).toBeLessThanOrEqual(105);
      expect(callPosition.z).toBeGreaterThanOrEqual(95);
      expect(callPosition.z).toBeLessThanOrEqual(105);
    });

    it('should hide respawn UI', () => {
      respawnManager['selectedSpawnPoint'] = 'zone_a';

      respawnManager['confirmRespawn']();

      expect(mockRespawnUI.hide).toHaveBeenCalled();
      expect(respawnManager['isRespawnUIVisible']).toBe(false);
    });

    it('should clear map selection', () => {
      respawnManager['selectedSpawnPoint'] = 'zone_a';

      respawnManager['confirmRespawn']();

      expect(mockMapController.clearSelection).toHaveBeenCalled();
    });

    it('should stop map update interval', () => {
      respawnManager['selectedSpawnPoint'] = 'zone_a';

      respawnManager['confirmRespawn']();

      expect(mockMapController.stopMapUpdateInterval).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should decrement respawn timer when UI is visible', () => {
      respawnManager['isRespawnUIVisible'] = true;
      respawnManager['respawnTimer'] = 5;

      respawnManager.update(1);

      expect(respawnManager['respawnTimer']).toBe(4);
    });

    it('should update timer display when UI is visible', () => {
      respawnManager['isRespawnUIVisible'] = true;
      respawnManager['respawnTimer'] = 5;

      respawnManager.update(1);

      expect(mockRespawnUI.updateTimerDisplay).toHaveBeenCalledWith(4, false);
    });

    it('should not update timer when UI is hidden', () => {
      respawnManager['isRespawnUIVisible'] = false;
      respawnManager['respawnTimer'] = 5;

      respawnManager.update(1);

      expect(respawnManager['respawnTimer']).toBe(5);
      expect(mockRespawnUI.updateTimerDisplay).not.toHaveBeenCalled();
    });

    it('should not update timer when timer is zero or negative', () => {
      respawnManager['isRespawnUIVisible'] = true;
      respawnManager['respawnTimer'] = 0;

      respawnManager.update(1);

      // Timer should stay at zero due to guard (respawnTimer > 0)
      expect(respawnManager['respawnTimer']).toBe(0);
    });

    it('should pass selected spawn point state to timer display', () => {
      respawnManager['isRespawnUIVisible'] = true;
      respawnManager['respawnTimer'] = 5;
      respawnManager['selectedSpawnPoint'] = 'zone_a';

      respawnManager.update(1);

      expect(mockRespawnUI.updateTimerDisplay).toHaveBeenCalledWith(4, true);
    });

    it('should handle fractional deltaTime correctly', () => {
      respawnManager['isRespawnUIVisible'] = true;
      respawnManager['respawnTimer'] = 5;

      respawnManager.update(0.016); // 16ms frame

      expect(respawnManager['respawnTimer']).toBeCloseTo(4.984, 3);
    });
  });

  describe('updateAvailableSpawnPoints', () => {
    beforeEach(() => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setGameModeManager(mockGameModeManager);
    });

    it('should populate available spawn points from US controlled zones', () => {
      vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(true);

      respawnManager['updateAvailableSpawnPoints']();

      expect(respawnManager['availableSpawnPoints']).toHaveLength(2);
      expect(respawnManager['availableSpawnPoints'][0].id).toBe('us_base');
      expect(respawnManager['availableSpawnPoints'][1].id).toBe('zone_a');
    });

    it('should mark all spawn points as safe', () => {
      respawnManager['updateAvailableSpawnPoints']();

      expect(respawnManager['availableSpawnPoints'].every(p => p.safe)).toBe(true);
    });

    it('should clone zone positions', () => {
      respawnManager['updateAvailableSpawnPoints']();

      const originalZones = mockZoneManager.getAllZones();
      respawnManager['availableSpawnPoints'].forEach((point, i) => {
        const originalZone = originalZones.find(z => z.id === point.id);
        if (originalZone) {
          expect(point.position).not.toBe(originalZone.position);
        }
      });
    });

    it('should use default spawn point when no zone manager', () => {
      respawnManager.setZoneManager(undefined as any);

      respawnManager['updateAvailableSpawnPoints']();

      expect(respawnManager['availableSpawnPoints']).toHaveLength(1);
      expect(respawnManager['availableSpawnPoints'][0].id).toBe('default');
      expect(respawnManager['availableSpawnPoints'][0].name).toBe('Base');
    });
  });

  describe('dispose', () => {
    it('should hide respawn UI', () => {
      respawnManager['isRespawnUIVisible'] = true;

      respawnManager.dispose();

      expect(mockRespawnUI.hide).toHaveBeenCalled();
    });

    it('should dispose respawn UI', () => {
      respawnManager.dispose();

      expect(mockRespawnUI.dispose).toHaveBeenCalled();
    });

    it('should dispose map controller', () => {
      respawnManager.dispose();

      expect(mockMapController.dispose).toHaveBeenCalled();
    });

    it('should clear selected spawn point', () => {
      respawnManager['selectedSpawnPoint'] = 'zone_a';

      respawnManager.dispose();

      expect(respawnManager['selectedSpawnPoint']).toBeUndefined();
    });

    it('should not throw when called multiple times', () => {
      expect(() => {
        respawnManager.dispose();
        respawnManager.dispose();
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle respawn without player controller', () => {
      respawnManager.setZoneManager(mockZoneManager);

      expect(() => respawnManager.respawnAtBase()).not.toThrow();
    });

    it('should handle respawn without first person weapon', () => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);

      expect(() => respawnManager.respawnAtBase()).not.toThrow();
    });

    it('should handle respawn without inventory manager', () => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setFirstPersonWeapon(mockFirstPersonWeapon);

      expect(() => respawnManager.respawnAtBase()).not.toThrow();
    });

    it('should handle death without player controller', () => {
      respawnManager.setGameModeManager(mockGameModeManager);

      expect(() => respawnManager.onPlayerDeath()).not.toThrow();
    });

    it('should handle death without first person weapon', () => {
      respawnManager.setGameModeManager(mockGameModeManager);
      respawnManager.setPlayerController(mockPlayerController);

      expect(() => respawnManager.onPlayerDeath()).not.toThrow();
    });

    it('should handle player controller without setPosition method', () => {
      const controllerWithoutSetPosition = {
        enableControls: vi.fn(),
      };
      respawnManager.setPlayerController(controllerWithoutSetPosition);
      respawnManager.setZoneManager(mockZoneManager);

      expect(() => respawnManager.respawnAtBase()).not.toThrow();
    });

    it('should handle player controller without enableControls method', () => {
      const controllerWithoutEnable = {
        setPosition: vi.fn(),
      };
      respawnManager.setPlayerController(controllerWithoutEnable);
      respawnManager.setZoneManager(mockZoneManager);

      expect(() => respawnManager.respawnAtBase()).not.toThrow();
    });

    it('should handle player controller without disableControls method', () => {
      const controllerWithoutDisable = {};
      respawnManager.setPlayerController(controllerWithoutDisable);
      respawnManager.setGameModeManager(mockGameModeManager);

      expect(() => respawnManager.onPlayerDeath()).not.toThrow();
    });

    it('should handle first person weapon without enable method', () => {
      const weaponWithoutEnable = {
        disable: vi.fn(),
      };
      respawnManager.setFirstPersonWeapon(weaponWithoutEnable);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setZoneManager(mockZoneManager);

      expect(() => respawnManager.respawnAtBase()).not.toThrow();
    });

    it('should handle first person weapon without disable method', () => {
      const weaponWithoutDisable = {};
      respawnManager.setFirstPersonWeapon(weaponWithoutDisable);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setGameModeManager(mockGameModeManager);

      expect(() => respawnManager.onPlayerDeath()).not.toThrow();
    });

    it('should handle spawn protection without player health system', () => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setGameModeManager(mockGameModeManager);

      expect(() => respawnManager.respawnAtBase()).not.toThrow();
    });

    it('should apply terrain height offset correctly', async () => {
      // Re-mock HeightQueryCache to return custom height for this test
      vi.resetModules();
      vi.doMock('../terrain/HeightQueryCache', () => ({
        getHeightQueryCache: vi.fn(() => ({
          getHeightAt: vi.fn(() => 10),
        })),
      }));

      // Re-import to get new mock
      const { PlayerRespawnManager: TestManager } = await import('./PlayerRespawnManager');
      const testRespawnManager = new TestManager(mockScene, mockCamera);

      // Inject mocks
      (testRespawnManager as any).respawnUI = mockRespawnUI;
      (testRespawnManager as any).mapController = mockMapController;

      testRespawnManager.setZoneManager(mockZoneManager);
      testRespawnManager.setPlayerController(mockPlayerController);

      testRespawnManager.respawnAtBase();

      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];
      expect(callPosition.y).toBe(12); // terrain height (10) + player offset (2)
    });

    it('should handle zone manager with no zones', () => {
      vi.mocked(mockZoneManager.getAllZones).mockReturnValue([]);

      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);

      respawnManager.respawnAtBase();

      // Should fall back to default position
      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];
      expect(callPosition.x).toBe(0);
      expect(callPosition.z).toBe(-50);
    });
  });

  describe('UI Callback Integration', () => {
    it('should wire respawn button callback correctly', async () => {
      await respawnManager.init();

      const callback = vi.mocked(mockRespawnUI.setRespawnClickCallback).mock.calls[0][0];
      expect(callback).toBeDefined();

      // Setup for confirm respawn
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager['selectedSpawnPoint'] = 'zone_a';
      respawnManager['availableSpawnPoints'] = [
        { id: 'zone_a', name: 'Zone Alpha', position: new THREE.Vector3(100, 0, 100), safe: true },
      ];

      callback();

      expect(mockPlayerController.setPosition).toHaveBeenCalled();
    });

    it('should wire zone selection callback correctly', async () => {
      await respawnManager.init();

      const callback = vi.mocked(mockMapController.setZoneSelectedCallback).mock.calls[0][0];
      expect(callback).toBeDefined();

      callback('zone_a', 'Zone Alpha');

      expect(respawnManager['selectedSpawnPoint']).toBe('zone_a');
      expect(mockRespawnUI.updateSelectedSpawn).toHaveBeenCalledWith('Zone Alpha');
    });
  });
});
