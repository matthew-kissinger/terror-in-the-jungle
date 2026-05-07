import { StructureModels, AircraftModels, GroundVehicleModels, BuildingModels } from '../assets/modelPaths';
import type { TerrainSurfaceKind } from '../terrain/TerrainFeatureTypes';
import { getFixedWingConfigForModelPath } from '../vehicle/FixedWingConfigs';

export type AirfieldZone = 'runway_side' | 'dispersal' | 'perimeter' | 'parking';

export interface AirfieldStructureEntry {
  modelPath: string;
  zone: AirfieldZone;
  weight: number;
  registerCollision?: boolean;
}

export interface AirfieldParkingSpot {
  standId?: string;
  modelPath: string;
  offsetAlongRunway: number;   // meters along runway centerline from airfield origin
  offsetLateral: number;       // meters perpendicular to runway centerline
  /**
   * Optional yaw override (radians relative to runway heading). When omitted,
   * the layout generator points the aircraft toward the first point of its
   * assigned `taxiRouteId` so the plane taxis out without a reverse maneuver.
   * Only set explicitly when a stand has no taxi route (e.g. the UH-1 helipad)
   * or when a template needs a non-default parking orientation.
   */
  yaw?: number;
  clearanceRadius?: number;    // spacing radius used during procedural structure placement
  taxiRouteId?: string;
  runwayStartId?: string;
  /**
   * Opt-in: when present, the spawned aircraft gets an NPC fixed-wing pilot
   * that flies a single sortie (takeoff → waypoint → RTB → landing).
   * Offsets are local to the runway (along, lateral); WorldFeatureSystem
   * rotates them into world space using the feature yaw.
   */
  npcAutoFlight?: {
    kind: 'ferry' | 'orbit' | 'patrol';
    waypointOffsetAlongRunway: number;
    waypointOffsetLateral: number;
    altitudeAGLm: number;
    airspeedMs: number;
  };
}

export interface AirfieldSurfaceRect {
  offsetAlongRunway: number;   // meters along runway centerline from airfield origin
  offsetLateral: number;       // meters perpendicular to runway centerline
  length: number;              // meters along the rect forward axis
  width: number;               // meters across the rect
  blend: number;
  yaw?: number;                // radians relative to runway heading
  surface: TerrainSurfaceKind;
}

export interface AirfieldTaxiRoute {
  id: string;
  points: Array<{
    offsetAlongRunway: number;
    offsetLateral: number;
  }>;
}

export interface AirfieldRunwayStart {
  id: string;
  offsetAlongRunway: number;
  offsetLateral: number;
  heading: number;
  holdShortAlongRunway?: number;
  holdShortLateral?: number;
  shortFinalDistance?: number;
  shortFinalAltitude?: number;
}

export interface AirfieldTemplate {
  id: string;
  runwayLength: number;        // meters
  runwayWidth: number;         // meters
  dispersalOffset: number;     // meters from runway centerline
  structureCount: { min: number; max: number };
  pool: AirfieldStructureEntry[];
  aprons: AirfieldSurfaceRect[];
  taxiways: AirfieldSurfaceRect[];
  taxiRoutes: AirfieldTaxiRoute[];
  runwayStarts: AirfieldRunwayStart[];
  parkingSpots: AirfieldParkingSpot[];
}

interface AirfieldTemplateCompatibilityIssue {
  modelPath: string;
  minimumRunwayLength: number;
  actualRunwayLength: number;
}

export const AIRFIELD_TEMPLATES: Record<string, AirfieldTemplate> = {
  us_airbase: {
    id: 'us_airbase',
    runwayLength: 480,
    runwayWidth: 28,
    dispersalOffset: 98,
    structureCount: { min: 8, max: 12 },
    pool: [
      { modelPath: BuildingModels.WAREHOUSE, zone: 'runway_side', weight: 2, registerCollision: true },
      { modelPath: StructureModels.COMMS_TOWER, zone: 'runway_side', weight: 1, registerCollision: true },
      { modelPath: StructureModels.GENERATOR_SHED, zone: 'runway_side', weight: 1, registerCollision: true },
      { modelPath: StructureModels.COMMAND_TENT, zone: 'runway_side', weight: 1 },
      { modelPath: StructureModels.GUARD_TOWER, zone: 'perimeter', weight: 2, registerCollision: true },
      { modelPath: StructureModels.ZPU4_AA, zone: 'perimeter', weight: 1, registerCollision: true },
      { modelPath: StructureModels.FUEL_DRUM, zone: 'dispersal', weight: 2 },
      { modelPath: StructureModels.SUPPLY_CRATE, zone: 'dispersal', weight: 2 },
      { modelPath: StructureModels.AMMO_CRATE, zone: 'dispersal', weight: 1 },
      { modelPath: GroundVehicleModels.M35_TRUCK, zone: 'runway_side', weight: 1, registerCollision: true },
    ],
    aprons: [
      {
        offsetAlongRunway: 0,
        offsetLateral: 96,
        length: 220,
        width: 88,
        blend: 4,
        surface: 'packed_earth',
      },
    ],
    taxiways: [
      {
        offsetAlongRunway: 0,
        offsetLateral: 58,
        length: 430,
        width: 12,
        blend: 3,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: -82,
        offsetLateral: 77,
        length: 38,
        width: 12,
        blend: 3,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: 0,
        offsetLateral: 77,
        length: 38,
        width: 12,
        blend: 3,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: 82,
        offsetLateral: 77,
        length: 38,
        width: 12,
        blend: 3,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: -194,
        offsetLateral: 29,
        length: 58,
        width: 10,
        blend: 3,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: 194,
        offsetLateral: 29,
        length: 58,
        width: 10,
        blend: 3,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
    ],
    taxiRoutes: [
      {
        id: 'a1_north_route',
        points: [
          { offsetAlongRunway: 110, offsetLateral: 140 },
          { offsetAlongRunway: 110, offsetLateral: 58 },
          { offsetAlongRunway: 194, offsetLateral: 58 },
          { offsetAlongRunway: 194, offsetLateral: 0 },
        ],
      },
      {
        id: 'ac47_south_route',
        points: [
          { offsetAlongRunway: 24, offsetLateral: 84 },
          { offsetAlongRunway: 24, offsetLateral: 58 },
          { offsetAlongRunway: -194, offsetLateral: 58 },
          { offsetAlongRunway: -194, offsetLateral: 0 },
        ],
      },
      {
        id: 'f4_north_route',
        points: [
          { offsetAlongRunway: 66, offsetLateral: 120 },
          { offsetAlongRunway: 66, offsetLateral: 58 },
          { offsetAlongRunway: 194, offsetLateral: 58 },
          { offsetAlongRunway: 194, offsetLateral: 0 },
        ],
      },
    ],
    runwayStarts: [
      {
        id: 'south_departure',
        offsetAlongRunway: -218,
        offsetLateral: 0,
        heading: Math.PI,
        holdShortAlongRunway: -194,
        holdShortLateral: 58,
        shortFinalDistance: 170,
        shortFinalAltitude: 42,
      },
      {
        id: 'north_departure',
        offsetAlongRunway: 218,
        offsetLateral: 0,
        heading: 0,
        holdShortAlongRunway: 194,
        holdShortLateral: 58,
        shortFinalDistance: 190,
        shortFinalAltitude: 48,
      },
    ],
    parkingSpots: [
      {
        standId: 'stand_a1',
        modelPath: AircraftModels.A1_SKYRAIDER,
        offsetAlongRunway: 110,
        offsetLateral: 140,
        // Yaw is computed at spawn time from the first taxi-route point.
        // See `computeParkingYaw` in AirfieldLayoutGenerator.
        clearanceRadius: 22,
        taxiRouteId: 'a1_north_route',
        runwayStartId: 'north_departure',
        // A-1 spawns parked and claimable by the player. Previously carried
        // an `npcAutoFlight: { kind: 'ferry', ... }` field which ferried the
        // aircraft off the field within seconds of world boot — useful as an
        // integration test of `npc-fixed-wing-pilot-ai`, but it meant the
        // player never saw the A-1 at the airfield. Removed in
        // `aircraft-a1-spawn-regression` (2026-04-20). A ferry sortie can be
        // reintroduced on a different template if the departing-plane visual
        // is desired.
      },
      {
        standId: 'stand_ac47',
        modelPath: AircraftModels.AC47_SPOOKY,
        offsetAlongRunway: 24,
        offsetLateral: 84,
        clearanceRadius: 30,
        taxiRouteId: 'ac47_south_route',
        runwayStartId: 'south_departure',
      },
      {
        standId: 'stand_f4',
        modelPath: AircraftModels.F4_PHANTOM,
        offsetAlongRunway: 66,
        offsetLateral: 120,
        clearanceRadius: 24,
        taxiRouteId: 'f4_north_route',
        runwayStartId: 'north_departure',
      },
    ],
  },

  forward_strip: {
    id: 'forward_strip',
    runwayLength: 320,
    runwayWidth: 18,
    dispersalOffset: 44,
    structureCount: { min: 4, max: 6 },
    pool: [
      { modelPath: StructureModels.COMMAND_TENT, zone: 'runway_side', weight: 1 },
      { modelPath: StructureModels.GUARD_TOWER, zone: 'perimeter', weight: 1, registerCollision: true },
      { modelPath: StructureModels.FUEL_DRUM, zone: 'dispersal', weight: 2 },
      { modelPath: StructureModels.SUPPLY_CRATE, zone: 'dispersal', weight: 2 },
      { modelPath: GroundVehicleModels.M35_TRUCK, zone: 'runway_side', weight: 1, registerCollision: true },
    ],
    aprons: [
      {
        offsetAlongRunway: 0,
        offsetLateral: 42,
        length: 96,
        width: 34,
        blend: 3,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: -48,
        offsetLateral: 54,
        length: 52,
        width: 48,
        blend: 3,
        surface: 'packed_earth',
      },
    ],
    taxiways: [
      {
        offsetAlongRunway: 0,
        offsetLateral: 24,
        length: 200,
        width: 8,
        blend: 2,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: 0,
        offsetLateral: 33,
        length: 32,
        width: 7,
        blend: 2,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: -128,
        offsetLateral: 12,
        length: 28,
        width: 7,
        blend: 2,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
    ],
    taxiRoutes: [
      {
        id: 'strip_a1_route',
        points: [
          { offsetAlongRunway: -48, offsetLateral: 54 },
          { offsetAlongRunway: -48, offsetLateral: 24 },
          { offsetAlongRunway: -128, offsetLateral: 24 },
          { offsetAlongRunway: -128, offsetLateral: 0 },
        ],
      },
    ],
    runwayStarts: [
      {
        id: 'strip_south_departure',
        offsetAlongRunway: -146,
        offsetLateral: 0,
        heading: Math.PI,
        holdShortAlongRunway: -128,
        holdShortLateral: 24,
        shortFinalDistance: 120,
        shortFinalAltitude: 34,
      },
    ],
    parkingSpots: [
      {
        modelPath: AircraftModels.UH1_HUEY,
        offsetAlongRunway: 0,
        offsetLateral: 24,
        clearanceRadius: 14,
      },
      {
        standId: 'strip_a1',
        modelPath: AircraftModels.A1_SKYRAIDER,
        offsetAlongRunway: -48,
        offsetLateral: 54,
        clearanceRadius: 20,
        taxiRouteId: 'strip_a1_route',
        runwayStartId: 'strip_south_departure',
      },
    ],
  },
};

export function getAirfieldTemplateCompatibilityIssues(template: AirfieldTemplate): AirfieldTemplateCompatibilityIssue[] {
  const issues: AirfieldTemplateCompatibilityIssue[] = [];

  for (const spot of template.parkingSpots) {
    const config = getFixedWingConfigForModelPath(spot.modelPath);
    if (!config) {
      continue;
    }
    if (template.runwayLength < config.operation.minimumRunwayLength) {
      issues.push({
        modelPath: spot.modelPath,
        minimumRunwayLength: config.operation.minimumRunwayLength,
        actualRunwayLength: template.runwayLength,
      });
    }
  }

  return issues;
}
