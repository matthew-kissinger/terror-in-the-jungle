// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type {
  GameModeConfig,
  TerrainFlowPolicyConfig,
  ZoneConfig,
} from '../../config/gameModeTypes';
import { StrategicRoutePlanner } from '../strategy/StrategicRoutePlanner';
import type {
  TerrainFlowPath,
  TerrainStampConfig,
  TerrainSurfacePatch,
} from './TerrainFeatureTypes';

const DEFAULT_ROUTE_WIDTH = 18;
const DEFAULT_ROUTE_BLEND = 7;
const DEFAULT_ROUTE_SPACING = 18;
const DEFAULT_ROUTE_PRIORITY = 56;
const DEFAULT_ROUTE_TERRAIN_WIDTH_SCALE = 0.44;
const DEFAULT_ROUTE_GRADE_STRENGTH = 0.08;
const DEFAULT_ZONE_SHOULDER_PADDING = 12;
const DEFAULT_ZONE_SHOULDER_BLEND = 18;
const DEFAULT_ZONE_SHOULDER_GRADE_STRENGTH = 0.16;
const DEFAULT_ZONE_SHOULDER_TARGET_HEIGHT_MODE = 'average';
const DEFAULT_HOME_BASE_SHOULDER_TARGET_HEIGHT_MODE = 'max';
const DEFAULT_MAX_ROUTES_PER_ANCHOR = 3;
const OBJECTIVE_NEIGHBOR_LINKS = 2;
const OBJECTIVE_ROUTE_ENDPOINT_RADIUS_SCALE = 0.88;

// Slope-guard defaults. When `slopeGuardDegrees` is unset in policy, the guard
// is treated as fully-off (effectively +Infinity) so that the legacy single-
// path behavior is preserved byte-identical for any config that hasn't opted
// in. Slope sample step is fixed for deterministic 4-tap differentials.
const SLOPE_SAMPLE_STEP_M = 4;

interface TerrainFlowCompileResult {
  stamps: TerrainStampConfig[];
  surfacePatches: TerrainSurfacePatch[];
  flowPaths: TerrainFlowPath[];
}

interface RoutePair {
  from: ZoneConfig;
  to: ZoneConfig;
}

export function compileTerrainFlow(
  config: GameModeConfig,
  getTerrainHeight?: ((x: number, z: number) => number) | null,
): TerrainFlowCompileResult {
  const policy = config.terrainFlow;
  if (!policy?.enabled || !getTerrainHeight) {
    return emptyResult();
  }

  const zones = config.zones ?? [];
  if (zones.length === 0) {
    return emptyResult();
  }

  const result = emptyResult();
  const planner = new StrategicRoutePlanner(
    {
      worldSize: config.worldSize,
      zones,
      features: config.features,
    },
    getTerrainHeight,
  );

  appendZoneShoulders(result.stamps, zones, policy);

  const routePairs = buildRoutePairs(zones, policy);
  for (const pair of routePairs) {
    const route = planner.findRoute(
      pair.from.position.x,
      pair.from.position.z,
      pair.to.position.x,
      pair.to.position.z,
      pair.to.id,
    );

    appendRouteFlow(result, pair, route, policy, getTerrainHeight);
  }

  return result;
}

function emptyResult(): TerrainFlowCompileResult {
  return {
    stamps: [],
    surfacePatches: [],
    flowPaths: [],
  };
}

function appendZoneShoulders(
  stamps: TerrainStampConfig[],
  zones: ReadonlyArray<ZoneConfig>,
  policy: TerrainFlowPolicyConfig,
): void {
  const shoulderPadding = policy.zoneShoulderPadding ?? DEFAULT_ZONE_SHOULDER_PADDING;
  const shoulderBlend = policy.zoneShoulderBlend ?? DEFAULT_ZONE_SHOULDER_BLEND;
  const gradeStrength = policy.zoneShoulderGradeStrength ?? DEFAULT_ZONE_SHOULDER_GRADE_STRENGTH;
  const routePriority = policy.routePriority ?? DEFAULT_ROUTE_PRIORITY;
  const shoulderPriority = Math.max(1, routePriority - 6);
  if (shoulderPadding <= 0) {
    return;
  }

  for (const zone of zones) {
    const innerRadius = zone.radius + shoulderPadding * (zone.isHomeBase ? 0.9 : 0.65);
    const outerRadius = zone.radius + shoulderPadding;
    const gradeRadius = outerRadius + shoulderBlend * (zone.isHomeBase ? 1.4 : 1.15);
    stamps.push({
      kind: 'flatten_circle',
      centerX: zone.position.x,
      centerZ: zone.position.z,
      innerRadius,
      outerRadius,
      gradeRadius,
      gradeStrength,
      samplingRadius: Math.max(zone.radius, innerRadius * 0.7),
      targetHeightMode: zone.isHomeBase
        ? (policy.homeBaseShoulderTargetHeightMode ?? DEFAULT_HOME_BASE_SHOULDER_TARGET_HEIGHT_MODE)
        : (policy.zoneShoulderTargetHeightMode ?? DEFAULT_ZONE_SHOULDER_TARGET_HEIGHT_MODE),
      heightOffset: 0,
      priority: shoulderPriority,
      // Zone shoulders own the pad they grade; R2.1's resolver treats them as
      // hard-override against overlapping hydrology / route stamps so the
      // capture circle stays on its authored datum.
      obstructionPolicy: 'override',
      targetHeightStrategy: 'baked',
    });
  }
}

function buildRoutePairs(
  zones: ReadonlyArray<ZoneConfig>,
  policy: TerrainFlowPolicyConfig,
): RoutePair[] {
  const result: RoutePair[] = [];
  const seen = new Set<string>();
  const homeBases = zones.filter((zone) => zone.isHomeBase);
  const objectives = zones.filter((zone) => !zone.isHomeBase);
  const maxRoutesPerAnchor = Math.max(1, policy.maxRoutesPerAnchor ?? DEFAULT_MAX_ROUTES_PER_ANCHOR);

  for (const home of homeBases) {
    const nearestObjectives = objectives
      .slice()
      .sort((a, b) => distanceSq(home.position, a.position) - distanceSq(home.position, b.position))
      .slice(0, maxRoutesPerAnchor);
    for (const objective of nearestObjectives) {
      pushRoutePair(result, seen, home, objective);
    }
  }

  if (policy.connectObjectivePairs) {
    for (const objective of objectives) {
      const nearestObjectives = objectives
        .filter((candidate) => candidate.id !== objective.id)
        .sort((a, b) => distanceSq(objective.position, a.position) - distanceSq(objective.position, b.position))
        .slice(0, OBJECTIVE_NEIGHBOR_LINKS);
      for (const neighbor of nearestObjectives) {
        pushRoutePair(result, seen, objective, neighbor);
      }
    }
  }

  return result;
}

function pushRoutePair(
  pairs: RoutePair[],
  seen: Set<string>,
  from: ZoneConfig,
  to: ZoneConfig,
): void {
  const key = from.id < to.id ? `${from.id}:${to.id}` : `${to.id}:${from.id}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  pairs.push({ from, to });
}

function appendRouteFlow(
  result: TerrainFlowCompileResult,
  pair: RoutePair,
  route: Array<{ x: number; z: number }>,
  policy: TerrainFlowPolicyConfig,
  getTerrainHeight: (x: number, z: number) => number,
): void {
  const points = sanitizeRoutePoints(pair.from, pair.to, route, policy);
  if (points.length < 2) {
    return;
  }

  const routeWidth = Math.max(8, policy.routeWidth ?? DEFAULT_ROUTE_WIDTH);
  const routeSurface = policy.routeSurface ?? 'jungle_trail';
  const pathId = `${pair.from.id}__${pair.to.id}`;

  result.flowPaths.push({
    id: pathId,
    kind: 'route',
    width: routeWidth,
    surface: routeSurface,
    sourceIds: [pair.from.id, pair.to.id],
    points,
  });

  if ((policy.routeStamping ?? 'full') !== 'full') {
    return;
  }

  const routeBlend = Math.max(3, policy.routeBlend ?? DEFAULT_ROUTE_BLEND);
  const routeSpacing = Math.max(routeWidth, policy.routeSpacing ?? DEFAULT_ROUTE_SPACING);
  const routePriority = policy.routePriority ?? DEFAULT_ROUTE_PRIORITY;
  const terrainWidthScale = clamp(policy.routeTerrainWidthScale ?? DEFAULT_ROUTE_TERRAIN_WIDTH_SCALE, 0.22, 0.8);
  const terrainHalfWidth = Math.max(3, routeWidth * terrainWidthScale);
  const innerRadius = terrainHalfWidth;
  const outerRadius = innerRadius + Math.max(2.25, routeBlend * 0.58);
  const gradeRadius = outerRadius + routeBlend * 1.75;
  const routeGradeStrength = clamp(policy.routeGradeStrength ?? DEFAULT_ROUTE_GRADE_STRENGTH, 0, 0.3);
  const routeTargetHeightMode = policy.routeTargetHeightMode ?? 'center';

  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) {
      continue;
    }

    result.surfacePatches.push({
      shape: 'rect',
      x: (start.x + end.x) * 0.5,
      z: (start.z + end.z) * 0.5,
      width: routeWidth,
      length: length + routeWidth,
      blend: routeBlend,
      yaw: Math.atan2(dz, dx),
      surface: routeSurface,
      priority: routePriority,
    });

    const capsuleCount = Math.max(1, Math.ceil(length / routeSpacing));
    for (let capsuleIndex = 0; capsuleIndex < capsuleCount; capsuleIndex++) {
      const startT = capsuleIndex / capsuleCount;
      const endT = (capsuleIndex + 1) / capsuleCount;
      const capsuleStartX = lerp(start.x, end.x, startT);
      const capsuleStartZ = lerp(start.z, end.z, startT);
      const capsuleEndX = lerp(start.x, end.x, endT);
      const capsuleEndZ = lerp(start.z, end.z, endT);
      const midX = (capsuleStartX + capsuleEndX) * 0.5;
      const midZ = (capsuleStartZ + capsuleEndZ) * 0.5;
      const flattenStrength = computeFlattenStrength(policy, getTerrainHeight, midX, midZ);
      result.stamps.push({
        kind: 'flatten_capsule',
        startX: capsuleStartX,
        startZ: capsuleStartZ,
        endX: capsuleEndX,
        endZ: capsuleEndZ,
        innerRadius: innerRadius * flattenStrength,
        outerRadius: outerRadius * flattenStrength,
        gradeRadius: gradeRadius * flattenStrength,
        gradeStrength: routeGradeStrength,
        samplingRadius: innerRadius,
        targetHeightMode: routeTargetHeightMode,
        heightOffset: 0,
        priority: routePriority,
        // Route corridors carve their own driving surface; the resolver lets
        // their baked centerline target win over overlapping low-priority
        // stamps (zone shoulders inside the inset, hydrology beds adjacent).
        obstructionPolicy: 'override',
        targetHeightStrategy: 'baked',
      });
    }
  }
}

// Slope-aware drape blend.
//
// Below `slopeGuardDegrees - softness/2`, returns 1.0 (full original flatten;
// byte-identical to legacy behavior). Above `slopeGuardDegrees + softness/2`,
// returns `routeBlendOnSteepSlope` (typically 0 = full drape). In the soft
// band, smoothstep gives a C1-continuous interpolation.
//
// When `slopeGuardDegrees` is unset in policy, returns 1.0 unconditionally
// (no guard, no extra sampling).
//
// Slope sample uses a deterministic 4-tap central difference at `(x, z)`.
function computeFlattenStrength(
  policy: TerrainFlowPolicyConfig,
  getTerrainHeight: (x: number, z: number) => number,
  x: number,
  z: number,
): number {
  const guardDeg = policy.slopeGuardDegrees;
  if (guardDeg === undefined || guardDeg <= 0) {
    return 1;
  }
  const softness = Math.max(0, policy.slopeGuardSoftnessDegrees ?? 0);
  const blendTarget = clamp(policy.routeBlendOnSteepSlope ?? 0, 0, 1);
  const slopeDeg = sampleSlopeDegrees(getTerrainHeight, x, z);
  const halfBand = softness * 0.5;
  const lowEdge = guardDeg - halfBand;
  const highEdge = guardDeg + halfBand;
  const t = smoothstep(lowEdge, highEdge, slopeDeg);
  return lerp(1, blendTarget, t);
}

// 4-tap central difference around (x, z). Deterministic; no allocation.
function sampleSlopeDegrees(
  getTerrainHeight: (x: number, z: number) => number,
  x: number,
  z: number,
): number {
  const s = SLOPE_SAMPLE_STEP_M;
  const hPosX = getTerrainHeight(x + s, z);
  const hNegX = getTerrainHeight(x - s, z);
  const hPosZ = getTerrainHeight(x, z + s);
  const hNegZ = getTerrainHeight(x, z - s);
  const dHdX = (hPosX - hNegX) / (2 * s);
  const dHdZ = (hPosZ - hNegZ) / (2 * s);
  const slopeMag = Math.hypot(dHdX, dHdZ);
  return Math.atan(slopeMag) * (180 / Math.PI);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 >= edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sanitizeRoutePoints(
  from: ZoneConfig,
  to: ZoneConfig,
  route: Array<{ x: number; z: number }>,
  policy: TerrainFlowPolicyConfig,
): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [
    { x: from.position.x, z: from.position.z },
  ];

  for (const point of route) {
    const previous = points[points.length - 1];
    if (!previous || distanceSqPoint(previous, point) > 4) {
      points.push({ x: point.x, z: point.z });
    }
  }

  const previous = points[points.length - 1];
  if (!previous || distanceSqPoint(previous, to.position) > 4) {
    points.push({ x: to.position.x, z: to.position.z });
  }

  insetEndpoint(points, from, true, policy);
  insetEndpoint(points, to, false, policy);

  return points;
}

function insetEndpoint(
  points: Array<{ x: number; z: number }>,
  zone: ZoneConfig,
  isStart: boolean,
  policy: TerrainFlowPolicyConfig,
): void {
  const zoneIndex = isStart ? 0 : points.length - 1;
  const neighborIndex = isStart ? 1 : points.length - 2;
  if (points.length < 2 || zoneIndex < 0 || neighborIndex < 0 || neighborIndex >= points.length) {
    return;
  }

  const zonePoint = points[zoneIndex];
  const neighbor = points[neighborIndex];
  const dx = neighbor.x - zonePoint.x;
  const dz = neighbor.z - zonePoint.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 8) {
    return;
  }

  const shoulderPadding = policy.zoneShoulderPadding ?? DEFAULT_ZONE_SHOULDER_PADDING;
  const preferredInset = zone.isHomeBase
    ? zone.radius + shoulderPadding * 0.95
    : zone.radius * OBJECTIVE_ROUTE_ENDPOINT_RADIUS_SCALE;
  const inset = clamp(preferredInset, 8, Math.max(8, distance - 6));
  points[zoneIndex] = {
    x: zonePoint.x + (dx / distance) * inset,
    z: zonePoint.z + (dz / distance) * inset,
  };
}

function distanceSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return dx * dx + dz * dz;
}

function distanceSqPoint(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return dx * dx + dz * dz;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
