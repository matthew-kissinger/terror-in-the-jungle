import { BuildingModels, StructureModels } from './modelPaths';

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
      width: 2.1,
      height: 1.4,
      depth: 0.8,
    },
    collisionMode: 'bounds',
    coverHeight: 1.15,
    minSpacing: 2.15,
    coverOffset: 0.75,
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
};

export function getModelPlacementProfile(modelPath: string): ModelPlacementProfile {
  const override = PROFILE_OVERRIDES[modelPath];
  if (!override) {
    return DEFAULT_MODEL_PLACEMENT_PROFILE;
  }
  return override;
}
