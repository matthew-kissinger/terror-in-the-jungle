import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImpactEffectsPool } from './ImpactEffectsPool';

const pointsMaterialInstances: any[] = [];
const spriteMaterialInstances: any[] = [];
const canvasTextureInstances: any[] = [];
const pointsMaterialCalls: Array<Record<string, unknown>> = [];
const spriteMaterialCalls: Array<Record<string, unknown>> = [];

// Minimal canvas mock for decal texture creation
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => ({
    fillStyle: '',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn()
  }))
};

globalThis.document = {
  createElement: vi.fn((tagName: string) => {
    if (tagName === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
    return {} as HTMLElement;
  })
} as Document;

vi.mock('three', () => {
  class Vector3 {
    x: number;
    y: number;
    z: number;

    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }

    copy(v: Vector3) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }

    add(v: Vector3) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }

    addScaledVector(v: Vector3, s: number) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    }

    multiplyScalar(s: number) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }

    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
  }

  class BufferAttribute {
    array: Float32Array;
    itemSize: number;
    count: number;
    needsUpdate = false;

    constructor(array: Float32Array, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
    }

    setXYZ(index: number, x: number, y: number, z: number) {
      const i = index * 3;
      this.array[i] = x;
      this.array[i + 1] = y;
      this.array[i + 2] = z;
    }

    getX(index: number) {
      return this.array[index * 3];
    }

    getY(index: number) {
      return this.array[index * 3 + 1];
    }

    getZ(index: number) {
      return this.array[index * 3 + 2];
    }
  }

  class BufferGeometry {
    attributes: Record<string, BufferAttribute> = {};
    disposed = false;

    setAttribute(name: string, attribute: BufferAttribute) {
      this.attributes[name] = attribute;
      return this;
    }

    dispose() {
      this.disposed = true;
    }
  }

  class MockPointsMaterial {
    opacity: number;
    disposed = false;
    params: Record<string, unknown>;
    constructor(params: Record<string, unknown> = {}) {
      this.params = params;
      Object.assign(this, params);
      this.opacity = (params.opacity as number) ?? 1;
      pointsMaterialInstances.push(this);
    }

    dispose() {
      this.disposed = true;
    }
  }

  class PointsMaterial extends MockPointsMaterial {
    constructor(params: Record<string, unknown> = {}) {
      super(params);
      pointsMaterialCalls.push(params);
    }
  }

  class MockSpriteMaterial {
    opacity: number;
    disposed = false;
    params: Record<string, unknown>;
    map?: unknown;
    constructor(params: Record<string, unknown> = {}) {
      this.params = params;
      Object.assign(this, params);
      this.opacity = (params.opacity as number) ?? 1;
      this.map = params.map;
      spriteMaterialInstances.push(this);
    }

    clone() {
      return new MockSpriteMaterial(this.params);
    }

    dispose() {
      this.disposed = true;
    }
  }

  class SpriteMaterial extends MockSpriteMaterial {
    constructor(params: Record<string, unknown> = {}) {
      super(params);
      spriteMaterialCalls.push(params);
    }
  }

  class CanvasTexture {
    needsUpdate = false;
    disposed = false;
    image: unknown;
    constructor(image: unknown) {
      this.image = image;
      canvasTextureInstances.push(this);
    }

    dispose() {
      this.disposed = true;
    }
  }

  class Texture {
    disposed = false;
    dispose() {
      this.disposed = true;
    }
  }

  class Points {
    geometry: BufferGeometry;
    material: MockPointsMaterial;
    position = new Vector3();
    visible = true;

    constructor(geometry: BufferGeometry, material: MockPointsMaterial) {
      this.geometry = geometry;
      this.material = material;
    }
  }

  class Sprite {
    material: MockSpriteMaterial;
    position = new Vector3();
    scale = new Vector3(1, 1, 1);
    visible = true;

    constructor(material: MockSpriteMaterial) {
      this.material = material;
    }
  }

  class Scene {
    add = vi.fn();
    remove = vi.fn();
  }

  return {
    Vector3,
    BufferAttribute,
    BufferGeometry,
    PointsMaterial,
    SpriteMaterial,
    CanvasTexture,
    Texture,
    Points,
    Sprite,
    Scene,
    AdditiveBlending: 1,
    NormalBlending: 2
  };
});

describe('ImpactEffectsPool', () => {
  let pool: ImpactEffectsPool;
  let scene: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let mockNow = 1_000_000;
  let performanceSpy: ReturnType<typeof vi.spyOn> | null = null;
  let randomSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    pointsMaterialInstances.length = 0;
    spriteMaterialInstances.length = 0;
    canvasTextureInstances.length = 0;
    pointsMaterialCalls.length = 0;
    spriteMaterialCalls.length = 0;
    mockNow = 1_000_000;

    performanceSpy = vi.spyOn(performance, 'now').mockImplementation(() => mockNow);
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const THREE = require('three');
    scene = new THREE.Scene();
    scene.add = vi.fn();
    scene.remove = vi.fn();
    pool = new ImpactEffectsPool(scene, 2);
  });

  afterEach(() => {
    randomSpy?.mockRestore();
    performanceSpy?.mockRestore();
    randomSpy = null;
    performanceSpy = null;
  });

  it('pre-allocates effects and creates materials/textures', () => {
    expect(scene.add).toHaveBeenCalledTimes(2 * 3);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const THREE = require('three');
    expect(pointsMaterialCalls).toHaveLength(2);
    expect(pointsMaterialCalls[0]).toMatchObject({
      color: 0xcc0000,
      size: 0.08,
      transparent: true,
      opacity: 0.9,
      blending: 1
    });
    expect(pointsMaterialCalls[1]).toMatchObject({
      color: 0xff0000,
      size: 0.05,
      transparent: true,
      opacity: 1,
      blending: 1
    });

    expect(spriteMaterialCalls).toHaveLength(1);
    expect(canvasTextureInstances).toHaveLength(1);
    expect(spriteMaterialCalls[0]).toMatchObject({
      map: canvasTextureInstances[0],
      color: 0x333333,
      blending: 2,
      opacity: 0.5,
      transparent: true
    });
  });

  it('spawns an effect and initializes positions/velocities', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const THREE = require('three');
    const position = new THREE.Vector3(10, 20, 30);
    const normal = new THREE.Vector3(0, 1, 0);

    pool.spawn(position, normal);

    const active = (pool as any).active as Array<any>;
    expect(active).toHaveLength(1);
    const effect = active[0];

    expect(effect.particles.visible).toBe(true);
    expect(effect.sparks.visible).toBe(true);
    expect(effect.decal.visible).toBe(true);

    expect(effect.decal.position.x).toBeCloseTo(10);
    expect(effect.decal.position.y).toBeCloseTo(20.01);
    expect(effect.decal.position.z).toBeCloseTo(30);

    const particlePositions = effect.particles.geometry.attributes.position;
    expect(particlePositions.getX(0)).toBeCloseTo(10);
    expect(particlePositions.getY(0)).toBeCloseTo(20);
    expect(particlePositions.getZ(0)).toBeCloseTo(30);
    expect(particlePositions.needsUpdate).toBe(true);

    const sparkPositions = effect.sparks.geometry.attributes.position;
    expect(sparkPositions.getX(0)).toBeCloseTo(10);
    expect(sparkPositions.getY(0)).toBeCloseTo(20);
    expect(sparkPositions.getZ(0)).toBeCloseTo(30);
    expect(sparkPositions.needsUpdate).toBe(true);

    const velocity0 = effect.velocity[0];
    expect(velocity0.x).toBeCloseTo(-3.5355339, 5);
    expect(velocity0.y).toBeCloseTo(8.0355339, 5);
    expect(velocity0.z).toBeCloseTo(0, 5);

    const sparkVelocity0 = effect.velocity[particlePositions.count];
    expect(sparkVelocity0.x).toBeCloseTo(0, 5);
    expect(sparkVelocity0.y).toBeCloseTo(9, 5);
    expect(sparkVelocity0.z).toBeCloseTo(0, 5);
  });

  it('updates physics, damping, and fades at the correct times', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const THREE = require('three');
    pool.spawn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));

    const effect = (pool as any).active[0];
    const particlePositions = effect.particles.geometry.attributes.position;
    const sparkPositions = effect.sparks.geometry.attributes.position;

    const initialParticleVelocity = effect.velocity[0].clone();
    const initialSparkVelocity = effect.velocity[particlePositions.count].clone();

    mockNow += 150; // 150ms elapsed
    pool.update(0.15);

    expect(effect.velocity[0].y).toBeCloseTo(initialParticleVelocity.y - 1.47, 5);

    expect(effect.velocity[particlePositions.count].x).toBeCloseTo(initialSparkVelocity.x * 0.95, 5);
    expect(effect.velocity[particlePositions.count].y).toBeCloseTo(initialSparkVelocity.y * 0.95, 5);
    expect(effect.velocity[particlePositions.count].z).toBeCloseTo(initialSparkVelocity.z * 0.95, 5);

    expect(particlePositions.getY(0)).not.toBeCloseTo(0);
    expect(sparkPositions.getY(0)).not.toBeCloseTo(0);

    expect(effect.decal.material.opacity).toBeCloseTo(0.35, 5);

    mockNow += 200; // total 350ms
    pool.update(0.2);
    expect(effect.particles.material.opacity).toBeCloseTo(0.6, 5);
    expect(effect.sparks.material.opacity).toBeCloseTo(0.75, 5);
  });

  it('removes expired effects using swap-and-pop compaction', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const THREE = require('three');
    pool.spawn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    pool.spawn(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));

    const active = (pool as any).active as Array<any>;
    const [first, second] = active;

    first.startTime = 0;
    first.aliveUntil = 50;
    second.startTime = 0;
    second.aliveUntil = 1000;

    mockNow = 100;
    pool.update(0.1);

    const updatedActive = (pool as any).active as Array<any>;
    expect(updatedActive).toHaveLength(1);
    expect(updatedActive[0]).toBe(second);

    const poolList = (pool as any).pool as Array<any>;
    expect(poolList).toContain(first);
    expect(first.particles.visible).toBe(false);
    expect(first.sparks.visible).toBe(false);
    expect(first.decal.visible).toBe(false);
  });

  it('recycles the oldest active effect when the pool is exhausted', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const THREE = require('three');
    const oneShotPool = new ImpactEffectsPool(scene, 1);

    const pos1 = new THREE.Vector3(0, 0, 0);
    const pos2 = new THREE.Vector3(5, 0, 0);
    const normal = new THREE.Vector3(0, 1, 0);

    oneShotPool.spawn(pos1, normal);
    const firstEffect = (oneShotPool as any).active[0];

    mockNow += 10;
    oneShotPool.spawn(pos2, normal);

    const active = (oneShotPool as any).active as Array<any>;
    expect(active).toHaveLength(1);
    expect(active[0]).toBe(firstEffect);
    expect(active[0].decal.position.x).toBeCloseTo(5);
  });

  it('disposes pooled and active effects, materials, and textures', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const THREE = require('three');
    pool.spawn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));

    const active = (pool as any).active as Array<any>;
    const effect = active[0];

    pool.dispose();

    expect(scene.remove).toHaveBeenCalledTimes(2 * 3);

    expect(effect.particles.geometry.disposed).toBe(true);
    expect(effect.sparks.geometry.disposed).toBe(true);

    const disposedSpriteMaterials = spriteMaterialInstances.filter(m => m.disposed).length;
    expect(disposedSpriteMaterials).toBe(3);

    const disposedPointsMaterials = pointsMaterialInstances.filter(m => m.disposed).length;
    expect(disposedPointsMaterials).toBe(2);

    expect(canvasTextureInstances[0].disposed).toBe(true);
  });
});
