// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { IHeightProvider } from '../IHeightProvider';
import type {
  CompiledTerrainFeatureSet,
  TerrainExclusionZone,
  TerrainStampConfig,
} from '../TerrainFeatureTypes';
import type { HydrologyBakeArtifact } from '../hydrology/HydrologyBake';
import type { TerrainStampConflict } from './TerrainStampConflictDetector';

// Re-export the real conflict type so downstream consumers (Mode startup,
// telemetry, R2.3 debug overlay) import it from a single location.
export type { TerrainStampConflict } from './TerrainStampConflictDetector';
export type { TerrainStampPolicyResolution } from './TerrainStampPolicyResolver';

/**
 * Input contract for {@link composeTerrain}.
 *
 * The compositor accepts the already-compiled outputs of the existing
 * {@link compileTerrainFeatures} (which itself folds in
 * {@link compileTerrainFlow}) and {@link compileHydrologyTerrainFeatures}
 * paths, then concat-and-sorts them in priority order. R2.1 wires a policy
 * resolver that rewrites `fixedTargetHeight` on stamps whose
 * `obstructionPolicy` / `targetHeightStrategy` annotations demand it.
 *
 * Design memo: docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md
 */
export interface TerrainCompositorInput {
  /** Base terrain provider - procedural noise (OF) or DEM (A Shau). */
  baseProvider: IHeightProvider;
  /** Compiled feature set (airfields, motor pools, helipads, flow stamps, surface patches, flow paths). */
  features: CompiledTerrainFeatureSet;
  /** Compiled hydrology stamps + vegetation exclusions (or null when hydrology disabled). */
  hydrology: TerrainCompositorHydrologyInput | null;
  /** Hydrology bake artifact (for the eventual Pass C feedback loop; passed through unchanged until R2.2). */
  hydrologyArtifact: HydrologyBakeArtifact | null;
  /** Behavior switches. `strict` is reserved for downstream logging; the resolver behaves identically with or without it. */
  options?: TerrainCompositorOptions;
}

export interface TerrainCompositorHydrologyInput {
  stamps: TerrainStampConfig[];
  vegetationExclusionZones: TerrainExclusionZone[];
}

export interface TerrainCompositorOptions {
  /**
   * Reserved for downstream warn-level logging of configuration-error
   * conflicts (e.g. a `never_above` motor-pool sitting inside a river bed).
   * The resolver itself behaves identically regardless of strict mode.
   */
  strict?: boolean;
  /** Re-anchor hydrology water-surface elevations against the composed provider. */
  recomposeHydrology?: boolean;
}

/**
 * Output of {@link composeTerrain}.
 *
 * - `stamps`: features.stamps union hydrology.stamps, sorted ascending by
 *   priority, with `fixedTargetHeight` updated when the R2.1 resolver applied
 *   a policy (`consult` / `never_above` / `never_below` / `override`).
 * - `vegetationExclusionZones`: features.vegetationExclusionZones union
 *   hydrology.vegetationExclusionZones.
 * - `composedProvider`: new StampedHeightProvider(base, stamps).
 * - `conflicts`: every AABB overlap detected, each annotated with the
 *   resolution the policy resolver chose (`unchanged` / `clamped` /
 *   `resampled` / `overridden`).
 * - `waterSurfaceArtifact`: hydrologyArtifact cloned with river elevations
 *   re-anchored against the composed provider when Pass C is enabled.
 */
export interface TerrainCompositorOutput {
  composedProvider: IHeightProvider;
  stamps: TerrainStampConfig[];
  vegetationExclusionZones: TerrainExclusionZone[];
  conflicts: TerrainStampConflict[];
  waterSurfaceArtifact: HydrologyBakeArtifact | null;
}
