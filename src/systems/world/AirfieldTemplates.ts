import { StructureModels, AircraftModels, GroundVehicleModels, BuildingModels } from '../assets/modelPaths';

export type AirfieldZone = 'runway_side' | 'dispersal' | 'perimeter' | 'parking';

export interface AirfieldStructureEntry {
  modelPath: string;
  zone: AirfieldZone;
  weight: number;
  registerCollision?: boolean;
}

export interface AirfieldParkingSpot {
  modelPath: string;
  offsetAlongRunway: number;   // fraction 0-1 along runway
  offsetLateral: number;       // meters perpendicular to runway
}

export interface AirfieldTemplate {
  id: string;
  runwayLength: number;        // meters
  runwayWidth: number;         // meters
  taxiwayWidth: number;        // meters
  dispersalOffset: number;     // meters from runway centerline
  structureCount: { min: number; max: number };
  pool: AirfieldStructureEntry[];
  parkingSpots: AirfieldParkingSpot[];
}

export const AIRFIELD_TEMPLATES: Record<string, AirfieldTemplate> = {
  us_airbase: {
    id: 'us_airbase',
    runwayLength: 200,
    runwayWidth: 20,
    taxiwayWidth: 8,
    dispersalOffset: 40,
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
    parkingSpots: [
      { modelPath: AircraftModels.UH1_HUEY, offsetAlongRunway: 0.2, offsetLateral: 45 },
      { modelPath: AircraftModels.A1_SKYRAIDER, offsetAlongRunway: 0.5, offsetLateral: 50 },
      { modelPath: AircraftModels.F4_PHANTOM, offsetAlongRunway: 0.8, offsetLateral: 48 },
    ],
  },

  forward_strip: {
    id: 'forward_strip',
    runwayLength: 120,
    runwayWidth: 14,
    taxiwayWidth: 6,
    dispersalOffset: 25,
    structureCount: { min: 4, max: 6 },
    pool: [
      { modelPath: StructureModels.COMMAND_TENT, zone: 'runway_side', weight: 1 },
      { modelPath: StructureModels.GUARD_TOWER, zone: 'perimeter', weight: 1, registerCollision: true },
      { modelPath: StructureModels.FUEL_DRUM, zone: 'dispersal', weight: 2 },
      { modelPath: StructureModels.SUPPLY_CRATE, zone: 'dispersal', weight: 2 },
      { modelPath: GroundVehicleModels.M35_TRUCK, zone: 'runway_side', weight: 1, registerCollision: true },
    ],
    parkingSpots: [
      { modelPath: AircraftModels.UH1_HUEY, offsetAlongRunway: 0.3, offsetLateral: 30 },
      { modelPath: AircraftModels.A1_SKYRAIDER, offsetAlongRunway: 0.7, offsetLateral: 32 },
    ],
  },
};
