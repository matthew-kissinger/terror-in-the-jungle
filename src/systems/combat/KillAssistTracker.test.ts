import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { KillAssistTracker } from './KillAssistTracker';
import { Combatant, CombatantState, Faction } from './types';

function createMockCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'test-combatant',
    faction: Faction.US,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.IDLE,
    skillProfile: {
      reactionDelayMs: 500,
      aimJitterAmplitude: 2.0,
      burstLength: 3,
      burstPauseMs: 200,
      leadingErrorFactor: 1.0,
      suppressionResistance: 0.5,
      visualRange: 100,
      fieldOfView: 120,
      firstShotAccuracy: 0.9,
      burstDegradation: 0.1,
    },
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
    weaponSpec: {} as any,
    gunCore: {} as any,
    damageHistory: [],
    ...overrides,
  };
}

describe('KillAssistTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('trackDamage', () => {
    it('adds damage entry to combatant damage history', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);

      expect(combatant.damageHistory).toHaveLength(1);
      expect(combatant.damageHistory![0].attackerId).toBe('attacker-1');
      expect(combatant.damageHistory![0].damage).toBe(25);
      expect(combatant.damageHistory![0].timestamp).toBeDefined();
    });

    it('initializes damage history if undefined', () => {
      const combatant = createMockCombatant({ damageHistory: undefined });

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);

      expect(combatant.damageHistory).toBeDefined();
      expect(combatant.damageHistory).toHaveLength(1);
    });

    it('appends multiple damage entries', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(100);
      KillAssistTracker.trackDamage(combatant, 'attacker-2', 30);
      vi.advanceTimersByTime(100);
      KillAssistTracker.trackDamage(combatant, 'attacker-1', 15);

      expect(combatant.damageHistory).toHaveLength(3);
      expect(combatant.damageHistory![0].attackerId).toBe('attacker-1');
      expect(combatant.damageHistory![1].attackerId).toBe('attacker-2');
      expect(combatant.damageHistory![2].attackerId).toBe('attacker-1');
    });

    it('trims oldest entry when exceeding 10 entries', () => {
      const combatant = createMockCombatant();

      // Add 11 entries
      for (let i = 0; i < 11; i++) {
        KillAssistTracker.trackDamage(combatant, `attacker-${i}`, 10);
        vi.advanceTimersByTime(10);
      }

      expect(combatant.damageHistory).toHaveLength(10);
      expect(combatant.damageHistory![0].attackerId).toBe('attacker-1'); // First was removed
      expect(combatant.damageHistory![9].attackerId).toBe('attacker-10');
    });

    it('maintains correct order after overflow', () => {
      const combatant = createMockCombatant();

      // Add 15 entries
      for (let i = 0; i < 15; i++) {
        KillAssistTracker.trackDamage(combatant, `attacker-${i}`, 10);
        vi.advanceTimersByTime(10);
      }

      expect(combatant.damageHistory).toHaveLength(10);
      // Should have entries 5-14
      expect(combatant.damageHistory![0].attackerId).toBe('attacker-5');
      expect(combatant.damageHistory![9].attackerId).toBe('attacker-14');
    });

    it('records timestamp using performance.now()', () => {
      const combatant = createMockCombatant();

      const startTime = performance.now();
      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      const endTime = performance.now();

      expect(combatant.damageHistory![0].timestamp).toBeGreaterThanOrEqual(startTime);
      expect(combatant.damageHistory![0].timestamp).toBeLessThanOrEqual(endTime);
    });

    it('handles zero damage', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 0);

      expect(combatant.damageHistory).toHaveLength(1);
      expect(combatant.damageHistory![0].damage).toBe(0);
    });

    it('handles negative damage', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', -10);

      expect(combatant.damageHistory).toHaveLength(1);
      expect(combatant.damageHistory![0].damage).toBe(-10);
    });
  });

  describe('processKillAssists', () => {
    it('returns attackers within 10 second window', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(5000); // 5 seconds
      KillAssistTracker.trackDamage(combatant, 'attacker-2', 30);
      vi.advanceTimersByTime(3000); // 8 seconds total

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists.size).toBe(2);
      expect(assists.has('attacker-1')).toBe(true);
      expect(assists.has('attacker-2')).toBe(true);
    });

    it('excludes killer from assists', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(1000);
      KillAssistTracker.trackDamage(combatant, 'attacker-2', 30);
      vi.advanceTimersByTime(1000);
      KillAssistTracker.trackDamage(combatant, 'killer-1', 45);

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists.size).toBe(2);
      expect(assists.has('attacker-1')).toBe(true);
      expect(assists.has('attacker-2')).toBe(true);
      expect(assists.has('killer-1')).toBe(false);
    });

    it('deduplicates attackers', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(1000);
      KillAssistTracker.trackDamage(combatant, 'attacker-1', 20);
      vi.advanceTimersByTime(1000);
      KillAssistTracker.trackDamage(combatant, 'attacker-1', 15);

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists.size).toBe(1);
      expect(assists.has('attacker-1')).toBe(true);
    });

    it('returns empty set for empty damage history', () => {
      const combatant = createMockCombatant({ damageHistory: [] });

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists.size).toBe(0);
    });

    it('returns empty set for undefined damage history', () => {
      const combatant = createMockCombatant({ damageHistory: undefined });

      const assists = KillAssistTracker.processKillAssists(combatant);

      expect(assists.size).toBe(0);
    });

    it('filters out expired damage entries (>10 seconds)', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-old', 25);
      vi.advanceTimersByTime(11000); // 11 seconds - expired
      KillAssistTracker.trackDamage(combatant, 'attacker-recent', 30);
      vi.advanceTimersByTime(2000); // 13 seconds total, but recent is only 2s old

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists.size).toBe(1);
      expect(assists.has('attacker-recent')).toBe(true);
      expect(assists.has('attacker-old')).toBe(false);
    });

    it('clears damage history after processing', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      KillAssistTracker.trackDamage(combatant, 'attacker-2', 30);

      expect(combatant.damageHistory).toHaveLength(2);

      KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(combatant.damageHistory).toHaveLength(0);
    });

    it('handles no killer ID provided', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(1000);
      KillAssistTracker.trackDamage(combatant, 'attacker-2', 30);

      const assists = KillAssistTracker.processKillAssists(combatant);

      expect(assists.size).toBe(2);
      expect(assists.has('attacker-1')).toBe(true);
      expect(assists.has('attacker-2')).toBe(true);
    });

    it('handles killer ID that is not in damage history', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(1000);
      KillAssistTracker.trackDamage(combatant, 'attacker-2', 30);

      const assists = KillAssistTracker.processKillAssists(combatant, 'unknown-killer');

      expect(assists.size).toBe(2);
      expect(assists.has('attacker-1')).toBe(true);
      expect(assists.has('attacker-2')).toBe(true);
    });

    it('handles damage exactly at 10 second boundary', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(10000); // Exactly 10 seconds

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      // Should be excluded (< 10000, not <=)
      expect(assists.size).toBe(0);
    });

    it('handles damage just under 10 second boundary', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(9999); // Just under 10 seconds

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists.size).toBe(1);
      expect(assists.has('attacker-1')).toBe(true);
    });

    it('handles multiple attackers with some expired', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(2000);
      KillAssistTracker.trackDamage(combatant, 'attacker-2', 30);
      vi.advanceTimersByTime(9000); // attacker-1 is now 11s old, attacker-2 is 9s old

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists.size).toBe(1);
      expect(assists.has('attacker-2')).toBe(true);
      expect(assists.has('attacker-1')).toBe(false);
    });

    it('returns Set type', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists).toBeInstanceOf(Set);
    });

    it('handles same attacker as killer with other assisters', () => {
      const combatant = createMockCombatant();

      KillAssistTracker.trackDamage(combatant, 'attacker-1', 25);
      vi.advanceTimersByTime(1000);
      KillAssistTracker.trackDamage(combatant, 'killer-1', 30);
      vi.advanceTimersByTime(1000);
      KillAssistTracker.trackDamage(combatant, 'attacker-2', 20);

      const assists = KillAssistTracker.processKillAssists(combatant, 'killer-1');

      expect(assists.size).toBe(2);
      expect(assists.has('attacker-1')).toBe(true);
      expect(assists.has('attacker-2')).toBe(true);
      expect(assists.has('killer-1')).toBe(false);
    });
  });
});
