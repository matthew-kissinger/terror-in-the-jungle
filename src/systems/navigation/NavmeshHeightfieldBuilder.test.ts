import { describe, it, expect } from 'vitest';
import { buildHeightfieldMesh } from './NavmeshHeightfieldBuilder';

describe('buildHeightfieldMesh', () => {
  it('creates geometry with correct vertex count for a small grid', () => {
    const geo = buildHeightfieldMesh(() => 0, 0, 0, 8, 8, 4);
    // 8m / 4m cell = 2 intervals + 1 = 3 cols x 3 rows = 9 vertices
    const positions = geo.getAttribute('position');
    expect(positions.count).toBe(9);
    geo.dispose();
  });

  it('samples Y from the height provider', () => {
    const geo = buildHeightfieldMesh(
      (x, z) => x + z, // height = x + z
      0, 0, 4, 4, 4
    );
    // Grid: (0,0), (4,0), (0,4), (4,4) = 4 vertices
    const positions = geo.getAttribute('position');
    // Vertex at (4, ?, 4) should have Y = 8
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = positions.getY(i);
      expect(y).toBeCloseTo(x + z);
    }
    geo.dispose();
  });

  it('creates indexed triangles (2 per quad)', () => {
    const geo = buildHeightfieldMesh(() => 0, 0, 0, 8, 8, 4);
    // 3x3 grid = 2x2 quads = 4 quads, 2 tris each = 8 tris = 24 indices
    const index = geo.getIndex()!;
    expect(index).not.toBeNull();
    expect(index.count).toBe(24);
    geo.dispose();
  });

  it('respects origin offset', () => {
    const geo = buildHeightfieldMesh(() => 5, -100, -200, 4, 4, 4);
    const positions = geo.getAttribute('position');
    // First vertex should be at (-100, 5, -200)
    expect(positions.getX(0)).toBe(-100);
    expect(positions.getY(0)).toBe(5);
    expect(positions.getZ(0)).toBe(-200);
    geo.dispose();
  });
});
