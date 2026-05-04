#!/usr/bin/env tsx

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BuildingModels, StructureModels } from '../src/systems/assets/modelPaths';
import { PIXEL_FORGE_PROP_CATALOG } from '../src/systems/assets/PixelForgePropCatalog';
import {
  PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
  PIXEL_FORGE_VEGETATION_ASSETS,
} from '../src/config/pixelForgeAssets';
import { getBiome } from '../src/config/biomes';

type CheckStatus = 'pass' | 'warn' | 'fail';
type CandidateStatus = 'runtime' | 'candidate' | 'blocked' | 'review_required';

interface TextureEntry {
  name: string;
  file: string;
  exists: boolean;
  bytes: number;
  role: string;
  runtimeBiomes: string[];
}

interface ModelEntry {
  id: string;
  file: string;
  exists: boolean;
  bytes: number;
  triangles: number | null;
  role: string;
  status: CandidateStatus;
  notes: string[];
}

interface VegetationEntry {
  id: string;
  variant: string;
  tier: string;
  colorFile: string;
  normalFile: string;
  colorExists: boolean;
  normalExists: boolean;
  status: CandidateStatus;
  notes: string[];
}

interface TerrainAssetInventory {
  createdAt: string;
  source: 'projekt-143-terrain-asset-inventory';
  status: CheckStatus;
  summary: {
    terrainTextures: number;
    greenGroundTextures: number;
    trailOrClearedTextures: number;
    pixelForgeGroundCoverCandidates: number;
    runtimeVegetationSpecies: number;
    blockedVegetationSpecies: number;
    buildingCandidates: number;
    missingAssets: number;
  };
  terrainTextures: TextureEntry[];
  pixelForgeGroundCoverAndTrailProps: ModelEntry[];
  buildingAndStructureCandidates: ModelEntry[];
  vegetation: VegetationEntry[];
  recommendations: {
    nextLowResourceWork: string[];
    validationRequiredBeforeRuntimeImport: string[];
    nonClaims: string[];
  };
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const PUBLIC_ASSETS_ROOT = join(process.cwd(), 'public', 'assets');
const PUBLIC_MODELS_ROOT = join(process.cwd(), 'public', 'models');
const BIOME_IDS = [
  'denseJungle',
  'highland',
  'ricePaddy',
  'riverbank',
  'cleared',
  'tallGrass',
  'mudTrail',
  'bambooGrove',
  'swamp',
  'defoliated',
] as const;

const GREEN_TEXTURE_HINTS = ['jungle', 'bamboo', 'grass', 'swamp', 'rice'];
const TRAIL_TEXTURE_HINTS = ['mud', 'laterite', 'firebase', 'defoliated'];
const GROUND_COVER_PROP_HINTS = ['grass', 'patch-grass', 'rock-flat-grass', 'rock-', 'floor', 'planks', 'signpost'];
const PIXEL_FORGE_STRUCTURE_HINTS = ['structure', 'tent', 'fence', 'campfire'];

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function bytesFor(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

function classifyTexture(name: string): string {
  if (GREEN_TEXTURE_HINTS.some((hint) => name.includes(hint))) return 'green-ground-variety';
  if (TRAIL_TEXTURE_HINTS.some((hint) => name.includes(hint))) return 'trail-cleared-or-disturbed-ground';
  if (name.includes('river') || name.includes('sandy')) return 'edge-or-bank-surface';
  if (name.includes('rocky')) return 'slope-accent-not-broad-summit';
  return 'uncategorized-ground-texture';
}

function runtimeBiomeTextureUsage(): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  for (const biomeId of BIOME_IDS) {
    const biome = getBiome(biomeId);
    const existing = usage.get(biome.groundTexture) ?? [];
    existing.push(biome.id);
    usage.set(biome.groundTexture, existing);
  }
  return usage;
}

function terrainTextures(): TextureEntry[] {
  const biomeUsage = runtimeBiomeTextureUsage();
  const files = readdirSync(PUBLIC_ASSETS_ROOT)
    .filter((file) => file.endsWith('.webp'))
    .sort((a, b) => a.localeCompare(b));

  return files.map((file) => {
    const name = file.replace(/\.webp$/, '');
    const absolute = join(PUBLIC_ASSETS_ROOT, file);
    return {
      name,
      file: `assets/${file}`,
      exists: existsSync(absolute),
      bytes: bytesFor(absolute),
      role: classifyTexture(name),
      runtimeBiomes: biomeUsage.get(name) ?? [],
    };
  });
}

function modelEntry(
  id: string,
  modelPath: string,
  role: string,
  status: CandidateStatus,
  triangles: number | null,
  notes: string[],
): ModelEntry {
  const absolute = join(PUBLIC_MODELS_ROOT, modelPath);
  return {
    id,
    file: `models/${modelPath}`,
    exists: existsSync(absolute),
    bytes: bytesFor(absolute),
    triangles,
    role,
    status,
    notes,
  };
}

function pixelForgeGroundCoverAndTrailProps(): ModelEntry[] {
  return PIXEL_FORGE_PROP_CATALOG
    .filter((entry) => {
      const id = entry.id.toLowerCase();
      return GROUND_COVER_PROP_HINTS.some((hint) => id.includes(hint))
        || PIXEL_FORGE_STRUCTURE_HINTS.some((hint) => id.includes(hint));
    })
    .map((entry) => {
      const role = entry.id.includes('grass') || entry.id.includes('rock-flat-grass')
        ? 'ground-cover-candidate'
        : entry.id.includes('floor') || entry.id.includes('planks') || entry.id.includes('signpost')
          ? 'trail-or-route-prop-candidate'
          : 'small-static-world-prop-candidate';
      return modelEntry(
        entry.id,
        entry.modelPath,
        role,
        'review_required',
        entry.triangles,
        [
          'Imported Pixel Forge prop candidate; requires visual, placement, draw-call, and LOD/HLOD review before runtime use.',
        ],
      );
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
}

function buildingAndStructureCandidates(): ModelEntry[] {
  const buildingEntries = Object.entries(BuildingModels).map(([key, modelPath]) => modelEntry(
    key.toLowerCase(),
    modelPath,
    'building-candidate',
    'review_required',
    null,
    [
      'Existing building model candidate; requires foundation footprint, collision, visual, and draw-call acceptance before replacement.',
    ],
  ));

  const structureEntries = Object.entries(StructureModels)
    .filter(([key]) => /BUNKER|HUT|TENT|GATE|DIKE|TOWER|SHED|BERM|BRIDGE|ENTRANCE|PIT/.test(key))
    .map(([key, modelPath]) => modelEntry(
      key.toLowerCase(),
      modelPath,
      'structure-or-foundation-candidate',
      'runtime',
      null,
      [
        'Existing runtime structure path; still needs placement/foundation review when used on hilly terrain.',
      ],
    ));

  return [...buildingEntries, ...structureEntries].sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
}

function vegetationEntries(): VegetationEntry[] {
  const accepted = PIXEL_FORGE_VEGETATION_ASSETS.map((asset) => ({
    id: asset.id,
    variant: asset.variant,
    tier: asset.tier,
    colorFile: `assets/${asset.colorFile}`,
    normalFile: `assets/${asset.normalFile}`,
    colorExists: existsSync(join(PUBLIC_ASSETS_ROOT, asset.colorFile)),
    normalExists: existsSync(join(PUBLIC_ASSETS_ROOT, asset.normalFile)),
    status: 'runtime' as CandidateStatus,
    notes: [
      'Current runtime Pixel Forge imposter species; placement and scale still need screenshot review for the latest terrain direction.',
    ],
  }));

  const blocked = PIXEL_FORGE_BLOCKED_VEGETATION_IDS.map((id) => ({
    id,
    variant: 'blocked-review-species',
    tier: 'unknown',
    colorFile: '',
    normalFile: '',
    colorExists: false,
    normalExists: false,
    status: 'blocked' as CandidateStatus,
    notes: [
      'Known blocked Pixel Forge vegetation species; do not import until source/material/bake blockers are cleared in Pixel Forge.',
    ],
  }));

  return [...accepted, ...blocked];
}

function buildInventory(): TerrainAssetInventory {
  const terrain = terrainTextures();
  const props = pixelForgeGroundCoverAndTrailProps();
  const models = buildingAndStructureCandidates();
  const vegetation = vegetationEntries();
  const missingAssets = [
    ...terrain.filter((entry) => !entry.exists),
    ...props.filter((entry) => !entry.exists),
    ...models.filter((entry) => !entry.exists),
    ...vegetation.filter((entry) => entry.status === 'runtime' && (!entry.colorExists || !entry.normalExists)),
  ].length;

  return {
    createdAt: new Date().toISOString(),
    source: 'projekt-143-terrain-asset-inventory',
    status: missingAssets > 0 ? 'fail' : 'warn',
    summary: {
      terrainTextures: terrain.length,
      greenGroundTextures: terrain.filter((entry) => entry.role === 'green-ground-variety').length,
      trailOrClearedTextures: terrain.filter((entry) => entry.role === 'trail-cleared-or-disturbed-ground').length,
      pixelForgeGroundCoverCandidates: props.filter((entry) => entry.role === 'ground-cover-candidate').length,
      runtimeVegetationSpecies: vegetation.filter((entry) => entry.status === 'runtime').length,
      blockedVegetationSpecies: vegetation.filter((entry) => entry.status === 'blocked').length,
      buildingCandidates: models.filter((entry) => entry.role === 'building-candidate').length,
      missingAssets,
    },
    terrainTextures: terrain,
    pixelForgeGroundCoverAndTrailProps: props,
    buildingAndStructureCandidates: models,
    vegetation,
    recommendations: {
      nextLowResourceWork: [
        'Use this inventory to shortlist ground textures by surface role before adding custom grass, cover, or trail assets.',
        'Prefer existing green-ground textures for local material variety before generating new terrain albedo.',
        'Treat Pixel Forge grass/patch/rock props as review candidates for ground-cover clumps, not automatic runtime imports.',
        'Tie any trail visual change to existing jungle_trail/packed_earth/dirt_road surface kinds and terrain-flow stamps.',
      ],
      validationRequiredBeforeRuntimeImport: [
        'Asset Acceptance Standard review for visual fit, footprint, collision, draw calls, triangles, texture residency, and LOD/HLOD path.',
        'Open Frontier and A Shau screenshots once browser resources are available.',
        'Matched perf captures only after the owner clears the machine for perf/browser work.',
      ],
      nonClaims: [
        'No new runtime asset is accepted by this inventory.',
        'No performance or visual-quality claim is made from static file presence.',
        'No blocked Pixel Forge vegetation species is unblocked by this audit.',
      ],
    },
  };
}

function writeInventory(report: TerrainAssetInventory): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'projekt-143-terrain-asset-inventory');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'terrain-asset-inventory.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

function main(): void {
  const report = buildInventory();
  const outputPath = writeInventory(report);
  console.log(`Projekt 143 terrain asset inventory ${report.status.toUpperCase()}: ${relative(process.cwd(), outputPath)}`);
  console.log(
    `- terrain textures=${report.summary.terrainTextures}, green=${report.summary.greenGroundTextures}, trail/cleared=${report.summary.trailOrClearedTextures}`,
  );
  console.log(
    `- Pixel Forge ground-cover props=${report.summary.pixelForgeGroundCoverCandidates}, buildings=${report.summary.buildingCandidates}`,
  );
  console.log(
    `- runtime vegetation=${report.summary.runtimeVegetationSpecies}, blocked vegetation=${report.summary.blockedVegetationSpecies}, missing=${report.summary.missingAssets}`,
  );
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
