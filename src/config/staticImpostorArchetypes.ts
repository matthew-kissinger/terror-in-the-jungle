// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GroundVehicleModels, PropModels, StructureModels } from './generated/warAssetCatalog';

export type StaticImpostorAtlasMapKind = 'baseColor' | 'normal' | 'depth';

export interface StaticImpostorAtlasMapSet {
  readonly baseColor: string;
  readonly normal: string;
  readonly depth: string;
}

export interface StaticImpostorAtlasBounds {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly radius: number;
}

export interface StaticImpostorArchetype {
  readonly slug: string;
  readonly modelPath: string;
  readonly maps: StaticImpostorAtlasMapSet;
  readonly atlasSize: readonly [number, number];
  readonly tileSize: readonly [number, number];
  readonly columns: number;
  readonly rows: number;
  readonly azimuthFrames: number;
  readonly elevationFrames: number;
  readonly maxTextureSize: number;
  readonly planePaddingScale: number;
  readonly bounds: StaticImpostorAtlasBounds;
  readonly promotionDistanceMeters: number;
  readonly demotionDistanceMeters: number;
  readonly parallaxStrength: number;
  /**
   * Lighting response used by the runtime impostor material.
   *
   * Omitted/default keeps the surface-normal path for hard static props and
   * vehicles. Vegetation uses the foliage-card path so baked tree impostors read
   * through the accepted foliage rig response while preserving atlas normal
   * shape detail.
   */
  readonly lightingProfile?: 'surface-normal' | 'foliage-card';
}

const atlasPath = (slug: string, file: string): string => `./assets/static-impostors/${slug}/${file}`;
export const STATIC_IMPOSTOR_PLANE_PADDING_SCALE = 1.16;
const STATIC_IMPOSTOR_ATLAS_SIZE = [2048, 768] as const;
const STATIC_IMPOSTOR_TILE_SIZE = [256, 256] as const;
const STATIC_IMPOSTOR_COLUMNS = 8;
const STATIC_IMPOSTOR_ROWS = 3;
const STATIC_IMPOSTOR_MAX_TEXTURE_SIZE = 2048;

export const PixelForgeStaticPropModels = {
  GRASS_LARGE: 'props/pixel-forge/grass-large.glb',
  PATCH_GRASS_LARGE: 'props/pixel-forge/patch-grass-large.glb',
  ROCK_FLAT_GRASS: 'props/pixel-forge/rock-flat-grass.glb',
  TREE: 'props/pixel-forge/tree.glb',
  TREE_TALL: 'props/pixel-forge/tree-tall.glb',
} as const;

interface StaticImpostorArchetypeInput {
  readonly slug: string;
  readonly modelPath: string;
  readonly bounds: StaticImpostorAtlasBounds;
  readonly promotionDistanceMeters: number;
  readonly demotionDistanceMeters: number;
  readonly parallaxStrength: number;
  readonly lightingProfile?: StaticImpostorArchetype['lightingProfile'];
}

function createStaticImpostorArchetype(input: StaticImpostorArchetypeInput): StaticImpostorArchetype {
  return {
    slug: input.slug,
    modelPath: input.modelPath,
    maps: {
      baseColor: atlasPath(input.slug, 'atlas.base-color.png'),
      normal: atlasPath(input.slug, 'atlas.normal.png'),
      depth: atlasPath(input.slug, 'atlas.depth.png'),
    },
    atlasSize: STATIC_IMPOSTOR_ATLAS_SIZE,
    tileSize: STATIC_IMPOSTOR_TILE_SIZE,
    columns: STATIC_IMPOSTOR_COLUMNS,
    rows: STATIC_IMPOSTOR_ROWS,
    azimuthFrames: STATIC_IMPOSTOR_COLUMNS,
    elevationFrames: STATIC_IMPOSTOR_ROWS,
    maxTextureSize: STATIC_IMPOSTOR_MAX_TEXTURE_SIZE,
    planePaddingScale: STATIC_IMPOSTOR_PLANE_PADDING_SCALE,
    bounds: input.bounds,
    promotionDistanceMeters: input.promotionDistanceMeters,
    demotionDistanceMeters: input.demotionDistanceMeters,
    parallaxStrength: input.parallaxStrength,
    ...(input.lightingProfile ? { lightingProfile: input.lightingProfile } : {}),
  };
}

/**
 * First authored-static impostor rollout.
 *
 * This registry is intentionally narrow: only assets whose offline atlas files
 * exist are registered, so uncaptured GLBs keep the current authored mesh path.
 * The expansion path is to run `npm run assets:bake-static-impostors` for more
 * imported static archetypes, then add the generated metadata here.
 */
export const STATIC_IMPOSTOR_ARCHETYPES: Record<string, StaticImpostorArchetype> = {
  [StructureModels.FUEL_DRUM]: createStaticImpostorArchetype({
    slug: 'fuel-drum',
    modelPath: StructureModels.FUEL_DRUM,
    bounds: { center: [0, 0.46, 0], size: [0.602, 0.92, 0.602], radius: 0.627 },
    promotionDistanceMeters: 155,
    demotionDistanceMeters: 125,
    parallaxStrength: 0.035,
  }),
  [StructureModels.SUPPLY_CRATE]: createStaticImpostorArchetype({
    slug: 'supply-crate',
    modelPath: StructureModels.SUPPLY_CRATE,
    bounds: { center: [0, 0.27, 0], size: [0.608, 0.54, 1.008], radius: 0.648 },
    promotionDistanceMeters: 155,
    demotionDistanceMeters: 125,
    parallaxStrength: 0.04,
  }),
  [StructureModels.GUARD_TOWER]: createStaticImpostorArchetype({
    slug: 'guard-tower',
    modelPath: StructureModels.GUARD_TOWER,
    bounds: { center: [0, 3.796, 0], size: [3.22, 7.592, 3.22], radius: 4.426 },
    promotionDistanceMeters: 220,
    demotionDistanceMeters: 180,
    parallaxStrength: 0.06,
  }),
  [StructureModels.VILLAGE_HUT]: createStaticImpostorArchetype({
    slug: 'village-hut',
    modelPath: StructureModels.VILLAGE_HUT,
    bounds: { center: [0, 1.847, 0], size: [4.665, 3.695, 4.083], radius: 3.609 },
    promotionDistanceMeters: 205,
    demotionDistanceMeters: 170,
    parallaxStrength: 0.05,
  }),
  [PropModels.WOODEN_BARREL]: createStaticImpostorArchetype({
    slug: 'wooden-barrel',
    modelPath: PropModels.WOODEN_BARREL,
    bounds: { center: [0, 0.45, 0], size: [0.7, 0.9, 0.714], radius: 0.673 },
    promotionDistanceMeters: 155,
    demotionDistanceMeters: 125,
    parallaxStrength: 0.04,
  }),
  [GroundVehicleModels.M151_JEEP]: createStaticImpostorArchetype({
    slug: 'm151-jeep',
    modelPath: GroundVehicleModels.M151_JEEP,
    bounds: { center: [0, 0.725, 0], size: [1.82, 1.45, 3.495], radius: 2.099 },
    promotionDistanceMeters: 190,
    demotionDistanceMeters: 155,
    parallaxStrength: 0.05,
  }),
  [GroundVehicleModels.M35_TRUCK]: createStaticImpostorArchetype({
    slug: 'm35-truck',
    modelPath: GroundVehicleModels.M35_TRUCK,
    bounds: { center: [0, 1.293, 0], size: [2.68, 2.587, 6.29], radius: 3.655 },
    promotionDistanceMeters: 240,
    demotionDistanceMeters: 200,
    parallaxStrength: 0.055,
  }),
  [GroundVehicleModels.M48_PATTON]: createStaticImpostorArchetype({
    slug: 'm48-patton',
    modelPath: GroundVehicleModels.M48_PATTON,
    bounds: { center: [0, 1.67, 0], size: [3.74, 3.34, 9.443], radius: 5.346 },
    promotionDistanceMeters: 260,
    demotionDistanceMeters: 220,
    parallaxStrength: 0.06,
  }),
  [GroundVehicleModels.T54_TANK]: createStaticImpostorArchetype({
    slug: 't54-tank',
    modelPath: GroundVehicleModels.T54_TANK,
    bounds: { center: [0, 1.038, 0], size: [3.4, 2.075, 8.898], radius: 4.875 },
    promotionDistanceMeters: 260,
    demotionDistanceMeters: 220,
    parallaxStrength: 0.06,
  }),
  [GroundVehicleModels.ZIL_157]: createStaticImpostorArchetype({
    slug: 'zil-157',
    modelPath: GroundVehicleModels.ZIL_157,
    bounds: { center: [0, 1.358, 0], size: [2.5, 2.715, 5.975], radius: 3.512 },
    promotionDistanceMeters: 240,
    demotionDistanceMeters: 200,
    parallaxStrength: 0.055,
  }),
  [PixelForgeStaticPropModels.GRASS_LARGE]: createStaticImpostorArchetype({
    slug: 'pixel-forge-grass-large',
    modelPath: PixelForgeStaticPropModels.GRASS_LARGE,
    bounds: { center: [0, 7.125, 0], size: [47.59, 14.25, 48.731], radius: 34.794 },
    promotionDistanceMeters: 115,
    demotionDistanceMeters: 90,
    parallaxStrength: 0.025,
    lightingProfile: 'foliage-card',
  }),
  [PixelForgeStaticPropModels.PATCH_GRASS_LARGE]: createStaticImpostorArchetype({
    slug: 'pixel-forge-patch-grass-large',
    modelPath: PixelForgeStaticPropModels.PATCH_GRASS_LARGE,
    bounds: { center: [0, 0, 0], size: [140, 0, 120], radius: 92.195 },
    promotionDistanceMeters: 115,
    demotionDistanceMeters: 90,
    parallaxStrength: 0.02,
    lightingProfile: 'foliage-card',
  }),
  [PixelForgeStaticPropModels.ROCK_FLAT_GRASS]: createStaticImpostorArchetype({
    slug: 'pixel-forge-rock-flat-grass',
    modelPath: PixelForgeStaticPropModels.ROCK_FLAT_GRASS,
    bounds: { center: [0, 11.289, 0], size: [178.639, 22.578, 144.784], radius: 115.525 },
    promotionDistanceMeters: 135,
    demotionDistanceMeters: 105,
    parallaxStrength: 0.025,
    lightingProfile: 'foliage-card',
  }),
  [PixelForgeStaticPropModels.TREE]: createStaticImpostorArchetype({
    slug: 'pixel-forge-tree',
    modelPath: PixelForgeStaticPropModels.TREE,
    bounds: { center: [0, 70.549, 0], size: [55.286, 141.097, 52.624], radius: 80.209 },
    promotionDistanceMeters: 170,
    demotionDistanceMeters: 135,
    parallaxStrength: 0.04,
    lightingProfile: 'foliage-card',
  }),
  [PixelForgeStaticPropModels.TREE_TALL]: createStaticImpostorArchetype({
    slug: 'pixel-forge-tree-tall',
    modelPath: PixelForgeStaticPropModels.TREE_TALL,
    bounds: { center: [0, 85.549, 0], size: [55.286, 171.097, 52.624], radius: 93.675 },
    promotionDistanceMeters: 190,
    demotionDistanceMeters: 150,
    parallaxStrength: 0.045,
    lightingProfile: 'foliage-card',
  }),
};

export function getStaticImpostorArchetype(modelPath: string): StaticImpostorArchetype | undefined {
  return STATIC_IMPOSTOR_ARCHETYPES[modelPath];
}

export function getStaticImpostorArchetypes(): StaticImpostorArchetype[] {
  return Object.values(STATIC_IMPOSTOR_ARCHETYPES);
}

export function isStaticImpostorArchetype(modelPath: string): boolean {
  return getStaticImpostorArchetype(modelPath) !== undefined;
}
