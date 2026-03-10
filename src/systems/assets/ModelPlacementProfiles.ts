import { BuildingModels, PropModels, StructureModels } from './modelPaths';

export type ModelGroundingMode = 'bounds_center_bottom';
export type ModelCollisionMode = 'none' | 'bounds';
export type ModelNormalizeBy = 'height' | 'width' | 'depth' | 'none';

export interface ExpectedModelDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface ModelPlacementProfile {
  groundingMode: ModelGroundingMode;
  normalizeBy: ModelNormalizeBy;
  expectedDimensions?: ExpectedModelDimensions;
  collisionMode: ModelCollisionMode;
  coverHeight?: number;
  minSpacing?: number;
  coverOffset?: number;
  displayScale?: number;
}

export const DEFAULT_MODEL_PLACEMENT_PROFILE: ModelPlacementProfile = {
  groundingMode: 'bounds_center_bottom',
  normalizeBy: 'none',
  collisionMode: 'none',
};

const PROFILE_OVERRIDES: Record<string, ModelPlacementProfile> = {
  [StructureModels.SANDBAG_WALL]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'height',
    expectedDimensions: {
      width: 4.2,
      height: 2.8,
      depth: 1.6,
    },
    collisionMode: 'bounds',
    coverHeight: 2.3,
    minSpacing: 4.3,
    coverOffset: 1.5,
  },
  [StructureModels.HELIPAD]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'bounds',
  },
  [StructureModels.MORTAR_PIT]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
  },
  [StructureModels.FIREBASE_GATE]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
  },
  [StructureModels.GUARD_TOWER]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
    displayScale: 0.9,
  },
  [StructureModels.COMMS_TOWER]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
    displayScale: 0.85,
  },
  [StructureModels.WATER_TOWER]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
    displayScale: 0.9,
  },
  [StructureModels.SANDBAG_BUNKER]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
    coverHeight: 1.5,
  },
  [StructureModels.FOXHOLE]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
  },
  [BuildingModels.BUNKER_NVA]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
  },
  [StructureModels.VILLAGE_HUT]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
  },
  [BuildingModels.FARMHOUSE]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
  },
  [BuildingModels.WAREHOUSE]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
  },
  [StructureModels.FUEL_DRUM]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
    displayScale: 0.5,
  },
  [StructureModels.SUPPLY_CRATE]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
    displayScale: 0.5,
  },
  [StructureModels.AMMO_CRATE]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
    displayScale: 0.5,
  },
  [PropModels.WOODEN_BARREL]: {
    groundingMode: 'bounds_center_bottom',
    normalizeBy: 'none',
    collisionMode: 'none',
    displayScale: 0.5,
  },
};

export function getModelPlacementProfile(modelPath: string): ModelPlacementProfile {
  const override = PROFILE_OVERRIDES[modelPath];
  if (!override) {
    return DEFAULT_MODEL_PLACEMENT_PROFILE;
  }
  return override;
}
