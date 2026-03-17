import type { MapFeatureDefinition, ZoneConfig } from '../../config/gameModeTypes';
import type { StrategicRouteWaypoint } from './types';

const DEFAULT_GOAL_RADIUS = 26;
const DUPLICATE_NODE_DISTANCE = 32;
const SMALL_MAP_NEIGHBOR_COUNT = 4;
const LARGE_MAP_NEIGHBOR_COUNT = 6;
const POINT_LINK_COUNT = 4;
const SMALL_MAP_ROUTE_SAMPLE_SPACING = 40;
const MEDIUM_MAP_ROUTE_SAMPLE_SPACING = 96;
const LARGE_MAP_ROUTE_SAMPLE_SPACING = 180;
const ROUTE_MAX_SAMPLES = 14;
const STEEP_GRADE_START = 0.18;
const VERY_STEEP_GRADE_START = 0.38;

type StrategicRouteNodeKind = 'zone' | 'road' | 'village' | 'firebase' | 'airfield';

export interface StrategicRouteTopologyInput {
  worldSize: number;
  zones: ReadonlyArray<Pick<ZoneConfig, 'id' | 'position' | 'radius' | 'isHomeBase'>>;
  features?: ReadonlyArray<MapFeatureDefinition>;
}

interface StrategicRouteNode {
  id: string;
  x: number;
  z: number;
  arrivalRadius: number;
  kind: StrategicRouteNodeKind;
  routeBias: number;
}

interface StrategicRouteEdge {
  to: number;
  cost: number;
}

export class StrategicRoutePlanner {
  private readonly worldSize: number;
  private readonly getTerrainHeight: (x: number, z: number) => number;
  private readonly nodes: StrategicRouteNode[];
  private readonly adjacency: StrategicRouteEdge[][];
  private readonly zoneRadiusById = new Map<string, number>();

  constructor(
    topology: StrategicRouteTopologyInput,
    getTerrainHeight: (x: number, z: number) => number,
  ) {
    this.worldSize = topology.worldSize;
    this.getTerrainHeight = getTerrainHeight;

    for (const zone of topology.zones) {
      this.zoneRadiusById.set(zone.id, zone.radius);
    }

    this.nodes = this.buildNodes(topology);
    this.adjacency = this.buildAdjacency(this.nodes);
  }

  findRoute(
    startX: number,
    startZ: number,
    goalX: number,
    goalZ: number,
    goalZoneId?: string,
  ): StrategicRouteWaypoint[] {
    const goalRadius = this.resolveGoalRadius(goalZoneId);
    const directDistanceSq = distanceSq(startX, startZ, goalX, goalZ);
    if (directDistanceSq <= goalRadius * goalRadius) {
      return [{
        x: goalX,
        z: goalZ,
        arrivalRadius: goalRadius,
        kind: 'objective',
      }];
    }

    const startLinks = this.linkPointToNodes(startX, startZ);
    const goalLinks = this.linkPointToNodes(goalX, goalZ);
    if (this.nodes.length === 0 || startLinks.length === 0 || goalLinks.length === 0) {
      return [{
        x: goalX,
        z: goalZ,
        arrivalRadius: goalRadius,
        kind: 'objective',
      }];
    }

    const goalLinkCost = new Map<number, number>();
    for (const link of goalLinks) {
      goalLinkCost.set(link.nodeIndex, link.cost);
    }

    const directCost = this.computeTravelCost(startX, startZ, goalX, goalZ);
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();
    const cameFrom = new Map<number, number | null>();
    const open = new Set<number>();
    const startKey = -1;
    const goalKey = -2;

    gScore.set(startKey, 0);
    fScore.set(startKey, directCost);
    cameFrom.set(startKey, null);
    open.add(startKey);

    while (open.size > 0) {
      const current = this.popLowest(open, fScore);
      if (current === goalKey) {
        return this.buildWaypoints(cameFrom, goalKey, goalX, goalZ, goalRadius);
      }

      if (current === startKey) {
        for (const link of startLinks) {
          this.relaxEdge(
            startKey,
            link.nodeIndex,
            link.cost,
            goalX,
            goalZ,
            gScore,
            fScore,
            cameFrom,
            open,
          );
        }

        this.relaxEdge(
          startKey,
          goalKey,
          directCost,
          goalX,
          goalZ,
          gScore,
          fScore,
          cameFrom,
          open,
        );
        continue;
      }

      const edges = this.adjacency[current] ?? [];
      for (const edge of edges) {
        this.relaxEdge(
          current,
          edge.to,
          edge.cost,
          goalX,
          goalZ,
          gScore,
          fScore,
          cameFrom,
          open,
        );
      }

      const goalCost = goalLinkCost.get(current);
      if (goalCost !== undefined) {
        this.relaxEdge(
          current,
          goalKey,
          goalCost,
          goalX,
          goalZ,
          gScore,
          fScore,
          cameFrom,
          open,
        );
      }
    }

    return [{
      x: goalX,
      z: goalZ,
      arrivalRadius: goalRadius,
      kind: 'objective',
    }];
  }

  private buildNodes(topology: StrategicRouteTopologyInput): StrategicRouteNode[] {
    const nodes: StrategicRouteNode[] = [];

    for (const zone of topology.zones) {
      nodes.push({
        id: `zone:${zone.id}`,
        x: zone.position.x,
        z: zone.position.z,
        arrivalRadius: clamp(zone.radius * 0.75, 18, 80),
        kind: 'zone',
        routeBias: zone.isHomeBase ? 0.96 : 1.0,
      });
    }

    for (const feature of topology.features ?? []) {
      if (!isRouteFeature(feature)) continue;

      const node = createFeatureNode(feature);
      if (!node) continue;
      if (hasNearbyNode(nodes, node.x, node.z, Math.max(DUPLICATE_NODE_DISTANCE, node.arrivalRadius * 0.6))) {
        continue;
      }

      nodes.push(node);
    }

    return nodes;
  }

  private buildAdjacency(nodes: StrategicRouteNode[]): StrategicRouteEdge[][] {
    const adjacency = nodes.map(() => [] as StrategicRouteEdge[]);
    if (nodes.length <= 1) {
      return adjacency;
    }

    const neighborCount = this.worldSize >= 2500
      ? LARGE_MAP_NEIGHBOR_COUNT
      : SMALL_MAP_NEIGHBOR_COUNT;
    const seen = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const nearest = nodes
        .map((node, index) => ({
          index,
          distSq: index === i ? Infinity : distanceSq(nodes[i].x, nodes[i].z, node.x, node.z),
        }))
        .sort((a, b) => a.distSq - b.distSq)
        .slice(0, neighborCount);

      for (const neighbor of nearest) {
        if (!Number.isFinite(neighbor.distSq)) continue;

        const low = Math.min(i, neighbor.index);
        const high = Math.max(i, neighbor.index);
        const key = `${low}:${high}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const cost = this.computeTravelCost(
          nodes[i].x,
          nodes[i].z,
          nodes[neighbor.index].x,
          nodes[neighbor.index].z,
          (nodes[i].routeBias + nodes[neighbor.index].routeBias) * 0.5,
        );
        adjacency[i].push({ to: neighbor.index, cost });
        adjacency[neighbor.index].push({ to: i, cost });
      }
    }

    return adjacency;
  }

  private computeTravelCost(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    routeBias = 1,
  ): number {
    const distance = Math.hypot(endX - startX, endZ - startZ);
    if (distance < 0.001) {
      return 0;
    }

    const sampleSpacing = this.worldSize <= 1000
      ? SMALL_MAP_ROUTE_SAMPLE_SPACING
      : this.worldSize <= 4000
        ? MEDIUM_MAP_ROUTE_SAMPLE_SPACING
        : LARGE_MAP_ROUTE_SAMPLE_SPACING;
    const sampleCount = clamp(
      Math.ceil(distance / sampleSpacing),
      2,
      ROUTE_MAX_SAMPLES,
    );
    const segmentLength = distance / sampleCount;
    let prevHeight = this.getTerrainHeight(startX, startZ);
    let totalGrade = 0;
    let maxGrade = 0;

    for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex++) {
      const t = sampleIndex / sampleCount;
      const x = lerp(startX, endX, t);
      const z = lerp(startZ, endZ, t);
      const height = this.getTerrainHeight(x, z);
      const grade = Math.abs(height - prevHeight) / Math.max(segmentLength, 1);
      totalGrade += grade;
      maxGrade = Math.max(maxGrade, grade);
      prevHeight = height;
    }

    const meanGrade = totalGrade / sampleCount;
    let multiplier = 1 + meanGrade * 2.4;
    if (maxGrade > STEEP_GRADE_START) {
      multiplier += (maxGrade - STEEP_GRADE_START) * 3.6;
    }
    if (maxGrade > VERY_STEEP_GRADE_START) {
      multiplier += (maxGrade - VERY_STEEP_GRADE_START) * 8.5;
    }

    const hopPenalty = 1 + Math.min(distance / Math.max(this.worldSize * 1.8, 800), 0.22);
    return distance * multiplier * routeBias * hopPenalty;
  }

  private linkPointToNodes(x: number, z: number): Array<{ nodeIndex: number; cost: number }> {
    return this.nodes
      .map((node, index) => ({
        nodeIndex: index,
        distSq: distanceSq(x, z, node.x, node.z),
      }))
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, POINT_LINK_COUNT)
      .map((candidate) => ({
        nodeIndex: candidate.nodeIndex,
        cost: this.computeTravelCost(
          x,
          z,
          this.nodes[candidate.nodeIndex].x,
          this.nodes[candidate.nodeIndex].z,
          this.nodes[candidate.nodeIndex].routeBias,
        ),
      }));
  }

  private relaxEdge(
    current: number,
    neighbor: number,
    edgeCost: number,
    goalX: number,
    goalZ: number,
    gScore: Map<number, number>,
    fScore: Map<number, number>,
    cameFrom: Map<number, number | null>,
    open: Set<number>,
  ): void {
    const currentScore = gScore.get(current);
    if (currentScore === undefined) {
      return;
    }

    const tentative = currentScore + edgeCost;
    const previous = gScore.get(neighbor);
    if (previous !== undefined && tentative >= previous) {
      return;
    }

    cameFrom.set(neighbor, current);
    gScore.set(neighbor, tentative);
    fScore.set(neighbor, tentative + this.estimateHeuristic(neighbor, goalX, goalZ));
    open.add(neighbor);
  }

  private estimateHeuristic(nodeIndex: number, goalX: number, goalZ: number): number {
    if (nodeIndex < 0) {
      return 0;
    }

    const node = this.nodes[nodeIndex];
    return Math.hypot(goalX - node.x, goalZ - node.z);
  }

  private popLowest(open: Set<number>, fScore: Map<number, number>): number {
    let bestKey = -1;
    let bestScore = Infinity;
    for (const key of open) {
      const score = fScore.get(key) ?? Infinity;
      if (score < bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    open.delete(bestKey);
    return bestKey;
  }

  private buildWaypoints(
    cameFrom: Map<number, number | null>,
    goalKey: number,
    goalX: number,
    goalZ: number,
    goalRadius: number,
  ): StrategicRouteWaypoint[] {
    const path: number[] = [];
    let cursor: number | null | undefined = goalKey;

    while (cursor !== null && cursor !== undefined) {
      path.push(cursor);
      cursor = cameFrom.get(cursor);
    }

    path.reverse();

    const waypoints: StrategicRouteWaypoint[] = [];
    for (const key of path) {
      if (key < 0) {
        continue;
      }

      const node = this.nodes[key];
      if (!node) {
        continue;
      }

      if (waypoints.length > 0) {
        const previous = waypoints[waypoints.length - 1];
        if (distanceSq(previous.x, previous.z, node.x, node.z) < previous.arrivalRadius * previous.arrivalRadius) {
          continue;
        }
      }

      waypoints.push({
        x: node.x,
        z: node.z,
        arrivalRadius: node.arrivalRadius,
        kind: 'route_node',
        sourceId: node.id,
      });
    }

    const last = waypoints[waypoints.length - 1];
    if (!last || distanceSq(last.x, last.z, goalX, goalZ) > goalRadius * goalRadius) {
      waypoints.push({
        x: goalX,
        z: goalZ,
        arrivalRadius: goalRadius,
        kind: 'objective',
      });
    } else {
      last.x = goalX;
      last.z = goalZ;
      last.arrivalRadius = Math.max(last.arrivalRadius, goalRadius);
      last.kind = 'objective';
      last.sourceId = undefined;
    }

    return waypoints;
  }

  private resolveGoalRadius(goalZoneId?: string): number {
    if (!goalZoneId) {
      return DEFAULT_GOAL_RADIUS;
    }

    const zoneRadius = this.zoneRadiusById.get(goalZoneId);
    if (zoneRadius === undefined) {
      return DEFAULT_GOAL_RADIUS;
    }

    return clamp(zoneRadius * 0.8, 20, 90);
  }
}

function isRouteFeature(feature: MapFeatureDefinition): boolean {
  return feature.kind === 'road'
    || feature.kind === 'village'
    || feature.kind === 'firebase'
    || feature.kind === 'airfield';
}

function createFeatureNode(feature: MapFeatureDefinition): StrategicRouteNode | null {
  const circleRadius = feature.footprint?.shape === 'circle'
    ? feature.footprint.radius
    : feature.terrain?.flatRadius;
  const arrivalRadius = clamp(circleRadius ?? DEFAULT_GOAL_RADIUS, 18, 120);
  const shared = {
    id: `feature:${feature.id}`,
    x: feature.position.x,
    z: feature.position.z,
    arrivalRadius,
  };

  switch (feature.kind) {
    case 'road':
      return {
        ...shared,
        kind: 'road',
        routeBias: resolveRouteBias(feature.surface?.kind, 0.8),
      };
    case 'village':
      return {
        ...shared,
        kind: 'village',
        routeBias: resolveRouteBias(feature.surface?.kind, 0.9),
      };
    case 'firebase':
      return {
        ...shared,
        kind: 'firebase',
        routeBias: resolveRouteBias(feature.surface?.kind, 0.92),
      };
    case 'airfield':
      return {
        ...shared,
        kind: 'airfield',
        routeBias: resolveRouteBias(feature.surface?.kind, 0.86),
      };
    default:
      return null;
  }
}

function resolveRouteBias(surfaceKind: string | undefined, fallback: number): number {
  switch (surfaceKind) {
    case 'dirt_road':
      return 0.76;
    case 'gravel_road':
      return 0.79;
    case 'jungle_trail':
      return 0.8;
    case 'packed_earth':
      return Math.min(fallback, 0.88);
    case 'runway':
      return 0.74;
    default:
      return fallback;
  }
}

function hasNearbyNode(
  nodes: StrategicRouteNode[],
  x: number,
  z: number,
  radius: number,
): boolean {
  const radiusSq = radius * radius;
  return nodes.some((node) => distanceSq(node.x, node.z, x, z) <= radiusSq);
}

function distanceSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
