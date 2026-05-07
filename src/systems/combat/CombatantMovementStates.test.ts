import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  updatePatrolMovement,
  updateCombatMovement,
  updateCoverSeekingMovement,
  updateRetreatingMovement,
  updateDefendingMovement,
  ADVANCING_TRAVERSE_SPEED,
  DEFEND_SPEED,
  PATROL_CLOSE_SPEED
} from './CombatantMovementStates';
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from './types';
import { ZoneState } from '../world/ZoneManager';
import { handlePlayerCommand, handleRejoiningMovement } from './CombatantMovementCommands';

// Mock Three.js Vector3
vi.mock('three', () => ({
  Vector3: class {
    x = 0; y = 0; z = 0;
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new (this.constructor as any)(this.x, this.y, this.z); }
    subVectors(a: any, b: any) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    normalize() { const l = Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2); if (l > 0) { this.x /= l; this.y /= l; this.z /= l; } return this; }
    length() { return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2); }
    distanceTo(v: any) { return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2); }
    multiplyScalar(s: number) { this.x *= s; this.y *= s; this.z *= s; return this; }
  }
}));

// Mock CombatantMovementCommands
vi.mock('./CombatantMovementCommands', () => ({
  handlePlayerCommand: vi.fn(),
  handleRejoiningMovement: vi.fn()
}));

// Mock Logger
vi.mock('../../utils/Logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

const PLAYER_WALK_SPEED = 10;
const PLAYER_CLOSE_MARGIN = 2;

const createCombatant = (overrides: Partial<Combatant> = {}): Combatant => {
  return {
    id: 'c1',
    faction: Faction.US,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    squadId: 'squad-1',
    squadRole: 'follower',
    wanderAngle: 0,
    timeToDirectionChange: 1,
    lastUpdateTime: 0,
    kills: 0,
    deaths: 0,
    ...overrides
  } as Combatant;
};

const createSquad = (overrides: Partial<Squad> = {}): Squad => {
  return {
    id: 'squad-1',
    faction: Faction.US,
    members: ['c1'],
    formation: 'line',
    ...overrides
  } as Squad;
};

describe('CombatantMovementStates', () => {
  let performanceNowSpy: ReturnType<typeof vi.spyOn> | undefined;
  let dateNowSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    performanceNowSpy?.mockRestore();
    dateNowSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  describe('updatePatrolMovement', () => {
    it('delegates to handleRejoiningMovement when rejoining squad', () => {
      const combatant = createCombatant({ isRejoiningSquad: true });
      const squad = createSquad();
      const squads = new Map<string, Squad>([['squad-1', squad]]);
      const combatants = new Map<string, Combatant>([['c1', combatant]]);

      updatePatrolMovement(combatant, 0.016, squads, combatants, {
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });

      expect(handleRejoiningMovement).toHaveBeenCalledTimes(1);
      expect(handleRejoiningMovement).toHaveBeenCalledWith(combatant, squad, combatants);
      expect(handlePlayerCommand).not.toHaveBeenCalled();
    });

    it('delegates to handlePlayerCommand when squad is player-controlled with active command', () => {
      const combatant = createCombatant({ isRejoiningSquad: false });
      const squad = createSquad({
        isPlayerControlled: true,
        currentCommand: SquadCommand.FOLLOW_ME
      });
      const squads = new Map<string, Squad>([['squad-1', squad]]);
      const combatants = new Map<string, Combatant>([['c1', combatant]]);

      updatePatrolMovement(combatant, 0.016, squads, combatants, {
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });

      expect(handlePlayerCommand).toHaveBeenCalledTimes(1);
      expect(handlePlayerCommand).toHaveBeenCalledWith(combatant, squad);
      expect(handleRejoiningMovement).not.toHaveBeenCalled();
    });

    it('moves squad followers toward the leader destination when far away', () => {
      const leader = createCombatant({ id: 'leader', position: new THREE.Vector3(10, 0, 0), squadRole: 'leader', destinationPoint: new THREE.Vector3(100, 0, 0) });
      const follower = createCombatant({ id: 'follower', position: new THREE.Vector3(0, 0, 0) });
      const squad = createSquad({ leaderId: 'leader', members: ['leader', 'follower'] });
      const squads = new Map<string, Squad>([['squad-1', squad]]);
      const combatants = new Map<string, Combatant>([['leader', leader], ['follower', follower]]);

      updatePatrolMovement(follower, 0.016, squads, combatants, {
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });

      // Follower moves toward leader's destination (100,0,0), not leader position
      expect(follower.velocity.x).toBeGreaterThan(0);
      expect(follower.velocity.z).toBeCloseTo(0, 5);
      expect(follower.rotation).toBeCloseTo(0, 5);
      expect(follower.destinationPoint?.x).toBe(100);
    });

    it('follows leader position when leader has no destination and follower is close', () => {
      const leader = createCombatant({ id: 'leader', position: new THREE.Vector3(4, 0, 0), squadRole: 'leader' });
      const follower = createCombatant({ id: 'follower', position: new THREE.Vector3(0, 0, 0) });
      const squad = createSquad({ leaderId: 'leader', members: ['leader', 'follower'] });
      const squads = new Map<string, Squad>([['squad-1', squad]]);
      const combatants = new Map<string, Combatant>([['leader', leader], ['follower', follower]]);

      updatePatrolMovement(follower, 0.016, squads, combatants, {
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });

      expect(follower.velocity.length()).toBe(0);
      expect(follower.destinationPoint?.x).toBe(4);
    });

    it('evaluates zones and picks strategic targets for leaders', () => {
      const combatant = createCombatant({ squadRole: 'leader', squadId: 'squad-1' });
      const zoneManager = {
        getAllZones: vi.fn(() => [
          {
            id: 'zone-1',
            position: new THREE.Vector3(50, 0, 0),
            owner: Faction.NVA,
            state: ZoneState.CONTESTED,
            isHomeBase: false,
            ticketBleedRate: 3
          },
          {
            id: 'zone-2',
            position: new THREE.Vector3(60, 0, 0),
            owner: Faction.NVA,
            state: ZoneState.OPFOR_CONTROLLED,
            isHomeBase: false,
            ticketBleedRate: 1
          }
        ])
      };
      const squads = new Map<string, Squad>();
      const combatants = new Map<string, Combatant>([['c1', combatant]]);

      performanceNowSpy = vi.spyOn(performance, 'now').mockReturnValue(10000);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      updatePatrolMovement(combatant, 0.016, squads, combatants, {
        zoneManager: zoneManager as any,
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });

      expect(zoneManager.getAllZones).toHaveBeenCalledTimes(1);
      expect(combatant.destinationPoint?.x).toBe(50);
    });

    it('moves leaders toward selected zone with variable speed', () => {
      const squads = new Map<string, Squad>();
      const combatants = new Map<string, Combatant>();
      const zoneManager = { getAllZones: vi.fn(() => []) };

      performanceNowSpy = vi.spyOn(performance, 'now').mockReturnValue(2000);

      const nearLeader = createCombatant({
        id: 'near',
        squadRole: 'leader',
        destinationPoint: new THREE.Vector3(18, 0, 0),
        lastZoneEvalTime: 2000
      });
      updatePatrolMovement(nearLeader, 0.016, squads, combatants, {
        zoneManager: zoneManager as any,
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });
      expect(nearLeader.velocity.length()).toBeCloseTo(PATROL_CLOSE_SPEED, 5);

      const midLeader = createCombatant({
        id: 'mid',
        squadRole: 'leader',
        destinationPoint: new THREE.Vector3(50, 0, 0),
        lastZoneEvalTime: 2000
      });
      updatePatrolMovement(midLeader, 0.016, squads, combatants, {
        zoneManager: zoneManager as any,
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });
      expect(midLeader.velocity.length()).toBeGreaterThan(PATROL_CLOSE_SPEED);
      expect(midLeader.velocity.length()).toBeLessThan(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);

      const farLeader = createCombatant({
        id: 'far',
        squadRole: 'leader',
        destinationPoint: new THREE.Vector3(150, 0, 0),
        lastZoneEvalTime: 2000
      });
      updatePatrolMovement(farLeader, 0.016, squads, combatants, {
        zoneManager: zoneManager as any,
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });
      expect(farLeader.velocity.length()).toBeGreaterThan(midLeader.velocity.length());
      expect(farLeader.velocity.length()).toBeLessThanOrEqual(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
    });

    it('falls back to advancing toward enemy base when no zones are available', () => {
      const combatant = createCombatant({ squadRole: 'leader', destinationPoint: undefined });
      const squads = new Map<string, Squad>();
      const combatants = new Map<string, Combatant>([['c1', combatant]]);
      const zoneManager = { getAllZones: vi.fn(() => []) };

      performanceNowSpy = vi.spyOn(performance, 'now').mockReturnValue(10000);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      updatePatrolMovement(combatant, 0.016, squads, combatants, {
        zoneManager: zoneManager as any,
        getEnemyBasePosition: () => new THREE.Vector3(30, 0, 0)
      });

      expect(combatant.velocity.x).toBeGreaterThan(PATROL_CLOSE_SPEED);
      expect(combatant.velocity.x).toBeLessThan(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
      expect(combatant.velocity.z).toBeCloseTo(0, 5);
    });

    it('advances leaderless followers toward enemy territory', () => {
      const combatant = createCombatant({
        squadRole: 'follower',
        squadId: undefined,
      });
      const squads = new Map<string, Squad>();
      const combatants = new Map<string, Combatant>([['c1', combatant]]);

      updatePatrolMovement(combatant, 0.5, squads, combatants, {
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });

      // Leaderless followers advance toward enemy base instead of random wander
      expect(combatant.velocity.x).toBeGreaterThan(0);
      expect(combatant.velocity.z).toBeCloseTo(0, 5);
    });

    it('prefers contested zones with higher bleed rates', () => {
      const combatant = createCombatant({ squadRole: 'leader' });
      const zoneManager = {
        getAllZones: vi.fn(() => [
          {
            id: 'zone-1',
            position: new THREE.Vector3(100, 0, 0),
            owner: Faction.NVA,
            state: ZoneState.CONTESTED,
            isHomeBase: false,
            ticketBleedRate: 3
          },
          {
            id: 'zone-2',
            position: new THREE.Vector3(100, 0, 0),
            owner: Faction.NVA,
            state: ZoneState.OPFOR_CONTROLLED,
            isHomeBase: false,
            ticketBleedRate: 1
          }
        ])
      };
      const squads = new Map<string, Squad>();
      const combatants = new Map<string, Combatant>([['c1', combatant]]);

      performanceNowSpy = vi.spyOn(performance, 'now').mockReturnValue(10000);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      updatePatrolMovement(combatant, 0.016, squads, combatants, {
        zoneManager: zoneManager as any,
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });

      expect(combatant.destinationPoint?.x).toBe(100);
      expect(combatant.destinationPoint?.z).toBe(0);
    });

    it('does not re-evaluate zones when throttled', () => {
      const combatant = createCombatant({
        squadRole: 'leader',
        destinationPoint: new THREE.Vector3(200, 0, 0),
        lastZoneEvalTime: 9000
      });
      const zoneManager = { getAllZones: vi.fn(() => []) };
      const squads = new Map<string, Squad>();
      const combatants = new Map<string, Combatant>([['c1', combatant]]);

      performanceNowSpy = vi.spyOn(performance, 'now').mockReturnValue(10000);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      updatePatrolMovement(combatant, 0.016, squads, combatants, {
        zoneManager: zoneManager as any,
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0)
      });

      expect(zoneManager.getAllZones).not.toHaveBeenCalled();
      expect(combatant.lastZoneEvalTime).toBe(9000);
    });
  });

  describe('updateCombatMovement', () => {
    it('returns immediately when no target', () => {
      const combatant = createCombatant({ velocity: new THREE.Vector3(1, 0, 0), target: null });
      updateCombatMovement(combatant);
      expect(combatant.velocity.x).toBe(1);
    });

    it('moves toward target when too far', () => {
      const target = createCombatant({ id: 't1', position: new THREE.Vector3(100, 0, 0) });
      const combatant = createCombatant({ target, position: new THREE.Vector3(0, 0, 0) });
      updateCombatMovement(combatant);
      expect(combatant.velocity.x).toBeGreaterThan(0);
      expect(combatant.velocity.length()).toBeLessThan(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
      expect(combatant.velocity.z).toBeCloseTo(0, 5);
    });

    it('does not backpedal across the close combat band', () => {
      const target = createCombatant({ id: 't1', position: new THREE.Vector3(10, 0, 0) });
      const combatant = createCombatant({ target, position: new THREE.Vector3(0, 0, 0) });

      dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

      updateCombatMovement(combatant);
      expect(combatant.velocity.x).toBeCloseTo(0, 5);
      expect(Math.abs(combatant.velocity.z)).toBeGreaterThan(0);
      expect(combatant.velocity.length()).toBeLessThan(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
    });

    it('backs away only when nearly colliding', () => {
      const target = createCombatant({ id: 't1', position: new THREE.Vector3(3, 0, 0) });
      const combatant = createCombatant({ target, position: new THREE.Vector3(0, 0, 0) });
      updateCombatMovement(combatant);
      expect(combatant.velocity.x).toBeLessThan(0);
      expect(combatant.velocity.length()).toBeLessThan(3);
      expect(combatant.velocity.z).toBeCloseTo(0, 5);
    });

    it('strafes at ideal engagement distance', () => {
      const target = createCombatant({ id: 't1', position: new THREE.Vector3(30, 0, 0) });
      const combatant = createCombatant({ target, position: new THREE.Vector3(0, 0, 0) });

      dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

      updateCombatMovement(combatant);
      expect(combatant.velocity.x).toBeCloseTo(0, 5);
      expect(Math.abs(combatant.velocity.z)).toBeGreaterThan(0);
      expect(Math.abs(combatant.velocity.z)).toBeLessThan(1);
    });
  });

  describe('updateCoverSeekingMovement', () => {
    it('sets velocity to zero when no destination', () => {
      const combatant = createCombatant({ destinationPoint: undefined, velocity: new THREE.Vector3(5, 0, 5) });
      updateCoverSeekingMovement(combatant);
      expect(combatant.velocity.length()).toBe(0);
    });

    it('sets velocity to zero when arrived', () => {
      const combatant = createCombatant({ destinationPoint: new THREE.Vector3(1, 0, 0) });
      updateCoverSeekingMovement(combatant);
      expect(combatant.velocity.length()).toBe(0);
    });

    it('moves toward destination at COVER_SEEKING_SPEED when not arrived', () => {
      const combatant = createCombatant({ destinationPoint: new THREE.Vector3(20, 0, 0) });
      updateCoverSeekingMovement(combatant);
      expect(combatant.velocity.x).toBeGreaterThan(ADVANCING_TRAVERSE_SPEED);
      expect(combatant.velocity.x).toBeLessThan(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
      expect(combatant.velocity.z).toBeCloseTo(0, 5);
    });
  });

  describe('updateRetreatingMovement', () => {
    it('moves toward the committed fallback point', () => {
      const combatant = createCombatant({
        state: CombatantState.RETREATING,
        position: new THREE.Vector3(0, 0, 0),
        destinationPoint: new THREE.Vector3(30, 0, 0),
        velocity: new THREE.Vector3(-2, 0, 0)
      });

      updateRetreatingMovement(combatant);

      expect(combatant.velocity.x).toBeGreaterThan(ADVANCING_TRAVERSE_SPEED - 0.2);
      expect(combatant.velocity.x).toBeLessThan(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
      expect(combatant.velocity.z).toBeCloseTo(0, 5);
    });

    it('clears stale velocity when a retreat destination is missing', () => {
      const combatant = createCombatant({
        state: CombatantState.RETREATING,
        destinationPoint: undefined,
        velocity: new THREE.Vector3(5, 0, 0)
      });

      updateRetreatingMovement(combatant);

      expect(combatant.velocity.length()).toBe(0);
    });
  });

  describe('updateDefendingMovement', () => {
    it('sets velocity to zero when no destination', () => {
      const combatant = createCombatant({ destinationPoint: undefined, velocity: new THREE.Vector3(5, 0, 5) });
      updateDefendingMovement(combatant);
      expect(combatant.velocity.length()).toBe(0);
    });

    it('sets velocity to zero when arrived', () => {
      const combatant = createCombatant({ destinationPoint: new THREE.Vector3(1, 0, 0) });
      updateDefendingMovement(combatant);
      expect(combatant.velocity.length()).toBe(0);
    });

    it('moves toward destination at DEFEND_SPEED when not arrived', () => {
      const combatant = createCombatant({ destinationPoint: new THREE.Vector3(20, 0, 0) });
      updateDefendingMovement(combatant);
      expect(combatant.velocity.x).toBeCloseTo(DEFEND_SPEED, 5);
      expect(combatant.velocity.z).toBeCloseTo(0, 5);
    });
  });

  // Behavior invariant: the player's only movement budget is PLAYER_WALK_SPEED = 10
  // (src/systems/player/PlayerController.ts). If NPCs move at or above that speed
  // in the engagement envelope, the player cannot close gaps and combat stalls.
  // Keep a ≥ 2 m/s margin on tactical speeds so the player can always catch up.
  //
  // These tests do NOT pin exact tuning numbers — they pin the BEHAVIOR the player
  // experiences (NPCs slower than player). Lowering a constant further is fine;
  // raising one past the margin will break the combat loop.
  describe('NPC speed cap invariant', () => {
    it('advancing traverse speed leaves the player enough margin to close', () => {
      expect(ADVANCING_TRAVERSE_SPEED).toBeLessThanOrEqual(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
    });

    it('defend speed leaves the player enough margin to close', () => {
      expect(DEFEND_SPEED).toBeLessThanOrEqual(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
    });

    it('patrol close-range speed leaves the player enough margin to close', () => {
      expect(PATROL_CLOSE_SPEED).toBeLessThanOrEqual(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
    });

    it('route traversal never exceeds the shared NPC max speed', () => {
      const farLeader = createCombatant({
        squadRole: 'leader',
        destinationPoint: new THREE.Vector3(200, 0, 0),
        lastZoneEvalTime: 2000,
      });

      updatePatrolMovement(farLeader, 0.016, new Map(), new Map(), {
        zoneManager: { getAllZones: vi.fn(() => []) } as any,
        getEnemyBasePosition: () => new THREE.Vector3(100, 0, 0),
      });

      expect(farLeader.velocity.length()).toBeLessThanOrEqual(PLAYER_WALK_SPEED - PLAYER_CLOSE_MARGIN);
    });
  });
});
