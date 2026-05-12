import { describe, expect, it } from 'vitest';
import type { IHeightProvider } from './IHeightProvider';
import { VisualExtentHeightProvider } from './VisualExtentHeightProvider';

function provider(heightAt: (x: number, z: number) => number): IHeightProvider {
  return {
    getHeightAt: heightAt,
    getWorkerConfig: () => ({ type: 'noise', seed: 42 }),
  };
}

describe('VisualExtentHeightProvider', () => {
  it('preserves playable heights inside the gameplay world', () => {
    const base = provider(() => 20);
    const source = provider((x, z) => x * 0.1 + z * 0.05);
    const visual = new VisualExtentHeightProvider(base, source, 100, 50);

    expect(visual.getHeightAt(0, 0)).toBe(20);
    expect(visual.getHeightAt(49, -49)).toBe(20);
  });

  it('continues outside the playable edge using source height deltas', () => {
    const base = provider((x) => x === 50 ? 100 : 20);
    const source = provider((x) => x * 2);
    const visual = new VisualExtentHeightProvider(base, source, 100, 50);

    expect(visual.getHeightAt(50, 0)).toBe(100);
    expect(visual.getHeightAt(70, 0)).toBe(140);
  });

  it('clamps continuation to the visual extent', () => {
    const base = provider(() => 10);
    const source = provider((x) => x);
    const visual = new VisualExtentHeightProvider(base, source, 100, 25);

    expect(visual.getHeightAt(200, 0)).toBe(35);
  });

  it('uses damped edge-slope continuation when the source provider clamps like a DEM', () => {
    const demLike = provider((x) => clampForTest(x, -50, 50) * 2);
    const visual = new VisualExtentHeightProvider(demLike, demLike, 100, 50);

    expect(visual.getHeightAt(50, 0)).toBe(100);
    expect(visual.getHeightAt(70, 0)).toBeGreaterThan(100);
    expect(visual.getHeightAt(70, 0)).toBeLessThan(140);
  });

  it('keeps clamped DEM-like flat edges flat when the playable edge has no slope', () => {
    const flat = provider(() => 25);
    const visual = new VisualExtentHeightProvider(flat, flat, 100, 50);

    expect(visual.getHeightAt(70, 0)).toBe(25);
  });
});

function clampForTest(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
