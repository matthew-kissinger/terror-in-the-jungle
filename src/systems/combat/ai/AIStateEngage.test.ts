import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AIStateEngage } from './AIStateEngage';
import { Combatant, CombatantState, Faction, Squad } from '../types';
import { ISpatialQuery } from '../SpatialOctree';

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
  let spatialGrid: ISpatialQuery | undefined;

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

  function invokeHandleEngaging(combatant: Combatant) {
    aiStateEngage.handleEngaging(
      combatant, 0.016, playerPosition, allCombatants, spatialGrid,
      canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
    );
  }

  describe('handleEngaging - target loss', () => {
    it('drops back to PATROLLING when target is null', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.target = null;

      invokeHandleEngaging(combatant);

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.isFullAuto).toBe(false);
    });

    it('restores DEFENDING when that was the previous state and the target is gone', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.target = null;
      combatant.previousState = CombatantState.DEFENDING;

      invokeHandleEngaging(combatant);

      expect(combatant.state).toBe(CombatantState.DEFENDING);
    });

    it('drops target and returns to PATROLLING when the target is already dead', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      const dead = createMockTarget('dead', Faction.NVA);
      dead.state = CombatantState.DEAD;
      combatant.target = dead;

      invokeHandleEngaging(combatant);

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.target).toBeNull();
    });

    it('releases cover when the target is lost', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.target = null;
      aiStateEngage.setCoverSystem(mockCoverSystem);

      invokeHandleEngaging(combatant);

      expect(mockCoverSystem.releaseCover).toHaveBeenCalledWith('c1');
    });
  });

  describe('handleEngaging - combat behavior', () => {
    it('orients the combatant toward its target', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(10, 0, 10));
      combatant.target = target;

      invokeHandleEngaging(combatant);

      expect(combatant.rotation).toBeCloseTo(Math.atan2(10, 10), 5);
    });

    it('updates lastKnownTargetPos each tick the target is visible', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(20, 0, 0));
      combatant.target = target;

      invokeHandleEngaging(combatant);

      expect(combatant.lastKnownTargetPos).toBeDefined();
      expect(combatant.lastKnownTargetPos!.distanceTo(target.position)).toBeLessThan(0.1);
    });

    it('switches to full-auto behavior at close range', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(10, 0, 0));
      combatant.target = target;

      invokeHandleEngaging(combatant);

      expect(combatant.isFullAuto).toBe(true);
    });

    it('stays on controlled bursts at medium range', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(30, 0, 0));
      combatant.target = target;

      invokeHandleEngaging(combatant);

      expect(combatant.isFullAuto).toBe(false);
    });

    it('increases panic when recently hit, decays it when not', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      combatant.lastHitTime = Date.now() - 500;
      combatant.panicLevel = 0;

      invokeHandleEngaging(combatant);
      expect(combatant.panicLevel).toBeGreaterThan(0);

      combatant.lastHitTime = Date.now() - 10000;
      const panicHigh = combatant.panicLevel;
      aiStateEngage.handleEngaging(
        combatant, 1.0, playerPosition, allCombatants, spatialGrid,
        canSeeTarget, shouldSeekCover, findNearestCover, countNearbyEnemies, isCoverFlanked
      );
      expect(combatant.panicLevel).toBeLessThan(panicHigh);
    });

    it('VC combatants enter panic full-auto at a lower panic level than NVA', () => {
      // Same stimulus (recent hit + medium-range target) to a VC and an NVA combatant.
      // VC doctrine panics sooner; NVA is committed and holds controlled fire.
      const vcPos = new THREE.Vector3(0, 0, 0);
      const nvaPos = new THREE.Vector3(0, 0, 0);
      const vc = createMockCombatant('vc1', Faction.VC, vcPos);
      const nva = createMockCombatant('nva1', Faction.NVA, nvaPos);
      const vcTarget = createMockTarget('tv', Faction.US, new THREE.Vector3(30, 0, 0));
      const nvaTarget = createMockTarget('tn', Faction.US, new THREE.Vector3(30, 0, 0));
      vc.target = vcTarget;
      nva.target = nvaTarget;

      // Recently hit — inside PANIC_HIT_WINDOW so panicLevel increments on this tick.
      vc.lastHitTime = Date.now() - 500;
      nva.lastHitTime = Date.now() - 500;
      vc.panicLevel = 0.4;
      nva.panicLevel = 0.4;

      invokeHandleEngaging(vc);
      invokeHandleEngaging(nva);

      // After increment (~0.7), VC is above its doctrine threshold, NVA is not.
      expect(vc.isFullAuto).toBe(true);
      expect(nva.isFullAuto).toBe(false);
    });

    it('goes full-auto when nearby enemies cross the threshold', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      countNearbyEnemies.mockReturnValue(4);

      invokeHandleEngaging(combatant);

      expect(combatant.isFullAuto).toBe(true);
    });

    it('transitions to SUPPRESSING when the target is not visible', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      canSeeTarget.mockReturnValue(false);

      invokeHandleEngaging(combatant);

      expect(combatant.state).toBe(CombatantState.SUPPRESSING);
      expect(combatant.lastKnownTargetPos).toBeDefined();
    });

    it('transitions to SEEKING_COVER and records a cover position when cover is needed', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      shouldSeekCover.mockReturnValue(true);
      findNearestCover.mockReturnValue(new THREE.Vector3(5, 0, 5));

      invokeHandleEngaging(combatant);

      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
      expect(combatant.coverPosition).toBeDefined();
    });

    it('prefers the advanced cover system when one is registered', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      shouldSeekCover.mockReturnValue(true);

      const coverSpot = { position: new THREE.Vector3(5, 0, 5) };
      mockCoverSystem.findBestCover.mockReturnValue(coverSpot);
      aiStateEngage.setCoverSystem(mockCoverSystem);

      invokeHandleEngaging(combatant);

      expect(mockCoverSystem.findBestCover).toHaveBeenCalled();
      expect(mockCoverSystem.claimCover).toHaveBeenCalledWith(combatant, expect.any(THREE.Vector3));
      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
    });
  });

  describe('handleEngaging - in-cover behavior', () => {
    it('repositions out of cover when the cover system signals it is no longer effective', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      combatant.inCover = true;
      combatant.coverPosition = new THREE.Vector3(0, 0, 0);

      mockCoverSystem.evaluateCurrentCover.mockReturnValue({ effective: false, shouldReposition: true });
      mockCoverSystem.findBestCover.mockReturnValue({ position: new THREE.Vector3(10, 0, 10) });
      aiStateEngage.setCoverSystem(mockCoverSystem);

      invokeHandleEngaging(combatant);

      expect(mockCoverSystem.releaseCover).toHaveBeenCalledWith('c1');
      expect(combatant.state).toBe(CombatantState.SEEKING_COVER);
    });

    it('breaks out of cover when the fallback flanked-check signals exposure', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(20, 0, 0));
      combatant.target = target;
      combatant.inCover = true;
      combatant.coverPosition = new THREE.Vector3(0, 0, 0);
      isCoverFlanked.mockReturnValue(true);

      invokeHandleEngaging(combatant);

      expect(combatant.inCover).toBe(false);
      expect(combatant.coverPosition).toBeUndefined();
    });
  });

  describe('handleEngaging - squad flanking', () => {
    beforeEach(() => {
      aiStateEngage.setFlankingSystem(mockFlankingSystem);
    });

    it('initiates a flank when the flanking system says to', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(50, 0, 0));
      combatant.target = target;
      combatant.squadId = 'squad-1';

      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: ['c1', 'c2', 'c3'] } as Squad);
      aiStateEngage.setSquads(squads);

      mockFlankingSystem.shouldInitiateFlank.mockReturnValue(true);
      mockFlankingSystem.initiateFlank.mockReturnValue({ id: 'flank-op-1' });

      invokeHandleEngaging(combatant);

      expect(mockFlankingSystem.initiateFlank).toHaveBeenCalled();
    });

    it('does not try to start a flank if one is already active for the squad', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(50, 0, 0));
      combatant.target = target;
      combatant.squadId = 'squad-1';

      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: ['c1', 'c2', 'c3'] } as Squad);
      aiStateEngage.setSquads(squads);

      mockFlankingSystem.hasActiveFlank.mockReturnValue(true);

      invokeHandleEngaging(combatant);

      expect(mockFlankingSystem.shouldInitiateFlank).not.toHaveBeenCalled();
    });
  });

  describe('handleSuppressing', () => {
    it('returns to ENGAGING when the suppression timer expires', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.SUPPRESSING;
      combatant.suppressionEndTime = Date.now() - 1000;

      aiStateEngage.handleSuppressing(combatant, 0.016);

      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(combatant.suppressionTarget).toBeUndefined();
      expect(combatant.suppressionEndTime).toBeUndefined();
    });

    it('continues suppressing while the timer is active', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.SUPPRESSING;
      combatant.suppressionEndTime = Date.now() + 2000;
      combatant.alertTimer = 5.0;

      aiStateEngage.handleSuppressing(combatant, 0.016);

      expect(combatant.state).toBe(CombatantState.SUPPRESSING);
      expect(combatant.alertTimer).toBeLessThan(5.0);
    });

    it('decays to PATROLLING when the alert timer runs out', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.SUPPRESSING;
      combatant.alertTimer = 0.01;
      combatant.target = createMockTarget('t1', Faction.NVA);

      aiStateEngage.handleSuppressing(combatant, 0.02);

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.target).toBeNull();
    });
  });

  describe('handleAlert', () => {
    const canSee = vi.fn();

    beforeEach(() => {
      canSee.mockReturnValue(true);
    });

    it('ticks down alert and reaction timers', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.ALERT;
      combatant.alertTimer = 2.0;
      combatant.reactionTimer = 1.0;
      combatant.target = createMockTarget('t1', Faction.NVA);

      aiStateEngage.handleAlert(combatant, 0.5, playerPosition, canSee);

      expect(combatant.alertTimer).toBe(1.5);
      expect(combatant.reactionTimer).toBe(0.5);
    });

    it('escalates to ENGAGING when reaction timer hits zero and target is visible', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.ALERT;
      combatant.reactionTimer = 0.01;
      combatant.target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(10, 0, 10));

      aiStateEngage.handleAlert(combatant, 0.02, playerPosition, canSee);

      expect(combatant.state).toBe(CombatantState.ENGAGING);
      expect(combatant.currentBurst).toBe(0);
    });

    it('falls back to PATROLLING when the target was lost before the reaction fires', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.ALERT;
      combatant.reactionTimer = 0.01;
      combatant.target = createMockTarget('t1', Faction.NVA);
      canSee.mockReturnValue(false);

      aiStateEngage.handleAlert(combatant, 0.02, playerPosition, canSee);

      expect(combatant.state).toBe(CombatantState.PATROLLING);
      expect(combatant.target).toBeNull();
    });

    it('returns to DEFENDING when that was the previous state and target was lost', () => {
      const combatant = createMockCombatant('c1', Faction.US);
      combatant.state = CombatantState.ALERT;
      combatant.previousState = CombatantState.DEFENDING;
      combatant.reactionTimer = 0.01;
      combatant.target = createMockTarget('t1', Faction.NVA);
      canSee.mockReturnValue(false);

      aiStateEngage.handleAlert(combatant, 0.02, playerPosition, canSee);

      expect(combatant.state).toBe(CombatantState.DEFENDING);
    });
  });

  describe('squad suppression', () => {
    it('initiates suppression from the leader when squad size and engagement distance qualify', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      leader.target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(50, 0, 0));
      leader.squadId = 'squad-1';
      leader.squadRole = 'leader';

      allCombatants.set('c1', leader);
      allCombatants.set('c2', createMockCombatant('c2', Faction.US));
      allCombatants.set('c3', createMockCombatant('c3', Faction.US));

      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: ['c1', 'c2', 'c3'] } as Squad);
      aiStateEngage.setSquads(squads);
      countNearbyEnemies.mockReturnValue(3);

      invokeHandleEngaging(leader);

      expect(leader.state).toBe(CombatantState.SUPPRESSING);
    });

    it('does not initiate squad suppression for squads below the minimum size', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      combatant.target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(50, 0, 0));

      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: ['c1', 'c2'] } as Squad);
      aiStateEngage.setSquads(squads);
      countNearbyEnemies.mockReturnValue(3);

      invokeHandleEngaging(combatant);

      expect(combatant.state).not.toBe(CombatantState.SUPPRESSING);
    });

    it('respects the suppression cooldown between attempts', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      combatant.target = createMockTarget('t1', Faction.NVA, new THREE.Vector3(50, 0, 0));
      combatant.squadId = 'squad-1';

      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: ['c1', 'c2', 'c3'] } as Squad);
      aiStateEngage.setSquads(squads);
      countNearbyEnemies.mockReturnValue(3);

      invokeHandleEngaging(combatant);
      combatant.state = CombatantState.ENGAGING;
      invokeHandleEngaging(combatant);

      expect(combatant.state).toBe(CombatantState.ENGAGING);
    });

    it('does not suppress at distances outside the engagement band', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      combatant.squadId = 'squad-1';

      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: ['c1', 'c2', 'c3'] } as Squad);
      aiStateEngage.setSquads(squads);
      countNearbyEnemies.mockReturnValue(3);

      // Too close
      combatant.target = createMockTarget('t-close', Faction.NVA, new THREE.Vector3(20, 0, 0));
      invokeHandleEngaging(combatant);
      expect(combatant.state).not.toBe(CombatantState.SUPPRESSING);

      // Too far
      combatant.state = CombatantState.ENGAGING;
      combatant.target = createMockTarget('t-far', Faction.NVA, new THREE.Vector3(500, 0, 0));
      invokeHandleEngaging(combatant);
      expect(combatant.state).not.toBe(CombatantState.SUPPRESSING);
    });

    it('uses member elevation for flank cover probes without mutating member positions', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 5, 0));
      const suppressor = createMockCombatant('c2', Faction.US, new THREE.Vector3(5, 9, 0));
      const flanker = createMockCombatant('c3', Faction.US, new THREE.Vector3(-5, 14, 0));
      const targetPos = new THREE.Vector3(50, 0, 0);
      leader.squadId = 'squad-1';
      leader.squadRole = 'leader';

      allCombatants.set('c1', leader);
      allCombatants.set('c2', suppressor);
      allCombatants.set('c3', flanker);

      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: ['c1', 'c2', 'c3'] } as Squad);
      aiStateEngage.setSquads(squads);

      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.0);
      findNearestCover.mockReturnValue(null);

      aiStateEngage.initiateSquadSuppression(leader, targetPos, allCombatants, findNearestCover);

      randomSpy.mockRestore();

      expect(findNearestCover).toHaveBeenCalledTimes(1);
      const [probeCombatant] = findNearestCover.mock.calls[0];
      expect((probeCombatant as Combatant).position.y).toBe(14);
      expect(flanker.position.y).toBe(14);
      expect(flanker.state).toBe(CombatantState.ADVANCING);
    });

    it('reuses a nearby existing flank destination instead of re-searching cover', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 2, 0));
      const suppressor = createMockCombatant('c2', Faction.US, new THREE.Vector3(5, 4, 0));
      const flanker = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 7, 0));
      leader.squadId = 'squad-1';
      leader.squadRole = 'leader';
      flanker.destinationPoint = new THREE.Vector3(50, 7, -20);

      allCombatants.set('c1', leader);
      allCombatants.set('c2', suppressor);
      allCombatants.set('c3', flanker);

      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: ['c1', 'c2', 'c3'] } as Squad);
      aiStateEngage.setSquads(squads);

      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.0);
      findNearestCover.mockReturnValue(null);

      aiStateEngage.initiateSquadSuppression(leader, new THREE.Vector3(50, 0, 0), allCombatants, findNearestCover);

      randomSpy.mockRestore();

      expect(findNearestCover).not.toHaveBeenCalled();
      expect(flanker.state).toBe(CombatantState.ADVANCING);
      expect(flanker.destinationPoint!.distanceTo(new THREE.Vector3(50, 7, -20))).toBeLessThan(0.001);
    });

    it('caps flank cover searches per suppression initiation for larger squads', () => {
      const leader = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 2, 0));
      leader.squadId = 'squad-1';
      leader.squadRole = 'leader';

      const members = [leader];
      for (let i = 2; i <= 6; i++) {
        const member = createMockCombatant(`c${i}`, Faction.US, new THREE.Vector3(i * 2, i, 0));
        member.squadId = 'squad-1';
        member.squadRole = 'follower';
        members.push(member);
      }

      members.forEach(member => allCombatants.set(member.id, member));
      squads.set('squad-1', { id: 'squad-1', faction: Faction.US, members: members.map(m => m.id) } as Squad);
      aiStateEngage.setSquads(squads);

      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.0);
      findNearestCover.mockReturnValue(null);

      aiStateEngage.initiateSquadSuppression(leader, new THREE.Vector3(60, 0, 0), allCombatants, findNearestCover);

      randomSpy.mockRestore();

      // Cover search is budget-capped per initiation (currently 2).
      expect(findNearestCover).toHaveBeenCalledTimes(2);
      for (const member of members.slice(2)) {
        expect(member.state).toBe(CombatantState.ADVANCING);
        expect(member.destinationPoint).toBeDefined();
      }
    });
  });
});
