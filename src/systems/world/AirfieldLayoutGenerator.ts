import * as THREE from 'three';
import type { StaticModelPlacementConfig } from '../../config/gameModeTypes';
import { getFixedWingConfigForModelPath } from '../vehicle/FixedWingConfigs';
import type { RectTerrainSurfacePatch } from '../terrain/TerrainFeatureTypes';
import { airfieldEnvelopeInnerLateral } from '../terrain/TerrainFeatureCompiler';
import type {
  AirfieldTemplate,
  AirfieldTaxiRoute,
  AirfieldRunwayStart,
  AirfieldStructureEntry,
  AirfieldSurfaceRect,
} from './AirfieldTemplates';

const DEFAULT_CLEARANCE_RADIUS = 6;

interface AirfieldLayout {
  placements: StaticModelPlacementConfig[];
  surfacePatches: RectTerrainSurfacePatch[];
}

/** Simple seeded PRNG (mulberry32) */
function createRng(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
}

function weightedSelect(entries: AirfieldStructureEntry[], rng: () => number): AirfieldStructureEntry {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = rng() * totalWeight;
  for (const entry of entries) {
    r -= entry.weight;
    if (r <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function isSpacingValid(
  x: number,
  z: number,
  radius: number,
  placed: Array<{ x: number; z: number; radius: number }>,
): boolean {
  for (const p of placed) {
    const dx = x - p.x;
    const dz = z - p.z;
    const minSpacing = radius + p.radius;
    if (dx * dx + dz * dz < minSpacing * minSpacing) return false;
  }
  return true;
}

function resolveTaxiRoute(template: AirfieldTemplate, routeId?: string): AirfieldTaxiRoute | undefined {
  if (!routeId) return undefined;
  return template.taxiRoutes.find((route) => route.id === routeId);
}

function resolveRunwayStart(template: AirfieldTemplate, startId?: string): AirfieldRunwayStart | undefined {
  if (!startId) return undefined;
  return template.runwayStarts.find((start) => start.id === startId);
}

/**
 * Compute the local-frame yaw (around Y) needed to face a parked aircraft
 * toward the first taxiway waypoint it will actually move to.
 *
 * Taxi routes in this codebase are written as `points[0]` = the stand itself,
 * followed by the taxiway entry and onward. The aircraft should face the
 * first point that is distinct from its parking offset; we skip any leading
 * points that coincide (within `COINCIDENT_EPS_M`) with the stand.
 *
 * Coordinate convention: `localOffset(along, lateral) → Vector3(lateral, 0, along)`
 * places `lateral` on local X and `along` on local Z. A rotation-Y of `θ` maps
 * physics-forward (local `-Z`) to `(-sin θ, 0, -cos θ)`. To face a world
 * direction `(dX, 0, dZ)` we need `θ = atan2(-dX, -dZ)`.
 *
 * Returns `undefined` when no valid direction can be derived (missing route,
 * only-coincident points, or a degenerate segment); callers fall back to the
 * template's static `yaw` override or `0`.
 */
const COINCIDENT_EPS_M = 0.5;

function computeParkingYaw(
  spot: { offsetAlongRunway: number; offsetLateral: number },
  route: AirfieldTaxiRoute | undefined,
): number | undefined {
  const points = route?.points;
  if (!points || points.length === 0) return undefined;

  let target: { offsetAlongRunway: number; offsetLateral: number } | undefined;
  for (const point of points) {
    const dAlong = point.offsetAlongRunway - spot.offsetAlongRunway;
    const dLateral = point.offsetLateral - spot.offsetLateral;
    if (Math.abs(dAlong) > COINCIDENT_EPS_M || Math.abs(dLateral) > COINCIDENT_EPS_M) {
      target = point;
      break;
    }
  }
  if (!target) return undefined;

  const dAlong = target.offsetAlongRunway - spot.offsetAlongRunway;
  const dLateral = target.offsetLateral - spot.offsetLateral;
  // In local frame: X = lateral, Z = along. Forward direction we want is
  // (dLateral, 0, dAlong). Solve for θ such that (-sin θ, 0, -cos θ) aligns
  // with that direction.
  const yaw = Math.atan2(-dLateral, -dAlong);
  if (!Number.isFinite(yaw)) return undefined;
  return yaw;
}

export function generateAirfieldLayout(
  template: AirfieldTemplate,
  center: THREE.Vector3,
  heading: number,
  seedHint?: string,
): AirfieldLayout {
  const seed =
    hashString(seedHint ?? template.id) +
    Math.round(center.x * 100) +
    Math.round(center.z * 100);
  const rng = createRng(seed);

  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  function localOffset(along: number, lateral: number): THREE.Vector3 {
    return new THREE.Vector3(lateral, 0, along);
  }

  // Transform local offset (along runway / lateral) to world offset
  function toWorld(along: number, lateral: number): { x: number; z: number } {
    return {
      x: along * sinH + lateral * cosH,
      z: along * cosH - lateral * sinH,
    };
  }

  function pushSurfaceRect(rect: AirfieldSurfaceRect): void {
    const worldCenter = toWorld(rect.offsetAlongRunway, rect.offsetLateral);
    surfacePatches.push({
      shape: 'rect',
      x: center.x + worldCenter.x,
      z: center.z + worldCenter.z,
      width: rect.width,
      length: rect.length,
      blend: rect.blend,
      yaw: heading + (rect.yaw ?? 0),
      surface: rect.surface,
      priority: rect.surface === 'runway' ? 10 : 8,
    });
  }

  const surfacePatches: RectTerrainSurfacePatch[] = [];
  const placements: StaticModelPlacementConfig[] = [];
  const placed: Array<{ x: number; z: number; radius: number }> = [];

  // 1. Runway surface patch
  pushSurfaceRect({
    offsetAlongRunway: 0,
    offsetLateral: 0,
    width: template.runwayWidth,
    length: template.runwayLength,
    blend: 3,
    surface: 'runway',
  });

  // 2. Apron and taxiway surface patches
  for (const apron of template.aprons) {
    pushSurfaceRect(apron);
  }
  for (const taxiway of template.taxiways) {
    pushSurfaceRect(taxiway);
  }

  // 3. Aircraft parking spots
  for (let i = 0; i < template.parkingSpots.length; i++) {
    const spot = template.parkingSpots[i];
    const along = spot.offsetAlongRunway;
    const lateral = spot.offsetLateral;
    const localOff = localOffset(along, lateral);
    const clearanceRadius = Math.max(DEFAULT_CLEARANCE_RADIUS, spot.clearanceRadius ?? DEFAULT_CLEARANCE_RADIUS);

    const taxiRoute = resolveTaxiRoute(template, spot.taxiRouteId);
    const runwayStart = resolveRunwayStart(template, spot.runwayStartId);
    const fixedWingSpawn = getFixedWingConfigForModelPath(spot.modelPath)
      ? {
          standId: spot.standId ?? `stand_${i}`,
          taxiRoute: taxiRoute?.points.map((point) => localOffset(point.offsetAlongRunway, point.offsetLateral)),
          runwayStart: runwayStart
            ? {
                id: runwayStart.id,
                position: localOffset(runwayStart.offsetAlongRunway, runwayStart.offsetLateral),
                heading: runwayStart.heading,
                holdShortPosition: runwayStart.holdShortAlongRunway !== undefined && runwayStart.holdShortLateral !== undefined
                  ? localOffset(runwayStart.holdShortAlongRunway, runwayStart.holdShortLateral)
                  : undefined,
                shortFinalDistance: runwayStart.shortFinalDistance,
                shortFinalAltitude: runwayStart.shortFinalAltitude,
              }
            : undefined,
        }
      : undefined;
    const npcAutoFlight = spot.npcAutoFlight
      ? {
          kind: spot.npcAutoFlight.kind,
          waypointOffset: localOffset(
            spot.npcAutoFlight.waypointOffsetAlongRunway,
            spot.npcAutoFlight.waypointOffsetLateral,
          ),
          altitudeAGLm: spot.npcAutoFlight.altitudeAGLm,
          airspeedMs: spot.npcAutoFlight.airspeedMs,
        }
      : undefined;
    // Parked aircraft should face the first point of their taxi route so the
    // NPC pilot (or player) rolls straight onto the taxiway without a U-turn.
    // A per-spot `spot.yaw` override wins if the template author set one; then
    // the computed taxi-entry yaw; finally zero. See `computeParkingYaw`.
    const computedYaw = computeParkingYaw(spot, taxiRoute);
    const parkingYaw = spot.yaw ?? computedYaw ?? 0;
    placements.push({
      id: `parking_${i}`,
      modelPath: spot.modelPath,
      offset: localOff,
      yaw: parkingYaw,
      registerCollision: true,
      skipFlatSearch: true,
      fixedWingSpawn,
      npcAutoFlight,
    });
    placed.push({ x: localOff.x, z: localOff.z, radius: clearanceRadius });
  }

  // 4. Fill structures from template pool
  const targetCount =
    template.structureCount.min +
    Math.floor(rng() * (template.structureCount.max - template.structureCount.min + 1));

  const maxAttempts = targetCount * 10;
  let attempts = 0;

  while (placements.length < targetCount + template.parkingSpots.length && attempts < maxAttempts) {
    attempts++;
    const entry = weightedSelect(template.pool, rng);

    let along: number;
    let lateral: number;

    switch (entry.zone) {
      case 'runway_side':
        along = (rng() - 0.5) * template.runwayLength * 0.8;
        lateral = (template.runwayWidth * 0.5 + 8 + rng() * 20) * (rng() > 0.5 ? 1 : -1);
        break;
      case 'dispersal':
        along = (rng() - 0.5) * template.runwayLength * 0.6;
        lateral = template.dispersalOffset + rng() * 18;
        break;
      case 'perimeter': {
        // Clamp the perimeter placement radius to stay inside the envelope's
        // fully-flat zone (minus an 8 m clearance margin). Without the clamp
        // perimeter structures can land on the 6 m hard ramp just outside the
        // flat zone and float / sink against the graded shoulder. The
        // envelope geometry itself is defined in `TerrainFeatureCompiler`;
        // we import the helper so the radius stays in sync with the stamp.
        const envelopeInnerLateral = airfieldEnvelopeInnerLateral(template);
        const rawPerimDist = Math.max(template.runwayLength * 0.5, template.dispersalOffset + 20);
        const perimDist = Math.min(rawPerimDist, envelopeInnerLateral - 8);
        const angle = rng() * Math.PI * 2;
        along = Math.cos(angle) * perimDist;
        lateral = Math.sin(angle) * perimDist;
        break;
      }
      default: // parking zone handled above
        continue;
    }

    const localOff = localOffset(along, lateral);
    const clearanceRadius = entry.registerCollision ? 9 : DEFAULT_CLEARANCE_RADIUS;

    if (!isSpacingValid(localOff.x, localOff.z, clearanceRadius, placed)) continue;

    // Perimeter structures sit at the envelope shoulder where sub-footprint
    // terrain variation can float / sink the foundation under the STRUCTURE_SCALE
    // amplification. Runway-side and dispersal structures are on or near the
    // flat apron stamp and can keep the cheap centroid-Y snap.
    const isPerimeter = entry.zone === 'perimeter';
    placements.push({
      id: `struct_${placements.length}`,
      modelPath: entry.modelPath,
      offset: localOff,
      yaw: (rng() - 0.5) * 0.3,
      registerCollision: entry.registerCollision,
      skipFlatSearch: !isPerimeter,
    });
    placed.push({ x: localOff.x, z: localOff.z, radius: clearanceRadius });
  }

  return { placements, surfacePatches };
}
