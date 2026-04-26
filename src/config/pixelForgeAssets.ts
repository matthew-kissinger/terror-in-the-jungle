export type PixelForgeColorSpace = 'srgb' | 'linear';

export interface PixelForgeTextureAsset {
  name: string;
  file: string;
  category: 'foliage' | 'enemy';
  colorSpace: PixelForgeColorSpace;
  billboard: boolean;
}

export interface PixelForgeVegetationAsset {
  id: string;
  textureName: string;
  normalTextureName: string;
  colorFile: string;
  normalFile: string;
  sourceMetaFile: string;
  tier: 'groundCover' | 'midLevel' | 'canopy';
  atlasProfile: 'ground-compact' | 'mid-balanced' | 'canopy-balanced';
  shaderProfile: 'hemisphere' | 'normal-lit';
  tilesX: 4 | 8;
  tilesY: 2 | 4;
  tileSize: 256 | 512;
  worldSize: number;
  yOffset: number;
  variant: string;
}

export interface PixelForgeNpcFactionAsset {
  runtimeFaction: 'US' | 'ARVN' | 'NVA' | 'VC';
  packageFaction: 'usArmy' | 'arvn' | 'nva' | 'vc';
  modelPath: string;
  primaryWeapon: 'm16a1' | 'ak47';
}

export interface PixelForgeNpcClipAsset {
  id: PixelForgeNpcClipId;
  framesPerClip: 8;
  viewGridX: 7;
  viewGridY: 7;
  framesX: 4;
  framesY: 2;
  tileSize: 96;
  durationSec: number;
}

export const PIXEL_FORGE_VEGETATION_ASSETS: readonly PixelForgeVegetationAsset[] = [
  {
    id: 'bambooGrove',
    textureName: 'PixelForge.Vegetation.bambooGrove.color',
    normalTextureName: 'PixelForge.Vegetation.bambooGrove.normal',
    colorFile: 'pixel-forge/vegetation/bambooGrove/bamboo-google-2/imposter.png',
    normalFile: 'pixel-forge/vegetation/bambooGrove/bamboo-google-2/imposter.normal.png',
    sourceMetaFile: 'pixel-forge/vegetation/bambooGrove/bamboo-google-2/imposter.json',
    tier: 'midLevel',
    atlasProfile: 'mid-balanced',
    shaderProfile: 'normal-lit',
    tilesX: 4,
    tilesY: 4,
    tileSize: 512,
    worldSize: 18.13,
    yOffset: 9.06,
    variant: 'bamboo-google-2',
  },
  {
    id: 'fern',
    textureName: 'PixelForge.Vegetation.fern.color',
    normalTextureName: 'PixelForge.Vegetation.fern.normal',
    colorFile: 'pixel-forge/vegetation/fern/fern-danni-bittman/imposter.png',
    normalFile: 'pixel-forge/vegetation/fern/fern-danni-bittman/imposter.normal.png',
    sourceMetaFile: 'pixel-forge/vegetation/fern/fern-danni-bittman/imposter.json',
    tier: 'groundCover',
    atlasProfile: 'ground-compact',
    shaderProfile: 'hemisphere',
    tilesX: 4,
    tilesY: 2,
    tileSize: 256,
    worldSize: 3.74,
    yOffset: -0.48,
    variant: 'fern-danni-bittman',
  },
  {
    id: 'bananaPlant',
    textureName: 'PixelForge.Vegetation.bananaPlant.color',
    normalTextureName: 'PixelForge.Vegetation.bananaPlant.normal',
    colorFile: 'pixel-forge/vegetation/bananaPlant/banana-tree-sean-tarrant/imposter.png',
    normalFile: 'pixel-forge/vegetation/bananaPlant/banana-tree-sean-tarrant/imposter.normal.png',
    sourceMetaFile: 'pixel-forge/vegetation/bananaPlant/banana-tree-sean-tarrant/imposter.json',
    tier: 'midLevel',
    atlasProfile: 'mid-balanced',
    shaderProfile: 'normal-lit',
    tilesX: 4,
    tilesY: 4,
    tileSize: 512,
    worldSize: 4.74,
    yOffset: -0.76,
    variant: 'banana-tree-sean-tarrant',
  },
  {
    id: 'fanPalm',
    textureName: 'PixelForge.Vegetation.fanPalm.color',
    normalTextureName: 'PixelForge.Vegetation.fanPalm.normal',
    colorFile: 'pixel-forge/vegetation/fanPalm/lady-palm-google-1/imposter.png',
    normalFile: 'pixel-forge/vegetation/fanPalm/lady-palm-google-1/imposter.normal.png',
    sourceMetaFile: 'pixel-forge/vegetation/fanPalm/lady-palm-google-1/imposter.json',
    tier: 'midLevel',
    atlasProfile: 'mid-balanced',
    shaderProfile: 'normal-lit',
    tilesX: 4,
    tilesY: 4,
    tileSize: 512,
    worldSize: 16.28,
    yOffset: 8.08,
    variant: 'lady-palm-google-1',
  },
  {
    id: 'elephantEar',
    textureName: 'PixelForge.Vegetation.elephantEar.color',
    normalTextureName: 'PixelForge.Vegetation.elephantEar.normal',
    colorFile: 'pixel-forge/vegetation/elephantEar/big-leaf-plant-reyshapes/imposter.png',
    normalFile: 'pixel-forge/vegetation/elephantEar/big-leaf-plant-reyshapes/imposter.normal.png',
    sourceMetaFile: 'pixel-forge/vegetation/elephantEar/big-leaf-plant-reyshapes/imposter.json',
    tier: 'groundCover',
    atlasProfile: 'ground-compact',
    shaderProfile: 'hemisphere',
    tilesX: 4,
    tilesY: 2,
    tileSize: 256,
    worldSize: 8.07,
    yOffset: 2.34,
    variant: 'big-leaf-plant-reyshapes',
  },
  {
    id: 'coconut',
    textureName: 'PixelForge.Vegetation.coconut.color',
    normalTextureName: 'PixelForge.Vegetation.coconut.normal',
    colorFile: 'pixel-forge/vegetation/coconut/coconut-palm-google/imposter.png',
    normalFile: 'pixel-forge/vegetation/coconut/coconut-palm-google/imposter.normal.png',
    sourceMetaFile: 'pixel-forge/vegetation/coconut/coconut-palm-google/imposter.json',
    tier: 'midLevel',
    atlasProfile: 'mid-balanced',
    shaderProfile: 'normal-lit',
    tilesX: 4,
    tilesY: 4,
    tileSize: 512,
    worldSize: 27.08,
    yOffset: 13.54,
    variant: 'coconut-palm-google',
  },
  {
    id: 'giantPalm',
    textureName: 'PixelForge.Vegetation.giantPalm.color',
    normalTextureName: 'PixelForge.Vegetation.giantPalm.normal',
    colorFile: 'pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png',
    normalFile: 'pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.normal.png',
    sourceMetaFile: 'pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.json',
    tier: 'canopy',
    atlasProfile: 'canopy-balanced',
    shaderProfile: 'normal-lit',
    tilesX: 8,
    tilesY: 4,
    tileSize: 512,
    worldSize: 3.59,
    yOffset: 1.80,
    variant: 'palm-quaternius-2',
  },
];

export const PIXEL_FORGE_BLOCKED_VEGETATION_IDS = [
  'rubberTree',
  'ricePaddyPlants',
  'elephantGrass',
  'areca',
  'mangrove',
  'banyan',
] as const;

export const PIXEL_FORGE_NPC_FACTIONS: readonly PixelForgeNpcFactionAsset[] = [
  { runtimeFaction: 'US', packageFaction: 'usArmy', modelPath: 'npcs/pixel-forge-v1/usArmy.glb', primaryWeapon: 'm16a1' },
  { runtimeFaction: 'ARVN', packageFaction: 'arvn', modelPath: 'npcs/pixel-forge-v1/arvn.glb', primaryWeapon: 'm16a1' },
  { runtimeFaction: 'NVA', packageFaction: 'nva', modelPath: 'npcs/pixel-forge-v1/nva.glb', primaryWeapon: 'ak47' },
  { runtimeFaction: 'VC', packageFaction: 'vc', modelPath: 'npcs/pixel-forge-v1/vc.glb', primaryWeapon: 'ak47' },
];

export const PIXEL_FORGE_NPC_CLIP_IDS = [
  'idle',
  'patrol_walk',
  'traverse_run',
  'advance_fire',
  'walk_fight_forward',
  'death_fall_back',
  'dead_pose',
] as const;

export type PixelForgeNpcClipId = typeof PIXEL_FORGE_NPC_CLIP_IDS[number];

export const PIXEL_FORGE_NPC_CLIPS: readonly PixelForgeNpcClipAsset[] = [
  { id: 'idle', framesPerClip: 8, viewGridX: 7, viewGridY: 7, framesX: 4, framesY: 2, tileSize: 96, durationSec: 4.03 },
  { id: 'patrol_walk', framesPerClip: 8, viewGridX: 7, viewGridY: 7, framesX: 4, framesY: 2, tileSize: 96, durationSec: 1.00 },
  { id: 'traverse_run', framesPerClip: 8, viewGridX: 7, viewGridY: 7, framesX: 4, framesY: 2, tileSize: 96, durationSec: 0.77 },
  { id: 'advance_fire', framesPerClip: 8, viewGridX: 7, viewGridY: 7, framesX: 4, framesY: 2, tileSize: 96, durationSec: 0.90 },
  { id: 'walk_fight_forward', framesPerClip: 8, viewGridX: 7, viewGridY: 7, framesX: 4, framesY: 2, tileSize: 96, durationSec: 1.00 },
  { id: 'death_fall_back', framesPerClip: 8, viewGridX: 7, viewGridY: 7, framesX: 4, framesY: 2, tileSize: 96, durationSec: 1.33 },
  { id: 'dead_pose', framesPerClip: 8, viewGridX: 7, viewGridY: 7, framesX: 4, framesY: 2, tileSize: 96, durationSec: 1.00 },
];

export function pixelForgeNpcTextureName(runtimeFaction: string, clipId: string): string {
  return `PixelForge.NPC.${runtimeFaction}.${clipId}.color`;
}

export const PIXEL_FORGE_TEXTURE_ASSETS: PixelForgeTextureAsset[] = [
  ...PIXEL_FORGE_VEGETATION_ASSETS.flatMap((asset) => [
    {
      name: asset.textureName,
      file: asset.colorFile,
      category: 'foliage' as const,
      colorSpace: 'srgb' as const,
      billboard: true,
    },
    {
      name: asset.normalTextureName,
      file: asset.normalFile,
      category: 'foliage' as const,
      colorSpace: 'linear' as const,
      billboard: true,
    },
  ]),
  ...PIXEL_FORGE_NPC_FACTIONS.flatMap((faction) =>
    PIXEL_FORGE_NPC_CLIPS.map((clip) => ({
      name: pixelForgeNpcTextureName(faction.runtimeFaction, clip.id),
      file: `pixel-forge/npcs/${faction.packageFaction}/${clip.id}/animated-albedo-packed.png`,
      category: 'enemy' as const,
      colorSpace: 'srgb' as const,
      billboard: true,
    })),
  ),
];
