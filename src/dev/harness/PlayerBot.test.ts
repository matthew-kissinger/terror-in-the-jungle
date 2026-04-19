/**
 * Behavior tests for the harness PlayerBot state machine. These assert state
 * transitions and intent invariants — not specific numeric tuning values.
 * (See docs/TESTING.md.)
 */

import { describe, expect, it } from 'vitest';
import {
  BotTarget,
  BotVec3,
  PlayerBot,
  PlayerBotObservation,
} from './PlayerBot';

function makeObservation(overrides: Partial<PlayerBotObservation> = {}): PlayerBotObservation {
  const defaults: PlayerBotObservation = {
    now: 1000,
    eyePos: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 100,
    maxHealth: 100,
    suppressionScore: 0,
    lastDamageMs: 0,
    magazine: { current: 30, max: 30 },
    findNearestEnemy: () => null,
    canSeeTarget: () => true,
    queryPath: () => null,
    findNearestNavmeshPoint: () => null,
    getObjective: () => null,
    sampleHeight: () => 0,
  };
  return { ...defaults, ...overrides };
}

function makeTarget(overrides: Partial<BotTarget> = {}): BotTarget {
  return {
    id: 'enemy_1',
    position: { x: 0, y: 0, z: -30 } as BotVec3,
    lastKnownMs: 0,
    ...overrides,
  };
}

describe('PlayerBot — entry and PATROL', () => {
  it('starts in PATROL', () => {
    const bot = new PlayerBot();
    expect(bot.getState()).toBe('PATROL');
  });

  it('emits no fire intent while in PATROL with no enemies', () => {
    const bot = new PlayerBot();
    const intent = bot.update(250, makeObservation());
    expect(intent.firePrimary).toBe(false);
    expect(intent.reload).toBe(false);
  });

  it('moves toward an objective when there are no enemies', () => {
    const bot = new PlayerBot();
    const intent = bot.update(250, makeObservation({
      getObjective: () => ({ position: { x: 0, y: 0, z: -500 }, priority: 1 }),
    }));
    expect(intent.moveForward).toBeGreaterThan(0);
  });

  it('transitions PATROL → ALERT on first enemy sighting', () => {
    const bot = new PlayerBot();
    bot.update(250, makeObservation({
      findNearestEnemy: () => makeTarget(),
    }));
    expect(bot.getState()).toBe('ALERT');
  });
});

describe('PlayerBot — ALERT to ENGAGE / ADVANCE', () => {
  it('hands off to ENGAGE when target is in range and visible', () => {
    const bot = new PlayerBot();
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => true,
    }));
    // Now in ALERT — next tick should move to ENGAGE (target visible + near).
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => true,
    }));
    expect(bot.getState()).toBe('ENGAGE');
  });

  it('hands off to ADVANCE when target is known but not visible', () => {
    const bot = new PlayerBot();
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => false,
    }));
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => false,
    }));
    expect(bot.getState()).toBe('ADVANCE');
  });
});

describe('PlayerBot — ENGAGE', () => {
  it('fires primary when target is in range + visible + magazine has rounds', () => {
    const bot = new PlayerBot();
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    // PATROL → ALERT
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => true,
    }));
    // ALERT → ENGAGE
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => true,
    }));
    // In ENGAGE — should fire.
    const intent = bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => true,
    }));
    expect(bot.getState()).toBe('ENGAGE');
    expect(intent.firePrimary).toBe(true);
    expect(intent.reload).toBe(false);
  });

  it('reloads instead of firing when magazine is empty', () => {
    const bot = new PlayerBot();
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    const intent = bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      magazine: { current: 0, max: 30 },
    }));
    expect(intent.firePrimary).toBe(false);
    expect(intent.reload).toBe(true);
  });

  it('writes aimTarget toward the target in ENGAGE (not null, not objective)', () => {
    const bot = new PlayerBot();
    const target = makeTarget({ position: { x: 50, y: 0, z: 0 } });
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    const intent = bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    expect(intent.aimTarget).not.toBeNull();
    expect(intent.aimTarget!.x).toBeCloseTo(50, 5);
  });

  it('hands off to ADVANCE when target becomes occluded mid-engagement', () => {
    const bot = new PlayerBot();
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    bot.update(250, makeObservation({ findNearestEnemy: () => target })); // ENGAGE
    // Now LOS breaks:
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => false,
    }));
    expect(bot.getState()).toBe('ADVANCE');
  });

  it('stays in ENGAGE when health is low but non-zero (no RETREAT)', () => {
    // The harness bot is a push-through perf surrogate, not a soldier.
    const bot = new PlayerBot();
    const target = makeTarget();
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    bot.update(250, makeObservation({ findNearestEnemy: () => target })); // ENGAGE
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      health: 10,
    }));
    expect(bot.getState()).toBe('ENGAGE');
  });
});

describe('PlayerBot — ADVANCE', () => {
  it('returns to ENGAGE once line-of-sight is re-established', () => {
    const bot = new PlayerBot();
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    // Drive into ADVANCE.
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => false,
    }));
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => false,
    }));
    expect(bot.getState()).toBe('ADVANCE');
    // Regain LOS — next tick should be ENGAGE.
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => true,
    }));
    expect(bot.getState()).toBe('ENGAGE');
  });

  it('does not fire during ADVANCE', () => {
    const bot = new PlayerBot();
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => false,
    }));
    const intent = bot.update(250, makeObservation({
      findNearestEnemy: () => target,
      canSeeTarget: () => false,
    }));
    expect(bot.getState()).toBe('ADVANCE');
    expect(intent.firePrimary).toBe(false);
  });
});

describe('PlayerBot — RESPAWN_WAIT', () => {
  it('forces RESPAWN_WAIT when health hits zero regardless of current state', () => {
    const bot = new PlayerBot();
    const target = makeTarget();
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    bot.update(250, makeObservation({ findNearestEnemy: () => target })); // ENGAGE
    bot.update(250, makeObservation({ findNearestEnemy: () => target, health: 0 }));
    expect(bot.getState()).toBe('RESPAWN_WAIT');
  });

  it('leaves RESPAWN_WAIT once health returns', () => {
    const bot = new PlayerBot();
    bot.update(250, makeObservation({ health: 0 }));
    expect(bot.getState()).toBe('RESPAWN_WAIT');
    bot.update(250, makeObservation({ health: 100 }));
    expect(bot.getState()).toBe('PATROL');
  });

  it('emits no fire intent in RESPAWN_WAIT', () => {
    const bot = new PlayerBot();
    bot.update(250, makeObservation({ health: 0 }));
    const intent = bot.update(250, makeObservation({ health: 0 }));
    expect(intent.firePrimary).toBe(false);
    expect(intent.moveForward).toBe(0);
    expect(intent.moveStrafe).toBe(0);
  });
});

describe('PlayerBot — transition log and histogram', () => {
  it('records state transitions in the bounded log', () => {
    const bot = new PlayerBot();
    const target = makeTarget();
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    bot.update(250, makeObservation({ findNearestEnemy: () => target }));
    const log = bot.getTransitionLog();
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0].from).toBe('PATROL');
    expect(log[0].to).toBe('ALERT');
  });

  it('accumulates per-state time in the histogram', () => {
    const bot = new PlayerBot();
    bot.update(500, makeObservation()); // PATROL for 500ms
    const histo = bot.getStateHistogram();
    expect(histo.PATROL).toBeGreaterThanOrEqual(500);
  });
});

describe('PlayerBot — intent shape invariants', () => {
  it('moveForward stays within [0, 1] and moveStrafe within [-1, 1]', () => {
    // moveForward is non-negative by contract (bot never back-pedals).
    const bot = new PlayerBot();
    const target = makeTarget();
    const obs = makeObservation({ findNearestEnemy: () => target });
    const intents = [
      bot.update(250, obs),
      bot.update(250, obs),
      bot.update(250, obs),
      bot.update(250, obs),
      bot.update(250, obs),
    ];
    for (const intent of intents) {
      expect(intent.moveForward).toBeGreaterThanOrEqual(0);
      expect(intent.moveForward).toBeLessThanOrEqual(1);
      expect(intent.moveStrafe).toBeGreaterThanOrEqual(-1);
      expect(intent.moveStrafe).toBeLessThanOrEqual(1);
    }
  });

  it('aimTarget is either null or contains finite numbers', () => {
    const bot = new PlayerBot();
    const target = makeTarget();
    for (let i = 0; i < 10; i++) {
      const intent = bot.update(250, makeObservation({ findNearestEnemy: () => target }));
      if (intent.aimTarget) {
        expect(Number.isFinite(intent.aimTarget.x)).toBe(true);
        expect(Number.isFinite(intent.aimTarget.y)).toBe(true);
        expect(Number.isFinite(intent.aimTarget.z)).toBe(true);
      }
    }
  });
});
