import { StampedHeightProvider } from '../StampedHeightProvider';
import type { TerrainStampConfig } from '../TerrainFeatureTypes';
import type {
  TerrainCompositorInput,
  TerrainCompositorOutput,
} from './TerrainCompositorTypes';
import { detectStampConflicts } from './TerrainStampConflictDetector';
import { resolveStampPolicies } from './TerrainStampPolicyResolver';

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
 * Pass C (Hydrology feedback) - R2.2 will rebuild the hydrology artifact
 * against `composedProvider`. R2.1 passes the input artifact through
 * unchanged.
 *
 * Design memo: docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md
 */
export function composeTerrain(input: TerrainCompositorInput): TerrainCompositorOutput {
  const { baseProvider, features, hydrology, hydrologyArtifact, options } = input;

  // Concat features + hydrology stamps, then sort by priority ascending.
  // Array.prototype.sort is stable on modern V8 but `priority` is the sole
  // key; equal priorities preserve the (features-first, hydrology-second)
  // insertion order.
  const mergedStamps: TerrainStampConfig[] = [
    ...features.stamps,
    ...(hydrology?.stamps ?? []),
  ];
  mergedStamps.sort((a, b) => a.priority - b.priority);

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

  const composedProvider = resolved.stamps.length > 0
    ? new StampedHeightProvider(baseProvider, resolved.stamps)
    : baseProvider;

  return {
    composedProvider,
    stamps: resolved.stamps,
    vegetationExclusionZones: mergedVegetationExclusionZones,
    conflicts: resolved.resolutions,
    waterSurfaceArtifact: hydrologyArtifact,
  };
}
