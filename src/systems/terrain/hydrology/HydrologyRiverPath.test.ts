import { describe, expect, it } from 'vitest';

import type { HydrologyPolylinePoint } from './HydrologyBake';
import { smoothHydrologyRiverPath } from './HydrologyRiverPath';

function point(index: number, x: number, elevationMeters: number): HydrologyPolylinePoint {
  return {
    cell: index,
    x,
    z: 0,
    elevationMeters,
    accumulationCells: 1000 + index * 100,
  };
}

describe('smoothHydrologyRiverPath', () => {
  it('profiles noisy terrain samples into a continuous downstream river grade', () => {
    const path = smoothHydrologyRiverPath([
      point(0, 0, 12),
      point(1, 55, 35),
      point(2, 110, 2),
      point(3, 165, 28),
      point(4, 220, -4),
    ]);

    expect(path.length).toBeGreaterThan(5);
    for (let index = 1; index < path.length; index++) {
      const previous = path[index - 1];
      const current = path[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (!previous || !current) continue;

      const distance = Math.hypot(current.x - previous.x, current.z - previous.z);
      expect(current.elevationMeters).toBeLessThan(previous.elevationMeters);
      expect(previous.elevationMeters - current.elevationMeters).toBeLessThan(distance * 0.04);
    }
  });
});
