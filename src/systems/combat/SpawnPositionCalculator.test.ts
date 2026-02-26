import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpawnPositionCalculator } from './SpawnPositionCalculator';
import { Faction, Alliance } from './types';
import { ZoneManager, ZoneState, CaptureZone } from '../world/ZoneManager';
import { GameModeConfig } from '../../config/gameModeTypes';
import * as THREE from 'three';

vi.mock('three', () => ({
  Vector3: class {
    x: number; y: number; z: number;
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new (this.constructor as any)(this.x, this.y, this.z); }
    subVectors(a: any, b: any) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    distanceTo(v: any) { return Math.sqrt((this.x-v.x)**2 + (this.y-v.y)**2 + (this.z-v.z)**2); }
    normalize() { const l = Math.sqrt(this.x**2+this.y**2+this.z**2); if(l>0){this.x/=l;this.y/=l;this.z/=l;} return this; }
    length() { return Math.sqrt(this.x**2+this.y**2+this.z**2); }
  }
}));

vi.mock('../../utils/Logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function createMockZone(id: string, owner: Faction | null, position: THREE.Vector3, isHomeBase = false, state = ZoneState.NEUTRAL): CaptureZone {
  return {
    id,
    name: id,
    position,
    radius: 30,
    height: 10,
    owner,
    state,
    captureProgress: 0,
    captureSpeed: 1,
    currentFlagHeight: 0,
    isHomeBase,
    ticketBleedRate: 0,
  };
}

function createMockZoneManager(zones: CaptureZone[]): ZoneManager {
  return {
    getAllZones: vi.fn(() => zones),
  } as unknown as ZoneManager;
}

describe('SpawnPositionCalculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBasePositions', () => {
    it('should return default positions when no config provided', () => {
      const result = SpawnPositionCalculator.getBasePositions();
      
      expect(result.usBasePos.x).toBe(0);
      expect(result.usBasePos.y).toBe(0);
      expect(result.usBasePos.z).toBe(-50);
      expect(result.opforBasePos.x).toBe(0);
      expect(result.opforBasePos.y).toBe(0);
      expect(result.opforBasePos.z).toBe(145);
    });

    it('should return config-based positions when gameModeConfig has valid zones', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'us_main', position: new THREE.Vector3(10, 0, 20), isHomeBase: true, owner: Faction.US, radius: 30 } as any,
          { id: 'opfor_main', position: new THREE.Vector3(30, 0, 40), isHomeBase: true, owner: Faction.NVA, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getBasePositions(config);
      
      expect(result.usBasePos.x).toBe(10);
      expect(result.usBasePos.z).toBe(20);
      expect(result.opforBasePos.x).toBe(30);
      expect(result.opforBasePos.z).toBe(40);
    });

    it('should return config positions for us_base and opfor_base IDs', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'us_base', position: new THREE.Vector3(5, 0, 10), isHomeBase: true, owner: Faction.US, radius: 30 } as any,
          { id: 'opfor_base', position: new THREE.Vector3(15, 0, 20), isHomeBase: true, owner: Faction.NVA, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getBasePositions(config);
      
      expect(result.usBasePos.x).toBe(5);
      expect(result.usBasePos.z).toBe(10);
      expect(result.opforBasePos.x).toBe(15);
      expect(result.opforBasePos.z).toBe(20);
    });

    it('should fall back to defaults when config zones do not match criteria', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'zone1', position: new THREE.Vector3(10, 0, 20), isHomeBase: false, owner: Faction.US, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getBasePositions(config);
      
      expect(result.usBasePos.z).toBe(-50);
      expect(result.opforBasePos.z).toBe(145);
    });

    it('should fall back when only one base is found', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'us_main', position: new THREE.Vector3(10, 0, 20), isHomeBase: true, owner: Faction.US, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getBasePositions(config);
      
      expect(result.usBasePos.z).toBe(-50);
      expect(result.opforBasePos.z).toBe(145);
    });
  });

  describe('getBaseSpawnPosition', () => {
    it('should return position near owned home base when zoneManager has matching bases', () => {
      const basePos = new THREE.Vector3(100, 0, 100);
      const zones = [createMockZone('us_base', Faction.US, basePos, true)];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getBaseSpawnPosition(Faction.US, zoneManager);
      
      const distance = result.distanceTo(basePos);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(50);
      expect(result.y).toBe(0);
    });

    it('should fall back to default position when no zoneManager provided', () => {
      const result = SpawnPositionCalculator.getBaseSpawnPosition(Faction.US);
      
      const defaultBase = new THREE.Vector3(0, 0, -50);
      const distance = result.distanceTo(defaultBase);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(50);
    });

    it('should fall back when no owned bases found for faction', () => {
      const zones = [createMockZone('opfor_base', Faction.NVA, new THREE.Vector3(100, 0, 100), true)];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getBaseSpawnPosition(Faction.US, zoneManager);
      
      const defaultBase = new THREE.Vector3(0, 0, -50);
      const distance = result.distanceTo(defaultBase);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(50);
    });

    it('should return position within expected radius of base', () => {
      const basePos = new THREE.Vector3(50, 0, 50);
      const zones = [createMockZone('us_base', Faction.US, basePos, true)];
      const zoneManager = createMockZoneManager(zones);

      for (let i = 0; i < 10; i++) {
        const result = SpawnPositionCalculator.getBaseSpawnPosition(Faction.US, zoneManager);
        const distance = result.distanceTo(basePos);
        expect(distance).toBeGreaterThanOrEqual(20);
        expect(distance).toBeLessThanOrEqual(50);
      }
    });

    it('should work for both US and OPFOR factions', () => {
      const usBase = new THREE.Vector3(-100, 0, -100);
      const opforBase = new THREE.Vector3(100, 0, 100);
      const zones = [
        createMockZone('us_base', Faction.US, usBase, true),
        createMockZone('opfor_base', Faction.NVA, opforBase, true),
      ];
      const zoneManager = createMockZoneManager(zones);

      const usResult = SpawnPositionCalculator.getBaseSpawnPosition(Faction.US, zoneManager);
      const usDistance = usResult.distanceTo(usBase);
      expect(usDistance).toBeGreaterThanOrEqual(20);
      expect(usDistance).toBeLessThanOrEqual(50);

      const opforResult = SpawnPositionCalculator.getBaseSpawnPosition(Faction.NVA, zoneManager);
      const opforDistance = opforResult.distanceTo(opforBase);
      expect(opforDistance).toBeGreaterThanOrEqual(20);
      expect(opforDistance).toBeLessThanOrEqual(50);
    });

    it('should use gameModeConfig for fallback positions', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'us_main', position: new THREE.Vector3(200, 0, 200), isHomeBase: true, owner: Faction.US, radius: 30 } as any,
          { id: 'opfor_main', position: new THREE.Vector3(300, 0, 300), isHomeBase: true, owner: Faction.NVA, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getBaseSpawnPosition(Faction.US, undefined, config);
      
      const configBase = new THREE.Vector3(200, 0, 200);
      const distance = result.distanceTo(configBase);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(50);
    });

    it('should randomly select from multiple owned bases', () => {
      const base1 = new THREE.Vector3(100, 0, 100);
      const base2 = new THREE.Vector3(200, 0, 200);
      const zones = [
        createMockZone('us_base1', Faction.US, base1, true),
        createMockZone('us_base2', Faction.US, base2, true),
      ];
      const zoneManager = createMockZoneManager(zones);

      const positions = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = SpawnPositionCalculator.getBaseSpawnPosition(Faction.US, zoneManager);
        const dist1 = result.distanceTo(base1);
        const dist2 = result.distanceTo(base2);
        
        if (dist1 < dist2) {
          positions.add('base1');
        } else {
          positions.add('base2');
        }
      }

      expect(positions.size).toBeGreaterThan(1);
    });
  });

  describe('getSpawnPosition', () => {
    it('should prefer contested zones over captured zones', () => {
      const contestedPos = new THREE.Vector3(50, 0, 50);
      const capturedPos = new THREE.Vector3(500, 0, 500);
      const zones = [
        createMockZone('captured', Faction.US, capturedPos, false, ZoneState.US_CONTROLLED),
        createMockZone('contested', Faction.US, contestedPos, false, ZoneState.CONTESTED),
      ];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getSpawnPosition(Faction.US, zoneManager);

      const distContested = result.distanceTo(contestedPos);
      const distCaptured = result.distanceTo(capturedPos);
      expect(distContested).toBeLessThan(distCaptured);
    });

    it('should prefer captured zones over HQ zones', () => {
      const hqPos = new THREE.Vector3(500, 0, 500);
      const capturedPos = new THREE.Vector3(100, 0, 100);
      const zones = [
        createMockZone('hq', Faction.US, hqPos, true, ZoneState.US_CONTROLLED),
        createMockZone('captured', Faction.US, capturedPos, false, ZoneState.US_CONTROLLED),
      ];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getSpawnPosition(Faction.US, zoneManager);

      const distHq = result.distanceTo(hqPos);
      const distCaptured = result.distanceTo(capturedPos);
      expect(distCaptured).toBeLessThan(distHq);
    });

    it('should fall back to base position when no zones owned', () => {
      const zones = [
        createMockZone('zone1', Faction.NVA, new THREE.Vector3(100, 0, 100), false),
      ];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getSpawnPosition(Faction.US, zoneManager);
      
      const defaultBase = new THREE.Vector3(0, 0, -50);
      const distance = result.distanceTo(defaultBase);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(50);
    });

    it('should fall back when no zoneManager', () => {
      const result = SpawnPositionCalculator.getSpawnPosition(Faction.US);
      
      const defaultBase = new THREE.Vector3(0, 0, -50);
      const distance = result.distanceTo(defaultBase);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(50);
    });

    it('should return position within expected radius of anchor zone', () => {
      const zonePos = new THREE.Vector3(75, 0, 75);
      const zones = [createMockZone('zone1', Faction.US, zonePos, false, ZoneState.US_CONTROLLED)];
      const zoneManager = createMockZoneManager(zones);

      for (let i = 0; i < 10; i++) {
        const result = SpawnPositionCalculator.getSpawnPosition(Faction.US, zoneManager);
        const distance = result.distanceTo(zonePos);
        expect(distance).toBeGreaterThanOrEqual(20);
        expect(distance).toBeLessThanOrEqual(60);
      }
    });

    it('should use HQ zone when no other zones available', () => {
      const hqPos = new THREE.Vector3(50, 0, 50);
      const zones = [createMockZone('hq', Faction.US, hqPos, true, ZoneState.US_CONTROLLED)];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getSpawnPosition(Faction.US, zoneManager);
      
      const distance = result.distanceTo(hqPos);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(60);
    });

    it('should work for OPFOR faction', () => {
      const zonePos = new THREE.Vector3(150, 0, 150);
      const zones = [createMockZone('zone1', Faction.NVA, zonePos, false, ZoneState.OPFOR_CONTROLLED)];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getSpawnPosition(Faction.NVA, zoneManager);
      
      const distance = result.distanceTo(zonePos);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(60);
    });

    it('should use gameModeConfig for fallback', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'us_main', position: new THREE.Vector3(250, 0, 250), isHomeBase: true, owner: Faction.US, radius: 30 } as any,
          { id: 'opfor_main', position: new THREE.Vector3(350, 0, 350), isHomeBase: true, owner: Faction.NVA, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getSpawnPosition(Faction.NVA, undefined, config);
      
      const configBase = new THREE.Vector3(350, 0, 350);
      const distance = result.distanceTo(configBase);
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThanOrEqual(50);
    });
  });

  describe('getFactionAnchors', () => {
    it('should return empty array when no zoneManager', () => {
      const result = SpawnPositionCalculator.getFactionAnchors(Faction.US);
      
      expect(result).toEqual([]);
    });

    it('should return zones in correct priority order (contested, captured, HQ)', () => {
      const contestedPos = new THREE.Vector3(50, 0, 50);
      const capturedPos = new THREE.Vector3(100, 0, 100);
      const hqPos = new THREE.Vector3(150, 0, 150);
      const zones = [
        createMockZone('hq', Faction.US, hqPos, true, ZoneState.US_CONTROLLED),
        createMockZone('captured', Faction.US, capturedPos, false, ZoneState.US_CONTROLLED),
        createMockZone('contested', Faction.US, contestedPos, false, ZoneState.CONTESTED),
      ];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getFactionAnchors(Faction.US, zoneManager);
      
      expect(result.length).toBe(3);
      expect(result[0]).toBe(contestedPos);
      expect(result[1]).toBe(capturedPos);
      expect(result[2]).toBe(hqPos);
    });

    it('should filter to only owned zones', () => {
      const usPos = new THREE.Vector3(50, 0, 50);
      const opforPos = new THREE.Vector3(100, 0, 100);
      const zones = [
        createMockZone('us_zone', Faction.US, usPos, false, ZoneState.US_CONTROLLED),
        createMockZone('opfor_zone', Faction.NVA, opforPos, false, ZoneState.OPFOR_CONTROLLED),
      ];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getFactionAnchors(Faction.US, zoneManager);
      
      expect(result.length).toBe(1);
      expect(result[0]).toBe(usPos);
    });

    it('should return empty array when faction owns no zones', () => {
      const zones = [
        createMockZone('opfor_zone', Faction.NVA, new THREE.Vector3(100, 0, 100), false),
      ];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getFactionAnchors(Faction.US, zoneManager);
      
      expect(result).toEqual([]);
    });

    it('should handle multiple zones of same type', () => {
      const contested1 = new THREE.Vector3(50, 0, 50);
      const contested2 = new THREE.Vector3(60, 0, 60);
      const zones = [
        createMockZone('contested1', Faction.US, contested1, false, ZoneState.CONTESTED),
        createMockZone('contested2', Faction.US, contested2, false, ZoneState.CONTESTED),
      ];
      const zoneManager = createMockZoneManager(zones);

      const result = SpawnPositionCalculator.getFactionAnchors(Faction.US, zoneManager);
      
      expect(result.length).toBe(2);
      expect(result).toContain(contested1);
      expect(result).toContain(contested2);
    });
  });

  describe('getHQZonesForAlliance', () => {
    it('should return home bases for specified alliance', () => {
      const usHq = new THREE.Vector3(100, 0, 100);
      const config: GameModeConfig = {
        zones: [
          { id: 'us_hq', position: usHq, isHomeBase: true, owner: Faction.US, radius: 30 } as any,
          { id: 'opfor_hq', position: new THREE.Vector3(200, 0, 200), isHomeBase: true, owner: Faction.NVA, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getHQZonesForAlliance(Alliance.BLUFOR, config);
      
      expect(result.length).toBe(1);
      expect(result[0].position).toBe(usHq);
    });

    it('should return empty array when no config', () => {
      const result = SpawnPositionCalculator.getHQZonesForAlliance(Alliance.BLUFOR);
      
      expect(result).toEqual([]);
    });

    it('should return empty array when no matching HQ zones', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'zone1', position: new THREE.Vector3(100, 0, 100), isHomeBase: false, owner: Faction.US, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getHQZonesForAlliance(Alliance.BLUFOR, config);
      
      expect(result).toEqual([]);
    });

    it('should filter by alliance', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'us_hq', position: new THREE.Vector3(100, 0, 100), isHomeBase: true, owner: Faction.US, radius: 30 } as any,
          { id: 'opfor_hq', position: new THREE.Vector3(200, 0, 200), isHomeBase: true, owner: Faction.NVA, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const usResult = SpawnPositionCalculator.getHQZonesForAlliance(Alliance.BLUFOR, config);
      const opforResult = SpawnPositionCalculator.getHQZonesForAlliance(Alliance.OPFOR, config);
      
      expect(usResult.length).toBe(1);
      expect(opforResult.length).toBe(1);
      expect(usResult[0].position.x).toBe(100);
      expect(opforResult[0].position.x).toBe(200);
    });

    it('should return multiple HQs for same alliance', () => {
      const config: GameModeConfig = {
        zones: [
          { id: 'us_hq1', position: new THREE.Vector3(100, 0, 100), isHomeBase: true, owner: Faction.US, radius: 30 } as any,
          { id: 'us_hq2', position: new THREE.Vector3(150, 0, 150), isHomeBase: true, owner: Faction.US, radius: 30 } as any,
        ],
      } as GameModeConfig;

      const result = SpawnPositionCalculator.getHQZonesForAlliance(Alliance.BLUFOR, config);
      
      expect(result.length).toBe(2);
    });
  });

  describe('randomSquadSize', () => {
    it('should return integer within [min, max] range', () => {
      for (let i = 0; i < 50; i++) {
        const result = SpawnPositionCalculator.randomSquadSize(3, 8);
        expect(result).toBeGreaterThanOrEqual(3);
        expect(result).toBeLessThanOrEqual(8);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('should return min when min equals max', () => {
      const result = SpawnPositionCalculator.randomSquadSize(5, 5);
      expect(result).toBe(5);
    });

    it('should handle min=1, max=1', () => {
      const result = SpawnPositionCalculator.randomSquadSize(1, 1);
      expect(result).toBe(1);
    });

    it('should produce varied results', () => {
      const results = new Set<number>();
      for (let i = 0; i < 100; i++) {
        results.add(SpawnPositionCalculator.randomSquadSize(1, 10));
      }
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('getAverageSquadSize', () => {
    it('should return rounded average of min and max', () => {
      expect(SpawnPositionCalculator.getAverageSquadSize(3, 7)).toBe(5);
      expect(SpawnPositionCalculator.getAverageSquadSize(4, 8)).toBe(6);
      expect(SpawnPositionCalculator.getAverageSquadSize(2, 5)).toBe(4);
    });

    it('should handle equal min and max', () => {
      expect(SpawnPositionCalculator.getAverageSquadSize(5, 5)).toBe(5);
    });

    it('should round correctly', () => {
      expect(SpawnPositionCalculator.getAverageSquadSize(3, 8)).toBe(6);
      expect(SpawnPositionCalculator.getAverageSquadSize(3, 9)).toBe(6);
    });

    it('should handle large values', () => {
      expect(SpawnPositionCalculator.getAverageSquadSize(100, 200)).toBe(150);
    });
  });

  describe('randomSpawnOffset', () => {
    it('should return vector with correct radius range', () => {
      for (let i = 0; i < 50; i++) {
        const result = SpawnPositionCalculator.randomSpawnOffset(10, 30);
        const length = result.length();
        expect(length).toBeGreaterThanOrEqual(10);
        expect(length).toBeLessThanOrEqual(30);
      }
    });

    it('should use provided target vector when given', () => {
      const target = new THREE.Vector3();
      const result = SpawnPositionCalculator.randomSpawnOffset(10, 20, target);
      
      expect(result).toBe(target);
    });

    it('should have Y component always 0', () => {
      for (let i = 0; i < 20; i++) {
        const result = SpawnPositionCalculator.randomSpawnOffset(5, 15);
        expect(result.y).toBe(0);
      }
    });

    it('should produce varied angles', () => {
      const angles = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const result = SpawnPositionCalculator.randomSpawnOffset(10, 10);
        const angle = Math.atan2(result.z, result.x);
        angles.add(Math.round(angle * 100) / 100);
      }
      expect(angles.size).toBeGreaterThan(10);
    });

    it('should handle minRadius equal to maxRadius', () => {
      const result = SpawnPositionCalculator.randomSpawnOffset(15, 15);
      const length = result.length();
      expect(Math.abs(length - 15)).toBeLessThan(0.01);
    });

    it('should handle very small radius', () => {
      const result = SpawnPositionCalculator.randomSpawnOffset(0.1, 0.5);
      const length = result.length();
      expect(length).toBeGreaterThanOrEqual(0.1);
      expect(length).toBeLessThanOrEqual(0.5);
    });

    it('should handle very large radius', () => {
      const result = SpawnPositionCalculator.randomSpawnOffset(1000, 2000);
      const length = result.length();
      expect(length).toBeGreaterThanOrEqual(1000);
      expect(length).toBeLessThanOrEqual(2000);
    });
  });
});
