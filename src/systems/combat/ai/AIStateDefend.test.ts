import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AIStateDefend } from './AIStateDefend';
import { Combatant, CombatantState, Faction } from '../types';
import { clusterManager } from '../ClusterManager';

vi.mock('../ClusterManager', () => ({
  clusterManager: {
    getClusterDensity: vi.fn(() => 0),
    getStaggeredReactionDelay: vi.fn((delay) => delay),
  }
}));

describe('AIStateDefend', () => {
  let aiStateDefend: AIStateDefend;
  let mockZoneManager: any;
  let allCombatants: Map<string, Combatant>;
  
  const playerPosition = new THREE.Vector3(0, 0, 0);

  beforeEach(() => {
    aiStateDefend = new AIStateDefend();
    allCombatants = new Map();

    mockZoneManager = {
      getAllZones: vi.fn(() => []),
    };

    aiStateDefend.setZoneManager(mockZoneManager as any);
    vi.clearAllMocks();
  });

  function createMockCombatant(id: string, faction: Faction, position = new THREE.Vector3()): Combatant {
    return {
      id,
      faction,
      position: position.clone(),
      state: CombatantState.DEFENDING,
      skillProfile: {
        reactionDelayMs: 100,
        visualRange: 100,
      },
      rotation: 0,
      kills: 0,
      deaths: 0,
    } as Combatant;
  }

  describe('handleDefending', () => {
    const findNearestEnemy = vi.fn();
    const canSeeTarget = vi.fn();

    it('should transition to PATROLLING if no defensePosition is set', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.defensePosition = undefined;

      aiStateDefend.handleDefending(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget
      );

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.defendingZoneId).toBeUndefined();
    });

    it('should move towards defensePosition if too far (>3m)', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      combatant.defensePosition = new THREE.Vector3(10, 0, 10);

      aiStateDefend.handleDefending(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget
      );

      expect(combatant.destinationPoint).toEqual(combatant.defensePosition);
      expect(combatant.rotation).toBeCloseTo(Math.atan2(10, 10));
    });

    it('should face outward from zone center when at defensePosition', () => {
      const zonePos = new THREE.Vector3(0, 0, 0);
      const defensePos = new THREE.Vector3(10, 0, 0); // East of zone
      const combatant = createMockCombatant('c1', Faction.US, defensePos.clone());
      combatant.defensePosition = defensePos;
      combatant.defendingZoneId = 'zone-1';

      mockZoneManager.getAllZones.mockReturnValue([{ id: 'zone-1', position: zonePos }]);

      aiStateDefend.handleDefending(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget
      );

      expect(combatant.destinationPoint).toBeUndefined();
      // Outward angle: from zone (0,0) to combatant (10,0) is 0 radians. Outward is 0? 
      // _toZone = zone.position - combatant.position = (0,0) - (10,0) = (-10, 0).
      // atan2(0, -10) = PI.
      // outwardAngle = PI + PI = 2PI (equivalent to 0).
      expect(Math.cos(combatant.rotation)).toBeCloseTo(1);
    });

    it('should transition to ALERT when enemy is found within 50m and LOS is clear', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(10, 0, 10));
      combatant.defensePosition = new THREE.Vector3(10, 0, 10);
      const enemy = createMockCombatant('e1', Faction.OPFOR, new THREE.Vector3(20, 0, 20));
      
      findNearestEnemy.mockReturnValue(enemy);
      canSeeTarget.mockReturnValue(true);

      aiStateDefend.handleDefending(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget
      );

      expect(combatant.state).toBe(CombatantState.ALERT);
      expect(combatant.target).toBe(enemy);
      expect(combatant.previousState).toBe(CombatantState.DEFENDING);
    });

    it('should face enemy before checking LOS', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(10, 0, 10));
      combatant.rotation = 0;
      const enemy = createMockCombatant('e1', Faction.OPFOR, new THREE.Vector3(0, 0, 0));
      
      findNearestEnemy.mockReturnValue(enemy);
      canSeeTarget.mockReturnValue(false); // Should still rotate even if LOS fails

      aiStateDefend.handleDefending(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget
      );

      // Vector to enemy (0,0,0) from (10,0,10) is (-10, 0, -10)
      expect(combatant.rotation).toBeCloseTo(Math.atan2(-10, -10));
    });

    it('should react immediately and bypass LOS check at very close range (<15m)', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(10, 0, 10));
      const enemy = createMockCombatant('e1', Faction.OPFOR, new THREE.Vector3(12, 0, 12));
      
      findNearestEnemy.mockReturnValue(enemy);
      canSeeTarget.mockReturnValue(false); // LOS blocked

      aiStateDefend.handleDefending(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget
      );

      expect(combatant.state).toBe(CombatantState.ALERT);
    });

    it('should apply staggered reaction delay when local cluster density is high', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(100, 0, 100));
      const enemy = createMockCombatant('e1', Faction.OPFOR, new THREE.Vector3(110, 0, 100));
      allCombatants.set(combatant.id, combatant);
      for (let i = 0; i < 4; i++) {
        allCombatants.set(`ally-${i}`, createMockCombatant(`ally-${i}`, Faction.US, new THREE.Vector3(101 + i, 0, 100)));
      }
      const mockSpatialGrid = {
        queryRadius: vi.fn(() => [combatant.id, 'ally-0', 'ally-1', 'ally-2', 'ally-3']),
      } as any;

      findNearestEnemy.mockReturnValue(enemy);
      canSeeTarget.mockReturnValue(true);
      (clusterManager.getStaggeredReactionDelay as any).mockReturnValue(400);

      aiStateDefend.handleDefending(
        combatant, 0.016, playerPosition, allCombatants, mockSpatialGrid,
        findNearestEnemy, canSeeTarget
      );

      expect(combatant.reactionTimer).toBe(0.4);
    });
  });
});
