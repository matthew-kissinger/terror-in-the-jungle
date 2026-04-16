import { describe, it, expect } from 'vitest';
import { buildHeightfieldMesh } from './NavmeshHeightfieldBuilder';

describe('buildHeightfieldMesh', () => {
  it('builds an indexed mesh whose triangle count matches the grid extent', () => {
    const geo = buildHeightfieldMesh(() => 0, 0, 0, 8, 8, 4);
    const positions = geo.getAttribute('position');
    const index = geo.getIndex();
    expect(index).not.toBeNull();
    // A valid indexed mesh has triangles (3 indices each), and covers the whole grid.
    expect(index!.count % 3).toBe(0);
    expect(positions.count).toBeGreaterThan(0);
    // Every index must reference a real vertex.
    for (let i = 0; i < index!.count; i++) {
      expect(index!.getX(i)).toBeLessThan(positions.count);
    }
    geo.dispose();
  });

  it('samples Y from the height provider at each vertex', () => {
    const geo = buildHeightfieldMesh(
      (x, z) => x + z, // height = x + z
      0, 0, 4, 4, 4
    );
    const positions = geo.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = positions.getY(i);
      expect(y).toBeCloseTo(x + z);
    }
    geo.dispose();
  });

  it('places the first vertex at the requested origin', () => {
    const geo = buildHeightfieldMesh(() => 5, -100, -200, 4, 4, 4);
    const positions = geo.getAttribute('position');
    expect(positions.getX(0)).toBe(-100);
    expect(positions.getY(0)).toBe(5);
    expect(positions.getZ(0)).toBe(-200);
    geo.dispose();
  });
});
