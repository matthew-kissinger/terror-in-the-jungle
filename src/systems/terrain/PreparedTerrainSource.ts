// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { HeightProviderConfig } from './IHeightProvider';

export interface PreparedHeightmapGrid {
  data: Float32Array;
  gridSize: number;
  workerConfig: HeightProviderConfig;
}

export interface PreparedTerrainSource {
  kind: 'procedural' | 'dem' | 'prebaked';
  preparedHeightmap?: PreparedHeightmapGrid;
  /** Approximate spacing between authoritative height samples, when finite. */
  heightSampleSpacingMeters?: number;
  /** Deterministic source identity for runtime navmesh cache invalidation. */
  terrainFingerprint?: string | number;
}
