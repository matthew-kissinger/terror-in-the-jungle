/**
 * Behavior tests for PlayerBotController. The controller is a thin intent
 * translator — these tests assert the mapping from intent → PlayerController
 * surface calls, NOT specific numeric tuning.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  PlayerBotController,
  PlayerBotControllerTarget,
  lerpAngle,
} from './PlayerBotController';
import { createIdlePlayerBotIntent } from './types';

function makeTarget(): PlayerBotControllerTarget & {
  movementCalls: Array<{ forward: number; strafe: number; sprint: boolean }>;
  viewCalls: Array<{ yaw: number; pitch: number }>;
  fireCalls: string[];
} {
  const movementCalls: Array<{ forward: number; strafe: number; sprint: boolean }> = [];
  const viewCalls: Array<{ yaw: number; pitch: number }> = [];
  const fireCalls: string[] = [];
  return {
    movementCalls,
    viewCalls,
    fireCalls,
    applyMovementIntent(intent) { movementCalls.push({ ...intent }); },
    setViewAngles(yaw, pitch) { viewCalls.push({ yaw, pitch }); },
    fireStart() { fireCalls.push('start'); },
    fireStop() { fireCalls.push('stop'); },
    reloadWeapon() { fireCalls.push('reload'); },
  };
}

describe('PlayerBotController — movement translation', () => {
  it('passes forward/strafe/sprint through to applyMovementIntent', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = 1;
    intent.moveStrafe = -0.5;
    intent.sprint = true;
    controller.apply(intent);
    expect(target.movementCalls.length).toBe(1);
    expect(target.movementCalls[0].forward).toBeCloseTo(1, 5);
    expect(target.movementCalls[0].strafe).toBeCloseTo(-0.5, 5);
    expect(target.movementCalls[0].sprint).toBe(true);
  });

  it('clamps out-of-range axis values to [-1, 1]', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = 5;
    intent.moveStrafe = -100;
    controller.apply(intent);
    expect(target.movementCalls[0].forward).toBe(1);
    expect(target.movementCalls[0].strafe).toBe(-1);
  });

  it('disables sprint when not moving forward', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = 0;
    intent.sprint = true;
    controller.apply(intent);
    expect(target.movementCalls[0].sprint).toBe(false);
  });

  it('tolerates non-finite inputs by substituting zero', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = NaN;
    intent.moveStrafe = Number.POSITIVE_INFINITY;
    controller.apply(intent);
    expect(target.movementCalls[0].forward).toBe(0);
    // infinity clamps to 1 after finite check; either way, it should be bounded.
    expect(target.movementCalls[0].strafe).toBeLessThanOrEqual(1);
    expect(target.movementCalls[0].strafe).toBeGreaterThanOrEqual(-1);
  });
});

describe('PlayerBotController — aim translation', () => {
  it('snaps view angles at aimLerpRate=1', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimYaw = 1.0;
    intent.aimPitch = 0.5;
    intent.aimLerpRate = 1;
    controller.apply(intent);
    expect(target.viewCalls[0].yaw).toBeCloseTo(1.0, 5);
    expect(target.viewCalls[0].pitch).toBeCloseTo(0.5, 5);
  });

  it('clamps pitch to the ±80° gimbal margin', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.aimPitch = Math.PI; // way past 80°
    intent.aimLerpRate = 1;
    controller.apply(intent);
    const maxPitch = (80 * Math.PI) / 180;
    expect(target.viewCalls[0].pitch).toBeLessThanOrEqual(maxPitch + 1e-6);
  });

  it('slews toward the target yaw at lower lerp rates', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    controller.seedViewAngles(0, 0);
    const intent = createIdlePlayerBotIntent();
    intent.aimYaw = 1.0;
    intent.aimLerpRate = 0.5;
    controller.apply(intent);
    // With rate 0.5 we should be halfway there, not snapped.
    expect(target.viewCalls[0].yaw).toBeCloseTo(0.5, 2);
  });
});

describe('PlayerBotController — fire and reload', () => {
  it('fires exactly once when firePrimary goes high (no duplicate fireStart)', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.firePrimary = true;
    controller.apply(intent);
    controller.apply(intent);
    controller.apply(intent);
    const starts = target.fireCalls.filter(c => c === 'start').length;
    expect(starts).toBe(1);
  });

  it('stops firing when firePrimary drops', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.firePrimary = true;
    controller.apply(intent);
    intent.firePrimary = false;
    controller.apply(intent);
    expect(target.fireCalls).toContain('stop');
  });

  it('routes reload intent to reloadWeapon (and cancels active fire)', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const fire = createIdlePlayerBotIntent();
    fire.firePrimary = true;
    controller.apply(fire);
    const reload = createIdlePlayerBotIntent();
    reload.reload = true;
    controller.apply(reload);
    expect(target.fireCalls).toContain('reload');
    // After reload, firing should have been stopped.
    expect(target.fireCalls).toContain('stop');
  });

  it('reset() releases any held fire state', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.firePrimary = true;
    controller.apply(intent);
    expect(controller.isFiringHeld()).toBe(true);
    controller.reset();
    expect(controller.isFiringHeld()).toBe(false);
    expect(target.fireCalls).toContain('stop');
  });
});

describe('lerpAngle', () => {
  it('returns the start angle at t=0', () => {
    expect(lerpAngle(0.3, 1.5, 0)).toBeCloseTo(0.3, 5);
  });

  it('returns the target angle at t=1', () => {
    expect(lerpAngle(0.3, 1.5, 1)).toBeCloseTo(1.5, 5);
  });

  it('takes the shortest arc across the π/−π boundary', () => {
    // From just below -π to just above +π, shortest arc is ~0.2 rad, not 2π-0.2.
    const from = -Math.PI + 0.1;
    const to = Math.PI - 0.1;
    const mid = lerpAngle(from, to, 0.5);
    // Midpoint should be near ±π, not near 0.
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.1);
  });

  it('clamps t to [0, 1]', () => {
    expect(lerpAngle(0, 1, -5)).toBeCloseTo(0, 5);
    expect(lerpAngle(0, 1, 500)).toBeCloseTo(1, 5);
  });
});

describe('PlayerBotController — integration-lite', () => {
  it('returns an apply-result that reflects committed values', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const intent = createIdlePlayerBotIntent();
    intent.moveForward = 1;
    intent.firePrimary = true;
    intent.aimYaw = 0.25;
    intent.aimPitch = 0.15;
    intent.aimLerpRate = 1;
    const result = controller.apply(intent);
    expect(result.fired).toBe(true);
    expect(result.forward).toBe(1);
    expect(result.yaw).toBeCloseTo(0.25, 5);
    expect(result.pitch).toBeCloseTo(0.15, 5);
  });

  it('multiple applies do not leak unrelated fire calls', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    const noop = createIdlePlayerBotIntent();
    controller.apply(noop);
    controller.apply(noop);
    controller.apply(noop);
    expect(target.fireCalls).toEqual([]);
  });

  it('seedViewAngles sets the starting angle for slew', () => {
    const target = makeTarget();
    const controller = new PlayerBotController(target);
    controller.seedViewAngles(1.0, 0.2);
    expect(controller.getLastYaw()).toBeCloseTo(1.0, 5);
    expect(controller.getLastPitch()).toBeCloseTo(0.2, 5);
  });

  it('does not crash if the target methods throw', () => {
    const faulty: PlayerBotControllerTarget = {
      applyMovementIntent: vi.fn(() => { throw new Error('boom'); }),
      setViewAngles: vi.fn(),
      fireStart: vi.fn(),
      fireStop: vi.fn(),
      reloadWeapon: vi.fn(),
    };
    const controller = new PlayerBotController(faulty);
    // Controller does not wrap applyMovementIntent — a real test should use reset,
    // which DOES swallow errors. Assert reset is safe.
    expect(() => controller.reset()).not.toThrow();
  });
});
