#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { BuildingModels, StructureModels } from '../src/systems/assets/modelPaths';
import { PIXEL_FORGE_PROP_CATALOG } from '../src/systems/assets/PixelForgePropCatalog';
import {
  PIXEL_FORGE_BLOCKED_VEGETATION_IDS,
  PIXEL_FORGE_RETIRED_VEGETATION_IDS,
  PIXEL_FORGE_VEGETATION_ASSETS,
} from '../src/config/pixelForgeAssets';
import { getBiome } from '../src/config/biomes';

type CheckStatus = 'pass' | 'warn' | 'fail';
type CandidateStatus = 'runtime' | 'candidate' | 'blocked' | 'retired' | 'review_required';
type OptimizationRisk = 'low' | 'medium' | 'high' | 'unknown';

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
  meshCount: number | null;
  primitiveCount: number | null;
  materialCount: number | null;
  textureCount: number | null;
  nodeCount: number | null;
  animationCount: number | null;
  optimizationRisk: OptimizationRisk;
  optimizationReasons: string[];
  role: string;
  status: CandidateStatus;
  notes: string[];
}

interface GlbJson {
  nodes?: unknown[];
  meshes?: Array<{
    primitives?: Array<{
      indices?: number;
      attributes?: Record<string, number>;
    }>;
  }>;
  accessors?: Array<{
    count?: number;
  }>;
  materials?: unknown[];
  textures?: unknown[];
  animations?: unknown[];
}

interface ModelMetrics {
  triangles: number | null;
  meshCount: number | null;
  primitiveCount: number | null;
  materialCount: number | null;
  textureCount: number | null;
  nodeCount: number | null;
  animationCount: number | null;
  parseError: string | null;
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
    retiredVegetationSpecies: number;
    buildingCandidates: number;
    buildingCandidateTriangles: number;
    structureRuntimeTriangles: number;
    modelOptimizationMediumOrHigh: number;
    pixelForgeGalleryBuildingCandidates: number;
    pixelForgeGalleryBuildingTriangles: number;
    pixelForgeGalleryGroundVehicleCandidates: number;
    pixelForgeGalleryGroundVehicleTriangles: number;
    pixelForgeGalleryOptimizationMediumOrHigh: number;
    missingAssets: number;
  };
  terrainTextures: TextureEntry[];
  pixelForgeGroundCoverAndTrailProps: ModelEntry[];
  buildingAndStructureCandidates: ModelEntry[];
  pixelForgeGalleryBuildingCandidates: ModelEntry[];
  pixelForgeGalleryGroundVehicleCandidates: ModelEntry[];
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
const PIXEL_FORGE_ROOT = join(process.cwd(), '..', 'pixel-forge');
const PIXEL_FORGE_WAR_ASSETS_ROOT = join(PIXEL_FORGE_ROOT, 'war-assets');
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
const JSON_CHUNK_TYPE = 0x4e4f534a;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function bytesFor(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

function emptyModelMetrics(parseError: string | null = null): ModelMetrics {
  return {
    triangles: null,
    meshCount: null,
    primitiveCount: null,
    materialCount: null,
    textureCount: null,
    nodeCount: null,
    animationCount: null,
    parseError,
  };
}

function readGlbJson(file: string): GlbJson {
  const data = readFileSync(file);
  if (data.toString('utf-8', 0, 4) !== 'glTF') {
    throw new Error('not a binary glTF file');
  }

  let offset = 12;
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = data.subarray(offset, offset + length);
    offset += length;
    if (type === JSON_CHUNK_TYPE) {
      return JSON.parse(chunk.toString('utf-8').trim()) as GlbJson;
    }
  }
  throw new Error('missing JSON chunk');
}

function accessorCount(json: GlbJson, index: number | undefined): number {
  return index === undefined ? 0 : json.accessors?.[index]?.count ?? 0;
}

function primitiveTriangles(
  json: GlbJson,
  primitive: NonNullable<NonNullable<GlbJson['meshes']>[number]['primitives']>[number],
): number {
  if (primitive.indices !== undefined) {
    return Math.floor(accessorCount(json, primitive.indices) / 3);
  }
  return Math.floor(accessorCount(json, primitive.attributes?.POSITION) / 3);
}

function analyzeGlb(file: string): ModelMetrics {
  if (!existsSync(file)) return emptyModelMetrics();
  try {
    const json = readGlbJson(file);
    let triangles = 0;
    let primitiveCount = 0;
    for (const mesh of json.meshes ?? []) {
      for (const primitive of mesh.primitives ?? []) {
        primitiveCount++;
        triangles += primitiveTriangles(json, primitive);
      }
    }
    return {
      triangles,
      meshCount: json.meshes?.length ?? 0,
      primitiveCount,
      materialCount: json.materials?.length ?? 0,
      textureCount: json.textures?.length ?? 0,
      nodeCount: json.nodes?.length ?? 0,
      animationCount: json.animations?.length ?? 0,
      parseError: null,
    };
  } catch (error) {
    return emptyModelMetrics(error instanceof Error ? error.message : String(error));
  }
}

function classifyOptimizationRisk(metrics: ModelMetrics, bytes: number): { risk: OptimizationRisk; reasons: string[] } {
  if (metrics.parseError) return { risk: 'unknown', reasons: [`GLB metadata parse failed: ${metrics.parseError}`] };
  if (metrics.triangles === null) return { risk: 'unknown', reasons: ['GLB metadata unavailable.'] };

  const reasons: string[] = [];
  const triangles = metrics.triangles;
  const primitiveCount = metrics.primitiveCount ?? 0;
  const materialCount = metrics.materialCount ?? 0;
  const animationCount = metrics.animationCount ?? 0;

  if (triangles > 10_000) reasons.push(`high triangle count (${triangles})`);
  else if (triangles > 5_000) reasons.push(`moderate triangle count (${triangles})`);

  if (materialCount > 8) reasons.push(`many materials (${materialCount})`);
  else if (materialCount > 4) reasons.push(`moderate material count (${materialCount})`);

  if (primitiveCount > 16) reasons.push(`many primitives (${primitiveCount})`);
  else if (primitiveCount > 8) reasons.push(`moderate primitive count (${primitiveCount})`);

  if (animationCount > 0) reasons.push(`static candidate has animations (${animationCount})`);
  if (bytes > 512 * 1024) reasons.push(`large GLB payload (${bytes} bytes)`);
  else if (bytes > 256 * 1024) reasons.push(`moderate GLB payload (${bytes} bytes)`);

  const high = triangles > 10_000 || materialCount > 8 || primitiveCount > 16 || bytes > 512 * 1024;
  const medium = reasons.length > 0;
  return {
    risk: high ? 'high' : medium ? 'medium' : 'low',
    reasons: reasons.length > 0 ? reasons : ['Low static geometry/material payload; still needs visual, collision, and LOD/HLOD acceptance.'],
  };
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
  return modelEntryFromAbsolute(
    id,
    absolute,
    `models/${modelPath}`,
    role,
    status,
    triangles,
    notes,
  );
}

function modelEntryFromAbsolute(
  id: string,
  absolute: string,
  file: string,
  role: string,
  status: CandidateStatus,
  triangles: number | null,
  notes: string[],
): ModelEntry {
  const bytes = bytesFor(absolute);
  const metrics = analyzeGlb(absolute);
  const risk = existsSync(absolute)
    ? classifyOptimizationRisk({ ...metrics, triangles: metrics.triangles ?? triangles }, bytes)
    : { risk: 'high' as OptimizationRisk, reasons: ['Missing model asset.'] };
  return {
    id,
    file,
    exists: existsSync(absolute),
    bytes,
    triangles: metrics.triangles ?? triangles,
    meshCount: metrics.meshCount,
    primitiveCount: metrics.primitiveCount,
    materialCount: metrics.materialCount,
    textureCount: metrics.textureCount,
    nodeCount: metrics.nodeCount,
    animationCount: metrics.animationCount,
    optimizationRisk: risk.risk,
    optimizationReasons: risk.reasons,
    role,
    status,
    notes: metrics.parseError ? [...notes, `GLB metadata parse failed: ${metrics.parseError}`] : notes,
  };
}

function listGlbs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.glb'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => join(dir, file));
}

function slugFromGlbPath(file: string): string {
  return basename(file, '.glb');
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

function pixelForgeGalleryBuildingCandidates(): ModelEntry[] {
  const buildingDir = join(PIXEL_FORGE_WAR_ASSETS_ROOT, 'buildings');
  return listGlbs(buildingDir).map((file) => {
    const id = slugFromGlbPath(file);
    return modelEntryFromAbsolute(
      id,
      file,
      relative(process.cwd(), file).replaceAll('\\', '/'),
      'pixel-forge-gallery-building-candidate',
      'review_required',
      null,
      [
        'Sibling Pixel Forge building gallery GLB; review for visual fit, foundation footprint, collision, batching, and import mapping before replacing TIJ runtime buildings.',
      ],
    );
  });
}

function pixelForgeGalleryGroundVehicleCandidates(): ModelEntry[] {
  const vehicleDir = join(PIXEL_FORGE_WAR_ASSETS_ROOT, 'vehicles', 'ground');
  return listGlbs(vehicleDir).map((file) => {
    const id = slugFromGlbPath(file);
    return modelEntryFromAbsolute(
      id,
      file,
      relative(process.cwd(), file).replaceAll('\\', '/'),
      'pixel-forge-gallery-ground-vehicle-candidate',
      'review_required',
      null,
      [
        'Sibling Pixel Forge ground-vehicle GLB; review pivot, scale, wheel/contact points, collision proxy, and terrain/road driving surface before runtime driving import.',
      ],
    );
  });
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

  const retired = PIXEL_FORGE_RETIRED_VEGETATION_IDS.map((id) => ({
    id,
    variant: 'owner-retired-runtime-species',
    tier: 'canopy',
    colorFile: '',
    normalFile: '',
    colorExists: false,
    normalExists: false,
    status: 'retired' as CandidateStatus,
    notes: [
      'Owner-retired small palm species; keep out of runtime unless a future vegetation review explicitly re-approves it.',
    ],
  }));

  return [...accepted, ...retired, ...blocked];
}

function buildInventory(): TerrainAssetInventory {
  const terrain = terrainTextures();
  const props = pixelForgeGroundCoverAndTrailProps();
  const models = buildingAndStructureCandidates();
  const pixelForgeBuildings = pixelForgeGalleryBuildingCandidates();
  const pixelForgeVehicles = pixelForgeGalleryGroundVehicleCandidates();
  const vegetation = vegetationEntries();
  const buildingModels = models.filter((entry) => entry.role === 'building-candidate');
  const structureModels = models.filter((entry) => entry.role === 'structure-or-foundation-candidate');
  const pixelForgeGalleryModels = [...pixelForgeBuildings, ...pixelForgeVehicles];
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
      retiredVegetationSpecies: vegetation.filter((entry) => entry.status === 'retired').length,
      buildingCandidates: buildingModels.length,
      buildingCandidateTriangles: buildingModels.reduce((sum, entry) => sum + (entry.triangles ?? 0), 0),
      structureRuntimeTriangles: structureModels.reduce((sum, entry) => sum + (entry.triangles ?? 0), 0),
      modelOptimizationMediumOrHigh: [...props, ...models].filter((entry) =>
        entry.optimizationRisk === 'medium' || entry.optimizationRisk === 'high'
      ).length,
      pixelForgeGalleryBuildingCandidates: pixelForgeBuildings.length,
      pixelForgeGalleryBuildingTriangles: pixelForgeBuildings.reduce((sum, entry) => sum + (entry.triangles ?? 0), 0),
      pixelForgeGalleryGroundVehicleCandidates: pixelForgeVehicles.length,
      pixelForgeGalleryGroundVehicleTriangles: pixelForgeVehicles.reduce((sum, entry) => sum + (entry.triangles ?? 0), 0),
      pixelForgeGalleryOptimizationMediumOrHigh: pixelForgeGalleryModels.filter((entry) =>
        entry.optimizationRisk === 'medium' || entry.optimizationRisk === 'high'
      ).length,
      missingAssets,
    },
    terrainTextures: terrain,
    pixelForgeGroundCoverAndTrailProps: props,
    buildingAndStructureCandidates: models,
    pixelForgeGalleryBuildingCandidates: pixelForgeBuildings,
    pixelForgeGalleryGroundVehicleCandidates: pixelForgeVehicles,
    vegetation,
    recommendations: {
      nextLowResourceWork: [
        'Use this inventory to shortlist ground textures by surface role before adding custom grass, cover, or trail assets.',
        'Use the GLB cost fields on building and structure candidates to shortlist upgraded Pixel Forge replacements before runtime swap-in.',
        'Compare TIJ runtime buildings/vehicles against the sibling Pixel Forge gallery candidates before copying or remapping assets into public/models.',
        'Prefer existing green-ground textures for local material variety before generating new terrain albedo.',
        'Treat Pixel Forge grass/patch/rock props as review candidates for ground-cover clumps, not automatic runtime imports.',
        'Keep the retired small palm out of runtime and spend replacement vegetation budget on ground-cover candidates or approved grass.',
        'Investigate EZ Tree or a similar licensed procedural/tree source only as a GLB-generation path; bake and validate generated assets before runtime import.',
        'Tie any trail visual change to existing jungle_trail/packed_earth/dirt_road surface kinds and terrain-flow stamps.',
      ],
      validationRequiredBeforeRuntimeImport: [
        'Asset Acceptance Standard review for visual fit, footprint, collision, draw calls, triangles, texture residency, and LOD/HLOD path.',
        'Pixel Forge gallery building and ground-vehicle candidates need side-by-side runtime screenshots and footprint/driving-surface probes before TIJ import.',
        'Generated tree/ground-cover GLBs must prove licensing, browser-budget geometry/textures, Pixel Forge bake compatibility, and impostor/LOD quality before shipping.',
        'Open Frontier and A Shau screenshots once browser resources are available.',
        'Matched perf captures only after the owner clears the machine for perf/browser work.',
      ],
      nonClaims: [
        'No new runtime asset is accepted by this inventory.',
        'Pixel Forge gallery building and ground-vehicle candidates are cataloged only; they are not imported into TIJ by this audit.',
        'No performance or visual-quality claim is made from static file presence.',
        'No blocked Pixel Forge vegetation species is unblocked by this audit.',
        'The retired small palm source assets may remain on disk for provenance, but they are not runtime vegetation.',
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
    `- building triangles=${report.summary.buildingCandidateTriangles}, runtime structure triangles=${report.summary.structureRuntimeTriangles}, medium/high optimization risk=${report.summary.modelOptimizationMediumOrHigh}`,
  );
  console.log(
    `- Pixel Forge gallery buildings=${report.summary.pixelForgeGalleryBuildingCandidates} tris=${report.summary.pixelForgeGalleryBuildingTriangles}, ground vehicles=${report.summary.pixelForgeGalleryGroundVehicleCandidates} tris=${report.summary.pixelForgeGalleryGroundVehicleTriangles}, medium/high=${report.summary.pixelForgeGalleryOptimizationMediumOrHigh}`,
  );
  console.log(
    `- runtime vegetation=${report.summary.runtimeVegetationSpecies}, retired vegetation=${report.summary.retiredVegetationSpecies}, blocked vegetation=${report.summary.blockedVegetationSpecies}, missing=${report.summary.missingAssets}`,
  );
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
