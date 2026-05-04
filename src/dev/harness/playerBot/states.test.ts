/**
 * Per-state behavior tests. These hit the pure state functions directly via
 * `stepState`, bypassing the PlayerBot shell. The goal is to pin the decision
 * rules of individual states without entangling them with bot bookkeeping.
 */

import { describe, expect, it } from 'vitest';
import {
  engageStrafeIntent,
  horizontalDistance,
  stepState,
} from './states';
import {
  BotTarget,
  BotVec3,
  DEFAULT_PLAYER_BOT_CONFIG,
  PlayerBotState,
  PlayerBotStateContext,
} from './types';
import { NPC_PIXEL_FORGE_VISUAL_HEIGHT, NPC_Y_OFFSET } from '../../../config/CombatantConfig';
import {
  COMBATANT_HIT_PROXY_CHEST_END_RATIO,
  COMBATANT_HIT_PROXY_CHEST_START_RATIO,
  COMBATANT_HIT_PROXY_VISUAL_HEIGHT_MULTIPLIER,
} from '../../../systems/combat/CombatantBodyMetrics';

const TARGET_VISUAL_CHEST_Y_OFFSET =
  NPC_PIXEL_FORGE_VISUAL_HEIGHT
  * COMBATANT_HIT_PROXY_VISUAL_HEIGHT_MULTIPLIER
  * ((COMBATANT_HIT_PROXY_CHEST_START_RATIO + COMBATANT_HIT_PROXY_CHEST_END_RATIO) / 2)
  - NPC_Y_OFFSET;

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

  it('writes an aimTarget toward the objective when moving', () => {
    const step = stepState('PATROL', makeCtx({
      getObjective: () => ({ position: { x: 0, y: 0, z: -100 }, priority: 1 }),
    }));
    expect(step.intent.aimTarget).not.toBeNull();
    expect(step.intent.moveForward).toBeGreaterThan(0);
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

  it('does not transition out of ENGAGE on low health', () => {
    // Regression: the perf-harness player-bot is a push-through surrogate;
    // it must NOT flee on damage. SEEK_COVER and RETREAT have been deleted.
    const target = makeTarget();
    const step = stepState('ENGAGE', makeCtx({
      currentTarget: target,
      health: 5,
    }));
    // Low health → absorbing RESPAWN_WAIT only at health<=0, otherwise
    // the bot stays in ENGAGE and keeps fighting.
    expect(step.nextState).toBeNull();
    expect(step.intent.firePrimary).toBe(true);
  });

  it('does NOT emit backward movement even when target is close', () => {
    // Regression: PR #95 set moveForward = -1 when inside retreatDistance.
    // Players push through close contact; they don't back-pedal into the
    // enemy's line of fire.
    for (let dist = 1; dist <= 100; dist += 5) {
      const target = makeTarget({ position: { x: 0, y: 0, z: -dist } });
      const step = stepState('ENGAGE', makeCtx({ currentTarget: target }));
      expect(step.intent.moveForward).toBeGreaterThanOrEqual(0);
    }
  });

  it('writes an aimTarget at the visual chest proxy from the actor anchor', () => {
    const target = makeTarget({ position: { x: 30, y: NPC_Y_OFFSET, z: 0 } });
    const step = stepState('ENGAGE', makeCtx({ currentTarget: target }));
    expect(step.intent.aimTarget).not.toBeNull();
    expect(step.intent.aimTarget!.x).toBeCloseTo(30, 5);
    expect(step.intent.aimTarget!.y).toBeCloseTo(NPC_Y_OFFSET + TARGET_VISUAL_CHEST_Y_OFFSET, 5);
    expect(step.intent.aimTarget!.y).toBeLessThan(target.position.y);
  });

  it('prefers a rendered aim anchor when the driver supplies one', () => {
    const target = makeTarget({
      position: { x: 30, y: NPC_Y_OFFSET, z: 0 },
      aimPosition: { x: 36, y: NPC_Y_OFFSET + 0.5, z: -4 },
    });
    const step = stepState('ENGAGE', makeCtx({ currentTarget: target }));
    expect(step.intent.aimTarget).not.toBeNull();
    expect(step.intent.aimTarget!.x).toBeCloseTo(36, 5);
    expect(step.intent.aimTarget!.y).toBeCloseTo(NPC_Y_OFFSET + 0.5 + TARGET_VISUAL_CHEST_Y_OFFSET, 5);
    expect(step.intent.aimTarget!.z).toBeCloseTo(-4, 5);
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
});

describe('stepState — absorbing RESPAWN_WAIT guard', () => {
  const states: PlayerBotState[] = ['PATROL', 'ALERT', 'ENGAGE', 'ADVANCE'];
  for (const s of states) {
    it(`forces RESPAWN_WAIT from ${s} when health is zero`, () => {
      const step = stepState(s, makeCtx({ health: 0 }));
      expect(step.nextState).toBe('RESPAWN_WAIT');
    });
  }
});
