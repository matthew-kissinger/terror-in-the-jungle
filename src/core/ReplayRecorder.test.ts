import { describe, expect, it } from 'vitest';
import { ReplayRecorder } from './ReplayRecorder';

interface SimpleInput {
  fire: boolean;
}

describe('ReplayRecorder', () => {
  it('captures inputs in tick order and seals them into the blob', () => {
    const rec = new ReplayRecorder<SimpleInput>({
      seed: 101,
      scenario: 'unit-test',
      tickRateHz: 60,
    });
    rec.recordInput(0, { fire: false });
    rec.recordInput(1, { fire: true });
    rec.recordInput(2, { fire: false });
    rec.recordFinalState({ tick: 3, timeMs: 50, entities: [] });

    const blob = rec.build();
    expect(blob.format).toBe('replay-v1');
    expect(blob.seed).toBe(101);
    expect(blob.scenario).toBe('unit-test');
    expect(blob.tickRateHz).toBe(60);
    expect(blob.inputs.map((f) => f.tick)).toEqual([0, 1, 2]);
    expect(blob.inputs[1].input.fire).toBe(true);
    expect(blob.finalState.entities).toEqual([]);
  });

  it('throws if build() is called before a final state is recorded', () => {
    const rec = new ReplayRecorder<SimpleInput>({ seed: 1, scenario: 's' });
    rec.recordInput(0, { fire: false });
    expect(() => rec.build()).toThrow(/final state/);
  });

  it('defaults tickRateHz to 60 when unspecified', () => {
    const rec = new ReplayRecorder<SimpleInput>({ seed: 1, scenario: 's' });
    expect(rec.getTickRateHz()).toBe(60);
  });

  it('preserves metadata on the blob', () => {
    const rec = new ReplayRecorder<SimpleInput>({
      seed: 1,
      scenario: 's',
      metadata: { engineBuild: 'test', agent: 'scripted' },
    });
    rec.recordFinalState({ tick: 0, timeMs: 0, entities: [] });
    const blob = rec.build();
    expect(blob.metadata).toEqual({ engineBuild: 'test', agent: 'scripted' });
  });

  it('stops buffering inputs after endSession() and resumes after startSession()', () => {
    // Guards against the "recorder left wired into a long-lived tick loop
    // accumulates forever" heap-regression shape. Behavior assertion:
    // inputs only grow while a session is active.
    const rec = new ReplayRecorder<SimpleInput>({ seed: 1, scenario: 's' });
    rec.recordInput(0, { fire: false });
    rec.endSession();
    rec.recordInput(1, { fire: true });
    rec.recordInput(2, { fire: true });
    expect(rec.getInputCount()).toBe(1);
    rec.startSession();
    rec.recordInput(3, { fire: false });
    expect(rec.getInputCount()).toBe(2);
  });

  it('recordInput is a silent no-op while the session is inactive', () => {
    // No throw, no crash, no buffer growth. Callers outside a session get
    // pass-through behavior without needing a session-aware wrapper.
    const rec = new ReplayRecorder<SimpleInput>({ seed: 1, scenario: 's' });
    rec.endSession();
    expect(() => rec.recordInput(99, { fire: true })).not.toThrow();
    expect(rec.getInputCount()).toBe(0);
    expect(rec.isSessionActive()).toBe(false);
  });
});
