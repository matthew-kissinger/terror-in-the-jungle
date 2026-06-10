// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import { StampSpatialIndex, getStampSpatialIndex } from './StampSpatialIndex';
import { applyResolvedStamp } from './StampedHeightProvider';
import type { ResolvedTerrainStampConfig } from './TerrainFeatureTypes';

/**
 * Behavior: applying only the index's nearby stamps yields BIT-IDENTICAL
 * heights to the brute-force all-stamps loop, for any query point. A stamp
 * outside its gradeRadius is an identity transform, so the index may only
 * skip identities — this property is what makes the ~50µs → sub-µs sample
 * speedup a pure optimization.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomStamps(count: number, span: number, rand: () => number): ResolvedTerrainStampConfig[] {
  const stamps: ResolvedTerrainStampConfig[] = [];
  for (let i = 0; i < count; i++) {
    const inner = 4 + rand() * 40;
    const outer = inner + 2 + rand() * 60;
    const grade = outer + rand() * 120;
    const common = {
      innerRadius: inner,
      outerRadius: outer,
      gradeRadius: grade,
      gradeStrength: rand(),
      samplingRadius: 10,
      targetHeightMode: 'average' as const,
      targetHeight: rand() * 800,
      heightOffset: (rand() - 0.5) * 10,
      priority: Math.floor(rand() * 10),
    };
    if (rand() < 0.5) {
      stamps.push({
        kind: 'flatten_circle',
        centerX: (rand() - 0.5) * span,
        centerZ: (rand() - 0.5) * span,
        ...common,
      });
    } else {
      const startX = (rand() - 0.5) * span;
      const startZ = (rand() - 0.5) * span;
      stamps.push({
        kind: 'flatten_capsule',
        startX,
        startZ,
        endX: startX + (rand() - 0.5) * 600,
        endZ: startZ + (rand() - 0.5) * 600,
        ...common,
      });
    }
  }
  return stamps;
}

function bruteForce(base: number, x: number, z: number, stamps: ResolvedTerrainStampConfig[]): number {
  let height = base;
  for (const stamp of stamps) {
    height = applyResolvedStamp(height, x, z, stamp);
  }
  return height;
}

function viaIndex(base: number, x: number, z: number, index: StampSpatialIndex): number {
  let height = base;
  for (const stamp of index.stampsNear(x, z)) {
    height = applyResolvedStamp(height, x, z, stamp);
  }
  return height;
}

describe('StampSpatialIndex', () => {
  it('matches brute-force application bit-for-bit across random stamps and points', () => {
    const rand = mulberry32(0xA5A0);
    const span = 21136; // A Shau playable extent
    const stamps = randomStamps(400, span, rand);
    const index = new StampSpatialIndex(stamps);

    for (let i = 0; i < 4000; i++) {
      // Mix of uniform points and points biased near stamp centers/edges
      let x: number;
      let z: number;
      if (i % 3 === 0) {
        const s = stamps[Math.floor(rand() * stamps.length)];
        const cx = s.kind === 'flatten_circle' ? s.centerX : s.startX;
        const cz = s.kind === 'flatten_circle' ? s.centerZ : s.startZ;
        // Cluster around the influence boundary where exactness matters most
        x = cx + (rand() - 0.5) * s.gradeRadius * 2.2;
        z = cz + (rand() - 0.5) * s.gradeRadius * 2.2;
      } else {
        x = (rand() - 0.5) * span * 1.3; // include points outside all stamps
        z = (rand() - 0.5) * span * 1.3;
      }
      const base = rand() * 1000;
      expect(viaIndex(base, x, z, index)).toBe(bruteForce(base, x, z, stamps));
    }
  });

  it('preserves priority order within a bucket (stacked stamps compose identically)', () => {
    // Two overlapping circles with different targets — application order
    // changes the result, so this catches any bucket reordering.
    const rand = mulberry32(0xBEEF);
    const mk = (cx: number, target: number, priority: number): ResolvedTerrainStampConfig => ({
      kind: 'flatten_circle',
      centerX: cx,
      centerZ: 0,
      innerRadius: 50,
      outerRadius: 80,
      gradeRadius: 120,
      gradeStrength: 0.5,
      samplingRadius: 10,
      targetHeightMode: 'average',
      targetHeight: target,
      heightOffset: 0,
      priority,
    });
    const stamps = [mk(0, 100, 1), mk(30, 500, 2), mk(-20, 250, 3)];
    const index = new StampSpatialIndex(stamps);
    for (let i = 0; i < 200; i++) {
      const x = (rand() - 0.5) * 400;
      const z = (rand() - 0.5) * 400;
      expect(viaIndex(7, x, z, index)).toBe(bruteForce(7, x, z, stamps));
    }
  });

  it('returns the shared empty list for points beyond every stamp', () => {
    const stamps = randomStamps(50, 2000, mulberry32(1));
    const index = new StampSpatialIndex(stamps);
    expect(index.stampsNear(1e7, 1e7)).toHaveLength(0);
    expect(index.stampsNear(-1e7, 0)).toHaveLength(0);
  });

  it('handles an empty stamp list', () => {
    const index = new StampSpatialIndex([]);
    expect(index.stampsNear(0, 0)).toHaveLength(0);
  });

  it('caches one index per stamps-array identity', () => {
    const stamps = randomStamps(10, 1000, mulberry32(2));
    expect(getStampSpatialIndex(stamps)).toBe(getStampSpatialIndex(stamps));
    expect(getStampSpatialIndex(stamps.slice())).not.toBe(getStampSpatialIndex(stamps));
  });
});
