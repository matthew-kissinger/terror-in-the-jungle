import { describe, expect, it } from 'vitest';
import type { IHeightProvider } from './IHeightProvider';
import { bakeStampedHeightmapGrid } from './TerrainStampGridBaker';

class FlatHeightProvider implements IHeightProvider {
  constructor(private readonly height: number) {}

  getHeightAt(): number {
    return this.height;
  }

  getWorkerConfig() {
    return { type: 'noise' as const, seed: 7 };
  }
}

describe('TerrainStampGridBaker', () => {
  it('applies flatten circle stamps only within the affected region', () => {
    const data = new Float32Array(5 * 5);
    const baked = bakeStampedHeightmapGrid(
      data,
      5,
      40,
      new FlatHeightProvider(0),
      [
        {
          kind: 'flatten_circle',
          centerX: 0,
          centerZ: 0,
          innerRadius: 4,
          outerRadius: 6,
          gradeRadius: 6,
          gradeStrength: 0,
          samplingRadius: 4,
          targetHeightMode: 'center',
          heightOffset: 8,
          priority: 100,
        },
      ],
    );

    const centerIndex = 2 * 5 + 2;
    expect(baked[centerIndex]).toBe(8);
    expect(baked[0]).toBe(0);
  });

  it('returns the original buffer when there are no stamps', () => {
    const data = new Float32Array([1, 2, 3, 4]);

    const baked = bakeStampedHeightmapGrid(
      data,
      2,
      10,
      new FlatHeightProvider(0),
      [],
    );

    expect(baked).toBe(data);
  });
});
