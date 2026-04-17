import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { InfluenceMapSystem } from './InfluenceMapSystem';
import { Faction, Combatant } from './types';
import { CaptureZone, ZoneState } from '../world/ZoneManager';

global.document = {
  createElement: vi.fn(() => ({
    width: 0,
    height: 0,
    style: {},
    getContext: vi.fn(() => ({
      fillStyle: '',
      fillRect: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn()
    }))
  })),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn()
  },
  querySelectorAll: vi.fn(() => []),
  querySelector: vi.fn(() => null)
} as any;

function createMockCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3,
  state: string = 'idle'
): Combatant {
  return {
    id,
    faction,
    position,
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any
  } as Combatant;
}

function createMockZone(
  id: string,
  position: THREE.Vector3,
  owner: Faction | null = null,
  state: ZoneState = ZoneState.NEUTRAL,
  isHomeBase = false
): CaptureZone {
  return {
    id,
    name: `Zone ${id}`,
    position,
    radius: 20,
    height: 2,
    owner,
    state,
    captureProgress: 0,
    captureSpeed: 0,
    isHomeBase
  } as CaptureZone;
}

describe('InfluenceMapSystem', () => {
  let system: InfluenceMapSystem;
  const worldSize = 400;

  beforeEach(() => {
    system = new InfluenceMapSystem(worldSize);
  });

  describe('queryCellAt', () => {
    it('returns a cell with influence fields for positions inside the grid', () => {
      const cell = system.queryCellAt(new THREE.Vector3(0, 0, 0));
      expect(cell).not.toBeNull();
      expect(cell).toHaveProperty('threatLevel');
      expect(cell).toHaveProperty('opportunityLevel');
      expect(cell).toHaveProperty('coverValue');
      expect(cell).toHaveProperty('squadSupport');
      expect(cell).toHaveProperty('combinedScore');
    });

    it('returns null for positions outside the grid and valid cells at / inside the boundary', () => {
      expect(system.queryCellAt(new THREE.Vector3(1000, 0, 1000))).toBeNull();
      expect(system.queryCellAt(new THREE.Vector3(-201, 0, 0))).toBeNull();
      expect(system.queryCellAt(new THREE.Vector3(-199, 0, -199))).not.toBeNull();
      expect(system.queryCellAt(new THREE.Vector3(-100, 0, -100))).not.toBeNull();
    });

    it('returns the same cell instance for repeated queries at the same position', () => {
      const pos = new THREE.Vector3(50, 0, 75);
      expect(system.queryCellAt(pos)).toBe(system.queryCellAt(pos));
    });
  });

  describe('update throttling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('throttles recomputation until the interval has elapsed', () => {
      const combatants = new Map<string, Combatant>();
      combatants.set('c1', createMockCombatant('c1', Faction.NVA, new THREE.Vector3(0, 0, 0)));
      system.setCombatants(combatants);
      system.setPlayerPosition(new THREE.Vector3(1000, 0, 1000));

      system.update(16);
      const threatBefore = system.queryCellAt(new THREE.Vector3(0, 0, 0))?.threatLevel || 0;

      // Remove the combatant and run again within the throttle window.
      combatants.clear();
      system.setCombatants(combatants);
      vi.advanceTimersByTime(100);
      system.update(16);

      const threatAfterThrottled = system.queryCellAt(new THREE.Vector3(0, 0, 0))?.threatLevel || 0;
      expect(threatAfterThrottled).toBe(threatBefore);

      // After the throttle window, the recomputation should reflect the empty combatants map.
      vi.advanceTimersByTime(500);
      system.update(16);
      expect(system.queryCellAt(new THREE.Vector3(0, 0, 0))?.threatLevel).toBe(0);
    });

    it('computes threat from enemy combatants once the interval passes', () => {
      vi.advanceTimersByTime(500);
      const combatants = new Map<string, Combatant>();
      combatants.set('c1', createMockCombatant('c1', Faction.NVA, new THREE.Vector3(0, 0, 0)));
      system.setCombatants(combatants);

      system.update(16);
      expect(system.queryCellAt(new THREE.Vector3(0, 0, 0))?.threatLevel).toBeGreaterThan(0);
    });
  });

  describe('findBestPositionNear', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(500);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns a position within the search radius at ground height when one is available', () => {
      const zones = [createMockZone('z1', new THREE.Vector3(10, 0, 10), null, ZoneState.CONTESTED)];
      system.setZones(zones);
      system.update(16);

      const targetPos = new THREE.Vector3(0, 50, 0);
      const result = system.findBestPositionNear(targetPos, 100, Faction.US);

      // When a position is returned, it must be flattened to y=0 and within the radius.
      if (result !== null) {
        expect(result.y).toBe(0);
        expect(result.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThanOrEqual(100);
      }
    });

    it('scores positions differently for OPFOR vs US so OPFOR gravitates toward the player threat', () => {
      const playerPos = new THREE.Vector3(20, 0, 20);
      system.setPlayerPosition(playerPos);
      system.setZones([createMockZone('z1', new THREE.Vector3(-20, 0, -20), null, ZoneState.CONTESTED)]);
      system.update(16);

      const center = new THREE.Vector3(0, 0, 0);
      const usResult = system.findBestPositionNear(center, 100, Faction.US);
      const opforResult = system.findBestPositionNear(center, 100, Faction.NVA);

      expect(usResult).not.toBeNull();
      expect(opforResult).not.toBeNull();
      expect(opforResult!.distanceTo(playerPos)).toBeLessThan(usResult!.distanceTo(playerPos));
    });
  });

  describe('findBestZoneTarget', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(500);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns null when the only candidates are own home base, own-controlled, or nothing at all', () => {
      const squadPos = new THREE.Vector3(10, 0, 10);

      system.setZones([]);
      expect(system.findBestZoneTarget(squadPos, Faction.US)).toBeNull();

      system.setZones([createMockZone('hb', new THREE.Vector3(0, 0, 0), Faction.US, ZoneState.BLUFOR_CONTROLLED, true)]);
      expect(system.findBestZoneTarget(squadPos, Faction.US)).toBeNull();

      system.setZones([createMockZone('owned', new THREE.Vector3(0, 0, 0), Faction.US, ZoneState.BLUFOR_CONTROLLED, false)]);
      expect(system.findBestZoneTarget(squadPos, Faction.US)).toBeNull();
    });

    it('targets contested, neutral, and enemy-controlled zones', () => {
      const candidates = [
        ['contested', createMockZone('contested', new THREE.Vector3(0, 0, 0), null, ZoneState.CONTESTED)],
        ['neutral', createMockZone('neutral', new THREE.Vector3(0, 0, 0), null, ZoneState.NEUTRAL)],
        ['enemy', createMockZone('enemy', new THREE.Vector3(0, 0, 0), Faction.NVA, ZoneState.OPFOR_CONTROLLED)],
      ] as const;

      for (const [label, zone] of candidates) {
        system.setZones([zone]);
        system.update(16);
        const result = system.findBestZoneTarget(new THREE.Vector3(10, 0, 10), Faction.US);
        expect(result?.id).toBe(label);
      }
    });

    it('prefers contested zones to neutral zones at equal distance', () => {
      const zones = [
        createMockZone('neutral', new THREE.Vector3(0, 0, 0), null, ZoneState.NEUTRAL),
        createMockZone('contested', new THREE.Vector3(0, 0, 50), null, ZoneState.CONTESTED),
      ];
      system.setZones(zones);
      system.update(16);

      const squadPos = new THREE.Vector3(0, 0, 25); // Equidistant.
      expect(system.findBestZoneTarget(squadPos, Faction.US)?.id).toBe('contested');
    });
  });

  describe('debug + dispose', () => {
    let canvasStub: any;

    beforeEach(() => {
      canvasStub = {
        width: 0,
        height: 0,
        style: { display: '', position: '', bottom: '', right: '', border: '', zIndex: '', imageRendering: '', pointerEvents: '' },
        getContext: vi.fn(() => ({
          fillStyle: '',
          fillRect: vi.fn(),
          strokeStyle: '',
          lineWidth: 0,
          beginPath: vi.fn(),
          arc: vi.fn(),
          stroke: vi.fn()
        }))
      };
      (global.document.createElement as any).mockReturnValue(canvasStub);
    });

    it('toggles debug canvas visibility without recreating it', () => {
      system.toggleDebug();
      expect(canvasStub.style.display).toBe('block');

      const createCallsAfterFirstToggle = (global.document.createElement as any).mock.calls.length;

      system.toggleDebug();
      expect(canvasStub.style.display).toBe('none');
      system.toggleDebug();
      expect(canvasStub.style.display).toBe('block');

      expect((global.document.createElement as any).mock.calls.length).toBe(createCallsAfterFirstToggle);
    });

    it('dispose removes the debug canvas if one exists and is idempotent', () => {
      system.toggleDebug();
      system.dispose();
      expect(global.document.body.removeChild).toHaveBeenCalledWith(canvasStub);

      expect(() => system.dispose()).not.toThrow();
    });

    it('dispose is a no-op when debug was never toggled on', () => {
      const fresh = new InfluenceMapSystem(worldSize);
      expect(() => fresh.dispose()).not.toThrow();
    });
  });

  describe('integration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(500);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('computes threat, squad support, and opportunity fields across the grid', () => {
      const combatants = new Map<string, Combatant>();
      combatants.set('enemy1', createMockCombatant('enemy1', Faction.NVA, new THREE.Vector3(-30, 0, -30)));
      combatants.set('friendly1', createMockCombatant('friendly1', Faction.US, new THREE.Vector3(0, 0, 0)));
      const zones = [createMockZone('z1', new THREE.Vector3(-50, 0, -50), null, ZoneState.CONTESTED)];

      system.setCombatants(combatants);
      system.setZones(zones);
      system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
      system.update(16);

      expect(system.queryCellAt(new THREE.Vector3(-30, 0, -30))?.threatLevel).toBeGreaterThan(0);
      expect(system.queryCellAt(new THREE.Vector3(0, 0, 0))?.squadSupport).toBeGreaterThan(0);
      expect(system.queryCellAt(new THREE.Vector3(-50, 0, -50))?.opportunityLevel).toBeGreaterThan(0);
    });
  });
});
