// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// R2.2 of cycle-terrain-compositor (memo:
// docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
// R3 terrain/water foundation reset extends it to full-channel re-anchoring.
//
// Pass C — re-sample river-surface elevations against the composed provider.
//
// The hydrology bake artifact records `elevationMeters` per polyline point
// sampled against the BASE terrain provider (procedural noise / DEM). Once
// terrain composition adds hydrology bed stamps and authored pads, the
// river-surface mesh — which is baked from
// `point.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS` — can ride
// on stale elevations. Result: water on walls, water in pits, or ribbon water
// detached from the playable channel bed.
//
// This recomposer walks the polyline points and re-samples the composed
// provider at each `(x, z)`. The fix is contained to a deep CLONE of the
// artifact: navmesh + terrain bake consumers must keep the original
// pre-feedback artifact (memo §Risks). The old targeted optimization can
// still filter by AABB, but the startup compositor now opts into full-channel
// re-anchoring so water and terrain share one composed foundation.

import type { IHeightProvider } from '../IHeightProvider';
import type { HydrologyBakeArtifact } from '../hydrology/HydrologyBake';
import type { AABB2D } from './TerrainStampConflictDetector';

export interface HydrologyRecomposeStats {
  /** How many polyline points had their elevation re-sampled. */
  pointsResampled: number;
  /** Total polyline points scanned across all channels. */
  pointsScanned: number;
  /** Channels whose polyline mutated at least one elevation. */
  channelsTouched: number;
  /** Largest absolute elevation delta in meters (max(|new - old|)). */
  maxAbsoluteDeltaMeters: number;
}

export interface HydrologyRecomposeResult {
  artifact: HydrologyBakeArtifact;
  stats: HydrologyRecomposeStats;
}

export interface HydrologyRecomposeOptions {
  /**
   * Re-sample every polyline point, not only points inside conflict AABBs.
   * The terrain/water foundation reset uses this so the visible river
   * surface always follows the composed hydrology bed.
   */
  resampleAllPoints?: boolean;
}

/**
 * Re-sample river polyline elevations against the composed provider. Returns
 * a new artifact (the input is never mutated) and per-call stats.
 *
 * `relevantStampAABBs` enumerates AABBs for targeted re-sampling. When
 * `options.resampleAllPoints` is true, or when the list is empty, every point
 * is re-sampled against the composed provider.
 */
export function recomposeHydrologyArtifact(
  artifact: HydrologyBakeArtifact,
  composedProvider: IHeightProvider,
  relevantStampAABBs: readonly AABB2D[],
  options: HydrologyRecomposeOptions = {},
): HydrologyRecomposeResult {
  // structuredClone preserves Float32Array / number-shape fields exactly and
  // gives us a fully independent artifact. The polyline points array is
  // re-built below; everything else is a passthrough deep copy.
  const cloned: HydrologyBakeArtifact = structuredClone(artifact);

  const stats: HydrologyRecomposeStats = {
    pointsResampled: 0,
    pointsScanned: 0,
    channelsTouched: 0,
    maxAbsoluteDeltaMeters: 0,
  };

  if (cloned.channelPolylines.length === 0) {
    return { artifact: cloned, stats };
  }

  const resampleAllPoints = options.resampleAllPoints || relevantStampAABBs.length === 0;

  for (const channel of cloned.channelPolylines) {
    let channelTouched = false;
    for (const point of channel.points) {
      stats.pointsScanned += 1;
      if (!resampleAllPoints && !pointInsideAnyAABB(point.x, point.z, relevantStampAABBs)) continue;

      const sampled = composedProvider.getHeightAt(point.x, point.z);
      if (!Number.isFinite(sampled)) continue;

      const delta = sampled - point.elevationMeters;
      if (delta === 0) continue;

      point.elevationMeters = sampled;
      stats.pointsResampled += 1;
      stats.maxAbsoluteDeltaMeters = Math.max(stats.maxAbsoluteDeltaMeters, Math.abs(delta));
      channelTouched = true;
    }
    if (channelTouched) stats.channelsTouched += 1;
  }

  return { artifact: cloned, stats };
}

function pointInsideAnyAABB(x: number, z: number, aabbs: readonly AABB2D[]): boolean {
  for (const aabb of aabbs) {
    if (x >= aabb.minX && x <= aabb.maxX && z >= aabb.minZ && z <= aabb.maxZ) {
      return true;
    }
  }
  return false;
}
