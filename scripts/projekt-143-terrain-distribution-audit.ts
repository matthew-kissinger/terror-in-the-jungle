#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { A_SHAU_VALLEY_CONFIG } from '../src/config/AShauValleyConfig';
import { AI_SANDBOX_CONFIG } from '../src/config/AiSandboxConfig';
import { OPEN_FRONTIER_CONFIG } from '../src/config/OpenFrontierConfig';
import { TEAM_DEATHMATCH_CONFIG } from '../src/config/TeamDeathmatchConfig';
import { ZONE_CONTROL_CONFIG } from '../src/config/ZoneControlConfig';
import { getBiome, type BiomeClassificationRule, type BiomeVegetationEntry } from '../src/config/biomes';
import type { GameModeConfig } from '../src/config/gameModeTypes';
import { VEGETATION_TYPES } from '../src/config/vegetationTypes';
import type { IHeightProvider } from '../src/systems/terrain/IHeightProvider';
import { DEMHeightProvider } from '../src/systems/terrain/DEMHeightProvider';
import { NoiseHeightProvider } from '../src/systems/terrain/NoiseHeightProvider';
import { classifyBiome, computeSlopeDeg } from '../src/systems/terrain/BiomeClassifier';

type CheckStatus = 'pass' | 'warn' | 'fail';
type HeightProviderKind = 'noise' | 'dem';
type RuleWithMaterialBlend = BiomeClassificationRule & { elevationBlendWidth?: number };

interface DistributionEntry {
  id: string;
  samples: number;
  percent: number;
}

interface VegetationDensityEntry {
  id: string;
  tier: string;
  relativeDensity: number;
  clusterCoverageEstimate: number;
  percent: number;
}

interface ModeDistributionReport {
  id: string;
  name: string;
  status: CheckStatus;
  heightProvider: HeightProviderKind;
  sampledSeed: number | null;
  samples: number;
  sampleGridSize: number;
  sampleWorldInsetPercent: number;
  heightRangeMeters: { min: number; max: number };
  slopeRangeDegrees: { min: number; max: number };
  cpuBiomeDistribution: DistributionEntry[];
  materialPrimaryDistribution: DistributionEntry[];
  flatGroundMaterialDistribution: DistributionEntry[];
  steepGroundMaterialDistribution: DistributionEntry[];
  cliffRockAccent: {
    eligiblePercent: number;
    steepGroundEligiblePercent: number;
    averageBlend: number;
    maxBlend: number;
  };
  vegetationRelativeDensity: VegetationDensityEntry[];
  flags: string[];
  findings: string[];
}

interface TerrainDistributionAudit {
  createdAt: string;
  sourceGitSha: string;
  workingTreeDirty: boolean;
  status: CheckStatus;
  source: 'projekt-143-terrain-distribution-audit';
  assumptions: {
    sampleGridSize: number;
    sampleWorldInsetPercent: number;
    flatSlopeMaxDegrees: number;
    steepSlopeMinDegrees: number;
    proceduralRandomSeedFallback: number;
    defaultMaterialElevationBlendWidthMeters: number;
    steepCliffRockAccentMinEligiblePercent: number;
    notes: string[];
  };
  summary: {
    modes: number;
    warnModes: number;
    failModes: number;
    flaggedModes: number;
  };
  modes: ModeDistributionReport[];
  recommendation: {
    nextBranch: string;
    validationRequired: string[];
    nonClaims: string[];
  };
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const SAMPLE_GRID_SIZE = 49;
const SAMPLE_WORLD_INSET_PERCENT = 4;
const FLAT_SLOPE_MAX_DEGREES = 16;
const STEEP_SLOPE_MIN_DEGREES = 35;
const CLIFF_ROCK_ACCENT_ELIGIBLE_BLEND = 0.03;
const MIN_STEEP_CLIFF_ROCK_ACCENT_ELIGIBLE_PERCENT = 5;
const PROCEDURAL_RANDOM_SEED_FALLBACK = 42;
const DEFAULT_MATERIAL_ELEVATION_BLEND_WIDTH_METERS = 120;
const MODES: readonly GameModeConfig[] = [
  AI_SANDBOX_CONFIG,
  TEAM_DEATHMATCH_CONFIG,
  ZONE_CONTROL_CONFIG,
  OPEN_FRONTIER_CONFIG,
  A_SHAU_VALLEY_CONFIG,
];

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function isWorkingTreeDirty(): boolean {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' }).trim().length > 0;
}

function roundMetric(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function addCount(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function toDistribution(map: Map<string, number>, total: number): DistributionEntry[] {
  return [...map.entries()]
    .map(([id, samples]) => ({
      id,
      samples,
      percent: total > 0 ? roundMetric((samples / total) * 100, 2) : 0,
    }))
    .sort((a, b) => b.samples - a.samples || a.id.localeCompare(b.id));
}

function getDistributionPercent(entries: DistributionEntry[], id: string): number {
  return entries.find((entry) => entry.id === id)?.percent ?? 0;
}

function getJungleLikePercent(entries: DistributionEntry[]): number {
  const jungleLike = new Set(['denseJungle', 'tallGrass', 'riverbank', 'swamp']);
  return roundMetric(entries
    .filter((entry) => jungleLike.has(entry.id))
    .reduce((sum, entry) => sum + entry.percent, 0), 2);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function elevationWeight(
  elevation: number,
  minElevation: number | undefined,
  maxElevation: number | undefined,
  blendWidth: number,
): number {
  let weight = 1;
  if (minElevation !== undefined) {
    weight *= smoothstep(minElevation - blendWidth, minElevation + blendWidth, elevation);
  }
  if (maxElevation !== undefined) {
    weight *= 1 - smoothstep(maxElevation - blendWidth, maxElevation + blendWidth, elevation);
  }
  return weight;
}

function slopeWeight(slopeDeg: number, slopeMax: number | undefined): number {
  if (slopeMax === undefined) return 1;
  const slopeUp = Math.cos((slopeDeg * Math.PI) / 180);
  const minUpDot = Math.cos((slopeMax * Math.PI) / 180);
  return smoothstep(minUpDot - 0.08, minUpDot + 0.08, slopeUp);
}

function classifyMaterialPrimary(
  elevation: number,
  slopeDeg: number,
  rules: readonly BiomeClassificationRule[] | undefined,
  defaultBiomeId: string,
): string {
  let bestId = defaultBiomeId;
  let bestWeight = 0.35;

  for (const rule of rules ?? []) {
    const ruleWithBlend = rule as RuleWithMaterialBlend;
    const blendWidth = ruleWithBlend.elevationBlendWidth ?? DEFAULT_MATERIAL_ELEVATION_BLEND_WIDTH_METERS;
    const ruleWeight =
      elevationWeight(elevation, rule.elevationMin, rule.elevationMax, blendWidth) *
      slopeWeight(slopeDeg, rule.slopeMax) *
      (1 + Math.max(0, rule.priority) * 0.02);

    if (ruleWeight > bestWeight) {
      bestId = rule.biomeId;
      bestWeight = ruleWeight;
    }
  }

  return bestId;
}

function computeCliffRockAccentBlend(elevation: number, slopeDeg: number): number {
  const slopeUp = Math.cos((slopeDeg * Math.PI) / 180);
  const cliffMask = 1 - smoothstep(0.50, 0.74, slopeUp);
  const proceduralHillMask =
    smoothstep(20, 60, elevation) *
    (1 - smoothstep(150, 300, elevation));
  const demRidgeMask = smoothstep(450, 950, elevation);
  return cliffMask * Math.max(proceduralHillMask, demRidgeMask) * 0.26;
}

function loadDemProvider(config: GameModeConfig): DEMHeightProvider {
  const source = config.heightSource;
  if (!source || source.type !== 'dem') {
    throw new Error(`Mode ${config.id} does not define a DEM height source`);
  }
  const relativePath = source.path.startsWith('/') ? source.path.slice(1) : source.path;
  const dataPath = join(process.cwd(), 'public', relativePath);
  if (!existsSync(dataPath)) {
    throw new Error(`Missing DEM file for ${config.id}: ${dataPath}`);
  }
  const bytes = readFileSync(dataPath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new DEMHeightProvider(
    new Float32Array(buffer),
    source.width,
    source.height,
    source.metersPerPixel,
  );
}

function createHeightProvider(config: GameModeConfig): {
  provider: IHeightProvider;
  kind: HeightProviderKind;
  sampledSeed: number | null;
  slopeSampleDistance: number;
} {
  if (config.heightSource?.type === 'dem') {
    return {
      provider: loadDemProvider(config),
      kind: 'dem',
      sampledSeed: null,
      slopeSampleDistance: Math.max(8, config.heightSource.metersPerPixel * 2),
    };
  }

  const sampledSeed = typeof config.terrainSeed === 'number'
    ? config.terrainSeed
    : PROCEDURAL_RANDOM_SEED_FALLBACK;
  return {
    provider: new NoiseHeightProvider(sampledSeed),
    kind: 'noise',
    sampledSeed,
    slopeSampleDistance: 4,
  };
}

function addVegetationDensity(
  densityByType: Map<string, number>,
  biomeId: string,
  sampleWeight: number,
): void {
  const biome = getBiome(biomeId);
  for (const entry of biome.vegetationPalette) {
    const vegetationType = VEGETATION_TYPES.find((type) => type.id === entry.typeId);
    if (!vegetationType) continue;
    addCount(
      densityByType,
      entry.typeId,
      sampleWeight * entry.densityMultiplier * vegetationType.baseDensity * estimateClusterCoverage(vegetationType),
    );
  }
}

function estimateClusterCoverage(vegetationType: typeof VEGETATION_TYPES[number]): number {
  if (!vegetationType.cluster) return 1;
  const threshold = Math.max(0, Math.min(1, vegetationType.cluster.threshold));
  const feather = Math.max(0, Math.min(0.5, vegetationType.cluster.edgeFeather));
  return roundMetric(Math.max(0.05, Math.min(1, 1 - threshold + feather * 0.5)), 3);
}

function toVegetationDensity(entries: Map<string, number>): VegetationDensityEntry[] {
  const total = [...entries.values()].reduce((sum, value) => sum + value, 0);
  return [...entries.entries()]
    .map(([id, relativeDensity]) => {
      const type = VEGETATION_TYPES.find((candidate) => candidate.id === id);
      return {
        id,
        tier: type?.tier ?? 'unknown',
        relativeDensity: roundMetric(relativeDensity, 4),
        clusterCoverageEstimate: type ? estimateClusterCoverage(type) : 1,
        percent: total > 0 ? roundMetric((relativeDensity / total) * 100, 2) : 0,
      };
    })
    .sort((a, b) => b.relativeDensity - a.relativeDensity || a.id.localeCompare(b.id));
}

function analyzeMode(config: GameModeConfig): ModeDistributionReport {
  const { provider, kind, sampledSeed, slopeSampleDistance } = createHeightProvider(config);
  const defaultBiome = config.terrain.defaultBiome;
  const rules = config.terrain.biomeRules ?? [];
  const halfWorld = config.worldSize * 0.5;
  const inset = halfWorld * (SAMPLE_WORLD_INSET_PERCENT / 100);
  const minWorld = -halfWorld + inset;
  const maxWorld = halfWorld - inset;
  const cpuCounts = new Map<string, number>();
  const materialCounts = new Map<string, number>();
  const flatMaterialCounts = new Map<string, number>();
  const steepMaterialCounts = new Map<string, number>();
  const vegetationDensity = new Map<string, number>();
  let flatSamples = 0;
  let steepSamples = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let minSlope = Infinity;
  let maxSlope = -Infinity;
  let samples = 0;
  let cliffRockEligibleSamples = 0;
  let steepCliffRockEligibleSamples = 0;
  let cliffRockBlendSum = 0;
  let maxCliffRockBlend = 0;

  for (let ix = 0; ix < SAMPLE_GRID_SIZE; ix++) {
    for (let iz = 0; iz < SAMPLE_GRID_SIZE; iz++) {
      const x = minWorld + ((maxWorld - minWorld) * ix) / (SAMPLE_GRID_SIZE - 1);
      const z = minWorld + ((maxWorld - minWorld) * iz) / (SAMPLE_GRID_SIZE - 1);
      const height = provider.getHeightAt(x, z);
      const slopeDeg = computeSlopeDeg(x, z, slopeSampleDistance, (sx, sz) => provider.getHeightAt(sx, sz));
      const cpuBiome = classifyBiome(height, slopeDeg, rules, defaultBiome);
      const materialBiome = classifyMaterialPrimary(height, slopeDeg, rules, defaultBiome);
      const cliffRockBlend = computeCliffRockAccentBlend(height, slopeDeg);

      samples++;
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
      minSlope = Math.min(minSlope, slopeDeg);
      maxSlope = Math.max(maxSlope, slopeDeg);
      cliffRockBlendSum += cliffRockBlend;
      maxCliffRockBlend = Math.max(maxCliffRockBlend, cliffRockBlend);
      if (cliffRockBlend >= CLIFF_ROCK_ACCENT_ELIGIBLE_BLEND) {
        cliffRockEligibleSamples++;
      }
      addCount(cpuCounts, cpuBiome);
      addCount(materialCounts, materialBiome);
      addVegetationDensity(vegetationDensity, cpuBiome, 1);

      if (slopeDeg <= FLAT_SLOPE_MAX_DEGREES) {
        flatSamples++;
        addCount(flatMaterialCounts, materialBiome);
      }
      if (slopeDeg >= STEEP_SLOPE_MIN_DEGREES) {
        steepSamples++;
        addCount(steepMaterialCounts, materialBiome);
        if (cliffRockBlend >= CLIFF_ROCK_ACCENT_ELIGIBLE_BLEND) {
          steepCliffRockEligibleSamples++;
        }
      }
    }
  }

  const cpuBiomeDistribution = toDistribution(cpuCounts, samples);
  const materialPrimaryDistribution = toDistribution(materialCounts, samples);
  const flatGroundMaterialDistribution = toDistribution(flatMaterialCounts, flatSamples);
  const steepGroundMaterialDistribution = toDistribution(steepMaterialCounts, steepSamples);
  const vegetationRelativeDensity = toVegetationDensity(vegetationDensity);
  const materialJungleLikePercent = getJungleLikePercent(materialPrimaryDistribution);
  const flatJungleLikePercent = getJungleLikePercent(flatGroundMaterialDistribution);
  const flatHighlandPercent = getDistributionPercent(flatGroundMaterialDistribution, 'highland');
  const steepDenseJunglePercent = getDistributionPercent(steepGroundMaterialDistribution, 'denseJungle');
  const cliffRockAccent = {
    eligiblePercent: roundMetric((cliffRockEligibleSamples / samples) * 100, 2),
    steepGroundEligiblePercent: steepSamples > 0
      ? roundMetric((steepCliffRockEligibleSamples / steepSamples) * 100, 2)
      : 0,
    averageBlend: roundMetric(cliffRockBlendSum / samples, 4),
    maxBlend: roundMetric(maxCliffRockBlend, 4),
  };
  const bambooPercent = vegetationRelativeDensity.find((entry) => entry.id === 'bambooGrove')?.percent ?? 0;
  const flags: string[] = [];
  const findings: string[] = [];

  if (materialJungleLikePercent < 50) {
    flags.push('material-primary-not-majority-jungle-like');
    findings.push(`Material primary jungle-like share is ${materialJungleLikePercent}%.`);
  }
  if (flatJungleLikePercent < 55) {
    flags.push('flat-ground-not-majority-jungle-like');
    findings.push(`Flat-ground material jungle-like share is ${flatJungleLikePercent}%.`);
  }
  if (flatHighlandPercent > 30) {
    flags.push('flat-ground-highland-risk');
    findings.push(`Flat-ground highland material share is ${flatHighlandPercent}%.`);
  }
  if (
    steepDenseJunglePercent > 45 &&
    cliffRockAccent.steepGroundEligiblePercent < MIN_STEEP_CLIFF_ROCK_ACCENT_ELIGIBLE_PERCENT
  ) {
    flags.push('steep-slope-jungle-side-risk');
    findings.push(
      `Steep-slope dense-jungle material share is ${steepDenseJunglePercent}% and cliff-rock accent eligibility is ${cliffRockAccent.steepGroundEligiblePercent}%.`,
    );
  }
  if (bambooPercent > 20) {
    flags.push('bamboo-density-dominance-risk');
    findings.push(`Estimated bamboo relative vegetation density is ${bambooPercent}%.`);
  }
  if (config.terrainSeed === 'random') {
    flags.push('random-seed-mode-sampled-with-fixed-fallback');
    findings.push(`Random-seed mode sampled with fixed fallback seed ${PROCEDURAL_RANDOM_SEED_FALLBACK}.`);
  }

  return {
    id: config.id,
    name: config.name,
    status: flags.length > 0 ? 'warn' : 'pass',
    heightProvider: kind,
    sampledSeed,
    samples,
    sampleGridSize: SAMPLE_GRID_SIZE,
    sampleWorldInsetPercent: SAMPLE_WORLD_INSET_PERCENT,
    heightRangeMeters: { min: roundMetric(minHeight), max: roundMetric(maxHeight) },
    slopeRangeDegrees: { min: roundMetric(minSlope), max: roundMetric(maxSlope) },
    cpuBiomeDistribution,
    materialPrimaryDistribution,
    flatGroundMaterialDistribution,
    steepGroundMaterialDistribution,
    cliffRockAccent,
    vegetationRelativeDensity,
    flags,
    findings,
  };
}

function buildReport(): TerrainDistributionAudit {
  const modes = MODES.map(analyzeMode);
  const warnModes = modes.filter((mode) => mode.status === 'warn').length;
  const failModes = modes.filter((mode) => mode.status === 'fail').length;
  const status: CheckStatus = failModes > 0 ? 'fail' : warnModes > 0 ? 'warn' : 'pass';

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    workingTreeDirty: isWorkingTreeDirty(),
    status,
    source: 'projekt-143-terrain-distribution-audit',
    assumptions: {
      sampleGridSize: SAMPLE_GRID_SIZE,
      sampleWorldInsetPercent: SAMPLE_WORLD_INSET_PERCENT,
      flatSlopeMaxDegrees: FLAT_SLOPE_MAX_DEGREES,
      steepSlopeMinDegrees: STEEP_SLOPE_MIN_DEGREES,
      proceduralRandomSeedFallback: PROCEDURAL_RANDOM_SEED_FALLBACK,
      defaultMaterialElevationBlendWidthMeters: DEFAULT_MATERIAL_ELEVATION_BLEND_WIDTH_METERS,
      steepCliffRockAccentMinEligiblePercent: MIN_STEEP_CLIFF_ROCK_ACCENT_ELIGIBLE_PERCENT,
      notes: [
        'This is a static rule/material projection audit, not a screenshot proof.',
        'Terrain-flow stamps, feature surface patches, weather wetness, and runtime fog are not applied.',
        'CPU biome distribution estimates vegetation palettes; material primary distribution mirrors the terrain shader rule weights.',
        'Clustered vegetation types use approximate static coverage estimates; screenshots/runtime captures remain the authority for visual density.',
        'Cliff-rock accent metrics estimate the shader overlay that can use moss-tinted rocky texture on steep slopes without making highland the primary ground biome.',
        'Use this to choose a KB-TERRAIN branch; final acceptance still needs Open Frontier/A Shau screenshots and perf deltas.',
      ],
    },
    summary: {
      modes: modes.length,
      warnModes,
      failModes,
      flaggedModes: modes.filter((mode) => mode.flags.length > 0).length,
    },
    modes,
    recommendation: {
      nextBranch: 'Adjust terrain material rules so traversable ground reads jungle-like, then separately tune vegetation scale/density after screenshot review.',
      validationRequired: [
        'Before/after terrain distribution audit artifact.',
        'Ground-level and elevated Open Frontier/A Shau screenshots.',
        'Open Frontier and A Shau perf captures before accepting terrain material or vegetation distribution remediation.',
      ],
      nonClaims: [
        'No final visual acceptance from static distribution numbers alone.',
        'No far-canopy or vegetation-distance acceptance from this audit.',
        'No performance claim without matched runtime captures.',
      ],
    },
  };
}

function writeReport(report: TerrainDistributionAudit): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'projekt-143-terrain-distribution-audit');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'terrain-distribution-audit.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

function main(): void {
  const report = buildReport();
  const outputPath = writeReport(report);
  const relativePath = relative(process.cwd(), outputPath);
  console.log(`Projekt 143 terrain distribution audit ${report.status.toUpperCase()}: ${relativePath}`);
  for (const mode of report.modes) {
    const materialJungle = getJungleLikePercent(mode.materialPrimaryDistribution);
    const flatJungle = getJungleLikePercent(mode.flatGroundMaterialDistribution);
    const bamboo = mode.vegetationRelativeDensity.find((entry) => entry.id === 'bambooGrove')?.percent ?? 0;
    console.log(
      `- ${mode.id}: materialJungleLike=${materialJungle}%, flatJungleLike=${flatJungle}%, cliffRockSteepEligible=${mode.cliffRockAccent.steepGroundEligiblePercent}%, bambooDensity=${roundMetric(bamboo)}%, flags=${mode.flags.join(',') || 'none'}`,
    );
  }
}

main();
