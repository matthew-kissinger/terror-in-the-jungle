import { StructureModels, GroundVehicleModels } from '../assets/modelPaths';

export type FirebaseZone = 'perimeter' | 'interior' | 'entrance' | 'corner';

export interface FirebaseStructureEntry {
  modelPath: string;
  zone: FirebaseZone;
  weight: number;
  registerCollision?: boolean;
  facesOutward?: boolean;
}

export interface FirebaseTemplate {
  id: string;
  footprintRadius: number;
  structureCount: { min: number; max: number };
  zones: {
    perimeter: { innerRadius: number; outerRadius: number };
    interior: { radius: number };
    entrance: { angle: number; width: number };
  };
  pool: FirebaseStructureEntry[];
}

export const FIREBASE_TEMPLATES: Record<string, FirebaseTemplate> = {
  us_small: {
    id: 'us_small',
    footprintRadius: 34,
    structureCount: { min: 6, max: 8 },
    zones: {
      perimeter: { innerRadius: 22, outerRadius: 30 },
      interior: { radius: 18 },
      entrance: { angle: 0, width: 8 },
    },
    pool: [
      { modelPath: StructureModels.GUARD_TOWER, zone: 'corner', weight: 3, registerCollision: true, facesOutward: true },
      { modelPath: StructureModels.COMMAND_TENT, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.AMMO_BUNKER, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.AID_STATION, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.GENERATOR_SHED, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.WATER_TOWER, zone: 'interior', weight: 1, registerCollision: true },
      { modelPath: StructureModels.SUPPLY_CRATE, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.FUEL_DRUM, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.FIREBASE_GATE, zone: 'entrance', weight: 1 },
    ],
  },

  us_medium: {
    id: 'us_medium',
    footprintRadius: 46,
    structureCount: { min: 10, max: 14 },
    zones: {
      perimeter: { innerRadius: 30, outerRadius: 40 },
      interior: { radius: 26 },
      entrance: { angle: 0, width: 10 },
    },
    pool: [
      { modelPath: StructureModels.GUARD_TOWER, zone: 'corner', weight: 4, registerCollision: true, facesOutward: true },
      { modelPath: StructureModels.TOC_BUNKER, zone: 'interior', weight: 1, registerCollision: true },
      { modelPath: StructureModels.BARRACKS_TENT, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.COMMAND_TENT, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.AMMO_BUNKER, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.AID_STATION, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.COMMS_TOWER, zone: 'interior', weight: 1, registerCollision: true },
      { modelPath: StructureModels.WATER_TOWER, zone: 'interior', weight: 1, registerCollision: true },
      { modelPath: StructureModels.GENERATOR_SHED, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.SUPPLY_CRATE, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.FUEL_DRUM, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.AMMO_CRATE, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.FIREBASE_GATE, zone: 'entrance', weight: 1 },
    ],
  },

  us_large: {
    id: 'us_large',
    footprintRadius: 60,
    structureCount: { min: 15, max: 21 },
    zones: {
      perimeter: { innerRadius: 40, outerRadius: 55 },
      interior: { radius: 38 },
      entrance: { angle: 0, width: 12 },
    },
    pool: [
      { modelPath: StructureModels.GUARD_TOWER, zone: 'corner', weight: 5, registerCollision: true, facesOutward: true },
      { modelPath: StructureModels.TOC_BUNKER, zone: 'interior', weight: 1, registerCollision: true },
      { modelPath: StructureModels.BARRACKS_TENT, zone: 'interior', weight: 3 },
      { modelPath: StructureModels.COMMAND_TENT, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.AMMO_BUNKER, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.AID_STATION, zone: 'interior', weight: 1 },
      { modelPath: StructureModels.ARTILLERY_PIT, zone: 'interior', weight: 1, registerCollision: true },
      { modelPath: StructureModels.COMMS_TOWER, zone: 'interior', weight: 1, registerCollision: true },
      { modelPath: StructureModels.WATER_TOWER, zone: 'interior', weight: 1, registerCollision: true },
      { modelPath: StructureModels.GENERATOR_SHED, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.MORTAR_PIT, zone: 'perimeter', weight: 2, registerCollision: true },
      { modelPath: StructureModels.SUPPLY_CRATE, zone: 'interior', weight: 3 },
      { modelPath: StructureModels.FUEL_DRUM, zone: 'interior', weight: 3 },
      { modelPath: StructureModels.AMMO_CRATE, zone: 'interior', weight: 2 },
      { modelPath: StructureModels.FIREBASE_GATE, zone: 'entrance', weight: 1 },
      { modelPath: GroundVehicleModels.M35_TRUCK, zone: 'interior', weight: 1, registerCollision: true },
    ],
  },
};
