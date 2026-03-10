import { describe, expect, it } from 'vitest';
import { SimulationScheduler } from './SimulationScheduler';

describe('SimulationScheduler', () => {
  it('accumulates delta until the configured interval is reached', () => {
    const scheduler = new SimulationScheduler([
      { id: 'war_sim', intervalSeconds: 0.5 },
    ]);

    expect(scheduler.consume('war_sim', 0.2)).toBeNull();
    expect(scheduler.consume('war_sim', 0.2)).toBeNull();
    expect(scheduler.consume('war_sim', 0.2)).toBeCloseTo(0.6);
    expect(scheduler.consume('war_sim', 0.1)).toBeNull();
  });

  it('returns every-frame groups immediately', () => {
    const scheduler = new SimulationScheduler([
      { id: 'air_support', intervalSeconds: 0 },
    ]);

    expect(scheduler.consume('air_support', 0.016)).toBeCloseTo(0.016);
    expect(scheduler.consume('air_support', 0.033)).toBeCloseTo(0.033);
  });

  it('can reset individual and all group accumulators', () => {
    const scheduler = new SimulationScheduler([
      { id: 'world_state', intervalSeconds: 0.5 },
      { id: 'mode_runtime', intervalSeconds: 1.0 },
    ]);

    expect(scheduler.consume('world_state', 0.3)).toBeNull();
    scheduler.reset('world_state');
    expect(scheduler.consume('world_state', 0.3)).toBeNull();

    expect(scheduler.consume('mode_runtime', 0.8)).toBeNull();
    scheduler.reset();
    expect(scheduler.consume('mode_runtime', 0.3)).toBeNull();
  });
});
