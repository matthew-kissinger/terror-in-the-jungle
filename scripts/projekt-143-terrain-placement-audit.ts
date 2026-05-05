#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';
import { A_SHAU_VALLEY_CONFIG } from '../src/config/AShauValleyConfig';
import { AI_SANDBOX_CONFIG } from '../src/config/AiSandboxConfig';
import type { GameModeConfig, MapFeatureDefinition } from '../src/config/gameModeTypes';
import { getMapVariants } from '../src/config/MapSeedRegistry';
import { OPEN_FRONTIER_CONFIG } from '../src/config/OpenFrontierConfig';
import { TEAM_DEATHMATCH_CONFIG } from '../src/config/TeamDeathmatchConfig';
import { ZONE_CONTROL_CONFIG } from '../src/config/ZoneControlConfig';
import { AIRFIELD_TEMPLATES } from '../src/systems/world/AirfieldTemplates';
import { generateAirfieldLayout } from '../src/systems/world/AirfieldLayoutGenerator';
import { DEMHeightProvider } from '../src/systems/terrain/DEMHeightProvider';
import type { IHeightProvider } from '../src/systems/terrain/IHeightProvider';
import { NoiseHeightProvider } from '../src/systems/terrain/NoiseHeightProvider';
import { compileTerrainFeatures } from '../src/systems/terrain/TerrainFeatureCompiler';
import { StampedHeightProvider } from '../src/systems/terrain/StampedHeightProvider';

type CheckStatus = 'pass' | 'warn' | 'fail';
type HeightProviderKind = 'noise' | 'dem';

interface SpanMetrics {
  sourceSpanMeters: number;
  stampedSpanMeters: number;
  sourceMinMeters: number;
  sourceMaxMeters: number;
  stampedMinMeters: number;
  stampedMaxMeters: number;
}

interface PlacementAuditEntry extends SpanMetrics {
  id: string;
  kind: string;
  footprint: string;
  status: CheckStatus;
  flags: string[];
  generatedPlacements?: {
    count: number;
    maxSourceSpanMeters: number;
    maxStampedSpanMeters: number;
  };
}

interface ModePlacementAudit {
  id: string;
  name: string;
  status: CheckStatus;
  heightProvider: HeightProviderKind;
  sampledSeed: number | null;
  auditedFeatures: number;
  failFeatures: number;
  warnFeatures: number;
  features: PlacementAuditEntry[];
}

interface TerrainPlacementAudit {
  createdAt: string;
  sourceGitSha: string;
  workingTreeDirty: boolean;
  source: 'projekt-143-terrain-placement-audit';
  status: CheckStatus;
  assumptions: {
    airfieldRunwayNativeSpanFailMeters: number;
    flattenedCoreSpanWarnMeters: number;
    generatedPlacementFootprintRadiusMeters: number;
    proceduralRandomSeedFallback: number;
    notes: string[];
  };
  summary: {
    modes: number;
    auditedFeatures: number;
    failFeatures: number;
    warnFeatures: number;
  };
  modes: ModePlacementAudit[];
  recommendation: {
    nextBranch: string;
    validationRequired: string[];
    nonClaims: string[];
  };
}

const MODES: readonly GameModeConfig[] = [
  AI_SANDBOX_CONFIG,
  TEAM_DEATHMATCH_CONFIG,
  ZONE_CONTROL_CONFIG,
  OPEN_FRONTIER_CONFIG,
  A_SHAU_VALLEY_CONFIG,
];
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const PROCEDURAL_RANDOM_SEED_FALLBACK = 42;
const AIRFIELD_RUNWAY_NATIVE_SPAN_FAIL_M = 18;
const FLATTENED_CORE_SPAN_WARN_M = 2;
const GENERATED_PLACEMENT_FOOTPRINT_RADIUS_M = 8;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function isWorkingTreeDirty(): boolean {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' }).trim().length > 0;
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

function createHeightProvider(config: GameModeConfig, sampledSeedOverride?: number | null): {
  provider: IHeightProvider;
  kind: HeightProviderKind;
  sampledSeed: number | null;
} {
  if (config.heightSource?.type === 'dem') {
    return {
      provider: loadDemProvider(config),
      kind: 'dem',
      sampledSeed: null,
    };
  }

  const sampledSeed = typeof sampledSeedOverride === 'number'
    ? sampledSeedOverride
    : typeof config.terrainSeed === 'number'
    ? config.terrainSeed
    : PROCEDURAL_RANDOM_SEED_FALLBACK;
  return {
    provider: new NoiseHeightProvider(sampledSeed),
    kind: 'noise',
    sampledSeed,
  };
}

function resolveAuditSeeds(config: GameModeConfig): Array<number | null> {
  if (config.heightSource?.type === 'dem') {
    return [null];
  }
  const variants = getMapVariants(config.id);
  if (variants.length > 0) {
    return [...new Set(variants.map((variant) => variant.seed))];
  }
  return [
    typeof config.terrainSeed === 'number'
      ? config.terrainSeed
      : PROCEDURAL_RANDOM_SEED_FALLBACK,
  ];
}

function analyzeMode(config: GameModeConfig, sampledSeedOverride?: number | null): ModePlacementAudit {
  const { provider, kind, sampledSeed } = createHeightProvider(config, sampledSeedOverride);
  const compiled = compileTerrainFeatures(config, (x, z) => provider.getHeightAt(x, z));
  const stampedProvider = new StampedHeightProvider(provider, compiled.stamps);
  const features = (config.features ?? [])
    .filter((feature) => feature.terrain?.flatten === true)
    .map((feature) => analyzeFeature(feature, provider, stampedProvider));
  const failFeatures = features.filter((feature) => feature.status === 'fail').length;
  const warnFeatures = features.filter((feature) => feature.status === 'warn').length;
  return {
    id: config.id,
    name: config.name,
    status: failFeatures > 0 ? 'fail' : warnFeatures > 0 ? 'warn' : 'pass',
    heightProvider: kind,
    sampledSeed,
    auditedFeatures: features.length,
    failFeatures,
    warnFeatures,
    features,
  };
}

function analyzeFeature(
  feature: MapFeatureDefinition,
  sourceProvider: IHeightProvider,
  stampedProvider: IHeightProvider,
): PlacementAuditEntry {
  const samplePoints = samplePointsForFeature(feature);
  const spans = measureSpan(samplePoints, sourceProvider, stampedProvider);
  const flags: string[] = [];

  if (feature.kind === 'airfield' && feature.templateId) {
    if (spans.sourceSpanMeters > AIRFIELD_RUNWAY_NATIVE_SPAN_FAIL_M) {
      flags.push('airfield-native-runway-span-too-high');
    }
  } else if (spans.stampedSpanMeters > FLATTENED_CORE_SPAN_WARN_M) {
    flags.push('flattened-core-span-above-target');
  }

  const generatedPlacements = analyzeGeneratedAirfieldPlacements(feature, sourceProvider, stampedProvider);
  if (generatedPlacements && generatedPlacements.maxStampedSpanMeters > FLATTENED_CORE_SPAN_WARN_M) {
    flags.push('generated-placement-core-span-above-target');
  }

  return {
    id: feature.id,
    kind: feature.kind,
    footprint: describeFeatureFootprint(feature),
    status: flags.some((flag) => flag === 'airfield-native-runway-span-too-high') ? 'fail' : flags.length > 0 ? 'warn' : 'pass',
    flags,
    ...spans,
    generatedPlacements,
  };
}

function samplePointsForFeature(feature: MapFeatureDefinition): THREE.Vector2[] {
  if (feature.kind === 'airfield' && feature.templateId) {
    const template = AIRFIELD_TEMPLATES[feature.templateId];
    if (template) {
      return sampleAirfieldRunway(feature, template.runwayLength, Math.max(template.runwayWidth * 0.5, 24));
    }
  }

  if (feature.footprint?.shape === 'circle') {
    const radius = feature.terrain?.flatRadius ?? Math.max(4, feature.footprint.radius * 0.65);
    return sampleCircle(feature.position.x, feature.position.z, radius);
  }

  if (feature.footprint?.shape === 'rect') {
    const yaw = feature.placement?.yaw ?? 0;
    const halfWidth = feature.footprint.width * 0.5;
    const halfLength = feature.footprint.length * 0.5;
    return sampleRect(feature.position.x, feature.position.z, halfLength, halfWidth, yaw);
  }

  return sampleCircle(feature.position.x, feature.position.z, 8);
}

function sampleAirfieldRunway(feature: MapFeatureDefinition, runwayLength: number, halfWidth: number): THREE.Vector2[] {
  const yaw = feature.placement?.yaw ?? 0;
  const halfLength = runwayLength * 0.5;
  const offsets: Array<[number, number]> = [
    [0, 0],
    [halfLength, 0],
    [-halfLength, 0],
    [0, halfWidth],
    [0, -halfWidth],
    [halfLength * 0.6, halfWidth * 0.6],
    [-halfLength * 0.6, halfWidth * 0.6],
    [halfLength * 0.6, -halfWidth * 0.6],
    [-halfLength * 0.6, -halfWidth * 0.6],
  ];
  return offsets.map(([along, lateral]) => localAlongLateralToWorld(
    feature.position.x,
    feature.position.z,
    yaw,
    along,
    lateral,
  ));
}

function sampleCircle(centerX: number, centerZ: number, radius: number): THREE.Vector2[] {
  const points = [new THREE.Vector2(centerX, centerZ)];
  const radii = [radius * 0.5, radius];
  for (const sampleRadius of radii) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      points.push(new THREE.Vector2(
        centerX + Math.cos(angle) * sampleRadius,
        centerZ + Math.sin(angle) * sampleRadius,
      ));
    }
  }
  return points;
}

function sampleRect(centerX: number, centerZ: number, halfLength: number, halfWidth: number, yaw: number): THREE.Vector2[] {
  const offsets: Array<[number, number]> = [
    [0, 0],
    [halfLength, 0],
    [-halfLength, 0],
    [0, halfWidth],
    [0, -halfWidth],
    [halfLength, halfWidth],
    [-halfLength, halfWidth],
    [halfLength, -halfWidth],
    [-halfLength, -halfWidth],
  ];
  return offsets.map(([along, lateral]) => localAlongLateralToWorld(centerX, centerZ, yaw, along, lateral));
}

function localAlongLateralToWorld(
  centerX: number,
  centerZ: number,
  yaw: number,
  along: number,
  lateral: number,
): THREE.Vector2 {
  return new THREE.Vector2(
    centerX + along * Math.sin(yaw) + lateral * Math.cos(yaw),
    centerZ + along * Math.cos(yaw) - lateral * Math.sin(yaw),
  );
}

function measureSpan(
  points: THREE.Vector2[],
  sourceProvider: IHeightProvider,
  stampedProvider: IHeightProvider,
): SpanMetrics {
  let sourceMin = Number.POSITIVE_INFINITY;
  let sourceMax = Number.NEGATIVE_INFINITY;
  let stampedMin = Number.POSITIVE_INFINITY;
  let stampedMax = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const sourceHeight = sourceProvider.getHeightAt(point.x, point.y);
    const stampedHeight = stampedProvider.getHeightAt(point.x, point.y);
    if (Number.isFinite(sourceHeight)) {
      sourceMin = Math.min(sourceMin, sourceHeight);
      sourceMax = Math.max(sourceMax, sourceHeight);
    }
    if (Number.isFinite(stampedHeight)) {
      stampedMin = Math.min(stampedMin, stampedHeight);
      stampedMax = Math.max(stampedMax, stampedHeight);
    }
  }

  return {
    sourceSpanMeters: roundMetric(sourceMax - sourceMin, 2),
    stampedSpanMeters: roundMetric(stampedMax - stampedMin, 2),
    sourceMinMeters: roundMetric(sourceMin, 2),
    sourceMaxMeters: roundMetric(sourceMax, 2),
    stampedMinMeters: roundMetric(stampedMin, 2),
    stampedMaxMeters: roundMetric(stampedMax, 2),
  };
}

function analyzeGeneratedAirfieldPlacements(
  feature: MapFeatureDefinition,
  sourceProvider: IHeightProvider,
  stampedProvider: IHeightProvider,
): PlacementAuditEntry['generatedPlacements'] | undefined {
  if (feature.kind !== 'airfield' || !feature.templateId) return undefined;
  const template = AIRFIELD_TEMPLATES[feature.templateId];
  if (!template) return undefined;

  const layout = generateAirfieldLayout(
    template,
    feature.position,
    feature.placement?.yaw ?? 0,
    feature.seedHint ?? feature.id,
  );
  let maxSourceSpan = 0;
  let maxStampedSpan = 0;
  for (const placement of layout.placements) {
    const offset = placement.offset;
    const world = rotatePlacementOffset(feature.position, feature.placement?.yaw ?? 0, offset);
    const spans = measureSpan(
      sampleCircle(world.x, world.z, GENERATED_PLACEMENT_FOOTPRINT_RADIUS_M),
      sourceProvider,
      stampedProvider,
    );
    maxSourceSpan = Math.max(maxSourceSpan, spans.sourceSpanMeters);
    maxStampedSpan = Math.max(maxStampedSpan, spans.stampedSpanMeters);
  }

  return {
    count: layout.placements.length,
    maxSourceSpanMeters: roundMetric(maxSourceSpan, 2),
    maxStampedSpanMeters: roundMetric(maxStampedSpan, 2),
  };
}

function rotatePlacementOffset(center: THREE.Vector3, yaw: number, offset: THREE.Vector3): THREE.Vector2 {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return new THREE.Vector2(
    center.x + offset.x * cos + offset.z * sin,
    center.z + offset.z * cos - offset.x * sin,
  );
}

function describeFeatureFootprint(feature: MapFeatureDefinition): string {
  if (feature.kind === 'airfield' && feature.templateId) {
    const template = AIRFIELD_TEMPLATES[feature.templateId];
    return template
      ? `airfield_runway_${template.runwayLength}x${template.runwayWidth}`
      : `airfield_template_${feature.templateId}`;
  }
  if (!feature.footprint) return 'default';
  if (feature.footprint.shape === 'circle') return `circle_r${feature.footprint.radius}`;
  if (feature.footprint.shape === 'rect') return `rect_${feature.footprint.width}x${feature.footprint.length}`;
  return feature.footprint.shape;
}

function buildReport(): TerrainPlacementAudit {
  const modes = MODES.flatMap((config) =>
    resolveAuditSeeds(config).map((seed) => analyzeMode(config, seed)),
  );
  const failFeatures = modes.reduce((sum, mode) => sum + mode.failFeatures, 0);
  const warnFeatures = modes.reduce((sum, mode) => sum + mode.warnFeatures, 0);
  const auditedFeatures = modes.reduce((sum, mode) => sum + mode.auditedFeatures, 0);
  const status: CheckStatus = failFeatures > 0 ? 'fail' : warnFeatures > 0 ? 'warn' : 'pass';

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    workingTreeDirty: isWorkingTreeDirty(),
    source: 'projekt-143-terrain-placement-audit',
    status,
    assumptions: {
      airfieldRunwayNativeSpanFailMeters: AIRFIELD_RUNWAY_NATIVE_SPAN_FAIL_M,
      flattenedCoreSpanWarnMeters: FLATTENED_CORE_SPAN_WARN_M,
      generatedPlacementFootprintRadiusMeters: GENERATED_PLACEMENT_FOOTPRINT_RADIUS_M,
      proceduralRandomSeedFallback: PROCEDURAL_RANDOM_SEED_FALLBACK,
      notes: [
        'This is a static terrain-source and stamp-effect audit, not screenshot acceptance.',
        'Procedural modes are audited for every registered pre-baked seed variant, not only the default config seed.',
        'Airfield native runway span is measured before stamps so authored cliff-edge sites stay visible.',
        'Stamped core spans verify that current flatten stamps produce a usable pad; they do not prove visual foundation quality.',
        'Generated airfield placement spans use a fixed 8m footprint proxy because final model bounds are runtime asset data.',
        'Final acceptance still needs A Shau/Open Frontier screenshots and perf captures when placement changes affect runtime.',
      ],
    },
    summary: {
      modes: modes.length,
      auditedFeatures,
      failFeatures,
      warnFeatures,
    },
    modes,
    recommendation: {
      nextBranch: 'Fix authored feature sites that fail native airfield span before importing new buildings or claiming foundation acceptance.',
      validationRequired: [
        'Before/after terrain placement audit artifact.',
        'Targeted terrain feature tests for airfield stamps and route pads.',
        'A Shau perf/screenshot evidence before accepting terrain placement or foundation visual quality.',
      ],
      nonClaims: [
        'No building asset acceptance from placement spans alone.',
        'No runtime performance claim without matched perf captures.',
        'No final foundation visual acceptance without screenshots.',
      ],
    },
  };
}

function writeReport(report: TerrainPlacementAudit): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'projekt-143-terrain-placement-audit');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'terrain-placement-audit.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

function roundMetric(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function main(): void {
  const report = buildReport();
  const outputPath = writeReport(report);
  const relativePath = relative(process.cwd(), outputPath);
  console.log(`Projekt 143 terrain placement audit ${report.status.toUpperCase()}: ${relativePath}`);
  for (const mode of report.modes) {
    const flagged = mode.features.filter((feature) => feature.flags.length > 0);
    console.log(
      `- ${mode.id}${mode.sampledSeed !== null ? ` seed=${mode.sampledSeed}` : ''}: audited=${mode.auditedFeatures}, fail=${mode.failFeatures}, warn=${mode.warnFeatures}`,
    );
    for (const feature of flagged.slice(0, 6)) {
      console.log(
        `  - ${feature.id}: sourceSpan=${feature.sourceSpanMeters}m, stampedSpan=${feature.stampedSpanMeters}m, flags=${feature.flags.join(',')}`,
      );
    }
    if (flagged.length > 6) {
      console.log(`  - ... ${flagged.length - 6} more flagged features`);
    }
  }
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
