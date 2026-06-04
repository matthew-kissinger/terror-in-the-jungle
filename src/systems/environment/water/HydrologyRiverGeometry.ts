// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type {
  HydrologyBakeArtifact,
  HydrologyChannelPolyline,
  HydrologyPolylinePoint,
} from '../../terrain/hydrology/HydrologyBake';
import {
  resolveHydrologyAccumulationFactor,
  resolveHydrologyPeakAccumulationCells,
  resolveHydrologyRiverWidthMeters,
} from '../../terrain/hydrology/HydrologyRiverMetrics';
import { smoothHydrologyRiverPath } from '../../terrain/hydrology/HydrologyRiverPath';
import type {
  HydrologyRiverMeshStats,
  HydrologyWaterQuerySegment,
} from './HydrologyRiverSurface';

const MAX_HYDROLOGY_RIVER_CHANNELS = 24;
const MAX_HYDROLOGY_RIVER_SEGMENTS = 4096;
const HYDROLOGY_RIVER_SURFACE_OFFSET_METERS = 0.85;
const HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS = 0.5;
const HYDROLOGY_RIVER_BANK_COLOR = new THREE.Color(0x4a5c4f);
const HYDROLOGY_RIVER_SHALLOW_COLOR = new THREE.Color(0x0a7082);
const HYDROLOGY_RIVER_DEEP_COLOR = new THREE.Color(0x032640);
const HYDROLOGY_RIVER_EDGE_ALPHA = 0.42;
const HYDROLOGY_RIVER_BANK_ALPHA = 0.72;
const HYDROLOGY_RIVER_SHALLOW_ALPHA = 0.93;
const HYDROLOGY_RIVER_CENTER_ALPHA = 0.98;
const HYDROLOGY_RIVER_UV_FLOW_REPEAT_METERS = 8;
const HYDROLOGY_RIVER_BANK_JITTER_FRACTION = 0.14;

// Flow-visuals constants (from hydrology-river-flow-visuals, VODA-1 R2).
// Foam mask combines narrowness + slope into a single per-vertex [0..1]
// value the shader brightens fragments with. Narrowness ramps below
// `flowFactor = NARROW_THRESHOLD` (low-accumulation headwaters); slope is
// fully on at SLOPE_M_PER_M rise-over-run. Bank vertices get a 0.25
// floor of the center value so the foam cap bleeds into the bank.
const HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD = 0.72;
const HYDROLOGY_RIVER_FOAM_SLOPE_M_PER_M = 0.038;
const HYDROLOGY_RIVER_FOAM_NARROW_WEIGHT = 0.68;
const HYDROLOGY_RIVER_FOAM_SLOPE_WEIGHT = 0.95;
const HYDROLOGY_RIVER_FOAM_BANK_FLOOR_FRACTION = 0.32;

// Gameplay flow speeds (m/s) consumed by `WaterSurfaceSampler.sample()` to
// fill `WaterInteractionSample.flowVelocity`. Headwaters get a small floor
// so even a tiny stream nudges floating bodies downstream; main channels
// (largest retained drainage paths) get the max. The flow stays modest
// enough for brown-water river gameplay while still pushing swimmers and
// light watercraft downstream.
const HYDROLOGY_RIVER_GAMEPLAY_FLOW_MIN_M_PER_S = 0.25;
const HYDROLOGY_RIVER_GAMEPLAY_FLOW_MAX_M_PER_S = 1.15;

type RiverCrossSectionBand = 'edge' | 'bank' | 'shallow' | 'deep';

interface RiverCrossSectionSample {
  across: number;
  band: RiverCrossSectionBand;
  alpha: number;
  foamScale: number;
}

interface RiverRenderPoint extends HydrologyPolylinePoint {
  distanceMeters: number;
  widthMeters: number;
  flowFactor: number;
  leftBankScale: number;
  rightBankScale: number;
}

const HYDROLOGY_RIVER_CROSS_SECTION: RiverCrossSectionSample[] = [
  { across: -1.0, band: 'edge', alpha: HYDROLOGY_RIVER_EDGE_ALPHA, foamScale: 0.18 },
  { across: -0.76, band: 'bank', alpha: HYDROLOGY_RIVER_BANK_ALPHA, foamScale: 0.35 },
  { across: -0.38, band: 'shallow', alpha: HYDROLOGY_RIVER_SHALLOW_ALPHA, foamScale: 0.65 },
  { across: 0, band: 'deep', alpha: HYDROLOGY_RIVER_CENTER_ALPHA, foamScale: 1 },
  { across: 0.38, band: 'shallow', alpha: HYDROLOGY_RIVER_SHALLOW_ALPHA, foamScale: 0.65 },
  { across: 0.76, band: 'bank', alpha: HYDROLOGY_RIVER_BANK_ALPHA, foamScale: 0.35 },
  { across: 1.0, band: 'edge', alpha: HYDROLOGY_RIVER_EDGE_ALPHA, foamScale: 0.18 },
];

export interface HydrologyRiverGeometryBuild {
  geometry: THREE.BufferGeometry;
  stats: HydrologyRiverMeshStats;
  querySegments: HydrologyWaterQuerySegment[];
}

/**
 * Pure geometry builder for hydrology river surfaces. Consumes a baked
 * hydrology artifact and emits a triangulated channel mesh with:
 *   - position / normal / uv / color (vec4, alpha = depth tint)
 *   - aFlowDir (vec2, world-XZ unit vector per vertex)
 *   - aFoamMask (float per vertex, narrowness + slope combined)
 *
 * Bake-time attribute emission keeps the flow-visuals fragment shader
 * branch-free. Returns null when no segment survived the min-length
 * filter (caller treats this as "no surface to attach").
 */
export function buildHydrologyRiverGeometry(
  artifact: HydrologyBakeArtifact,
): HydrologyRiverGeometryBuild | null {
  const sortedChannels = [...artifact.channelPolylines]
    .sort((a, b) => b.maxAccumulationCells - a.maxAccumulationCells || b.lengthMeters - a.lengthMeters)
    .slice(0, MAX_HYDROLOGY_RIVER_CHANNELS);
  const peakAccumulationCells = resolveHydrologyPeakAccumulationCells(artifact, sortedChannels);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const flowDirs: number[] = [];
  const foamMasks: number[] = [];
  const indices: number[] = [];
  const querySegments: HydrologyWaterQuerySegment[] = [];
  let segmentCount = 0;
  let totalLengthMeters = 0;
  let maxAccumulationCells = 0;
  let renderedChannelCount = 0;

  for (const channel of sortedChannels) {
    const points = buildRiverRenderPoints(channel, artifact, peakAccumulationCells);
    if (points.length < 2) continue;
    maxAccumulationCells = Math.max(maxAccumulationCells, channel.maxAccumulationCells);

    const sectionVertexBases: number[] = [];
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      if (!point) continue;

      const frame = resolveSectionFrame(points, index);
      const pointY = point.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
      const vertexBase = positions.length / 3;
      sectionVertexBases.push(vertexBase);

      for (const sample of HYDROLOGY_RIVER_CROSS_SECTION) {
        const halfWidth = point.widthMeters * 0.5;
        const sideScale = sample.across < 0
          ? point.leftBankScale
          : sample.across > 0
            ? point.rightBankScale
            : 1;
        const edgeWeight = Math.pow(Math.abs(sample.across), 1.35);
        const lateral = sample.across * halfWidth * (1 + (sideScale - 1) * edgeWeight);
        const color = resolveCrossSectionColor(sample.band, point.flowFactor);

        positions.push(
          point.x + frame.normalX * lateral,
          pointY,
          point.z + frame.normalZ * lateral,
        );
        normals.push(0, 1, 0);
        uvs.push((sample.across + 1) * 0.5, point.distanceMeters / HYDROLOGY_RIVER_UV_FLOW_REPEAT_METERS);
        pushColor(colors, color, sample.alpha);
        flowDirs.push(frame.tangentX, frame.tangentZ);
        foamMasks.push(0);
      }
    }

    for (let index = 0; index < points.length - 1; index++) {
      if (segmentCount >= MAX_HYDROLOGY_RIVER_SEGMENTS) break;
      const start = points[index];
      const end = points[index + 1];
      const startBase = sectionVertexBases[index];
      const endBase = sectionVertexBases[index + 1];
      if (!start || !end || startBase === undefined || endBase === undefined) continue;

      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length < HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS) continue;

      const flowX = dx / length;
      const flowZ = dz / length;
      const startY = start.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
      const endY = end.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
      const flowFactor = (start.flowFactor + end.flowFactor) * 0.5;

      const narrownessFoam = clamp(
        (HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD - flowFactor) / HYDROLOGY_RIVER_FOAM_NARROW_THRESHOLD,
        0,
        1,
      );
      const slope = Math.max(0, startY - endY) / length;
      const slopeFoam = clamp(slope / HYDROLOGY_RIVER_FOAM_SLOPE_M_PER_M, 0, 1);
      const centerFoam = clamp(
        narrownessFoam * HYDROLOGY_RIVER_FOAM_NARROW_WEIGHT +
          slopeFoam * HYDROLOGY_RIVER_FOAM_SLOPE_WEIGHT,
        0,
        1,
      );
      for (let band = 0; band < HYDROLOGY_RIVER_CROSS_SECTION.length - 1; band++) {
        const a = startBase + band;
        const b = endBase + band;
        const c = startBase + band + 1;
        const d = endBase + band + 1;
        indices.push(a, b, c, b, d, c);
      }
      for (let band = 0; band < HYDROLOGY_RIVER_CROSS_SECTION.length; band++) {
        const sample = HYDROLOGY_RIVER_CROSS_SECTION[band];
        if (!sample) continue;
        const foam = Math.max(centerFoam * sample.foamScale, centerFoam * HYDROLOGY_RIVER_FOAM_BANK_FLOOR_FRACTION);
        foamMasks[startBase + band] = Math.max(foamMasks[startBase + band] ?? 0, foam);
        foamMasks[endBase + band] = Math.max(foamMasks[endBase + band] ?? 0, foam);
      }

      segmentCount++;
      totalLengthMeters += length;
      const flowSpeedMetersPerSecond =
        HYDROLOGY_RIVER_GAMEPLAY_FLOW_MIN_M_PER_S
        + (HYDROLOGY_RIVER_GAMEPLAY_FLOW_MAX_M_PER_S - HYDROLOGY_RIVER_GAMEPLAY_FLOW_MIN_M_PER_S) * flowFactor;
      querySegments.push({
        startX: start.x, startZ: start.z,
        endX: end.x, endZ: end.z,
        startSurfaceY: startY, endSurfaceY: endY,
        halfWidth: Math.max(start.widthMeters, end.widthMeters) * 0.5,
        flowX,
        flowZ,
        flowSpeedMetersPerSecond,
      });
    }
    renderedChannelCount++;
    if (segmentCount >= MAX_HYDROLOGY_RIVER_SEGMENTS) break;
  }

  if (segmentCount === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  // Flow-visuals attributes consumed by `installHydrologyRiverFlowPatch`
  // on the binding layer. Per-vertex world-XZ flow direction + foam mask
  // baked here so the GPU does not recompute the segment derivative each
  // frame.
  geometry.setAttribute('aFlowDir', new THREE.Float32BufferAttribute(flowDirs, 2));
  geometry.setAttribute('aFoamMask', new THREE.Float32BufferAttribute(foamMasks, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  return {
    geometry,
    querySegments,
    stats: {
      channelCount: renderedChannelCount,
      segmentCount,
      vertexCount: positions.length / 3,
      totalLengthMeters,
      maxAccumulationCells,
    },
  };
}

function buildRiverRenderPoints(
  channel: HydrologyChannelPolyline,
  artifact: HydrologyBakeArtifact,
  peakAccumulationCells: number,
): RiverRenderPoint[] {
  const source = smoothHydrologyRiverPath(channel.points);
  const points: RiverRenderPoint[] = [];
  let distanceMeters = 0;

  for (let index = 0; index < source.length; index++) {
    const point = source[index];
    if (!point) continue;
    if (index > 0) {
      const previous = source[index - 1];
      if (previous) distanceMeters += Math.hypot(point.x - previous.x, point.z - previous.z);
    }

    const flowFactor = resolveHydrologyAccumulationFactor(
      point.accumulationCells,
      artifact,
      peakAccumulationCells,
    );
    const widthMeters = resolveHydrologyRiverWidthMeters(point.accumulationCells, artifact, peakAccumulationCells);
    points.push({
      ...point,
      distanceMeters,
      widthMeters,
      flowFactor,
      leftBankScale: resolveBankScale(point, channel.headCell, -1),
      rightBankScale: resolveBankScale(point, channel.outletCell, 1),
    });
  }
  return points;
}

function resolveSectionFrame(points: readonly RiverRenderPoint[], index: number): {
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
} {
  const point = points[index];
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  if (!point || !previous || !next) {
    return { tangentX: 1, tangentZ: 0, normalX: 0, normalZ: 1 };
  }

  let dx = next.x - previous.x;
  let dz = next.z - previous.z;
  let length = Math.hypot(dx, dz);
  if (length < 0.001 && index > 0) {
    dx = point.x - (points[index - 1]?.x ?? point.x);
    dz = point.z - (points[index - 1]?.z ?? point.z);
    length = Math.hypot(dx, dz);
  }
  if (length < 0.001) return { tangentX: 1, tangentZ: 0, normalX: 0, normalZ: 1 };

  const tangentX = dx / length;
  const tangentZ = dz / length;
  return {
    tangentX,
    tangentZ,
    normalX: -tangentZ,
    normalZ: tangentX,
  };
}

function resolveCrossSectionColor(band: RiverCrossSectionBand, flowFactor: number): THREE.Color {
  switch (band) {
    case 'edge':
      return HYDROLOGY_RIVER_BANK_COLOR.clone().lerp(HYDROLOGY_RIVER_SHALLOW_COLOR, 0.08 + flowFactor * 0.1);
    case 'bank':
      return HYDROLOGY_RIVER_BANK_COLOR.clone().lerp(HYDROLOGY_RIVER_SHALLOW_COLOR, 0.22 + flowFactor * 0.14);
    case 'shallow':
      return HYDROLOGY_RIVER_SHALLOW_COLOR.clone().lerp(HYDROLOGY_RIVER_DEEP_COLOR, 0.25 + flowFactor * 0.2);
    case 'deep':
      return HYDROLOGY_RIVER_SHALLOW_COLOR.clone().lerp(HYDROLOGY_RIVER_DEEP_COLOR, 0.56 + flowFactor * 0.34);
  }
}

function resolveBankScale(point: HydrologyPolylinePoint, salt: number, side: -1 | 1): number {
  const phase = salt * 0.017 + side * 1.913;
  const broad = Math.sin(point.x * 0.021 + point.z * 0.014 + phase);
  const fine = Math.sin(point.x * 0.006 - point.z * 0.011 + phase * 1.7);
  const blend = clamp(broad * 0.65 + fine * 0.35, -1, 1);
  return 1 + blend * HYDROLOGY_RIVER_BANK_JITTER_FRACTION;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pushColor(colors: number[], color: THREE.Color, alpha: number): void {
  colors.push(color.r, color.g, color.b, alpha);
}
