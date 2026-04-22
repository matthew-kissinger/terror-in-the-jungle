/**
 * Behavior tests for the terrain-sandbox heightmap generator.
 * Assertions focus on observable outcomes (data shape, range, determinism,
 * response to parameter changes) — not specific numeric tuning values.
 * (See docs/TESTING.md.)
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEIGHTMAP_PARAMS,
  clampParams,
  generateHeightmap,
} from './heightmapGenerator';

describe('generateHeightmap', () => {
  it('produces a grid with resolution * resolution samples', () => {
    const result = generateHeightmap({ resolution: 128 });
    expect(result.data.length).toBe(128 * 128);
    expect(result.resolution).toBe(128);
  });

  it('produces a non-flat heightmap for default params', () => {
    const result = generateHeightmap({});
    expect(result.max - result.min).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed + params', () => {
    const a = generateHeightmap({ seed: 777, resolution: 128 });
    const b = generateHeightmap({ seed: 777, resolution: 128 });
    expect(a.data).toEqual(b.data);
  });

  it('produces different output when the seed changes', () => {
    const a = generateHeightmap({ seed: 777, resolution: 128 });
    const b = generateHeightmap({ seed: 778, resolution: 128 });
    // Data arrays must differ somewhere; it is extraordinarily unlikely
    // for two independent Perlin seeds to collide across 16k samples.
    let differed = false;
    for (let i = 0; i < a.data.length; i++) {
      if (a.data[i] !== b.data[i]) { differed = true; break; }
    }
    expect(differed).toBe(true);
  });

  it('increases vertical range when amplitude increases', () => {
    const low = generateHeightmap({ seed: 42, amplitude: 20, resolution: 128 });
    const high = generateHeightmap({ seed: 42, amplitude: 200, resolution: 128 });
    expect(high.max - high.min).toBeGreaterThan(low.max - low.min);
  });

  it('records generation time as a finite non-negative number', () => {
    const result = generateHeightmap({ resolution: 128 });
    expect(Number.isFinite(result.generationTimeMs)).toBe(true);
    expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('clampParams', () => {
  it('fills missing fields from defaults', () => {
    const p = clampParams({});
    expect(p).toEqual(DEFAULT_HEIGHTMAP_PARAMS);
  });

  it('clamps out-of-range values back into allowed ranges', () => {
    const p = clampParams({
      seed: -5,
      octaves: 99,
      frequency: 1,
      amplitude: 10000,
      mapSizeMeters: 500,
      resolution: 333, // not in allowed set
    });
    expect(p.seed).toBeGreaterThanOrEqual(1);
    expect(p.octaves).toBeLessThanOrEqual(8);
    expect(p.frequency).toBeLessThanOrEqual(0.01);
    expect(p.amplitude).toBeLessThanOrEqual(300);
    expect(p.mapSizeMeters).toBeGreaterThanOrEqual(1000);
    // Resolution should fall back to the default 256 when invalid
    expect([128, 256, 512, 1024, 2048]).toContain(p.resolution);
  });
});
