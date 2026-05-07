#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { A_SHAU_VALLEY_CONFIG } from '../src/config/AShauValleyConfig';
import { OPEN_FRONTIER_CONFIG } from '../src/config/OpenFrontierConfig';
import type { GameModeConfig } from '../src/config/gameModeTypes';
import { GameMode } from '../src/config/gameModeTypes';
import { getMapVariants } from '../src/config/MapSeedRegistry';
import type { TerrainConfig } from '../src/config/biomes';
import { computeSlopeDeg } from '../src/systems/terrain/BiomeClassifier';
import { DEMHeightProvider } from '../src/systems/terrain/DEMHeightProvider';
import type { IHeightProvider } from '../src/systems/terrain/IHeightProvider';
import { NoiseHeightProvider } from '../src/systems/terrain/NoiseHeightProvider';
import {
  type HydrologyBakeArtifact,
  bakeHydrologyFromHeightGrid,
  createHydrologyBakeArtifact,
  createHydrologyChannelPolylines,
  createHydrologyMasks,
  extractHydrologyChannelPaths,
  getHydrologyPercentile,
  hydrologyCellIndex,
} from '../src/systems/terrain/hydrology/HydrologyBake';

type HydrologySource = 'dem' | 'procedural-noise';

interface HydrologyBakeEntry {
  modeId: string;
  source: HydrologySource;
  seed: number | null;
  signature: string;
  hydrologyAsset: string;
  worldSize: number;
  sampleGridSize: number;
  sampleWorldInsetPercent: number;
  sampleSpacingMeters: number;
  depressionHandling: 'epsilon-fill';
  wetCandidateAccumulationQuantile: number;
  channelCandidateAccumulationQuantile: number;
  wetCandidateSlopeMaxDegrees: number;
  wetCandidateElevationMaxMeters: number;
  currentHydrologyBiomeIds: string[];
}

interface HydrologyBakeManifest {
  schemaVersion: 1;
  generator: 'scripts/prebake-hydrology.ts';
  entries: HydrologyBakeEntry[];
}

interface HydrologyModeSource {
  modeId: string;
  source: HydrologySource;
  seed: number | null;
  config: GameModeConfig;
  provider: IHeightProvider;
  wetCandidateElevationMaxMeters: number;
  currentHydrologyBiomeIds: string[];
}

interface ExpectedHydrologyBake {
  entry: HydrologyBakeEntry;
  artifact: HydrologyBakeArtifact;
  artifactJson: string;
  artifactPath: string;
}

const HYDROLOGY_DIR = resolve(import.meta.dirname!, '..', 'public', 'data', 'hydrology');
const HYDROLOGY_MANIFEST_PATH = resolve(HYDROLOGY_DIR, 'bake-manifest.json');
const SAMPLE_GRID_SIZE = 257;
const SAMPLE_WORLD_INSET_PERCENT = 4;
const WET_CANDIDATE_ACCUMULATION_QUANTILE = 0.92;
const CHANNEL_CANDIDATE_ACCUMULATION_QUANTILE = 0.98;
const WET_CANDIDATE_SLOPE_MAX_DEGREES = 16;
const A_SHAU_WET_CANDIDATE_ELEVATION_MAX_METERS = 980;
const OPEN_FRONTIER_WET_CANDIDATE_ELEVATION_MAX_METERS = 35;
const DEPRESSION_HANDLING = 'epsilon-fill' as const;

function stableSignaturePayload(value: unknown): string {
  return JSON.stringify(normalizeForSignature(value));
}

function normalizeForSignature(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(6)) : String(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(normalizeForSignature);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (typeof entry === 'function') continue;
      normalized[key] = normalizeForSignature(entry);
    }
    return normalized;
  }
  return String(value);
}

function hashSignature(input: unknown): string {
  const payload = stableSignaturePayload({ signatureVersion: 1, input });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `hydrology-bake-v1-${hash}`;
}

function loadDemProvider(): DEMHeightProvider {
  const source = A_SHAU_VALLEY_CONFIG.heightSource;
  if (!source || source.type !== 'dem') {
    throw new Error('A Shau Valley does not define a DEM height source');
  }

  const relativePath = source.path.startsWith('/') ? source.path.slice(1) : source.path;
  const dataPath = resolve(import.meta.dirname!, '..', 'public', relativePath);
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

function requireTerrain(config: GameModeConfig): TerrainConfig {
  if (!config.terrain) {
    throw new Error(`${config.id} terrain config is required for hydrology prebake`);
  }
  return config.terrain;
}

function createModeSources(): HydrologyModeSource[] {
  const openFrontierSeeds = getMapVariants(GameMode.OPEN_FRONTIER)
    .map((variant) => variant.seed);
  const seeds = openFrontierSeeds.length > 0
    ? openFrontierSeeds
    : [OPEN_FRONTIER_CONFIG.terrainSeed].filter((seed): seed is number => typeof seed === 'number');

  return [
    {
      modeId: A_SHAU_VALLEY_CONFIG.id,
      source: 'dem',
      seed: null,
      config: A_SHAU_VALLEY_CONFIG,
      provider: loadDemProvider(),
      wetCandidateElevationMaxMeters: A_SHAU_WET_CANDIDATE_ELEVATION_MAX_METERS,
      currentHydrologyBiomeIds: ['riverbank', 'swamp'],
    },
    ...seeds.map((seed): HydrologyModeSource => ({
      modeId: OPEN_FRONTIER_CONFIG.id,
      source: 'procedural-noise',
      seed,
      config: OPEN_FRONTIER_CONFIG,
      provider: new NoiseHeightProvider(seed),
      wetCandidateElevationMaxMeters: OPEN_FRONTIER_WET_CANDIDATE_ELEVATION_MAX_METERS,
      currentHydrologyBiomeIds: ['riverbank'],
    })),
  ];
}

function assetName(source: HydrologyModeSource): string {
  return source.seed === null
    ? `${source.modeId}-hydrology.json`
    : `${source.modeId}-${source.seed}-hydrology.json`;
}

function buildExpectedBake(source: HydrologyModeSource): ExpectedHydrologyBake {
  const terrain = requireTerrain(source.config);
  const cellCount = SAMPLE_GRID_SIZE * SAMPLE_GRID_SIZE;
  const halfWorld = source.config.worldSize * 0.5;
  const inset = halfWorld * (SAMPLE_WORLD_INSET_PERCENT / 100);
  const minWorld = -halfWorld + inset;
  const maxWorld = halfWorld - inset;
  const sampleSpacing = (maxWorld - minWorld) / (SAMPLE_GRID_SIZE - 1);
  const heights = new Float32Array(cellCount);
  const slopes = new Float32Array(cellCount);

  for (let z = 0; z < SAMPLE_GRID_SIZE; z++) {
    for (let x = 0; x < SAMPLE_GRID_SIZE; x++) {
      const worldX = minWorld + x * sampleSpacing;
      const worldZ = minWorld + z * sampleSpacing;
      const index = hydrologyCellIndex(x, z, SAMPLE_GRID_SIZE);
      heights[index] = source.provider.getHeightAt(worldX, worldZ);
      slopes[index] = computeSlopeDeg(worldX, worldZ, sampleSpacing, (sx, sz) => source.provider.getHeightAt(sx, sz));
    }
  }

  const hydrology = bakeHydrologyFromHeightGrid({
    width: SAMPLE_GRID_SIZE,
    height: SAMPLE_GRID_SIZE,
    cellSizeMeters: sampleSpacing,
    heights,
    depressionHandling: DEPRESSION_HANDLING,
  });
  const wetThreshold = getHydrologyPercentile(hydrology.accumulation, WET_CANDIDATE_ACCUMULATION_QUANTILE);
  const channelThreshold = getHydrologyPercentile(hydrology.accumulation, CHANNEL_CANDIDATE_ACCUMULATION_QUANTILE);
  const channelPaths = extractHydrologyChannelPaths(hydrology, {
    minAccumulationCells: channelThreshold,
    minLengthCells: 3,
  });
  const transform = {
    originX: minWorld,
    originZ: minWorld,
    cellSizeMeters: sampleSpacing,
  };
  const masks = createHydrologyMasks(hydrology, {
    slopes,
    wetCandidate: {
      minAccumulationCells: wetThreshold,
      maxSlopeDegrees: WET_CANDIDATE_SLOPE_MAX_DEGREES,
      maxElevationMeters: source.wetCandidateElevationMaxMeters,
    },
    channelMinAccumulationCells: channelThreshold,
  });
  const channelPolylines = createHydrologyChannelPolylines(
    hydrology,
    channelPaths.slice(0, 12),
    transform,
    { maxPointsPerPath: 64 },
  );
  const artifact = createHydrologyBakeArtifact(hydrology, {
    transform,
    masks,
    channelPolylines,
  });
  const signature = hashSignature({
    modeId: source.modeId,
    source: source.source,
    seed: source.seed,
    worldSize: source.config.worldSize,
    heightSource: source.config.heightSource ?? null,
    terrainHydrologyRules: {
      defaultBiome: terrain.defaultBiome,
      biomeRules: terrain.biomeRules ?? [],
    },
    sampleGridSize: SAMPLE_GRID_SIZE,
    sampleWorldInsetPercent: SAMPLE_WORLD_INSET_PERCENT,
    depressionHandling: DEPRESSION_HANDLING,
    wetCandidateAccumulationQuantile: WET_CANDIDATE_ACCUMULATION_QUANTILE,
    channelCandidateAccumulationQuantile: CHANNEL_CANDIDATE_ACCUMULATION_QUANTILE,
    wetCandidateSlopeMaxDegrees: WET_CANDIDATE_SLOPE_MAX_DEGREES,
    wetCandidateElevationMaxMeters: source.wetCandidateElevationMaxMeters,
    currentHydrologyBiomeIds: source.currentHydrologyBiomeIds,
  });
  const hydrologyAsset = `/data/hydrology/${assetName(source)}`;
  const entry: HydrologyBakeEntry = {
    modeId: source.modeId,
    source: source.source,
    seed: source.seed,
    signature,
    hydrologyAsset,
    worldSize: source.config.worldSize,
    sampleGridSize: SAMPLE_GRID_SIZE,
    sampleWorldInsetPercent: SAMPLE_WORLD_INSET_PERCENT,
    sampleSpacingMeters: Number(sampleSpacing.toFixed(6)),
    depressionHandling: DEPRESSION_HANDLING,
    wetCandidateAccumulationQuantile: WET_CANDIDATE_ACCUMULATION_QUANTILE,
    channelCandidateAccumulationQuantile: CHANNEL_CANDIDATE_ACCUMULATION_QUANTILE,
    wetCandidateSlopeMaxDegrees: WET_CANDIDATE_SLOPE_MAX_DEGREES,
    wetCandidateElevationMaxMeters: source.wetCandidateElevationMaxMeters,
    currentHydrologyBiomeIds: source.currentHydrologyBiomeIds,
  };
  const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;

  return {
    entry,
    artifact,
    artifactJson,
    artifactPath: resolve(HYDROLOGY_DIR, assetName(source)),
  };
}

function readManifest(): HydrologyBakeManifest | null {
  if (!existsSync(HYDROLOGY_MANIFEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(HYDROLOGY_MANIFEST_PATH, 'utf8')) as HydrologyBakeManifest;
  } catch {
    return null;
  }
}

function buildManifest(expected: ExpectedHydrologyBake[]): HydrologyBakeManifest {
  return {
    schemaVersion: 1,
    generator: 'scripts/prebake-hydrology.ts',
    entries: expected.map((entry) => entry.entry),
  };
}

function manifestIssues(expected: ExpectedHydrologyBake[]): string[] {
  const issues: string[] = [];
  const manifest = readManifest();
  if (!manifest) {
    issues.push('missing or unreadable hydrology bake manifest');
    return issues;
  }
  if (manifest.schemaVersion !== 1) {
    issues.push(`unsupported hydrology manifest schema version ${manifest.schemaVersion}`);
  }

  const entriesByKey = new Map(manifest.entries.map((entry) => [
    `${entry.modeId}:${entry.seed ?? 'default'}`,
    entry,
  ]));
  for (const expectedBake of expected) {
    const key = `${expectedBake.entry.modeId}:${expectedBake.entry.seed ?? 'default'}`;
    const existing = entriesByKey.get(key);
    if (!existing) {
      issues.push(`missing hydrology manifest entry ${key}`);
      continue;
    }
    if (JSON.stringify(existing) !== JSON.stringify(expectedBake.entry)) {
      issues.push(`stale hydrology manifest entry ${key}`);
    }
  }

  for (const expectedBake of expected) {
    if (!existsSync(expectedBake.artifactPath)) {
      issues.push(`missing hydrology cache ${expectedBake.entry.hydrologyAsset}`);
      continue;
    }
    const existing = readFileSync(expectedBake.artifactPath, 'utf8');
    if (existing !== expectedBake.artifactJson) {
      issues.push(`stale hydrology cache ${expectedBake.entry.hydrologyAsset}`);
    }
  }

  return issues;
}

function writeBakes(expected: ExpectedHydrologyBake[]): void {
  mkdirSync(HYDROLOGY_DIR, { recursive: true });
  for (const expectedBake of expected) {
    writeFileSync(expectedBake.artifactPath, expectedBake.artifactJson, 'utf8');
  }
  writeFileSync(HYDROLOGY_MANIFEST_PATH, `${JSON.stringify(buildManifest(expected), null, 2)}\n`, 'utf8');
}

function parseArgs(): { check: boolean; force: boolean } {
  const args = new Set(process.argv.slice(2));
  return {
    check: args.has('--check'),
    force: args.has('--force'),
  };
}

function main(): void {
  const options = parseArgs();
  const expected = createModeSources().map(buildExpectedBake);
  const issues = manifestIssues(expected);

  if (options.check) {
    if (issues.length > 0) {
      console.error('Hydrology prebake check FAILED:');
      for (const issue of issues) console.error(`- ${issue}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Hydrology prebake check PASS: ${expected.length} cache artifact(s) match ${HYDROLOGY_MANIFEST_PATH}`);
    return;
  }

  if (options.force || issues.length > 0) {
    writeBakes(expected);
    console.log(`Hydrology prebake wrote ${expected.length} cache artifact(s) and ${HYDROLOGY_MANIFEST_PATH}`);
    for (const expectedBake of expected) {
      console.log(`- ${expectedBake.entry.hydrologyAsset}: wet=${expectedBake.artifact.masks.wetCandidateCells.length} channel=${expectedBake.artifact.masks.channelCandidateCells.length} polylines=${expectedBake.artifact.channelPolylines.length}`);
    }
    return;
  }

  console.log(`All ${expected.length} hydrology cache artifact(s) match ${HYDROLOGY_MANIFEST_PATH}; skipping generation.`);
}

main();
