#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import sharp from 'sharp';
import { parseServerModeArg, startServer, stopServer, type ServerHandle } from './preview-server';

type CheckStatus = 'pass' | 'warn' | 'fail';
type VariantId = 'default' | 'vegetation-normals-disabled';
type ViewId = 'ground-mid' | 'canopy-oblique';

type ScenarioPlan = {
  key: 'openfrontier' | 'zonecontrol';
  mode: 'open_frontier' | 'zone_control';
  seed: number;
  anchor: { x: number; z: number };
  settleSeconds: number;
  views: ViewPlan[];
};

type ViewPlan = {
  id: ViewId;
  heightAGL: number;
  yawDeg: number;
  pitchDeg: number;
  settleFrames: number;
};

type VariantPlan = {
  id: VariantId;
  disableVegetationNormals: boolean;
};

type RendererInfo = {
  drawCalls?: number;
  triangles?: number;
  geometries?: number;
  textures?: number;
  programs?: number;
};

type ShotRuntimeMetrics = {
  camera: { x: number; y: number; z: number };
  terrainY: number;
  rendererInfo: RendererInfo | null;
  vegetationActiveTotal: number | null;
  billboardDebug: Record<string, unknown> | null;
  renderText: string | null;
};

type ImageStats = {
  width: number;
  height: number;
  lumaMean: number;
  chromaMean: number;
  greenDominanceRatio: number;
  edgeContrast: number;
};

type VariantShot = {
  scenario: ScenarioPlan['key'];
  mode: ScenarioPlan['mode'];
  seed: number;
  variant: VariantId;
  disableVegetationNormals: boolean;
  view: ViewId;
  file: string;
  metrics: ShotRuntimeMetrics;
  imageStats: ImageStats;
  browserErrors: string[];
  browserWarnings: string[];
  pageErrors: string[];
  requestFailures: string[];
};

type PairDelta = {
  scenario: ScenarioPlan['key'];
  mode: ScenarioPlan['mode'];
  seed: number;
  view: ViewId;
  defaultFile: string;
  candidateFile: string;
  defaultVegetationActive: number | null;
  candidateVegetationActive: number | null;
  meanAbsRgbDelta: number;
  meanAbsLumaDelta: number;
  meanLumaDelta: number;
  meanLumaDeltaPercent: number | null;
  meanChromaDelta: number;
  greenDominanceDelta: number;
  edgeContrastDelta: number;
};

type ValidationCheck = {
  id: string;
  status: CheckStatus;
  value: unknown;
  message: string;
};

type Summary = {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  mode: 'projekt-143-vegetation-normal-proof';
  status: CheckStatus;
  url: string;
  serverMode: string;
  viewport: typeof VIEWPORT;
  browser: {
    headless: boolean;
    version: string | null;
    userAgent: string | null;
  };
  runtimePolicy: {
    defaultPath: string;
    candidatePath: string;
    acceptancePolicy: string;
  };
  files: {
    summary: string;
    markdown: string;
    contactSheet: string;
  };
  scenarios: Array<{
    key: ScenarioPlan['key'];
    mode: ScenarioPlan['mode'];
    seed: number;
    shots: VariantShot[];
  }>;
  pairDeltas: PairDelta[];
  aggregate: {
    expectedPairs: number;
    capturedPairs: number;
    maxMeanAbsRgbDelta: number | null;
    maxMeanAbsLumaDelta: number | null;
    maxAbsMeanLumaDeltaPercent: number | null;
    maxVegetationActiveDelta: number | null;
  };
  checks: ValidationCheck[];
  findings: string[];
  nonClaims: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-vegetation-normal-proof';
const DEFAULT_PORT = 9242;
const STARTUP_TIMEOUT_MS = 120_000;
const VIEWPORT = { width: 1600, height: 900 };
const CONTACT_WIDTH = 640;
const CONTACT_HEIGHT = 360;

const VARIANTS: VariantPlan[] = [
  { id: 'default', disableVegetationNormals: false },
  { id: 'vegetation-normals-disabled', disableVegetationNormals: true },
];

function plans(): ScenarioPlan[] {
  return [
    {
      key: 'openfrontier',
      mode: 'open_frontier',
      seed: 42,
      anchor: { x: 52, z: -1398 },
      settleSeconds: 8,
      views: [
        { id: 'ground-mid', heightAGL: 4, yawDeg: 135, pitchDeg: -7, settleFrames: 12 },
        { id: 'canopy-oblique', heightAGL: 38, yawDeg: 135, pitchDeg: -22, settleFrames: 16 },
      ],
    },
    {
      key: 'zonecontrol',
      mode: 'zone_control',
      seed: 137,
      anchor: { x: 1, z: -178 },
      settleSeconds: 8,
      views: [
        { id: 'ground-mid', heightAGL: 4, yawDeg: 45, pitchDeg: -7, settleFrames: 12 },
        { id: 'canopy-oblique', heightAGL: 32, yawDeg: 45, pitchDeg: -22, settleFrames: 16 },
      ],
    },
  ];
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function parsePort(): number {
  const value = argValue('--port');
  if (!value) return DEFAULT_PORT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid --port ${value}`);
  return parsed;
}

function argValue(name: string): string | undefined {
  const equal = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equal) return equal.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

function isHeaded(): boolean {
  return process.argv.includes('--headed');
}

function shouldBuild(): boolean {
  return !process.argv.includes('--no-build');
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

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function makeCheck(id: string, status: CheckStatus | boolean, value: unknown, message: string): ValidationCheck {
  const resolvedStatus = typeof status === 'boolean'
    ? (status ? 'pass' : 'fail')
    : status;
  return { id, status: resolvedStatus, value, message };
}

function statusFromChecks(checks: ValidationCheck[]): CheckStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as Window & { __engine?: unknown }).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startMode(page: Page, mode: ScenarioPlan['mode']): Promise<void> {
  await page.evaluate(async (selectedMode: string) => {
    const engine = (window as Window & {
      __engine?: {
        startGameWithMode?: (mode: string) => Promise<void>;
      };
    }).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(selectedMode);
  }, mode);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const engine = (window as Window & {
        __engine?: {
          gameStarted?: boolean;
          startupFlow?: { getState?: () => { phase?: string } };
          systemManager?: { gameModeManager?: { getCurrentMode?: () => string } };
        };
      }).__engine;
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
    // Briefing is absent in most automated modes.
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

async function poseAndRender(
  page: Page,
  view: ViewPlan,
  anchor: ScenarioPlan['anchor']
): Promise<ShotRuntimeMetrics> {
  return page.evaluate(
    ({ v, viewport, cameraAnchor }: { v: ViewPlan; viewport: typeof VIEWPORT; cameraAnchor: ScenarioPlan['anchor'] }) => {
      const engine = (window as Window & { __engine?: Record<string, unknown>; __rendererInfo?: () => RendererInfo }).__engine;
      const renderer = engine?.renderer as Record<string, unknown> | undefined;
      const camera = renderer?.camera as {
        aspect?: number;
        position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
        rotation: { order: string; set: (x: number, y: number, z: number) => void };
        updateProjectionMatrix?: () => void;
        updateMatrixWorld?: (force?: boolean) => void;
      } | undefined;
      const threeRenderer = renderer?.renderer as {
        setSize?: (width: number, height: number, updateStyle?: boolean) => void;
        render?: (scene: unknown, camera: unknown) => void;
      } | undefined;
      const scene = renderer?.scene;
      const post = renderer?.postProcessing as {
        setSize?: (width: number, height: number) => void;
        beginFrame?: () => void;
        endFrame?: () => void;
      } | undefined;
      const systemManager = engine?.systemManager as Record<string, unknown> | undefined;
      const terrain = systemManager?.terrainSystem as {
        getHeightAt?: (x: number, z: number) => number;
        updatePlayerPosition?: (position: unknown) => void;
        update?: (dt: number) => void;
      } | undefined;
      const billboards = systemManager?.globalBillboardSystem as {
        update?: (dt: number, fog: unknown) => void;
        getDebugInfo?: () => Record<string, unknown>;
      } | undefined;
      const atmosphere = systemManager?.atmosphereSystem as {
        syncDomePosition?: (position: unknown) => void;
        setTerrainYAtCamera?: (y: number) => void;
        update?: (dt: number) => void;
      } | undefined;
      if (!engine || !camera || !threeRenderer?.render || !scene) {
        throw new Error('engine/camera/renderer/scene unavailable');
      }

      (engine as { isLoopRunning?: boolean }).isLoopRunning = false;
      const animationFrameId = (engine as { animationFrameId?: number | null }).animationFrameId;
      if (animationFrameId !== null && animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
        (engine as { animationFrameId?: number | null }).animationFrameId = null;
      }

      const anchorX = Number(cameraAnchor.x);
      const anchorZ = Number(cameraAnchor.z);
      const terrainYRaw = terrain?.getHeightAt?.(anchorX, anchorZ) ?? 0;
      const terrainY = Number.isFinite(terrainYRaw) ? terrainYRaw : 0;

      threeRenderer.setSize?.(viewport.width, viewport.height, true);
      post?.setSize?.(viewport.width, viewport.height);
      if (typeof camera.aspect === 'number') {
        camera.aspect = viewport.width / viewport.height;
        camera.updateProjectionMatrix?.();
      }

      camera.position.set(anchorX, terrainY + v.heightAGL, anchorZ);
      camera.rotation.order = 'YXZ';
      camera.rotation.set((v.pitchDeg * Math.PI) / 180, (v.yawDeg * Math.PI) / 180, 0);
      camera.updateMatrixWorld?.(true);

      terrain?.updatePlayerPosition?.(camera.position);
      for (let i = 0; i < v.settleFrames; i++) {
        terrain?.update?.(0.016);
        billboards?.update?.(0.016, renderer?.fog ?? null);
      }
      atmosphere?.syncDomePosition?.(camera.position);
      atmosphere?.setTerrainYAtCamera?.(terrainY);
      atmosphere?.update?.(0.25);

      for (let i = 0; i < 2; i++) {
        post?.beginFrame?.();
        threeRenderer.render(scene, camera);
        post?.endFrame?.();
      }

      const billboardDebug = billboards?.getDebugInfo?.() ?? null;
      const vegetationActiveTotal = billboardDebug
        ? Object.entries(billboardDebug)
          .filter(([key]) => key.endsWith('Active'))
          .reduce((sum, [, value]) => {
            const numeric = Number(value);
            return sum + (Number.isFinite(numeric) ? numeric : 0);
          }, 0)
        : null;
      const renderText = typeof (window as Window & { render_game_to_text?: () => string }).render_game_to_text === 'function'
        ? (window as Window & { render_game_to_text: () => string }).render_game_to_text()
        : null;
      const rendererInfo = typeof (window as Window & { __rendererInfo?: () => RendererInfo }).__rendererInfo === 'function'
        ? (window as Window & { __rendererInfo: () => RendererInfo }).__rendererInfo()
        : null;

      return {
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        terrainY,
        rendererInfo,
        vegetationActiveTotal,
        billboardDebug,
        renderText,
      };
    },
    { v: view, viewport: VIEWPORT, cameraAnchor: anchor }
  );
}

async function imageStats(file: string): Promise<ImageStats> {
  const metadata = await sharp(file).metadata();
  const width = metadata.width ?? VIEWPORT.width;
  const height = metadata.height ?? VIEWPORT.height;
  const { data, info } = await sharp(file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let lumaSum = 0;
  let chromaSum = 0;
  let greenDominant = 0;
  let edgeContrastSum = 0;
  let edgeContrastCount = 0;
  const count = Math.max(1, info.width * info.height);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaSum += luma;
      chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
      if (g > r * 1.04 && g > b * 1.04 && luma > 18 && luma < 235) greenDominant++;
      if (x >= 8) {
        const prevIdx = (y * info.width + (x - 8)) * info.channels;
        const prevLuma = 0.2126 * (data[prevIdx] ?? 0)
          + 0.7152 * (data[prevIdx + 1] ?? 0)
          + 0.0722 * (data[prevIdx + 2] ?? 0);
        edgeContrastSum += Math.abs(luma - prevLuma);
        edgeContrastCount++;
      }
    }
  }

  return {
    width,
    height,
    lumaMean: Number((lumaSum / count).toFixed(3)),
    chromaMean: Number((chromaSum / count).toFixed(3)),
    greenDominanceRatio: Number((greenDominant / count).toFixed(5)),
    edgeContrast: Number((edgeContrastSum / Math.max(1, edgeContrastCount)).toFixed(3)),
  };
}

async function pairDelta(defaultShot: VariantShot, candidateShot: VariantShot): Promise<PairDelta> {
  const defaultBuffer = await sharp(defaultShot.file)
    .resize(VIEWPORT.width, VIEWPORT.height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const candidateBuffer = await sharp(candidateShot.file)
    .resize(VIEWPORT.width, VIEWPORT.height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const length = Math.min(defaultBuffer.data.length, candidateBuffer.data.length);
  let rgbDeltaSum = 0;
  let lumaDeltaAbsSum = 0;
  let lumaDeltaSum = 0;
  const pixelCount = Math.max(1, Math.floor(length / 3));
  for (let idx = 0; idx + 2 < length; idx += 3) {
    const dr = defaultBuffer.data[idx] ?? 0;
    const dg = defaultBuffer.data[idx + 1] ?? 0;
    const db = defaultBuffer.data[idx + 2] ?? 0;
    const cr = candidateBuffer.data[idx] ?? 0;
    const cg = candidateBuffer.data[idx + 1] ?? 0;
    const cb = candidateBuffer.data[idx + 2] ?? 0;
    rgbDeltaSum += (Math.abs(cr - dr) + Math.abs(cg - dg) + Math.abs(cb - db)) / 3;
    const defaultLuma = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
    const candidateLuma = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
    const lumaDelta = candidateLuma - defaultLuma;
    lumaDeltaSum += lumaDelta;
    lumaDeltaAbsSum += Math.abs(lumaDelta);
  }
  const meanLumaDelta = lumaDeltaSum / pixelCount;
  const defaultLuma = defaultShot.imageStats.lumaMean;

  return {
    scenario: defaultShot.scenario,
    mode: defaultShot.mode,
    seed: defaultShot.seed,
    view: defaultShot.view,
    defaultFile: rel(defaultShot.file),
    candidateFile: rel(candidateShot.file),
    defaultVegetationActive: defaultShot.metrics.vegetationActiveTotal,
    candidateVegetationActive: candidateShot.metrics.vegetationActiveTotal,
    meanAbsRgbDelta: Number((rgbDeltaSum / pixelCount).toFixed(3)),
    meanAbsLumaDelta: Number((lumaDeltaAbsSum / pixelCount).toFixed(3)),
    meanLumaDelta: Number(meanLumaDelta.toFixed(3)),
    meanLumaDeltaPercent: defaultLuma > 0
      ? Number(((meanLumaDelta / defaultLuma) * 100).toFixed(3))
      : null,
    meanChromaDelta: Number((candidateShot.imageStats.chromaMean - defaultShot.imageStats.chromaMean).toFixed(3)),
    greenDominanceDelta: Number((candidateShot.imageStats.greenDominanceRatio - defaultShot.imageStats.greenDominanceRatio).toFixed(5)),
    edgeContrastDelta: Number((candidateShot.imageStats.edgeContrast - defaultShot.imageStats.edgeContrast).toFixed(3)),
  };
}

async function captureVariant(
  browser: Browser,
  baseUrl: string,
  outputDir: string,
  plan: ScenarioPlan,
  variant: VariantPlan
): Promise<VariantShot[]> {
  const browserErrors: string[] = [];
  const browserWarnings: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') browserErrors.push(text);
    if (message.type() === 'warning') browserWarnings.push(text);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.stack ? `${error.message}\n${error.stack}` : error.message);
  });
  page.on('requestfailed', (request) => {
    if (!request.url().endsWith('/favicon.ico')) {
      requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`);
    }
  });

  try {
    if (variant.disableVegetationNormals) {
      await page.addInitScript({ content: 'window.__KB_LOAD_DISABLE_VEGETATION_NORMALS__ = true;' });
    }
    await page.goto(`${baseUrl}&seed=${plan.seed}`, { waitUntil: 'networkidle', timeout: STARTUP_TIMEOUT_MS });
    await waitForEngine(page);
    await startMode(page, plan.mode);
    await dismissBriefingIfPresent(page);
    await page.waitForTimeout(plan.settleSeconds * 1000);
    await hideUi(page);

    const shots: VariantShot[] = [];
    for (const view of plan.views) {
      const metrics = await poseAndRender(page, view, plan.anchor);
      const file = join(outputDir, `${plan.key}-${variant.id}-${view.id}.png`);
      await page.screenshot({ path: file, type: 'png', fullPage: false });
      shots.push({
        scenario: plan.key,
        mode: plan.mode,
        seed: plan.seed,
        variant: variant.id,
        disableVegetationNormals: variant.disableVegetationNormals,
        view: view.id,
        file,
        metrics,
        imageStats: await imageStats(file),
        browserErrors: [...browserErrors],
        browserWarnings: [...browserWarnings],
        pageErrors: [...pageErrors],
        requestFailures: [...requestFailures],
      });
    }
    return shots;
  } finally {
    await context.close();
  }
}

function xmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

async function writeContactSheet(pairs: PairDelta[], outputDir: string, contactSheetPath: string): Promise<void> {
  const rowHeight = CONTACT_HEIGHT + 52;
  const width = CONTACT_WIDTH * 2;
  const height = Math.max(rowHeight, rowHeight * pairs.length);
  const composites: sharp.OverlayOptions[] = [];

  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index];
    const top = index * rowHeight;
    const defaultPath = join(process.cwd(), pair.defaultFile);
    const candidatePath = join(process.cwd(), pair.candidateFile);
    const defaultImage = await sharp(defaultPath).resize(CONTACT_WIDTH, CONTACT_HEIGHT, { fit: 'cover' }).png().toBuffer();
    const candidateImage = await sharp(candidatePath).resize(CONTACT_WIDTH, CONTACT_HEIGHT, { fit: 'cover' }).png().toBuffer();
    const label = `${pair.mode} seed ${pair.seed} ${pair.view} | mean abs luma ${pair.meanAbsLumaDelta} | mean luma ${pair.meanLumaDeltaPercent ?? 'n/a'}%`;
    const labelSvg = Buffer.from(`
      <svg width="${width}" height="52" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="52" fill="#101510"/>
        <text x="14" y="20" font-family="Arial, sans-serif" font-size="16" fill="#e7f2df">${xmlEscape(label)}</text>
        <text x="14" y="42" font-family="Arial, sans-serif" font-size="14" fill="#b6c7aa">default normal-lit</text>
        <text x="${CONTACT_WIDTH + 14}" y="42" font-family="Arial, sans-serif" font-size="14" fill="#b6c7aa">candidate no vegetation normals</text>
      </svg>
    `);
    composites.push({ input: labelSvg, left: 0, top });
    composites.push({ input: defaultImage, left: 0, top: top + 52 });
    composites.push({ input: candidateImage, left: CONTACT_WIDTH, top: top + 52 });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#0b0f0b',
    },
  })
    .composite(composites)
    .png()
    .toFile(contactSheetPath);

  const readmePath = join(outputDir, 'contact-sheet-notes.txt');
  writeFileSync(readmePath, pairs.map((pair) =>
    `${pair.mode}/${pair.view}: default=${pair.defaultFile} candidate=${pair.candidateFile}`
  ).join('\n') + '\n', 'utf-8');
}

function buildChecks(shots: VariantShot[], pairs: PairDelta[], expectedPairs: number): ValidationCheck[] {
  const expectedShots = expectedPairs * 2;
  const browserErrorCount = shots.reduce((sum, shot) =>
    sum + shot.browserErrors.length + shot.pageErrors.length + shot.requestFailures.length,
  0);
  const vegetationShots = shots.filter((shot) => (shot.metrics.vegetationActiveTotal ?? 0) > 0).length;
  const rendererShots = shots.filter((shot) =>
    (shot.metrics.rendererInfo?.drawCalls ?? 0) > 0 && (shot.metrics.rendererInfo?.triangles ?? 0) > 0
  ).length;
  const maxAbsMeanLumaPercent = pairs.reduce((max, pair) =>
    Math.max(max, Math.abs(pair.meanLumaDeltaPercent ?? 0)),
  0);
  const maxMeanAbsRgb = pairs.reduce((max, pair) => Math.max(max, pair.meanAbsRgbDelta), 0);

  const deltaWithinReviewBand = maxAbsMeanLumaPercent <= 12 && maxMeanAbsRgb <= 24;
  const deltaMessage = deltaWithinReviewBand
    ? 'Mechanical image deltas are within the current review band, but this is not human visual signoff.'
    : 'Mechanical image deltas exceed the current review band; inspect the contact sheet before considering vegetation normal-map removal.';

  return [
    makeCheck('screenshots_captured', shots.length === expectedShots && pairs.length === expectedPairs, `${shots.length}/${expectedShots} shots, ${pairs.length}/${expectedPairs} pairs`, `Captured ${shots.length}/${expectedShots} variant screenshots and ${pairs.length}/${expectedPairs} A/B pairs.`),
    makeCheck('renderer_stats_present', rendererShots === expectedShots ? 'pass' : 'fail', `${rendererShots}/${expectedShots}`, `Renderer draw-call/triangle stats were present for ${rendererShots}/${expectedShots} screenshots.`),
    makeCheck('vegetation_present', vegetationShots === expectedShots ? 'pass' : 'fail', `${vegetationShots}/${expectedShots}`, `Vegetation active counters were positive for ${vegetationShots}/${expectedShots} screenshots.`),
    makeCheck('browser_errors_clear', browserErrorCount === 0 ? 'pass' : 'fail', browserErrorCount, `Captured ${browserErrorCount} browser/page/request failures.`),
    makeCheck('visual_delta_review_band', deltaWithinReviewBand ? 'pass' : 'warn', { maxAbsMeanLumaPercent, maxMeanAbsRgb }, deltaMessage),
    makeCheck('human_visual_review_required', 'warn', 'required', 'Human review must accept the contact sheet before vegetation normal-map removal becomes runtime policy.'),
  ];
}

function writeMarkdown(summary: Summary, path: string): void {
  const lines = [
    '# Projekt Objekt-143 Vegetation Normal Proof',
    '',
    `Generated: ${summary.createdAt}`,
    `Source SHA: ${summary.sourceGitSha}`,
    `Source status entries: ${summary.sourceGitStatus.length}`,
    `Status: ${summary.status.toUpperCase()}`,
    `Server mode: ${summary.serverMode}`,
    `Contact sheet: ${summary.files.contactSheet}`,
    '',
    '## Runtime Policy',
    '',
    `- Default: ${summary.runtimePolicy.defaultPath}`,
    `- Candidate: ${summary.runtimePolicy.candidatePath}`,
    `- Acceptance: ${summary.runtimePolicy.acceptancePolicy}`,
    '',
    '## Pairs',
    '',
    '| Mode | Seed | View | Default | Candidate | Vegetation default/candidate | Mean abs RGB | Mean abs luma | Mean luma delta | Chroma delta |',
    '| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...summary.pairDeltas.map((pair) =>
      `| ${pair.mode} | ${pair.seed} | ${pair.view} | ${pair.defaultFile} | ${pair.candidateFile} | ${pair.defaultVegetationActive ?? 'n/a'} / ${pair.candidateVegetationActive ?? 'n/a'} | ${pair.meanAbsRgbDelta} | ${pair.meanAbsLumaDelta} | ${pair.meanLumaDeltaPercent ?? 'n/a'}% | ${pair.meanChromaDelta} |`
    ),
    '',
    '## Checks',
    '',
    ...summary.checks.map((check) => `- ${check.status.toUpperCase()} ${check.id}: ${check.message}`),
    '',
    '## Findings',
    '',
    ...summary.findings.map((finding) => `- ${finding}`),
    '',
    '## Non-Claims',
    '',
    ...summary.nonClaims.map((claim) => `- ${claim}`),
    '',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

async function main(): Promise<void> {
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const summaryPath = join(outputDir, 'summary.json');
  const markdownPath = join(outputDir, 'summary.md');
  const contactSheetPath = join(outputDir, 'contact-sheet.png');
  const port = parsePort();
  const serverMode = parseServerModeArg(process.argv, 'perf');
  const baseUrl = `http://127.0.0.1:${port}/?perf=1&diag=1&uiTransitions=0&logLevel=warn`;
  const headless = !isHeaded();

  let server: ServerHandle | null = null;
  let browser: Browser | null = null;
  let browserVersion: string | null = null;
  let userAgent: string | null = null;
  const scenarioSummaries: Summary['scenarios'] = [];
  const allShots: VariantShot[] = [];

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
      const scenarioShots: VariantShot[] = [];
      for (const variant of VARIANTS) {
        const shots = await captureVariant(browser, baseUrl, outputDir, plan, variant);
        scenarioShots.push(...shots);
        allShots.push(...shots);
      }
      scenarioSummaries.push({
        key: plan.key,
        mode: plan.mode,
        seed: plan.seed,
        shots: scenarioShots.map((shot) => ({ ...shot, file: rel(shot.file) })),
      });
    }
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }

  const pairs: PairDelta[] = [];
  for (const plan of plans()) {
    for (const view of plan.views) {
      const defaultShot = allShots.find((shot) => shot.scenario === plan.key && shot.view === view.id && shot.variant === 'default');
      const candidateShot = allShots.find((shot) => shot.scenario === plan.key && shot.view === view.id && shot.variant === 'vegetation-normals-disabled');
      if (defaultShot && candidateShot) {
        pairs.push(await pairDelta(defaultShot, candidateShot));
      }
    }
  }
  await writeContactSheet(pairs, outputDir, contactSheetPath);

  const expectedPairs = plans().reduce((sum, plan) => sum + plan.views.length, 0);
  const checks = buildChecks(allShots, pairs, expectedPairs);
  const maxMeanAbsRgbDelta = pairs.length ? Math.max(...pairs.map((pair) => pair.meanAbsRgbDelta)) : null;
  const maxMeanAbsLumaDelta = pairs.length ? Math.max(...pairs.map((pair) => pair.meanAbsLumaDelta)) : null;
  const maxAbsMeanLumaDeltaPercent = pairs.length
    ? Math.max(...pairs.map((pair) => Math.abs(pair.meanLumaDeltaPercent ?? 0)))
    : null;
  const maxVegetationActiveDelta = pairs.length
    ? Math.max(...pairs.map((pair) => Math.abs((pair.candidateVegetationActive ?? 0) - (pair.defaultVegetationActive ?? 0))))
    : null;
  const status = statusFromChecks(checks);
  const summary: Summary = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    sourceGitStatus: gitStatusShort(),
    mode: OUTPUT_NAME,
    status,
    url: baseUrl,
    serverMode,
    viewport: VIEWPORT,
    browser: {
      headless,
      version: browserVersion,
      userAgent,
    },
    runtimePolicy: {
      defaultPath: 'Normal-lit Pixel Forge vegetation still loads color and normal atlases by default.',
      candidatePath: 'The no-normal variant sets window.__KB_LOAD_DISABLE_VEGETATION_NORMALS__ before startup, skips vegetation normal textures, and forces hemisphere vegetation shading.',
      acceptancePolicy: 'Mechanical screenshot and delta evidence is necessary but not sufficient; human visual review must accept the contact sheet before any default runtime or Pixel Forge bake policy changes.',
    },
    files: {
      summary: rel(summaryPath),
      markdown: rel(markdownPath),
      contactSheet: rel(contactSheetPath),
    },
    scenarios: scenarioSummaries,
    pairDeltas: pairs,
    aggregate: {
      expectedPairs,
      capturedPairs: pairs.length,
      maxMeanAbsRgbDelta,
      maxMeanAbsLumaDelta,
      maxAbsMeanLumaDeltaPercent,
      maxVegetationActiveDelta,
    },
    checks,
    findings: [
      'The proof captures actual game runtime scenes in the perf build for both default and no-normal variants.',
      'The candidate path is isolated behind an init-script flag and does not change default runtime behavior.',
      status === 'warn'
        ? 'The proof remains WARN because human visual review is required before accepting vegetation normal-map removal.'
        : 'The proof failed; inspect browser errors, vegetation counters, or missing screenshots before using it.',
    ],
    nonClaims: [
      'This proof does not remove vegetation normal maps from the default runtime.',
      'This proof does not regenerate Pixel Forge atlases or change bake policy.',
      'This proof does not claim startup-latency closeout, production parity, or broad KB-OPTIK final visual signoff.',
    ],
  };

  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
  writeMarkdown(summary, markdownPath);

  console.log(`Projekt 143 vegetation normal proof ${summary.status.toUpperCase()}: ${rel(summaryPath)}`);
  console.log(`Contact sheet: ${rel(contactSheetPath)}`);
  for (const check of checks) {
    console.log(`- ${check.status.toUpperCase()} ${check.id}: ${check.message}`);
  }

  if (process.argv.includes('--strict') && summary.status !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('projekt-143-vegetation-normal-proof failed:', error);
  process.exit(1);
});
