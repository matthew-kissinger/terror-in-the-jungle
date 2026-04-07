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
  modelPath: string;
  offsetAlongRunway: number;   // meters along runway centerline from airfield origin
  offsetLateral: number;       // meters perpendicular to runway centerline
  yaw?: number;                // radians relative to runway heading
  clearanceRadius?: number;    // spacing radius used during procedural structure placement
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

export interface AirfieldTemplate {
  id: string;
  runwayLength: number;        // meters
  runwayWidth: number;         // meters
  dispersalOffset: number;     // meters from runway centerline
  structureCount: { min: number; max: number };
  pool: AirfieldStructureEntry[];
  aprons: AirfieldSurfaceRect[];
  taxiways: AirfieldSurfaceRect[];
  parkingSpots: AirfieldParkingSpot[];
}

export interface AirfieldTemplateCompatibilityIssue {
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
        offsetLateral: 55,
        length: 82,
        width: 12,
        blend: 3,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: -140,
        offsetLateral: 55,
        length: 82,
        width: 10,
        blend: 3,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
      {
        offsetAlongRunway: 140,
        offsetLateral: 55,
        length: 82,
        width: 10,
        blend: 3,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
    ],
    parkingSpots: [
      {
        modelPath: AircraftModels.A1_SKYRAIDER,
        offsetAlongRunway: -82,
        offsetLateral: 96,
        clearanceRadius: 22,
      },
      {
        modelPath: AircraftModels.AC47_SPOOKY,
        offsetAlongRunway: 0,
        offsetLateral: 96,
        clearanceRadius: 30,
      },
      {
        modelPath: AircraftModels.F4_PHANTOM,
        offsetAlongRunway: 82,
        offsetLateral: 96,
        clearanceRadius: 24,
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
    ],
    taxiways: [
      {
        offsetAlongRunway: 0,
        offsetLateral: 25,
        length: 32,
        width: 7,
        blend: 2,
        yaw: Math.PI / 2,
        surface: 'packed_earth',
      },
    ],
    parkingSpots: [
      {
        modelPath: AircraftModels.UH1_HUEY,
        offsetAlongRunway: -22,
        offsetLateral: 42,
        clearanceRadius: 14,
      },
      {
        modelPath: AircraftModels.A1_SKYRAIDER,
        offsetAlongRunway: 24,
        offsetLateral: 42,
        clearanceRadius: 20,
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
