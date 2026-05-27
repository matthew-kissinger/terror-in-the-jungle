// R1.2 of cycle-terrain-compositor (memo:
// docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
//
// Standalone spatial-conflict detector over the canonical terrain stamp list.
// LOGGING-ONLY at this PR: the compositor (R1.1) consumes this in R2.1; this
// PR only publishes the detector and its unit tests.
//
// Algorithm: flat O(n^2) AABB scan. At Open Frontier's ~150 stamps that is
// ~22k compares per scenario startup, well under any budget. R-tree is a
// deferred optimization per memo "Open questions".
//
// AABB rule per stamp kind:
//   - flatten_circle: bbox from (centerX, centerZ) inflated by gradeRadius
//     (the outermost influence — grade ramp dominates the disc footprint).
//   - flatten_capsule: segment AABB inflated by outerRadius (matches the
//     "bed + shoulder" footprint used by hydrology channels and route stamps).
//   - flatten_capsule that *looks like an airfield envelope* uses gradeRadius
//     instead, since the airfield ramp is much wider than the runway shoulder
//     and the padding-gap symptom (memo §Evidence) lives at the ramp edge.
//     We classify by ramp width: gradeRadius - outerRadius >= 30 m is well
//     past any hydrology channel's grade ramp (~8 m at typical river widths)
//     and matches the airfield envelope's 48 m grade ramp
//     (TerrainFeatureCompiler.AIRFIELD_ENVELOPE_GRADE_RAMP_M).

import type { TerrainStampConfig } from '../TerrainFeatureTypes';

export interface AABB2D {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export type TerrainStampConflictSeverity = 'overlap' | 'inside';

export interface TerrainStampConflict {
  stampA: number;
  stampB: number;
  kindA: string;
  kindB: string;
  overlapAABB: AABB2D;
  severity: TerrainStampConflictSeverity;
}

// Heuristic: a flatten_capsule whose grade ramp (gradeRadius - outerRadius)
// is >= this many meters is treated as an airfield-envelope-class stamp and
// has its AABB inflated by gradeRadius instead of outerRadius. The airfield
// envelope ships a 48 m grade ramp (TerrainFeatureCompiler.ts
// AIRFIELD_ENVELOPE_GRADE_RAMP_M); the widest hydrology grade ramp at
// realistic river widths is < 15 m, so a 30 m threshold is unambiguous.
//
// Exported for the dev-only compositor debug overlay (R2.3) so its colour
// classifier can agree with the detector on what "envelope-class" means.
export const ENVELOPE_RAMP_THRESHOLD_METERS = 30;

export function stampAABB(stamp: TerrainStampConfig): AABB2D {
  if (stamp.kind === 'flatten_circle') {
    const radius = Math.max(stamp.outerRadius, stamp.gradeRadius);
    return {
      minX: stamp.centerX - radius,
      minZ: stamp.centerZ - radius,
      maxX: stamp.centerX + radius,
      maxZ: stamp.centerZ + radius,
    };
  }

  // flatten_capsule
  const rampWidth = stamp.gradeRadius - stamp.outerRadius;
  const radius = rampWidth >= ENVELOPE_RAMP_THRESHOLD_METERS
    ? stamp.gradeRadius
    : stamp.outerRadius;

  const minSegX = Math.min(stamp.startX, stamp.endX);
  const maxSegX = Math.max(stamp.startX, stamp.endX);
  const minSegZ = Math.min(stamp.startZ, stamp.endZ);
  const maxSegZ = Math.max(stamp.startZ, stamp.endZ);

  return {
    minX: minSegX - radius,
    minZ: minSegZ - radius,
    maxX: maxSegX + radius,
    maxZ: maxSegZ + radius,
  };
}

function aabbOverlap(a: AABB2D, b: AABB2D): AABB2D | null {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  if (minX > maxX) return null;
  const minZ = Math.max(a.minZ, b.minZ);
  const maxZ = Math.min(a.maxZ, b.maxZ);
  if (minZ > maxZ) return null;
  return { minX, minZ, maxX, maxZ };
}

function aabbContains(outer: AABB2D, inner: AABB2D): boolean {
  return (
    outer.minX <= inner.minX &&
    outer.maxX >= inner.maxX &&
    outer.minZ <= inner.minZ &&
    outer.maxZ >= inner.maxZ
  );
}

export function detectStampConflicts(stamps: TerrainStampConfig[]): TerrainStampConflict[] {
  const conflicts: TerrainStampConflict[] = [];
  if (stamps.length < 2) return conflicts;

  // Precompute AABBs so we do not recompute per pair.
  const boxes: AABB2D[] = stamps.map(stampAABB);

  for (let i = 0; i < stamps.length; i++) {
    for (let j = i + 1; j < stamps.length; j++) {
      const overlap = aabbOverlap(boxes[i], boxes[j]);
      if (!overlap) continue;
      const severity: TerrainStampConflictSeverity =
        aabbContains(boxes[i], boxes[j]) || aabbContains(boxes[j], boxes[i])
          ? 'inside'
          : 'overlap';
      conflicts.push({
        stampA: i,
        stampB: j,
        kindA: stamps[i].kind,
        kindB: stamps[j].kind,
        overlapAABB: overlap,
        severity,
      });
    }
  }

  return conflicts;
}
