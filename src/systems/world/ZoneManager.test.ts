import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZoneManager, ZoneState, CaptureZone } from './ZoneManager';
import { Faction, CombatantState } from '../combat/types';
import * as THREE from 'three';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock ZoneRenderer
vi.mock('./ZoneRenderer', () => ({
  ZoneRenderer: class {
    createZoneVisuals = vi.fn();
    updateZoneVisuals = vi.fn();
    updateZonePositions = vi.fn();
    animateFlags = vi.fn();
    disposeZoneVisuals = vi.fn();
    dispose = vi.fn();
  },
}));

// Mock ZoneCaptureLogic
vi.mock('./ZoneCaptureLogic', () => ({
  ZoneCaptureLogic: class {
    updateZoneCaptureState = vi.fn();
    calculateTicketBleedRate = vi.fn(() => ({ us: 0, opfor: 0 }));
  },
}));

// Mock ZoneTerrainAdapter
vi.mock('./ZoneTerrainAdapter', () => ({
  ZoneTerrainAdapter: class {
    getTerrainHeight = vi.fn(() => 0);
    setChunkManager = vi.fn();
  },
}));

// Mock ZoneInitializer
vi.mock('./ZoneInitializer', () => ({
  ZoneInitializer: class {
    createDefaultZones = vi.fn();
    createZonesFromConfig = vi.fn();
    setGameModeConfig = vi.fn();
  },
}));

describe('ZoneManager', () => {
  let zoneManager: ZoneManager;
  let mockScene: THREE.Scene;
  let mockCamera: THREE.Camera;
  let mockSpatialGrid: any;
  let mockCombatantSystem: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockScene = new THREE.Scene();
    mockCamera = new THREE.PerspectiveCamera();
    mockCamera.position.set(0, 0, 0);

    mockSpatialGrid = {
      queryRadius: vi.fn(() => []),
    };

    mockCombatantSystem = {
      combatants: new Map(),
    };

    zoneManager = new ZoneManager(mockScene);
    zoneManager.setCamera(mockCamera);
    zoneManager.setSpatialGridManager(mockSpatialGrid);
    zoneManager.setCombatantSystem(mockCombatantSystem);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty zones', () => {
      expect(zoneManager.getAllZones()).toHaveLength(0);
    });

    it('should initialize successfully', async () => {
      await expect(zoneManager.init()).resolves.toBeUndefined();
    });

    it('should create zones when initializeZones is called with chunk manager', () => {
      const mockChunkManager = { getHeightAt: vi.fn(() => 0) } as any;
      zoneManager.setChunkManager(mockChunkManager);
      zoneManager.initializeZones();
      
      // Should have called createDefaultZones
      expect(zoneManager['zoneInitializer'].createDefaultZones).toHaveBeenCalled();
    });
  });

  describe('Zone Creation and Management', () => {
    beforeEach(() => {
      // Manually add zones for testing
      const zone: CaptureZone = {
        id: 'test_zone',
        name: 'Test Zone',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);
      zoneManager['occupants'].set(zone.id, { us: 0, opfor: 0 });
    });

    it('should return all zones', () => {
      const zones = zoneManager.getAllZones();
      expect(zones).toHaveLength(1);
      expect(zones[0].id).toBe('test_zone');
    });

    it('should get zone at position', () => {
      const zone = zoneManager.getZoneAtPosition(new THREE.Vector3(5, 0, 5));
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('test_zone');
    });

    it('should return null for position outside zone radius', () => {
      const zone = zoneManager.getZoneAtPosition(new THREE.Vector3(100, 0, 100));
      expect(zone).toBeNull();
    });

    it('should get zones by owner', () => {
      const zone = zoneManager['zones'].get('test_zone')!;
      zone.owner = Faction.US;

      const usZones = zoneManager.getZonesByOwner(Faction.US);
      expect(usZones).toHaveLength(1);
      expect(usZones[0].owner).toBe(Faction.US);

      const opforZones = zoneManager.getZonesByOwner(Faction.OPFOR);
      expect(opforZones).toHaveLength(0);
    });

    it('should get nearest capturable zone', () => {
      const zone2: CaptureZone = {
        id: 'zone2',
        name: 'Zone 2',
        position: new THREE.Vector3(50, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone2.id, zone2);

      const nearest = zoneManager.getNearestCapturableZone(new THREE.Vector3(0, 0, 0));
      expect(nearest?.id).toBe('test_zone');
    });

    it('should exclude home bases from nearest capturable zone', () => {
      const zone = zoneManager['zones'].get('test_zone')!;
      zone.isHomeBase = true;

      const nearest = zoneManager.getNearestCapturableZone(new THREE.Vector3(0, 0, 0));
      expect(nearest).toBeNull();
    });

    it('should exclude owned zones when faction is specified', () => {
      const zone = zoneManager['zones'].get('test_zone')!;
      zone.owner = Faction.US;

      const nearest = zoneManager.getNearestCapturableZone(new THREE.Vector3(0, 0, 0), Faction.US);
      expect(nearest).toBeNull();
    });
  });

  describe('Occupancy Updates', () => {
    beforeEach(() => {
      const zone: CaptureZone = {
        id: 'test_zone',
        name: 'Test Zone',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);
      zoneManager['occupants'].set(zone.id, { us: 0, opfor: 0 });
    });

    it('should query spatial grid for combatants in zone', () => {
      mockSpatialGrid.queryRadius.mockReturnValue(['combatant1', 'combatant2']);
      mockCombatantSystem.combatants.set('combatant1', {
        faction: Faction.US,
        state: CombatantState.ALIVE,
      });
      mockCombatantSystem.combatants.set('combatant2', {
        faction: Faction.OPFOR,
        state: CombatantState.ALIVE,
      });

      zoneManager.update(0.15); // Trigger occupancy update (>100ms)

      expect(mockSpatialGrid.queryRadius).toHaveBeenCalled();
      const occupants = zoneManager['occupants'].get('test_zone');
      expect(occupants?.us).toBe(1);
      expect(occupants?.opfor).toBe(1);
    });

    it('should skip dead combatants', () => {
      mockSpatialGrid.queryRadius.mockReturnValue(['combatant1', 'combatant2']);
      mockCombatantSystem.combatants.set('combatant1', {
        faction: Faction.US,
        state: CombatantState.DEAD,
      });
      mockCombatantSystem.combatants.set('combatant2', {
        faction: Faction.OPFOR,
        state: CombatantState.ALIVE,
      });

      zoneManager.update(0.15);

      const occupants = zoneManager['occupants'].get('test_zone');
      expect(occupants?.us).toBe(0);
      expect(occupants?.opfor).toBe(1);
    });

    it('should throttle occupancy updates to 100ms', () => {
      mockSpatialGrid.queryRadius.mockReturnValue(['combatant1']);
      mockCombatantSystem.combatants.set('combatant1', {
        faction: Faction.US,
        state: CombatantState.ALIVE,
      });

      zoneManager.update(0.05); // 50ms
      expect(mockSpatialGrid.queryRadius).not.toHaveBeenCalled();

      zoneManager.update(0.06); // Total 110ms
      expect(mockSpatialGrid.queryRadius).toHaveBeenCalled();
    });

    it('should manually update occupants via updateOccupants', () => {
      zoneManager.updateOccupants('test_zone', 5, 3);
      
      const occupants = zoneManager['occupants'].get('test_zone');
      expect(occupants?.us).toBe(5);
      expect(occupants?.opfor).toBe(3);
    });

    it('should handle missing combatants gracefully', () => {
      mockSpatialGrid.queryRadius.mockReturnValue(['nonexistent']);

      expect(() => zoneManager.update(0.15)).not.toThrow();
    });

    it('should fallback to player position when no combatant system', () => {
      zoneManager.setCombatantSystem(undefined as any);
      mockCamera.position.set(5, 0, 5); // Within zone radius

      zoneManager.update(0.15);

      const occupants = zoneManager['occupants'].get('test_zone');
      expect(occupants?.us).toBe(1);
      expect(occupants?.opfor).toBe(0);
    });
  });

  describe('Capture Mechanics', () => {
    beforeEach(() => {
      const zone: CaptureZone = {
        id: 'test_zone',
        name: 'Test Zone',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);
      zoneManager['occupants'].set(zone.id, { us: 0, opfor: 0 });
    });

    it('should call capture logic on update', () => {
      zoneManager.updateOccupants('test_zone', 2, 0);
      zoneManager.update(0.05); // Don't trigger occupancy update

      expect(zoneManager['captureLogic'].updateZoneCaptureState).toHaveBeenCalled();
      const callArgs = (zoneManager['captureLogic'].updateZoneCaptureState as any).mock.calls[0];
      expect(callArgs[0].id).toBe('test_zone');
      expect(callArgs[1]).toEqual({ us: 2, opfor: 0 });
      expect(callArgs[2]).toBe(0.05);
    });

    it('should not update capture state for home bases', () => {
      const zone = zoneManager['zones'].get('test_zone')!;
      zone.isHomeBase = true;

      zoneManager.updateOccupants('test_zone', 5, 0);
      zoneManager.update(1.0);

      // Capture logic is still called, but it should skip home bases internally
      expect(zoneManager['captureLogic'].updateZoneCaptureState).toHaveBeenCalled();
    });

    it('should update visuals after capture state changes', () => {
      zoneManager.updateOccupants('test_zone', 3, 1);
      zoneManager.update(0.05); // Don't trigger occupancy update

      expect(zoneManager['zoneRenderer'].updateZoneVisuals).toHaveBeenCalled();
      const callArgs = (zoneManager['zoneRenderer'].updateZoneVisuals as any).mock.calls[0];
      expect(callArgs[0].id).toBe('test_zone');
      expect(callArgs[1]).toEqual({ us: 3, opfor: 1 });
    });

    it('should animate flags on update', () => {
      zoneManager.update(1.0);
      expect(zoneManager['zoneRenderer'].animateFlags).toHaveBeenCalled();
    });
  });

  describe('Zone State Transitions', () => {
    beforeEach(() => {
      const zone: CaptureZone = {
        id: 'test_zone',
        name: 'Test Zone',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);
      zoneManager['occupants'].set(zone.id, { us: 0, opfor: 0 });
    });

    it('should track zone state changes', () => {
      const zone = zoneManager['zones'].get('test_zone')!;
      
      // Initial state
      expect(zone.state).toBe(ZoneState.NEUTRAL);
      
      // Simulate capture
      zone.owner = Faction.US;
      zone.state = ZoneState.US_CONTROLLED;
      zoneManager.update(0.1);
      
      expect(zoneManager['previousZoneState'].get('test_zone')).toBe(Faction.US);
    });

    it('should notify HUD system on zone capture', () => {
      const mockHUD = {
        addZoneCapture: vi.fn(),
      };
      zoneManager.setHUDSystem(mockHUD as any);

      const zone = zoneManager['zones'].get('test_zone')!;
      zoneManager['previousZoneState'].set('test_zone', null);
      
      // Simulate US capturing zone
      zone.owner = Faction.US;
      zone.state = ZoneState.US_CONTROLLED;
      
      zoneManager.update(0.1);
      
      expect(mockHUD.addZoneCapture).toHaveBeenCalledWith(zone.name, false);
    });

    it('should notify HUD when US loses a zone', () => {
      const mockHUD = {
        addZoneCapture: vi.fn(),
      };
      zoneManager.setHUDSystem(mockHUD as any);

      const zone = zoneManager['zones'].get('test_zone')!;
      zoneManager['previousZoneState'].set('test_zone', Faction.US);
      
      // Simulate OPFOR capturing zone from US
      zone.owner = Faction.OPFOR;
      zone.state = ZoneState.OPFOR_CONTROLLED;
      
      zoneManager.update(0.1);
      
      expect(mockHUD.addZoneCapture).toHaveBeenCalledWith(zone.name, true);
    });

    it('should not notify HUD for home base captures', () => {
      const mockHUD = {
        addZoneCapture: vi.fn(),
      };
      zoneManager.setHUDSystem(mockHUD as any);

      const zone = zoneManager['zones'].get('test_zone')!;
      zone.isHomeBase = true;
      zoneManager['previousZoneState'].set('test_zone', null);
      
      zone.owner = Faction.US;
      zone.state = ZoneState.US_CONTROLLED;
      
      zoneManager.update(0.1);
      
      expect(mockHUD.addZoneCapture).not.toHaveBeenCalled();
    });

    it('should not notify HUD when OPFOR captures neutral zone', () => {
      const mockHUD = {
        addZoneCapture: vi.fn(),
      };
      zoneManager.setHUDSystem(mockHUD as any);

      const zone = zoneManager['zones'].get('test_zone')!;
      zoneManager['previousZoneState'].set('test_zone', null);
      
      zone.owner = Faction.OPFOR;
      zone.state = ZoneState.OPFOR_CONTROLLED;
      
      zoneManager.update(0.1);
      
      expect(mockHUD.addZoneCapture).not.toHaveBeenCalled();
    });
  });

  describe('Ticket Bleed Rate', () => {
    it('should calculate ticket bleed rate from capture logic', () => {
      zoneManager['captureLogic'].calculateTicketBleedRate = vi.fn(() => ({
        us: 1.5,
        opfor: 0,
      }));

      const bleedRate = zoneManager.getTicketBleedRate();
      expect(bleedRate.us).toBe(1.5);
      expect(bleedRate.opfor).toBe(0);
    });
  });

  describe('Game Mode Configuration', () => {
    it('should set game mode config and recreate zones', () => {
      const mockConfig = {
        name: 'Test Mode',
        zones: [],
        captureRadius: 20,
        captureSpeed: 2,
      } as any;

      zoneManager.setGameModeConfig(mockConfig);

      expect(zoneManager['zoneInitializer'].setGameModeConfig).toHaveBeenCalledWith(mockConfig);
      expect(zoneManager['zoneInitializer'].createZonesFromConfig).toHaveBeenCalled();
    });

    it('should clear existing zones when setting new config', () => {
      const zone: CaptureZone = {
        id: 'old_zone',
        name: 'Old Zone',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);

      const mockConfig = {
        name: 'New Mode',
        zones: [],
      } as any;

      zoneManager.setGameModeConfig(mockConfig);

      expect(zoneManager['zoneRenderer'].disposeZoneVisuals).toHaveBeenCalled();
      expect(zoneManager['zones'].size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty zones map', () => {
      expect(() => zoneManager.update(1.0)).not.toThrow();
      expect(zoneManager.getAllZones()).toHaveLength(0);
    });

    it('should handle missing occupants data', () => {
      const zone: CaptureZone = {
        id: 'orphan_zone',
        name: 'Orphan',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);
      // Don't add to occupants map

      expect(() => zoneManager.update(1.0)).not.toThrow();
    });

    it('should handle zone with no combatants', () => {
      const zone: CaptureZone = {
        id: 'empty_zone',
        name: 'Empty',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);
      zoneManager['occupants'].set(zone.id, { us: 0, opfor: 0 });

      mockSpatialGrid.queryRadius.mockReturnValue([]);
      
      zoneManager.update(0.15);
      
      const occupants = zoneManager['occupants'].get('empty_zone');
      expect(occupants?.us).toBe(0);
      expect(occupants?.opfor).toBe(0);
    });

    it('should handle all zones captured by same faction', () => {
      const zone1: CaptureZone = {
        id: 'zone1',
        name: 'Zone 1',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: Faction.US,
        state: ZoneState.US_CONTROLLED,
        captureProgress: 100,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      const zone2: CaptureZone = {
        id: 'zone2',
        name: 'Zone 2',
        position: new THREE.Vector3(50, 0, 0),
        radius: 15,
        height: 20,
        owner: Faction.US,
        state: ZoneState.US_CONTROLLED,
        captureProgress: 100,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      
      zoneManager['zones'].set(zone1.id, zone1);
      zoneManager['zones'].set(zone2.id, zone2);
      zoneManager['occupants'].set(zone1.id, { us: 2, opfor: 0 });
      zoneManager['occupants'].set(zone2.id, { us: 3, opfor: 0 });

      const usZones = zoneManager.getZonesByOwner(Faction.US);
      expect(usZones).toHaveLength(2);
    });

    it('should update zone positions with terrain height', () => {
      const zone: CaptureZone = {
        id: 'terrain_zone',
        name: 'Terrain Zone',
        position: new THREE.Vector3(10, 0, 10),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);
      zoneManager['occupants'].set(zone.id, { us: 0, opfor: 0 });

      const mockChunkManager = { getHeightAt: vi.fn(() => 5) } as any;
      zoneManager.setChunkManager(mockChunkManager);

      zoneManager['terrainAdapter'].getTerrainHeight = vi.fn(() => 5);

      zoneManager.update(0.1);

      expect(zoneManager['zoneRenderer'].updateZonePositions).toHaveBeenCalled();
    });
  });

  describe('Disposal', () => {
    it('should dispose all zones and clean up resources', () => {
      const zone: CaptureZone = {
        id: 'disposable',
        name: 'Disposable',
        position: new THREE.Vector3(0, 0, 0),
        radius: 15,
        height: 20,
        owner: null,
        state: ZoneState.NEUTRAL,
        captureProgress: 0,
        captureSpeed: 1,
        isHomeBase: false,
        ticketBleedRate: 1,
        currentFlagHeight: 0,
      };
      zoneManager['zones'].set(zone.id, zone);

      zoneManager.dispose();

      expect(zoneManager['zoneRenderer'].disposeZoneVisuals).toHaveBeenCalled();
      expect(zoneManager['zoneRenderer'].dispose).toHaveBeenCalled();
      expect(zoneManager['zones'].size).toBe(0);
      expect(zoneManager['occupants'].size).toBe(0);
    });
  });
});
