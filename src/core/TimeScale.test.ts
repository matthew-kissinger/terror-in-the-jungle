import { describe, expect, it } from 'vitest';
import { TimeScale } from './TimeScale';

describe('TimeScale', () => {
  it('defaults to 1x and running', () => {
    const ts = new TimeScale();
    expect(ts.get()).toBe(1);
    expect(ts.isPaused()).toBe(false);
  });

  it('pause drives the dispatched multiplier to zero', () => {
    const ts = new TimeScale();
    ts.pause();
    expect(ts.get()).toBe(0);
  });

  it('resume restores the previous scale tier', () => {
    const ts = new TimeScale();
    ts.set(0.25);
    ts.pause();
    expect(ts.get()).toBe(0);
    ts.resume();
    expect(ts.get()).toBe(0.25);
  });

  it('togglePause flips paused state and return value reflects it', () => {
    const ts = new TimeScale();
    expect(ts.togglePause()).toBe(true);
    expect(ts.isPaused()).toBe(true);
    expect(ts.togglePause()).toBe(false);
    expect(ts.isPaused()).toBe(false);
  });

  it('stepOneFrame while paused yields exactly one non-zero dispatch', () => {
    const ts = new TimeScale();
    ts.pause();
    ts.stepOneFrame();
    // First dispatch: full scale because a step is pending.
    expect(ts.get()).toBe(1);
    ts.postDispatch();
    // Second dispatch: back to paused.
    expect(ts.get()).toBe(0);
  });

  it('stepOneFrame is a no-op when not paused', () => {
    const ts = new TimeScale();
    ts.stepOneFrame();
    expect(ts.wasStepRequested()).toBe(false);
    expect(ts.get()).toBe(1);
  });

  it('spammed step requests within one paused frame only consume one frame', () => {
    const ts = new TimeScale();
    ts.pause();
    ts.stepOneFrame();
    ts.stepOneFrame();
    ts.stepOneFrame();
    expect(ts.get()).toBe(1);
    ts.postDispatch();
    expect(ts.get()).toBe(0);
  });

  it('faster and slower walk the tier list and clamp at the edges', () => {
    const ts = new TimeScale();
    // Walk down to the floor.
    expect(ts.slower()).toBe(0.5);
    expect(ts.slower()).toBe(0.25);
    expect(ts.slower()).toBe(0.1);
    expect(ts.slower()).toBe(0.1); // clamped
    // Walk back up past 1x to the ceiling.
    expect(ts.faster()).toBe(0.25);
    expect(ts.faster()).toBe(0.5);
    expect(ts.faster()).toBe(1);
    expect(ts.faster()).toBe(2);
    expect(ts.faster()).toBe(4);
    expect(ts.faster()).toBe(4); // clamped
  });

  it('isScaled reflects whether scale differs from 1x', () => {
    const ts = new TimeScale();
    expect(ts.isScaled()).toBe(false);
    ts.set(0.25);
    expect(ts.isScaled()).toBe(true);
    ts.set(1);
    expect(ts.isScaled()).toBe(false);
  });

  it('reset returns to the default state', () => {
    const ts = new TimeScale();
    ts.set(4);
    ts.pause();
    ts.stepOneFrame();
    ts.reset();
    expect(ts.get()).toBe(1);
    expect(ts.isPaused()).toBe(false);
    expect(ts.wasStepRequested()).toBe(false);
  });

  it('two consecutive dispatches at 0.5x halve the simulated time', () => {
    // Behavior check from the caller's POV: sum of scaled deltas matches.
    const ts = new TimeScale();
    ts.set(0.5);
    const rawDelta = 0.016;
    let simulated = 0;
    for (let i = 0; i < 10; i++) {
      simulated += rawDelta * ts.get();
      ts.postDispatch();
    }
    expect(simulated).toBeCloseTo(rawDelta * 10 * 0.5, 6);
  });
});
