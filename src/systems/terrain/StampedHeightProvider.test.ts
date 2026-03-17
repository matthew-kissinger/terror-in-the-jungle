import { describe, expect, it } from 'vitest';
import type { IHeightProvider } from './IHeightProvider';
import { StampedHeightProvider } from './StampedHeightProvider';

class FlatHeightProvider implements IHeightProvider {
  constructor(private readonly baseHeight: number) {}

  getHeightAt(): number {
    return this.baseHeight;
  }

  getWorkerConfig() {
    return { type: 'noise' as const, seed: 12345 };
  }
}

class SlopedHeightProvider implements IHeightProvider {
  getHeightAt(worldX: number): number {
    return worldX;
  }

  getWorkerConfig() {
    return { type: 'noise' as const, seed: 12345 };
  }
}

describe('StampedHeightProvider', () => {
  it('flattens the inner radius to the resolved target height', () => {
    const provider = new StampedHeightProvider(new FlatHeightProvider(12), [
      {
        kind: 'flatten_circle',
        centerX: 0,
        centerZ: 0,
        innerRadius: 5,
        outerRadius: 8,
        gradeRadius: 8,
        gradeStrength: 0,
        samplingRadius: 5,
        targetHeightMode: 'max',
        heightOffset: 0,
        priority: 100,
      },
    ]);

    expect(provider.getHeightAt(0, 0)).toBe(12);
    expect(provider.getHeightAt(4, 0)).toBe(12);
  });

  it('blends between the target height and base terrain across the outer ring', () => {
    const provider = new StampedHeightProvider(new FlatHeightProvider(0), [
      {
        kind: 'flatten_circle',
        centerX: 0,
        centerZ: 0,
        innerRadius: 4,
        outerRadius: 8,
        gradeRadius: 8,
        gradeStrength: 0,
        samplingRadius: 4,
        targetHeightMode: 'center',
        heightOffset: 10,
        priority: 100,
      },
    ]);

    expect(provider.getHeightAt(2, 0)).toBe(10);
    expect(provider.getHeightAt(10, 0)).toBe(0);
    expect(provider.getHeightAt(6, 0)).toBeGreaterThan(0);
    expect(provider.getHeightAt(6, 0)).toBeLessThan(10);
  });

  it('resolves max target heights from the source provider', () => {
    const provider = new StampedHeightProvider(new SlopedHeightProvider(), [
      {
        kind: 'flatten_circle',
        centerX: 0,
        centerZ: 0,
        innerRadius: 4,
        outerRadius: 6,
        gradeRadius: 6,
        gradeStrength: 0,
        samplingRadius: 4,
        targetHeightMode: 'max',
        heightOffset: 0,
        priority: 100,
      },
    ]);

    expect(provider.getHeightAt(0, 0)).toBeGreaterThan(0);
  });

  it('serializes a stamped worker config with resolved target heights', () => {
    const provider = new StampedHeightProvider(new FlatHeightProvider(3), [
      {
        kind: 'flatten_circle',
        centerX: 0,
        centerZ: 0,
        innerRadius: 2,
        outerRadius: 4,
        gradeRadius: 4,
        gradeStrength: 0,
        samplingRadius: 2,
        targetHeightMode: 'center',
        heightOffset: 0,
        priority: 100,
      },
    ]);

    const config = provider.getWorkerConfig();
    expect(config.type).toBe('stamped');
    if (config.type === 'stamped') {
      expect(config.stamps[0].targetHeight).toBe(3);
    }
  });

  it('supports a graded shoulder beyond the blend ring', () => {
    const provider = new StampedHeightProvider(new FlatHeightProvider(0), [
      {
        kind: 'flatten_circle',
        centerX: 0,
        centerZ: 0,
        innerRadius: 4,
        outerRadius: 8,
        gradeRadius: 14,
        gradeStrength: 0.3,
        samplingRadius: 4,
        targetHeightMode: 'center',
        heightOffset: 10,
        priority: 100,
      },
    ]);

    expect(provider.getHeightAt(8, 0)).toBeCloseTo(3, 5);
    expect(provider.getHeightAt(11, 0)).toBeGreaterThan(0);
    expect(provider.getHeightAt(11, 0)).toBeLessThan(3);
    expect(provider.getHeightAt(15, 0)).toBe(0);
  });

  it('supports flatten_capsule corridor stamps for continuous trail shaping', () => {
    const provider = new StampedHeightProvider(new FlatHeightProvider(0), [
      {
        kind: 'flatten_capsule',
        startX: -10,
        startZ: 0,
        endX: 10,
        endZ: 0,
        innerRadius: 3,
        outerRadius: 5,
        gradeRadius: 8,
        gradeStrength: 0.2,
        samplingRadius: 3,
        targetHeightMode: 'center',
        heightOffset: 6,
        priority: 100,
      },
    ]);

    expect(provider.getHeightAt(0, 0)).toBe(6);
    expect(provider.getHeightAt(0, 4)).toBeGreaterThan(0);
    expect(provider.getHeightAt(0, 4)).toBeLessThan(6);
    expect(provider.getHeightAt(0, 9)).toBe(0);
  });
});
