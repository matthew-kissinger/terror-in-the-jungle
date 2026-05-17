import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WadeSplashEffect, type WadeSplashImmersionSampler } from './WadeSplashEffect';

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
    addScaledVector(v: Vector3, s: number) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
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

  class PointsMaterial {
    opacity: number;
    disposed = false;
    constructor(params: Record<string, unknown> = {}) {
      Object.assign(this, params);
      this.opacity = (params.opacity as number) ?? 1;
    }
    dispose() {
      this.disposed = true;
    }
  }

  class Points {
    geometry: BufferGeometry;
    material: PointsMaterial;
    visible = true;
    matrixAutoUpdate = true;
    constructor(geometry: BufferGeometry, material: PointsMaterial) {
      this.geometry = geometry;
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
    Points,
    Scene,
    NormalBlending: 2,
    AdditiveBlending: 1,
  };
});

describe('WadeSplashEffect', () => {
  let scene: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let effect: WadeSplashEffect;
  let mockNow: number;
  let performanceSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNow = 1_000_000;
    performanceSpy = vi.spyOn(performance, 'now').mockImplementation(() => mockNow);

    const THREE = require('three');
    scene = new THREE.Scene();
    effect = new WadeSplashEffect(scene as any, 4);
  });

  afterEach(() => {
    performanceSpy?.mockRestore();
    performanceSpy = null;
  });

  const samplerReturning = (value: number): WadeSplashImmersionSampler => ({
    sampleImmersion01At: vi.fn(() => value),
  });

  /**
   * Walks the emitter from origin straight along +X by `metres`, broken into
   * fixed `stepMetres` ticks so the stride accumulator sees realistic
   * movement instead of one giant jump.
   */
  function walkPlayer(metres: number, stepMetres = 0.4): void {
    const THREE = require('three');
    let x = 0;
    // Prime the emitter first so stride accumulation starts at 0.
    effect.tryEmitForPlayer(new THREE.Vector3(x, 0, 0), true);
    while (x < metres) {
      x += stepMetres;
      effect.tryEmitForPlayer(new THREE.Vector3(x, 0, 0), true);
    }
  }

  function countActive(): number {
    return (effect as any).active.length;
  }

  it('spawns a splash burst when immersion lies in the wade band', () => {
    const THREE = require('three');
    effect.setSampler(samplerReturning(0.3));

    walkPlayer(2.5);

    expect(countActive()).toBeGreaterThan(0);
    const active = (effect as any).active as Array<{ particles: any; sparks: any }>;
    expect(active[0].particles.visible).toBe(true);
    expect(active[0].sparks.visible).toBe(true);

    // Sanity: at least one particle position was rewritten to the foot
    // location instead of the geometry's default zero.
    const positions = active[0].particles.geometry.attributes.position;
    expect(positions.needsUpdate).toBe(true);
    void THREE;
  });

  it('does not splash when the foot is too dry (immersion below band)', () => {
    effect.setSampler(samplerReturning(0.05));
    walkPlayer(4.0);
    expect(countActive()).toBe(0);
  });

  it('does not splash when the foot is too submerged (immersion above band)', () => {
    // 0.5 is the inclusive upper bound; 0.51 is "swim, not wade".
    effect.setSampler(samplerReturning(0.51));
    walkPlayer(4.0);
    expect(countActive()).toBe(0);
  });

  it('reuses the pool: many splashes do not exceed pool capacity', () => {
    // With 4 pooled bursts, even 50 stride-eligible splash candidates should
    // not allocate beyond the cap. Acquired bursts roll over the oldest.
    const THREE = require('three');
    effect.setSampler(samplerReturning(0.3));

    const poolBefore = (effect as any).pool.length + (effect as any).active.length;

    for (let i = 0; i < 50; i++) {
      // Each emit() call is a forced spawn that bypasses stride accumulation.
      effect.emit(new THREE.Vector3(i, 0, 0));
    }

    const poolAfter = (effect as any).pool.length + (effect as any).active.length;
    expect(poolAfter).toBe(poolBefore);
    // Active never exceeds pool capacity (4).
    expect(countActive()).toBeLessThanOrEqual(4);
  });

  it('emits independently for the player and for NPCs (per-id stride tracking)', () => {
    const THREE = require('three');
    effect.setSampler(samplerReturning(0.3));

    // Walk the player far enough to splash.
    walkPlayer(2.5);
    const afterPlayer = countActive();
    expect(afterPlayer).toBeGreaterThan(0);

    // Now walk an NPC the same distance; should produce its own splash and
    // not be blocked by the player's stride accumulator.
    let x = 100; // far away so stride records are independent
    effect.tryEmitForCombatant('npc-1', new THREE.Vector3(x, 0, 0), true);
    while (x < 102.5) {
      x += 0.4;
      effect.tryEmitForCombatant('npc-1', new THREE.Vector3(x, 0, 0), true);
    }
    expect(countActive()).toBeGreaterThan(afterPlayer);
  });

  it('clears stride accumulation when the foot stops moving', () => {
    const THREE = require('three');
    effect.setSampler(samplerReturning(0.3));

    // Walk almost a stride-distance, then stop. The stop should reset the
    // accumulator so a brand-new walk has to cover the full stride before
    // a splash fires.
    effect.tryEmitForPlayer(new THREE.Vector3(0, 0, 0), true);
    effect.tryEmitForPlayer(new THREE.Vector3(1.0, 0, 0), true);
    expect(countActive()).toBe(0);

    // Stop for several ticks at the same position.
    for (let i = 0; i < 3; i++) {
      effect.tryEmitForPlayer(new THREE.Vector3(1.0, 0, 0), false);
    }

    // A single small step after stopping must not fire — stride was reset.
    effect.tryEmitForPlayer(new THREE.Vector3(1.2, 0, 0), true);
    expect(countActive()).toBe(0);
  });

  it('is inert until a sampler is bound (defensive against early ticks)', () => {
    const THREE = require('three');
    // No setSampler call.
    walkPlayer(4.0);
    expect(countActive()).toBe(0);

    // Once a sampler is bound, subsequent strides emit normally.
    effect.setSampler(samplerReturning(0.3));
    walkPlayer(4.0);
    expect(countActive()).toBeGreaterThan(0);
    void THREE;
  });

  it('fades bursts and recycles them back to the pool over their lifetime', () => {
    const THREE = require('three');
    effect.emit(new THREE.Vector3(0, 0, 0));
    expect(countActive()).toBe(1);

    // Advance past lifetime and tick update; the burst should retire.
    mockNow += 500;
    effect.update(0.5);
    expect(countActive()).toBe(0);

    const active = (effect as any).active as unknown[];
    expect(active).toHaveLength(0);
  });
});
