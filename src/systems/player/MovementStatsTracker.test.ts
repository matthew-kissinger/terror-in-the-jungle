import { beforeEach, describe, expect, it } from 'vitest';
import { movementStatsTracker } from './MovementStatsTracker';

describe('MovementStatsTracker', () => {
  beforeEach(() => {
    movementStatsTracker.reset();
  });

  it('tracks distance, climb time, and terrain redirects', () => {
    movementStatsTracker.recordPlayerSample(true, 6, 5, 0.12, false, true, 1, 0, 0);
    movementStatsTracker.recordPlayerSample(true, 6, 4, 0.08, false, true, 1, 4, 0);
    movementStatsTracker.recordPlayerSample(true, 0, 0, 0, false, false, 1, 4, 0);

    const summary = movementStatsTracker.getPlayerSummary();
    expect(summary.distanceMeters).toBeCloseTo(9, 1);
    expect(summary.climbSeconds).toBeCloseTo(2, 1);
    expect(summary.terrainRedirects).toBe(1);
  });

  it('accumulates pinned time and events when movement stays in a tight area', () => {
    for (let i = 0; i < 4; i++) {
      movementStatsTracker.recordPlayerSample(true, 6, 0.4, 0, false, false, 0.4, 10.1, 9.9);
    }

    const summary = movementStatsTracker.getPlayerSummary();
    expect(summary.pinnedEvents).toBe(1);
    expect(summary.pinnedSeconds).toBeGreaterThanOrEqual(1.2);
  });
});
