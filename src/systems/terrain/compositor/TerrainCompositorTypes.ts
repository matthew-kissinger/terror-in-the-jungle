import type { IHeightProvider } from '../IHeightProvider';
import type {
  CompiledTerrainFeatureSet,
  TerrainExclusionZone,
  TerrainStampConfig,
} from '../TerrainFeatureTypes';
import type { HydrologyBakeArtifact } from '../hydrology/HydrologyBake';

/**
 * Input contract for {@link composeTerrain}. R1.1 is the foundation pass:
 * we accept the already-compiled outputs of the existing
 * {@link compileTerrainFeatures} (which itself folds in
 * {@link compileTerrainFlow}) and {@link compileHydrologyTerrainFeatures}
 * paths, then concat-and-sort byte-identically with the legacy logic in
 * {@link ../core/ModeStartupPreparer.compileStartupTerrainFeatures}.
 *
 * Later phases extend each {@link TerrainCompositorStampGroup} with
 * `obstructionPolicy` / `targetHeightStrategy` annotations (R1.3),
 * AABB conflict graphs (R1.2 / R2.1), and hydrology recomposition
 * (R2.2). The shape of this contract is stable from R1.1 forward.
 *
 * Design memo: docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md
 */
export interface TerrainCompositorInput {
  /** Base terrain provider — procedural noise (OF) or DEM (A Shau). */
  baseProvider: IHeightProvider;
  /** Compiled feature set (airfields, motor pools, helipads, flow stamps, surface patches, flow paths). */
  features: CompiledTerrainFeatureSet;
  /** Compiled hydrology stamps + vegetation exclusions (or null when hydrology disabled). */
  hydrology: TerrainCompositorHydrologyInput | null;
  /** Hydrology bake artifact (for the eventual Pass C feedback loop; passed through unchanged in R1.1). */
  hydrologyArtifact: HydrologyBakeArtifact | null;
  /** Behavior switches reserved for R2.x phases. R1.1 ignores all fields. */
  options?: TerrainCompositorOptions;
}

export interface TerrainCompositorHydrologyInput {
  stamps: TerrainStampConfig[];
  vegetationExclusionZones: TerrainExclusionZone[];
}

export interface TerrainCompositorOptions {
  /** R2.x: enable strict conflict resolution (fail on configuration errors). Ignored in R1.1. */
  strict?: boolean;
  /** R2.2: re-anchor hydrology elevations against the composed provider. Ignored in R1.1. */
  recomposeHydrology?: boolean;
}

/**
 * Output of {@link composeTerrain}. In R1.1 this is byte-identical to the
 * legacy concat-sort + {@link StampedHeightProvider} construction:
 *
 * - `stamps`: features.stamps ∪ hydrology.stamps, sorted ascending by priority.
 * - `vegetationExclusionZones`: features.vegetationExclusionZones ∪ hydrology.vegetationExclusionZones.
 * - `composedProvider`: new StampedHeightProvider(base, stamps).
 * - `conflicts`: always empty (R1.2 owns AABB detection).
 * - `waterSurfaceArtifact`: input hydrologyArtifact passed through unchanged (R2.2 owns Pass C).
 */
export interface TerrainCompositorOutput {
  composedProvider: IHeightProvider;
  stamps: TerrainStampConfig[];
  vegetationExclusionZones: TerrainExclusionZone[];
  conflicts: TerrainStampConflict[];
  waterSurfaceArtifact: HydrologyBakeArtifact | null;
}

/**
 * Reserved for R1.2 (logging-only) and R2.1 (policy resolution). Empty in R1.1.
 * Fields will land in R1.2 — keep the type alias so consumers can import it now.
 */
export type TerrainStampConflict = Record<string, never>;
