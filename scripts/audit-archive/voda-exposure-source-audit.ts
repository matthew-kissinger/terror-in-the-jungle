#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';

type AuditStatus = 'pass' | 'warn' | 'fail';
type CheckStatus = 'pass' | 'warn' | 'fail';

interface ImageMetrics {
  width: number;
  height: number;
  lumaMean: number;
  lumaStdDev: number;
  greenDominanceRatio: number;
  overexposedRatio: number;
  edgeContrast: number;
}

interface WaterInfo {
  enabled?: boolean;
  waterVisible?: boolean;
  hydrologyRiverVisible?: boolean;
  hydrologyRiverMaterialProfile?: string;
  hydrologyChannelCount?: number;
  hydrologySegmentCount?: number;
}

interface ReviewShot {
  kind: string;
  description: string;
  file: string;
  metrics: {
    waterInfo?: WaterInfo;
  };
  imageMetrics: ImageMetrics;
  errors: string[];
}

interface ScenarioResult {
  mode: string;
  shots: ReviewShot[];
}

interface VisualReviewReport {
  files?: { summary?: string };
  status: AuditStatus;
  scenarios: ScenarioResult[];
  checks: Array<{ id: string; status: CheckStatus; value: unknown; message: string }>;
}

interface BandMetrics {
  lumaMean: number;
  overexposedRatio: number;
  neutralOverexposedRatio: number;
  greenDominanceRatio: number;
}

interface ShotExposureAnalysis {
  mode: string;
  kind: string;
  file: string;
  description: string;
  exposureRisk: boolean;
  visualReviewMetrics: ImageMetrics;
  waterInfo: WaterInfo | null;
  bands: {
    top: BandMetrics | null;
    middle: BandMetrics | null;
    bottom: BandMetrics | null;
  };
  evidence: {
    globalWaterVisible: boolean;
    hydrologyRiverVisible: boolean;
    hydrologyMaterialProfile: string | null;
    browserErrors: number;
  };
}

interface CheckResult {
  id: string;
  status: CheckStatus;
  value: unknown;
  message: string;
}

interface SourceAnchors {
  waterSystem: string;
  visualReviewScript: string;
  globalWaterColor: string | null;
  globalWaterDistortionScale: string | null;
  globalWaterAlpha: string | null;
  hydrologyRiverMaterialProfile: string | null;
  hydrologyRiverMaterialOpacity: number | null;
  hydrologyRiverBankColor: string | null;
  hydrologyRiverShallowColor: string | null;
  hydrologyRiverDeepColor: string | null;
  hydrologyRiverBankLuma: number | null;
  hydrologyRiverShallowLuma: number | null;
  hydrologyRiverDeepLuma: number | null;
  hydrologyRiverBankAlpha: string | null;
  hydrologyRiverCenterAlpha: string | null;
  exposureRiskPredicate: boolean;
}

interface VodaExposureAuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-voda-exposure-source-audit';
  status: AuditStatus;
  classification: string;
  inputs: {
    visualReview: string;
    waterSystem: string;
    terrainVisualReviewScript: string;
  };
  summary: {
    scenarios: number;
    shots: number;
    exposureRiskShots: number;
    riskModes: string[];
    riskKinds: string[];
    riskGlobalWaterVisibleCount: number;
    riskHydrologyVisibleCount: number;
  };
  sourceAnchors: SourceAnchors;
  analyses: ShotExposureAnalysis[];
  checks: CheckResult[];
  requiredNextActions: string[];
  nonClaims: string[];
  files?: {
    summary: string;
    markdown: string;
  };
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-voda-exposure-source-audit';
const WATER_SYSTEM_PATH = join(process.cwd(), 'src', 'systems', 'environment', 'WaterSystem.ts');
const TERRAIN_VISUAL_REVIEW_SCRIPT = join(process.cwd(), 'scripts', 'projekt-143-terrain-visual-review.ts');
const OVEREXPOSED_LUMA = 245;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function readArg(argv: string[], name: string): string | null {
  const eqArg = argv.find(arg => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && index + 1 < argv.length) return argv[index + 1] ?? null;
  return null;
}

function latestVisualReviewPath(): string {
  if (!existsSync(ARTIFACT_ROOT)) {
    throw new Error(`Artifact root missing: ${rel(ARTIFACT_ROOT)}`);
  }
  const candidates = readdirSync(ARTIFACT_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(ARTIFACT_ROOT, entry.name, 'projekt-143-terrain-visual-review', 'visual-review.json'))
    .filter(path => existsSync(path))
    .sort();
  const latest = candidates.at(-1);
  if (!latest) {
    throw new Error('No projekt-143-terrain-visual-review artifact found.');
  }
  return latest;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function extractConst(source: string, name: string): string | null {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  return match?.[1]?.trim() ?? null;
}

function extractHydrologyMaterialOpacity(source: string): number | null {
  const materialMatch = source.match(/new THREE\.MeshStandardMaterial\(\{([\s\S]*?)\}\);/);
  const body = materialMatch?.[1] ?? '';
  const opacityMatch = body.match(/opacity:\s*([0-9.]+)/);
  return opacityMatch?.[1] ? Number(opacityMatch[1]) : null;
}

function colorConstLuma(value: string | null): number | null {
  const match = value?.match(/0x([0-9a-fA-F]{6})/);
  if (!match?.[1]) return null;
  const numeric = Number.parseInt(match[1], 16);
  const r = (numeric >> 16) & 0xff;
  const g = (numeric >> 8) & 0xff;
  const b = numeric & 0xff;
  return Number((0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(2));
}

function shotHasExposureRisk(shot: ReviewShot): boolean {
  const metrics = shot.imageMetrics;
  return metrics.lumaMean >= 225
    && metrics.greenDominanceRatio < 0.05
    && (metrics.edgeContrast < 4 || metrics.overexposedRatio > 0.45);
}

async function bandMetrics(path: string, y0Ratio: number, y1Ratio: number): Promise<BandMetrics | null> {
  if (!existsSync(path)) return null;
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const startY = Math.max(0, Math.floor(info.height * y0Ratio));
  const endY = Math.min(info.height, Math.ceil(info.height * y1Ratio));
  let lumaTotal = 0;
  let greenDominant = 0;
  let overexposed = 0;
  let neutralOverexposed = 0;
  let pixels = 0;
  for (let y = startY; y < endY; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const isGreenDominant = g > r * 1.04 && g > b * 1.04;
      const isOverexposed = luma > OVEREXPOSED_LUMA;
      lumaTotal += luma;
      if (isGreenDominant) greenDominant++;
      if (isOverexposed) overexposed++;
      if (isOverexposed && !isGreenDominant) neutralOverexposed++;
      pixels++;
    }
  }
  return {
    lumaMean: pixels > 0 ? Number((lumaTotal / pixels).toFixed(2)) : 0,
    overexposedRatio: pixels > 0 ? Number((overexposed / pixels).toFixed(4)) : 0,
    neutralOverexposedRatio: pixels > 0 ? Number((neutralOverexposed / pixels).toFixed(4)) : 0,
    greenDominanceRatio: pixels > 0 ? Number((greenDominant / pixels).toFixed(4)) : 0,
  };
}

async function analyzeShot(mode: string, shot: ReviewShot): Promise<ShotExposureAnalysis> {
  const absFile = join(process.cwd(), shot.file);
  const waterInfo = shot.metrics.waterInfo ?? null;
  return {
    mode,
    kind: shot.kind,
    file: shot.file,
    description: shot.description,
    exposureRisk: shotHasExposureRisk(shot),
    visualReviewMetrics: shot.imageMetrics,
    waterInfo,
    bands: {
      top: await bandMetrics(absFile, 0, 0.25),
      middle: await bandMetrics(absFile, 0.25, 0.75),
      bottom: await bandMetrics(absFile, 0.75, 1),
    },
    evidence: {
      globalWaterVisible: waterInfo?.waterVisible === true,
      hydrologyRiverVisible: waterInfo?.hydrologyRiverVisible === true,
      hydrologyMaterialProfile: waterInfo?.hydrologyRiverMaterialProfile ?? null,
      browserErrors: shot.errors.length,
    },
  };
}

function buildChecks(
  visualReview: VisualReviewReport,
  analyses: ShotExposureAnalysis[],
  sourceAnchors: SourceAnchors,
): CheckResult[] {
  const riskShots = analyses.filter(analysis => analysis.exposureRisk);
  const allRiskShotsAvoidGlobalWater = riskShots.every(analysis => !analysis.evidence.globalWaterVisible);
  const allRiskShotsHaveHydrology = riskShots.every(analysis => analysis.evidence.hydrologyRiverVisible);
  const hydrologyMaterialLumas = [
    sourceAnchors.hydrologyRiverBankLuma,
    sourceAnchors.hydrologyRiverShallowLuma,
    sourceAnchors.hydrologyRiverDeepLuma,
  ].filter((value): value is number => typeof value === 'number');
  const hydrologyMaterialDark = hydrologyMaterialLumas.length === 3
    && Math.max(...hydrologyMaterialLumas) < 90
    && (sourceAnchors.hydrologyRiverMaterialOpacity ?? 1) <= 0.6;
  const riskShotsNeutralOverexposed = riskShots.every((analysis) => {
    const middle = analysis.bands.middle?.neutralOverexposedRatio ?? 0;
    const bottom = analysis.bands.bottom?.neutralOverexposedRatio ?? 0;
    return Math.max(middle, bottom) >= 0.65;
  });
  const riskMiddleOrBottomDominates = riskShots.every((analysis) => {
    const top = analysis.bands.top?.overexposedRatio ?? 0;
    const middle = analysis.bands.middle?.overexposedRatio ?? 0;
    const bottom = analysis.bands.bottom?.overexposedRatio ?? 0;
    return Math.max(middle, bottom) > top;
  });
  return [
    {
      id: 'source_visual_review_loaded',
      status: visualReview.scenarios.length > 0 ? 'pass' : 'fail',
      value: visualReview.scenarios.length,
      message: 'Loaded the prior terrain-water visual review artifact.',
    },
    {
      id: 'exposure_risk_still_present',
      status: riskShots.length > 0 ? 'warn' : 'pass',
      value: riskShots.map(shot => `${shot.mode}/${shot.kind}`),
      message: 'Classified shots that triggered the terrain_water_exposure_review predicate.',
    },
    {
      id: 'global_water_shader_not_active_for_warned_shots',
      status: allRiskShotsAvoidGlobalWater ? 'pass' : 'warn',
      value: riskShots.filter(shot => shot.evidence.globalWaterVisible).map(shot => `${shot.mode}/${shot.kind}`),
      message: 'Warned shots should not be attributed to the Three.js global water shader when waterVisible=false.',
    },
    {
      id: 'hydrology_surface_present_for_warned_shots',
      status: allRiskShotsHaveHydrology ? 'pass' : 'warn',
      value: riskShots.filter(shot => shot.evidence.hydrologyRiverVisible).length,
      message: 'Warned shots still had hydrology river surfaces present, so hydrology compositing remains in the review path.',
    },
    {
      id: 'source_anchors_present',
      status: sourceAnchors.exposureRiskPredicate
        && Boolean(sourceAnchors.hydrologyRiverMaterialProfile)
        && sourceAnchors.hydrologyRiverMaterialOpacity !== null
        ? 'pass'
        : 'fail',
      value: {
        exposureRiskPredicate: sourceAnchors.exposureRiskPredicate,
        hydrologyRiverMaterialProfile: sourceAnchors.hydrologyRiverMaterialProfile,
        hydrologyRiverMaterialOpacity: sourceAnchors.hydrologyRiverMaterialOpacity,
      },
      message: 'Source constants and the exposure predicate are present for follow-up tuning.',
    },
    {
      id: 'hydrology_material_dark_source_bound',
      status: hydrologyMaterialDark ? 'pass' : 'warn',
      value: {
        opacity: sourceAnchors.hydrologyRiverMaterialOpacity,
        bankLuma: sourceAnchors.hydrologyRiverBankLuma,
        shallowLuma: sourceAnchors.hydrologyRiverShallowLuma,
        deepLuma: sourceAnchors.hydrologyRiverDeepLuma,
      },
      message: 'Hydrology river material source is dark and semi-transparent; washed white frames should not be attributed to source color alone.',
    },
    {
      id: 'neutral_overexposure_dominates_warned_sightline',
      status: riskShotsNeutralOverexposed ? 'pass' : 'warn',
      value: riskShots.map(analysis => ({
        shot: `${analysis.mode}/${analysis.kind}`,
        middleNeutralOverexposed: analysis.bands.middle?.neutralOverexposedRatio ?? null,
        bottomNeutralOverexposed: analysis.bands.bottom?.neutralOverexposedRatio ?? null,
      })),
      message: 'Warned shots are dominated by high-luma neutral pixels rather than green-dominant water or foliage pixels.',
    },
    {
      id: 'middle_or_bottom_bands_dominate_warned_sightline',
      status: riskMiddleOrBottomDominates ? 'pass' : 'warn',
      value: riskShots.map(analysis => ({
        shot: `${analysis.mode}/${analysis.kind}`,
        topOverexposed: analysis.bands.top?.overexposedRatio ?? null,
        middleOverexposed: analysis.bands.middle?.overexposedRatio ?? null,
        bottomOverexposed: analysis.bands.bottom?.overexposedRatio ?? null,
      })),
      message: 'Exposure risk sits in the terrain/water review sightline, not only in the sky band.',
    },
    {
      id: 'resource_contention_safe',
      status: 'pass',
      value: 'no browser or perf capture launched',
      message: 'The audit uses existing screenshots and source only.',
    },
  ];
}

function classify(analyses: ShotExposureAnalysis[]): string {
  const riskShots = analyses.filter(analysis => analysis.exposureRisk);
  if (riskShots.length === 0) return 'voda_exposure_risk_absent_in_source_packet';
  if (riskShots.every(analysis => !analysis.evidence.globalWaterVisible) && riskShots.every(analysis => analysis.evidence.hydrologyRiverVisible)) {
    const neutralSightlineDominates = riskShots.every((analysis) =>
      Math.max(
        analysis.bands.middle?.neutralOverexposedRatio ?? 0,
        analysis.bands.bottom?.neutralOverexposedRatio ?? 0,
      ) >= 0.65
    );
    return neutralSightlineDominates
      ? 'voda_exposure_warning_review_composition_before_water_material_tuning'
      : 'voda_exposure_warning_not_global_water_shader_hydrology_review_path_active';
  }
  if (riskShots.some(analysis => analysis.evidence.globalWaterVisible)) {
    return 'voda_exposure_warning_global_water_shader_participates';
  }
  return 'voda_exposure_warning_source_requires_visual_followup';
}

function reportStatus(checks: CheckResult[]): AuditStatus {
  if (checks.some(check => check.status === 'fail')) return 'fail';
  if (checks.some(check => check.status === 'warn')) return 'warn';
  return 'pass';
}

function toMarkdown(report: VodaExposureAuditReport): string {
  return [
    '# Projekt Objekt-143 VODA Exposure Source Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Classification: ${report.classification}`,
    `Source SHA: ${report.sourceGitSha}`,
    '',
    '## Summary',
    '',
    ...Object.entries(report.summary).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`),
    '',
    '## Checks',
    '',
    ...report.checks.map(check => `- ${check.status.toUpperCase()} ${check.id}: ${JSON.stringify(check.value)} - ${check.message}`),
    '',
    '## Exposure-Risk Shots',
    '',
    ...report.analyses
      .filter(analysis => analysis.exposureRisk)
      .map(analysis => [
        `### ${analysis.mode} / ${analysis.kind}`,
        '',
        `- File: ${analysis.file}`,
        `- Full-frame metrics: mean=${analysis.visualReviewMetrics.lumaMean}, over=${analysis.visualReviewMetrics.overexposedRatio}, green=${analysis.visualReviewMetrics.greenDominanceRatio}, edge=${analysis.visualReviewMetrics.edgeContrast}`,
        `- Water visible: ${analysis.evidence.globalWaterVisible}`,
        `- Hydrology visible: ${analysis.evidence.hydrologyRiverVisible}`,
        `- Top band: ${JSON.stringify(analysis.bands.top)}`,
        `- Middle band: ${JSON.stringify(analysis.bands.middle)}`,
        `- Bottom band: ${JSON.stringify(analysis.bands.bottom)}`,
        '',
      ].join('\n')),
    '## Required Next Actions',
    '',
    ...report.requiredNextActions.map(action => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map(claim => `- ${claim}`),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const visualReviewPath = readArg(process.argv.slice(2), '--source') ?? latestVisualReviewPath();
  if (!existsSync(visualReviewPath)) {
    throw new Error(`Visual review artifact missing: ${visualReviewPath}`);
  }

  const visualReview = readJson<VisualReviewReport>(visualReviewPath);
  const waterSystem = readText(WATER_SYSTEM_PATH);
  const terrainVisualReview = readText(TERRAIN_VISUAL_REVIEW_SCRIPT);
  const analyses: ShotExposureAnalysis[] = [];
  for (const scenario of visualReview.scenarios) {
    for (const shot of scenario.shots) {
      analyses.push(await analyzeShot(scenario.mode, shot));
    }
  }
  const riskShots = analyses.filter(analysis => analysis.exposureRisk);
  const sourceAnchors: SourceAnchors = {
    waterSystem: rel(WATER_SYSTEM_PATH),
    visualReviewScript: rel(TERRAIN_VISUAL_REVIEW_SCRIPT),
    globalWaterColor: extractConst(waterSystem, 'GLOBAL_WATER_COLOR'),
    globalWaterDistortionScale: extractConst(waterSystem, 'GLOBAL_WATER_DISTORTION_SCALE'),
    globalWaterAlpha: extractConst(waterSystem, 'GLOBAL_WATER_ALPHA'),
    hydrologyRiverMaterialProfile: extractConst(waterSystem, 'HYDROLOGY_RIVER_MATERIAL_PROFILE'),
    hydrologyRiverMaterialOpacity: extractHydrologyMaterialOpacity(waterSystem),
    hydrologyRiverBankColor: extractConst(waterSystem, 'HYDROLOGY_RIVER_BANK_COLOR'),
    hydrologyRiverShallowColor: extractConst(waterSystem, 'HYDROLOGY_RIVER_SHALLOW_COLOR'),
    hydrologyRiverDeepColor: extractConst(waterSystem, 'HYDROLOGY_RIVER_DEEP_COLOR'),
    hydrologyRiverBankLuma: colorConstLuma(extractConst(waterSystem, 'HYDROLOGY_RIVER_BANK_COLOR')),
    hydrologyRiverShallowLuma: colorConstLuma(extractConst(waterSystem, 'HYDROLOGY_RIVER_SHALLOW_COLOR')),
    hydrologyRiverDeepLuma: colorConstLuma(extractConst(waterSystem, 'HYDROLOGY_RIVER_DEEP_COLOR')),
    hydrologyRiverBankAlpha: extractConst(waterSystem, 'HYDROLOGY_RIVER_BANK_ALPHA'),
    hydrologyRiverCenterAlpha: extractConst(waterSystem, 'HYDROLOGY_RIVER_CENTER_ALPHA'),
    exposureRiskPredicate: terrainVisualReview.includes('function shotHasExposureRisk')
      && terrainVisualReview.includes('metrics.lumaMean >= 225')
      && terrainVisualReview.includes('metrics.greenDominanceRatio < 0.05'),
  };
  const checks = buildChecks(visualReview, analyses, sourceAnchors);
  const report: VodaExposureAuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-voda-exposure-source-audit',
    status: reportStatus(checks),
    classification: classify(analyses),
    inputs: {
      visualReview: rel(visualReviewPath),
      waterSystem: rel(WATER_SYSTEM_PATH),
      terrainVisualReviewScript: rel(TERRAIN_VISUAL_REVIEW_SCRIPT),
    },
    summary: {
      scenarios: visualReview.scenarios.length,
      shots: analyses.length,
      exposureRiskShots: riskShots.length,
      riskModes: [...new Set(riskShots.map(shot => shot.mode))],
      riskKinds: [...new Set(riskShots.map(shot => shot.kind))],
      riskGlobalWaterVisibleCount: riskShots.filter(shot => shot.evidence.globalWaterVisible).length,
      riskHydrologyVisibleCount: riskShots.filter(shot => shot.evidence.hydrologyRiverVisible).length,
    },
    sourceAnchors,
    analyses,
    checks,
    requiredNextActions: [
      'Do not tune the Three.js global water shader to answer this exposure warning while warned shots record waterVisible=false.',
      'Inspect Open Frontier camera review angles, sky exposure, airfield/foundation materials, and terrain-water sightline composition before changing water rendering.',
      'Treat hydrology material tuning as a later candidate only after camera, sky, and pale terrain/foundation composition have been isolated.',
      'If hydrology strip material changes, rerun the VODA runtime proof plus terrain visual review; accept only with KB-DIZAYN/human visual signoff.',
      'Pair any visual acceptance with quiet-machine Open Frontier and A Shau perf captures before treating VODA-1 as release-ready.',
    ],
    nonClaims: [
      'This audit does not change water rendering.',
      'This audit does not accept final water art.',
      'This audit does not prove performance or optimization.',
      'This audit does not replace a fresh browser visual review after remediation.',
    ],
  };

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const summaryPath = join(outputDir, 'summary.json');
  const markdownPath = join(outputDir, 'summary.md');
  report.files = {
    summary: rel(summaryPath),
    markdown: rel(markdownPath),
  };
  writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, toMarkdown(report), 'utf-8');

  console.log(`Projekt 143 VODA exposure source audit ${report.status.toUpperCase()}: ${rel(summaryPath)}`);
  console.log(`classification=${report.classification}`);
  console.log(`exposureRiskShots=${report.summary.exposureRiskShots}`);
  console.log(`riskGlobalWaterVisibleCount=${report.summary.riskGlobalWaterVisibleCount}`);
  console.log(`riskHydrologyVisibleCount=${report.summary.riskHydrologyVisibleCount}`);
  if (report.status === 'fail') process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
