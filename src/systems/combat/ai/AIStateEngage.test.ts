import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AIStateEngage } from './AIStateEngage';
import { Combatant, CombatantState, Faction, Squad } from '../types';
import { SpatialOctree } from '../SpatialOctree';
import { AICoverSystem } from './AICoverSystem';
import { AIFlankingSystem } from './AIFlankingSystem';

// Mock dependencies
vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('AIStateEngage', () => {
  let aiStateEngage: AIStateEngage;
  let squads: Map<string, Squad>;
  let allCombatants: Map<string, Combatant>;
  let mockCoverSystem: any;
  let mockFlankingSystem: any;
  let spatialGrid: SpatialOctree | undefined;

  const playerPosition = new THREE.Vector3(0, 0, 0);

  beforeEach(() => {
    aiStateEngage = new AIStateEngage();
    squads = new Map();
    allCombatants = new Map();
    spatialGrid = undefined;

    mockCoverSystem = {
      evaluateCurrentCover: vi.fn(() => ({ effective: true, shouldReposition: false })),
      findBestCover: vi.fn(() => null),
      claimCover: vi.fn(),
      releaseCover: vi.fn(),
    };

    mockFlankingSystem = {
      hasActiveFlank: vi.fn(() => false),
      shouldInitiateFlank: vi.fn(() => false),
      initiateFlank: vi.fn(() => null),
    };

    vi.clearAllMocks();
  });

  function createMockCombatant(id: string, faction: Faction, position = new THREE.Vector3()): Combatant {
    return {
      id,
      faction,
      position: position.clone(),
      state: CombatantState.ENGAGING,
      skillProfile: {
        reactionDelayMs: 100,
        visualRange: 100,
        burstLength: 3,
        burstPauseMs: 1000,
      },
      squadId: 'squad-1',
      squadRole: 'follower',
      rotation: 0,
      kills: 0,
      deaths: 0,
      health: 100,
      maxHealth: 100,
      target: null,
      previousState: undefined,
      isFullAuto: false,
      inCover: false,
      coverPosition: undefined,
      panicLevel: 0,
      lastHitTime: Date.now() - 5000,
      alertTimer: 5.0,
      currentBurst: 0,
      suppressionEndTime: undefined,
      suppressionTarget: undefined,
      lastKnownTargetPos: undefined,
      reactionTimer: 0,
    } as Combatant;
  }

  function createMockTarget(id: string, faction: Faction, position = new THREE.Vector3()): Combatant {
    return createMockCombatant(id, faction, position);
  }

  describe('setSquads, setCoverSystem, setFlankingSystem', () => {
    it('should set squads', () => {
      const mockSquads = new Map<string, Squad>();
      aiStateEngage.setSquads(mockSquads);
      // squads is private, verified by usage in tests
    });

    it('should set cover system', () => {
      aiStateEngage.setCoverSystem(mockCoverSystem);
      // verified by usage in tests
    });

    it('should set flanking system', () => {
      aiStateEngage.setFlankingSystem(mockFlankingSystem);
      // verified by usage in tests
    });
  });

  describe('handleEngaging', () => {
    const canSeeTarget = vi.fn();
    const shouldSeekCover = vi.fn();
    const findNearestCover = vi.fn();
    const countNearbyEnemies = vi.fn();
    const isCoverFlanked = vi.fn();

    beforeEach(() => {
      canSeeTarget.mockReturnValue(true);
      shouldSeekCover.mockReturnValue(false);
      findNearestCover.mockReturnValue(null);
      countNearbyEnemies.mockReturnValue(0);
      isCoverFlanked.mockReturnValue(false);
    });

    it('should transition to PATROLLING when target is null', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.target = null;

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.isFullAuto).toBe(false);
    });

    it('should transition to DEFENDING when previous state was DEFENDING and target is null', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.target = null;
      combatant.previousState = CombatantState.DEFENDING;

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).toBe(CombatantState.DEFENDING);
    });

    it('should transition to PATROLLING when target is DEAD', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      const deadTarget = createMockTarget('dead', Faction.OPFOR);
      deadTarget.state = CombatantState.DEAD;
      combatant.target = deadTarget;

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.target).toBeNull();
    });

    it('should release cover when target is lost', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.target = null;
      aiStateEngage.setCoverSystem(mockCoverSystem);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(mockCoverSystem.releaseCover).toHaveBeenCalledWith('c1');
    });

    it('should face target and update rotation', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(10, 0, 10));
      combatant.target = target;

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      // Rotation should be calculated towards target
      const expectedRotation = Math.atan2(10, 10);
      expect(combatant.rotation).toBeCloseTo(expectedRotation, 5);
    });

    it('should enable full auto at close range (<15m)', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(10, 0, 0));
      combatant.target = target;

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.isFullAuto).toBe(true);
      expect(combatant.skillProfile.burstLength).toBe(8);
      expect(combatant.skillProfile.burstPauseMs).toBe(200);
    });

    it('should not enable full auto at medium range (>15m)', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(30, 0, 0));
      combatant.target = target;
      combatant.faction = Faction.US;
      combatant.squadRole = 'follower';

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.isFullAuto).toBe(false);
      expect(combatant.skillProfile.burstLength).toBe(3);
    });

    it('should increase panic when recently hit', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      combatant.lastHitTime = Date.now() - 1000; // 1 second ago
      combatant.panicLevel = 0;

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.panicLevel).toBeGreaterThan(0);
    });

    it('should enable full auto when panic level is high', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      combatant.lastHitTime = Date.now() - 500;
      combatant.panicLevel = 0.6;

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.isFullAuto).toBe(true);
      expect(combatant.skillProfile.burstLength).toBe(10);
      expect(combatant.skillProfile.burstPauseMs).toBe(150);
    });

    it('should decrease panic over time', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      combatant.lastHitTime = Date.now() - 5000; // 5 seconds ago
      combatant.panicLevel = 0.5;

      aiStateEngage.handleEngaging(
        combatant, 1.0, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.panicLevel).toBeLessThan(0.5);
    });

    it('should transition to SEEKING_COVER when should seek cover', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      shouldSeekCover.mockReturnValue(true);
      findNearestCover.mockReturnValue(new THREE.Vector3(5, 0, 5));

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
      expect(combatant.coverPosition).toBeDefined();
      expect(combatant.destinationPoint).toBeDefined();
    });

    it('should use advanced cover system when available', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      shouldSeekCover.mockReturnValue(true);

      const coverSpot = { position: new THREE.Vector3(5, 0, 5) };
      mockCoverSystem.findBestCover.mockReturnValue(coverSpot);
      aiStateEngage.setCoverSystem(mockCoverSystem);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(mockCoverSystem.findBestCover).toHaveBeenCalled();
      expect(mockCoverSystem.claimCover).toHaveBeenCalledWith(combatant, expect.any(THREE.Vector3));
      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
    });

    it('should enable full auto when many nearby enemies', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      countNearbyEnemies.mockReturnValue(4);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.isFullAuto).toBe(true);
      expect(combatant.skillProfile.burstLength).toBe(6);
    });

    it('should transition to SUPPRESSING when cannot see target', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      canSeeTarget.mockReturnValue(false);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).toBe(CombatantState.SUPPRESSING);
      expect(combatant.lastKnownTargetPos).toBeDefined();
      expect(combatant.isFullAuto).toBe(true);
      expect(combatant.skillProfile.burstLength).toBe(12);
    });

    it('should update last known target position when target is visible', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.lastKnownTargetPos).toBeDefined();
      expect(combatant.lastKnownTargetPos?.distanceTo(target.position)).toBeLessThan(0.1);
    });

    describe('In Cover Behavior', () => {
      it('should use peek-and-fire burst params when in cover', () => {
        const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
        combatant.target = target;
        combatant.inCover = true;
        combatant.coverPosition = new THREE.Vector3(0, 0, 0);
        aiStateEngage.setCoverSystem(mockCoverSystem);

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(combatant.skillProfile.burstLength).toBe(2);
        expect(combatant.skillProfile.burstPauseMs).toBe(1500);
      });

      it('should reposition when cover is compromised', () => {
        const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
        combatant.target = target;
        combatant.inCover = true;
        combatant.coverPosition = new THREE.Vector3(0, 0, 0);

        mockCoverSystem.evaluateCurrentCover.mockReturnValue({ effective: false, shouldReposition: true });
        const newCover = { position: new THREE.Vector3(10, 0, 10) };
        mockCoverSystem.findBestCover.mockReturnValue(newCover);
        aiStateEngage.setCoverSystem(mockCoverSystem);

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(mockCoverSystem.releaseCover).toHaveBeenCalledWith('c1');
        expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
      });

      it('should use fallback flanked check when no cover system', () => {
        const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
        combatant.target = target;
        combatant.inCover = true;
        combatant.coverPosition = new THREE.Vector3(0, 0, 0);
        isCoverFlanked.mockReturnValue(true);

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(combatant.inCover).toBe(false);
        expect(combatant.coverPosition).toBeUndefined();
      });
    });

    describe('Burst Parameter Adjustment', () => {
      it('should use OPFOR leader burst params', () => {
        const combatant = createMockCombatant('c1', Faction.OPFOR, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.US, new THREE.Vector3(50, 0, 0));
        combatant.target = target;
        combatant.squadRole = 'leader';

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(combatant.skillProfile.burstLength).toBe(4);
        expect(combatant.skillProfile.burstPauseMs).toBe(800);
      });

      it('should use OPFOR follower burst params', () => {
        const combatant = createMockCombatant('c1', Faction.OPFOR, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.US, new THREE.Vector3(50, 0, 0));
        combatant.target = target;
        combatant.squadRole = 'follower';

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(combatant.skillProfile.burstLength).toBe(3);
        expect(combatant.skillProfile.burstPauseMs).toBe(1000);
      });

      it('should use US leader burst params', () => {
        const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(50, 0, 0));
        combatant.target = target;
        combatant.squadRole = 'leader';

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(combatant.skillProfile.burstLength).toBe(3);
        expect(combatant.skillProfile.burstPauseMs).toBe(900);
      });

      it('should use US follower burst params', () => {
        const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(50, 0, 0));
        combatant.target = target;
        combatant.squadRole = 'follower';

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(combatant.skillProfile.burstLength).toBe(3);
        expect(combatant.skillProfile.burstPauseMs).toBe(1100);
      });
    });

    describe('Squad Flanking', () => {
      beforeEach(() => {
        aiStateEngage.setFlankingSystem(mockFlankingSystem);
      });

      it('should initiate flanking when conditions are met', () => {
        const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(50, 0, 0));
        combatant.target = target;
        combatant.squadId = 'squad-1';

        const squad: Squad = {
          id: 'squad-1',
          faction: Faction.US,
          members: ['c1', 'c2', 'c3'],
        } as Squad;
        squads.set('squad-1', squad);
        aiStateEngage.setSquads(squads);

        mockFlankingSystem.shouldInitiateFlank.mockReturnValue(true);
        mockFlankingSystem.initiateFlank.mockReturnValue({ id: 'flank-op-1' });

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(mockFlankingSystem.shouldInitiateFlank).toHaveBeenCalled();
        expect(mockFlankingSystem.initiateFlank).toHaveBeenCalled();
      });

      it('should not initiate flanking if already active', () => {
        const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
        const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(50, 0, 0));
        combatant.target = target;
        combatant.squadId = 'squad-1';

        const squad: Squad = {
          id: 'squad-1',
          faction: Faction.US,
          members: ['c1', 'c2', 'c3'],
        } as Squad;
        squads.set('squad-1', squad);
        aiStateEngage.setSquads(squads);

        mockFlankingSystem.hasActiveFlank.mockReturnValue(true);

        aiStateEngage.handleEngaging(
          combatant, 0.016, playerPosition, allCombatants, spatialGrid,
          canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
        );

        expect(mockFlankingSystem.shouldInitiateFlank).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleSuppressing', () => {
    it('should transition to ENGAGING when suppression time expires', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.SUPPRESSING;
      combatant.suppressionEndTime = Date.now() - 1000; // Already expired

      aiStateEngage.handleSuppressing(combatant, 0.016);

      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(combatant.suppressionTarget).toBeUndefined();
      expect(combatant.suppressionEndTime).toBeUndefined();
    });

    it('should continue suppressing when time has not expired', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.SUPPRESSING;
      combatant.suppressionEndTime = Date.now() + 2000; // Still active
      combatant.alertTimer = 5.0;

      aiStateEngage.handleSuppressing(combatant, 0.016);

      expect(combatant.state).toBe(CombatantState.SUPPRESSING);
      expect(combatant.alertTimer).toBeLessThan(5.0);
    });

    it('should transition to PATROLLING when alert timer expires', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.SUPPRESSING;
      combatant.alertTimer = 0.01;
      const target = createMockTarget('t1', Faction.OPFOR);
      combatant.target = target;

      aiStateEngage.handleSuppressing(combatant, 0.02);

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.target).toBeNull();
      expect(combatant.lastKnownTargetPos).toBeUndefined();
      expect(combatant.suppressionTarget).toBeUndefined();
    });

    it('should handle no suppression end time', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.SUPPRESSING;
      combatant.suppressionEndTime = undefined;
      combatant.alertTimer = 5.0;

      aiStateEngage.handleSuppressing(combatant, 0.016);

      expect(combatant.alertTimer).toBeLessThan(5.0);
    });
  });

  describe('handleAlert', () => {
    const canSeeTarget = vi.fn();

    beforeEach(() => {
      canSeeTarget.mockReturnValue(true);
    });

    it('should decrease alert and reaction timers', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.ALERT;
      combatant.alertTimer = 2.0;
      combatant.reactionTimer = 1.0;
      const target = createMockTarget('t1', Faction.OPFOR);
      combatant.target = target;

      aiStateEngage.handleAlert(combatant, 0.5, playerPosition, canSeeTarget);

      expect(combatant.alertTimer).toBe(1.5);
      expect(combatant.reactionTimer).toBe(0.5);
    });

    it('should transition to ENGAGING when reaction timer expires and can see target', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.ALERT;
      combatant.reactionTimer = 0.01;
      combatant.alertTimer = 2.0;
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(10, 0, 10));
      combatant.target = target;

      aiStateEngage.handleAlert(combatant, 0.02, playerPosition, canSeeTarget);

      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(combatant.currentBurst).toBe(0);
    });

    it('should face target when reaction timer expires', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      combatant.state = CombatantState.ALERT;
      combatant.reactionTimer = 0.01;
      combatant.rotation = 0;
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(10, 0, 10));
      combatant.target = target;

      aiStateEngage.handleAlert(combatant, 0.02, playerPosition, canSeeTarget);

      const expectedRotation = Math.atan2(10, 10);
      expect(combatant.rotation).toBeCloseTo(expectedRotation, 5);
    });

    it('should transition to PATROLLING when cannot see target', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.ALERT;
      combatant.reactionTimer = 0.01;
      const target = createMockTarget('t1', Faction.OPFOR);
      combatant.target = target;
      canSeeTarget.mockReturnValue(false);

      aiStateEngage.handleAlert(combatant, 0.02, playerPosition, canSeeTarget);

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.target).toBeNull();
    });

    it('should transition to DEFENDING when previous state was DEFENDING', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.ALERT;
      combatant.previousState = CombatantState.DEFENDING;
      combatant.reactionTimer = 0.01;
      const target = createMockTarget('t1', Faction.OPFOR);
      combatant.target = target;
      canSeeTarget.mockReturnValue(false);

      aiStateEngage.handleAlert(combatant, 0.02, playerPosition, canSeeTarget);

      expect(combatant.state).toBe(CombatantState.DEFENDING);
    });

    it('should handle player target position', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(10, 0, 10));
      combatant.state = CombatantState.ALERT;
      combatant.reactionTimer = 0.01;
      const target = createMockTarget('PLAYER', Faction.US, new THREE.Vector3(0, 0, 0));
      combatant.target = target;
      const playerPos = new THREE.Vector3(5, 0, 5);

      aiStateEngage.handleAlert(combatant, 0.02, playerPos, canSeeTarget);

      // Should use playerPosition instead of target.position
      const expectedRotation = Math.atan2(5 - 10, 5 - 10);
      expect(combatant.rotation).toBeCloseTo(expectedRotation, 5);
    });
  });

  describe('Squad Suppression', () => {
    const canSeeTarget = vi.fn();
    const shouldSeekCover = vi.fn();
    const findNearestCover = vi.fn();
    const countNearbyEnemies = vi.fn();
    const isCoverFlanked = vi.fn();

    beforeEach(() => {
      canSeeTarget.mockReturnValue(true);
      shouldSeekCover.mockReturnValue(false);
      findNearestCover.mockReturnValue(null);
      countNearbyEnemies.mockReturnValue(0);
      isCoverFlanked.mockReturnValue(false);
    });

    it('should initiate squad suppression when conditions are met', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(50, 0, 0));
      combatant.target = target;
      combatant.squadId = 'squad-1';
      combatant.squadRole = 'leader';

      const c2 = createMockCombatant('c2', Faction.US);
      const c3 = createMockCombatant('c3', Faction.US);
      allCombatants.set('c1', combatant);
      allCombatants.set('c2', c2);
      allCombatants.set('c3', c3);

      const squad: Squad = {
        id: 'squad-1',
        faction: Faction.US,
        members: ['c1', 'c2', 'c3'],
      } as Squad;
      squads.set('squad-1', squad);
      aiStateEngage.setSquads(squads);

      countNearbyEnemies.mockReturnValue(3);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      // Leader should be suppressing
      expect(combatant.state).toBe(CombatantState.SUPPRESSING);
    });

    it('should not initiate suppression if squad too small', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(50, 0, 0));
      combatant.target = target;
      combatant.squadId = 'squad-1';

      const squad: Squad = {
        id: 'squad-1',
        faction: Faction.US,
        members: ['c1', 'c2'], // Only 2 members
      } as Squad;
      squads.set('squad-1', squad);
      aiStateEngage.setSquads(squads);

      countNearbyEnemies.mockReturnValue(3);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).not.toBe(CombatantState.SUPPRESSING);
    });

    it('should respect suppression cooldown', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(50, 0, 0));
      combatant.target = target;
      combatant.squadId = 'squad-1';

      const squad: Squad = {
        id: 'squad-1',
        faction: Faction.US,
        members: ['c1', 'c2', 'c3'],
      } as Squad;
      squads.set('squad-1', squad);
      aiStateEngage.setSquads(squads);

      countNearbyEnemies.mockReturnValue(3);

      // First suppression
      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      // Reset state
      combatant.state = CombatantState.ENGAGING;

      // Try again immediately
      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      // Should not initiate again (cooldown)
      expect(combatant.state).toBe(CombatantState.ENGAGING);
    });

    it('should not initiate if distance too close', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      combatant.squadId = 'squad-1';

      const squad: Squad = {
        id: 'squad-1',
        faction: Faction.US,
        members: ['c1', 'c2', 'c3'],
      } as Squad;
      squads.set('squad-1', squad);
      aiStateEngage.setSquads(squads);

      countNearbyEnemies.mockReturnValue(3);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).not.toBe(CombatantState.SUPPRESSING);
    });

    it('should not initiate if distance too far', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(100, 0, 0));
      combatant.target = target;
      combatant.squadId = 'squad-1';

      const squad: Squad = {
        id: 'squad-1',
        faction: Faction.US,
        members: ['c1', 'c2', 'c3'],
      } as Squad;
      squads.set('squad-1', squad);
      aiStateEngage.setSquads(squads);

      countNearbyEnemies.mockReturnValue(3);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).not.toBe(CombatantState.SUPPRESSING);
    });

    it('should initiate when squadmate has low health', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.OPFOR, new THREE.Vector3(50, 0, 0));
      combatant.target = target;
      combatant.squadId = 'squad-1';
      combatant.squadRole = 'leader';

      const lowHealthMember = createMockCombatant('c2', Faction.US);
      lowHealthMember.health = 30;
      lowHealthMember.maxHealth = 100;

      allCombatants.set('c1', combatant);
      allCombatants.set('c2', lowHealthMember);

      const squad: Squad = {
        id: 'squad-1',
        faction: Faction.US,
        members: ['c1', 'c2', 'c3'],
      } as Squad;
      squads.set('squad-1', squad);
      aiStateEngage.setSquads(squads);

      countNearbyEnemies.mockReturnValue(0);

      aiStateEngage.handleEngaging(
        combatant, 0.016, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );

      expect(combatant.state).toBe(CombatantState.SUPPRESSING);
    });
  });
});
