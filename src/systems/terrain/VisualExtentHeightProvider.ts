// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { HeightProviderConfig, IHeightProvider } from './IHeightProvider';
import {
  collarExtrapolatedHeight,
  computePlayableHeightEnvelope,
  type PlayableHeightEnvelope,
} from './collarExtrapolation';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const SOURCE_DELTA_EPSILON_METERS = 0.01;

/**
 * Render-source provider for finite-map visual continuation.
 *
 * Inside the playable square it preserves the authoritative gameplay height
 * provider. Outside that square it keeps the edge continuous, then applies the
 * source provider's height delta beyond the clamped playable edge.
 *
 * DEM providers clamp outside their source bounds, so their source delta is
 * zero at the exact place where A Shau needs a collar. In that case we fall
 * back to a damped edge-slope extrapolation derived from the playable terrain
 * immediately inside the DEM. This is still a source-derived visual collar,
 * not new gameplay authority or a fake vertical skirt.
 */
export class VisualExtentHeightProvider implements IHeightProvider {
  private readonly baseProvider: IHeightProvider;
  private readonly sourceProvider: IHeightProvider;
  private readonly halfPlayable: number;
  private readonly halfVisual: number;
  private playableEnvelope: PlayableHeightEnvelope | null = null;

  constructor(
    baseProvider: IHeightProvider,
    sourceProvider: IHeightProvider,
    playableWorldSize: number,
    visualMargin: number,
  ) {
    this.baseProvider = baseProvider;
    this.sourceProvider = sourceProvider;
    this.halfPlayable = Math.max(0, playableWorldSize * 0.5);
    this.halfVisual = this.halfPlayable + Math.max(0, visualMargin);
  }

  getHeightAt(worldX: number, worldZ: number): number {
    const clampedX = clamp(worldX, -this.halfPlayable, this.halfPlayable);
    const clampedZ = clamp(worldZ, -this.halfPlayable, this.halfPlayable);

    if (worldX === clampedX && worldZ === clampedZ) {
      return this.baseProvider.getHeightAt(worldX, worldZ);
    }

    const sampleX = clamp(worldX, -this.halfVisual, this.halfVisual);
    const sampleZ = clamp(worldZ, -this.halfVisual, this.halfVisual);
    const edgeBaseHeight = this.baseProvider.getHeightAt(clampedX, clampedZ);
    const sourceDelta = this.sourceProvider.getHeightAt(sampleX, sampleZ)
      - this.sourceProvider.getHeightAt(clampedX, clampedZ);

    if (Math.abs(sourceDelta) > SOURCE_DELTA_EPSILON_METERS) {
      return edgeBaseHeight + sourceDelta;
    }

    // No real source data beyond the edge: continue with the bounded,
    // envelope-clamped collar extrapolation (single source of truth so the
    // main-thread and worker bakes can never drift). See collarExtrapolation.ts.
    const sampleBase = (x: number, z: number): number => this.baseProvider.getHeightAt(x, z);
    if (this.playableEnvelope === null) {
      this.playableEnvelope = computePlayableHeightEnvelope(sampleBase, this.halfPlayable);
    }
    return collarExtrapolatedHeight(
      sampleBase,
      worldX,
      worldZ,
      clampedX,
      clampedZ,
      this.halfPlayable,
      edgeBaseHeight,
      this.playableEnvelope,
    );
  }

  getWorkerConfig(): HeightProviderConfig {
    return {
      type: 'visualExtent',
      base: this.baseProvider.getWorkerConfig(),
      source: this.sourceProvider.getWorkerConfig(),
      playableWorldSize: this.halfPlayable * 2,
      visualMargin: Math.max(0, this.halfVisual - this.halfPlayable),
    };
  }
}
