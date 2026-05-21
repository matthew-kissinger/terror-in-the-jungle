import type { HydrologyPolylinePoint } from './HydrologyBake';

const HYDROLOGY_RIVER_PATH_SMOOTHING_PASSES = 2;
const HYDROLOGY_RIVER_PATH_MAX_SEGMENT_LENGTH_METERS = 36;
const HYDROLOGY_RIVER_PROFILE_TERRAIN_BLEND = 0.22;
const HYDROLOGY_RIVER_PROFILE_MIN_DROP_PER_METER = 0.00035;
const HYDROLOGY_RIVER_PROFILE_MAX_DROP_PER_METER = 0.035;
const HYDROLOGY_RIVER_PROFILE_SMOOTH_RADIUS = 3;

export function smoothHydrologyRiverPath(
  points: readonly HydrologyPolylinePoint[],
): HydrologyPolylinePoint[] {
  if (points.length < 3) return [...points];

  let smoothed = [...points];
  for (let pass = 0; pass < HYDROLOGY_RIVER_PATH_SMOOTHING_PASSES; pass++) {
    smoothed = chaikinSmooth(smoothed);
  }
  return applyDownstreamElevationProfile(subdivideLongSegments(smoothed));
}

function chaikinSmooth(points: readonly HydrologyPolylinePoint[]): HydrologyPolylinePoint[] {
  if (points.length < 3) return [...points];

  const smoothed: HydrologyPolylinePoint[] = [];
  const first = points[0];
  const last = points[points.length - 1];
  if (first) smoothed.push(first);
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    smoothed.push(interpolatePoint(start, end, 0.25));
    smoothed.push(interpolatePoint(start, end, 0.75));
  }
  if (last) smoothed.push(last);
  return smoothed;
}

function subdivideLongSegments(points: readonly HydrologyPolylinePoint[]): HydrologyPolylinePoint[] {
  if (points.length < 2) return [...points];

  const subdivided: HydrologyPolylinePoint[] = [];
  const first = points[0];
  if (first) subdivided.push(first);

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;

    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const steps = Math.max(1, Math.ceil(length / HYDROLOGY_RIVER_PATH_MAX_SEGMENT_LENGTH_METERS));
    for (let step = 1; step <= steps; step++) {
      subdivided.push(interpolatePoint(start, end, step / steps));
    }
  }
  return subdivided;
}

function interpolatePoint(
  start: HydrologyPolylinePoint,
  end: HydrologyPolylinePoint,
  t: number,
): HydrologyPolylinePoint {
  return {
    cell: t < 0.5 ? start.cell : end.cell,
    x: lerp(start.x, end.x, t),
    z: lerp(start.z, end.z, t),
    elevationMeters: lerp(start.elevationMeters, end.elevationMeters, t),
    accumulationCells: lerp(start.accumulationCells, end.accumulationCells, t),
  };
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function applyDownstreamElevationProfile(
  points: readonly HydrologyPolylinePoint[],
): HydrologyPolylinePoint[] {
  if (points.length < 2) return [...points];

  const distances = cumulativeDistances(points);
  const totalLength = distances[distances.length - 1] ?? 0;
  if (totalLength <= 0) return [...points];

  const smoothedElevations = smoothElevations(points);
  const headElevation = smoothedElevations[0] ?? points[0]?.elevationMeters ?? 0;
  const outletSourceElevation = smoothedElevations[smoothedElevations.length - 1]
    ?? points[points.length - 1]?.elevationMeters
    ?? headElevation;
  const minOutletElevation = headElevation - totalLength * HYDROLOGY_RIVER_PROFILE_MIN_DROP_PER_METER;
  const outletElevation = Math.min(outletSourceElevation, minOutletElevation);

  const profiled: HydrologyPolylinePoint[] = [];
  let previousElevation = headElevation;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (!point) continue;

    const distance = distances[index] ?? 0;
    const t = distance / totalLength;
    const gradeElevation = lerp(headElevation, outletElevation, t);
    const terrainElevation = smoothedElevations[index] ?? point.elevationMeters;
    let elevationMeters = lerp(gradeElevation, terrainElevation, HYDROLOGY_RIVER_PROFILE_TERRAIN_BLEND);

    if (index > 0) {
      const segmentLength = Math.max(0.001, distance - (distances[index - 1] ?? 0));
      const highestAllowed = previousElevation - segmentLength * HYDROLOGY_RIVER_PROFILE_MIN_DROP_PER_METER;
      const lowestAllowed = previousElevation - segmentLength * HYDROLOGY_RIVER_PROFILE_MAX_DROP_PER_METER;
      elevationMeters = clamp(elevationMeters, lowestAllowed, highestAllowed);
    }

    profiled.push({ ...point, elevationMeters });
    previousElevation = elevationMeters;
  }

  return profiled;
}

function cumulativeDistances(points: readonly HydrologyPolylinePoint[]): number[] {
  const distances: number[] = [];
  let total = 0;
  for (let index = 0; index < points.length; index++) {
    if (index > 0) {
      const previous = points[index - 1];
      const point = points[index];
      if (previous && point) total += Math.hypot(point.x - previous.x, point.z - previous.z);
    }
    distances.push(total);
  }
  return distances;
}

function smoothElevations(points: readonly HydrologyPolylinePoint[]): number[] {
  return points.map((_point, index) => {
    let weightTotal = 0;
    let elevationTotal = 0;
    for (
      let neighborIndex = Math.max(0, index - HYDROLOGY_RIVER_PROFILE_SMOOTH_RADIUS);
      neighborIndex <= Math.min(points.length - 1, index + HYDROLOGY_RIVER_PROFILE_SMOOTH_RADIUS);
      neighborIndex++
    ) {
      const neighbor = points[neighborIndex];
      if (!neighbor) continue;
      const distance = Math.abs(neighborIndex - index);
      const weight = 1 / (1 + distance);
      weightTotal += weight;
      elevationTotal += neighbor.elevationMeters * weight;
    }
    return weightTotal > 0 ? elevationTotal / weightTotal : points[index]?.elevationMeters ?? 0;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
