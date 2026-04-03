import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetCoverSearchBudget,
  tryConsumeCoverSearch,
  getCoverSearchBudgetStats,
} from './CoverSearchBudget';

describe('CoverSearchBudget', () => {
  beforeEach(() => {
    // Reset twice: first to flush any dirty frame, second for clean state
    resetCoverSearchBudget();
    resetCoverSearchBudget();
  });

  it('allows searches up to the per-frame limit', () => {
    const max = getCoverSearchBudgetStats().maxPerFrame;
    for (let i = 0; i < max; i++) {
      expect(tryConsumeCoverSearch()).toBe(true);
    }
    expect(getCoverSearchBudgetStats().usedThisFrame).toBe(max);
  });

  it('denies searches after budget is exhausted', () => {
    const max = getCoverSearchBudgetStats().maxPerFrame;
    for (let i = 0; i < max; i++) {
      tryConsumeCoverSearch();
    }
    expect(tryConsumeCoverSearch()).toBe(false);
    expect(tryConsumeCoverSearch()).toBe(false);
    expect(getCoverSearchBudgetStats().deniedThisFrame).toBe(2);
  });

  it('resets counter each frame', () => {
    const max = getCoverSearchBudgetStats().maxPerFrame;
    for (let i = 0; i < max; i++) {
      tryConsumeCoverSearch();
    }
    expect(tryConsumeCoverSearch()).toBe(false);

    resetCoverSearchBudget();

    expect(tryConsumeCoverSearch()).toBe(true);
    expect(getCoverSearchBudgetStats().usedThisFrame).toBe(1);
    expect(getCoverSearchBudgetStats().deniedThisFrame).toBe(0);
  });

  it('tracks exhausted frames', () => {
    const baseExhausted = getCoverSearchBudgetStats().totalExhaustedFrames;
    const max = getCoverSearchBudgetStats().maxPerFrame;
    for (let i = 0; i < max; i++) {
      tryConsumeCoverSearch();
    }
    // Budget is fully used -- next reset counts this as an exhausted frame
    resetCoverSearchBudget();
    expect(getCoverSearchBudgetStats().totalExhaustedFrames).toBe(baseExhausted + 1);
  });

  it('reports correct per-frame saturation', () => {
    // Use 3 of 6
    tryConsumeCoverSearch();
    tryConsumeCoverSearch();
    tryConsumeCoverSearch();

    const stats = getCoverSearchBudgetStats();
    expect(stats.saturationRate).toBeCloseTo(0.5);
    expect(stats.usedThisFrame).toBe(3);
    expect(stats.deniedThisFrame).toBe(0);
  });

  it('accumulates denied within a single frame', () => {
    const max = getCoverSearchBudgetStats().maxPerFrame;
    // Exhaust and deny 2
    for (let i = 0; i < max + 2; i++) {
      tryConsumeCoverSearch();
    }
    expect(getCoverSearchBudgetStats().deniedThisFrame).toBe(2);
    expect(getCoverSearchBudgetStats().usedThisFrame).toBe(max);
  });
});
