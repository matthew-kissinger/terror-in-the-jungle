#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { A_SHAU_VALLEY_CONFIG } from '../src/config/AShauValleyConfig';
import { AI_SANDBOX_CONFIG } from '../src/config/AiSandboxConfig';
import { GameMode, type GameModeConfig } from '../src/config/gameModeTypes';
import { OPEN_FRONTIER_CONFIG } from '../src/config/OpenFrontierConfig';
import { TEAM_DEATHMATCH_CONFIG } from '../src/config/TeamDeathmatchConfig';
import { ZONE_CONTROL_CONFIG } from '../src/config/ZoneControlConfig';
import { DEMHeightProvider } from '../src/systems/terrain/DEMHeightProvider';
import type { IHeightProvider } from '../src/systems/terrain/IHeightProvider';
import { NoiseHeightProvider } from '../src/systems/terrain/NoiseHeightProvider';
import { StampedHeightProvider } from '../src/systems/terrain/StampedHeightProvider';
import { compileTerrainFlow } from '../src/systems/terrain/TerrainFlowCompiler';
import type { TerrainFlowPath } from '../src/systems/terrain/TerrainFeatureTypes';

type CheckStatus = 'pass' | 'warn' | 'fail';
type HeightProviderKind = 'noise' | 'dem';

interface RouteRoughnessStats {
  sampleIntervalMeters: number;
  samples: number;
  sourceP95GradePercent: number;
  stampedP95GradePercent: number;
  sourceMaxGradePercent: number;
  stampedMaxGradePercent: number;
  sourceP95StepMeters: number;
  stampedP95StepMeters: number;
  sourceMaxStepMeters: number;
  stampedMaxStepMeters: number;
}

interface ModeRouteAudit {
  id: string;
  name: string;
  status: CheckStatus;
  heightProvider: HeightProviderKind;
  sampledSeed: number | null;
  terrainFlowEnabled: boolean;
  routeStamping: 'full' | 'map_only' | 'disabled';
  routeSurface: string | null;
  routeWidthMeters: number | null;
  routeBlendMeters: number | null;
  routeSpacingMeters: number | null;
  routeTerrainWidthScale: number | null;
  routeGradeStrength: number | null;
  routeTargetHeightMode: string | null;
  routeCount: number;
  routeLengthMeters: number;
  routeCapsuleStamps: number;
  routeSurfacePatches: number;
  zoneShoulderStamps: number;
  roughness: RouteRoughnessStats | null;
  flags: string[];
  findings: string[];
}

interface TerrainRouteAudit {
  createdAt: string;
  sourceGitSha: string;
  workingTreeDirty: boolean;
  source: 'projekt-143-terrain-route-audit';
  status: CheckStatus;
  assumptions: {
    sampleIntervalMeters: number;
    proceduralRandomSeedFallback: number;
    routeRequiredModes: string[];
    fullStampRequiredModes: string[];
    notes: string[];
  };
  summary: {
    modes: number;
    routeAwareModes: number;
    failModes: number;
    warnModes: number;
    totalRouteLengthMeters: number;
    totalRouteCapsuleStamps: number;
  };
  modes: ModeRouteAudit[];
  recommendation: {
    nextBranch: string;
    validationRequired: string[];
    nonClaims: string[];
  };
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const PROCEDURAL_RANDOM_SEED_FALLBACK = 42;
const ROUTE_SAMPLE_INTERVAL_M = 35;
const DEFAULT_ROUTE_WIDTH = 18;
const DEFAULT_ROUTE_BLEND = 7;
const DEFAULT_ROUTE_SPACING = 18;
const DEFAULT_ROUTE_TERRAIN_WIDTH_SCALE = 0.44;
const DEFAULT_ROUTE_GRADE_STRENGTH = 0.08;
const REQUIRED_ROUTE_MODES = new Set<string>([
  GameMode.ZONE_CONTROL,
  GameMode.OPEN_FRONTIER,
  GameMode.A_SHAU_VALLEY,
]);
const FULL_STAMP_REQUIRED_MODES = new Set<string>([
  GameMode.ZONE_CONTROL,
  GameMode.OPEN_FRONTIER,
  GameMode.A_SHAU_VALLEY,
]);
const MIN_ROUTE_WIDTH_BY_MODE = new Map<string, number>([
  [GameMode.ZONE_CONTROL, 16],
  [GameMode.OPEN_FRONTIER, 20],
  [GameMode.A_SHAU_VALLEY, 32],
]);
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
} {
  if (config.heightSource?.type === 'dem') {
    return {
      provider: loadDemProvider(config),
      kind: 'dem',
      sampledSeed: null,
    };
  }

  const sampledSeed = typeof config.terrainSeed === 'number'
    ? config.terrainSeed
    : PROCEDURAL_RANDOM_SEED_FALLBACK;
  return {
    provider: new NoiseHeightProvider(sampledSeed),
    kind: 'noise',
    sampledSeed,
  };
}

function analyzeMode(config: GameModeConfig): ModeRouteAudit {
  const { provider, kind, sampledSeed } = createHeightProvider(config);
  const policy = config.terrainFlow;
  const enabled = policy?.enabled === true;
  const routeStamping = enabled ? (policy.routeStamping ?? 'full') : 'disabled';
  const routeSurface = enabled ? (policy.routeSurface ?? 'jungle_trail') : null;
  const routeWidth = enabled ? Math.max(8, policy.routeWidth ?? DEFAULT_ROUTE_WIDTH) : null;
  const routeBlend = enabled ? Math.max(3, policy.routeBlend ?? DEFAULT_ROUTE_BLEND) : null;
  const routeSpacing = enabled && routeWidth !== null
    ? Math.max(routeWidth, policy.routeSpacing ?? DEFAULT_ROUTE_SPACING)
    : null;
  const routeTerrainWidthScale = enabled ? clamp(policy.routeTerrainWidthScale ?? DEFAULT_ROUTE_TERRAIN_WIDTH_SCALE, 0.22, 0.8) : null;
  const routeGradeStrength = enabled ? clamp(policy.routeGradeStrength ?? DEFAULT_ROUTE_GRADE_STRENGTH, 0, 0.3) : null;
  const routeTargetHeightMode = enabled ? (policy.routeTargetHeightMode ?? 'center') : null;
  const flags: string[] = [];
  const findings: string[] = [];

  if (!enabled) {
    if (REQUIRED_ROUTE_MODES.has(config.id)) {
      flags.push('required-terrain-flow-disabled');
    } else {
      findings.push('mode-relies-on-authored-feature-surfaces-without-generated-route-flow');
    }
    return finalizeMode({
      id: config.id,
      name: config.name,
      heightProvider: kind,
      sampledSeed,
      terrainFlowEnabled: false,
      routeStamping,
      routeSurface,
      routeWidthMeters: routeWidth,
      routeBlendMeters: routeBlend,
      routeSpacingMeters: routeSpacing,
      routeTerrainWidthScale,
      routeGradeStrength,
      routeTargetHeightMode,
      routeCount: 0,
      routeLengthMeters: 0,
      routeCapsuleStamps: 0,
      routeSurfacePatches: 0,
      zoneShoulderStamps: 0,
      roughness: null,
      flags,
      findings,
    });
  }

  const flow = compileTerrainFlow(config, (x, z) => provider.getHeightAt(x, z));
  const stampedProvider = new StampedHeightProvider(provider, flow.stamps);
  const routeCapsuleStamps = flow.stamps.filter((stamp) => stamp.kind === 'flatten_capsule').length;
  const zoneShoulderStamps = flow.stamps.filter((stamp) => stamp.kind === 'flatten_circle').length;
  const routeSurfacePatches = flow.surfacePatches.filter((patch) => patch.shape === 'rect').length;
  const routeLengthMeters = roundMetric(sumRouteLength(flow.flowPaths), 1);
  const roughness = flow.flowPaths.length > 0
    ? measureRouteRoughness(flow.flowPaths, provider, stampedProvider)
    : null;

  if (flow.flowPaths.length === 0) {
    flags.push('enabled-terrain-flow-produced-no-routes');
  }
  if (FULL_STAMP_REQUIRED_MODES.has(config.id) && routeStamping !== 'full') {
    flags.push('route-stamping-not-full');
  }
  if (routeStamping === 'full' && routeCapsuleStamps === 0) {
    flags.push('full-route-stamping-produced-no-capsules');
  }
  if (routeStamping === 'full' && routeSurfacePatches === 0) {
    flags.push('full-route-stamping-produced-no-surface-patches');
  }
  if (routeSurface !== 'jungle_trail') {
    flags.push('route-surface-not-jungle-trail');
  }
  const minWidth = MIN_ROUTE_WIDTH_BY_MODE.get(config.id);
  if (minWidth !== undefined && routeWidth !== null && routeWidth < minWidth) {
    flags.push('route-width-below-mode-target');
  }
  if (config.id === GameMode.A_SHAU_VALLEY && routeTargetHeightMode !== 'average') {
    flags.push('ashau-route-target-height-not-average');
  }
  if (config.id === GameMode.A_SHAU_VALLEY && routeSpacing !== null && routeWidth !== null && routeSpacing > routeWidth * 1.25) {
    flags.push('ashau-route-spacing-too-sparse-for-continuous-trail');
  }
  if (config.id === GameMode.A_SHAU_VALLEY && routeGradeStrength !== null && routeGradeStrength > 0.1) {
    flags.push('ashau-route-grade-strength-too-high');
  }
  if (routeTerrainWidthScale !== null && routeTerrainWidthScale > 0.55) {
    flags.push('route-terrain-width-scale-too-broad');
  }

  if (roughness) {
    const p95Delta = roughness.sourceP95GradePercent - roughness.stampedP95GradePercent;
    findings.push(`stamped-p95-grade-delta=${roundMetric(p95Delta, 2)}pp`);
    findings.push(`route-length=${routeLengthMeters}m`);
  }

  return finalizeMode({
    id: config.id,
    name: config.name,
    heightProvider: kind,
    sampledSeed,
    terrainFlowEnabled: true,
    routeStamping,
    routeSurface,
    routeWidthMeters: routeWidth,
    routeBlendMeters: routeBlend,
    routeSpacingMeters: routeSpacing,
    routeTerrainWidthScale,
    routeGradeStrength,
    routeTargetHeightMode,
    routeCount: flow.flowPaths.length,
    routeLengthMeters,
    routeCapsuleStamps,
    routeSurfacePatches,
    zoneShoulderStamps,
    roughness,
    flags,
    findings,
  });
}

function finalizeMode(mode: Omit<ModeRouteAudit, 'status'>): ModeRouteAudit {
  const failFlags = new Set([
    'required-terrain-flow-disabled',
    'enabled-terrain-flow-produced-no-routes',
    'route-stamping-not-full',
    'full-route-stamping-produced-no-capsules',
    'full-route-stamping-produced-no-surface-patches',
  ]);
  const status: CheckStatus = mode.flags.some((flag) => failFlags.has(flag))
    ? 'fail'
    : mode.flags.length > 0 ? 'warn' : 'pass';
  return { ...mode, status };
}

function sumRouteLength(paths: readonly TerrainFlowPath[]): number {
  return paths.reduce((sum, path) => {
    for (let i = 1; i < path.points.length; i++) {
      sum += distance(path.points[i - 1], path.points[i]);
    }
    return sum;
  }, 0);
}

function measureRouteRoughness(
  paths: readonly TerrainFlowPath[],
  sourceProvider: IHeightProvider,
  stampedProvider: IHeightProvider,
): RouteRoughnessStats {
  const sourceGrades: number[] = [];
  const stampedGrades: number[] = [];
  const sourceSteps: number[] = [];
  const stampedSteps: number[] = [];
  let samples = 0;

  for (const path of paths) {
    let previous: { x: number; z: number; sourceY: number; stampedY: number } | null = null;
    for (const point of samplePath(path)) {
      const current = {
        x: point.x,
        z: point.z,
        sourceY: sourceProvider.getHeightAt(point.x, point.z),
        stampedY: stampedProvider.getHeightAt(point.x, point.z),
      };
      samples++;
      if (previous) {
        const horizontal = Math.max(0.001, distance(previous, current));
        const sourceStep = Math.abs(current.sourceY - previous.sourceY);
        const stampedStep = Math.abs(current.stampedY - previous.stampedY);
        sourceSteps.push(sourceStep);
        stampedSteps.push(stampedStep);
        sourceGrades.push((sourceStep / horizontal) * 100);
        stampedGrades.push((stampedStep / horizontal) * 100);
      }
      previous = current;
    }
  }

  return {
    sampleIntervalMeters: ROUTE_SAMPLE_INTERVAL_M,
    samples,
    sourceP95GradePercent: roundMetric(percentile(sourceGrades, 0.95), 2),
    stampedP95GradePercent: roundMetric(percentile(stampedGrades, 0.95), 2),
    sourceMaxGradePercent: roundMetric(max(sourceGrades), 2),
    stampedMaxGradePercent: roundMetric(max(stampedGrades), 2),
    sourceP95StepMeters: roundMetric(percentile(sourceSteps, 0.95), 2),
    stampedP95StepMeters: roundMetric(percentile(stampedSteps, 0.95), 2),
    sourceMaxStepMeters: roundMetric(max(sourceSteps), 2),
    stampedMaxStepMeters: roundMetric(max(stampedSteps), 2),
  };
}

function samplePath(path: TerrainFlowPath): Array<{ x: number; z: number }> {
  const samples: Array<{ x: number; z: number }> = [];
  for (let i = 1; i < path.points.length; i++) {
    const start = path.points[i - 1];
    const end = path.points[i];
    const segmentLength = distance(start, end);
    const steps = Math.max(1, Math.ceil(segmentLength / ROUTE_SAMPLE_INTERVAL_M));
    for (let step = 0; step <= steps; step++) {
      if (samples.length > 0 && step === 0) continue;
      const t = step / steps;
      samples.push({
        x: lerp(start.x, end.x, t),
        z: lerp(start.z, end.z, t),
      });
    }
  }
  return samples;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function max(values: number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.hypot(dx, dz);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildReport(): TerrainRouteAudit {
  const modes = MODES.map(analyzeMode);
  const failModes = modes.filter((mode) => mode.status === 'fail').length;
  const warnModes = modes.filter((mode) => mode.status === 'warn').length;
  const routeAwareModes = modes.filter((mode) => mode.terrainFlowEnabled).length;
  const status: CheckStatus = failModes > 0 ? 'fail' : warnModes > 0 ? 'warn' : 'pass';

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    workingTreeDirty: isWorkingTreeDirty(),
    source: 'projekt-143-terrain-route-audit',
    status,
    assumptions: {
      sampleIntervalMeters: ROUTE_SAMPLE_INTERVAL_M,
      proceduralRandomSeedFallback: PROCEDURAL_RANDOM_SEED_FALLBACK,
      routeRequiredModes: [...REQUIRED_ROUTE_MODES],
      fullStampRequiredModes: [...FULL_STAMP_REQUIRED_MODES],
      notes: [
        'This is a static route-policy, route-stamp, and centerline roughness audit; it is not visual trail acceptance.',
        'Route roughness compares source terrain against route-only stamps so surface/path policy changes are measurable before browser captures.',
        'A Shau requires full route stamping because map-only routes do not make worn-in, smoothed, future vehicle-usable trails.',
        'Final acceptance still needs elevated screenshots and matched Open Frontier/A Shau perf captures after terrain-flow changes.',
      ],
    },
    summary: {
      modes: modes.length,
      routeAwareModes,
      failModes,
      warnModes,
      totalRouteLengthMeters: roundMetric(modes.reduce((sum, mode) => sum + mode.routeLengthMeters, 0), 1),
      totalRouteCapsuleStamps: modes.reduce((sum, mode) => sum + mode.routeCapsuleStamps, 0),
    },
    modes,
    recommendation: {
      nextBranch: 'Validate A Shau route-stamped jungle trails with screenshot and perf evidence before broader vehicle-path claims.',
      validationRequired: [
        'Before/after terrain-route audit artifact.',
        'Targeted TerrainFeatureCompiler route tests.',
        'A Shau elevated terrain screenshots and short perf capture before accepting route visual/runtime quality.',
      ],
      nonClaims: [
        'No vehicle-navigation acceptance from route stamps alone.',
        'No road-network or asset-import acceptance from this static audit.',
        'No performance claim without matched trusted browser captures.',
      ],
    },
  };
}

function writeReport(report: TerrainRouteAudit): string {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'projekt-143-terrain-route-audit');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'terrain-route-audit.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

function main(): void {
  const report = buildReport();
  const outputPath = writeReport(report);
  const relativePath = relative(process.cwd(), outputPath);
  console.log(`Projekt 143 terrain route audit ${report.status.toUpperCase()}: ${relativePath}`);
  for (const mode of report.modes) {
    console.log(
      `- ${mode.id}: routes=${mode.routeCount}, length=${mode.routeLengthMeters}m, capsules=${mode.routeCapsuleStamps}, surfacePatches=${mode.routeSurfacePatches}, flags=${mode.flags.join(',') || 'none'}`,
    );
    if (mode.roughness) {
      console.log(
        `  - p95Grade source/stamped=${mode.roughness.sourceP95GradePercent}%/${mode.roughness.stampedP95GradePercent}%`,
      );
    }
  }
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
