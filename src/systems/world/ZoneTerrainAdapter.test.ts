import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ZoneTerrainAdapter } from './ZoneTerrainAdapter';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// Behavior tests for the post-placement zone validator.
// Model terrain as a height-field closure; assert observable outcomes (moved
// or stayed put). Avoid assertions on internal constants.

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Logger } from '../../utils/Logger';

function makeTerrain(heightAt: (x: number, z: number) => number): ITerrainRuntime {
  return {
    getHeightAt: (x: number, z: number) => heightAt(x, z),
  } as unknown as ITerrainRuntime;
}

describe('ZoneTerrainAdapter.validateAndNudge', () => {
  let adapter: ZoneTerrainAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ZoneTerrainAdapter();
  });

  it('leaves the zone in place on flat terrain', () => {
    adapter.setTerrainSystem(makeTerrain(() => 50));
    const original = new THREE.Vector3(100, 0, 200);
    const result = adapter.validateAndNudge(original);
    expect(result.x).toBeCloseTo(100, 5);
    expect(result.z).toBeCloseTo(200, 5);
    expect(result.y).toBeCloseTo(50, 5);
  });

  it('nudges the zone out of a deep ditch onto the surrounding ring', () => {
    // Center of a ditch at the origin: deep within ~12 m, then back to plateau.
    const terrain = makeTerrain((x, z) => {
      const r = Math.sqrt(x * x + z * z);
      // Deep ditch within 12 m, gently sloped sides; flat plateau beyond ~20 m.
      if (r < 12) return 30; // 20 m below ring mean
      return 50;
    });
    adapter.setTerrainSystem(terrain);
    const original = new THREE.Vector3(0, 0, 0);
    const result = adapter.validateAndNudge(original, { zoneLabel: 'zone_tiger' });

    // Should have moved off origin to a flatter, higher candidate.
    const horizontalDelta = Math.hypot(result.x - original.x, result.z - original.z);
    expect(horizontalDelta).toBeGreaterThan(0);
    // Nudge should not exceed the configured max search radius (45 m).
    expect(horizontalDelta).toBeLessThanOrEqual(45);
    // Resting height should be the plateau (50), not the ditch floor (30).
    expect(result.y).toBeGreaterThan(40);
  });

  it('nudges off a steep slope to flatter terrain even when not in a ditch', () => {
    // Sharp ramp at the origin; flat plateau at distance >20 m.
    const terrain = makeTerrain((x, _z) => {
      const r = Math.abs(x);
      if (r < 15) return 50 + x * 2; // Slope of 2 m/m at the origin (way past 0.25 threshold).
      return 50; // Flat outside.
    });
    adapter.setTerrainSystem(terrain);
    const original = new THREE.Vector3(0, 0, 0);
    const result = adapter.validateAndNudge(original);

    const horizontalDelta = Math.hypot(result.x - original.x, result.z - original.z);
    expect(horizontalDelta).toBeGreaterThan(0);
    expect(horizontalDelta).toBeLessThanOrEqual(45);
  });

  it('leaves the zone in place when no flatter candidate exists within the search ring', () => {
    // Steep slope everywhere — no flat candidate to nudge to.
    const terrain = makeTerrain((x, _z) => 50 + x * 5);
    adapter.setTerrainSystem(terrain);
    const original = new THREE.Vector3(0, 0, 0);
    const result = adapter.validateAndNudge(original, { zoneLabel: 'cliff_zone' });

    expect(result.x).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(0, 5);
    // And we should have warned about the failure.
    expect(Logger.warn).toHaveBeenCalled();
  });

  it('keeps any nudge within 45 m of the original position', () => {
    // Spiky ditch surrounded by rolling, mostly-flat hills.
    const terrain = makeTerrain((x, z) => {
      const r = Math.sqrt(x * x + z * z);
      if (r < 8) return 0; // Spike-deep ditch.
      // Gentle elevation outside the ditch; flat enough to pass the slope filter
      // but with subtle variation so multiple candidates exist.
      return 50 + 0.05 * Math.sin(x * 0.1) + 0.05 * Math.cos(z * 0.1);
    });
    adapter.setTerrainSystem(terrain);
    const original = new THREE.Vector3(500, 0, -250);
    const result = adapter.validateAndNudge(original);

    const horizontalDelta = Math.hypot(result.x - original.x, result.z - original.z);
    expect(horizontalDelta).toBeLessThanOrEqual(45);
  });

  it('snaps to terrain height even when no nudge is needed', () => {
    // Flat at y=42 — validator should still return y matching the height field.
    adapter.setTerrainSystem(makeTerrain(() => 42));
    const result = adapter.validateAndNudge(new THREE.Vector3(10, 999, -10));
    expect(result.y).toBeCloseTo(42, 5);
  });

  it('throws if no terrain system is connected', () => {
    expect(() => adapter.validateAndNudge(new THREE.Vector3(0, 0, 0))).toThrow();
  });
});
