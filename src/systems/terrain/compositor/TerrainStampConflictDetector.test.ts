// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type {
  FlattenCapsuleTerrainStamp,
  FlattenCircleTerrainStamp,
  TerrainStampConfig,
} from '../TerrainFeatureTypes';
import { detectStampConflicts } from './TerrainStampConflictDetector';

function capsule(overrides: Partial<FlattenCapsuleTerrainStamp> = {}): FlattenCapsuleTerrainStamp {
  return {
    kind: 'flatten_capsule',
    startX: 0,
    startZ: 0,
    endX: 0,
    endZ: 0,
    innerRadius: 5,
    outerRadius: 8,
    gradeRadius: 12,
    gradeStrength: 0.5,
    samplingRadius: 4,
    targetHeightMode: 'center',
    heightOffset: 0,
    priority: 40,
    ...overrides,
  };
}

function circle(overrides: Partial<FlattenCircleTerrainStamp> = {}): FlattenCircleTerrainStamp {
  return {
    kind: 'flatten_circle',
    centerX: 0,
    centerZ: 0,
    innerRadius: 10,
    outerRadius: 14,
    gradeRadius: 16,
    gradeStrength: 0.5,
    samplingRadius: 8,
    targetHeightMode: 'center',
    heightOffset: 0,
    priority: 50,
    ...overrides,
  };
}

describe('detectStampConflicts', () => {
  it('returns zero conflicts when two stamps are spatially disjoint', () => {
    // (a) Two capsules at opposite corners of a 1 km arena cannot overlap.
    const stamps: TerrainStampConfig[] = [
      capsule({ startX: -500, startZ: -500, endX: -490, endZ: -490 }),
      capsule({ startX: 500, startZ: 500, endX: 510, endZ: 510 }),
    ];

    expect(detectStampConflicts(stamps)).toEqual([]);
  });

  it('reports a single overlap conflict for two intersecting capsules', () => {
    // (b) Two capsules whose bed (outerRadius) footprints intersect.
    const stamps: TerrainStampConfig[] = [
      capsule({ startX: 0, startZ: 0, endX: 30, endZ: 0, outerRadius: 8, gradeRadius: 10 }),
      capsule({ startX: 20, startZ: 0, endX: 50, endZ: 0, outerRadius: 8, gradeRadius: 10 }),
    ];

    const conflicts = detectStampConflicts(stamps);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('overlap');
    expect(conflicts[0].kindA).toBe('flatten_capsule');
    expect(conflicts[0].kindB).toBe('flatten_capsule');
    // Overlap AABB is non-empty.
    expect(conflicts[0].overlapAABB.maxX).toBeGreaterThan(conflicts[0].overlapAABB.minX);
    expect(conflicts[0].overlapAABB.maxZ).toBeGreaterThan(conflicts[0].overlapAABB.minZ);
  });

  it('detects conflict between a hydrology capsule and an airfield envelope at the grade ramp', () => {
    // (c) Synthetic Open Frontier case: a hydrology channel runs near an
    //     airfield envelope. The hydrology bed (outerRadius) does NOT touch
    //     the airfield's flat surface (outerRadius), but the hydrology stamp
    //     sits inside the airfield's grade ramp — exactly the padding-gap
    //     symptom in the memo. The envelope's gradeRadius must be used or
    //     this conflict is missed.
    const hydrology = capsule({
      // Channel grade ramp is small (~4 m wide), so detector uses outerRadius.
      startX: 240,
      startZ: 0,
      endX: 260,
      endZ: 0,
      outerRadius: 6,
      gradeRadius: 10,
    });
    const airfieldEnvelope = capsule({
      // Big airfield: 200 m flat, 90 m grade ramp.
      startX: -50,
      startZ: 0,
      endX: 50,
      endZ: 0,
      outerRadius: 200,
      gradeRadius: 290,
    });
    const conflicts = detectStampConflicts([hydrology, airfieldEnvelope]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kindA).toBe('flatten_capsule');
    expect(conflicts[0].kindB).toBe('flatten_capsule');
    // The overlap is inside the envelope's grade ramp, not its flat interior.
    expect(conflicts[0].overlapAABB.maxX).toBeGreaterThan(234); // hydrology AABB minX
  });

  it('marks an envelope-enclosing-hydrology overlap as severity inside', () => {
    // (d) Hydrology channel fully contained inside the airfield envelope's
    //     influence AABB. The detector must report severity `inside`.
    const hydrology = capsule({
      startX: -10,
      startZ: -10,
      endX: 10,
      endZ: 10,
      outerRadius: 4,
      gradeRadius: 6,
    });
    const envelope = capsule({
      startX: -100,
      startZ: 0,
      endX: 100,
      endZ: 0,
      outerRadius: 150,
      gradeRadius: 240, // 90 m ramp -> envelope-class
    });

    const conflicts = detectStampConflicts([hydrology, envelope]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('inside');
  });

  it('handles 50 spatially disjoint stamps in well under 50 ms with zero conflicts', () => {
    // (e) Perf + correctness sanity: a deterministic 5x10 grid of stamps,
    //     each tile 200 m apart, with a 40 m radius. No grid neighbor's
    //     AABB can touch another.
    const stamps: TerrainStampConfig[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 10; col++) {
        stamps.push(
          circle({
            centerX: col * 200,
            centerZ: row * 200,
            outerRadius: 30,
            gradeRadius: 40,
          }),
        );
      }
    }

    const start = performance.now();
    const conflicts = detectStampConflicts(stamps);
    const elapsedMs = performance.now() - start;

    expect(conflicts).toEqual([]);
    expect(elapsedMs).toBeLessThan(50);
  });
});
