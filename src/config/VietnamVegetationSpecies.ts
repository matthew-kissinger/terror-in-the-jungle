// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import {
  PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
  PIXEL_FORGE_RETIRED_VEGETATION_IDS,
  PIXEL_FORGE_VEGETATION_ASSETS,
} from './pixelForgeAssets';
import type { VegetationAtlasProfile, VegetationTier } from './vegetationTypes';

export type VietnamVegetationSpeciesId =
  | 'bambooGrove'
  | 'bananaPlant'
  | 'coconut'
  | 'elephantEar'
  | 'fanPalm'
  | 'fern'
  | 'areca'
  | 'banyan'
  | 'elephantGrass'
  | 'mangrove'
  | 'ricePaddyPlants'
  | 'rubberTree'
  | 'teakBroadleaf'
  | 'jungleDeadfall'
  | 'lianaVines';

export type VietnamVegetationSourceStatus =
  | 'acceptedRuntimeAtlas'
  | 'blockedPendingSource'
  | 'sourceSpecOnly'
  | 'retired';

export type VegetationLodBand =
  | 'closeHeroHybrid'
  | 'midClusterCard'
  | 'farOctahedralImpostor'
  | 'horizonCanopyCoverage';

export type VegetationBiomeRole =
  | 'denseJungle'
  | 'highland'
  | 'riverbank'
  | 'swamp'
  | 'ricePaddy'
  | 'cleared'
  | 'defoliated'
  | 'trailEdge';

export interface VegetationSourceAssetRequirements {
  sourceKind: 'accepted-impostor-atlas' | 'new-glb-family' | 'new-atlas-family' | 'blocked-reroll';
  minimumVariants: number;
  requiredRuntimeArtifacts: readonly string[];
  budgetNotes: string;
  acceptanceGates: readonly string[];
}

export interface VegetationAggregateLodSpec {
  band: VegetationLodBand;
  distanceMinMeters: number;
  distanceMaxMeters: number;
  representation: string;
  owner: 'GlobalBillboardSystem' | 'VegetationScatterer' | 'futureForestAggregate' | 'TerrainMaterial';
  webgpuPath: 'not-required' | 'optional-gpu-cull' | 'required-webgpu-proof';
}

export interface VietnamVegetationSpeciesSpec {
  id: VietnamVegetationSpeciesId;
  displayName: string;
  tier: VegetationTier;
  sourceStatus: VietnamVegetationSourceStatus;
  existingRuntimeTypeId: string | null;
  preferredBiomes: readonly VegetationBiomeRole[];
  sourceRequirements: VegetationSourceAssetRequirements;
  lod: readonly VegetationAggregateLodSpec[];
  notes: string;
}

export const VIETNAM_VEGETATION_LOD_BANDS: Record<VegetationLodBand, VegetationAggregateLodSpec> = {
  closeHeroHybrid: {
    band: 'closeHeroHybrid',
    distanceMinMeters: 0,
    distanceMaxMeters: 55,
    representation: 'Accepted close GLB trunk/crown family or high-resolution card cluster; never a Fable generated mesh.',
    owner: 'futureForestAggregate',
    webgpuPath: 'not-required',
  },
  midClusterCard: {
    band: 'midClusterCard',
    distanceMinMeters: 45,
    distanceMaxMeters: 260,
    representation: 'Clustered billboard/card stands authored through TIJ biome scatter and route/base exclusions.',
    owner: 'VegetationScatterer',
    webgpuPath: 'optional-gpu-cull',
  },
  farOctahedralImpostor: {
    band: 'farOctahedralImpostor',
    distanceMinMeters: 220,
    distanceMaxMeters: 700,
    representation: 'Future octahedral albedo/normal/depth impostor atlas baked from accepted TIJ source assets.',
    owner: 'futureForestAggregate',
    webgpuPath: 'required-webgpu-proof',
  },
  horizonCanopyCoverage: {
    band: 'horizonCanopyCoverage',
    distanceMinMeters: 550,
    distanceMaxMeters: 2500,
    representation: 'Low-cost procedural canopy coverage/tint in TerrainMaterial; not individual tree geometry.',
    owner: 'TerrainMaterial',
    webgpuPath: 'not-required',
  },
};

const ACCEPTED_ATLAS_GATES = [
  'npm run check:vegetation-horizon',
  'npm run check:vegetation-grounding',
  'npm run check:asset-gallery',
] as const;

const NEW_TREE_FAMILY_GATES = [
  'npm run assets:import-war-catalog',
  'npm run check:asset-gallery',
  'npm run check:vegetation-horizon',
  'npm run check:vegetation-grounding',
  'npm run check:culling-baseline',
] as const;

const NEW_ATLAS_FAMILY_GATES = [
  'npm run check:pixel-forge-textures',
  'npm run check:pixel-forge-optics',
  'npm run check:vegetation-horizon',
  'npm run check:vegetation-grounding',
] as const;

function acceptedAtlasRequirements(atlasProfile: VegetationAtlasProfile): VegetationSourceAssetRequirements {
  return {
    sourceKind: 'accepted-impostor-atlas',
    minimumVariants: atlasProfile === 'canopy-balanced' || atlasProfile === 'canopy-hero' ? 2 : 1,
    requiredRuntimeArtifacts: ['color impostor atlas', 'normal impostor atlas', 'source metadata json'],
    budgetNotes: 'Already imported through Pixel Forge vegetation atlas acceptance; runtime remains instanced/bucketed.',
    acceptanceGates: ACCEPTED_ATLAS_GATES,
  };
}

function blockedRerollRequirements(kind: 'new-glb-family' | 'new-atlas-family'): VegetationSourceAssetRequirements {
  return {
    sourceKind: 'blocked-reroll',
    minimumVariants: kind === 'new-glb-family' ? 3 : 2,
    requiredRuntimeArtifacts: kind === 'new-glb-family'
      ? ['LOD0 GLB family', 'collision/footprint proxy', 'impostor bake source metadata']
      : ['color impostor atlas', 'normal/depth impostor atlas', 'source metadata json'],
    budgetNotes: 'Blocked until source assets satisfy ASSET_ACCEPTANCE_STANDARD budgets, provenance, visual proof, and culling evidence.',
    acceptanceGates: kind === 'new-glb-family' ? NEW_TREE_FAMILY_GATES : NEW_ATLAS_FAMILY_GATES,
  };
}

function sourceSpecOnlyRequirements(kind: 'new-glb-family' | 'new-atlas-family'): VegetationSourceAssetRequirements {
  return {
    sourceKind: kind,
    minimumVariants: kind === 'new-glb-family' ? 3 : 2,
    requiredRuntimeArtifacts: kind === 'new-glb-family'
      ? ['LOD0 GLB family', 'mid-card bake', 'octahedral impostor bake source metadata']
      : ['color impostor atlas', 'normal/depth impostor atlas', 'source metadata json'],
    budgetNotes: 'Source specification only. No runtime asset may be added without importer, gallery, visual, and perf evidence.',
    acceptanceGates: kind === 'new-glb-family' ? NEW_TREE_FAMILY_GATES : NEW_ATLAS_FAMILY_GATES,
  };
}

function lodBands(
  ...bands: VegetationLodBand[]
): readonly VegetationAggregateLodSpec[] {
  return bands.map((band) => VIETNAM_VEGETATION_LOD_BANDS[band]);
}

function acceptedSpec(
  id: Extract<VietnamVegetationSpeciesId, 'bambooGrove' | 'bananaPlant' | 'coconut' | 'elephantEar' | 'fanPalm' | 'fern'>,
  displayName: string,
  preferredBiomes: readonly VegetationBiomeRole[],
  notes: string,
): VietnamVegetationSpeciesSpec {
  const asset = PIXEL_FORGE_VEGETATION_ASSETS.find((candidate) => candidate.id === id);
  if (!asset) {
    throw new Error(`Missing accepted Pixel Forge vegetation asset for ${id}`);
  }

  return {
    id,
    displayName,
    tier: asset.tier,
    sourceStatus: 'acceptedRuntimeAtlas',
    existingRuntimeTypeId: asset.id,
    preferredBiomes,
    sourceRequirements: acceptedAtlasRequirements(asset.atlasProfile),
    lod: asset.tier === 'canopy'
      ? lodBands('midClusterCard', 'horizonCanopyCoverage')
      : lodBands('midClusterCard'),
    notes,
  };
}

export const VIETNAM_VEGETATION_SPECIES: readonly VietnamVegetationSpeciesSpec[] = [
  acceptedSpec(
    'bambooGrove',
    'Bamboo grove',
    ['denseJungle', 'highland', 'trailEdge'],
    'Accepted mid-level atlas family; remains a grove/stand asset, not a broad canopy-tree substitute.',
  ),
  acceptedSpec(
    'bananaPlant',
    'Banana plant',
    ['denseJungle', 'riverbank', 'ricePaddy', 'swamp'],
    'Accepted mid-level foliage for village edges, riverbanks, and wet clearings.',
  ),
  acceptedSpec(
    'coconut',
    'Coconut palm',
    ['riverbank', 'swamp', 'denseJungle'],
    'Accepted canopy palm runtime atlas; useful for palms but not enough for broadleaf jungle diversity.',
  ),
  acceptedSpec(
    'elephantEar',
    'Elephant ear understory',
    ['denseJungle', 'riverbank', 'swamp'],
    'Accepted ground-cover/understory atlas; anchors wet jungle understory.',
  ),
  acceptedSpec(
    'fanPalm',
    'Fan palm',
    ['denseJungle', 'riverbank', 'swamp'],
    'Accepted canopy palm runtime atlas; current R1 palm-tree tier depends on this family.',
  ),
  acceptedSpec(
    'fern',
    'Jungle fern',
    ['denseJungle', 'highland', 'cleared', 'trailEdge', 'defoliated'],
    'Accepted ground-cover atlas and the safest dense-near-cover filler.',
  ),
  {
    id: 'areca',
    displayName: 'Areca palm',
    tier: 'canopy',
    sourceStatus: 'blockedPendingSource',
    existingRuntimeTypeId: null,
    preferredBiomes: ['denseJungle', 'riverbank', 'swamp'],
    sourceRequirements: blockedRerollRequirements('new-glb-family'),
    lod: lodBands('closeHeroHybrid', 'midClusterCard', 'farOctahedralImpostor', 'horizonCanopyCoverage'),
    notes: 'Blocked Pixel Forge candidate. Accept only as a TIJ-authored palm family with close/mid/far tiers.',
  },
  {
    id: 'banyan',
    displayName: 'Banyan / strangler fig',
    tier: 'canopy',
    sourceStatus: 'blockedPendingSource',
    existingRuntimeTypeId: null,
    preferredBiomes: ['denseJungle', 'riverbank', 'trailEdge'],
    sourceRequirements: blockedRerollRequirements('new-glb-family'),
    lod: lodBands('closeHeroHybrid', 'midClusterCard', 'farOctahedralImpostor', 'horizonCanopyCoverage'),
    notes: 'Primary future hero-tree candidate. Needs roots/trunk readability and aggregate crown proxy rather than true meshlet Nanite.',
  },
  {
    id: 'elephantGrass',
    displayName: 'Elephant grass',
    tier: 'midLevel',
    sourceStatus: 'blockedPendingSource',
    existingRuntimeTypeId: null,
    preferredBiomes: ['cleared', 'trailEdge', 'riverbank', 'ricePaddy'],
    sourceRequirements: blockedRerollRequirements('new-atlas-family'),
    lod: lodBands('midClusterCard'),
    notes: 'Blocked candidate for route-edge concealment. Must preserve NPC/vehicle readability before runtime use.',
  },
  {
    id: 'mangrove',
    displayName: 'Mangrove',
    tier: 'canopy',
    sourceStatus: 'blockedPendingSource',
    existingRuntimeTypeId: null,
    preferredBiomes: ['swamp', 'riverbank'],
    sourceRequirements: blockedRerollRequirements('new-glb-family'),
    lod: lodBands('closeHeroHybrid', 'midClusterCard', 'farOctahedralImpostor', 'horizonCanopyCoverage'),
    notes: 'Requires accepted water/riverbank placement authority before default runtime scatter.',
  },
  {
    id: 'ricePaddyPlants',
    displayName: 'Rice paddy plants',
    tier: 'groundCover',
    sourceStatus: 'blockedPendingSource',
    existingRuntimeTypeId: null,
    preferredBiomes: ['ricePaddy', 'riverbank'],
    sourceRequirements: blockedRerollRequirements('new-atlas-family'),
    lod: lodBands('midClusterCard'),
    notes: 'Blocked candidate; should wait for water/basin visual authority before paddy placement is expanded.',
  },
  {
    id: 'rubberTree',
    displayName: 'Rubber tree',
    tier: 'canopy',
    sourceStatus: 'blockedPendingSource',
    existingRuntimeTypeId: null,
    preferredBiomes: ['denseJungle', 'cleared', 'trailEdge'],
    sourceRequirements: blockedRerollRequirements('new-glb-family'),
    lod: lodBands('closeHeroHybrid', 'midClusterCard', 'farOctahedralImpostor', 'horizonCanopyCoverage'),
    notes: 'Blocked candidate for plantation and road-edge silhouettes. Needs repeated-row readability without becoming a prop-tree copy.',
  },
  {
    id: 'teakBroadleaf',
    displayName: 'Teak / broadleaf canopy',
    tier: 'canopy',
    sourceStatus: 'sourceSpecOnly',
    existingRuntimeTypeId: null,
    preferredBiomes: ['denseJungle', 'highland', 'trailEdge'],
    sourceRequirements: sourceSpecOnlyRequirements('new-glb-family'),
    lod: lodBands('closeHeroHybrid', 'midClusterCard', 'farOctahedralImpostor', 'horizonCanopyCoverage'),
    notes: 'New TIJ source spec for broadleaf diversity; no existing Pixel Forge candidate is accepted for this role.',
  },
  {
    id: 'jungleDeadfall',
    displayName: 'Jungle deadfall',
    tier: 'midLevel',
    sourceStatus: 'sourceSpecOnly',
    existingRuntimeTypeId: null,
    preferredBiomes: ['denseJungle', 'defoliated', 'trailEdge'],
    sourceRequirements: sourceSpecOnlyRequirements('new-glb-family'),
    lod: lodBands('closeHeroHybrid', 'midClusterCard'),
    notes: 'New TIJ source spec for ground readability and route occlusion, with explicit collision/footprint review before gameplay use.',
  },
  {
    id: 'lianaVines',
    displayName: 'Liana vines',
    tier: 'midLevel',
    sourceStatus: 'sourceSpecOnly',
    existingRuntimeTypeId: null,
    preferredBiomes: ['denseJungle', 'riverbank', 'swamp'],
    sourceRequirements: sourceSpecOnlyRequirements('new-atlas-family'),
    lod: lodBands('midClusterCard', 'horizonCanopyCoverage'),
    notes: 'New TIJ source spec for vertical canopy breakup. Must be attached to accepted tree families, not scattered as free-floating ribbons.',
  },
];

export const FOREST_NANITE_LITE_STRATEGY = {
  ownsTrueMeshlets: false,
  copiesFableAssets: false,
  runtimeDefaultEnabled: false,
  requiredRendererFeatureIds: [
    'gpuForestCulling',
    'octahedralImpostorBake',
  ],
  adaptationPath: [
    'CPU-authored species and biome proof',
    'accepted source assets through ASSET_ACCEPTANCE_STANDARD',
    'mid/far aggregate culling against current billboard backend',
    'optional WebGPU compact/indirect proof',
    'octahedral impostor bake only after accepted close source assets exist',
  ],
} as const;

const BLOCKED_SPEC_IDS = new Set<string>(PIXEL_FORGE_BLOCKED_VEGETATION_IDS);
const RETIRED_SPEC_IDS = new Set<string>(PIXEL_FORGE_RETIRED_VEGETATION_IDS);

export function getVietnamVegetationSpeciesById(
  id: VietnamVegetationSpeciesId,
): VietnamVegetationSpeciesSpec {
  const spec = VIETNAM_VEGETATION_SPECIES.find((candidate) => candidate.id === id);
  if (!spec) {
    throw new Error(`Unknown Vietnam vegetation species spec: ${id}`);
  }
  return spec;
}

export function isRuntimeAcceptedVegetationSpecies(spec: VietnamVegetationSpeciesSpec): boolean {
  return spec.sourceStatus === 'acceptedRuntimeAtlas'
    && spec.existingRuntimeTypeId !== null
    && !BLOCKED_SPEC_IDS.has(spec.id)
    && !RETIRED_SPEC_IDS.has(spec.id);
}

export function getRuntimeAcceptedVegetationSpecies(): VietnamVegetationSpeciesSpec[] {
  return VIETNAM_VEGETATION_SPECIES.filter(isRuntimeAcceptedVegetationSpecies);
}

export function getBlockedVegetationSpeciesSpecs(): VietnamVegetationSpeciesSpec[] {
  return VIETNAM_VEGETATION_SPECIES.filter((spec) => spec.sourceStatus === 'blockedPendingSource');
}
