import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Three.js
vi.mock('three', () => {
  class MockBufferGeometry {
    attributes: Record<string, any> = {};
    setAttribute(name: string, attr: any) { this.attributes[name] = attr; }
    rotateX() { return this; }
    dispose = vi.fn();
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

import { CDLODRenderer } from './CDLODRenderer';
import type { CDLODTile } from './CDLODQuadtree';

describe('CDLODRenderer', () => {
  let renderer: CDLODRenderer;

  beforeEach(() => {
    renderer = new CDLODRenderer({} as any, 33, 256);
  });

  it('creates mesh with zero initial instances', () => {
    const mesh = renderer.getMesh();
    expect(mesh.count).toBe(0);
  });

  it('updates instance count to match tile count', () => {
    const tiles: CDLODTile[] = [
      { x: 0, z: 0, size: 64, lodLevel: 0, morphFactor: 0 },
      { x: 64, z: 0, size: 64, lodLevel: 1, morphFactor: 0.5 },
      { x: 0, z: 64, size: 128, lodLevel: 2, morphFactor: 0.8 },
    ];

    renderer.updateInstances(tiles);

    expect(renderer.getMesh().count).toBe(3);
  });

  it('clamps to max instances', () => {
    const tiles: CDLODTile[] = [];
    for (let i = 0; i < 300; i++) {
      tiles.push({ x: i * 10, z: 0, size: 10, lodLevel: 0, morphFactor: 0 });
    }

    renderer.updateInstances(tiles);
    // Should not exceed maxInstances (256 in this test)
    expect(renderer.getMesh().count).toBeLessThanOrEqual(256);
  });

});
