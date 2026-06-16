// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { IHeightProvider } from './IHeightProvider';

export interface HeightfieldErosionAuthoritySpikeOptions {
  worldSize: number;
  gridSize: number;
  highSlopeDeg?: number;
}

export interface HeightRangeSummary {
  min: number;
  max: number;
  range: number;
}

export interface SlopeSummary {
  meanDeg: number;
  maxDeg: number;
  highSlopeCellRatio: number;
}

export interface FlowSummary {
  meanFlowStrength: number;
  maxFlowStrength: number;
  sinkCellRatio: number;
}

export interface ErosionRiskSummary {
  meanRisk01: number;
  maxRisk01: number;
  highRiskCellRatio: number;
}

export interface HeightfieldErosionAuthoritySpikeReport {
  debugOnly: true;
  authoritative: false;
  mutatesTerrain: false;
  sourceAuthority: 'IHeightProvider';
  worldSize: number;
  gridSize: number;
  sampleSpacingMeters: number;
  sampleCount: number;
  heightRange: HeightRangeSummary;
  slope: SlopeSummary;
  flow: FlowSummary;
  erosionRisk: ErosionRiskSummary;
}

interface CellMetrics {
  slopeDeg: number;
  flowStrength: number;
  sink: boolean;
  erosionRisk01: number;
}

const DEFAULT_HIGH_SLOPE_DEG = 32;

export function buildHeightfieldErosionAuthoritySpike(
  provider: IHeightProvider,
  options: HeightfieldErosionAuthoritySpikeOptions,
): HeightfieldErosionAuthoritySpikeReport {
  const gridSize = validateGridSize(options.gridSize);
  const worldSize = validateWorldSize(options.worldSize);
  const sampleSpacingMeters = worldSize / (gridSize - 1);
  const heights = sampleHeightGrid(provider, gridSize, worldSize);
  const heightRange = summarizeHeightRange(heights);
  const highSlopeDeg = options.highSlopeDeg ?? DEFAULT_HIGH_SLOPE_DEG;

  let slopeSum = 0;
  let maxSlopeDeg = 0;
  let highSlopeCells = 0;
  let flowSum = 0;
  let maxFlowStrength = 0;
  let sinkCells = 0;
  let riskSum = 0;
  let maxRisk = 0;
  let highRiskCells = 0;
  let measuredCells = 0;

  for (let z = 1; z < gridSize - 1; z += 1) {
    for (let x = 1; x < gridSize - 1; x += 1) {
      const metrics = computeCellMetrics(heights, gridSize, x, z, sampleSpacingMeters, heightRange.range);
      measuredCells += 1;
      slopeSum += metrics.slopeDeg;
      maxSlopeDeg = Math.max(maxSlopeDeg, metrics.slopeDeg);
      if (metrics.slopeDeg >= highSlopeDeg) highSlopeCells += 1;
      flowSum += metrics.flowStrength;
      maxFlowStrength = Math.max(maxFlowStrength, metrics.flowStrength);
      if (metrics.sink) sinkCells += 1;
      riskSum += metrics.erosionRisk01;
      maxRisk = Math.max(maxRisk, metrics.erosionRisk01);
      if (metrics.erosionRisk01 >= 0.65) highRiskCells += 1;
    }
  }

  const safeCellCount = Math.max(1, measuredCells);
  return {
    debugOnly: true,
    authoritative: false,
    mutatesTerrain: false,
    sourceAuthority: 'IHeightProvider',
    worldSize,
    gridSize,
    sampleSpacingMeters,
    sampleCount: gridSize * gridSize,
    heightRange,
    slope: {
      meanDeg: slopeSum / safeCellCount,
      maxDeg: maxSlopeDeg,
      highSlopeCellRatio: highSlopeCells / safeCellCount,
    },
    flow: {
      meanFlowStrength: flowSum / safeCellCount,
      maxFlowStrength,
      sinkCellRatio: sinkCells / safeCellCount,
    },
    erosionRisk: {
      meanRisk01: riskSum / safeCellCount,
      maxRisk01: maxRisk,
      highRiskCellRatio: highRiskCells / safeCellCount,
    },
  };
}

function sampleHeightGrid(
  provider: IHeightProvider,
  gridSize: number,
  worldSize: number,
): Float32Array {
  const heights = new Float32Array(gridSize * gridSize);
  const halfWorld = worldSize * 0.5;
  const step = worldSize / (gridSize - 1);

  for (let z = 0; z < gridSize; z += 1) {
    const worldZ = -halfWorld + z * step;
    for (let x = 0; x < gridSize; x += 1) {
      const worldX = -halfWorld + x * step;
      const height = provider.getHeightAt(worldX, worldZ);
      heights[z * gridSize + x] = Number.isFinite(height) ? height : 0;
    }
  }

  return heights;
}

function summarizeHeightRange(heights: Float32Array): HeightRangeSummary {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < heights.length; i += 1) {
    const height = heights[i];
    min = Math.min(min, height);
    max = Math.max(max, height);
  }
  return {
    min,
    max,
    range: max - min,
  };
}

function computeCellMetrics(
  heights: Float32Array,
  gridSize: number,
  x: number,
  z: number,
  sampleSpacingMeters: number,
  heightRange: number,
): CellMetrics {
  const center = readHeight(heights, gridSize, x, z);
  const left = readHeight(heights, gridSize, x - 1, z);
  const right = readHeight(heights, gridSize, x + 1, z);
  const down = readHeight(heights, gridSize, x, z - 1);
  const up = readHeight(heights, gridSize, x, z + 1);
  const dx = (right - left) / (sampleSpacingMeters * 2);
  const dz = (up - down) / (sampleSpacingMeters * 2);
  const gradient = Math.sqrt(dx * dx + dz * dz);
  const slopeDeg = Math.atan(gradient) * (180 / Math.PI);
  const localRelief = Math.max(
    Math.abs(center - left),
    Math.abs(center - right),
    Math.abs(center - down),
    Math.abs(center - up),
  );
  const normalizedRelief = heightRange > 0 ? clamp01(localRelief / Math.max(1, heightRange * 0.25)) : 0;
  const slopeRisk = clamp01(slopeDeg / 45);

  return {
    slopeDeg,
    flowStrength: gradient,
    sink: center < left && center < right && center < down && center < up,
    erosionRisk01: clamp01(slopeRisk * 0.7 + normalizedRelief * 0.3),
  };
}

function readHeight(heights: Float32Array, gridSize: number, x: number, z: number): number {
  return heights[z * gridSize + x];
}

function validateGridSize(gridSize: number): number {
  if (!Number.isInteger(gridSize) || gridSize < 3) {
    throw new Error(`Heightfield erosion spike gridSize must be an integer >= 3, got ${gridSize}`);
  }
  return gridSize;
}

function validateWorldSize(worldSize: number): number {
  if (!Number.isFinite(worldSize) || worldSize <= 0) {
    throw new Error(`Heightfield erosion spike worldSize must be positive, got ${worldSize}`);
  }
  return worldSize;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
