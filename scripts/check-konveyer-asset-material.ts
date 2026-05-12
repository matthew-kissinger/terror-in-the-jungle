#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type AuditStatus = 'pass' | 'warn' | 'fail';
type Surface = 'vegetation' | 'npc';

interface TextureMetrics {
  status?: string;
  width?: number;
  height?: number;
  lumaMean?: number;
  saturationMean?: number;
  alphaCoverage?: number;
  overexposedRatio?: number;
}

interface MaterialProbe {
  surface: Surface;
  name: string;
  type: string;
  category: string;
  uniforms: Record<string, unknown>;
  textureMetrics: {
    map?: TextureMetrics;
    normalMap?: TextureMetrics;
  };
}

interface ImageMetrics {
  lumaMean?: number;
  saturationMean?: number;
  overexposedRatio?: number;
  greenDominanceRatio?: number;
  alphaCoverage?: number;
}

interface PoseProbe {
  kind: string;
  screenshot: string;
  imageMetrics: ImageMetrics;
}

interface ModeProbe {
  mode: string;
  status: AuditStatus;
  materialProbes: MaterialProbe[];
  poses: PoseProbe[];
}

interface SceneParityReport {
  createdAt: string;
  status: AuditStatus;
  files?: Record<string, string>;
  modes: ModeProbe[];
}

interface SurfaceStageAudit {
  surface: Surface;
  materialName: string;
  materialType: string;
  category: string;
  rawAtlas: {
    status: string;
    width: number | null;
    height: number | null;
    lumaMean: number | null;
    saturationMean: number | null;
    alphaCoverage: number | null;
    overexposedRatio: number | null;
    normalMapStatus: string;
  };
  materialLighting: Record<string, number | boolean | null>;
  fog: Record<string, number | boolean | string | null>;
  finalCompositeProxy: {
    scope: 'whole-pose-screenshot';
    groundScreenshot: string | null;
    skywardScreenshot: string | null;
    groundLumaMean: number | null;
    groundSaturationMean: number | null;
    skywardLumaMean: number | null;
    skywardSaturationMean: number | null;
  };
  findings: string[];
}

interface ModeAssetAudit {
  mode: string;
  status: AuditStatus;
  surfaces: SurfaceStageAudit[];
  missingSurfaces: Surface[];
  findings: string[];
}

interface AssetMaterialAuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'konveyer-asset-material-audit';
  status: AuditStatus;
  inputSceneParityReport: string;
  output: {
    json: string;
    markdown: string;
  };
  sceneParityStatus: AuditStatus;
  modeAudits: ModeAssetAudit[];
  nextActions: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'konveyer-asset-material-audit';
const RAW_DARK_LUMA = 0.08;
const NPC_HEAVY_MIN_LIGHT = 0.85;
const NPC_HEAVY_EXPOSURE = 1.1;
const VEGETATION_BRIGHT_TINT_GREEN = 0.95;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseFlag(name: string): string | null {
  const eqArg = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (eqArg) return eqArg.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return null;
}

function findLatestSceneParityReport(): string {
  if (!existsSync(ARTIFACT_ROOT)) throw new Error(`Artifact root missing: ${ARTIFACT_ROOT}`);
  const candidates: string[] = [];
  for (const runDir of readdirSync(ARTIFACT_ROOT)) {
    const candidate = join(ARTIFACT_ROOT, runDir, 'konveyer-scene-parity', 'scene-parity.json');
    if (existsSync(candidate)) candidates.push(candidate);
  }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!candidates[0]) throw new Error('No konveyer-scene-parity report found. Run check:konveyer-scene-parity first.');
  return candidates[0];
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function colorComponent(value: unknown, component: 'r' | 'g' | 'b'): number | null {
  if (!value || typeof value !== 'object') return null;
  return asNumber((value as Record<string, unknown>)[component]);
}

function stageAuditForProbe(mode: ModeProbe, probe: MaterialProbe): SurfaceStageAudit {
  const uniforms = probe.uniforms ?? {};
  const map = probe.textureMetrics?.map ?? {};
  const normalMap = probe.textureMetrics?.normalMap ?? {};
  const ground = mode.poses.find(pose => pose.kind === 'ground') ?? null;
  const skyward = mode.poses.find(pose => pose.kind === 'skyward') ?? null;
  const rawLuma = asNumber(map.lumaMean);
  const rawSaturation = asNumber(map.saturationMean);
  const rawAlpha = asNumber(map.alphaCoverage);
  const findings: string[] = [];

  if (map.status !== 'sampled-data') {
    findings.push(`raw-atlas-not-sampled:${map.status ?? 'missing'}`);
  }
  if (rawLuma !== null && rawLuma < RAW_DARK_LUMA) {
    findings.push(`raw-atlas-dark:luma=${rawLuma.toFixed(3)}`);
  }
  if (rawAlpha !== null && rawAlpha < 0.12) {
    findings.push(`sparse-alpha-coverage:${rawAlpha.toFixed(3)}`);
  }

  if (probe.surface === 'npc') {
    const minLight = asNumber(uniforms.minNpcLight);
    const exposure = asNumber(uniforms.npcExposure);
    if ((minLight ?? 0) >= NPC_HEAVY_MIN_LIGHT || (exposure ?? 0) >= NPC_HEAVY_EXPOSURE) {
      findings.push(`material-heavy-lift:npcExposure=${exposure ?? 'missing'},minNpcLight=${minLight ?? 'missing'}`);
    }
    if (normalMap.status !== 'sampled-data') {
      findings.push(`normal-map-not-present:${normalMap.status ?? 'missing'}`);
    }
  } else {
    const tintGreen = colorComponent(uniforms.colorTint, 'g');
    if ((tintGreen ?? 0) >= VEGETATION_BRIGHT_TINT_GREEN) {
      findings.push(`bright-green-tint-bias:g=${tintGreen?.toFixed(2) ?? 'missing'}`);
    }
  }

  return {
    surface: probe.surface,
    materialName: probe.name,
    materialType: probe.type,
    category: probe.category,
    rawAtlas: {
      status: String(map.status ?? 'missing'),
      width: asNumber(map.width),
      height: asNumber(map.height),
      lumaMean: rawLuma,
      saturationMean: rawSaturation,
      alphaCoverage: rawAlpha,
      overexposedRatio: asNumber(map.overexposedRatio),
      normalMapStatus: String(normalMap.status ?? 'missing'),
    },
    materialLighting: probe.surface === 'npc'
      ? {
          npcExposure: asNumber(uniforms.npcExposure),
          minNpcLight: asNumber(uniforms.minNpcLight),
          npcTopLight: asNumber(uniforms.npcTopLight),
          parityScale: asNumber(uniforms.parityScale),
          parityLift: asNumber(uniforms.parityLift),
          paritySaturation: asNumber(uniforms.paritySaturation),
          readabilityStrength: asNumber(uniforms.readabilityStrength),
          atmosphereLightScale: asNumber(uniforms.npcAtmosphereLightScale),
          lightingEnabled: asNumber(uniforms.npcLightingEnabled) === 1,
        }
      : {
          vegetationExposure: asNumber(uniforms.vegetationExposure),
          vegetationSaturation: asNumber(uniforms.vegetationSaturation),
          minVegetationLight: asNumber(uniforms.minVegetationLight),
          maxVegetationLight: asNumber(uniforms.maxVegetationLight),
          tintR: colorComponent(uniforms.colorTint, 'r'),
          tintG: colorComponent(uniforms.colorTint, 'g'),
          tintB: colorComponent(uniforms.colorTint, 'b'),
          lightingEnabled: asBool(uniforms.lightingEnabled),
        },
    fog: probe.surface === 'npc'
      ? {
          mode: asNumber(uniforms.npcFogMode),
          density: asNumber(uniforms.npcFogDensity),
          near: asNumber(uniforms.npcFogNear),
          far: asNumber(uniforms.npcFogFar),
          heightFalloff: asNumber(uniforms.npcFogHeightFalloff),
        }
      : {
          enabled: asBool(uniforms.fogEnabled),
          density: asNumber(uniforms.fogDensity),
          startDistance: asNumber(uniforms.fogStartDistance),
          heightFalloff: asNumber(uniforms.fogHeightFalloff),
        },
    finalCompositeProxy: {
      scope: 'whole-pose-screenshot',
      groundScreenshot: ground?.screenshot ?? null,
      skywardScreenshot: skyward?.screenshot ?? null,
      groundLumaMean: asNumber(ground?.imageMetrics?.lumaMean),
      groundSaturationMean: asNumber(ground?.imageMetrics?.saturationMean),
      skywardLumaMean: asNumber(skyward?.imageMetrics?.lumaMean),
      skywardSaturationMean: asNumber(skyward?.imageMetrics?.saturationMean),
    },
    findings,
  };
}

function statusForMode(mode: ModeAssetAudit): AuditStatus {
  if (mode.missingSurfaces.length > 0) return 'fail';
  return mode.findings.length > 0 ? 'warn' : 'pass';
}

function statusForReport(modes: ModeAssetAudit[]): AuditStatus {
  if (modes.some(mode => mode.status === 'fail')) return 'fail';
  if (modes.some(mode => mode.status === 'warn')) return 'warn';
  return 'pass';
}

function auditMode(mode: ModeProbe): ModeAssetAudit {
  const surfaces = mode.materialProbes.map(probe => stageAuditForProbe(mode, probe));
  const presentSurfaces = new Set(surfaces.map(surface => surface.surface));
  const missingSurfaces = (['vegetation', 'npc'] as Surface[]).filter(surface => !presentSurfaces.has(surface));
  const findings = [
    ...missingSurfaces.map(surface => `missing-${surface}-probe`),
    ...surfaces.flatMap(surface => surface.findings.map(finding => `${surface.surface}:${finding}`)),
  ];
  const result: ModeAssetAudit = {
    mode: mode.mode,
    status: 'pass',
    surfaces,
    missingSurfaces,
    findings,
  };
  result.status = statusForMode(result);
  return result;
}

function fmt(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? 'n/a' : value.toFixed(digits);
}

function writeMarkdown(report: AssetMaterialAuditReport): string {
  const lines: string[] = [
    '# KONVEYER Asset Material Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status}`,
    `Input scene parity report: ${report.inputSceneParityReport}`,
    '',
    '## Summary',
    '',
    'This audit turns strict WebGPU material probes into an asset/runtime decision packet. It separates raw atlas metrics, material lighting lift, fog state, and final whole-pose screenshot proxies. It intentionally does not claim per-object final-composite acceptance because the current scene probe does not crop individual vegetation/NPC outputs yet.',
    '',
    '| Mode | Surface | Raw luma | Raw alpha | Material lift | Fog | Findings |',
    '| --- | --- | ---: | ---: | --- | --- | --- |',
  ];

  for (const mode of report.modeAudits) {
    for (const surface of mode.surfaces) {
      const lift = surface.surface === 'npc'
        ? `exp=${fmt(surface.materialLighting.npcExposure as number | null, 2)} min=${fmt(surface.materialLighting.minNpcLight as number | null, 2)} sat=${fmt(surface.materialLighting.paritySaturation as number | null, 2)}`
        : `exp=${fmt(surface.materialLighting.vegetationExposure as number | null, 2)} sat=${fmt(surface.materialLighting.vegetationSaturation as number | null, 2)} light=${fmt(surface.materialLighting.minVegetationLight as number | null, 2)}-${fmt(surface.materialLighting.maxVegetationLight as number | null, 2)}`;
      const fog = Object.entries(surface.fog)
        .map(([key, value]) => `${key}=${value ?? 'n/a'}`)
        .join(' ');
      lines.push(`| ${mode.mode} | ${surface.surface} | ${fmt(surface.rawAtlas.lumaMean)} | ${fmt(surface.rawAtlas.alphaCoverage)} | ${lift} | ${fog} | ${surface.findings.join('<br>') || 'none'} |`);
    }
  }

  lines.push(
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map(action => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map(nonClaim => `- ${nonClaim}`),
    '',
  );
  return lines.join('\n');
}

function main(): void {
  const input = resolve(parseFlag('input') ?? findLatestSceneParityReport());
  if (!existsSync(input)) throw new Error(`Input scene parity report not found: ${input}`);
  const sceneReport = JSON.parse(readFileSync(input, 'utf8')) as SceneParityReport;
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'asset-material-audit.json');
  const markdownPath = join(outputDir, 'asset-material-audit.md');
  const modeAudits = sceneReport.modes.map(auditMode);
  const report: AssetMaterialAuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status: statusForReport(modeAudits),
    inputSceneParityReport: relative(process.cwd(), input),
    output: {
      json: relative(process.cwd(), jsonPath),
      markdown: relative(process.cwd(), markdownPath),
    },
    sceneParityStatus: sceneReport.status,
    modeAudits,
    nextActions: [
      'Do not tune toward WebGL color matching. Use this packet to decide whether the fix belongs in Pixel Forge source rebake/edit, runtime material lighting, or fog/atmosphere policy.',
      'NPC impostors are currently dark raw atlases lifted heavily by material uniforms; review whether Pixel Forge NPC albedo should be rebaked brighter/cleaner before adding more shader compensation.',
      'Vegetation impostors have sparse alpha and a bright green tint bias; shortlist the worst species for Pixel Forge humid-jungle rebake/edit review before broad material retuning.',
      'Use the asset-crop probe for first final-frame crops, then tighten the framing and add close-GLB comparison before treating individual soldier/vegetation readability as accepted.',
    ],
    nonClaims: [
      'This audit does not update perf baselines.',
      'This audit does not accept WebGL fallback evidence.',
      'This audit does not visually accept vegetation or NPC assets; it packages the current strict WebGPU evidence into actionable source-vs-runtime decisions.',
    ],
  };
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, writeMarkdown(report));
  console.log(`KONVEYER asset material audit written to ${relative(process.cwd(), markdownPath)}`);
  if (report.status === 'fail') process.exitCode = 1;
}

main();
