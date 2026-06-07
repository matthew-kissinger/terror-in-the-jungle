// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { WaterBodyConfig, WaterBodyPointConfig } from '../../../config/gameModeTypes';
import type {
  CompiledTerrainFeatureSet,
  TerrainExclusionZone,
  TerrainStampConfig,
} from '../../terrain/TerrainFeatureTypes';

export interface WaterBodyQuerySegment {
  waterBodyId: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  startSurfaceY: number;
  endSurfaceY: number;
  startDepthMeters: number;
  endDepthMeters: number;
  startBedY: number;
  endBedY: number;
  halfWidth: number;
  flowX: number;
  flowZ: number;
  flowSpeedMetersPerSecond: number;
}

export interface WaterBodyStats {
  bodyCount: number;
  segmentCount: number;
  totalLengthMeters: number;
  minSurfaceY: number | null;
  maxSurfaceY: number | null;
  minDepthMeters: number | null;
  maxDepthMeters: number | null;
}

const DEFAULT_WATER_BODY_DEPTH_METERS = 2.4;
const DEFAULT_WATER_BODY_FLOW_SPEED_METERS_PER_SECOND = 0.22;
const DEFAULT_WATER_BODY_PRIORITY = 130;
const WATER_BODY_OUTER_RADIUS_EXTRA_METERS = 6;
const WATER_BODY_MIN_BANK_GRADE_METERS = 24;
const WATER_BODY_MAX_BANK_GRADE_METERS = 96;

const EMPTY_COMPILED_FEATURES: CompiledTerrainFeatureSet = {
  stamps: [],
  surfacePatches: [],
  vegetationExclusionZones: [],
  flowPaths: [],
};

export const EMPTY_WATER_BODY_STATS: WaterBodyStats = {
  bodyCount: 0,
  segmentCount: 0,
  totalLengthMeters: 0,
  minSurfaceY: null,
  maxSurfaceY: null,
  minDepthMeters: null,
  maxDepthMeters: null,
};

export class WaterBodyAuthority {
  private segments: WaterBodyQuerySegment[] = [];
  private stats: WaterBodyStats = { ...EMPTY_WATER_BODY_STATS };

  setBodies(configs: readonly WaterBodyConfig[] | null | undefined): void {
    this.segments = compileWaterBodyQuerySegments(configs);
    this.stats = computeWaterBodyStats(configs ?? [], this.segments);
  }

  clear(): void {
    this.segments = [];
    this.stats = { ...EMPTY_WATER_BODY_STATS };
  }

  isActive(): boolean {
    return this.segments.length > 0;
  }

  getQuerySegments(): readonly WaterBodyQuerySegment[] {
    return this.segments;
  }

  getStats(): WaterBodyStats {
    return this.stats;
  }
}

export function compileWaterBodyTerrainFeatures(
  configs: readonly WaterBodyConfig[] | null | undefined,
): CompiledTerrainFeatureSet {
  if (!configs || configs.length === 0) {
    return { ...EMPTY_COMPILED_FEATURES, stamps: [], vegetationExclusionZones: [] };
  }

  const stamps: TerrainStampConfig[] = [];
  const vegetationExclusionZones: TerrainExclusionZone[] = [];
  for (const segment of compileWaterBodyQuerySegments(configs)) {
    const bankGrade = resolveBankGradeMeters(findBody(configs, segment.waterBodyId));
    const halfWidth = segment.halfWidth;
    stamps.push({
      kind: 'flatten_capsule',
      startX: segment.startX,
      startZ: segment.startZ,
      endX: segment.endX,
      endZ: segment.endZ,
      innerRadius: halfWidth,
      outerRadius: halfWidth + WATER_BODY_OUTER_RADIUS_EXTRA_METERS,
      gradeRadius: halfWidth + bankGrade,
      gradeStrength: 0.7,
      samplingRadius: halfWidth,
      targetHeightMode: 'center',
      fixedTargetHeight: (segment.startBedY + segment.endBedY) * 0.5,
      heightOffset: 0,
      priority: findBody(configs, segment.waterBodyId)?.priority ?? DEFAULT_WATER_BODY_PRIORITY,
      obstructionPolicy: 'override',
      targetHeightStrategy: 'baked',
    });

    appendVegetationExclusions(
      vegetationExclusionZones,
      segment,
      resolveVegetationClearRadiusMeters(findBody(configs, segment.waterBodyId), halfWidth, bankGrade),
    );
  }

  return {
    stamps,
    surfacePatches: [],
    vegetationExclusionZones,
    flowPaths: [],
  };
}

export function compileWaterBodyQuerySegments(
  configs: readonly WaterBodyConfig[] | null | undefined,
): WaterBodyQuerySegment[] {
  if (!configs) return [];

  const segments: WaterBodyQuerySegment[] = [];
  for (const body of configs) {
    if (body.kind !== 'reach' || body.points.length < 2) continue;
    const halfWidth = Math.max(1, body.widthMeters * 0.5);
    for (let index = 0; index < body.points.length - 1; index++) {
      const start = body.points[index];
      const end = body.points[index + 1];
      if (!start || !end) continue;
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;

      const startDepth = resolvePointDepth(body, start, index);
      const endDepth = resolvePointDepth(body, end, index + 1);
      segments.push({
        waterBodyId: body.id,
        startX: start.x,
        startZ: start.z,
        endX: end.x,
        endZ: end.z,
        startSurfaceY: body.surfaceY,
        endSurfaceY: body.surfaceY,
        startDepthMeters: startDepth,
        endDepthMeters: endDepth,
        startBedY: body.surfaceY - startDepth,
        endBedY: body.surfaceY - endDepth,
        halfWidth,
        flowX: dx / length,
        flowZ: dz / length,
        flowSpeedMetersPerSecond: Math.max(
          0,
          body.flowSpeedMetersPerSecond ?? DEFAULT_WATER_BODY_FLOW_SPEED_METERS_PER_SECOND,
        ),
      });
    }
  }
  return segments;
}

function resolvePointDepth(
  body: WaterBodyConfig,
  point: WaterBodyPointConfig,
  pointIndex: number,
): number {
  if (Number.isFinite(point.depthMeters)) {
    return Math.max(0.2, point.depthMeters ?? DEFAULT_WATER_BODY_DEPTH_METERS);
  }
  if (Number.isFinite(body.depthMinMeters) && Number.isFinite(body.depthMaxMeters) && body.points.length > 1) {
    const t = pointIndex / Math.max(1, body.points.length - 1);
    return Math.max(0.2, lerp(body.depthMinMeters!, body.depthMaxMeters!, t));
  }
  return Math.max(0.2, body.depthMeters ?? DEFAULT_WATER_BODY_DEPTH_METERS);
}

function resolveBankGradeMeters(body: WaterBodyConfig | undefined): number {
  if (body && Number.isFinite(body.bankGradeMeters)) {
    return Math.max(WATER_BODY_OUTER_RADIUS_EXTRA_METERS, body.bankGradeMeters ?? WATER_BODY_MIN_BANK_GRADE_METERS);
  }
  const width = body?.widthMeters ?? WATER_BODY_MIN_BANK_GRADE_METERS;
  return clamp(width * 0.55, WATER_BODY_MIN_BANK_GRADE_METERS, WATER_BODY_MAX_BANK_GRADE_METERS);
}

function resolveVegetationClearRadiusMeters(
  body: WaterBodyConfig | undefined,
  halfWidth: number,
  bankGrade: number,
): number {
  if (body && Number.isFinite(body.vegetationClearRadiusMeters)) {
    return Math.max(halfWidth, body.vegetationClearRadiusMeters ?? halfWidth);
  }
  return halfWidth + bankGrade + 8;
}

function appendVegetationExclusions(
  zones: TerrainExclusionZone[],
  segment: WaterBodyQuerySegment,
  radius: number,
): void {
  const length = Math.hypot(segment.endX - segment.startX, segment.endZ - segment.startZ);
  if (length <= 0) return;
  const spacing = clamp(radius * 0.7, 18, 96);
  const steps = Math.max(1, Math.ceil(length / spacing));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    zones.push({
      x: lerp(segment.startX, segment.endX, t),
      z: lerp(segment.startZ, segment.endZ, t),
      radius,
      sourceId: `water-body-${segment.waterBodyId}`,
    });
  }
}

function computeWaterBodyStats(
  configs: readonly WaterBodyConfig[],
  segments: readonly WaterBodyQuerySegment[],
): WaterBodyStats {
  if (configs.length === 0 || segments.length === 0) {
    return { ...EMPTY_WATER_BODY_STATS };
  }
  let totalLengthMeters = 0;
  let minSurfaceY = Infinity;
  let maxSurfaceY = -Infinity;
  let minDepthMeters = Infinity;
  let maxDepthMeters = -Infinity;

  for (const segment of segments) {
    totalLengthMeters += Math.hypot(segment.endX - segment.startX, segment.endZ - segment.startZ);
    minSurfaceY = Math.min(minSurfaceY, segment.startSurfaceY, segment.endSurfaceY);
    maxSurfaceY = Math.max(maxSurfaceY, segment.startSurfaceY, segment.endSurfaceY);
    minDepthMeters = Math.min(minDepthMeters, segment.startDepthMeters, segment.endDepthMeters);
    maxDepthMeters = Math.max(maxDepthMeters, segment.startDepthMeters, segment.endDepthMeters);
  }

  return {
    bodyCount: configs.length,
    segmentCount: segments.length,
    totalLengthMeters,
    minSurfaceY,
    maxSurfaceY,
    minDepthMeters,
    maxDepthMeters,
  };
}

function findBody(configs: readonly WaterBodyConfig[], id: string): WaterBodyConfig | undefined {
  return configs.find((body) => body.id === id);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
