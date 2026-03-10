import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { PlayerRespawnManager } from './PlayerRespawnManager';
import { InitialDeployCancelledError } from './InitialDeployCancelledError';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { PlayerHealthSystem } from './PlayerHealthSystem';
import { GameModeManager } from '../world/GameModeManager';
import { InventoryManager } from './InventoryManager';
import { Alliance, Faction } from '../combat/types';
import { RespawnUI } from './RespawnUI';
import { RespawnMapController } from './RespawnMapController';
import { GameMode } from '../../config/gameModeTypes';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { getGameModeDefinition } from '../../config/gameModeDefinitions';
import { resolveInitialSpawnPosition } from '../world/runtime/ModeSpawnResolver';
import {
  DEFAULT_PLAYER_LOADOUT,
  LoadoutEquipment,
  LoadoutWeapon
} from '../../ui/loadout/LoadoutTypes';
import type { LoadoutService } from './LoadoutService';

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

    querySelector(_selector: string) {
      return new MockElement();
    }

    querySelectorAll(_selector: string) {
      return [new MockElement()];
    }

    setAttribute(_name: string, _value: string) {}
    getAttribute(_name: string) { return ''; }

    // Canvas-specific method
    getContext(_type: string) {
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
  doc.createElement = (_tag: string) => new MockElement();
  doc.getElementById = (_id: string) => new MockElement();

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
    getHeightAt: vi.fn((_x: number, _z: number) => 0),
  })),
}));

// Helper to create mock zones
function createMockZone(
  id: string,
  name: string,
  position: THREE.Vector3,
  state: ZoneState = ZoneState.NEUTRAL,
  isHomeBase = false,
  owner: Faction | null = null
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
  let mockTerrainSystem: ITerrainRuntime;
  let mockLoadoutService: LoadoutService;
  let mockGrenadeSystem: any;
  let loadoutContext: { mode: GameMode; alliance: Alliance; faction: Faction };

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
      configureSession: vi.fn(),
      setMapInteractionEnabled: vi.fn(),
      setLoadoutEditingEnabled: vi.fn(),
      setLoadoutChangeCallback: vi.fn(),
      setPresetCycleCallback: vi.fn(),
      setPresetSaveCallback: vi.fn(),
      setRespawnClickCallback: vi.fn(),
      setCancelClickCallback: vi.fn(),
      updateTimerDisplay: vi.fn(),
      updateLoadout: vi.fn(),
      updateLoadoutPresentation: vi.fn(),
      resetSelectedSpawn: vi.fn(),
      updateSelectedSpawn: vi.fn(),
      getMapContainer: vi.fn(() => document.createElement('div')),
    } as unknown as RespawnUI;

    mockMapController = {
      setZoneSelectedCallback: vi.fn(),
      setZoneManager: vi.fn(),
      setGameModeManager: vi.fn(),
      setSpawnPoints: vi.fn(),
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
        createMockZone('us_base', 'US Base', new THREE.Vector3(0, 0, -50), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
        createMockZone('opfor_base', 'OPFOR Base', new THREE.Vector3(0, 0, 50), ZoneState.OPFOR_CONTROLLED, true, Faction.NVA),
        createMockZone('zone_a', 'Zone Alpha', new THREE.Vector3(100, 0, 100), ZoneState.BLUFOR_CONTROLLED, false),
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
      getRespawnPolicy: vi.fn(() => ({
        allowControlledZoneSpawns: true,
        initialSpawnRule: 'homebase',
        fallbackRule: 'homebase',
        contactAssistStyle: 'none'
      })),
      getDeploySession: vi.fn(() => ({
        kind: 'respawn',
        mode: GameMode.ZONE_CONTROL,
        modeName: 'Zone Control',
        modeDescription: 'Fast-paced combat.',
        flow: 'standard',
        mapVariant: 'frontier',
        flowLabel: 'Frontline deployment',
        headline: 'RETURN TO BATTLE',
        subheadline: 'Choose a controlled position and return to the fight.',
        mapTitle: 'TACTICAL MAP - SELECT DEPLOYMENT',
        selectedSpawnTitle: 'SELECTED SPAWN POINT',
        emptySelectionText: 'Select a spawn point on the map',
        readySelectionText: 'Ready to deploy',
        countdownLabel: 'Deployment available in',
        readyLabel: 'Ready for deployment',
        actionLabel: 'DEPLOY',
        secondaryActionLabel: null,
        allowSpawnSelection: true,
        allowLoadoutEditing: true,
        sequenceTitle: 'Redeploy Checklist',
        sequenceSteps: [
          'Choose a spawn point before returning to the fight.',
          'Configure 2 weapons and 1 equipment slot before deployment.',
          'Redeploy as soon as the timer clears.',
        ],
      })),
      getCurrentConfig: vi.fn(() => ({ helipads: [] })),
      getCurrentDefinition: vi.fn(() => getGameModeDefinition(GameMode.ZONE_CONTROL)),
      getCurrentMode: vi.fn(() => GameMode.ZONE_CONTROL),
      getWorldSize: vi.fn(() => 400),
    } as unknown as GameModeManager;

    mockPlayerController = {
      setPosition: vi.fn(),
      enableControls: vi.fn(),
      disableControls: vi.fn(),
      setPointerLockEnabled: vi.fn(),
    };

    mockFirstPersonWeapon = {
      enable: vi.fn(),
      disable: vi.fn(),
    };

    mockInventoryManager = {
      reset: vi.fn(),
      setLoadout: vi.fn(),
    } as unknown as InventoryManager;

    loadoutContext = {
      mode: GameMode.ZONE_CONTROL,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    };

    mockLoadoutService = {
      getCurrentLoadout: vi.fn(() => ({ ...DEFAULT_PLAYER_LOADOUT })),
      getContext: vi.fn(() => ({ ...loadoutContext })),
      getPresentationModel: vi.fn(() => ({
        context: { ...loadoutContext },
        factionLabel: loadoutContext.faction,
        presetIndex: 0,
        presetCount: 3,
        presetName: 'Rifleman',
        presetDescription: 'Balanced assault loadout for frontline pushes.',
        presetDirty: false,
        availableWeapons: [LoadoutWeapon.RIFLE, LoadoutWeapon.SHOTGUN, LoadoutWeapon.SMG, LoadoutWeapon.PISTOL],
        availableEquipment: [
          LoadoutEquipment.FRAG_GRENADE,
          LoadoutEquipment.SMOKE_GRENADE,
          LoadoutEquipment.FLASHBANG,
          LoadoutEquipment.SANDBAG_KIT,
          LoadoutEquipment.MORTAR_KIT,
        ],
      })),
      setContextFromDefinition: vi.fn((definition: { id: GameMode }, alliance = loadoutContext.alliance, faction = loadoutContext.faction) => {
        loadoutContext = {
          mode: definition.id,
          alliance,
          faction,
        };
        return { ...DEFAULT_PLAYER_LOADOUT };
      }),
      cycleField: vi.fn((field: string, direction: 1 | -1) => {
        if (field === 'primaryWeapon') {
          return {
            ...DEFAULT_PLAYER_LOADOUT,
            primaryWeapon: direction === 1 ? LoadoutWeapon.SMG : LoadoutWeapon.RIFLE,
          };
        }
        if (field === 'equipment') {
          return {
            ...DEFAULT_PLAYER_LOADOUT,
            equipment: direction === 1
              ? LoadoutEquipment.MORTAR_KIT
              : LoadoutEquipment.FRAG_GRENADE,
          };
        }
        return { ...DEFAULT_PLAYER_LOADOUT };
      }),
      cyclePreset: vi.fn(() => ({
        primaryWeapon: LoadoutWeapon.SMG,
        secondaryWeapon: LoadoutWeapon.PISTOL,
        equipment: LoadoutEquipment.SMOKE_GRENADE,
      })),
      saveCurrentToActivePreset: vi.fn(() => ({
        id: 'recon',
        name: 'Recon',
        description: 'Fast two-gun profile for maneuver and smoke cover.',
        loadout: {
          primaryWeapon: LoadoutWeapon.SMG,
          secondaryWeapon: LoadoutWeapon.PISTOL,
          equipment: LoadoutEquipment.SMOKE_GRENADE,
        }
      })),
      applyToRuntime: vi.fn(),
    } as unknown as LoadoutService;

    mockGrenadeSystem = {};

    mockTerrainSystem = {
      getHeightAt: vi.fn(() => 0),
      getEffectiveHeightAt: vi.fn(() => 0),
      getPlayableWorldSize: vi.fn(() => 400),
      getWorldSize: vi.fn(() => 400),
      isTerrainReady: vi.fn(() => true),
      hasTerrainAt: vi.fn(() => true),
      getActiveTerrainTileCount: vi.fn(() => 0),
      setSurfaceWetness: vi.fn(),
      updatePlayerPosition: vi.fn(),
      registerCollisionObject: vi.fn(),
      unregisterCollisionObject: vi.fn(),
      raycastTerrain: vi.fn(() => ({ hit: false })),
    };

    respawnManager.setTerrainSystem(mockTerrainSystem);
    respawnManager.setLoadoutService(mockLoadoutService);
    respawnManager.setGrenadeSystem(mockGrenadeSystem);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and init', () => {
    it('should setup UI callbacks on init', async () => {
      await respawnManager.init();

      expect(mockRespawnUI.setRespawnClickCallback).toHaveBeenCalled();
      expect((mockRespawnUI as any).setCancelClickCallback).toHaveBeenCalled();
      expect((mockRespawnUI as any).setPresetCycleCallback).toHaveBeenCalled();
      expect((mockRespawnUI as any).setPresetSaveCallback).toHaveBeenCalled();
      expect(mockMapController.setZoneSelectedCallback).toHaveBeenCalled();
      expect(mockRespawnUI.setLoadoutChangeCallback).toHaveBeenCalled();
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

      it('returns OPFOR-controlled spawns when the selected alliance is OPFOR', () => {
        loadoutContext = {
          mode: GameMode.ZONE_CONTROL,
          alliance: Alliance.OPFOR,
          faction: Faction.NVA,
        };
        vi.mocked(mockZoneManager.getAllZones).mockReturnValue([
          createMockZone('us_base', 'US Base', new THREE.Vector3(0, 0, -50), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
          createMockZone('opfor_base', 'OPFOR Base', new THREE.Vector3(0, 0, 50), ZoneState.OPFOR_CONTROLLED, true, Faction.NVA),
          createMockZone('zone_opfor', 'Zone Red', new THREE.Vector3(120, 0, 100), ZoneState.OPFOR_CONTROLLED, false, Faction.NVA),
        ] as any);

        const zones = respawnManager.getSpawnableZones();

        expect(zones.map(zone => zone.id)).toEqual(['opfor_base', 'zone_opfor']);
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
          createMockZone('us_base', 'US Base', new THREE.Vector3(0, 0, -50), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
        ]);
        vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(true);

        expect(respawnManager.canSpawnAtZone()).toBe(false);
      });

      it('returns true for OPFOR-controlled forward zones when the selected alliance is OPFOR', () => {
        loadoutContext = {
          mode: GameMode.ZONE_CONTROL,
          alliance: Alliance.OPFOR,
          faction: Faction.NVA,
        };
        vi.mocked(mockZoneManager.getAllZones).mockReturnValue([
          createMockZone('opfor_base', 'OPFOR Base', new THREE.Vector3(0, 0, 50), ZoneState.OPFOR_CONTROLLED, true, Faction.NVA),
          createMockZone('zone_opfor', 'Zone Red', new THREE.Vector3(120, 0, 100), ZoneState.OPFOR_CONTROLLED, false, Faction.NVA),
        ] as any);
        vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(true);

        expect(respawnManager.canSpawnAtZone()).toBe(true);
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

      expect(mockLoadoutService.applyToRuntime).toHaveBeenCalledWith(expect.objectContaining({
        inventoryManager: mockInventoryManager,
        firstPersonWeapon: mockFirstPersonWeapon,
        grenadeSystem: mockGrenadeSystem,
      }));
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
      vi.mocked(mockGameModeManager.getRespawnPolicy).mockReturnValue({
        allowControlledZoneSpawns: true,
        initialSpawnRule: 'forward_insertion',
        fallbackRule: 'pressure_front',
        contactAssistStyle: 'pressure_front'
      });
      vi.mocked(mockZoneManager.getAllZones).mockReturnValue([
        createMockZone('us_base', 'US Base', new THREE.Vector3(0, 0, -50), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
        { ...createMockZone('zone_us_forward', 'US Forward', new THREE.Vector3(100, 0, 100), ZoneState.BLUFOR_CONTROLLED, false, Faction.US), ticketBleedRate: 2 },
        { ...createMockZone('zone_obj', 'Objective', new THREE.Vector3(220, 0, 220), ZoneState.CONTESTED, false, null), ticketBleedRate: 6 },
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

    it('should configure the respawn UI from deploy session policy', () => {
      respawnManager.onPlayerDeath();

      expect((mockLoadoutService as any).setContextFromDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ id: GameMode.ZONE_CONTROL }),
        Alliance.BLUFOR,
        Faction.US
      );
      expect((mockRespawnUI as any).configureSession).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: GameMode.ZONE_CONTROL,
          flow: 'standard',
          actionLabel: 'DEPLOY',
        })
      );
      expect((mockRespawnUI as any).setMapInteractionEnabled).toHaveBeenCalledWith(true);
      expect((mockRespawnUI as any).setLoadoutEditingEnabled).toHaveBeenCalledWith(true);
      expect((mockRespawnUI as any).updateLoadout).toHaveBeenCalledWith(expect.objectContaining(DEFAULT_PLAYER_LOADOUT));
      expect((mockRespawnUI as any).updateLoadoutPresentation).toHaveBeenCalledWith(expect.objectContaining({
        factionLabel: 'US',
        presetName: 'Rifleman',
      }));
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
      respawnManager['availableSpawnPoints'].forEach((point, _i) => {
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

    it('should include helipad spawn points for BLUFOR players', () => {
      vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(true);
      const mockHelipadSystem = {
        getAllHelipads: () => [
          { id: 'helipad_main', position: new THREE.Vector3(40, 5, -1400), aircraft: 'UH1_HUEY', faction: 'US' },
        ],
      } as any;
      respawnManager.setHelipadSystem(mockHelipadSystem);

      respawnManager['updateAvailableSpawnPoints']();

      const helipadSpawn = respawnManager['availableSpawnPoints'].find(p => p.id === 'helipad_main');
      expect(helipadSpawn).toBeDefined();
      expect(helipadSpawn!.name).toContain('Helipad');
    });

    it('falls back to configured helipads during initial deploy before runtime helipads exist', () => {
      vi.mocked(mockGameModeManager.canPlayerSpawnAtZones).mockReturnValue(true);
      vi.mocked((mockGameModeManager as any).getCurrentConfig).mockReturnValue({
        helipads: [
          { id: 'helipad_main', position: new THREE.Vector3(40, 0, -1400), aircraft: 'UH1_HUEY' },
        ],
      });

      respawnManager['updateAvailableSpawnPoints']();

      const helipadSpawn = respawnManager['availableSpawnPoints'].find(p => p.id === 'helipad_main');
      expect(helipadSpawn).toBeDefined();
      expect(helipadSpawn?.kind).toBe('helipad');
      expect(helipadSpawn?.priority).toBe(25);
    });
  });

  describe('deploy session policy', () => {
    beforeEach(() => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setGameModeManager(mockGameModeManager);
    });

    it('auto-selects a fallback spawn when manual spawn selection is disabled', () => {
      vi.mocked((mockGameModeManager as any).getDeploySession).mockReturnValue({
        kind: 'respawn',
        mode: GameMode.TEAM_DEATHMATCH,
        modeName: 'Team Deathmatch',
        modeDescription: 'Pure combat.',
        flow: 'standard',
        mapVariant: 'standard',
        flowLabel: 'Frontline deployment',
        headline: 'RETURN TO BATTLE',
        subheadline: 'Choose a controlled position and return to the fight.',
        mapTitle: 'TACTICAL MAP - SELECT DEPLOYMENT',
        selectedSpawnTitle: 'SELECTED SPAWN POINT',
        emptySelectionText: 'Default insertion will be used',
        readySelectionText: 'Ready to deploy',
        countdownLabel: 'Deployment available in',
        readyLabel: 'Ready for deployment',
        actionLabel: 'DEPLOY',
        secondaryActionLabel: null,
        allowSpawnSelection: false,
        allowLoadoutEditing: false,
        sequenceTitle: 'Redeploy Checklist',
        sequenceSteps: [
          'Mode rules assign the spawn point automatically.',
          'Mission loadout is locked for this deployment.',
          'Redeploy as soon as the timer clears.',
        ],
      });

      respawnManager.onPlayerDeath();

      expect(respawnManager['selectedSpawnPoint']).toBe('us_base');
      expect(mockRespawnUI.updateSelectedSpawn).toHaveBeenCalledWith('US Base');
    });

    it('preselects the preferred insertion point for initial deploy', async () => {
      const definition = getGameModeDefinition(GameMode.A_SHAU_VALLEY);
      const preferredTarget = resolveInitialSpawnPosition(definition, Alliance.BLUFOR);
      vi.mocked((mockGameModeManager as any).getCurrentDefinition).mockReturnValue(definition);
      vi.mocked((mockGameModeManager as any).getDeploySession).mockImplementation((kind: string) => ({
        kind,
        mode: GameMode.A_SHAU_VALLEY,
        modeName: 'A Shau Valley',
        modeDescription: 'Historical Vietnam campaign.',
        flow: 'air_assault',
        mapVariant: 'standard',
        flowLabel: 'Air assault insertion',
        headline: kind === 'initial' ? 'AIR ASSAULT STAGING' : 'AIR ASSAULT REINSERTION',
        subheadline: 'Choose an insertion zone before the first lift carries you into the campaign.',
        mapTitle: 'ASSAULT MAP - SELECT INSERTION',
        selectedSpawnTitle: 'SELECTED INSERTION ZONE',
        emptySelectionText: 'Select a spawn point on the map',
        readySelectionText: 'Insertion route confirmed',
        countdownLabel: 'Deployment available in',
        readyLabel: 'Ready for deployment',
        actionLabel: kind === 'initial' ? 'INSERT' : 'REINSERT',
        secondaryActionLabel: kind === 'initial' ? 'BACK TO MODE SELECT' : null,
        allowSpawnSelection: true,
        allowLoadoutEditing: true,
        sequenceTitle: kind === 'initial' ? 'Deployment Checklist' : 'Redeploy Checklist',
        sequenceSteps: [
          'Choose an insertion zone before deployment begins.',
          'Configure 2 weapons and 1 equipment slot before deployment.',
          kind === 'initial'
            ? 'Insert once the staging plan and loadout are confirmed.'
            : 'Redeploy as soon as the reinsert timer clears.',
        ],
      }));
      vi.mocked(mockZoneManager.getAllZones).mockReturnValue([
        createMockZone('us_base', 'LZ Goodman', new THREE.Vector3(-500, 0, -500), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
        createMockZone('lz_stallion', 'LZ Stallion', preferredTarget.clone(), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
        createMockZone('lz_eagle', 'LZ Eagle', preferredTarget.clone().add(new THREE.Vector3(1200, 0, 900)), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
      ] as any);

      void respawnManager.beginInitialDeploy();

      expect(respawnManager['selectedSpawnPoint']).toBe('direct_insertion');
      expect(mockRespawnUI.updateSelectedSpawn).toHaveBeenCalledWith('Tactical Insertion');
      expect((mockMapController as any).setSpawnPoints).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'direct_insertion',
            selectionClass: 'direct_insertion',
          }),
        ])
      );
    });

    it('prefers the main frontier helipad for initial deploy before runtime helipads exist', () => {
      const definition = getGameModeDefinition(GameMode.OPEN_FRONTIER);
      vi.mocked((mockGameModeManager as any).getCurrentDefinition).mockReturnValue(definition);
      vi.mocked((mockGameModeManager as any).getCurrentConfig).mockReturnValue({
        helipads: [
          { id: 'helipad_main', position: new THREE.Vector3(40, 0, -1400), aircraft: 'UH1_HUEY' },
          { id: 'helipad_west', position: new THREE.Vector3(-960, 0, -800), aircraft: 'UH1C_GUNSHIP' },
          { id: 'helipad_east', position: new THREE.Vector3(1040, 0, -800), aircraft: 'AH1_COBRA' },
        ],
      });
      vi.mocked((mockGameModeManager as any).getDeploySession).mockImplementation((kind: string) => ({
        kind,
        mode: GameMode.OPEN_FRONTIER,
        modeName: 'Open Frontier',
        modeDescription: 'Company-scale maneuver warfare.',
        flow: 'frontier',
        mapVariant: 'frontier',
        flowLabel: 'Frontier insertion',
        headline: kind === 'initial' ? 'OPEN FRONTIER' : 'FRONTIER REDEPLOYMENT',
        subheadline: 'Choose a forward insertion point and move into the frontier.',
        mapTitle: 'FRONTIER OPERATIONS MAP - SELECT INSERTION',
        selectedSpawnTitle: 'SELECTED INSERTION ZONE',
        emptySelectionText: 'Select a spawn point on the map',
        readySelectionText: 'Insertion route confirmed',
        countdownLabel: 'Deployment available in',
        readyLabel: 'Ready for deployment',
        actionLabel: kind === 'initial' ? 'PLAN INSERTION' : 'DEPLOY',
        secondaryActionLabel: kind === 'initial' ? 'BACK TO MODE SELECT' : null,
        allowSpawnSelection: true,
        allowLoadoutEditing: true,
        sequenceTitle: kind === 'initial' ? 'Deployment Checklist' : 'Redeploy Checklist',
        sequenceSteps: [
          'Choose an insertion zone before deployment begins.',
          'Configure 2 weapons and 1 equipment slot before deployment.',
          kind === 'initial'
            ? 'Insert once the staging plan and loadout are confirmed.'
            : 'Redeploy as soon as the timer clears.',
        ],
      }));
      vi.mocked(mockZoneManager.getAllZones).mockReturnValue([
        createMockZone('us_hq_main', 'US Main HQ', new THREE.Vector3(0, 0, -1400), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
        createMockZone('us_hq_west', 'US West FOB', new THREE.Vector3(-1000, 0, -800), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
        createMockZone('us_hq_east', 'US East FOB', new THREE.Vector3(1000, 0, -800), ZoneState.BLUFOR_CONTROLLED, true, Faction.US),
      ] as any);

      void respawnManager.beginInitialDeploy();

      expect(respawnManager['selectedSpawnPoint']).toBe('helipad_main');
      expect(mockRespawnUI.updateSelectedSpawn).toHaveBeenCalledWith('Helipad: UH1 HUEY');
    });

    it('routes deploy loadout edits through the loadout service', async () => {
      await respawnManager.init();
      respawnManager.setInventoryManager(mockInventoryManager);
      respawnManager.onPlayerDeath();

      const callback = vi.mocked((mockRespawnUI as any).setLoadoutChangeCallback).mock.calls[0][0];
      callback('equipment', 1);

      expect((mockInventoryManager as any).setLoadout).toHaveBeenCalledWith(expect.objectContaining({
        equipment: LoadoutEquipment.MORTAR_KIT,
      }));
      expect((mockRespawnUI as any).updateLoadout).toHaveBeenLastCalledWith(expect.objectContaining({
        equipment: LoadoutEquipment.MORTAR_KIT,
      }));
      expect((mockRespawnUI as any).updateLoadoutPresentation).toHaveBeenCalled();
    });

    it('routes preset cycling through the loadout service', async () => {
      await respawnManager.init();
      respawnManager.setInventoryManager(mockInventoryManager);
      respawnManager.onPlayerDeath();

      const callback = vi.mocked((mockRespawnUI as any).setPresetCycleCallback).mock.calls[0][0];
      callback(1);

      expect((mockLoadoutService as any).cyclePreset).toHaveBeenCalledWith(1);
      expect((mockInventoryManager as any).setLoadout).toHaveBeenCalledWith(expect.objectContaining({
        primaryWeapon: LoadoutWeapon.SMG,
        secondaryWeapon: LoadoutWeapon.PISTOL,
        equipment: LoadoutEquipment.SMOKE_GRENADE,
      }));
      expect((mockRespawnUI as any).updateLoadout).toHaveBeenLastCalledWith(expect.objectContaining({
        equipment: LoadoutEquipment.SMOKE_GRENADE,
      }));
    });

    it('routes preset saves through the loadout service', async () => {
      await respawnManager.init();
      respawnManager.onPlayerDeath();

      const callback = vi.mocked((mockRespawnUI as any).setPresetSaveCallback).mock.calls[0][0];
      callback();

      expect((mockLoadoutService as any).saveCurrentToActivePreset).toHaveBeenCalled();
      expect((mockRespawnUI as any).updateLoadoutPresentation).toHaveBeenCalled();
    });

    it('resolves initial deploy instead of respawning immediately', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      try {
        const deployPromise = respawnManager.beginInitialDeploy();
        respawnManager['confirmRespawn']();

        await expect(deployPromise).resolves.toEqual(expect.objectContaining({
          x: 0,
          z: -50,
        }));
        expect(mockPlayerController.setPosition).not.toHaveBeenCalled();
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('auto-confirms initial deploy when perf diagnostics are enabled', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      (globalThis as any).__ENABLE_PERF_DIAGNOSTICS__ = true;
      try {
        const deployPromise = respawnManager.beginInitialDeploy();

        await expect(deployPromise).resolves.toEqual(expect.objectContaining({
          x: 0,
          z: -50,
        }));
        expect(mockRespawnUI.show).toHaveBeenCalled();
        expect(mockRespawnUI.hide).toHaveBeenCalled();
        expect(mockPlayerController.setPosition).not.toHaveBeenCalled();
      } finally {
        delete (globalThis as any).__ENABLE_PERF_DIAGNOSTICS__;
        randomSpy.mockRestore();
      }
    });

    it('rejects initial deploy when the player backs out to mode select', async () => {
      await respawnManager.init();

      const deployPromise = respawnManager.beginInitialDeploy();
      const callback = vi.mocked((mockRespawnUI as any).setCancelClickCallback).mock.calls[0][0];
      callback();

      await expect(deployPromise).rejects.toBeInstanceOf(InitialDeployCancelledError);
      expect(mockRespawnUI.hide).toHaveBeenCalled();
      expect(mockMapController.clearSelection).toHaveBeenCalled();
      expect(mockMapController.stopMapUpdateInterval).toHaveBeenCalled();
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

    it('should handle spawn protection without player health system', () => {
      respawnManager.setZoneManager(mockZoneManager);
      respawnManager.setPlayerController(mockPlayerController);
      respawnManager.setGameModeManager(mockGameModeManager);

      expect(() => respawnManager.respawnAtBase()).not.toThrow();
    });

    it('should apply terrain height offset correctly', () => {
      const testRespawnManager = new PlayerRespawnManager(mockScene, mockCamera);
      const terrainRuntime = {
        getHeightAt: vi.fn(() => 10),
        getEffectiveHeightAt: vi.fn(() => 10),
        getPlayableWorldSize: vi.fn(() => 400),
        getWorldSize: vi.fn(() => 400),
        isTerrainReady: vi.fn(() => true),
        hasTerrainAt: vi.fn(() => true),
        getActiveTerrainTileCount: vi.fn(() => 0),
        setSurfaceWetness: vi.fn(),
        updatePlayerPosition: vi.fn(),
        registerCollisionObject: vi.fn(),
        unregisterCollisionObject: vi.fn(),
        raycastTerrain: vi.fn(() => ({ hit: false })),
      } as ITerrainRuntime;

      // Inject mocks
      (testRespawnManager as any).respawnUI = mockRespawnUI;
      (testRespawnManager as any).mapController = mockMapController;

      testRespawnManager.setZoneManager(mockZoneManager);
      testRespawnManager.setPlayerController(mockPlayerController);
      testRespawnManager.setTerrainSystem(terrainRuntime);

      testRespawnManager.respawnAtBase();

      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];
      expect(callPosition.y).toBe(12); // terrain height (10) + player offset (2)
    });

    it('prefers effective terrain height for respawn grounding', () => {
      const testRespawnManager = new PlayerRespawnManager(mockScene, mockCamera);
      const terrainRuntime = {
        getHeightAt: vi.fn(() => 4),
        getEffectiveHeightAt: vi.fn(() => 11),
        getPlayableWorldSize: vi.fn(() => 400),
        getWorldSize: vi.fn(() => 400),
        isTerrainReady: vi.fn(() => true),
        hasTerrainAt: vi.fn(() => true),
        getActiveTerrainTileCount: vi.fn(() => 0),
        setSurfaceWetness: vi.fn(),
        updatePlayerPosition: vi.fn(),
        registerCollisionObject: vi.fn(),
        unregisterCollisionObject: vi.fn(),
        raycastTerrain: vi.fn(() => ({ hit: false })),
      } as ITerrainRuntime;

      (testRespawnManager as any).respawnUI = mockRespawnUI;
      (testRespawnManager as any).mapController = mockMapController;

      testRespawnManager.setZoneManager(mockZoneManager);
      testRespawnManager.setPlayerController(mockPlayerController);
      testRespawnManager.setTerrainSystem(terrainRuntime);

      testRespawnManager.respawnAtBase();

      const callPosition = vi.mocked(mockPlayerController.setPosition).mock.calls[0][0];
      expect(terrainRuntime.getEffectiveHeightAt).toHaveBeenCalled();
      expect(callPosition.y).toBe(13);
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
