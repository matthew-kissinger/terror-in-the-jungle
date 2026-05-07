import type {
  HydrologyBakeArtifact,
  HydrologyChannelPolyline,
  HydrologyPolylinePoint,
} from './HydrologyBake';

export type HydrologyCorridorZone = 'channel' | 'bank' | 'wetland' | 'upland';

export interface HydrologyCorridorBandOptions {
  channelRadiusMeters: number;
  bankRadiusMeters: number;
  wetlandRadiusMeters: number;
}

export interface HydrologyNearestChannelSample {
  pathIndex: number;
  segmentIndex: number;
  distanceMeters: number;
  x: number;
  z: number;
  t: number;
  elevationMeters: number;
  accumulationCells: number;
}

export interface HydrologyCorridorSample {
  zone: HydrologyCorridorZone;
  nearest: HydrologyNearestChannelSample | null;
}

export type HydrologyCorridorSource = HydrologyBakeArtifact | HydrologyChannelPolyline[];

export function sampleHydrologyCorridor(
  source: HydrologyCorridorSource,
  worldX: number,
  worldZ: number,
  options: HydrologyCorridorBandOptions,
): HydrologyCorridorSample {
  validateCorridorBands(options);

  const nearest = findNearestHydrologyChannel(source, worldX, worldZ);
  if (!nearest) {
    return { zone: 'upland', nearest: null };
  }

  if (nearest.distanceMeters <= options.channelRadiusMeters) {
    return { zone: 'channel', nearest };
  }
  if (nearest.distanceMeters <= options.bankRadiusMeters) {
    return { zone: 'bank', nearest };
  }
  if (nearest.distanceMeters <= options.wetlandRadiusMeters) {
    return { zone: 'wetland', nearest };
  }
  return { zone: 'upland', nearest };
}

export function findNearestHydrologyChannel(
  source: HydrologyCorridorSource,
  worldX: number,
  worldZ: number,
): HydrologyNearestChannelSample | null {
  const polylines = hydrologyPolylinesFromSource(source);
  let best: HydrologyNearestChannelSample | null = null;

  for (let pathIndex = 0; pathIndex < polylines.length; pathIndex++) {
    const points = polylines[pathIndex]?.points ?? [];
    if (points.length === 0) continue;

    if (points.length === 1) {
      const point = points[0] as HydrologyPolylinePoint;
      best = keepNearest(best, {
        pathIndex,
        segmentIndex: 0,
        distanceMeters: distance2d(worldX, worldZ, point.x, point.z),
        x: point.x,
        z: point.z,
        t: 0,
        elevationMeters: point.elevationMeters,
        accumulationCells: point.accumulationCells,
      });
      continue;
    }

    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
      const start = points[segmentIndex] as HydrologyPolylinePoint;
      const end = points[segmentIndex + 1] as HydrologyPolylinePoint;
      const projection = projectPointToSegment(worldX, worldZ, start, end);
      best = keepNearest(best, {
        pathIndex,
        segmentIndex,
        distanceMeters: distance2d(worldX, worldZ, projection.x, projection.z),
        x: projection.x,
        z: projection.z,
        t: projection.t,
        elevationMeters: lerp(start.elevationMeters, end.elevationMeters, projection.t),
        accumulationCells: lerp(start.accumulationCells, end.accumulationCells, projection.t),
      });
    }
  }

  return best;
}

function hydrologyPolylinesFromSource(source: HydrologyCorridorSource): HydrologyChannelPolyline[] {
  return Array.isArray(source) ? source : source.channelPolylines;
}

function keepNearest(
  current: HydrologyNearestChannelSample | null,
  candidate: HydrologyNearestChannelSample,
): HydrologyNearestChannelSample {
  return !current || candidate.distanceMeters < current.distanceMeters ? candidate : current;
}

function validateCorridorBands(options: HydrologyCorridorBandOptions): void {
  const { channelRadiusMeters, bankRadiusMeters, wetlandRadiusMeters } = options;
  if (channelRadiusMeters < 0 || bankRadiusMeters < 0 || wetlandRadiusMeters < 0) {
    throw new Error('Hydrology corridor radii must be non-negative');
  }
  if (channelRadiusMeters > bankRadiusMeters || bankRadiusMeters > wetlandRadiusMeters) {
    throw new Error('Hydrology corridor radii must be ordered channel <= bank <= wetland');
  }
}

function projectPointToSegment(
  worldX: number,
  worldZ: number,
  start: HydrologyPolylinePoint,
  end: HydrologyPolylinePoint,
): { x: number; z: number; t: number } {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0) {
    return { x: start.x, z: start.z, t: 0 };
  }

  const rawT = ((worldX - start.x) * dx + (worldZ - start.z) * dz) / lengthSq;
  const t = Math.min(1, Math.max(0, rawT));
  return {
    x: lerp(start.x, end.x, t),
    z: lerp(start.z, end.z, t),
    t,
  };
}

function distance2d(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}
