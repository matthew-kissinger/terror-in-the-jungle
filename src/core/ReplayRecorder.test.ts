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
});
