// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { TerrainExclusionZone, TerrainStampConfig } from '../TerrainFeatureTypes';
import type { HydrologyBakeArtifact, HydrologyPolylinePoint } from './HydrologyBake';
import {
  resolveHydrologyPeakAccumulationCells,
  resolveHydrologyRiverWidthMeters,
} from './HydrologyRiverMetrics';
import { smoothHydrologyRiverPath } from './HydrologyRiverPath';

interface HydrologyTerrainFeatureResult {
  stamps: TerrainStampConfig[];
  vegetationExclusionZones: TerrainExclusionZone[];
}

export const HYDROLOGY_TERRAIN_PRIORITY = 40;
const HYDROLOGY_STAMP_SEGMENT_STEP = 4;
const HYDROLOGY_MIN_STAMP_LENGTH_METERS = 4;
const HYDROLOGY_CHANNEL_DEPTH_WIDTH_SCALE = 0.025;
const HYDROLOGY_CHANNEL_INNER_RADIUS_SCALE = 0.5;
const HYDROLOGY_CHANNEL_OUTER_RADIUS_SCALE = 0.68;
const HYDROLOGY_CHANNEL_GRADE_RADIUS_SCALE = 1.08;
const HYDROLOGY_VEGETATION_CLEAR_RADIUS_SCALE = 1.12;
const HYDROLOGY_VEGETATION_CLEAR_OVERHANG_PADDING_METERS = 14;
const HYDROLOGY_VEGETATION_CLEAR_MIN_RADIUS_METERS = 24;
const HYDROLOGY_VEGETATION_CLEAR_MAX_RADIUS_METERS = 220;
const HYDROLOGY_VEGETATION_CLEAR_SPACING_RADIUS_SCALE = 0.62;
const HYDROLOGY_VEGETATION_CLEAR_MIN_SPACING_METERS = 18;
const HYDROLOGY_VEGETATION_CLEAR_MAX_SPACING_METERS = 96;

export function compileHydrologyTerrainFeatures(
  artifact: HydrologyBakeArtifact | null,
): HydrologyTerrainFeatureResult {
  if (!artifact || artifact.channelPolylines.length === 0) {
    return { stamps: [], vegetationExclusionZones: [] };
  }

  const peakAccumulationCells = resolveHydrologyPeakAccumulationCells(artifact);
  const stamps: TerrainStampConfig[] = [];
  const vegetationExclusionZones: TerrainExclusionZone[] = [];

  artifact.channelPolylines.forEach((channel, channelIndex) => {
    const points = smoothHydrologyRiverPath(channel.points);
    if (points.length < 2) return;

    for (let index = 0; index < points.length - 1; index += HYDROLOGY_STAMP_SEGMENT_STEP) {
      const start = points[index];
      const end = points[Math.min(points.length - 1, index + HYDROLOGY_STAMP_SEGMENT_STEP)];
      if (!start || !end) continue;
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length < HYDROLOGY_MIN_STAMP_LENGTH_METERS) continue;

      const width = resolveAverageWidth(start, end, artifact, peakAccumulationCells);
      const bedDepth = clamp(width * HYDROLOGY_CHANNEL_DEPTH_WIDTH_SCALE, 0.75, 2.4);
      const bedHeight = ((start.elevationMeters + end.elevationMeters) * 0.5) - bedDepth;
      stamps.push({
        kind: 'flatten_capsule',
        startX: start.x,
        startZ: start.z,
        endX: end.x,
        endZ: end.z,
        innerRadius: width * HYDROLOGY_CHANNEL_INNER_RADIUS_SCALE,
        outerRadius: width * HYDROLOGY_CHANNEL_OUTER_RADIUS_SCALE,
        gradeRadius: width * HYDROLOGY_CHANNEL_GRADE_RADIUS_SCALE,
        gradeStrength: 0.78,
        samplingRadius: width * 0.42,
        targetHeightMode: 'center',
        fixedTargetHeight: bedHeight,
        heightOffset: 0,
        priority: HYDROLOGY_TERRAIN_PRIORITY,
        // Hydrology bed cedes its target height to a higher-priority overlapping
        // stamp (airfield envelope, motor-pool flatten) when present; otherwise
        // the baked `bedHeight` wins. R2.2 flips the strategy to
        // `sample_post_compose` so the compositor's Pass C feedback loop
        // re-anchors river-surface elevations against the composed provider
        // (memo §"Why this fixes both bugs"); navmesh + heightmap-bake
        // consumers still see the original bedHeight in the input artifact.
        obstructionPolicy: 'consult',
        targetHeightStrategy: 'sample_post_compose',
      });

      appendVegetationExclusionChain(
        vegetationExclusionZones,
        start,
        end,
        resolveVegetationClearRadius(width),
        `hydrology-river-${channelIndex}`,
      );
    }
  });

  return { stamps, vegetationExclusionZones };
}

function appendVegetationExclusionChain(
  zones: TerrainExclusionZone[],
  start: HydrologyPolylinePoint,
  end: HydrologyPolylinePoint,
  radius: number,
  sourceId: string,
): void {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  if (length <= 0) return;

  const spacing = clamp(
    radius * HYDROLOGY_VEGETATION_CLEAR_SPACING_RADIUS_SCALE,
    HYDROLOGY_VEGETATION_CLEAR_MIN_SPACING_METERS,
    HYDROLOGY_VEGETATION_CLEAR_MAX_SPACING_METERS,
  );
  const steps = Math.max(1, Math.ceil(length / spacing));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    pushVegetationExclusionZone(zones, {
      x: lerp(start.x, end.x, t),
      z: lerp(start.z, end.z, t),
      radius,
      sourceId,
    });
  }
}

function pushVegetationExclusionZone(
  zones: TerrainExclusionZone[],
  zone: TerrainExclusionZone,
): void {
  const previous = zones[zones.length - 1];
  if (
    previous
    && previous.sourceId === zone.sourceId
    && Math.hypot(previous.x - zone.x, previous.z - zone.z) < 0.25
  ) {
    previous.radius = Math.max(previous.radius, zone.radius);
    return;
  }
  zones.push(zone);
}

function resolveVegetationClearRadius(width: number): number {
  return clamp(
    width * HYDROLOGY_VEGETATION_CLEAR_RADIUS_SCALE + HYDROLOGY_VEGETATION_CLEAR_OVERHANG_PADDING_METERS,
    HYDROLOGY_VEGETATION_CLEAR_MIN_RADIUS_METERS,
    HYDROLOGY_VEGETATION_CLEAR_MAX_RADIUS_METERS,
  );
}

function resolveAverageWidth(
  start: HydrologyPolylinePoint,
  end: HydrologyPolylinePoint,
  artifact: HydrologyBakeArtifact,
  peakAccumulationCells: number,
): number {
  return (
    resolveHydrologyRiverWidthMeters(start.accumulationCells, artifact, peakAccumulationCells)
    + resolveHydrologyRiverWidthMeters(end.accumulationCells, artifact, peakAccumulationCells)
  ) * 0.5;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
