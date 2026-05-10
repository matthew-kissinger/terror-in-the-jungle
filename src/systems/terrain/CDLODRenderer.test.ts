import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/PerfDiagnostics', () => ({
  isPerfDiagnosticsEnabled: vi.fn(() => false),
}));

// Mock Three.js
vi.mock('three', () => {
  class MockBufferGeometry {
    attributes: Record<string, any> = {};
    index: any = null;
    setAttribute(name: string, attr: any) { this.attributes[name] = attr; }
    setIndex(idx: any) { this.index = idx; }
    rotateX() { return this; }
    dispose = vi.fn();
  }

  class MockBufferAttribute {
    array: any;
    itemSize: number;
    needsUpdate = false;
    constructor(arr: any, size: number) { this.array = arr; this.itemSize = size; }
  }

  class MockInstancedMesh {
    frustumCulled = true;
    count = 0;
    name = '';
    castShadow = false;
    receiveShadow = false;
    geometry: MockBufferGeometry;
    material: any;
    instanceMatrix = { needsUpdate: false };
    private matrices: Float32Array;
    constructor(geo: MockBufferGeometry, mat: any, maxCount: number) {
      this.geometry = geo;
      this.material = mat;
      this.matrices = new Float32Array(maxCount * 16);
    }
    setMatrixAt(i: number, matrix: any) {
      const arr = matrix.elements || new Float32Array(16);
      this.matrices.set(arr, i * 16);
    }
  }

  class MockMatrix4 {
    elements = new Float32Array(16);
    makeScale(sx: number, _sy: number, sz: number) {
      this.elements.fill(0);
      this.elements[0] = sx;
      this.elements[5] = 1;
      this.elements[10] = sz;
      this.elements[15] = 1;
      return this;
    }
    setPosition(x: number, y: number, z: number) {
      this.elements[12] = x;
      this.elements[13] = y;
      this.elements[14] = z;
      return this;
    }
  }

  return {
    PlaneGeometry: MockBufferGeometry,
    BufferGeometry: MockBufferGeometry,
    BufferAttribute: MockBufferAttribute,
    InstancedMesh: MockInstancedMesh,
    InstancedBufferAttribute: class {
      array: Float32Array;
      needsUpdate = false;
      constructor(arr: Float32Array, _size: number) { this.array = arr; }
    },
    Matrix4: MockMatrix4,
    Material: class {},
  };
});

import { isPerfDiagnosticsEnabled } from '../../core/PerfDiagnostics';
import { CDLODRenderer, createTileGeometry } from './CDLODRenderer';
import type { CDLODTile } from './CDLODQuadtree';

const mockIsPerfDiagnosticsEnabled = vi.mocked(isPerfDiagnosticsEnabled);

function setRuntimeSearch(search: string): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search },
    },
  });
}

describe('CDLODRenderer', () => {
  let renderer: CDLODRenderer;

  beforeEach(() => {
    mockIsPerfDiagnosticsEnabled.mockReturnValue(false);
    setRuntimeSearch('');
    renderer = new CDLODRenderer({} as any, 33, 256);
  });

  it('creates mesh with zero initial instances', () => {
    const mesh = renderer.getMesh();
    expect(mesh.count).toBe(0);
  });

  it('updates instance count to match tile count', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0, edgeMorphMask: 0 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.5, edgeMorphMask: 0 },
      { x: 0, z: 64, size: 128, lodLevel: 2, morphFactor: 0.8, edgeMorphMask: 0 },
    ];

    renderer.updateInstances(tiles);

    expect(renderer.getMesh().count).toBe(3);
  });

  it('clamps to max instances', () => {
    const tiles: CDLODTile[] = [];
    for (let i = 0; i < 300; i++) {
      tiles.push({ x: i * 10, z: 0, size: 10, lodLevel: 0, morphFactor: 0, edgeMorphMask: 0 });
    }

    renderer.updateInstances(tiles);
    // Should not exceed maxInstances (256 in this test)
    expect(renderer.getMesh().count).toBeLessThanOrEqual(256);
  });

  // Stage cdlod-edge-morph (cycle-2026-05-09): the renderer must expose
  // the per-instance edgeMorphMask attribute so the vertex shader can
  // force-morph edges abutting coarser neighbours. Tests the contract,
  // not the exact float layout.
  it('exposes a per-instance edgeMorphMask attribute on the geometry', () => {
    const mesh: any = renderer.getMesh();
    expect(mesh.geometry.attributes.edgeMorphMask).toBeDefined();
    expect(mesh.geometry.attributes.edgeMorphMask.array.length).toBe(256);
  });

  it('writes each tile.edgeMorphMask into the attribute slot at its instance index', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0, edgeMorphMask: 5 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.5, edgeMorphMask: 10 },
      { x: 0, z: 64, size: 128, lodLevel: 2, morphFactor: 0.8, edgeMorphMask: 15 },
    ];
    renderer.updateInstances(tiles);
    const mesh: any = renderer.getMesh();
    const arr = mesh.geometry.attributes.edgeMorphMask.array as Float32Array;
    expect(arr[0]).toBe(5);
    expect(arr[1]).toBe(10);
    expect(arr[2]).toBe(15);
    expect(mesh.geometry.attributes.edgeMorphMask.needsUpdate).toBe(true);
  });

  it('keeps terrain shadow casting enabled by default', () => {
    expect(renderer.getMesh().castShadow).toBe(true);
    expect(renderer.getMesh().receiveShadow).toBe(true);
  });

  it('disables only terrain shadow casting under the perf isolation flag', () => {
    mockIsPerfDiagnosticsEnabled.mockReturnValue(true);
    setRuntimeSearch('?perf=1&perfDisableTerrainShadows=1');

    const isolatedRenderer = new CDLODRenderer({} as any, 33, 256);

    expect(isolatedRenderer.getMesh().castShadow).toBe(false);
    expect(isolatedRenderer.getMesh().receiveShadow).toBe(true);
  });

});

// Stage D2 (terrain-cdlod-seam): the tile geometry must carry an interior
// NxN grid plus a perimeter skirt ring so the vertex shader can drop the
// skirt verts to hide LOD-transition cracks. Asserts the contract, not
// the exact triangle layout.
describe('createTileGeometry', () => {
  it('separates interior NxN grid from a perimeter skirt ring via isSkirt attribute', () => {
    const N = 33;
    const geo: any = createTileGeometry(N);
    expect(geo.attributes.position).toBeDefined();
    expect(geo.attributes.isSkirt).toBeDefined();
    const isSkirt = geo.attributes.isSkirt.array as Float32Array;
    let interior = 0, skirt = 0;
    for (let i = 0; i < isSkirt.length; i++) {
      if (isSkirt[i] >= 0.5) skirt++; else interior++;
    }
    expect(interior).toBe(N * N);
    expect(skirt).toBe(4 * N - 4);
    expect(geo.attributes.position.array.length / 3).toBe(N * N + 4 * N - 4);
  });

  it('skirt verts share XZ with their interior duplicates so the drop is purely vertical', () => {
    const N = 17;
    const geo: any = createTileGeometry(N);
    const pos = geo.attributes.position.array as Float32Array;
    const isSkirt = geo.attributes.isSkirt.array as Float32Array;
    for (let i = 0; i < isSkirt.length; i++) {
      if (isSkirt[i] < 0.5) continue;
      const sx = pos[i * 3], sz = pos[i * 3 + 2];
      let matched = false;
      for (let j = 0; j < N * N && !matched; j++) {
        if (Math.abs(pos[j * 3] - sx) < 1e-6 && Math.abs(pos[j * 3 + 2] - sz) < 1e-6) matched = true;
      }
      expect(matched).toBe(true);
    }
  });

  it('emits indexed triangles for both interior and skirt strips', () => {
    const N = 33;
    const geo: any = createTileGeometry(N);
    expect(geo.index).not.toBeNull();
    expect(geo.index.array.length).toBe(((N - 1) * (N - 1) * 2 + (N - 1) * 4 * 2) * 3);
  });

  // Regression: the cycle-2026-05-08 seam fix shipped with z = 0.5 - j/(N-1),
  // which inverted the triangle winding so every interior face had a -Y normal.
  // MeshStandardMaterial's default FrontSide culled the entire terrain when
  // viewed from above. Compute the first interior triangle's normal and assert
  // y > 0 so this can't recur silently.
  it('produces +Y interior face normals so MeshStandardMaterial(FrontSide) does not cull the terrain', () => {
    const N = 17;
    const geo: any = createTileGeometry(N);
    const pos = geo.attributes.position.array as Float32Array;
    const idx = geo.index.array as Uint16Array | Uint32Array;
    const ia = idx[0], ib = idx[1], ic = idx[2];
    const ax = pos[ia * 3], az = pos[ia * 3 + 2];
    const bx = pos[ib * 3], bz = pos[ib * 3 + 2];
    const cx = pos[ic * 3], cz = pos[ic * 3 + 2];
    const e1x = bx - ax, e1z = bz - az;
    const e2x = cx - ax, e2z = cz - az;
    const ny = e1z * e2x - e1x * e2z;
    expect(ny).toBeGreaterThan(0);
  });
});
