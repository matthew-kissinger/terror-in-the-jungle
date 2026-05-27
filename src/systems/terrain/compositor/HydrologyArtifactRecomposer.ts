// R2.2 of cycle-terrain-compositor (memo:
// docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
//
// Pass C — re-sample river-surface elevations against the composed provider.
//
// The hydrology bake artifact records `elevationMeters` per polyline point
// sampled against the BASE terrain provider (procedural noise / DEM). When
// higher-priority stamps (airfields, motor pools) raise or lower the ground
// at a river's footprint, the river-surface mesh — which is baked from
// `point.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS` — still
// rides on the stale base elevation. Result: water on walls or water in
// pits inside flattened areas.
//
// This recomposer walks the polyline points and re-samples the composed
// provider at each `(x, z)`. The fix is contained to a deep CLONE of the
// artifact: navmesh + terrain bake consumers must keep the original
// pre-feedback artifact (memo §Risks). Only points whose `(x, z)` falls
// inside the AABB of a non-hydrology conflict stamp are re-sampled — most
// points are far from any flattening stamp and don't need work.

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

/**
 * Re-sample river polyline elevations against the composed provider. Returns
 * a new artifact (the input is never mutated) and per-call stats.
 *
 * `relevantStampAABBs` enumerates the AABBs of non-hydrology stamps that
 * overlap any hydrology stamp (Pass B output). Points outside all of these
 * AABBs are passed through unchanged — they cannot have shifted vs the
 * base provider, so re-sampling would be wasted work. An empty AABB list
 * disables the optimization and we re-sample every point.
 */
export function recomposeHydrologyArtifact(
  artifact: HydrologyBakeArtifact,
  composedProvider: IHeightProvider,
  relevantStampAABBs: readonly AABB2D[],
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

  // No relevant AABBs means no non-hydrology stamps overlap any hydrology
  // stamp; nothing can shift the elevation. Skip the work.
  if (relevantStampAABBs.length === 0) {
    return { artifact: cloned, stats };
  }

  for (const channel of cloned.channelPolylines) {
    let channelTouched = false;
    for (const point of channel.points) {
      stats.pointsScanned += 1;
      if (!pointInsideAnyAABB(point.x, point.z, relevantStampAABBs)) continue;

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
