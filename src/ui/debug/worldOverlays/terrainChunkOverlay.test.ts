import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTerrainChunkOverlay } from './terrainChunkOverlay';

describe('terrainChunkOverlay', () => {
  it('renders four line segments per active CDLOD tile', () => {
    const tiles = [
      { x: 0, z: 0, size: 64, lodLevel: 0 },
      { x: 128, z: 0, size: 64, lodLevel: 1 },
      { x: 0, z: 128, size: 64, lodLevel: 2 },
    ];
    const overlay = createTerrainChunkOverlay({
      getActiveTiles: () => tiles,
      getHeightAt: () => 10,
    });
    const group = new THREE.Group();
    overlay.mount(group);
    overlay.update!(0.016);
    const lines = group.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect(lines.geometry.drawRange.count).toBe(24); // 3 tiles × 4 edges × 2 verts
    overlay.unmount();
  });
});
