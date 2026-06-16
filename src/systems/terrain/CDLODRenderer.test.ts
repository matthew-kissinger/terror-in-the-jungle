// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/PerfDiagnostics', () => ({
  isPerfDiagnosticsEnabled: vi.fn(() => false),
  isPerfHarnessEnabled: vi.fn(() => false),
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
    usage: unknown = undefined;
    updateRanges: Array<{ start: number; count: number }> = [];
    constructor(arr: any, size: number) { this.array = arr; this.itemSize = size; }
    addUpdateRange(start: number, count: number) { this.updateRanges.push({ start, count }); }
    clearUpdateRanges() { this.updateRanges.length = 0; }
    setUsage(usage: unknown) { this.usage = usage; return this; }
  }

  class MockInstancedMesh {
    frustumCulled = true;
    count = 0;
    name = '';
    castShadow = false;
    receiveShadow = false;
    visible = true;
    userData: Record<string, unknown> = {};
    geometry: MockBufferGeometry;
    material: any;
    layers = {
      mask: 1,
      set: vi.fn((layer: number) => {
        this.layers.mask = 1 << layer;
      }),
    };
    instanceMatrix = {
      needsUpdate: false,
      usage: undefined as unknown,
      updateRanges: [] as Array<{ start: number; count: number }>,
      addUpdateRange(start: number, count: number) { this.updateRanges.push({ start, count }); },
      clearUpdateRanges() { this.updateRanges.length = 0; },
      setUsage(usage: unknown) { this.usage = usage; return this; },
    };
    matrixWriteCount = 0;
    private matrices: Float32Array;
    constructor(geo: MockBufferGeometry, mat: any, maxCount: number) {
      this.geometry = geo;
      this.material = mat;
      this.matrices = new Float32Array(maxCount * 16);
    }
    setMatrixAt(i: number, matrix: any) {
      this.matrixWriteCount++;
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
      itemSize: number;
      needsUpdate = false;
      usage: unknown = undefined;
      updateRanges: Array<{ start: number; count: number }> = [];
      constructor(arr: Float32Array, size: number) {
        this.array = arr;
        this.itemSize = size;
      }
      addUpdateRange(start: number, count: number) { this.updateRanges.push({ start, count }); }
      clearUpdateRanges() { this.updateRanges.length = 0; }
      setUsage(usage: unknown) { this.usage = usage; return this; }
    },
    Matrix4: MockMatrix4,
    Material: class {},
    DynamicDrawUsage: 'DynamicDrawUsage',
  };
});

import { isPerfDiagnosticsEnabled, isPerfHarnessEnabled } from '../../core/PerfDiagnostics';
import { CDLODRenderer, computeTileGeometryStats, createTileGeometry } from './CDLODRenderer';
import type { CDLODTile } from './CDLODQuadtree';

const mockIsPerfDiagnosticsEnabled = vi.mocked(isPerfDiagnosticsEnabled);
const mockIsPerfHarnessEnabled = vi.mocked(isPerfHarnessEnabled);

function setRuntimeSearch(search: string): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search },
    },
  });
}

function expectActivePrefixUpdateRanges(mesh: any, instanceCount: number): void {
  expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: instanceCount * 16 }]);
  expect(mesh.geometry.attributes.tileParams0.updateRanges).toEqual([{ start: 0, count: instanceCount * 4 }]);
  expect(mesh.geometry.attributes.tileParams1.updateRanges).toEqual([{ start: 0, count: instanceCount * 4 }]);
}

describe('CDLODRenderer', () => {
  let renderer: CDLODRenderer;

  beforeEach(() => {
    mockIsPerfDiagnosticsEnabled.mockReturnValue(false);
    mockIsPerfHarnessEnabled.mockReturnValue(false);
    setRuntimeSearch('');
    renderer = new CDLODRenderer({} as any, 33, 256);
  });

  it('creates mesh with zero initial instances', () => {
    const mesh = renderer.getMesh();
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
  });

  it('updates instance count to match tile count', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0, edgeMorphMask: 0 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.5, edgeMorphMask: 0 },
      { x: 0, z: 64, size: 128, lodLevel: 2, morphFactor: 0.8, edgeMorphMask: 0 },
    ];

    renderer.updateInstances(tiles);

    expect(renderer.getMesh().count).toBe(3);
    expect(renderer.getMesh().visible).toBe(true);
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

  it('packs CDLOD instance data into two vec4 attributes for WebGPU vertex-buffer limits', () => {
    const mesh: any = renderer.getMesh();
    expect(mesh.geometry.attributes.tileParams0).toBeDefined();
    expect(mesh.geometry.attributes.tileParams1).toBeDefined();
    expect(mesh.geometry.attributes.tileParams0.itemSize).toBe(4);
    expect(mesh.geometry.attributes.tileParams1.itemSize).toBe(4);
    expect(mesh.geometry.attributes.tileParams0.array.length).toBe(256 * 4);
    expect(mesh.geometry.attributes.tileParams1.array.length).toBe(256 * 4);
    expect(mesh.geometry.attributes.lodLevel).toBeUndefined();
    expect(mesh.geometry.attributes.morphFactor).toBeUndefined();
    expect(mesh.geometry.attributes.edgeMorphMask).toBeUndefined();
  });

  it('writes tile center, size, lod, morph, and edge mask into packed instance params', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0, edgeMorphMask: 5 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.5, edgeMorphMask: 10 },
      { x: 0, z: 64, size: 128, lodLevel: 2, morphFactor: 0.8, edgeMorphMask: 15 },
    ];
    renderer.updateInstances(tiles);
    const mesh: any = renderer.getMesh();
    const params0 = mesh.geometry.attributes.tileParams0.array as Float32Array;
    const params1 = mesh.geometry.attributes.tileParams1.array as Float32Array;
    expect(Array.from(params0.slice(0, 12))).toEqual([
      0, 0, 64, 0,
      64, 0, 64, 1,
      0, 64, 128, 2,
    ]);
    expect(Array.from(params1.slice(0, 8))).toEqual([
      0, 5, 0, 0,
      0.5, 10, 0, 0,
    ]);
    expect(params1[8]).toBeCloseTo(0.8);
    expect(params1[9]).toBe(15);
    expect(params1[10]).toBe(0);
    expect(params1[11]).toBe(0);
    expect(mesh.geometry.attributes.tileParams0.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams1.needsUpdate).toBe(true);
    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
    expect(mesh.matrixWriteCount).toBe(3);
    expectActivePrefixUpdateRanges(mesh, 3);
  });

  it('keeps terrain instance buffers coherent when only morph params change', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0.1, edgeMorphMask: 5 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.2, edgeMorphMask: 10 },
    ];
    renderer.updateInstances(tiles);

    const mesh: any = renderer.getMesh();
    expect(mesh.matrixWriteCount).toBe(2);

    mesh.instanceMatrix.needsUpdate = false;
    mesh.geometry.attributes.tileParams0.needsUpdate = false;
    mesh.geometry.attributes.tileParams1.needsUpdate = false;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.geometry.attributes.tileParams0.clearUpdateRanges();
    mesh.geometry.attributes.tileParams1.clearUpdateRanges();

    renderer.updateInstances([
      { ...tiles[0], morphFactor: 0.6, edgeMorphMask: 7 },
      { ...tiles[1], morphFactor: 0.9, edgeMorphMask: 12 },
    ]);

    const params0 = mesh.geometry.attributes.tileParams0.array as Float32Array;
    const params1 = mesh.geometry.attributes.tileParams1.array as Float32Array;
    expect(mesh.matrixWriteCount).toBe(4);
    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams0.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams1.needsUpdate).toBe(true);
    expectActivePrefixUpdateRanges(mesh, 2);
    expect(Array.from(params0.slice(0, 8))).toEqual([
      0, 0, 64, 0,
      64, 0, 64, 1,
    ]);
    expect(params1[0]).toBeCloseTo(0.6);
    expect(params1[1]).toBe(7);
    expect(params1[4]).toBeCloseTo(0.9);
    expect(params1[5]).toBe(12);
  });

  it('resubmits current terrain buffers without rewriting instance data', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0.1, edgeMorphMask: 5 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.2, edgeMorphMask: 10 },
    ];
    renderer.updateInstances(tiles);

    const mesh: any = renderer.getMesh();
    expect(mesh.matrixWriteCount).toBe(2);
    mesh.instanceMatrix.needsUpdate = false;
    mesh.geometry.attributes.tileParams0.needsUpdate = false;
    mesh.geometry.attributes.tileParams1.needsUpdate = false;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.geometry.attributes.tileParams0.clearUpdateRanges();
    mesh.geometry.attributes.tileParams1.clearUpdateRanges();

    renderer.resubmitCurrentInstances();

    expect(mesh.count).toBe(2);
    expect(mesh.visible).toBe(true);
    expect(mesh.matrixWriteCount).toBe(2);
    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams0.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams1.needsUpdate).toBe(true);
    expectActivePrefixUpdateRanges(mesh, 2);
  });

  it('rewrites the active terrain prefix when any tile identity changes', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0.1, edgeMorphMask: 5 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.2, edgeMorphMask: 10 },
      { x: 128, z: 0, size: 64, lodLevel: 1, morphFactor: 0.3, edgeMorphMask: 12 },
    ];
    renderer.updateInstances(tiles);

    const mesh: any = renderer.getMesh();
    expect(mesh.matrixWriteCount).toBe(3);
    mesh.instanceMatrix.needsUpdate = false;
    mesh.geometry.attributes.tileParams0.needsUpdate = false;
    mesh.geometry.attributes.tileParams1.needsUpdate = false;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.geometry.attributes.tileParams0.clearUpdateRanges();
    mesh.geometry.attributes.tileParams1.clearUpdateRanges();

    renderer.updateInstances([
      tiles[0],
      { ...tiles[1], x: 96 },
      tiles[2],
    ]);

    const params0 = mesh.geometry.attributes.tileParams0.array as Float32Array;
    const params1 = mesh.geometry.attributes.tileParams1.array as Float32Array;
    expect(mesh.matrixWriteCount).toBe(6);
    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams0.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams1.needsUpdate).toBe(true);
    expectActivePrefixUpdateRanges(mesh, 3);
    expect(Array.from(params0.slice(0, 12))).toEqual([
      0, 0, 64, 0,
      96, 0, 64, 1,
      128, 0, 64, 1,
    ]);
    expect(params1[0]).toBeCloseTo(0.1);
    expect(params1[1]).toBe(5);
    expect(params1[4]).toBeCloseTo(0.2);
    expect(params1[5]).toBe(10);
    expect(params1[8]).toBeCloseTo(0.3);
    expect(params1[9]).toBe(12);
  });

  it('keeps the active terrain prefix coherent when visible instance count shrinks', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0.1, edgeMorphMask: 5 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.2, edgeMorphMask: 10 },
      { x: 128, z: 0, size: 64, lodLevel: 1, morphFactor: 0.3, edgeMorphMask: 12 },
    ];
    renderer.updateInstances(tiles);

    const mesh: any = renderer.getMesh();
    mesh.instanceMatrix.needsUpdate = false;
    mesh.geometry.attributes.tileParams0.needsUpdate = false;
    mesh.geometry.attributes.tileParams1.needsUpdate = false;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.geometry.attributes.tileParams0.clearUpdateRanges();
    mesh.geometry.attributes.tileParams1.clearUpdateRanges();

    renderer.updateInstances(tiles.slice(0, 2));

    expect(mesh.count).toBe(2);
    expect(mesh.visible).toBe(true);
    expect(mesh.matrixWriteCount).toBe(5);
    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams0.needsUpdate).toBe(true);
    expect(mesh.geometry.attributes.tileParams1.needsUpdate).toBe(true);
    expectActivePrefixUpdateRanges(mesh, 2);
  });

  it('keeps terrain shadow casting enabled by default', () => {
    expect(renderer.getMesh().castShadow).toBe(true);
    expect(renderer.getMesh().receiveShadow).toBe(true);
  });

  it('disables only terrain shadow casting under the perf isolation flag', () => {
    mockIsPerfHarnessEnabled.mockReturnValue(true);
    setRuntimeSearch('?perf=1&perfDisableTerrainShadows=1');

    const isolatedRenderer = new CDLODRenderer({} as any, 33, 256);

    expect(isolatedRenderer.getMesh().castShadow).toBe(false);
    expect(isolatedRenderer.getMesh().receiveShadow).toBe(true);
  });

  it('can disable skirt geometry only under the perf-harness terrain-skirt diagnostic flag', () => {
    mockIsPerfHarnessEnabled.mockReturnValue(true);
    setRuntimeSearch('?perf=1&perfDisableTerrainSkirts=1');

    const isolatedRenderer = new CDLODRenderer({} as any, 33, 256);
    const mesh: any = isolatedRenderer.getMesh();

    expect(mesh.geometry.attributes.position.array.length / 3).toBe(33 * 33);
    expect(mesh.geometry.index.array.length).toBe((32 * 32 * 2) * 3);
    expect(isolatedRenderer.getShadowPassStatsForDebug()).toMatchObject({
      tileInteriorTriangles: 2048,
      tileSkirtTriangles: 0,
      tileSkirtTrianglesPerEdge: 0,
      tileTotalTriangles: 2048,
    });
  });

  it('bounds terrain shadow caster instances by default without changing main-pass count', () => {
    renderer.updateInstances([
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0, edgeMorphMask: 0 },
      { x: 1400, z: 0, size: 128, lodLevel: 3, morphFactor: 0.5, edgeMorphMask: 0 },
    ]);

    const mesh: any = renderer.getMesh();
    expect(mesh.count).toBe(2);

    mesh.onBeforeShadow();

    expect(mesh.count).toBe(1);
    expect(renderer.getShadowPassStatsForDebug()).toMatchObject({
      boundedShadowPassEnabled: true,
      shadowPrefixInstances: 1,
      lastMainPassInstances: 2,
      lastShadowPassInstances: 1,
      shadowPassReductions: 1,
    });

    mesh.onAfterShadow();

    expect(mesh.count).toBe(2);
  });

  it('keeps full terrain shadow casting under the diagnostic full-shadow query flag', () => {
    setRuntimeSearch('?terrainFullShadowPass=1');
    const fullShadowRenderer = new CDLODRenderer({} as any, 33, 256);
    fullShadowRenderer.configureBoundedShadowPass(0, 0, 96);

    fullShadowRenderer.updateInstances([
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0, edgeMorphMask: 0 },
      { x: 1400, z: 0, size: 128, lodLevel: 3, morphFactor: 0.5, edgeMorphMask: 0 },
    ]);

    const mesh: any = fullShadowRenderer.getMesh();
    mesh.onBeforeShadow();

    expect(mesh.count).toBe(2);
    expect(fullShadowRenderer.getShadowPassStatsForDebug()).toMatchObject({
      boundedShadowPassEnabled: false,
      shadowPrefixInstances: 2,
      lastMainPassInstances: 2,
      lastShadowPassInstances: 2,
      shadowPassReductions: 0,
    });
  });

  it('bounds only the shadow-pass instance count when configured with a narrow radius', () => {
    mockIsPerfHarnessEnabled.mockReturnValue(true);
    setRuntimeSearch('?perf=1&perfBoundedTerrainShadowPass=1');
    const boundedRenderer = new CDLODRenderer({} as any, 33, 256);
    boundedRenderer.configureBoundedShadowPass(0, 0, 96);

    boundedRenderer.updateInstances([
      { x: 512, z: 0, size: 128, lodLevel: 3, morphFactor: 0.5, edgeMorphMask: 0 },
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0, edgeMorphMask: 3 },
      { x: -640, z: 0, size: 256, lodLevel: 4, morphFactor: 0.75, edgeMorphMask: 0 },
    ]);

    const mesh: any = boundedRenderer.getMesh();
    const params0 = mesh.geometry.attributes.tileParams0.array as Float32Array;
    expect(mesh.count).toBe(3);
    expect(Array.from(params0.slice(0, 8))).toEqual([
      0, 0, 64, 0,
      512, 0, 128, 3,
    ]);

    mesh.onBeforeShadow();

    expect(mesh.count).toBe(1);
    expect(boundedRenderer.getShadowPassStatsForDebug()).toMatchObject({
      boundedShadowPassEnabled: true,
      shadowPrefixInstances: 1,
      lastMainPassInstances: 3,
      lastShadowPassInstances: 1,
      shadowPassReductions: 1,
    });

    mesh.onAfterShadow();

    expect(mesh.count).toBe(3);
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

  it('emits indexed triangles for both interior and two-sided skirt strips', () => {
    const N = 33;
    const geo: any = createTileGeometry(N);
    expect(geo.index).not.toBeNull();
    expect(geo.index.array.length).toBe(((N - 1) * (N - 1) * 2 + (N - 1) * 4 * 4) * 3);
  });

  it('reports the same per-tile triangle split used by the geometry', () => {
    expect(computeTileGeometryStats(33)).toMatchObject({
      tileResolution: 33,
      tileInteriorVertices: 1089,
      tileSkirtVertices: 128,
      tileInteriorTriangles: 2048,
      tileSkirtTrianglesPerEdge: 128,
      tileSkirtTriangles: 512,
      tileTotalTriangles: 2560,
    });
    expect(computeTileGeometryStats(33, false)).toMatchObject({
      tileInteriorVertices: 1089,
      tileSkirtVertices: 0,
      tileInteriorTriangles: 2048,
      tileSkirtTrianglesPerEdge: 0,
      tileSkirtTriangles: 0,
      tileTotalTriangles: 2048,
    });
  });

  it('duplicates skirt wall winding so seam covers survive FrontSide culling from either side', () => {
    const N = 5;
    const geo: any = createTileGeometry(N);
    const idx = Array.from(geo.index.array as Uint16Array | Uint32Array);
    const interiorIndexCount = (N - 1) * (N - 1) * 2 * 3;
    const firstTopSkirt = idx.slice(interiorIndexCount, interiorIndexCount + 12);
    const skirt0 = N * N;
    const skirt1 = skirt0 + 1;

    expect(firstTopSkirt).toEqual([
      0, skirt0, 1,
      1, skirt0, skirt1,
      0, 1, skirt0,
      1, skirt1, skirt0,
    ]);
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
