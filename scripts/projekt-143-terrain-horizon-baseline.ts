#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import sharp from 'sharp';
import { parseServerModeArg, startServer, stopServer, type ServerHandle } from './preview-server';

type CheckStatus = 'pass' | 'warn' | 'fail';
type ViewKind = 'horizon-elevated' | 'horizon-high-oblique';

type ViewPlan = {
  kind: ViewKind;
  heightAGL: number;
  yawDeg: number;
  pitchDeg: number;
  settleFrames: number;
};

type ScenarioPlan = {
  key: 'openfrontier' | 'ashau';
  mode: 'open_frontier' | 'a_shau_valley';
  description: string;
  settleSec: number;
  views: ViewPlan[];
};

type RendererInfo = {
  drawCalls?: number;
  triangles?: number;
  geometries?: number;
  textures?: number;
  programs?: number;
};

type TerrainMetrics = {
  hasTerrainAtCamera?: boolean | null;
  areaReadyAtCamera?: boolean | null;
  activeTerrainTiles?: number | null;
  vegetationActiveTotal?: number | null;
  billboardDebug?: Record<string, unknown> | null;
};

type ShotMetrics = {
  view: ViewKind;
  camera: { x: number; y: number; z: number };
  terrainY: number;
  terrain: TerrainMetrics | null;
  atmosphere: Record<string, unknown> | null;
  rendererInfo: RendererInfo | null;
  renderText: string | null;
};

type ImageBandMetrics = {
  lumaMean: number;
  lumaStdDev: number;
  greenDominanceRatio: number;
  edgeContrast: number;
};

type ImageMetrics = {
  width: number;
  height: number;
  farBand: ImageBandMetrics;
  groundBand: ImageBandMetrics;
};

type ValidationCheck = {
  id: string;
  status: CheckStatus;
  value: unknown;
  message: string;
};

type PerfSummary = {
  startedAt?: string;
  durationSeconds?: number;
  scenario?: { mode?: string };
  validation?: {
    overall?: CheckStatus;
    checks?: Array<{ id?: string; status?: CheckStatus; value?: unknown; message?: string }>;
  };
  measurementTrust?: {
    status?: CheckStatus;
    probeRoundTripAvgMs?: number;
    probeRoundTripP95Ms?: number;
    missedSampleRate?: number;
    sampleCount?: number;
  };
  sceneAttribution?: Array<{
    category?: string;
    drawCallLike?: number;
    triangles?: number;
    visibleTriangles?: number;
  }>;
};

type RuntimeSample = {
  p95FrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  renderer?: RendererInfo;
};

type CullingProof = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus; flags?: Record<string, unknown> };
  rendererInfo?: RendererInfo | null;
  files?: {
    summary?: string;
    sceneAttribution?: string;
    rendererInfo?: string;
    cpuProfile?: string | null;
    screenshot?: string;
  };
};

type HorizonAudit = {
  createdAt?: string;
  summary?: {
    flaggedModes?: number;
    largestBareTerrainBandMeters?: number;
    largestBareTerrainBandMode?: string | null;
    maxRegistryVegetationDistanceMeters?: number;
  };
};

type PerfBaselineDigest = {
  path: string | null;
  mode: string;
  status: CheckStatus;
  startedAt: string | null;
  durationSeconds: number | null;
  validationOverall: CheckStatus | null;
  measurementTrustStatus: CheckStatus | null;
  probeRoundTripAvgMs: number | null;
  probeRoundTripP95Ms: number | null;
  missedSampleRate: number | null;
  sampleCount: number | null;
  avgFrameMs: number | null;
  peakP95FrameMs: number | null;
  peakP99FrameMs: number | null;
  peakMaxFrameMs: number | null;
  maxDrawCalls: number | null;
  maxTriangles: number | null;
  drawCallAfterCeiling10Percent: number | null;
  p95AfterCeilingPlus1p5Ms: number | null;
  sceneAttributionPath: string | null;
  sceneCategories: Array<{
    category: string;
    drawCallLike: number | null;
    visibleTriangles: number | null;
  }>;
};

type TerrainBaselineSummary = {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  mode: 'projekt-143-terrain-horizon-baseline';
  status: CheckStatus;
  url: string;
  serverMode: string;
  browser: {
    headless: boolean;
    version: string | null;
    userAgent: string | null;
  };
  viewport: { width: number; height: number };
  warmupPolicy: {
    modeSettleSeconds: Record<string, number>;
    renderSettleFramesPerShot: number;
    cameraPolicy: string;
    buildPolicy: string;
  };
  files: {
    summary: string;
    markdown: string;
  };
  inputs: {
    horizonAudit: string | null;
    cullingProof: string | null;
    openFrontierPerfSummary: string | null;
    aShauPerfSummary: string | null;
  };
  performanceBaselines: {
    openFrontier: PerfBaselineDigest;
    aShau: PerfBaselineDigest;
  };
  horizonAudit: {
    status: CheckStatus;
    largestBareTerrainBandMeters: number | null;
    largestBareTerrainBandMode: string | null;
    maxRegistryVegetationDistanceMeters: number | null;
  };
  cullingTelemetry: {
    status: CheckStatus;
    measurementTrustStatus: CheckStatus | null;
    rendererInfo: RendererInfo | null;
    files: CullingProof['files'] | null;
  };
  scenarios: Array<{
    key: string;
    mode: string;
    description: string;
    shots: Array<{
      kind: ViewKind;
      file: string;
      metrics: ShotMetrics;
      imageMetrics: ImageMetrics;
    }>;
    browserErrors: string[];
    browserWarnings: string[];
    pageErrors: string[];
    error?: string;
  }>;
  measurementTrust: {
    status: CheckStatus;
    flags: Record<string, unknown>;
    checks: ValidationCheck[];
    summary: string;
  };
  checks: ValidationCheck[];
  openItems: string[];
  nonClaims: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-terrain-horizon-baseline';
const DEFAULT_PORT = 9238;
const STARTUP_TIMEOUT_MS = 120_000;
const VIEWPORT = { width: 1600, height: 900 };

function argValue(name: string): string | undefined {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function gitStatusShort(): string[] {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parsePort(): number {
  const raw = argValue('--port');
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --port value: ${raw}`);
  }
  return parsed;
}

function shouldBuild(): boolean {
  return !process.argv.includes('--no-build');
}

function isHeaded(): boolean {
  return process.argv.includes('--headed');
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function relRequired(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function walkFiles(root: string, predicate: (path: string) => boolean, results: string[] = []): string[] {
  if (!existsSync(root)) return results;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, predicate, results);
    } else if (predicate(path)) {
      results.push(path);
    }
  }
  return results;
}

function latestFile(root: string, predicate: (path: string) => boolean): string | null {
  const files = walkFiles(root, predicate);
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function latestPerfSummaryForMode(mode: string): string | null {
  return latestFile(ARTIFACT_ROOT, (path) => {
    if (!path.endsWith('summary.json')) return false;
    try {
      const summary = readJson<PerfSummary>(path);
      return summary.scenario?.mode === mode && existsSync(join(path, '..', 'runtime-samples.json'));
    } catch {
      return false;
    }
  });
}

function getValidationValue(summary: PerfSummary | null, id: string): number | null {
  const value = summary?.validation?.checks?.find((check) => check.id === id)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function numericMax(values: Array<number | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length > 0 ? Number(Math.max(...finite).toFixed(3)) : null;
}

function perfBaselineDigest(path: string | null, mode: string): PerfBaselineDigest {
  if (!path) {
    return {
      path: null,
      mode,
      status: 'fail',
      startedAt: null,
      durationSeconds: null,
      validationOverall: null,
      measurementTrustStatus: null,
      probeRoundTripAvgMs: null,
      probeRoundTripP95Ms: null,
      missedSampleRate: null,
      sampleCount: null,
      avgFrameMs: null,
      peakP95FrameMs: null,
      peakP99FrameMs: null,
      peakMaxFrameMs: null,
      maxDrawCalls: null,
      maxTriangles: null,
      drawCallAfterCeiling10Percent: null,
      p95AfterCeilingPlus1p5Ms: null,
      sceneAttributionPath: null,
      sceneCategories: [],
    };
  }

  const summary = readJson<PerfSummary>(path);
  const samplesPath = join(path, '..', 'runtime-samples.json');
  const sceneAttributionPath = join(path, '..', 'scene-attribution.json');
  const samples = existsSync(samplesPath) ? readJson<RuntimeSample[]>(samplesPath) : [];
  const peakP95FrameMs = numericMax(samples.map((sample) => sample.p95FrameMs));
  const maxDrawCalls = numericMax(samples.map((sample) => sample.renderer?.drawCalls));
  const maxTriangles = numericMax(samples.map((sample) => sample.renderer?.triangles));
  const trusted = summary.measurementTrust?.status === 'pass';
  const hasRendererStats = maxDrawCalls !== null && maxTriangles !== null;
  const hasSceneAttribution = existsSync(sceneAttributionPath) && (summary.sceneAttribution?.length ?? 0) > 0;

  return {
    path: rel(path),
    mode,
    status: trusted && hasRendererStats && hasSceneAttribution ? 'pass' : 'fail',
    startedAt: summary.startedAt ?? null,
    durationSeconds: typeof summary.durationSeconds === 'number' ? summary.durationSeconds : null,
    validationOverall: summary.validation?.overall ?? null,
    measurementTrustStatus: summary.measurementTrust?.status ?? null,
    probeRoundTripAvgMs: typeof summary.measurementTrust?.probeRoundTripAvgMs === 'number'
      ? Number(summary.measurementTrust.probeRoundTripAvgMs.toFixed(3))
      : null,
    probeRoundTripP95Ms: typeof summary.measurementTrust?.probeRoundTripP95Ms === 'number'
      ? Number(summary.measurementTrust.probeRoundTripP95Ms.toFixed(3))
      : null,
    missedSampleRate: typeof summary.measurementTrust?.missedSampleRate === 'number'
      ? Number(summary.measurementTrust.missedSampleRate.toFixed(5))
      : null,
    sampleCount: typeof summary.measurementTrust?.sampleCount === 'number'
      ? summary.measurementTrust.sampleCount
      : null,
    avgFrameMs: getValidationValue(summary, 'avg_frame_ms'),
    peakP95FrameMs,
    peakP99FrameMs: numericMax(samples.map((sample) => sample.p99FrameMs)),
    peakMaxFrameMs: numericMax(samples.map((sample) => sample.maxFrameMs)),
    maxDrawCalls,
    maxTriangles,
    drawCallAfterCeiling10Percent: maxDrawCalls !== null ? Math.ceil(maxDrawCalls * 1.1) : null,
    p95AfterCeilingPlus1p5Ms: peakP95FrameMs !== null ? Number((peakP95FrameMs + 1.5).toFixed(3)) : null,
    sceneAttributionPath: existsSync(sceneAttributionPath) ? rel(sceneAttributionPath) : null,
    sceneCategories: (summary.sceneAttribution ?? [])
      .filter((entry) => ['terrain', 'vegetation_imposters', 'world_static_features', 'fixed_wing_aircraft', 'helicopters', 'npc_close_glb'].includes(String(entry.category)))
      .map((entry) => ({
        category: String(entry.category),
        drawCallLike: typeof entry.drawCallLike === 'number' ? entry.drawCallLike : null,
        visibleTriangles: typeof entry.visibleTriangles === 'number' ? entry.visibleTriangles : null,
      })),
  };
}

function plans(): ScenarioPlan[] {
  return [
    {
      key: 'openfrontier',
      mode: 'open_frontier',
      description: 'Open Frontier elevated vegetation horizon baseline',
      settleSec: 6,
      views: [
        { kind: 'horizon-elevated', heightAGL: 520, yawDeg: 135, pitchDeg: -18, settleFrames: 10 },
        { kind: 'horizon-high-oblique', heightAGL: 900, yawDeg: 135, pitchDeg: -28, settleFrames: 12 },
      ],
    },
    {
      key: 'ashau',
      mode: 'a_shau_valley',
      description: 'A Shau elevated vegetation horizon baseline',
      settleSec: 8,
      views: [
        { kind: 'horizon-elevated', heightAGL: 800, yawDeg: 135, pitchDeg: -18, settleFrames: 12 },
        { kind: 'horizon-high-oblique', heightAGL: 1400, yawDeg: 135, pitchDeg: -28, settleFrames: 14 },
      ],
    },
  ];
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as any).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startMode(page: Page, mode: string): Promise<void> {
  await page.evaluate(async (selectedMode: string) => {
    const engine = (window as any).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(selectedMode);
  }, mode);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const engine = (window as any).__engine;
      return {
        gameStarted: Boolean(engine?.gameStarted),
        phase: String(engine?.startupFlow?.getState?.()?.phase ?? ''),
        mode: String(engine?.systemManager?.gameModeManager?.getCurrentMode?.() ?? ''),
      };
    });
    if ((state.gameStarted || state.phase === 'live') && state.mode === mode) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Mode ${mode} did not enter live phase`);
}

async function dismissBriefingIfPresent(page: Page): Promise<void> {
  const beginBtn = page.locator('[data-ref="beginBtn"]');
  try {
    if (await beginBtn.isVisible({ timeout: 1500 })) {
      await beginBtn.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // Briefing is absent in several automated modes.
  }
}

async function hideUi(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });
}

async function poseAndRender(page: Page, view: ViewPlan): Promise<ShotMetrics> {
  return page.evaluate(
    ({ p, vp }: { p: ViewPlan; vp: { width: number; height: number } }) => {
      const engine = (window as any).__engine;
      const renderer = engine?.renderer;
      const camera = renderer?.camera;
      const threeRenderer = renderer?.renderer;
      const scene = renderer?.scene;
      const post = renderer?.postProcessing;
      const terrain = engine?.systemManager?.terrainSystem;
      const billboards = engine?.systemManager?.globalBillboardSystem;
      const playerController = engine?.systemManager?.playerController;
      const atmosphere = engine?.systemManager?.atmosphereSystem;
      if (!engine || !camera || !threeRenderer || !scene) {
        throw new Error('engine/camera/renderer/scene unavailable');
      }

      const playerPos = typeof playerController?.getPosition === 'function'
        ? playerController.getPosition()
        : null;
      const anchorX = Number(playerPos?.x ?? 0);
      const anchorZ = Number(playerPos?.z ?? 0);
      const terrainYRaw = terrain && typeof terrain.getHeightAt === 'function'
        ? Number(terrain.getHeightAt(anchorX, anchorZ))
        : 0;
      const terrainY = Number.isFinite(terrainYRaw) ? terrainYRaw : 0;

      engine.isLoopRunning = false;
      if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
        cancelAnimationFrame(engine.animationFrameId);
        engine.animationFrameId = null;
      }

      threeRenderer.setSize(vp.width, vp.height, true);
      if (post && typeof post.setSize === 'function') post.setSize(vp.width, vp.height);
      if (typeof camera.aspect === 'number') {
        camera.aspect = vp.width / vp.height;
        camera.updateProjectionMatrix?.();
      }

      camera.position.set(anchorX, terrainY + p.heightAGL, anchorZ);
      camera.rotation.order = 'YXZ';
      camera.rotation.set((p.pitchDeg * Math.PI) / 180, (p.yawDeg * Math.PI) / 180, 0);
      camera.updateMatrixWorld(true);

      terrain?.updatePlayerPosition?.(camera.position);
      for (let i = 0; i < p.settleFrames; i++) {
        terrain?.update?.(0.016);
        billboards?.update?.(0.016, renderer?.fog ?? null);
      }

      atmosphere?.syncDomePosition?.(camera.position);
      atmosphere?.setTerrainYAtCamera?.(terrainY);
      atmosphere?.update?.(0.25);

      if (post && typeof post.beginFrame === 'function') post.beginFrame();
      threeRenderer.render(scene, camera);
      if (post && typeof post.endFrame === 'function') post.endFrame();

      const fog = renderer?.fog;
      const preset = atmosphere?.getCurrentPreset?.();
      const billboardDebug = billboards?.getDebugInfo?.() ?? null;
      const vegetationActiveTotal = billboardDebug && typeof billboardDebug === 'object'
        ? Object.entries(billboardDebug as Record<string, number>)
          .filter(([key]) => key.endsWith('Active'))
          .reduce((sum, [, value]) => sum + (Number.isFinite(value) ? value : 0), 0)
        : null;
      const terrainMetrics = terrain
        ? {
          hasTerrainAtCamera: typeof terrain.hasTerrainAt === 'function'
            ? Boolean(terrain.hasTerrainAt(camera.position.x, camera.position.z))
            : null,
          areaReadyAtCamera: typeof terrain.isAreaReadyAt === 'function'
            ? Boolean(terrain.isAreaReadyAt(camera.position.x, camera.position.z))
            : null,
          activeTerrainTiles: typeof terrain.getActiveTerrainTileCount === 'function'
            ? terrain.getActiveTerrainTileCount()
            : null,
          vegetationActiveTotal,
          billboardDebug,
        }
        : null;
      const rendererInfo = typeof (window as any).__rendererInfo === 'function'
        ? (window as any).__rendererInfo()
        : null;
      const renderText = typeof (window as any).render_game_to_text === 'function'
        ? (window as any).render_game_to_text()
        : null;

      return {
        view: p.kind,
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        terrainY,
        terrain: terrainMetrics,
        atmosphere: {
          scenario: atmosphere?.getCurrentScenario?.() ?? null,
          presetLabel: preset?.label ?? null,
          fogDensity: fog?.density ?? null,
          fogColorHex: fog?.color?.getHexString?.() ?? null,
        },
        rendererInfo,
        renderText,
      };
    },
    { p: view, vp: VIEWPORT }
  );
}

async function imageBandMetrics(file: string, topRatio: number, heightRatio: number): Promise<ImageBandMetrics> {
  const source = sharp(file);
  const metadata = await source.metadata();
  const width = metadata.width ?? VIEWPORT.width;
  const height = metadata.height ?? VIEWPORT.height;
  const top = Math.max(0, Math.min(height - 1, Math.floor(height * topRatio)));
  const bandHeight = Math.max(1, Math.min(height - top, Math.floor(height * heightRatio)));
  const { data, info } = await source
    .extract({ left: 0, top, width, height: bandHeight })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let sumSq = 0;
  let greenDominant = 0;
  let edgeContrastSum = 0;
  let edgeContrastCount = 0;
  const count = Math.max(1, info.width * info.height);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luma;
      sumSq += luma * luma;
      if (g > r * 1.04 && g > b * 1.04 && luma > 18 && luma < 235) greenDominant++;
      if (x >= 8) {
        const prevIdx = (y * info.width + (x - 8)) * info.channels;
        const prev = 0.2126 * data[prevIdx] + 0.7152 * data[prevIdx + 1] + 0.0722 * data[prevIdx + 2];
        edgeContrastSum += Math.abs(luma - prev);
        edgeContrastCount++;
      }
    }
  }
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return {
    lumaMean: Number(mean.toFixed(2)),
    lumaStdDev: Number(Math.sqrt(variance).toFixed(2)),
    greenDominanceRatio: Number((greenDominant / count).toFixed(4)),
    edgeContrast: Number((edgeContrastSum / Math.max(1, edgeContrastCount)).toFixed(2)),
  };
}

async function analyzeImage(file: string): Promise<ImageMetrics> {
  const metadata = await sharp(file).metadata();
  return {
    width: metadata.width ?? VIEWPORT.width,
    height: metadata.height ?? VIEWPORT.height,
    farBand: await imageBandMetrics(file, 0.42, 0.18),
    groundBand: await imageBandMetrics(file, 0.62, 0.28),
  };
}

function hasVisibleTerrainBand(metrics: ImageBandMetrics): boolean {
  if (metrics.lumaMean >= 252) return false;
  return metrics.edgeContrast > 0.5 || metrics.lumaStdDev > 8 || metrics.greenDominanceRatio > 0.01;
}

async function captureScenario(page: Page, outputDir: string, plan: ScenarioPlan) {
  await startMode(page, plan.mode);
  await dismissBriefingIfPresent(page);
  await page.waitForTimeout(plan.settleSec * 1000);
  await hideUi(page);

  const shots: Array<{ kind: ViewKind; file: string; metrics: ShotMetrics; imageMetrics: ImageMetrics }> = [];
  for (const view of plan.views) {
    const metrics = await poseAndRender(page, view);
    const file = join(outputDir, `${plan.key}-${view.kind}.png`);
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    writeFileSync(file, buffer);
    shots.push({
      kind: view.kind,
      file: relRequired(file),
      metrics,
      imageMetrics: await analyzeImage(file),
    });
  }

  await page.evaluate(() => {
    const engine = (window as any).__engine;
    engine?.start?.();
  });

  return {
    key: plan.key,
    mode: plan.mode,
    description: plan.description,
    shots,
  };
}

function makeCheck(id: string, passed: boolean, value: unknown, message: string, warn = false): ValidationCheck {
  return {
    id,
    status: passed ? 'pass' : (warn ? 'warn' : 'fail'),
    value,
    message,
  };
}

function statusFromChecks(checks: ValidationCheck[]): CheckStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function writeMarkdown(summary: TerrainBaselineSummary, path: string): void {
  const lines = [
    '# Projekt Objekt-143 Terrain Horizon Baseline',
    '',
    `Generated: ${summary.createdAt}`,
    `Source SHA: ${summary.sourceGitSha}`,
    `Source status entries: ${summary.sourceGitStatus.length}`,
    `Status: ${summary.status.toUpperCase()}`,
    `Server mode: ${summary.serverMode}`,
    `Browser: ${summary.browser.headless ? 'headless' : 'headed'} ${summary.browser.version ?? 'unknown'}`,
    '',
    '## Inputs',
    '',
    `- Horizon audit: ${summary.inputs.horizonAudit ?? 'missing'}`,
    `- Culling proof: ${summary.inputs.cullingProof ?? 'missing'}`,
    `- Open Frontier perf: ${summary.inputs.openFrontierPerfSummary ?? 'missing'}`,
    `- A Shau perf: ${summary.inputs.aShauPerfSummary ?? 'missing'}`,
    '',
    '## Screenshot Baselines',
    '',
    '| Scenario | Shot | File | Draw calls | Triangles | Vegetation active | Far-band green ratio |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...summary.scenarios.flatMap((scenario) =>
      scenario.shots.map((shot) =>
        `| ${scenario.mode} | ${shot.kind} | ${shot.file} | ${shot.metrics.rendererInfo?.drawCalls ?? 'n/a'} | ${shot.metrics.rendererInfo?.triangles ?? 'n/a'} | ${shot.metrics.terrain?.vegetationActiveTotal ?? 'n/a'} | ${shot.imageMetrics.farBand.greenDominanceRatio} |`
      )
    ),
    '',
    '## Perf Budgets From Current Before Captures',
    '',
    `- Open Frontier p95 after ceiling: ${summary.performanceBaselines.openFrontier.p95AfterCeilingPlus1p5Ms ?? 'n/a'}ms; draw-call after ceiling: ${summary.performanceBaselines.openFrontier.drawCallAfterCeiling10Percent ?? 'n/a'}`,
    `- A Shau p95 after ceiling: ${summary.performanceBaselines.aShau.p95AfterCeilingPlus1p5Ms ?? 'n/a'}ms; draw-call after ceiling: ${summary.performanceBaselines.aShau.drawCallAfterCeiling10Percent ?? 'n/a'}`,
    '',
    '## Checks',
    '',
    ...summary.checks.map((check) => `- ${check.status.toUpperCase()} ${check.id}: ${check.message}`),
    '',
    '## Open Items',
    '',
    ...summary.openItems.map((item) => `- ${item}`),
    '',
    '## Non Claims',
    '',
    ...summary.nonClaims.map((item) => `- ${item}`),
    '',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

async function capture(browser: Browser, url: string, outputDir: string, plan: ScenarioPlan) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const browserErrors: string[] = [];
  const browserWarnings: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') browserErrors.push(text);
    if (msg.type() === 'warning') browserWarnings.push(text);
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
    await waitForEngine(page);
    return {
      ...await captureScenario(page, outputDir, plan),
      browserErrors,
      browserWarnings,
      pageErrors,
    };
  } catch (error) {
    return {
      key: plan.key,
      mode: plan.mode,
      description: plan.description,
      shots: [],
      browserErrors,
      browserWarnings,
      pageErrors,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const summaryPath = join(outputDir, 'summary.json');
  const markdownPath = join(outputDir, 'summary.md');
  const port = parsePort();
  const serverMode = parseServerModeArg(process.argv, 'perf');
  const url = `http://127.0.0.1:${port}/?perf=1&diag=1&uiTransitions=0&logLevel=warn`;
  const headless = !isHeaded();

  const horizonPath = latestFile(ARTIFACT_ROOT, (path) => path.endsWith(join('vegetation-horizon-audit', 'horizon-audit.json')));
  const cullingPath = latestFile(ARTIFACT_ROOT, (path) => path.endsWith(join('projekt-143-culling-proof', 'summary.json')));
  const openFrontierPerfPath = latestPerfSummaryForMode('open_frontier');
  const aShauPerfPath = latestPerfSummaryForMode('a_shau_valley');
  const horizon = horizonPath ? readJson<HorizonAudit>(horizonPath) : null;
  const culling = cullingPath ? readJson<CullingProof>(cullingPath) : null;

  let server: ServerHandle | null = null;
  let browser: Browser | null = null;
  let browserVersion: string | null = null;
  let userAgent: string | null = null;
  const scenarios: TerrainBaselineSummary['scenarios'] = [];

  try {
    server = await startServer({
      mode: serverMode,
      port,
      buildIfMissing: true,
      forceBuild: shouldBuild() && serverMode !== 'dev',
      log: (message) => console.log(`[${new Date().toISOString()}] ${message}`),
    });
    browser = await chromium.launch({ headless });
    browserVersion = browser.version();
    const metaContext = await browser.newContext();
    const metaPage = await metaContext.newPage();
    userAgent = await metaPage.evaluate(() => navigator.userAgent);
    await metaContext.close();

    for (const plan of plans()) {
      scenarios.push(await capture(browser, url, outputDir, plan));
    }
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }

  const openFrontier = perfBaselineDigest(openFrontierPerfPath, 'open_frontier');
  const aShau = perfBaselineDigest(aShauPerfPath, 'a_shau_valley');
  const expectedShots = plans().reduce((sum, plan) => sum + plan.views.length, 0);
  const capturedShots = scenarios.reduce((sum, scenario) => sum + scenario.shots.length, 0);
  const rendererShots = scenarios.flatMap((scenario) => scenario.shots).filter((shot) =>
    (shot.metrics.rendererInfo?.drawCalls ?? 0) > 0 && (shot.metrics.rendererInfo?.triangles ?? 0) > 0
  ).length;
  const terrainShots = scenarios.flatMap((scenario) => scenario.shots).filter((shot) =>
    shot.metrics.terrain?.hasTerrainAtCamera !== false && (shot.metrics.terrain?.activeTerrainTiles ?? 0) > 0
  ).length;
  const vegetationShots = scenarios.flatMap((scenario) => scenario.shots).filter((shot) =>
    typeof shot.metrics.terrain?.vegetationActiveTotal === 'number'
  ).length;
  const terrainVisibleImageShots = scenarios.flatMap((scenario) => scenario.shots).filter((shot) =>
    hasVisibleTerrainBand(shot.imageMetrics.groundBand)
  ).length;
  const browserErrorCount = scenarios.reduce((sum, scenario) => sum + scenario.browserErrors.length + scenario.pageErrors.length + (scenario.error ? 1 : 0), 0);

  const checks: ValidationCheck[] = [
    makeCheck('elevated_screenshots_captured', capturedShots === expectedShots, `${capturedShots}/${expectedShots}`, `Captured ${capturedShots}/${expectedShots} elevated horizon screenshots.`),
    makeCheck('screenshot_renderer_stats', rendererShots === expectedShots, `${rendererShots}/${expectedShots}`, `Captured renderer draw-call/triangle stats for ${rendererShots}/${expectedShots} screenshots.`),
    makeCheck('screenshot_terrain_metrics', terrainShots === expectedShots, `${terrainShots}/${expectedShots}`, `Captured ready terrain metrics for ${terrainShots}/${expectedShots} screenshots.`),
    makeCheck('screenshot_vegetation_metrics', vegetationShots === expectedShots, `${vegetationShots}/${expectedShots}`, `Captured vegetation active counters for ${vegetationShots}/${expectedShots} screenshots.`),
    makeCheck('screenshot_visible_terrain_content', terrainVisibleImageShots === expectedShots, `${terrainVisibleImageShots}/${expectedShots}`, `Detected nonblank terrain/ground-band image content in ${terrainVisibleImageShots}/${expectedShots} screenshots.`),
    makeCheck('open_frontier_perf_baseline_trusted', openFrontier.status === 'pass', openFrontier.path, `Open Frontier perf baseline measurement=${openFrontier.measurementTrustStatus ?? 'missing'} renderer=${openFrontier.maxDrawCalls ?? 'missing'} draw calls.`),
    makeCheck('ashau_perf_baseline_trusted', aShau.status === 'pass', aShau.path, `A Shau perf baseline measurement=${aShau.measurementTrustStatus ?? 'missing'} renderer=${aShau.maxDrawCalls ?? 'missing'} draw calls.`),
    makeCheck('horizon_static_audit_present', Boolean(horizonPath), rel(horizonPath), 'Static vegetation horizon audit is available for bare-terrain band context.'),
    makeCheck('culling_renderer_telemetry_trusted', culling?.status === 'pass' && culling.measurementTrust?.status === 'pass' && Boolean(culling.rendererInfo?.drawCalls), rel(cullingPath), `Culling proof status=${culling?.status ?? 'missing'} measurement=${culling?.measurementTrust?.status ?? 'missing'}.`),
    makeCheck('browser_errors_clear', browserErrorCount === 0, browserErrorCount, `Captured ${browserErrorCount} browser/page/scenario errors.`),
  ];
  const measurementTrustChecks = [
    checks[0],
    checks[1],
    checks[2],
    checks[3],
    checks[4],
    checks[9],
  ];
  const measurementTrustStatus = statusFromChecks(measurementTrustChecks);
  const status = statusFromChecks(checks);

  const summary: TerrainBaselineSummary = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    sourceGitStatus: gitStatusShort(),
    mode: OUTPUT_NAME,
    status,
    url,
    serverMode,
    browser: {
      headless,
      version: browserVersion,
      userAgent,
    },
    viewport: VIEWPORT,
    warmupPolicy: {
      modeSettleSeconds: Object.fromEntries(plans().map((plan) => [plan.mode, plan.settleSec])),
      renderSettleFramesPerShot: Math.max(...plans().flatMap((plan) => plan.views.map((view) => view.settleFrames))),
      cameraPolicy: 'Use current live player XZ, raise camera by view-specific AGL, pump terrain and vegetation, render one explicit frame, then screenshot.',
      buildPolicy: shouldBuild() && serverMode !== 'dev'
        ? 'Force-build the perf target before serving.'
        : serverMode === 'dev'
          ? 'Use the Vite dev server; no perf build is produced.'
          : 'Reuse the existing perf build because --no-build was supplied.',
    },
    files: {
      summary: relRequired(summaryPath),
      markdown: relRequired(markdownPath),
    },
    inputs: {
      horizonAudit: rel(horizonPath),
      cullingProof: rel(cullingPath),
      openFrontierPerfSummary: rel(openFrontierPerfPath),
      aShauPerfSummary: rel(aShauPerfPath),
    },
    performanceBaselines: {
      openFrontier,
      aShau,
    },
    horizonAudit: {
      status: horizonPath ? 'pass' : 'fail',
      largestBareTerrainBandMeters: horizon?.summary?.largestBareTerrainBandMeters ?? null,
      largestBareTerrainBandMode: horizon?.summary?.largestBareTerrainBandMode ?? null,
      maxRegistryVegetationDistanceMeters: horizon?.summary?.maxRegistryVegetationDistanceMeters ?? null,
    },
    cullingTelemetry: {
      status: culling?.status ?? 'fail',
      measurementTrustStatus: culling?.measurementTrust?.status ?? null,
      rendererInfo: culling?.rendererInfo ?? null,
      files: culling?.files ?? null,
    },
    scenarios,
    measurementTrust: {
      status: measurementTrustStatus,
      flags: {
        expectedShots,
        capturedShots,
        rendererShots,
        terrainShots,
        vegetationShots,
        terrainVisibleImageShots,
        browserErrorCount,
        browserHeadless: headless,
        browserVersion,
      },
      checks: measurementTrustChecks,
      summary: measurementTrustStatus === 'pass'
        ? 'Screenshot capture path has renderer, terrain, vegetation, browser, and file evidence for the before baseline.'
        : 'Screenshot capture path is incomplete; do not use it as the terrain horizon before baseline.',
    },
    checks,
    openItems: [
      'Use these screenshots only as before evidence for a future far-canopy or vegetation-distance branch.',
      'Any after branch must rerun this command plus Open Frontier and A Shau perf captures in matched mode.',
      'Human visual review is still required before accepting far-horizon appearance as final.',
    ],
    nonClaims: [
      'This command does not implement or accept far canopy, culling, HLOD, WebGPU, or texture remediation.',
      'This command does not claim production parity; live Pages verification remains separate.',
      'The 10% draw-call and +1.5ms p95 ceilings are acceptance guards for future after captures, not improvements in this baseline.',
    ],
  };

  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
  writeMarkdown(summary, markdownPath);

  console.log(`Projekt 143 terrain horizon baseline ${summary.status.toUpperCase()}: ${relRequired(summaryPath)}`);
  for (const check of checks) {
    console.log(`- ${check.status.toUpperCase()} ${check.id}: ${check.message}`);
  }

  if (process.argv.includes('--strict') && summary.status !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('projekt-143-terrain-horizon-baseline failed:', error);
  process.exit(1);
});
