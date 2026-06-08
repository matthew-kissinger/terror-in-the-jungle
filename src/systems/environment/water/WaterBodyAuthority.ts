// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type {
  WaterBodyBasinConfig,
  WaterBodyConfig,
  WaterBodyPointConfig,
  WaterBodyReachConfig,
} from '../../../config/gameModeTypes';
import type {
  CompiledTerrainFeatureSet,
  TerrainExclusionZone,
  TerrainStampConfig,
} from '../../terrain/TerrainFeatureTypes';

export interface WaterBodyQuerySegment {
  shape: 'reach' | 'basin';
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
  priority: number;
  flowX: number;
  flowZ: number;
  flowSpeedMetersPerSecond: number;
  centerX?: number;
  centerZ?: number;
  radiusXMeters?: number;
  radiusZMeters?: number;
  rotationRadians?: number;
  shorelineSeed?: number;
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
    const body = findBody(configs, segment.waterBodyId);
    const bankGrade = resolveBankGradeMeters(body);
    const halfWidth = segment.halfWidth;
    const fixedTargetHeight = (segment.startBedY + segment.endBedY) * 0.5;
    const priority = body?.priority ?? DEFAULT_WATER_BODY_PRIORITY;

    if (segment.shape === 'basin') {
      const length = Math.hypot(segment.endX - segment.startX, segment.endZ - segment.startZ);
      if (length <= 1) {
        stamps.push({
          kind: 'flatten_circle',
          centerX: segment.centerX ?? (segment.startX + segment.endX) * 0.5,
          centerZ: segment.centerZ ?? (segment.startZ + segment.endZ) * 0.5,
          innerRadius: halfWidth,
          outerRadius: halfWidth + WATER_BODY_OUTER_RADIUS_EXTRA_METERS,
          gradeRadius: halfWidth + bankGrade,
          gradeStrength: 0.7,
          samplingRadius: halfWidth,
          targetHeightMode: 'center',
          fixedTargetHeight,
          heightOffset: 0,
          priority,
          obstructionPolicy: 'override',
          targetHeightStrategy: 'baked',
        });
      } else {
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
          fixedTargetHeight,
          heightOffset: 0,
          priority,
          obstructionPolicy: 'override',
          targetHeightStrategy: 'baked',
        });
      }
    } else {
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
        fixedTargetHeight,
        heightOffset: 0,
        priority,
        obstructionPolicy: 'override',
        targetHeightStrategy: 'baked',
      });
    }

    appendVegetationExclusions(
      vegetationExclusionZones,
      segment,
      resolveVegetationClearRadiusMeters(body, halfWidth, bankGrade),
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
    if (body.kind === 'basin') {
      const basin = compileBasinQuerySegment(body);
      if (basin) segments.push(basin);
      continue;
    }
    if (body.points.length < 2) continue;
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
        shape: 'reach',
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
        priority: body.priority ?? DEFAULT_WATER_BODY_PRIORITY,
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

function compileBasinQuerySegment(body: WaterBodyBasinConfig): WaterBodyQuerySegment | null {
  const radiusX = Math.max(1, body.radiusXMeters);
  const radiusZ = Math.max(1, body.radiusZMeters);
  const rotation = Number.isFinite(body.rotationRadians) ? body.rotationRadians ?? 0 : 0;
  const majorRadius = Math.max(radiusX, radiusZ);
  const minorRadius = Math.min(radiusX, radiusZ);
  const majorAxisRotation = radiusX >= radiusZ ? rotation : rotation + Math.PI * 0.5;
  const halfLine = Math.max(0, majorRadius - minorRadius);
  const axisX = Math.cos(majorAxisRotation);
  const axisZ = Math.sin(majorAxisRotation);
  const depth = resolveBasinDepth(body);
  const flowDirection = normalizeFlowDirection(
    body.flowDirection?.x,
    body.flowDirection?.z,
    axisX,
    axisZ,
  );

  return {
    shape: 'basin',
    waterBodyId: body.id,
    startX: body.center.x - axisX * halfLine,
    startZ: body.center.z - axisZ * halfLine,
    endX: body.center.x + axisX * halfLine,
    endZ: body.center.z + axisZ * halfLine,
    startSurfaceY: body.surfaceY,
    endSurfaceY: body.surfaceY,
    startDepthMeters: resolveBasinMinDepth(body, depth),
    endDepthMeters: depth,
    startBedY: body.surfaceY - depth,
    endBedY: body.surfaceY - depth,
    halfWidth: minorRadius,
    priority: body.priority ?? DEFAULT_WATER_BODY_PRIORITY,
    flowX: flowDirection.x,
    flowZ: flowDirection.z,
    flowSpeedMetersPerSecond: Math.max(
      0,
      body.flowSpeedMetersPerSecond ?? DEFAULT_WATER_BODY_FLOW_SPEED_METERS_PER_SECOND,
    ),
    centerX: body.center.x,
    centerZ: body.center.z,
    radiusXMeters: radiusX,
    radiusZMeters: radiusZ,
    rotationRadians: rotation,
    shorelineSeed: body.shorelineSeed,
  };
}

function resolvePointDepth(
  body: WaterBodyReachConfig,
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

function resolveBasinDepth(body: WaterBodyBasinConfig): number {
  if (Number.isFinite(body.depthMaxMeters)) {
    return Math.max(0.2, body.depthMaxMeters ?? DEFAULT_WATER_BODY_DEPTH_METERS);
  }
  return Math.max(0.2, body.depthMeters ?? DEFAULT_WATER_BODY_DEPTH_METERS);
}

function resolveBasinMinDepth(body: WaterBodyBasinConfig, resolvedDepth: number): number {
  if (Number.isFinite(body.depthMinMeters)) {
    return Math.max(0.2, Math.min(resolvedDepth, body.depthMinMeters ?? resolvedDepth));
  }
  return Math.max(0.2, Math.min(resolvedDepth, resolvedDepth * 0.38));
}

function resolveBankGradeMeters(body: WaterBodyConfig | undefined): number {
  if (body && Number.isFinite(body.bankGradeMeters)) {
    return Math.max(WATER_BODY_OUTER_RADIUS_EXTRA_METERS, body.bankGradeMeters ?? WATER_BODY_MIN_BANK_GRADE_METERS);
  }
  const width = resolveBodyFootprintWidthMeters(body);
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

function resolveBodyFootprintWidthMeters(body: WaterBodyConfig | undefined): number {
  if (!body) return WATER_BODY_MIN_BANK_GRADE_METERS;
  if (body.kind === 'reach') return body.widthMeters;
  return Math.min(body.radiusXMeters, body.radiusZMeters) * 2;
}

function normalizeFlowDirection(
  x: number | undefined,
  z: number | undefined,
  fallbackX: number,
  fallbackZ: number,
): { x: number; z: number } {
  const candidateX = Number.isFinite(x) ? x ?? 0 : 0;
  const candidateZ = Number.isFinite(z) ? z ?? 0 : 0;
  const candidateLength = Math.hypot(candidateX, candidateZ);
  if (candidateLength > 0.0001) {
    return { x: candidateX / candidateLength, z: candidateZ / candidateLength };
  }
  const fallbackLength = Math.hypot(fallbackX, fallbackZ);
  if (fallbackLength > 0.0001) {
    return { x: fallbackX / fallbackLength, z: fallbackZ / fallbackLength };
  }
  return { x: 1, z: 0 };
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
    totalLengthMeters += measureWaterBodyFootprintLength(segment);
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

function measureWaterBodyFootprintLength(segment: WaterBodyQuerySegment): number {
  if (
    segment.shape === 'basin'
    && Number.isFinite(segment.radiusXMeters)
    && Number.isFinite(segment.radiusZMeters)
  ) {
    const a = Math.max(segment.radiusXMeters ?? 0, segment.radiusZMeters ?? 0);
    const b = Math.min(segment.radiusXMeters ?? 0, segment.radiusZMeters ?? 0);
    if (a <= 0 || b <= 0) return 0;
    const h = ((a - b) ** 2) / ((a + b) ** 2);
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  }
  return Math.hypot(segment.endX - segment.startX, segment.endZ - segment.startZ);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
