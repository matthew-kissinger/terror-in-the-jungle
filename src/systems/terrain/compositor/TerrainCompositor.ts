// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { IHeightProvider } from '../IHeightProvider';
import { StampedHeightProvider } from '../StampedHeightProvider';
import type { TerrainStampConfig } from '../TerrainFeatureTypes';
import type { HydrologyBakeArtifact } from '../hydrology/HydrologyBake';
import type {
  TerrainCompositorInput,
  TerrainCompositorOutput,
} from './TerrainCompositorTypes';
import {
  detectStampConflicts,
  stampAABB,
  type AABB2D,
} from './TerrainStampConflictDetector';
import { resolveStampPolicies } from './TerrainStampPolicyResolver';
import { recomposeHydrologyArtifact } from './HydrologyArtifactRecomposer';
import type { HydrologyArtifactCache } from './HydrologyArtifactCache';

/**
 * Canonical owner of terrain stamp composition.
 *
 * Pass A (Collection) - done in the upstream compilers; this function
 * accepts their outputs.
 *
 * Pass B (Spatial conflict graph + policy resolution, R1.2 + R2.1):
 *   `detectStampConflicts` enumerates every overlapping pair of stamps in
 *   the priority-sorted list. `resolveStampPolicies` then walks those
 *   conflicts and rewrites stamp `fixedTargetHeight` values according to
 *   each stamp's `obstructionPolicy` + `targetHeightStrategy`. The
 *   compositor returns both the resolved stamps and a resolution-annotated
 *   conflict list.
 *
 * Pass C (Hydrology feedback, R2.2/R3 reset) — when
 * `options.recomposeHydrology` is true AND a hydrology artifact is present,
 * the artifact is cloned and each polyline point is re-sampled against the
 * composed provider. The cloned artifact is returned via
 * {@link TerrainCompositorOutput.waterSurfaceArtifact} for
 * `HydrologyRiverSurface` (so the water mesh follows the actual composed
 * hydrology bed). Navmesh + heightmap bake consumers
 * keep reading the original `input.hydrologyArtifact` (memo §Risks
 * "Navmesh desync").
 *
 * Design memo: docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md
 */
export interface ComposeTerrainExtras {
  /**
   * Optional in-memory + IDB/OPFS cache for the recomposed hydrology
   * artifact. When provided alongside a `hydrologyCacheKey`, a synchronous
   * `getInMemory` hit short-circuits the recompose entirely (acceptance:
   * second compose <5 ms). Misses recompute and write back. Recompose is
   * pure, so a missing or broken cache is always safe.
   */
  hydrologyCache?: HydrologyArtifactCache;
  /**
   * Pre-computed cache key (callers compute this asynchronously via
   * {@link computeHydrologyArtifactCacheKey} during startup prep, then
   * pass it on the synchronous compose path). Without a key the cache
   * is bypassed.
   */
  hydrologyCacheKey?: string;
}

export function composeTerrain(
  input: TerrainCompositorInput,
  extras: ComposeTerrainExtras = {},
): TerrainCompositorOutput {
  const { baseProvider, features, hydrology, hydrologyArtifact, options } = input;

  const featureStamps = features.stamps;
  const hydrologyStamps = hydrology?.stamps ?? [];

  // Concat features + hydrology stamps, then sort by priority ascending.
  // Array.prototype.sort is stable on modern V8 but `priority` is the sole
  // key; equal priorities preserve the (features-first, hydrology-second)
  // insertion order.
  const mergedStamps: TerrainStampConfig[] = [...featureStamps, ...hydrologyStamps];
  mergedStamps.sort((a, b) => a.priority - b.priority);

  // Record which positions in the priority-sorted merged list came from
  // the hydrology input. The R2.1 policy resolver clones every stamp via
  // `stamps.map(s => ({...s}))`, so post-resolver reference equality is
  // unreliable for hydrology detection. Indexing by position is stable
  // because the resolver preserves stamp order.
  const hydrologyStampSet = new Set<TerrainStampConfig>(hydrologyStamps);
  const hydrologyIndices = new Set<number>();
  mergedStamps.forEach((stamp, index) => {
    if (hydrologyStampSet.has(stamp)) hydrologyIndices.add(index);
  });

  const mergedVegetationExclusionZones = [
    ...features.vegetationExclusionZones,
    ...(hydrology?.vegetationExclusionZones ?? []),
  ];

  // Pass B: detect conflicts then resolve policies. The resolver operates
  // on the priority-sorted list and returns rewritten stamps + resolution
  // annotations. Conflict detection returns [] on 0/1-stamp lists, so no
  // early-exit branch is needed for correctness.
  const detectedConflicts = detectStampConflicts(mergedStamps);
  const resolved = resolveStampPolicies({
    baseProvider,
    stamps: mergedStamps,
    conflicts: detectedConflicts,
    options: { strict: options?.strict ?? false },
  });

  const composedProvider: IHeightProvider = resolved.stamps.length > 0
    ? new StampedHeightProvider(baseProvider, resolved.stamps)
    : baseProvider;

  // Pass C: re-anchor hydrology elevations against the composed provider.
  // The resolved stamps (post-policy) are the canonical compose order, so
  // we run AABB conflict detection on them — Pass C cares about which
  // non-hydrology stamps overlap river polylines, not which stamps
  // overlap each other generally.
  const waterSurfaceArtifact = (options?.recomposeHydrology && hydrologyArtifact)
    ? runHydrologyFeedbackPass(
      hydrologyArtifact,
      composedProvider,
      resolved.stamps,
      hydrologyIndices,
      extras,
    )
    : hydrologyArtifact;

  return {
    composedProvider,
    stamps: resolved.stamps,
    vegetationExclusionZones: mergedVegetationExclusionZones,
    conflicts: resolved.resolutions,
    waterSurfaceArtifact,
  };
}

function runHydrologyFeedbackPass(
  hydrologyArtifact: HydrologyBakeArtifact,
  composedProvider: IHeightProvider,
  mergedStamps: TerrainStampConfig[],
  hydrologyIndices: Set<number>,
  extras: ComposeTerrainExtras,
): HydrologyBakeArtifact {
  const { hydrologyCache: cache, hydrologyCacheKey: key } = extras;
  if (cache && key) {
    const hit = cache.getInMemory(key);
    if (hit) return hit;
  }

  const relevantAABBs = collectNonHydrologyConflictAABBs(mergedStamps, hydrologyIndices);
  const { artifact: recomposed } = recomposeHydrologyArtifact(
    hydrologyArtifact,
    composedProvider,
    relevantAABBs,
    { resampleAllPoints: true },
  );

  if (cache && key) cache.set(key, recomposed);
  return recomposed;
}

/**
 * Enumerate AABBs of non-hydrology stamps that overlap at least one
 * hydrology stamp. Older Pass C used this list as a targeted optimization.
 * The foundation reset now re-samples the full channel path, but the AABB
 * list remains useful for cache-key continuity and future diagnostics.
 *
 * Uses {@link detectStampConflicts} on the resolved (post-policy) stamp
 * list, then keeps only conflict pairs where exactly one side is
 * hydrology, taking the non-hydrology stamp's AABB (its envelope is what
 * reshapes the ground under the river). Deduplicated by index: an airfield
 * envelope that overlaps four hydrology segments contributes a single
 * AABB.
 *
 * Hydrology stamps are identified by their POSITION in the priority-sorted
 * merged list (computed before the R2.1 policy resolver runs). The
 * resolver clones every stamp via `stamps.map(s => ({...s}))`, so
 * reference equality would break — index equality is stable because the
 * resolver preserves stamp order.
 */
function collectNonHydrologyConflictAABBs(
  mergedStamps: TerrainStampConfig[],
  hydrologyIndices: Set<number>,
): AABB2D[] {
  if (mergedStamps.length < 2 || hydrologyIndices.size === 0) return [];

  const conflicts = detectStampConflicts(mergedStamps);
  if (conflicts.length === 0) return [];

  const seenNonHydrologyIndex = new Set<number>();
  const aabbs: AABB2D[] = [];
  for (const conflict of conflicts) {
    const a = mergedStamps[conflict.stampA];
    const b = mergedStamps[conflict.stampB];
    if (!a || !b) continue;
    const aIsHydro = hydrologyIndices.has(conflict.stampA);
    const bIsHydro = hydrologyIndices.has(conflict.stampB);
    if (aIsHydro === bIsHydro) continue;
    const nonHydroIndex = aIsHydro ? conflict.stampB : conflict.stampA;
    if (seenNonHydrologyIndex.has(nonHydroIndex)) continue;
    seenNonHydrologyIndex.add(nonHydroIndex);
    const nonHydroStamp = mergedStamps[nonHydroIndex];
    if (!nonHydroStamp) continue;
    aabbs.push(stampAABB(nonHydroStamp));
  }
  return aabbs;
}
