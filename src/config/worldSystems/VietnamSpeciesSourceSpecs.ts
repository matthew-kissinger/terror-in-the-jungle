// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type VietnamSpeciesRuntimeStatus =
  | 'runtime-approved-impostor'
  | 'source-spec-only';

export type VietnamSpeciesTier =
  | 'groundCover'
  | 'midLevel'
  | 'canopy'
  | 'canopyShell';

export type VietnamSpeciesHabitat =
  | 'denseJungle'
  | 'highlandBench'
  | 'riverbank'
  | 'villageEdge'
  | 'plantation'
  | 'paddyEdge'
  | 'trailEdge';

export type VietnamSpeciesProofHook =
  | 'assetAcceptanceReview'
  | 'assetGalleryReview'
  | 'terrainBaselineProof'
  | 'terrainVisualMatrix'
  | 'quietMachinePerfAttribution'
  | 'rendererFeatureProfileSnapshot';

export interface VietnamSpeciesSourceSpec {
  readonly id: string;
  readonly displayName: string;
  readonly status: VietnamSpeciesRuntimeStatus;
  readonly tier: VietnamSpeciesTier;
  readonly habitats: readonly VietnamSpeciesHabitat[];
  readonly runtimeVegetationId?: string;
  readonly sourceAsset: {
    readonly currentSource: 'existing-approved-pixel-forge' | 'future-tiJ-source-required';
    readonly acceptedSourceRequired: boolean;
    readonly fableAssetsAllowed: false;
    readonly generatedFableSpeciesAllowed: false;
  };
  readonly representationPlan: {
    readonly closeRange: 'existing-impostor' | 'mesh-or-hybrid-source-required' | 'ground-ring-card';
    readonly midRange: 'existing-impostor' | 'cluster-card-source-required' | 'ground-ring-card';
    readonly farRange: 'existing-impostor' | 'octahedral-impostor-source-required' | 'canopy-coverage';
    readonly aggregateLod: 'none' | 'allowed-after-proof';
    readonly naniteLite: 'none' | 'cluster-study-only';
    readonly trueMeshletNanite: false;
  };
  readonly proofHooks: readonly VietnamSpeciesProofHook[];
  readonly runtimeWaterDependency: 'none';
  readonly notes: readonly string[];
}

const BASE_RUNTIME_HOOKS: readonly VietnamSpeciesProofHook[] = [
  'assetAcceptanceReview',
  'assetGalleryReview',
  'terrainVisualMatrix',
  'rendererFeatureProfileSnapshot',
];

const SOURCE_SPEC_HOOKS: readonly VietnamSpeciesProofHook[] = [
  'assetAcceptanceReview',
  'assetGalleryReview',
  'terrainBaselineProof',
  'terrainVisualMatrix',
  'quietMachinePerfAttribution',
  'rendererFeatureProfileSnapshot',
];

function approvedImpostorSpec(
  id: string,
  displayName: string,
  runtimeVegetationId: string,
  tier: VietnamSpeciesTier,
  habitats: readonly VietnamSpeciesHabitat[],
  notes: readonly string[],
): VietnamSpeciesSourceSpec {
  return {
    id,
    displayName,
    status: 'runtime-approved-impostor',
    tier,
    habitats,
    runtimeVegetationId,
    sourceAsset: {
      currentSource: 'existing-approved-pixel-forge',
      acceptedSourceRequired: false,
      fableAssetsAllowed: false,
      generatedFableSpeciesAllowed: false,
    },
    representationPlan: {
      closeRange: tier === 'groundCover' ? 'ground-ring-card' : 'existing-impostor',
      midRange: tier === 'groundCover' ? 'ground-ring-card' : 'existing-impostor',
      farRange: 'existing-impostor',
      aggregateLod: tier === 'canopy' ? 'allowed-after-proof' : 'none',
      naniteLite: tier === 'canopy' ? 'cluster-study-only' : 'none',
      trueMeshletNanite: false,
    },
    proofHooks: BASE_RUNTIME_HOOKS,
    runtimeWaterDependency: 'none',
    notes,
  };
}

function sourceOnlySpec(
  id: string,
  displayName: string,
  tier: VietnamSpeciesTier,
  habitats: readonly VietnamSpeciesHabitat[],
  notes: readonly string[],
): VietnamSpeciesSourceSpec {
  return {
    id,
    displayName,
    status: 'source-spec-only',
    tier,
    habitats,
    sourceAsset: {
      currentSource: 'future-tiJ-source-required',
      acceptedSourceRequired: true,
      fableAssetsAllowed: false,
      generatedFableSpeciesAllowed: false,
    },
    representationPlan: {
      closeRange: tier === 'groundCover' ? 'ground-ring-card' : 'mesh-or-hybrid-source-required',
      midRange: tier === 'groundCover' ? 'ground-ring-card' : 'cluster-card-source-required',
      farRange: tier === 'canopyShell' ? 'canopy-coverage' : 'octahedral-impostor-source-required',
      aggregateLod: 'allowed-after-proof',
      naniteLite: tier === 'canopy' || tier === 'canopyShell' ? 'cluster-study-only' : 'none',
      trueMeshletNanite: false,
    },
    proofHooks: SOURCE_SPEC_HOOKS,
    runtimeWaterDependency: 'none',
    notes,
  };
}

export const VIETNAM_SPECIES_SOURCE_SPECS: readonly VietnamSpeciesSourceSpec[] = [
  approvedImpostorSpec(
    'approved-bamboo-grove',
    'Bamboo grove',
    'bambooGrove',
    'midLevel',
    ['denseJungle', 'highlandBench', 'trailEdge'],
    [
      'Existing accepted impostor family; clustered placement stays TIJ-authored.',
      'Future source work may add close culm mesh clusters but cannot replace terrain or navmesh authority.',
    ],
  ),
  approvedImpostorSpec(
    'approved-fern-floor',
    'Fern floor cover',
    'fern',
    'groundCover',
    ['denseJungle', 'highlandBench', 'trailEdge'],
    [
      'Existing accepted ground-cover family owned by JungleGroundRing near the camera.',
      'No normal map promotion without vegetation luma/chroma and TOD evidence.',
    ],
  ),
  approvedImpostorSpec(
    'approved-banana-plant',
    'Banana plant',
    'bananaPlant',
    'midLevel',
    ['denseJungle', 'villageEdge', 'paddyEdge'],
    [
      'Existing accepted impostor family with slope cap and grounding fixes.',
      'Future close-range source should keep stems green and avoid cyan artifact regression.',
    ],
  ),
  approvedImpostorSpec(
    'approved-fan-palm',
    'Fan palm',
    'fanPalm',
    'canopy',
    ['denseJungle', 'villageEdge', 'trailEdge'],
    [
      'Existing accepted palm-like tree tier; not the retired small palm package.',
      'Future aggregate LOD may add hybrid trunk/card canopy only after gallery and perf proof.',
    ],
  ),
  approvedImpostorSpec(
    'approved-elephant-ear',
    'Elephant-ear understory',
    'elephantEar',
    'groundCover',
    ['denseJungle', 'riverbank', 'paddyEdge'],
    [
      'Existing accepted broad-leaf ground cover; no gameplay-water dependency despite riverbank habitat.',
      'Grounding remains tied to terrain height, not hydrology output.',
    ],
  ),
  approvedImpostorSpec(
    'approved-coconut-palm',
    'Coconut palm',
    'coconut',
    'canopy',
    ['villageEdge', 'riverbank', 'paddyEdge'],
    [
      'Existing accepted canopy family with stable azimuth and elevation-row quarantine.',
      'Future close mesh source should preserve the clean trunk silhouette before any LOD promotion.',
    ],
  ),
  sourceOnlySpec(
    'source-rubber-broadleaf',
    'Rubber plantation broadleaf tree',
    'canopy',
    ['plantation', 'villageEdge', 'trailEdge'],
    [
      'Future TIJ source asset; no legacy blocked Pixel Forge runtime ID is approved by this spec.',
      'Needs close trunk/canopy source, mid cluster-card, far impostor, and Open Frontier/A Shau proof.',
    ],
  ),
  sourceOnlySpec(
    'source-strangler-fig-landmark',
    'Strangler fig landmark tree',
    'canopy',
    ['denseJungle', 'highlandBench'],
    [
      'Future hero-tree source for aggregate cluster study; true meshlet Nanite remains out of scope.',
      'Must prove route/base/NPC readability before any runtime placement.',
    ],
  ),
  sourceOnlySpec(
    'source-delta-root-canopy',
    'River-delta stilt-root canopy tree',
    'canopyShell',
    ['riverbank'],
    [
      'Future riverbank canopy source only; this is not a gameplay-water system.',
      'Canopy-shell coverage may use terrain/biome placement but must not depend on runtime water.',
    ],
  ),
  sourceOnlySpec(
    'source-elephant-grass-edge',
    'Elephant grass edge cover',
    'midLevel',
    ['paddyEdge', 'trailEdge', 'villageEdge'],
    [
      'Future source for concealment strips; must preserve combat readability and route visibility.',
      'No default-on density increase without owner visual acceptance and perf attribution.',
    ],
  ),
  sourceOnlySpec(
    'source-rice-paddy-edge-grass',
    'Rice paddy edge grass',
    'groundCover',
    ['paddyEdge', 'villageEdge'],
    [
      'Future ground-card source for paddy edges; does not approve water rendering or basin gameplay.',
      'Should reuse terrain surface/exclusion authority, not hydrology runtime state.',
    ],
  ),
  sourceOnlySpec(
    'source-betel-palm-clump',
    'Betel palm clump',
    'midLevel',
    ['villageEdge', 'denseJungle'],
    [
      'Future slim-palm clump source; must avoid the retired small-palm asset class.',
      'Needs gallery and far/near readability proof before joining runtime vegetation.',
    ],
  ),
  sourceOnlySpec(
    'source-vine-deadfall',
    'Vine and deadfall layer',
    'groundCover',
    ['denseJungle', 'trailEdge', 'highlandBench'],
    [
      'Future ground-ring and obstacle-adjacent source layer; cannot hide routes, bases, vehicles, or NPCs.',
      'Placement must respect existing terrain feature exclusions.',
    ],
  ),
] as const;

