#!/usr/bin/env tsx

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'path';
import { chromium } from 'playwright';

type JsonObject = Record<string, unknown>;

type ArtifactKind =
  | 'startup-open-frontier'
  | 'startup-zone-control'
  | 'combat120'
  | 'openfrontier-short'
  | 'ashau-short'
  | 'grenade-spike';

type ArtifactInput = {
  kind: ArtifactKind;
  label: string;
  path: string;
};

type ArtifactCertification = {
  kind: ArtifactKind;
  label: string;
  artifactPath: string;
  commitSha: string;
  mode: string;
  artifactType: 'startup-ui' | 'perf-capture' | 'grenade-spike';
  timingWindow: JsonObject;
  warmupPolicy: JsonObject;
  measurementTrust: JsonObject;
  browserRuntime: JsonObject;
  instrumentation: JsonObject;
  headline: JsonObject;
  requiredFiles: Record<string, boolean>;
  notes: string[];
};

type BundleReport = {
  createdAt: string;
  source: string;
  status: 'pass' | 'warn' | 'fail';
  commitSha: string;
  localBuildManifests: {
    retailGitSha: string | null;
    perfGitSha: string | null;
  };
  browserRuntime: JsonObject;
  acceptance: {
    trustedSteadyStateCaptures: string[];
    untrustedOrDiagnosticCaptures: string[];
    blockers: string[];
  };
  artifacts: ArtifactCertification[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const require = createRequire(import.meta.url);
const REQUIRED_INPUTS: Array<{ flag: string; kind: ArtifactKind; label: string }> = [
  { flag: 'startup-open', kind: 'startup-open-frontier', label: 'Open Frontier startup' },
  { flag: 'startup-zone', kind: 'startup-zone-control', label: 'Zone Control startup' },
  { flag: 'combat120', kind: 'combat120', label: 'combat120' },
  { flag: 'openfrontier-short', kind: 'openfrontier-short', label: 'Open Frontier short' },
  { flag: 'ashau-short', kind: 'ashau-short', label: 'A Shau short' },
  { flag: 'grenade', kind: 'grenade-spike', label: 'Low-load grenade spike' },
];

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function readJson(filePath: string): JsonObject {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as JsonObject;
}

function maybeReadJson(filePath: string): JsonObject | null {
  return existsSync(filePath) ? readJson(filePath) : null;
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function readFlag(args: string[], flag: string): string | null {
  const eqArg = args.find((arg) => arg.startsWith(`--${flag}=`));
  if (eqArg) {
    return eqArg.slice(flag.length + 3);
  }
  const index = args.findIndex((arg) => arg === `--${flag}`);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1];
  }
  return null;
}

function parseInputs(): ArtifactInput[] {
  const args = process.argv.slice(2);
  const inputs = REQUIRED_INPUTS.map((required) => {
    const rawPath = readFlag(args, required.flag);
    if (!rawPath) {
      throw new Error(`Missing --${required.flag} <artifact-dir>`);
    }
    const artifactPath = resolve(process.cwd(), rawPath);
    if (!existsSync(artifactPath)) {
      throw new Error(`Artifact directory does not exist for --${required.flag}: ${artifactPath}`);
    }
    return {
      kind: required.kind,
      label: required.label,
      path: artifactPath,
    };
  });
  return inputs;
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  }).trim();
}

function readManifestSha(relativePath: string): string | null {
  const manifest = maybeReadJson(join(process.cwd(), relativePath));
  return manifest ? nullableStringValue(manifest.gitSha) : null;
}

function packageVersion(packageName: string): string | null {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, {
      paths: [process.cwd()],
    });
    const packageJson = readJson(packageJsonPath);
    return nullableStringValue(packageJson.version);
  } catch {
    return null;
  }
}

async function browserRuntimeMetadata(): Promise<JsonObject> {
  let chromiumVersion: string | null = null;
  try {
    const browser = await chromium.launch({ headless: true });
    chromiumVersion = browser.version();
    await browser.close();
  } catch {
    chromiumVersion = null;
  }
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    playwright: packageVersion('playwright'),
    chromium: chromiumVersion,
  };
}

function fileExists(artifactPath: string, filename: string): boolean {
  return existsSync(join(artifactPath, filename));
}

function cpuProfileCount(artifactPath: string): number {
  return readdirSync(artifactPath).filter((name) => name.endsWith('.cpuprofile')).length;
}

function writeSidecar(artifactPath: string, certification: ArtifactCertification): void {
  writeFileSync(
    join(artifactPath, 'projekt-143-cycle1-metadata.json'),
    `${JSON.stringify(certification, null, 2)}\n`,
    'utf-8',
  );
}

function buildStartupCertification(
  input: ArtifactInput,
  commitSha: string,
  browserRuntime: JsonObject,
): ArtifactCertification {
  const summary = readJson(join(input.path, 'summary.json'));
  const stalls = readJson(join(input.path, 'browser-stalls.json'));
  const perRun = arrayValue(summary.perRun);
  const stallRuns = arrayValue(stalls);
  const uploadTotals = perRun.map((entry) => {
    const run = objectValue(entry);
    const browserStalls = objectValue(run.browserStalls);
    return numberValue(browserStalls.webglTextureUploadTotalDurationMs);
  });
  const uploadMaxima = perRun.map((entry) => {
    const run = objectValue(entry);
    const browserStalls = objectValue(run.browserStalls);
    return numberValue(browserStalls.webglTextureUploadMaxDurationMs);
  });
  const longTaskMaxima = perRun.map((entry) => {
    const run = objectValue(entry);
    const browserStalls = objectValue(run.browserStalls);
    return numberValue(browserStalls.longTaskMaxDurationMs);
  });
  const topUploads = stallRuns.flatMap((entry) => {
    const run = objectValue(entry);
    const browserStalls = objectValue(run.browserStalls);
    const recent = objectValue(browserStalls.recent);
    return arrayValue(recent.webglTextureUploadTop).map((upload) => {
      const uploadObject = objectValue(upload);
      return {
        sourceUrl: stringValue(uploadObject.sourceUrl, 'unknown'),
        width: numberValue(uploadObject.width),
        height: numberValue(uploadObject.height),
        durationMs: round(numberValue(uploadObject.duration)),
      };
    });
  }).sort((a, b) => b.durationMs - a.durationMs).slice(0, 8);

  return {
    kind: input.kind,
    label: input.label,
    artifactPath: input.path,
    commitSha,
    mode: stringValue(summary.mode),
    artifactType: 'startup-ui',
    timingWindow: {
      runs: numberValue(summary.runs),
      averagesMs: objectValue(summary.averagesMs),
      perRun: perRun.map((entry) => objectValue(entry)),
    },
    warmupPolicy: {
      type: 'cold-retail-startup',
      warmup: 'none before timing; each run starts a fresh browser context against dist/',
    },
    measurementTrust: {
      status: 'diagnostic',
      reason: 'Startup UI captures do not use perf-capture measurement-trust probes.',
    },
    browserRuntime,
    instrumentation: {
      longTasks: true,
      longAnimationFrames: true,
      webglTextureUploadAttribution: true,
      cpuProfileCount: cpuProfileCount(input.path),
      rendererStats: false,
      sceneAttribution: false,
    },
    headline: {
      modeClickToPlayableAvgMs: numberValue(objectValue(summary.averagesMs).modeClickToPlayable),
      deployClickToPlayableAvgMs: numberValue(objectValue(summary.averagesMs).deployClickToPlayable),
      maxLongTaskMs: Math.max(...longTaskMaxima),
      maxWebglUploadMs: round(Math.max(...uploadMaxima)),
      totalWebglUploadMsRange: uploadTotals.length > 0
        ? [round(Math.min(...uploadTotals)), round(Math.max(...uploadTotals))]
        : [],
      topUploads,
    },
    requiredFiles: {
      summary: fileExists(input.path, 'summary.json'),
      startupMarks: fileExists(input.path, 'startup-marks.json'),
      browserStalls: fileExists(input.path, 'browser-stalls.json'),
      console: fileExists(input.path, 'console.json'),
      cpuProfiles: cpuProfileCount(input.path) > 0,
    },
    notes: [
      'Use for startup and upload attribution, not for steady-state frame regression decisions.',
      'WebGL upload wrapping is diagnostic instrumentation and can affect startup timings.',
    ],
  };
}

function buildPerfCertification(
  input: ArtifactInput,
  commitSha: string,
  browserRuntime: JsonObject,
): ArtifactCertification {
  const summary = readJson(join(input.path, 'summary.json'));
  const validation = readJson(join(input.path, 'validation.json'));
  const measurementTrust = readJson(join(input.path, 'measurement-trust.json'));
  const samples = arrayValue(readJson(join(input.path, 'runtime-samples.json')));
  const lastSample = objectValue(samples.at(-1));
  const sceneAttribution = arrayValue(readJson(join(input.path, 'scene-attribution.json')));
  const browserStalls = objectValue(lastSample.browserStalls);
  const browserTotals = objectValue(browserStalls.totals);
  const scenario = objectValue(summary.scenario);
  const warmupByKind: Record<ArtifactKind, number> = {
    combat120: 15,
    'openfrontier-short': 20,
    'ashau-short': 20,
    'startup-open-frontier': 0,
    'startup-zone-control': 0,
    'grenade-spike': 0,
  };
  const visibleTriangles = sceneAttribution.reduce(
    (sum, entry) => sum + numberValue(objectValue(entry).visibleTriangles),
    0,
  );
  const unattributedVisibleTriangles = sceneAttribution.reduce((sum, entry) => {
    const bucket = stringValue(objectValue(entry).bucket);
    return bucket.includes('unattributed')
      ? sum + numberValue(objectValue(entry).visibleTriangles)
      : sum;
  }, 0);

  return {
    kind: input.kind,
    label: input.label,
    artifactPath: input.path,
    commitSha,
    mode: stringValue(scenario.mode, stringValue(scenario.requestedMode)),
    artifactType: 'perf-capture',
    timingWindow: {
      durationSeconds: numberValue(summary.durationSeconds),
      sampleIntervalMs: numberValue(measurementTrust.sampleIntervalMs),
      detailEverySamples: numberValue(measurementTrust.detailEverySamples),
      runtimeSampleCount: samples.length,
    },
    warmupPolicy: {
      warmupSeconds: warmupByKind[input.kind],
      prewarmEnabled: objectValue(summary.toolchain).prewarmEnabled ?? null,
      runtimePreflightEnabled: objectValue(summary.toolchain).runtimePreflightEnabled ?? null,
    },
    measurementTrust: {
      status: stringValue(measurementTrust.status),
      summary: stringValue(measurementTrust.summary),
      probeRoundTripAvgMs: round(numberValue(measurementTrust.probeRoundTripAvgMs)),
      probeRoundTripP95Ms: round(numberValue(measurementTrust.probeRoundTripP95Ms)),
      missedSampleRate: numberValue(measurementTrust.missedSampleRate),
      validationOverall: stringValue(validation.overall),
    },
    browserRuntime,
    instrumentation: {
      longTasks: Boolean(objectValue(browserStalls.support).longtask),
      longAnimationFrames: Boolean(objectValue(browserStalls.support).longAnimationFrame),
      webglTextureUploadAttribution: false,
      cpuProfileCount: cpuProfileCount(input.path),
      rendererStats: Boolean(lastSample.renderer),
      sceneAttribution: true,
      chromeTrace: fileExists(input.path, 'chrome-trace.json'),
    },
    headline: {
      status: stringValue(summary.status),
      avgFrameMs: round(numberValue(lastSample.avgFrameMs)),
      p95FrameMs: round(numberValue(lastSample.p95FrameMs)),
      p99FrameMs: round(numberValue(lastSample.p99FrameMs)),
      maxFrameMs: round(numberValue(lastSample.maxFrameMs)),
      hitch50Count: numberValue(lastSample.hitch50Count),
      finalFrameCount: numberValue(summary.finalFrameCount),
      renderer: objectValue(lastSample.renderer),
      longTaskCount: numberValue(browserTotals.longTaskCount),
      longTaskMaxDurationMs: round(numberValue(browserTotals.longTaskMaxDurationMs)),
      longAnimationFrameCount: numberValue(browserTotals.longAnimationFrameCount),
      longAnimationFrameMaxDurationMs: round(numberValue(browserTotals.longAnimationFrameMaxDurationMs)),
      visibleTriangles,
      unattributedVisibleTriangles,
      unattributedVisibleTrianglePercent: visibleTriangles > 0
        ? round((unattributedVisibleTriangles / visibleTriangles) * 100)
        : null,
    },
    requiredFiles: {
      summary: fileExists(input.path, 'summary.json'),
      validation: fileExists(input.path, 'validation.json'),
      measurementTrust: fileExists(input.path, 'measurement-trust.json'),
      runtimeSamples: fileExists(input.path, 'runtime-samples.json'),
      sceneAttribution: fileExists(input.path, 'scene-attribution.json'),
      console: fileExists(input.path, 'console.json'),
      finalFrame: fileExists(input.path, 'final-frame.png'),
    },
    notes: [
      stringValue(measurementTrust.status) === 'pass'
        ? 'Measurement path passed harness-overhead trust checks.'
        : 'Measurement path is not trusted for regression conclusions; use as blocked evidence only.',
      'WebGL texture-upload attribution is intentionally off for steady-state captures.',
    ],
  };
}

function buildGrenadeCertification(
  input: ArtifactInput,
  commitSha: string,
  browserRuntime: JsonObject,
): ArtifactCertification {
  const summary = readJson(join(input.path, 'summary.json'));
  const options = objectValue(summary.options);
  const baseline = objectValue(objectValue(summary.baseline).frame);
  const detonation = objectValue(objectValue(summary.detonation).frame);
  const detonationSnapshot = readJson(join(input.path, 'detonation-snapshot.json'));
  const browserStalls = objectValue(detonationSnapshot.browserStalls);
  const browserTotals = objectValue(browserStalls.totals);

  return {
    kind: input.kind,
    label: input.label,
    artifactPath: input.path,
    commitSha,
    mode: stringValue(options.mode),
    artifactType: 'grenade-spike',
    timingWindow: {
      baseline: objectValue(objectValue(summary.windows).baseline),
      detonation: objectValue(objectValue(summary.windows).detonation),
      baselineFrame: baseline,
      detonationFrame: detonation,
    },
    warmupPolicy: {
      warmupMs: numberValue(options.warmupMs),
      baselineMs: numberValue(options.baselineMs),
      postMs: numberValue(options.postMs),
      baselineFrames: numberValue(options.baselineFrames),
      postFrames: numberValue(options.postFrames),
      grenadeCount: numberValue(options.grenadeCount),
      grenadeIntervalMs: numberValue(options.grenadeIntervalMs),
      npcs: numberValue(options.npcs),
    },
    measurementTrust: {
      status: 'diagnostic',
      reason: stringValue(summary.measurementCaveat),
    },
    browserRuntime,
    instrumentation: {
      longTasks: Boolean(objectValue(browserStalls.support).longtask),
      longAnimationFrames: Boolean(objectValue(browserStalls.support).longAnimationFrame),
      webglTextureUploadAttribution: false,
      cpuProfileCount: cpuProfileCount(input.path),
      rendererStats: Boolean(objectValue(summary.baseline).renderer && objectValue(summary.detonation).renderer),
      sceneAttribution: false,
    },
    headline: {
      baselineP95FrameMs: round(numberValue(baseline.p95FrameMs)),
      baselineP99FrameMs: round(numberValue(baseline.p99FrameMs)),
      baselineMaxFrameMs: round(numberValue(baseline.maxFrameMs)),
      detonationP95FrameMs: round(numberValue(detonation.p95FrameMs)),
      detonationP99FrameMs: round(numberValue(detonation.p99FrameMs)),
      detonationMaxFrameMs: round(numberValue(detonation.maxFrameMs)),
      deltas: objectValue(summary.deltas),
      renderer: {
        baseline: objectValue(objectValue(summary.baseline).renderer),
        detonation: objectValue(objectValue(summary.detonation).renderer),
      },
      longTaskCount: numberValue(browserTotals.longTaskCount),
      longTaskMaxDurationMs: round(numberValue(browserTotals.longTaskMaxDurationMs)),
      longAnimationFrameCount: numberValue(browserTotals.longAnimationFrameCount),
      longAnimationFrameMaxDurationMs: round(numberValue(browserTotals.longAnimationFrameMaxDurationMs)),
      grenadeUserTiming: objectValue(objectValue(summary.detonation).userTiming),
    },
    requiredFiles: {
      summary: fileExists(input.path, 'summary.json'),
      baselineSnapshot: fileExists(input.path, 'baseline-snapshot.json'),
      detonationSnapshot: fileExists(input.path, 'detonation-snapshot.json'),
      console: fileExists(input.path, 'console.json'),
      cpuProfile: fileExists(input.path, 'cpu-profile.cpuprofile'),
    },
    notes: [
      'Use as low-load first-use attribution evidence, not as a steady-state perf baseline.',
      'Texture-upload observer is disabled by this probe to avoid contaminating runtime frames.',
    ],
  };
}

function certificationFor(
  input: ArtifactInput,
  commitSha: string,
  browserRuntime: JsonObject,
): ArtifactCertification {
  if (input.kind === 'startup-open-frontier' || input.kind === 'startup-zone-control') {
    return buildStartupCertification(input, commitSha, browserRuntime);
  }
  if (input.kind === 'grenade-spike') {
    return buildGrenadeCertification(input, commitSha, browserRuntime);
  }
  return buildPerfCertification(input, commitSha, browserRuntime);
}

function reportStatus(certifications: ArtifactCertification[]): BundleReport['status'] {
  if (certifications.some((entry) => {
    return Object.values(entry.requiredFiles).some((exists) => !exists);
  })) {
    return 'fail';
  }
  if (certifications.some((entry) => {
    return stringValue(entry.measurementTrust.status) !== 'pass'
      && entry.artifactType === 'perf-capture';
  })) {
    return 'warn';
  }
  return certifications.some((entry) => entry.artifactType !== 'perf-capture')
    ? 'warn'
    : 'pass';
}

async function main(): Promise<void> {
  const inputs = parseInputs();
  const commitSha = gitSha();
  const browserRuntime = await browserRuntimeMetadata();
  const certifications = inputs.map((input) => {
    const certification = certificationFor(input, commitSha, browserRuntime);
    writeSidecar(input.path, certification);
    return certification;
  });
  const trustedSteadyStateCaptures = certifications
    .filter((entry) => entry.artifactType === 'perf-capture')
    .filter((entry) => stringValue(entry.measurementTrust.status) === 'pass')
    .map((entry) => entry.label);
  const untrustedOrDiagnosticCaptures = certifications
    .filter((entry) => entry.artifactType !== 'perf-capture'
      || stringValue(entry.measurementTrust.status) !== 'pass')
    .map((entry) => entry.label);
  const blockers = certifications.flatMap((entry) => {
    if (entry.kind === 'combat120' && stringValue(entry.measurementTrust.status) !== 'pass') {
      return [
        'combat120 measurement trust failed; do not use its frame-time numbers for regression decisions.',
      ];
    }
    if (entry.kind === 'grenade-spike' && numberValue(entry.headline.longTaskMaxDurationMs) > 50) {
      return [
        'grenade-spike still reproduces a trigger-adjacent browser stall above 50ms.',
      ];
    }
    return [];
  });

  const report: BundleReport = {
    createdAt: new Date().toISOString(),
    source: 'Projekt Objekt-143 Phase 2 / Cycle 1 benchmark bundle certification',
    status: reportStatus(certifications),
    commitSha,
    localBuildManifests: {
      retailGitSha: readManifestSha('dist/asset-manifest.json'),
      perfGitSha: readManifestSha('dist-perf/asset-manifest.json'),
    },
    browserRuntime,
    acceptance: {
      trustedSteadyStateCaptures,
      untrustedOrDiagnosticCaptures,
      blockers,
    },
    artifacts: certifications,
  };

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'projekt-143-cycle1-benchmark-bundle');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'bundle-summary.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(`Projekt Objekt-143 Cycle 1 benchmark bundle wrote ${outputPath}`);
  console.log(`status=${report.status}`);
  console.log(`trusted=${trustedSteadyStateCaptures.join(', ') || 'none'}`);
  console.log(`untrustedOrDiagnostic=${untrustedOrDiagnosticCaptures.join(', ') || 'none'}`);
  for (const blocker of blockers) {
    console.log(`BLOCKER ${blocker}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
