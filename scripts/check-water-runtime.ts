#!/usr/bin/env tsx

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { startServer, stopServer } from './preview-server';

type ProofStatus = 'pass' | 'fail';

interface WaterRuntimeProofOptions {
  modes: string[];
  port: number;
  headless: boolean;
}

interface WaterDebugInfo {
  enabled?: boolean;
  waterVisible?: boolean;
  hydrologyRiverVisible?: boolean;
  hydrologyRiverMaterialProfile?: string;
  hydrologyChannelCount?: number;
  hydrologySegmentCount?: number;
  hydrologyVertexCount?: number;
  hydrologyTotalLengthMeters?: number;
}

interface RuntimeProofResult {
  mode: string;
  screenshot: string;
  errors: string[];
  proof: {
    waterInfo: WaterDebugInfo | null;
    groupPresent: boolean;
    groupVisible: boolean;
    meshPresent: boolean;
    meshVisible: boolean;
    vertexCount: number;
    colorAttributePresent: boolean;
    colorAttributeItemSize: number;
    focusPoint: { x: number; y: number; z: number } | null;
    queryProbe: {
      surfaceY: number | null;
      depthOneMeterBelowSurface: number | null;
      underwaterOneMeterBelowSurface: boolean | null;
      interactionSampleOneMeterBelowSurface: {
        source: string;
        surfaceY: number | null;
        depth: number;
        submerged: boolean;
        immersion01: number;
        buoyancyScalar: number;
      } | null;
    } | null;
    boundingBox: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
      center: { x: number; y: number; z: number };
    } | null;
  };
}

interface RuntimeProofReport {
  createdAt: string;
  mode: 'projekt-143-water-runtime-proof';
  status: ProofStatus;
  options: WaterRuntimeProofOptions;
  results: RuntimeProofResult[];
  nonClaims: string[];
}

interface HarnessWindow extends Window {
  __engine?: {
    gameStarted?: boolean;
    startGameWithMode?: (mode: string) => Promise<unknown>;
    renderer?: {
      scene?: HarnessScene;
      camera?: HarnessCamera;
      setOverrideCamera?: (camera: HarnessCamera | null) => void;
    };
    systemManager?: {
      waterSystem?: {
        getDebugInfo?: () => WaterDebugInfo;
        getWaterSurfaceY?: (position: { x: number; y: number; z: number }) => number | null;
        getWaterDepth?: (position: { x: number; y: number; z: number }) => number;
        isUnderwater?: (position: { x: number; y: number; z: number }) => boolean;
        sampleWaterInteraction?: (
          position: { x: number; y: number; z: number },
          options?: { immersionDepthMeters?: number },
        ) => {
          source: string;
          surfaceY: number | null;
          depth: number;
          submerged: boolean;
          immersion01: number;
          buoyancyScalar: number;
        };
      };
    };
  };
}

interface HarnessScene {
  getObjectByName?: (name: string) => HarnessObject | undefined;
}

interface HarnessCamera {
  near: number;
  far: number;
  clone(): HarnessCamera;
  position: { set(x: number, y: number, z: number): void };
  lookAt(x: number, y: number, z: number): void;
  updateProjectionMatrix(): void;
}

interface HarnessObject {
  visible?: boolean;
  geometry?: {
    getAttribute?: (name: string) => {
      count?: number;
      itemSize?: number;
      getX?: (index: number) => number;
      getY?: (index: number) => number;
      getZ?: (index: number) => number;
    } | undefined;
    computeBoundingBox?: () => void;
    boundingBox?: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    } | null;
  };
}

const DEFAULT_MODES = ['open_frontier', 'a_shau_valley'];
const DEFAULT_PORT = 9100;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function parseArgs(argv: string[]): WaterRuntimeProofOptions {
  const modeArg = readArg(argv, '--mode');
  const modesArg = readArg(argv, '--modes');
  const modes = (modesArg ?? modeArg)
    ? (modesArg ?? modeArg)!.split(',').map(mode => mode.trim()).filter(Boolean)
    : DEFAULT_MODES;
  const port = Number(readArg(argv, '--port') ?? DEFAULT_PORT);
  return {
    modes,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    headless: argv.includes('--headless'),
  };
}

function readArg(argv: string[], name: string): string | null {
  const eqArg = argv.find(arg => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && index + 1 < argv.length) return argv[index + 1] ?? null;
  return null;
}

function assertPerfBuildExists(): void {
  if (!existsSync(join(process.cwd(), 'dist-perf', 'index.html'))) {
    throw new Error('dist-perf/index.html is missing. Run `npm run build:perf` before the water runtime proof.');
  }
}

async function runModeProof(page: Page, mode: string, port: number, artifactDir: string): Promise<RuntimeProofResult> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`http://127.0.0.1:${port}/?perf=1&capture=1&logLevel=error`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForFunction(() => {
    const win = window as HarnessWindow;
    return Boolean(win.__engine?.startGameWithMode);
  }, undefined, { timeout: 180_000 });
  await page.evaluate(async (requestedMode) => {
    const engine = (window as HarnessWindow).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode missing');
    await engine.startGameWithMode(requestedMode);
  }, mode);
  await page.waitForFunction(() => (window as HarnessWindow).__engine?.gameStarted === true, undefined, {
    timeout: 180_000,
  });
  await page.waitForTimeout(2_500);

  const proof = await page.evaluate(() => {
    const engine = (window as HarnessWindow).__engine;
    const scene = engine?.renderer?.scene;
    const waterInfo = engine?.systemManager?.waterSystem?.getDebugInfo?.() ?? null;
    const group = scene?.getObjectByName?.('hydrology-river-surfaces') ?? null;
    const mesh = scene?.getObjectByName?.('hydrology-river-surface-mesh') ?? null;
    const geometry = mesh?.geometry ?? null;
    const positionAttr = geometry?.getAttribute?.('position') ?? null;
    const colorAttr = geometry?.getAttribute?.('color') ?? null;
    geometry?.computeBoundingBox?.();
    const box = geometry?.boundingBox ?? null;
    const center = box
      ? {
        x: (box.min.x + box.max.x) / 2,
        y: (box.min.y + box.max.y) / 2,
        z: (box.min.z + box.max.z) / 2,
      }
      : null;
    let focusPoint = center;
    if (positionAttr?.count && positionAttr.getX && positionAttr.getY && positionAttr.getZ) {
      let bestScore = Number.POSITIVE_INFINITY;
      for (let index = 0; index + 5 < positionAttr.count; index += 6) {
        const sample = {
          x: (positionAttr.getX(index + 1) + positionAttr.getX(index + 4)) * 0.5,
          y: (positionAttr.getY(index + 1) + positionAttr.getY(index + 4)) * 0.5,
          z: (positionAttr.getZ(index + 1) + positionAttr.getZ(index + 4)) * 0.5,
        };
        if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.z)) {
          continue;
        }
        const score = center
          ? Math.hypot(sample.x - center.x, sample.z - center.z)
          : index;
        if (score < bestScore) {
          bestScore = score;
          focusPoint = sample;
        }
      }
    }

    if (focusPoint && box && engine?.renderer?.camera && engine.renderer.setOverrideCamera) {
      const camera = engine.renderer.camera.clone();
      const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const cameraDistance = span > 8_000 ? 180 : 95;
      camera.position.set(
        focusPoint.x + cameraDistance,
        Math.max(focusPoint.y + cameraDistance * 0.62, focusPoint.y + 45),
        focusPoint.z + cameraDistance,
      );
      camera.lookAt(focusPoint.x, focusPoint.y, focusPoint.z);
      camera.near = 0.1;
      camera.far = Math.max(camera.far, 3_000);
      camera.updateProjectionMatrix();
      engine.renderer.setOverrideCamera(camera);
    }

    const waterSystem = engine?.systemManager?.waterSystem;
    let queryProbe = null;
    if (
      focusPoint
      && typeof waterSystem?.getWaterSurfaceY === 'function'
      && typeof waterSystem.getWaterDepth === 'function'
      && typeof waterSystem.isUnderwater === 'function'
    ) {
      const surfaceY = waterSystem.getWaterSurfaceY(focusPoint);
      const belowSurface = surfaceY === null ? null : {
        x: focusPoint.x,
        y: surfaceY - 1,
        z: focusPoint.z,
      };
      queryProbe = {
        surfaceY,
        depthOneMeterBelowSurface: belowSurface ? waterSystem.getWaterDepth(belowSurface) : null,
        underwaterOneMeterBelowSurface: belowSurface ? waterSystem.isUnderwater(belowSurface) : null,
        interactionSampleOneMeterBelowSurface: belowSurface && typeof waterSystem.sampleWaterInteraction === 'function'
          ? waterSystem.sampleWaterInteraction(belowSurface, { immersionDepthMeters: 2 })
          : null,
      };
    }

    return {
      waterInfo,
      groupPresent: Boolean(group),
      groupVisible: Boolean(group?.visible),
      meshPresent: Boolean(mesh),
      meshVisible: Boolean(mesh?.visible),
      vertexCount: positionAttr?.count ?? 0,
      colorAttributePresent: Boolean(colorAttr?.count && positionAttr?.count && colorAttr.count === positionAttr.count),
      colorAttributeItemSize: colorAttr?.itemSize ?? 0,
      focusPoint,
      queryProbe,
      boundingBox: box && center
        ? {
          min: { x: box.min.x, y: box.min.y, z: box.min.z },
          max: { x: box.max.x, y: box.max.y, z: box.max.z },
          center,
        }
        : null,
    };
  });

  await page.waitForTimeout(500);
  const screenshot = join(artifactDir, `${mode}-river-proof.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  return { mode, screenshot: rel(screenshot), errors, proof };
}

function resultPassed(result: RuntimeProofResult): boolean {
  return result.errors.length === 0
    && result.proof.groupPresent
    && result.proof.meshPresent
    && result.proof.waterInfo?.hydrologyRiverVisible === true
    && result.proof.waterInfo?.hydrologyRiverMaterialProfile === 'natural_channel_gradient'
    && result.proof.colorAttributePresent
    && result.proof.colorAttributeItemSize === 4
    && (result.proof.waterInfo?.hydrologySegmentCount ?? 0) > 0
    && Number.isFinite(result.proof.queryProbe?.surfaceY ?? NaN)
    && (result.proof.queryProbe?.depthOneMeterBelowSurface ?? 0) > 0.9
    && result.proof.queryProbe?.underwaterOneMeterBelowSurface === true
    && result.proof.queryProbe?.interactionSampleOneMeterBelowSurface?.source === 'hydrology'
    && result.proof.queryProbe.interactionSampleOneMeterBelowSurface.submerged === true
    && result.proof.queryProbe.interactionSampleOneMeterBelowSurface.buoyancyScalar >= 0.49;
}

function toMarkdown(report: RuntimeProofReport): string {
  return [
    '# Projekt Objekt-143 Water Runtime Proof',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Modes: ${report.options.modes.join(', ')}`,
    '',
    '## Results',
    '',
    ...report.results.map(result => [
      `### ${result.mode}`,
      '',
      `- Screenshot: ${result.screenshot}`,
      `- Errors: ${result.errors.length}`,
      `- Global water enabled: ${String(result.proof.waterInfo?.enabled ?? null)}`,
      `- Global water visible: ${String(result.proof.waterInfo?.waterVisible ?? null)}`,
      `- Hydrology river visible: ${String(result.proof.waterInfo?.hydrologyRiverVisible ?? null)}`,
      `- Hydrology material profile: ${String(result.proof.waterInfo?.hydrologyRiverMaterialProfile ?? null)}`,
      `- Hydrology color attribute present: ${String(result.proof.colorAttributePresent)}`,
      `- Hydrology color attribute item size: ${String(result.proof.colorAttributeItemSize)}`,
      `- Hydrology focus point: ${JSON.stringify(result.proof.focusPoint)}`,
      `- Query probe: ${JSON.stringify(result.proof.queryProbe)}`,
      `- Hydrology channels: ${String(result.proof.waterInfo?.hydrologyChannelCount ?? null)}`,
      `- Hydrology segments: ${String(result.proof.waterInfo?.hydrologySegmentCount ?? null)}`,
      '',
    ].join('\n')),
    '## Non-Claims',
    '',
    ...report.nonClaims.map(claim => `- ${claim}`),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertPerfBuildExists();
  const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), 'projekt-143-water-runtime-proof');
  mkdirSync(artifactDir, { recursive: true });

  const server = await startServer({
    mode: 'perf',
    port: options.port,
    forceBuild: false,
    buildIfMissing: false,
    stdio: 'ignore',
    log: (message) => console.log(`[server] ${message}`),
  });
  const browser = await chromium.launch({
    headless: options.headless,
    args: ['--window-size=1280,720'],
  });

  let results: RuntimeProofResult[] = [];
  try {
    for (const mode of options.modes) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      try {
        results = [...results, await runModeProof(page, mode, server.port, artifactDir)];
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }

  const report: RuntimeProofReport = {
    createdAt: new Date().toISOString(),
    mode: 'projekt-143-water-runtime-proof',
    status: results.every(resultPassed) ? 'pass' : 'fail',
    options,
    results,
    nonClaims: [
      'This proof checks runtime mesh presence, public water query probes, and screenshot capture only.',
      'This proof does not accept final river art, stream flow, crossings, consumer adoption of water interaction samples, physics, or perf.',
      'Human visual acceptance is still required before KB-TERRAIN water can close.',
    ],
  };

  const jsonPath = join(artifactDir, 'water-runtime-proof.json');
  const markdownPath = join(artifactDir, 'water-runtime-proof.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, toMarkdown(report), 'utf-8');

  console.log(`Projekt 143 water runtime proof ${report.status.toUpperCase()}: ${rel(jsonPath)}`);
  for (const result of report.results) {
    console.log(
      `${result.mode}: segments=${result.proof.waterInfo?.hydrologySegmentCount ?? 'n/a'} `
      + `channels=${result.proof.waterInfo?.hydrologyChannelCount ?? 'n/a'} `
      + `profile=${result.proof.waterInfo?.hydrologyRiverMaterialProfile ?? 'n/a'} `
      + `globalEnabled=${result.proof.waterInfo?.enabled ?? 'n/a'} `
      + `errors=${result.errors.length} screenshot=${result.screenshot}`,
    );
  }
  if (report.status !== 'pass') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
