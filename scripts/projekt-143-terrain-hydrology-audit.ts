#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { A_SHAU_VALLEY_CONFIG } from '../src/config/AShauValleyConfig';
import { OPEN_FRONTIER_CONFIG } from '../src/config/OpenFrontierConfig';
import type { GameModeConfig } from '../src/config/gameModeTypes';
import type { TerrainConfig } from '../src/config/biomes';
import { classifyBiome, computeSlopeDeg } from '../src/systems/terrain/BiomeClassifier';
import { DEMHeightProvider } from '../src/systems/terrain/DEMHeightProvider';
import { NoiseHeightProvider } from '../src/systems/terrain/NoiseHeightProvider';
import {
  bakeHydrologyFromHeightGrid,
  createHydrologyBakeArtifact,
  createHydrologyChannelPolylines,
  createHydrologyMasks,
  extractHydrologyChannelPaths,
  getHydrologyPercentile,
  hydrologyCellIndex,
} from '../src/systems/terrain/hydrology/HydrologyBake';
import {
  classifyHydrologyBiome,
  createHydrologyBiomeClassifier,
  type HydrologyBiomePolicy,
} from '../src/systems/terrain/hydrology/HydrologyBiomeClassifier';
import type { IHeightProvider } from '../src/systems/terrain/IHeightProvider';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface DistributionEntry {
  id: string;
  cells: number;
  percent: number;
}

interface CandidatePoint {
  x: number;
  z: number;
  elevation: number;
  slopeDeg: number;
  upstreamCells: number;
  upstreamKm2: number;
  baseBiome: string;
  currentBiome: string;
}

interface ChannelPolylinePoint {
  cell: number;
  x: number;
  z: number;
  elevationMeters: number;
  accumulationCells: number;
}

interface ChannelPolylineSummary {
  id: string;
  lengthCells: number;
  lengthMeters: number;
  maxAccumulationCells: number;
  head: ChannelPolylinePoint | null;
  outlet: ChannelPolylinePoint | null;
  points: ChannelPolylinePoint[];
}

interface HydrologyScenarioAudit {
  mode: string;
  source: 'dem' | 'procedural-noise';
  status: CheckStatus;
  assumptions: {
    sampleGridSize: number;
    sampleWorldInsetPercent: number;
    sampleSpacingMeters: number;
    depressionHandling: string;
    wetCandidateAccumulationQuantile: number;
    channelCandidateAccumulationQuantile: number;
    wetCandidateSlopeMaxDegrees: number;
    wetCandidateElevationMaxMeters: number;
    currentHydrologyBiomeIds: string[];
  };
  summary: {
    cells: number;
    wetCandidatePercent: number;
    channelCandidatePercent: number;
    currentHydrologyBiomePercent: number;
    currentHydrologyCoversWetPercent: number;
    wetCandidatesStillDenseJunglePercent: number;
    currentHydrologyWithoutWetSignalPercent: number;
    bambooOnWetCandidatePercent: number;
    channelPathCount: number;
    longestChannelPathCells: number;
    longestChannelPathMeters: number;
  };
  distributions: {
    currentBiome: DistributionEntry[];
    wetCandidateBiome: DistributionEntry[];
    channelCandidateBiome: DistributionEntry[];
  };
  thresholds: {
    accumulationP90Cells: number;
    accumulationP95Cells: number;
    accumulationP98Cells: number;
    accumulationP99Cells: number;
    wetCandidateMinimumUpstreamCells: number;
    channelCandidateMinimumUpstreamCells: number;
  };
  samplePoints: {
    strongestDrainage: CandidatePoint[];
    wetCandidatesStillDenseJungle: CandidatePoint[];
  };
  channelPolylines: ChannelPolylineSummary[];
  files: {
    maskImage: string;
    cacheArtifact: string;
  };
  flags: string[];
  findings: string[];
}

interface HydrologyAudit {
  createdAt: string;
  sourceGitSha: string;
  workingTreeDirty: boolean;
  source: 'projekt-143-terrain-hydrology-audit';
  status: CheckStatus;
  staticContracts: {
    bakeCorePath: string;
    manifestLoaderPath: string;
    biomeClassifierPath: string;
    corridorSamplerPath: string;
    corridorSamplerStatus: 'pure_world_space_helper';
  };
  assumptions: {
    mode: string;
    sampleGridSize: number;
    sampleWorldInsetPercent: number;
    sampleSpacingMeters: number;
    depressionHandling: string;
    wetCandidateAccumulationQuantile: number;
    channelCandidateAccumulationQuantile: number;
    wetCandidateSlopeMaxDegrees: number;
    wetCandidateElevationMaxMeters: number;
    notes: string[];
  };
  summary: HydrologyScenarioAudit['summary'];
  distributions: HydrologyScenarioAudit['distributions'];
  thresholds: HydrologyScenarioAudit['thresholds'];
  samplePoints: HydrologyScenarioAudit['samplePoints'];
  channelPolylines: HydrologyScenarioAudit['channelPolylines'];
  files: {
    aShauMaskImage: string;
    openFrontierMaskImage: string;
    aShauCacheArtifact: string;
    openFrontierCacheArtifact: string;
  };
  scenarios: {
    aShau: HydrologyScenarioAudit;
    openFrontier: HydrologyScenarioAudit;
  };
  flags: string[];
  findings: string[];
  recommendation: {
    nextBranch: string;
    validationRequired: string[];
    nonClaims: string[];
  };
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-terrain-hydrology-audit';
const SAMPLE_GRID_SIZE = 257;
const SAMPLE_WORLD_INSET_PERCENT = 4;
const WET_CANDIDATE_ACCUMULATION_QUANTILE = 0.92;
const CHANNEL_CANDIDATE_ACCUMULATION_QUANTILE = 0.98;
const WET_CANDIDATE_SLOPE_MAX_DEGREES = 16;
const WET_CANDIDATE_ELEVATION_MAX_METERS = 980;
const OPEN_FRONTIER_WET_CANDIDATE_ELEVATION_MAX_METERS = 35;
const DEPRESSION_HANDLING = 'epsilon-fill';

interface ScenarioInput {
  mode: string;
  source: HydrologyScenarioAudit['source'];
  provider: IHeightProvider;
  terrain: TerrainConfig;
  worldSize: number;
  wetCandidateElevationMaxMeters: number;
  currentHydrologyBiomeIds: string[];
  biomePolicy: HydrologyBiomePolicy;
}

interface ScenarioMaskImageInput {
  mode: string;
  source: HydrologyScenarioAudit['source'];
  heights: Float32Array;
  biomeIds: string[];
  hydrologyBiomes: Set<string>;
  wetCandidate: Uint8Array;
  channelCandidate: Uint8Array;
  outputDir: string;
}

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

function loadDemProvider(): DEMHeightProvider {
  const source = A_SHAU_VALLEY_CONFIG.heightSource;
  if (!source || source.type !== 'dem') {
    throw new Error('A Shau Valley does not define a DEM height source');
  }
  const relativePath = source.path.startsWith('/') ? source.path.slice(1) : source.path;
  const dataPath = join(process.cwd(), 'public', relativePath);
  if (!existsSync(dataPath)) {
    throw new Error(`Missing A Shau DEM file: ${dataPath}`);
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

function toDistribution(counts: Map<string, number>, total: number): DistributionEntry[] {
  return [...counts.entries()]
    .map(([id, cells]) => ({
      id,
      cells,
      percent: total > 0 ? roundMetric((cells / total) * 100, 2) : 0,
    }))
    .sort((a, b) => b.cells - a.cells || a.id.localeCompare(b.id));
}

function addCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function summarizePolylinePoint(point: ChannelPolylinePoint): ChannelPolylinePoint {
  return {
    cell: point.cell,
    x: roundMetric(point.x, 1),
    z: roundMetric(point.z, 1),
    elevationMeters: roundMetric(point.elevationMeters, 1),
    accumulationCells: roundMetric(point.accumulationCells, 1),
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function requireTerrain(config: GameModeConfig): TerrainConfig {
  if (!config.terrain) {
    throw new Error(`${config.name} terrain config is required for hydrology audit`);
  }
  return config.terrain;
}

function proceduralSeed(config: GameModeConfig): number {
  if (typeof config.terrainSeed !== 'number') {
    throw new Error(`${config.name} needs a deterministic numeric terrainSeed for procedural hydrology audit`);
  }
  return config.terrainSeed;
}

async function writeScenarioMaskImage(input: ScenarioMaskImageInput): Promise<string> {
  const scale = 4;
  const legendHeight = 128;
  const scaledSize = SAMPLE_GRID_SIZE * scale;
  const outputPath = join(input.outputDir, `${input.mode}-hydrology-mask.png`);
  const buffer = Buffer.alloc(SAMPLE_GRID_SIZE * SAMPLE_GRID_SIZE * 3);
  const low = getHydrologyPercentile(input.heights, 0.02);
  const high = Math.max(low + 1, getHydrologyPercentile(input.heights, 0.98));

  for (let index = 0; index < SAMPLE_GRID_SIZE * SAMPLE_GRID_SIZE; index++) {
    const offset = index * 3;
    const t = Math.max(0, Math.min(1, ((input.heights[index] ?? low) - low) / (high - low)));
    const base = Math.round(34 + t * 125);
    const currentHydrology = input.hydrologyBiomes.has(input.biomeIds[index] ?? '');
    const wet = (input.wetCandidate[index] ?? 0) > 0;
    const channel = (input.channelCandidate[index] ?? 0) > 0;

    let r = Math.round(base * 0.75);
    let g = Math.round(base * 1.05);
    let b = Math.round(base * 0.7);
    if (currentHydrology && wet) {
      r = 95; g = 225; b = 95;
    } else if (currentHydrology) {
      r = 235; g = 80; b = 80;
    } else if (channel) {
      r = 20; g = 235; b = 255;
    } else if (wet) {
      r = 45; g = 120; b = 245;
    }

    buffer[offset] = r;
    buffer[offset + 1] = g;
    buffer[offset + 2] = b;
  }

  const mask = await sharp(buffer, {
    raw: {
      width: SAMPLE_GRID_SIZE,
      height: SAMPLE_GRID_SIZE,
      channels: 3,
    },
  }).resize(scaledSize, scaledSize, { kernel: 'nearest' }).png().toBuffer();

  const legend = Buffer.from(`
<svg width="${scaledSize}" height="${legendHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#111827"/>
  <text x="18" y="28" fill="#f9fafb" font-family="Arial, sans-serif" font-size="18" font-weight="700">${escapeXml(input.mode)} hydrology mask</text>
  <text x="18" y="52" fill="#d1d5db" font-family="Arial, sans-serif" font-size="13">${escapeXml(input.source)} | blue wet candidate | cyan channel | red runtime hydrology outside signal | green runtime hydrology/signal overlap</text>
  <rect x="18" y="74" width="18" height="18" fill="#2d78f5"/>
  <text x="44" y="88" fill="#e5e7eb" font-family="Arial, sans-serif" font-size="13">wet candidate</text>
  <rect x="184" y="74" width="18" height="18" fill="#14ebff"/>
  <text x="210" y="88" fill="#e5e7eb" font-family="Arial, sans-serif" font-size="13">channel candidate</text>
  <rect x="392" y="74" width="18" height="18" fill="#eb5050"/>
  <text x="418" y="88" fill="#e5e7eb" font-family="Arial, sans-serif" font-size="13">runtime hydrology only</text>
  <rect x="610" y="74" width="18" height="18" fill="#5fe15f"/>
  <text x="636" y="88" fill="#e5e7eb" font-family="Arial, sans-serif" font-size="13">runtime hydrology overlap</text>
</svg>`);

  await sharp({
    create: {
      width: scaledSize,
      height: scaledSize + legendHeight,
      channels: 3,
      background: '#111827',
    },
  }).composite([
    { input: legend, left: 0, top: 0 },
    { input: mask, left: 0, top: legendHeight },
  ]).png().toFile(outputPath);

  return relative(process.cwd(), outputPath);
}

async function analyzeScenario(input: ScenarioInput, outputDir: string): Promise<HydrologyScenarioAudit> {
  const rules = input.terrain.biomeRules ?? [];
  const defaultBiome = input.terrain.defaultBiome;
  const hydrologyBiomes = new Set(input.currentHydrologyBiomeIds);
  const cellCount = SAMPLE_GRID_SIZE * SAMPLE_GRID_SIZE;
  const halfWorld = input.worldSize * 0.5;
  const inset = halfWorld * (SAMPLE_WORLD_INSET_PERCENT / 100);
  const minWorld = -halfWorld + inset;
  const maxWorld = halfWorld - inset;
  const sampleSpacing = (maxWorld - minWorld) / (SAMPLE_GRID_SIZE - 1);
  const heights = new Float32Array(cellCount);
  const slopes = new Float32Array(cellCount);
  const baseBiomeIds: string[] = new Array(cellCount);
  const runtimeBiomeIds: string[] = new Array(cellCount);

  for (let z = 0; z < SAMPLE_GRID_SIZE; z++) {
    for (let x = 0; x < SAMPLE_GRID_SIZE; x++) {
      const worldX = minWorld + x * sampleSpacing;
      const worldZ = minWorld + z * sampleSpacing;
      const index = hydrologyCellIndex(x, z, SAMPLE_GRID_SIZE);
      const elevation = input.provider.getHeightAt(worldX, worldZ);
      const slope = computeSlopeDeg(worldX, worldZ, sampleSpacing, (sx, sz) => input.provider.getHeightAt(sx, sz));
      heights[index] = elevation;
      slopes[index] = slope;
      baseBiomeIds[index] = classifyBiome(elevation, slope, rules, defaultBiome);
    }
  }

  const hydrology = bakeHydrologyFromHeightGrid({
    width: SAMPLE_GRID_SIZE,
    height: SAMPLE_GRID_SIZE,
    cellSizeMeters: sampleSpacing,
    heights,
    depressionHandling: DEPRESSION_HANDLING,
  });
  const { accumulation } = hydrology;
  const wetThreshold = getHydrologyPercentile(accumulation, WET_CANDIDATE_ACCUMULATION_QUANTILE);
  const channelThreshold = getHydrologyPercentile(accumulation, CHANNEL_CANDIDATE_ACCUMULATION_QUANTILE);
  const channelPaths = extractHydrologyChannelPaths(hydrology, {
    minAccumulationCells: channelThreshold,
    minLengthCells: 3,
  });
  const longestChannelPathCells = channelPaths.reduce((longest, path) => Math.max(longest, path.cells.length), 0);
  const worldTransform = {
    originX: minWorld,
    originZ: minWorld,
    cellSizeMeters: sampleSpacing,
  };
  const rawChannelPolylines = createHydrologyChannelPolylines(
    hydrology,
    channelPaths.slice(0, 12),
    worldTransform,
    { maxPointsPerPath: 64 },
  );
  const channelPolylines = rawChannelPolylines.map((path, index) => ({
    id: `${input.mode}-channel-${index + 1}`,
    lengthCells: path.lengthCells,
    lengthMeters: roundMetric(path.lengthMeters, 1),
    maxAccumulationCells: roundMetric(path.maxAccumulationCells, 1),
    head: path.points[0] ? summarizePolylinePoint(path.points[0]) : null,
    outlet: path.points[path.points.length - 1] ? summarizePolylinePoint(path.points[path.points.length - 1] as ChannelPolylinePoint) : null,
    points: path.points.map(summarizePolylinePoint),
  }));
  const masks = createHydrologyMasks(hydrology, {
    slopes,
    wetCandidate: {
      minAccumulationCells: wetThreshold,
      maxSlopeDegrees: WET_CANDIDATE_SLOPE_MAX_DEGREES,
      maxElevationMeters: input.wetCandidateElevationMaxMeters,
    },
    channelMinAccumulationCells: channelThreshold,
  });
  const cacheArtifact = createHydrologyBakeArtifact(hydrology, {
    transform: worldTransform,
    masks,
    channelPolylines: rawChannelPolylines,
  });
  const runtimeClassifier = createHydrologyBiomeClassifier(cacheArtifact, input.biomePolicy);
  for (let z = 0; z < SAMPLE_GRID_SIZE; z++) {
    for (let x = 0; x < SAMPLE_GRID_SIZE; x++) {
      const worldX = minWorld + x * sampleSpacing;
      const worldZ = minWorld + z * sampleSpacing;
      const index = hydrologyCellIndex(x, z, SAMPLE_GRID_SIZE);
      const baseBiomeId = baseBiomeIds[index] ?? defaultBiome;
      runtimeBiomeIds[index] = classifyHydrologyBiome(
        baseBiomeId,
        heights[index] ?? 0,
        slopes[index] ?? 0,
        worldX,
        worldZ,
        runtimeClassifier,
      );
    }
  }
  const biomeCounts = new Map<string, number>();
  const wetBiomeCounts = new Map<string, number>();
  const channelBiomeCounts = new Map<string, number>();
  const strongestDrainage: CandidatePoint[] = [];
  const wetDenseJunglePoints: CandidatePoint[] = [];
  let wetCandidateCells = 0;
  let channelCandidateCells = 0;
  let currentHydrologyBiomeCells = 0;
  let hydrologyBiomeWetOverlapCells = 0;
  let wetDenseJungleCells = 0;
  let hydrologyWithoutWetSignalCells = 0;
  let bambooOnWetCells = 0;

  function pointFor(index: number): CandidatePoint {
    const x = index % SAMPLE_GRID_SIZE;
    const z = Math.floor(index / SAMPLE_GRID_SIZE);
    const upstreamCells = accumulation[index] ?? 0;
    return {
      x: roundMetric(minWorld + x * sampleSpacing, 1),
      z: roundMetric(minWorld + z * sampleSpacing, 1),
      elevation: roundMetric(heights[index] ?? 0, 1),
      slopeDeg: roundMetric(slopes[index] ?? 0, 1),
      upstreamCells: roundMetric(upstreamCells, 1),
      upstreamKm2: roundMetric((upstreamCells * sampleSpacing * sampleSpacing) / 1_000_000, 3),
      baseBiome: baseBiomeIds[index] ?? defaultBiome,
      currentBiome: runtimeBiomeIds[index] ?? baseBiomeIds[index] ?? defaultBiome,
    };
  }

  for (let index = 0; index < cellCount; index++) {
    const biomeId = runtimeBiomeIds[index] ?? baseBiomeIds[index] ?? defaultBiome;
    const upstreamCells = accumulation[index] ?? 0;
    const isCurrentHydrologyBiome = hydrologyBiomes.has(biomeId);
    const isWetCandidate = (masks.wetCandidate[index] ?? 0) > 0;
    const isChannelCandidate = (masks.channelCandidate[index] ?? 0) > 0;
    const hasHydrologySignal = isWetCandidate || isChannelCandidate;

    addCount(biomeCounts, biomeId);
    if (isCurrentHydrologyBiome) currentHydrologyBiomeCells++;
    if (isWetCandidate) {
      wetCandidateCells++;
      addCount(wetBiomeCounts, biomeId);
      if (isCurrentHydrologyBiome) hydrologyBiomeWetOverlapCells++;
      if (biomeId === 'denseJungle') {
        wetDenseJungleCells++;
        wetDenseJunglePoints.push(pointFor(index));
      }
      if (biomeId === 'bambooGrove') bambooOnWetCells++;
    } else if (isCurrentHydrologyBiome && !hasHydrologySignal) {
      hydrologyWithoutWetSignalCells++;
    }
    if (isChannelCandidate) {
      channelCandidateCells++;
      addCount(channelBiomeCounts, biomeId);
      strongestDrainage.push(pointFor(index));
    }
  }

  strongestDrainage.sort((a, b) => b.upstreamCells - a.upstreamCells);
  wetDenseJunglePoints.sort((a, b) => b.upstreamCells - a.upstreamCells);

  const currentHydrologyCoversWetPercent = wetCandidateCells > 0
    ? roundMetric((hydrologyBiomeWetOverlapCells / wetCandidateCells) * 100, 2)
    : 0;
  const wetCandidatesStillDenseJunglePercent = wetCandidateCells > 0
    ? roundMetric((wetDenseJungleCells / wetCandidateCells) * 100, 2)
    : 0;
  const currentHydrologyWithoutWetSignalPercent = currentHydrologyBiomeCells > 0
    ? roundMetric((hydrologyWithoutWetSignalCells / currentHydrologyBiomeCells) * 100, 2)
    : 0;
  const bambooOnWetCandidatePercent = wetCandidateCells > 0
    ? roundMetric((bambooOnWetCells / wetCandidateCells) * 100, 2)
    : 0;
  const flags: string[] = [];
  const findings: string[] = [];

  if (wetCandidateCells === 0) {
    flags.push('no-wet-drainage-candidates');
    findings.push(`${input.mode} accumulation pass found no wet drainage candidates under the configured thresholds.`);
  }
  if (currentHydrologyCoversWetPercent < 90) {
    flags.push('runtime-hydrology-misses-drainage-candidates');
    findings.push(`Runtime hydrology classification covers ${currentHydrologyCoversWetPercent}% of ${input.mode} wet drainage candidates.`);
  }
  if (currentHydrologyWithoutWetSignalPercent > 5) {
    flags.push('runtime-hydrology-outside-signal');
    findings.push(`Runtime hydrology classification puts ${currentHydrologyWithoutWetSignalPercent}% of ${input.mode} hydrology biome cells outside the wet/channel signal.`);
  }
  if (wetCandidatesStillDenseJunglePercent > 10) {
    flags.push('wet-candidates-remain-dense-jungle');
    findings.push(`${wetCandidatesStillDenseJunglePercent}% of ${input.mode} wet drainage candidates still classify as denseJungle after runtime hydrology classification.`);
  }
  if (bambooOnWetCandidatePercent > 5) {
    flags.push('bamboo-overlaps-wet-drainage');
    findings.push(`${bambooOnWetCandidatePercent}% of ${input.mode} wet drainage candidates classify as bambooGrove after runtime hydrology classification.`);
  }
  if (findings.length === 0) {
    findings.push(`The ${input.mode} runtime hydrology classifier maps wet/channel candidates without broad dry-cell riverbank or swamp leakage at this audit resolution.`);
  }
  const maskImage = await writeScenarioMaskImage({
    mode: input.mode,
    source: input.source,
    heights,
    biomeIds: runtimeBiomeIds,
    hydrologyBiomes,
    wetCandidate: masks.wetCandidate,
    channelCandidate: masks.channelCandidate,
    outputDir,
  });
  const cacheArtifactPath = join(outputDir, `${input.mode}-hydrology-cache.json`);
  writeFileSync(cacheArtifactPath, `${JSON.stringify(cacheArtifact, null, 2)}\n`, 'utf-8');

  return {
    mode: input.mode,
    source: input.source,
    status: flags.length > 0 ? 'warn' : 'pass',
    assumptions: {
      sampleGridSize: SAMPLE_GRID_SIZE,
      sampleWorldInsetPercent: SAMPLE_WORLD_INSET_PERCENT,
      sampleSpacingMeters: roundMetric(sampleSpacing, 1),
      depressionHandling: DEPRESSION_HANDLING,
      wetCandidateAccumulationQuantile: WET_CANDIDATE_ACCUMULATION_QUANTILE,
      channelCandidateAccumulationQuantile: CHANNEL_CANDIDATE_ACCUMULATION_QUANTILE,
      wetCandidateSlopeMaxDegrees: WET_CANDIDATE_SLOPE_MAX_DEGREES,
      wetCandidateElevationMaxMeters: input.wetCandidateElevationMaxMeters,
      currentHydrologyBiomeIds: input.currentHydrologyBiomeIds,
    },
    summary: {
      cells: cellCount,
      wetCandidatePercent: roundMetric((wetCandidateCells / cellCount) * 100, 2),
      channelCandidatePercent: roundMetric((channelCandidateCells / cellCount) * 100, 2),
      currentHydrologyBiomePercent: roundMetric((currentHydrologyBiomeCells / cellCount) * 100, 2),
      currentHydrologyCoversWetPercent,
      wetCandidatesStillDenseJunglePercent,
      currentHydrologyWithoutWetSignalPercent,
      bambooOnWetCandidatePercent,
      channelPathCount: channelPaths.length,
      longestChannelPathCells,
      longestChannelPathMeters: roundMetric(longestChannelPathCells * sampleSpacing, 1),
    },
    distributions: {
      currentBiome: toDistribution(biomeCounts, cellCount),
      wetCandidateBiome: toDistribution(wetBiomeCounts, wetCandidateCells),
      channelCandidateBiome: toDistribution(channelBiomeCounts, channelCandidateCells),
    },
    thresholds: {
      accumulationP90Cells: roundMetric(hydrology.thresholds.accumulationP90Cells, 1),
      accumulationP95Cells: roundMetric(hydrology.thresholds.accumulationP95Cells, 1),
      accumulationP98Cells: roundMetric(hydrology.thresholds.accumulationP98Cells, 1),
      accumulationP99Cells: roundMetric(hydrology.thresholds.accumulationP99Cells, 1),
      wetCandidateMinimumUpstreamCells: roundMetric(wetThreshold, 1),
      channelCandidateMinimumUpstreamCells: roundMetric(channelThreshold, 1),
    },
    samplePoints: {
      strongestDrainage: strongestDrainage.slice(0, 20),
      wetCandidatesStillDenseJungle: wetDenseJunglePoints.slice(0, 20),
    },
    channelPolylines,
    files: {
      maskImage,
      cacheArtifact: relative(process.cwd(), cacheArtifactPath),
    },
    flags,
    findings,
  };
}

async function buildHydrologyAudit(outputDir: string): Promise<HydrologyAudit> {
  const aShau = await analyzeScenario({
    mode: A_SHAU_VALLEY_CONFIG.id,
    source: 'dem',
    provider: loadDemProvider(),
    terrain: requireTerrain(A_SHAU_VALLEY_CONFIG),
    worldSize: A_SHAU_VALLEY_CONFIG.worldSize,
    wetCandidateElevationMaxMeters: WET_CANDIDATE_ELEVATION_MAX_METERS,
    currentHydrologyBiomeIds: ['riverbank', 'swamp'],
    biomePolicy: {
      wetBiomeId: A_SHAU_VALLEY_CONFIG.hydrology?.biomeClassification?.wetBiomeId ?? 'swamp',
      channelBiomeId: A_SHAU_VALLEY_CONFIG.hydrology?.biomeClassification?.channelBiomeId ?? 'riverbank',
      maxSlopeDeg: A_SHAU_VALLEY_CONFIG.hydrology?.biomeClassification?.maxSlopeDeg,
    },
  }, outputDir);
  const openFrontier = await analyzeScenario({
    mode: OPEN_FRONTIER_CONFIG.id,
    source: 'procedural-noise',
    provider: new NoiseHeightProvider(proceduralSeed(OPEN_FRONTIER_CONFIG)),
    terrain: requireTerrain(OPEN_FRONTIER_CONFIG),
    worldSize: OPEN_FRONTIER_CONFIG.worldSize,
    wetCandidateElevationMaxMeters: OPEN_FRONTIER_WET_CANDIDATE_ELEVATION_MAX_METERS,
    currentHydrologyBiomeIds: ['riverbank'],
    biomePolicy: {
      wetBiomeId: OPEN_FRONTIER_CONFIG.hydrology?.biomeClassification?.wetBiomeId ?? 'riverbank',
      channelBiomeId: OPEN_FRONTIER_CONFIG.hydrology?.biomeClassification?.channelBiomeId ?? 'riverbank',
      maxSlopeDeg: OPEN_FRONTIER_CONFIG.hydrology?.biomeClassification?.maxSlopeDeg,
    },
  }, outputDir);
  const flags = [
    ...aShau.flags.map((flag) => `${aShau.mode}:${flag}`),
    ...openFrontier.flags.map((flag) => `${openFrontier.mode}:${flag}`),
  ];
  const findings = [
    ...aShau.findings.map((finding) => `${aShau.mode}: ${finding}`),
    ...openFrontier.findings.map((finding) => `${openFrontier.mode}: ${finding}`),
  ];
  const cellAreaKm2 = (
    aShau.assumptions.sampleSpacingMeters
    * aShau.assumptions.sampleSpacingMeters
  ) / 1_000_000;

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    workingTreeDirty: isWorkingTreeDirty(),
    source: OUTPUT_NAME,
    status: flags.length > 0 ? 'warn' : 'pass',
    staticContracts: {
      bakeCorePath: 'src/systems/terrain/hydrology/HydrologyBake.ts',
      manifestLoaderPath: 'src/systems/terrain/hydrology/HydrologyBakeManifest.ts',
      biomeClassifierPath: 'src/systems/terrain/hydrology/HydrologyBiomeClassifier.ts',
      corridorSamplerPath: 'src/systems/terrain/hydrology/HydrologyCorridor.ts',
      corridorSamplerStatus: 'pure_world_space_helper',
    },
    assumptions: {
      mode: A_SHAU_VALLEY_CONFIG.id,
      sampleGridSize: SAMPLE_GRID_SIZE,
      sampleWorldInsetPercent: SAMPLE_WORLD_INSET_PERCENT,
      sampleSpacingMeters: aShau.assumptions.sampleSpacingMeters,
      depressionHandling: DEPRESSION_HANDLING,
      wetCandidateAccumulationQuantile: WET_CANDIDATE_ACCUMULATION_QUANTILE,
      channelCandidateAccumulationQuantile: CHANNEL_CANDIDATE_ACCUMULATION_QUANTILE,
      wetCandidateSlopeMaxDegrees: WET_CANDIDATE_SLOPE_MAX_DEGREES,
      wetCandidateElevationMaxMeters: WET_CANDIDATE_ELEVATION_MAX_METERS,
      notes: [
        'Top-level summary/distributions/thresholds remain A Shau for compatibility with existing Projekt routing.',
        'The scenarios object also includes Open Frontier procedural-noise hydrology using the same bake interface.',
        'This is a static epsilon-filled D8-style drainage audit on downsampled grids, paired with the runtime hydrology biome classifier.',
        'Each sampled cell starts with one unit of contributing area and routes to its steepest lower neighbor after depression fill.',
        'Wet candidates require high contributing area, gentle terrain, and plausible valley elevation.',
        'Runtime currentBiome fields include baked hydrology wet/channel mask overrides; base lowland riverbank/swamp elevation proxies are intentionally not used.',
      ],
    },
    summary: aShau.summary,
    distributions: aShau.distributions,
    thresholds: aShau.thresholds,
    samplePoints: aShau.samplePoints,
    files: {
      aShauMaskImage: aShau.files.maskImage,
      openFrontierMaskImage: openFrontier.files.maskImage,
      aShauCacheArtifact: aShau.files.cacheArtifact,
      openFrontierCacheArtifact: openFrontier.files.cacheArtifact,
    },
    scenarios: {
      aShau,
      openFrontier,
    },
    flags,
    findings,
    recommendation: {
      nextBranch: 'Review and tune the hydrology-backed runtime riverbank/swamp corridors visually before final vegetation ecology acceptance.',
      validationRequired: [
        'Compare drainage-mask candidate screenshots against current A Shau ground-level and elevated views.',
        'Add an Open Frontier river-corridor review image before changing runtime terrain or water.',
        'Rerun terrain distribution and hydrology audits after any runtime classification or mask-threshold change.',
        'Run matched Open Frontier and A Shau perf captures before accepting the hydrology-backed vegetation distribution.',
      ],
      nonClaims: [
        'This audit does not prove real stream geometry, water rendering, or path/trail erosion.',
        `Each sampled cell is approximately ${roundMetric(cellAreaKm2, 4)}km2; fine stream placement needs a higher-resolution accepted layer.`,
      ],
    },
  };
}

function createOutputDir(): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function writeReport(report: HydrologyAudit, outputDir: string): string {
  const outputPath = join(outputDir, 'hydrology-audit.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  return outputPath;
}

async function main(): Promise<void> {
  const outputDir = createOutputDir();
  const report = await buildHydrologyAudit(outputDir);
  const outputPath = writeReport(report, outputDir);
  const relativePath = relative(process.cwd(), outputPath);
  console.log(`Projekt 143 terrain hydrology audit ${report.status.toUpperCase()}: ${relativePath}`);
  for (const scenario of [report.scenarios.aShau, report.scenarios.openFrontier]) {
    console.log(
      `- ${scenario.mode}: wetCandidate=${scenario.summary.wetCandidatePercent}% currentHydrology=${scenario.summary.currentHydrologyBiomePercent}% currentCoversWet=${scenario.summary.currentHydrologyCoversWetPercent}% denseWet=${scenario.summary.wetCandidatesStillDenseJunglePercent}%`,
    );
  }
  for (const finding of report.findings) {
    console.log(`- ${finding}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
