import { StampedHeightProvider } from '../StampedHeightProvider';
import type { TerrainStampConfig } from '../TerrainFeatureTypes';
import type {
  TerrainCompositorInput,
  TerrainCompositorOutput,
} from './TerrainCompositorTypes';

/**
 * Canonical owner of terrain stamp composition. R1.1 is a behavior-identical
 * NO-OP wrapper around the legacy concat-and-sort path that previously lived
 * inline in {@link ../../../core/ModeStartupPreparer.compileStartupTerrainFeatures}.
 *
 * Pass A (Collection) — done in the upstream compilers; this function
 * accepts their outputs.
 *
 * Pass B (Spatial conflict graph) — R1.2 / R2.1 will land here. R1.1 returns
 * an empty `conflicts` array.
 *
 * Pass C (Hydrology feedback) — R2.2 will rebuild the hydrology artifact
 * against `composedProvider`. R1.1 passes the input artifact through unchanged.
 *
 * Design memo: docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md
 */
export function composeTerrain(input: TerrainCompositorInput): TerrainCompositorOutput {
  const { baseProvider, features, hydrology, hydrologyArtifact } = input;

  // Concat features + hydrology stamps, then sort by priority ascending.
  // This must match ModeStartupPreparer.compileStartupTerrainFeatures' legacy
  // logic byte-for-byte: Array.prototype.sort is stable on modern V8, but
  // `priority` is the sole key; equal priorities preserve the
  // (features-first, hydrology-second) insertion order.
  const mergedStamps: TerrainStampConfig[] = [
    ...features.stamps,
    ...(hydrology?.stamps ?? []),
  ];
  mergedStamps.sort((a, b) => a.priority - b.priority);

  const mergedVegetationExclusionZones = [
    ...features.vegetationExclusionZones,
    ...(hydrology?.vegetationExclusionZones ?? []),
  ];

  const composedProvider = mergedStamps.length > 0
    ? new StampedHeightProvider(baseProvider, mergedStamps)
    : baseProvider;

  return {
    composedProvider,
    stamps: mergedStamps,
    vegetationExclusionZones: mergedVegetationExclusionZones,
    conflicts: [],
    waterSurfaceArtifact: hydrologyArtifact,
  };
}
