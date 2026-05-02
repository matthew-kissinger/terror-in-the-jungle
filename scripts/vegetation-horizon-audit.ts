#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { A_SHAU_VALLEY_CONFIG } from '../src/config/AShauValleyConfig';
import { AI_SANDBOX_CONFIG } from '../src/config/AiSandboxConfig';
import { OPEN_FRONTIER_CONFIG } from '../src/config/OpenFrontierConfig';
import { TEAM_DEATHMATCH_CONFIG } from '../src/config/TeamDeathmatchConfig';
import { ZONE_CONTROL_CONFIG } from '../src/config/ZoneControlConfig';
import { getBiome } from '../src/config/biomes';
import type { GameModeConfig } from '../src/config/gameModeTypes';
import { VEGETATION_TYPES, type VegetationTypeConfig } from '../src/config/vegetationTypes';
import { computeDefaultLODRanges, computeMaxLODLevels } from '../src/systems/terrain/TerrainConfig';

type CameraGroundReachSample = {
  cameraHeightMeters: number;
  cameraFarMeters: number;
  groundReachMeters: number;
  vegetationVisibleRadiusMeters: number;
  bareTerrainBandMeters: number;
  vegetationCoverageOfGroundReach: number | null;
};

type VegetationPaletteEntry = {
  id: string;
  tier: string;
  sizeMeters: number;
  fadeDistanceMeters: number;
  maxDistanceMeters: number;
  biomeDensityMultiplier: number;
};

type ModeHorizonEntry = {
  id: string;
  name: string;
  worldSizeMeters: number;
  visualMarginMeters: number;
  visualHalfExtentMeters: number;
  cameraFarMeters: number;
  configuredViewDistanceMeters: number;
  terrainChunkRenderDistance: number;
  terrainMaxLodLevels: number;
  terrainLodRangesMeters: number[];
  vegetationCellSizeMeters: number;
  vegetationCellDistance: number;
  vegetationResidencyAxisRadiusMeters: number;
  vegetationResidencyCornerRadiusMeters: number;
  paletteBiomeIds: string[];
  palette: VegetationPaletteEntry[];
  maxPaletteVegetationDistanceMeters: number;
  maxRegistryVegetationDistanceMeters: number;
  effectiveVisibleVegetationRadiusMeters: number;
  limitingFactor: 'shader-max-distance' | 'scatterer-residency' | 'terrain-extent';
  cameraGroundReachSamples: CameraGroundReachSample[];
  flags: string[];
};

type HorizonAuditReport = {
  createdAt: string;
  source: string;
  assumptions: {
    defaultCameraFarMeters: number;
    defaultVisualMarginMeters: number;
    vegetationCellSizeMeters: number;
    vegetationCellDistance: number;
    cameraHeightSamplesMeters: number[];
    notes: string[];
  };
  summary: {
    modes: number;
    flaggedModes: number;
    largestBareTerrainBandMeters: number;
    largestBareTerrainBandMode: string | null;
    maxRegistryVegetationDistanceMeters: number;
    maxRegistryFadeDistanceMeters: number;
  };
  modes: ModeHorizonEntry[];
  recommendation: {
    preferred: string;
    rejectedForNow: string[];
    validationRequired: string[];
  };
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const DEFAULT_CAMERA_FAR_METERS = 1000;
const DEFAULT_VISUAL_MARGIN_METERS = 200;
const VEGETATION_CELL_SIZE_METERS = 128;
const VEGETATION_CELL_DISTANCE = 6;
const CAMERA_HEIGHT_SAMPLES_METERS = [80, 300, 500, 1000];

const MODES: GameModeConfig[] = [
  AI_SANDBOX_CONFIG,
  TEAM_DEATHMATCH_CONFIG,
  ZONE_CONTROL_CONFIG,
  OPEN_FRONTIER_CONFIG,
  A_SHAU_VALLEY_CONFIG,
];

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function roundMetric(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function maxOf(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function resolvePalette(config: GameModeConfig): VegetationPaletteEntry[] {
  const terrain = config.terrain;
  const biomeIds = uniqueValues([
    terrain?.defaultBiome ?? 'denseJungle',
    ...(terrain?.biomeRules ?? []).map((rule) => rule.biomeId),
  ]);
  const byType = new Map<string, VegetationPaletteEntry>();

  for (const biomeId of biomeIds) {
    const biome = getBiome(biomeId);
    for (const entry of biome.vegetationPalette) {
      const type = VEGETATION_TYPES.find((candidate) => candidate.id === entry.typeId);
      if (!type) continue;
      const existing = byType.get(type.id);
      if (existing && existing.biomeDensityMultiplier >= entry.densityMultiplier) continue;
      byType.set(type.id, toPaletteEntry(type, entry.densityMultiplier));
    }
  }

  return [...byType.values()].sort((a, b) => {
    const tierOrder = tierRank(a.tier) - tierRank(b.tier);
    return tierOrder === 0 ? a.id.localeCompare(b.id) : tierOrder;
  });
}

function tierRank(tier: string): number {
  if (tier === 'canopy') return 0;
  if (tier === 'midLevel') return 1;
  return 2;
}

function toPaletteEntry(type: VegetationTypeConfig, biomeDensityMultiplier: number): VegetationPaletteEntry {
  return {
    id: type.id,
    tier: type.tier,
    sizeMeters: roundMetric(type.size),
    fadeDistanceMeters: type.fadeDistance,
    maxDistanceMeters: type.maxDistance,
    biomeDensityMultiplier,
  };
}

function computeGroundReach(cameraFar: number, cameraHeight: number): number {
  if (cameraHeight >= cameraFar) return 0;
  return Math.sqrt(cameraFar * cameraFar - cameraHeight * cameraHeight);
}

function determineLimitingFactor(
  visibleVegetationRadius: number,
  maxPaletteDistance: number,
  residencyCornerRadius: number,
  visualHalfExtent: number,
): ModeHorizonEntry['limitingFactor'] {
  if (visibleVegetationRadius === maxPaletteDistance) return 'shader-max-distance';
  if (visibleVegetationRadius === residencyCornerRadius) return 'scatterer-residency';
  if (visibleVegetationRadius === visualHalfExtent) return 'terrain-extent';
  return 'shader-max-distance';
}

function analyzeMode(config: GameModeConfig): ModeHorizonEntry {
  const visualMargin = config.visualMargin ?? DEFAULT_VISUAL_MARGIN_METERS;
  const visualHalfExtent = config.worldSize / 2 + visualMargin;
  const cameraFar = config.cameraFar ?? DEFAULT_CAMERA_FAR_METERS;
  const terrainMaxLodLevels = computeMaxLODLevels(config.worldSize, visualMargin);
  const terrainLodRanges = computeDefaultLODRanges(config.worldSize, terrainMaxLodLevels)
    .map((range) => roundMetric(range));
  const palette = resolvePalette(config);
  const maxPaletteDistance = maxOf(palette.map((entry) => entry.maxDistanceMeters));
  const registryMaxDistance = maxOf(VEGETATION_TYPES.map((type) => type.maxDistance));
  const registryMaxFadeDistance = maxOf(VEGETATION_TYPES.map((type) => type.fadeDistance));
  const residencyAxisRadius = (VEGETATION_CELL_DISTANCE + 0.5) * VEGETATION_CELL_SIZE_METERS;
  const residencyCornerRadius = Math.SQRT2 * residencyAxisRadius;
  const visibleVegetationRadius = Math.min(maxPaletteDistance, residencyCornerRadius, visualHalfExtent);
  const samples = CAMERA_HEIGHT_SAMPLES_METERS.map((cameraHeight) => {
    const groundReach = Math.min(computeGroundReach(cameraFar, cameraHeight), visualHalfExtent);
    const bareTerrainBand = Math.max(0, groundReach - visibleVegetationRadius);
    return {
      cameraHeightMeters: cameraHeight,
      cameraFarMeters: cameraFar,
      groundReachMeters: roundMetric(groundReach),
      vegetationVisibleRadiusMeters: roundMetric(visibleVegetationRadius),
      bareTerrainBandMeters: roundMetric(bareTerrainBand),
      vegetationCoverageOfGroundReach: groundReach > 0
        ? roundMetric(visibleVegetationRadius / groundReach, 4)
        : null,
    };
  });
  const maxBareBand = maxOf(samples.map((sample) => sample.bareTerrainBandMeters));
  const flags: string[] = [];

  if (maxBareBand >= 300) {
    flags.push('vegetation-horizon-gap');
  }
  if (visibleVegetationRadius === maxPaletteDistance && residencyCornerRadius > maxPaletteDistance * 1.5) {
    flags.push('shader-distance-not-scatterer-residency-limited');
  }
  if (cameraFar > visibleVegetationRadius * 2) {
    flags.push('camera-far-outpaces-vegetation-tier');
  }
  if (palette.some((entry) => entry.tier === 'canopy') && !palette.some((entry) => entry.maxDistanceMeters > registryMaxDistance)) {
    flags.push('no-outer-canopy-tier');
  }

  return {
    id: config.id,
    name: config.name,
    worldSizeMeters: config.worldSize,
    visualMarginMeters: visualMargin,
    visualHalfExtentMeters: roundMetric(visualHalfExtent),
    cameraFarMeters: cameraFar,
    configuredViewDistanceMeters: config.viewDistance,
    terrainChunkRenderDistance: config.chunkRenderDistance,
    terrainMaxLodLevels,
    terrainLodRangesMeters: terrainLodRanges,
    vegetationCellSizeMeters: VEGETATION_CELL_SIZE_METERS,
    vegetationCellDistance: VEGETATION_CELL_DISTANCE,
    vegetationResidencyAxisRadiusMeters: roundMetric(residencyAxisRadius),
    vegetationResidencyCornerRadiusMeters: roundMetric(residencyCornerRadius),
    paletteBiomeIds: uniqueValues([
      config.terrain?.defaultBiome ?? 'denseJungle',
      ...(config.terrain?.biomeRules ?? []).map((rule) => rule.biomeId),
    ]),
    palette,
    maxPaletteVegetationDistanceMeters: maxPaletteDistance,
    maxRegistryVegetationDistanceMeters: registryMaxDistance,
    effectiveVisibleVegetationRadiusMeters: roundMetric(visibleVegetationRadius),
    limitingFactor: determineLimitingFactor(
      visibleVegetationRadius,
      maxPaletteDistance,
      residencyCornerRadius,
      visualHalfExtent,
    ),
    cameraGroundReachSamples: samples,
    flags,
  };
}

function buildReport(): HorizonAuditReport {
  const modes = MODES.map(analyzeMode);
  const largestBands = modes.map((mode) => ({
    mode: mode.id,
    band: maxOf(mode.cameraGroundReachSamples.map((sample) => sample.bareTerrainBandMeters)),
  }));
  const largest = largestBands.sort((a, b) => b.band - a.band)[0] ?? null;

  return {
    createdAt: new Date().toISOString(),
    source: 'KB-TERRAIN vegetation horizon static audit',
    assumptions: {
      defaultCameraFarMeters: DEFAULT_CAMERA_FAR_METERS,
      defaultVisualMarginMeters: DEFAULT_VISUAL_MARGIN_METERS,
      vegetationCellSizeMeters: VEGETATION_CELL_SIZE_METERS,
      vegetationCellDistance: VEGETATION_CELL_DISTANCE,
      cameraHeightSamplesMeters: CAMERA_HEIGHT_SAMPLES_METERS,
      notes: [
        'Default camera far is read from GameRenderer constructor.',
        'Vegetation residency is the square of cells generated by VegetationScatterer.',
        'Effective vegetation visibility is capped by billboard shader fadeDistance to maxDistance.',
        'This audit is static; it does not replace screenshot evidence from an elevated runtime camera.',
      ],
    },
    summary: {
      modes: modes.length,
      flaggedModes: modes.filter((mode) => mode.flags.length > 0).length,
      largestBareTerrainBandMeters: largest ? roundMetric(largest.band) : 0,
      largestBareTerrainBandMode: largest?.mode ?? null,
      maxRegistryVegetationDistanceMeters: maxOf(VEGETATION_TYPES.map((type) => type.maxDistance)),
      maxRegistryFadeDistanceMeters: maxOf(VEGETATION_TYPES.map((type) => type.fadeDistance)),
    },
    modes,
    recommendation: {
      preferred: 'Add a low-cost outer canopy representation for large and elevated-camera modes: a sparse instanced canopy-card ring plus terrain albedo/roughness tint for the far band beyond 600m. Keep current Pixel Forge imposters as near and mid vegetation.',
      rejectedForNow: [
        'Blindly raising existing billboard maxDistance; it increases overdraw and preserves the same atlas density at distances where a silhouette field is sufficient.',
        'Expanding VegetationScatterer cell residency alone; current large-mode limit is shader maxDistance, not generated-cell radius.',
        'Full 3D or high-resolution imposter vegetation to the renderer far plane; memory and draw cost are mismatched to the horizon requirement.',
      ],
      validationRequired: [
        'Elevated-camera screenshots for Open Frontier and A Shau before and after any outer-canopy change.',
        'Draw-call, triangle, texture, and 95th-percentile frame-time deltas in Open Frontier and A Shau perf captures.',
        'Fog/atmosphere parity check so the far canopy band does not render darker than near vegetation.',
      ],
    },
  };
}

function writeReport(report: HorizonAuditReport): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'vegetation-horizon-audit');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'horizon-audit.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

function main(): void {
  const report = buildReport();
  const outputPath = writeReport(report);
  const modeSummary = report.modes
    .map((mode) => {
      const maxBand = maxOf(mode.cameraGroundReachSamples.map((sample) => sample.bareTerrainBandMeters));
      return `${mode.id}: visibleVegetation=${mode.effectiveVisibleVegetationRadiusMeters}m, maxBareBand=${roundMetric(maxBand)}m, flags=${mode.flags.join(',') || 'none'}`;
    })
    .join('\n');

  console.log(`Vegetation horizon audit written to ${outputPath}`);
  console.log(modeSummary);
}

main();
