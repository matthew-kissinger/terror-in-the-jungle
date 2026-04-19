/**
 * Per-state behavior tests. These hit the pure state functions directly via
 * `stepState`, bypassing the PlayerBot shell. The goal is to pin the decision
 * rules of individual states without entangling them with bot bookkeeping.
 */

import { describe, expect, it } from 'vitest';
import {
  engageStrafeIntent,
  horizontalDistance,
  pitchToward,
  retreatYaw,
  stepState,
  yawToward,
} from './states';
import {
  BotTarget,
  BotVec3,
  DEFAULT_PLAYER_BOT_CONFIG,
  PlayerBotState,
  PlayerBotStateContext,
} from './types';

function makeCtx(overrides: Partial<PlayerBotStateContext> = {}): PlayerBotStateContext {
  const defaults: PlayerBotStateContext = {
    now: 1000,
    state: 'PATROL',
    timeInStateMs: 0,
    eyePos: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 100,
    maxHealth: 100,
    suppressionScore: 0,
    lastDamageMs: 0,
    magazine: { current: 30, max: 30 },
    currentTarget: null,
    findNearestEnemy: () => null,
    canSeeTarget: () => true,
    queryPath: () => null,
    findNearestNavmeshPoint: () => null,
    getObjective: () => null,
    sampleHeight: () => 0,
    config: DEFAULT_PLAYER_BOT_CONFIG,
  };
  return { ...defaults, ...overrides };
}

function makeTarget(overrides: Partial<BotTarget> = {}): BotTarget {
  return {
    id: 'enemy',
    position: { x: 0, y: 0, z: -30 } as BotVec3,
    lastKnownMs: 0,
    ...overrides,
  };
}

describe('states — PATROL', () => {
  it('stays in PATROL when there are no enemies', () => {
    const step = stepState('PATROL', makeCtx());
    expect(step.nextState).toBeNull();
  });

  it('transitions to ALERT when findNearestEnemy returns a target', () => {
    const step = stepState('PATROL', makeCtx({
      findNearestEnemy: () => makeTarget(),
    }));
    expect(step.nextState).toBe('ALERT');
  });

  it('emits no fire intent', () => {
    const step = stepState('PATROL', makeCtx());
    expect(step.intent.firePrimary).toBe(false);
  });
});

describe('states — ALERT', () => {
  it('transitions to ENGAGE when target is visible and in range', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepState('ALERT', makeCtx({
      currentTarget: target,
      canSeeTarget: () => true,
    }));
    expect(step.nextState).toBe('ENGAGE');
  });

  it('transitions to ADVANCE when target is known but occluded', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepState('ALERT', makeCtx({
      currentTarget: target,
      canSeeTarget: () => false,
    }));
    expect(step.nextState).toBe('ADVANCE');
  });

  it('falls back to PATROL when no target can be found', () => {
    const step = stepState('ALERT', makeCtx({
      currentTarget: null,
      findNearestEnemy: () => null,
    }));
    expect(step.nextState).toBe('PATROL');
  });
});

describe('states — ENGAGE', () => {
  it('emits fire intent when target is visible and mag is non-empty', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
      canSeeTarget: () => true,
    }));
    expect(step.intent.firePrimary).toBe(true);
    expect(step.nextState).toBeNull();
  });

  it('emits reload intent when magazine is empty', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
      magazine: { current: 0, max: 30 },
    }));
    expect(step.intent.firePrimary).toBe(false);
    expect(step.intent.reload).toBe(true);
  });

  it('transitions to ADVANCE when LOS is lost', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
      canSeeTarget: () => false,
    }));
    expect(step.nextState).toBe('ADVANCE');
    expect(step.intent.firePrimary).toBe(false);
  });

  it('transitions to ADVANCE when target is out of fire range', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -500 } });
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
      canSeeTarget: () => true,
    }));
    expect(step.nextState).toBe('ADVANCE');
  });

  it('transitions to SEEK_COVER when health drops below the cover threshold', () => {
    const target = makeTarget();
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
      health: 30, // 30% < 50% default threshold
    }));
    expect(step.nextState).toBe('SEEK_COVER');
  });

  it('transitions to RETREAT when health is critical', () => {
    const target = makeTarget();
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
      health: 10,
    }));
    expect(step.nextState).toBe('RETREAT');
  });

  it('backs off when target is uncomfortably close', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -5 } });
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
    }));
    expect(step.intent.moveForward).toBeLessThan(0);
  });

  it('aims the camera at the target', () => {
    const target = makeTarget({ position: { x: 30, y: 0, z: 0 } }); // +x
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
    }));
    expect(step.intent.aimYaw).toBeGreaterThan(0);
  });
});

describe('states — ADVANCE', () => {
  it('transitions to ENGAGE when LOS is re-established', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepState('ADVANCE', makeCtx({
      currentTarget: target,
      canSeeTarget: () => true,
    }));
    expect(step.nextState).toBe('ENGAGE');
  });

  it('keeps moving forward when target is still occluded', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepState('ADVANCE', makeCtx({
      currentTarget: target,
      canSeeTarget: () => false,
    }));
    expect(step.intent.moveForward).toBeGreaterThan(0);
  });

  it('does not emit fire intent in ADVANCE', () => {
    const target = makeTarget();
    const step = stepState('ADVANCE', makeCtx({
      currentTarget: target,
      canSeeTarget: () => false,
    }));
    expect(step.intent.firePrimary).toBe(false);
  });

  it('falls back to PATROL when the target is gone', () => {
    const step = stepState('ADVANCE', makeCtx({
      currentTarget: null,
      findNearestEnemy: () => null,
    }));
    expect(step.nextState).toBe('PATROL');
  });
});

describe('states — SEEK_COVER', () => {
  it('crouches while in cover', () => {
    const step = stepState('SEEK_COVER', makeCtx({
      currentTarget: makeTarget(),
    }));
    expect(step.intent.crouch).toBe(true);
  });

  it('transitions to RETREAT when health is critical', () => {
    const step = stepState('SEEK_COVER', makeCtx({
      currentTarget: makeTarget(),
      health: 10,
    }));
    expect(step.nextState).toBe('RETREAT');
  });

  it('returns to PATROL when the target is stale or missing', () => {
    const step = stepState('SEEK_COVER', makeCtx({
      currentTarget: null,
    }));
    expect(step.nextState).toBe('PATROL');
  });
});

describe('states — RETREAT', () => {
  it('sprints away from the target', () => {
    const target = makeTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepState('RETREAT', makeCtx({
      currentTarget: target,
      lastDamageMs: 1000,
      now: 1100,
    }));
    expect(step.intent.sprint).toBe(true);
    expect(step.intent.moveForward).toBeGreaterThan(0);
  });

  it('returns to PATROL after retreatQuietMs with no damage', () => {
    const target = makeTarget();
    const step = stepState('RETREAT', makeCtx({
      currentTarget: target,
      lastDamageMs: 0,
      now: 10000,
      config: { ...DEFAULT_PLAYER_BOT_CONFIG, retreatQuietMs: 1000 },
    }));
    expect(step.nextState).toBe('PATROL');
  });
});

describe('states — RESPAWN_WAIT', () => {
  it('emits no movement or fire intent', () => {
    const step = stepState('RESPAWN_WAIT', makeCtx({ health: 0 }));
    expect(step.intent.firePrimary).toBe(false);
    expect(step.intent.moveForward).toBe(0);
    expect(step.intent.moveStrafe).toBe(0);
  });

  it('leaves RESPAWN_WAIT once health is restored', () => {
    const step = stepState('RESPAWN_WAIT', makeCtx({ health: 100 }));
    expect(step.nextState).toBe('PATROL');
  });
});

describe('pure helpers', () => {
  it('yawToward is zero for straight-ahead (-z) target', () => {
    const yaw = yawToward({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 });
    expect(yaw).toBeCloseTo(0, 5);
  });

  it('yawToward is +π/2 for +x target', () => {
    const yaw = yawToward({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
    expect(yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it('pitchToward is negative when target is below eye', () => {
    const pitch = pitchToward({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: -10 });
    expect(pitch).toBeLessThan(0);
  });

  it('horizontalDistance ignores y', () => {
    const d = horizontalDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 100, z: 4 });
    expect(d).toBeCloseTo(5, 5);
  });

  it('engageStrafeIntent is bounded by amplitude', () => {
    for (let t = 0; t < 2000; t += 50) {
      const v = engageStrafeIntent(t, 800, 0.3);
      expect(Math.abs(v)).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  it('engageStrafeIntent is zero when amplitude is zero', () => {
    expect(engageStrafeIntent(500, 800, 0)).toBe(0);
  });

  it('retreatYaw flips 180° from yawToward enemy', () => {
    const from = { x: 0, y: 0, z: 0 };
    const enemy = { x: 0, y: 0, z: -10 };
    // yawToward(from, enemy) = 0; yawToward(enemy, from) = π.
    // retreatYaw uses yawToward(enemy_to_from) + offset.
    const yaw = retreatYaw(from, enemy, 0);
    // Expect retreat bearing ≠ attack bearing.
    expect(Math.abs(yaw - yawToward(from, enemy))).toBeGreaterThan(0.1);
  });
});

describe('stepState — absorbing RESPAWN_WAIT guard', () => {
  const states: PlayerBotState[] = ['PATROL', 'ALERT', 'ENGAGE', 'ADVANCE', 'SEEK_COVER', 'RETREAT'];
  for (const s of states) {
    it(`forces RESPAWN_WAIT from ${s} when health is zero`, () => {
      const step = stepState(s, makeCtx({ health: 0 }));
      expect(step.nextState).toBe('RESPAWN_WAIT');
    });
  }
});
