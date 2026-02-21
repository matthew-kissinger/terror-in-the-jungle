import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AIStatePatrol } from './AIStatePatrol';
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from '../types';
import { ZoneManager } from '../../world/ZoneManager';
import { clusterManager } from '../ClusterManager';

vi.mock('../ClusterManager', () => ({
  clusterManager: {
    getClusterDensity: vi.fn(() => 0),
    getStaggeredReactionDelay: vi.fn((delay) => delay),
  }
}));

vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('AIStatePatrol', () => {
  let aiStatePatrol: AIStatePatrol;
  let mockZoneManager: any;
  let squads: Map<string, Squad>;
  let allCombatants: Map<string, Combatant>;
  
  const playerPosition = new THREE.Vector3(0, 0, 0);

  beforeEach(() => {
    aiStatePatrol = new AIStatePatrol();
    squads = new Map();
    allCombatants = new Map();

    mockZoneManager = {
      getAllZones: vi.fn(() => []),
    };

    vi.clearAllMocks();
    // Reset Date.now if needed, but usually not necessary for these tests unless specifically testing timers
  });

  function createMockCombatant(id: string, faction: Faction, position = new THREE.Vector3()): Combatant {
    return {
      id,
      faction,
      position: position.clone(),
      state: CombatantState.PATROLLING,
      skillProfile: {
        reactionDelayMs: 100,
        visualRange: 100,
      },
      squadId: 'squad-1',
      squadRole: 'follower',
      rotation: 0,
      kills: 0,
      deaths: 0,
    } as Combatant;
  }

  describe('setSquads & setZoneManager', () => {
    it('should correctly set squads', () => {
      const mockSquads = new Map<string, Squad>();
      aiStatePatrol.setSquads(mockSquads);
      // squads is private, but we can verify it's used in handlePatrolling
    });

    it('should correctly set zone manager', () => {
      aiStatePatrol.setZoneManager(mockZoneManager as any);
    });
  });

  describe('handlePatrolling', () => {
    const findNearestEnemy = vi.fn();
    const canSeeTarget = vi.fn();
    const shouldEngage = vi.fn();

    it('should not do anything if combatant is rejoining squad', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.isRejoiningSquad = true;
      
      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(findNearestEnemy).not.toHaveBeenCalled();
    });

    it('should transition to ALERT when enemy is found and LOS is clear', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(100, 0, 100));
      const enemy = createMockCombatant('e1', Faction.OPFOR, new THREE.Vector3(120, 0, 120));
      
      findNearestEnemy.mockReturnValue(enemy);
      canSeeTarget.mockReturnValue(true);
      shouldEngage.mockReturnValue(true);

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.state).toBe(CombatantState.ALERT);
      expect(combatant.target).toBe(enemy);
      expect(combatant.reactionTimer).toBeGreaterThan(0);
      expect(combatant.alertTimer).toBe(1.5);
    });

    it('should react immediately and bypass LOS check at very close range (<15m)', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(10, 0, 10));
      const enemy = createMockCombatant('e1', Faction.OPFOR, new THREE.Vector3(12, 0, 12));
      
      findNearestEnemy.mockReturnValue(enemy);
      canSeeTarget.mockReturnValue(false); // LOS blocked
      shouldEngage.mockReturnValue(true);

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.state).toBe(CombatantState.ALERT);
      expect(combatant.target).toBe(enemy);
    });

    it('should apply staggered reaction delay when in dense clusters', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(100, 0, 100));
      const enemy = createMockCombatant('e1', Faction.OPFOR, new THREE.Vector3(120, 0, 120));
      allCombatants.set(combatant.id, combatant);
      for (let i = 0; i < 4; i++) {
        allCombatants.set(`ally-${i}`, createMockCombatant(`ally-${i}`, Faction.US, new THREE.Vector3(101 + i, 0, 101)));
      }
      const mockSpatialGrid = {
        queryRadius: vi.fn(() => [combatant.id, 'ally-0', 'ally-1', 'ally-2', 'ally-3']),
      } as any;
      
      findNearestEnemy.mockReturnValue(enemy);
      canSeeTarget.mockReturnValue(true);
      shouldEngage.mockReturnValue(true);

      (clusterManager.getStaggeredReactionDelay as any).mockReturnValue(500);

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, mockSpatialGrid,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      // reactionTimer = baseDelay / 1000 = 500 / 1000 = 0.5
      expect(combatant.reactionTimer).toBe(0.5);
    });
  });

  describe('Squad Commands', () => {
    let combatant: Combatant;
    let squad: Squad;
    const findNearestEnemy = vi.fn();
    const canSeeTarget = vi.fn();
    const shouldEngage = vi.fn();

    beforeEach(() => {
      combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(10, 0, 10));
      squad = {
        id: 'squad-1',
        faction: Faction.US,
        members: ['c1'],
        isPlayerControlled: true,
        currentCommand: SquadCommand.NONE,
      } as Squad;
      squads.set('squad-1', squad);
      aiStatePatrol.setSquads(squads);
    });

    it('should handle FOLLOW_ME command', () => {
      squad.currentCommand = SquadCommand.FOLLOW_ME;
      
      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.destinationPoint).toBeDefined();
      // Should be roughly 4m away from playerPosition (0,0,0)
      expect(combatant.destinationPoint?.length()).toBeCloseTo(4, 1);
    });

    it('should handle HOLD_POSITION command', () => {
      squad.currentCommand = SquadCommand.HOLD_POSITION;
      const holdPos = new THREE.Vector3(50, 0, 50);
      squad.commandPosition = holdPos;

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.destinationPoint?.clone()).toEqual(holdPos);
    });

    it('should handle PATROL_HERE command', () => {
      squad.currentCommand = SquadCommand.PATROL_HERE;
      squad.commandPosition = new THREE.Vector3(50, 0, 50);

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.destinationPoint).toBeDefined();
      expect(combatant.destinationPoint?.distanceTo(squad.commandPosition!)).toBeLessThanOrEqual(20);
    });

    it('should handle RETREAT command', () => {
      squad.currentCommand = SquadCommand.RETREAT;
      squad.commandPosition = new THREE.Vector3(-100, 0, -100);
      combatant.position.set(10, 0, 10);
      // player is at 0,0,0. awayDir from player is (10, 0, 10) normalized * 50 = (35.35, 0, 35.35)
      // destination = commandPosition + awayDir = (-100 + 35.35, 0, -100 + 35.35) = (-64.65, 0, -64.65)

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.destinationPoint).toBeDefined();
      expect(combatant.destinationPoint?.x).toBeLessThan(-60);
    });
  });

  describe('Zone Defense', () => {
    let combatant: Combatant;
    let squad: Squad;
    const findNearestEnemy = vi.fn();
    const canSeeTarget = vi.fn();
    const shouldEngage = vi.fn();

    beforeEach(() => {
      combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(10, 0, 10));
      squad = {
        id: 'squad-1',
        faction: Faction.US,
        members: ['c1', 'c2', 'c3', 'c4'], // size 4, so 2 defenders max
        isPlayerControlled: false,
        currentCommand: SquadCommand.NONE,
      } as Squad;
      squads.set('squad-1', squad);
      aiStatePatrol.setSquads(squads);
      aiStatePatrol.setZoneManager(mockZoneManager as any);
    });

    it('should assign zone defense if combatant is eligible and nearby zone is owned', () => {
      const zone = {
        id: 'zone-1',
        owner: Faction.US,
        isHomeBase: false,
        position: new THREE.Vector3(20, 0, 20),
        radius: 10,
      };
      mockZoneManager.getAllZones.mockReturnValue([zone]);

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.state).toBe(CombatantState.DEFENDING);
      expect(combatant.defendingZoneId).toBe('zone-1');
      expect(combatant.defensePosition).toBeDefined();
      expect(combatant.destinationPoint).toEqual(combatant.defensePosition);
      
      const defenders = aiStatePatrol.getZoneDefenders().get('zone-1');
      expect(defenders?.has('c1')).toBe(true);
    });

    it('should not assign zone defense if zone is full (max 2 for squad size 4)', () => {
      const zone = {
        id: 'zone-1',
        owner: Faction.US,
        isHomeBase: false,
        position: new THREE.Vector3(20, 0, 20),
        radius: 10,
      };
      mockZoneManager.getAllZones.mockReturnValue([zone]);

      // Pre-fill defenders
      const defenders = new Set(['c2', 'c3']);
      aiStatePatrol.getZoneDefenders().set('zone-1', defenders);

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.state).toBe(CombatantState.PATROLLING);
    });

    it('should not assign zone defense to squad leader', () => {
      combatant.squadRole = 'leader';
      const zone = {
        id: 'zone-1',
        owner: Faction.US,
        isHomeBase: false,
        position: new THREE.Vector3(20, 0, 20),
        radius: 10,
      };
      mockZoneManager.getAllZones.mockReturnValue([zone]);

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.state).toBe(CombatantState.PATROLLING);
    });

    it('should respect lastDefenseReassignTime (5s cooldown)', () => {
      const zone = {
        id: 'zone-1',
        owner: Faction.US,
        isHomeBase: false,
        position: new THREE.Vector3(20, 0, 20),
        radius: 10,
      };
      mockZoneManager.getAllZones.mockReturnValue([zone]);
      combatant.lastDefenseReassignTime = Date.now() - 1000; // 1s ago

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.state).toBe(CombatantState.PATROLLING);
    });

    it('should pick the nearest owned zone', () => {
      const zoneFar = {
        id: 'zone-far',
        owner: Faction.US,
        isHomeBase: false,
        position: new THREE.Vector3(50, 0, 50),
        radius: 10,
      };
      const zoneNear = {
        id: 'zone-near',
        owner: Faction.US,
        isHomeBase: false,
        position: new THREE.Vector3(15, 0, 15),
        radius: 10,
      };
      mockZoneManager.getAllZones.mockReturnValue([zoneFar, zoneNear]);

      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );

      expect(combatant.defendingZoneId).toBe('zone-near');
    });

    it('should assign different defense positions to different defenders', () => {
      const zone = {
        id: 'zone-1',
        owner: Faction.US,
        isHomeBase: false,
        position: new THREE.Vector3(20, 0, 20),
        radius: 10,
      };
      mockZoneManager.getAllZones.mockReturnValue([zone]);

      // First defender
      aiStatePatrol.handlePatrolling(
        combatant, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );
      const pos1 = combatant.defensePosition?.clone();

      // Second defender
      const combatant2 = createMockCombatant('c2', Faction.US, new THREE.Vector3(10, 0, 10));
      aiStatePatrol.handlePatrolling(
        combatant2, 0.016, playerPosition, allCombatants, undefined,
        findNearestEnemy, canSeeTarget, shouldEngage
      );
      const pos2 = combatant2.defensePosition?.clone();

      expect(pos1).toBeDefined();
      expect(pos2).toBeDefined();
      expect(pos1?.distanceTo(pos2!)).toBeGreaterThan(1);
    });
  });
});
