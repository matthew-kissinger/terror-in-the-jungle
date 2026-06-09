// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { IHeightProvider } from '../IHeightProvider';
import type {
  CompiledTerrainFeatureSet,
  TerrainExclusionZone,
  TerrainStampConfig,
} from '../TerrainFeatureTypes';
import type { TerrainStampConflict } from './TerrainStampConflictDetector';

// Re-export the real conflict type so downstream consumers (Mode startup,
// telemetry, R2.3 debug overlay) import it from a single location.
export type { TerrainStampConflict } from './TerrainStampConflictDetector';
export type { TerrainStampPolicyResolution } from './TerrainStampPolicyResolver';

/**
 * Input contract for {@link composeTerrain}.
 *
 * The compositor accepts the already-compiled output of
 * {@link compileTerrainFeatures} (which itself folds in
 * {@link compileTerrainFlow}), then sorts the stamps in priority order. R2.1
 * wires a policy resolver that rewrites `fixedTargetHeight` on stamps whose
 * `obstructionPolicy` / `targetHeightStrategy` annotations demand it.
 *
 * (The hydrology stamp + Pass C feedback inputs were removed with the water
 * rework on 2026-06-09.)
 *
 * Design memo: docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md
 */
export interface TerrainCompositorInput {
  /** Base terrain provider - procedural noise (OF) or DEM (A Shau). */
  baseProvider: IHeightProvider;
  /** Compiled feature set (airfields, motor pools, helipads, flow stamps, surface patches, flow paths). */
  features: CompiledTerrainFeatureSet;
  /** Behavior switches. `strict` is reserved for downstream logging; the resolver behaves identically with or without it. */
  options?: TerrainCompositorOptions;
}

export interface TerrainCompositorOptions {
  /**
   * Reserved for downstream warn-level logging of configuration-error
   * conflicts (e.g. a `never_above` motor-pool sitting inside a carved bed).
   * The resolver itself behaves identically regardless of strict mode.
   */
  strict?: boolean;
}

/**
 * Output of {@link composeTerrain}.
 *
 * - `stamps`: features.stamps sorted ascending by priority, with
 *   `fixedTargetHeight` updated when the R2.1 resolver applied a policy
 *   (`consult` / `never_above` / `never_below` / `override`).
 * - `vegetationExclusionZones`: features.vegetationExclusionZones.
 * - `composedProvider`: new StampedHeightProvider(base, stamps).
 * - `conflicts`: every AABB overlap detected, each annotated with the
 *   resolution the policy resolver chose (`unchanged` / `clamped` /
 *   `resampled` / `overridden`).
 */
export interface TerrainCompositorOutput {
  composedProvider: IHeightProvider;
  stamps: TerrainStampConfig[];
  vegetationExclusionZones: TerrainExclusionZone[];
  conflicts: TerrainStampConflict[];
}
