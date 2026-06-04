// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// R1.2 of cycle-terrain-compositor (memo:
// docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
//
// Standalone spatial-conflict detector over the canonical terrain stamp list.
// Consumed by the compositor's policy resolver (R2.1) - see
// `TerrainStampPolicyResolver.ts`.
//
// Algorithm: flat O(n^2) AABB scan. At Open Frontier's ~150 stamps that is
// ~22k compares per scenario startup, well under any budget. R-tree is a
// deferred optimization per memo "Open questions".
//
// AABB rule per stamp kind:
//   - flatten_circle: outer bbox uses gradeRadius (grade ramp dominates the
//     disc footprint); inner bbox uses outerRadius (the flat bed / shoulder).
//   - flatten_capsule (non-envelope): outer bbox uses gradeRadius (matches
//     `TerrainStampGridBaker.getStampBounds`, the canonical baker footprint),
//     inner bbox uses outerRadius (the flat bed / shoulder).
//   - flatten_capsule that *looks like an airfield envelope*: outer bbox
//     uses gradeRadius (the wide ramp), inner bbox uses outerRadius (the flat
//     interior). The padding-gap symptom (memo §Evidence) lives at the ramp
//     edge so the conflict surface must include it.
//
// F2 reconcile (cycle-terrain-compositor R2.1): the baker uses gradeRadius
// for every kind (`TerrainStampGridBaker.getStampBounds`). To keep the
// detector aligned with the baker's footprint *and* give the resolver a
// tighter inner-extent (for `override` checks that only care about the flat
// interior), the detector now returns BOTH bboxes via `stampAABBs`. The
// single-extent `stampAABB` returns `outer` for back-compat.
//
// F1 fix (cycle-terrain-compositor R2.1): the previous comment claimed a
// "90 m grade ramp" on the airfield envelope. The actual constant is
// `AIRFIELD_ENVELOPE_GRADE_RAMP_M = 48` in `TerrainFeatureCompiler.ts`.
// The 30 m heuristic threshold is still safe (well above any hydrology
// grade ramp at realistic river widths, < 15 m).

import type { TerrainStampConfig } from '../TerrainFeatureTypes';

export interface AABB2D {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Per-stamp AABB bundle. `outer` matches the baker's footprint
 * (`gradeRadius`-inflated) and is the canonical conflict surface. `inner`
 * is the flat bed (`outerRadius`-inflated) - used by resolver policies
 * that only care about overlaps in the fully-flattened interior.
 */
export interface TerrainStampAABBs {
  outer: AABB2D;
  inner: AABB2D;
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

// Envelope-class threshold. The outer AABB now always uses `gradeRadius`
// (matching `TerrainStampGridBaker.getStampBounds`), so this constant is no
// longer load-bearing inside the detector itself. It IS still consumed by
// the dev-only compositor debug overlay (R2.3, `CompositorDebugOverlay.ts`)
// to colour-classify envelope-class capsules vs route capsules — keeping the
// overlay and the detector aligned on what "envelope-class" means.
//
// 30 m sits safely above any hydrology channel grade ramp at realistic
// widths (< 15 m) and below the airfield envelope's 48 m grade ramp
// (`AIRFIELD_ENVELOPE_GRADE_RAMP_M` in `TerrainFeatureCompiler.ts`).
export const ENVELOPE_RAMP_THRESHOLD_METERS = 30;

function inflateCapsuleAABB(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
): AABB2D {
  const minSegX = Math.min(startX, endX);
  const maxSegX = Math.max(startX, endX);
  const minSegZ = Math.min(startZ, endZ);
  const maxSegZ = Math.max(startZ, endZ);
  return {
    minX: minSegX - radius,
    minZ: minSegZ - radius,
    maxX: maxSegX + radius,
    maxZ: maxSegZ + radius,
  };
}

/**
 * Returns the outer (grade-radius) AABB for a stamp - the canonical conflict
 * footprint matching `TerrainStampGridBaker.getStampBounds`.
 *
 * Use {@link stampAABBs} when the consumer also needs the inner (flat-bed)
 * extent - e.g. the policy resolver's `override` rule.
 */
export function stampAABB(stamp: TerrainStampConfig): AABB2D {
  return stampAABBs(stamp).outer;
}

export function stampAABBs(stamp: TerrainStampConfig): TerrainStampAABBs {
  if (stamp.kind === 'flatten_circle') {
    const outer: AABB2D = {
      minX: stamp.centerX - stamp.gradeRadius,
      minZ: stamp.centerZ - stamp.gradeRadius,
      maxX: stamp.centerX + stamp.gradeRadius,
      maxZ: stamp.centerZ + stamp.gradeRadius,
    };
    const inner: AABB2D = {
      minX: stamp.centerX - stamp.outerRadius,
      minZ: stamp.centerZ - stamp.outerRadius,
      maxX: stamp.centerX + stamp.outerRadius,
      maxZ: stamp.centerZ + stamp.outerRadius,
    };
    return { outer, inner };
  }

  // flatten_capsule - outer matches the baker; inner is the flat bed.
  return {
    outer: inflateCapsuleAABB(stamp.startX, stamp.startZ, stamp.endX, stamp.endZ, stamp.gradeRadius),
    inner: inflateCapsuleAABB(stamp.startX, stamp.startZ, stamp.endX, stamp.endZ, stamp.outerRadius),
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

export function aabbsOverlap(a: AABB2D, b: AABB2D): AABB2D | null {
  return aabbOverlap(a, b);
}

export function detectStampConflicts(stamps: TerrainStampConfig[]): TerrainStampConflict[] {
  const conflicts: TerrainStampConflict[] = [];
  if (stamps.length < 2) return conflicts;

  // Precompute AABBs so we do not recompute per pair.
  const boxes: AABB2D[] = stamps.map((stamp) => stampAABB(stamp));

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
