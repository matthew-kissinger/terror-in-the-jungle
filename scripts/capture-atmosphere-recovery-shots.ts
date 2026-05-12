#!/usr/bin/env tsx

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { parseServerModeArg, startServer, stopServer, type ServerHandle } from './preview-server';

type ViewKind = 'ground-readability' | 'sky-coverage' | 'aircraft-clouds';

type ViewPlan = {
  kind: ViewKind;
  x: number;
  z: number;
  heightAGL: number;
  yawDeg: number;
  pitchDeg: number;
};

type ScenarioPlan = {
  key: string;
  mode: string;
  description: string;
  settleSec: number;
  views: ViewPlan[];
};

type CaptureSummary = {
  generatedAt: string;
  url: string;
  serverMode: string;
  outputDir: string;
  scenarios: Array<{
    key: string;
    mode: string;
    description: string;
    shots: Array<{
      kind: ViewKind;
      file: string;
      metrics: unknown;
      imageMetrics: unknown;
    }>;
    cloudFollowCheck: unknown;
    navDiagnostics?: unknown;
    browserErrors?: string[];
    browserWarnings?: string[];
    error?: string;
  }>;
};

type ImageMetrics = {
  width: number;
  height: number;
  skyCropHeight: number;
  lumaMean: number;
  lumaStdDev: number;
  lumaP10: number;
  lumaP90: number;
  meanLocalContrast: number;
  maxRowMeanDelta: number;
  cloudTextureScore: number;
  cloudLegibility: 'pass' | 'warn';
};

const DEFAULT_PORT = 9224;
const VIEWPORT = { width: 1600, height: 900 };
const STARTUP_TIMEOUT_MS = 120_000;

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function argValue(name: string): string | undefined {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
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

function parseOutputDir(): string {
  const raw = argValue('--out-dir');
  if (raw) return raw;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(process.cwd(), 'artifacts', 'architecture-recovery', 'cycle9-atmosphere', stamp);
}

function shouldBuild(): boolean {
  return !process.argv.includes('--no-build');
}

function poseAwayFromSun(azimuthRad: number, kind: ViewKind, heightAGL: number, pitchDeg: number): ViewPlan {
  const viewAz = azimuthRad + Math.PI;
  const sx = Math.cos(viewAz);
  const sz = Math.sin(viewAz);
  const yawRad = Math.atan2(sx, -sz);
  return {
    kind,
    // NaN means "use the current live player XZ". This keeps terrain,
    // vegetation residency, and camera evidence on the same runtime anchor.
    x: Number.NaN,
    z: Number.NaN,
    heightAGL,
    yawDeg: (yawRad * 180) / Math.PI,
    pitchDeg,
  };
}

async function analyzeImage(file: string): Promise<ImageMetrics> {
  const source = sharp(file);
  const metadata = await source.metadata();
  const width = metadata.width ?? VIEWPORT.width;
  const height = metadata.height ?? VIEWPORT.height;
  const skyCropHeight = Math.max(1, Math.floor(height * 0.52));
  const { data, info } = await source
    .extract({ left: 0, top: 0, width, height: skyCropHeight })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const lumas: number[] = [];
  const rowMeans: number[] = [];
  let sum = 0;
  let sumSq = 0;
  let localContrastSum = 0;
  let localContrastCount = 0;

  for (let y = 0; y < info.height; y++) {
    let rowSum = 0;
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const luma = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      lumas.push(luma);
      sum += luma;
      sumSq += luma * luma;
      rowSum += luma;

      if (x >= 8) {
        const prevIdx = (y * info.width + (x - 8)) * info.channels;
        const prev = 0.2126 * data[prevIdx] + 0.7152 * data[prevIdx + 1] + 0.0722 * data[prevIdx + 2];
        localContrastSum += Math.abs(luma - prev);
        localContrastCount++;
      }
      if (y >= 8) {
        const prevIdx = ((y - 8) * info.width + x) * info.channels;
        const prev = 0.2126 * data[prevIdx] + 0.7152 * data[prevIdx + 1] + 0.0722 * data[prevIdx + 2];
        localContrastSum += Math.abs(luma - prev);
        localContrastCount++;
      }
    }
    rowMeans.push(rowSum / info.width);
  }

  lumas.sort((a, b) => a - b);
  const count = Math.max(1, lumas.length);
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  let maxRowMeanDelta = 0;
  for (let i = 1; i < rowMeans.length; i++) {
    maxRowMeanDelta = Math.max(maxRowMeanDelta, Math.abs(rowMeans[i] - rowMeans[i - 1]));
  }
  const meanLocalContrast = localContrastSum / Math.max(1, localContrastCount);
  const cloudTextureScore = Math.sqrt(variance) + meanLocalContrast * 0.65;
  const lumaP10 = lumas[Math.floor(count * 0.10)] ?? mean;
  const lumaP90 = lumas[Math.floor(count * 0.90)] ?? mean;

  return {
    width,
    height,
    skyCropHeight,
    lumaMean: Number(mean.toFixed(2)),
    lumaStdDev: Number(Math.sqrt(variance).toFixed(2)),
    lumaP10: Number(lumaP10.toFixed(2)),
    lumaP90: Number(lumaP90.toFixed(2)),
    meanLocalContrast: Number(meanLocalContrast.toFixed(2)),
    maxRowMeanDelta: Number(maxRowMeanDelta.toFixed(2)),
    cloudTextureScore: Number(cloudTextureScore.toFixed(2)),
    cloudLegibility: cloudTextureScore >= 8 ? 'pass' : 'warn',
  };
}

function plans(): ScenarioPlan[] {
  return [
    {
      key: 'ashau',
      mode: 'a_shau_valley',
      description: 'A Shau Valley dawn haze and jungle readability',
      settleSec: 8,
      views: [
        poseAwayFromSun(Math.PI * 0.15, 'ground-readability', 6, 2),
        poseAwayFromSun(Math.PI * 0.15, 'sky-coverage', 250, 35),
        poseAwayFromSun(Math.PI * 0.15, 'aircraft-clouds', 650, 24),
      ],
    },
    {
      key: 'openfrontier',
      mode: 'open_frontier',
      description: 'Open Frontier noon scattered clouds and fog readability',
      settleSec: 6,
      views: [
        poseAwayFromSun(Math.PI * 0.25, 'ground-readability', 8, 4),
        poseAwayFromSun(Math.PI * 0.25, 'sky-coverage', 250, 35),
        poseAwayFromSun(Math.PI * 0.25, 'aircraft-clouds', 750, 24),
      ],
    },
    {
      key: 'tdm',
      mode: 'tdm',
      description: 'Team deathmatch dusk overcast',
      settleSec: 6,
      views: [
        poseAwayFromSun(Math.PI * 1.1, 'ground-readability', 8, 4),
        poseAwayFromSun(Math.PI * 1.1, 'sky-coverage', 250, 35),
        poseAwayFromSun(Math.PI * 1.1, 'aircraft-clouds', 700, 24),
      ],
    },
    {
      key: 'zc',
      mode: 'zone_control',
      description: 'Zone control golden-hour broken clouds',
      settleSec: 6,
      views: [
        poseAwayFromSun(Math.PI * 0.78, 'ground-readability', 8, 4),
        poseAwayFromSun(Math.PI * 0.78, 'sky-coverage', 250, 35),
        poseAwayFromSun(Math.PI * 0.78, 'aircraft-clouds', 700, 24),
      ],
    },
    {
      key: 'combat120',
      mode: 'ai_sandbox',
      description: 'AI sandbox noon perf baseline atmosphere',
      settleSec: 6,
      views: [
        poseAwayFromSun(Math.PI * 0.25, 'ground-readability', 8, 4),
        poseAwayFromSun(Math.PI * 0.25, 'sky-coverage', 250, 35),
        poseAwayFromSun(Math.PI * 0.25, 'aircraft-clouds', 750, 24),
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
  logStep(`Starting mode ${mode}`);
  await page.evaluate(async (m: string) => {
    const engine = (window as any).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(m);
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
      logStep('Dismissed mission briefing');
    }
  } catch {
    // Briefing absent.
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

async function poseAndRender(page: Page, view: ViewPlan): Promise<unknown> {
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
      const water = engine?.systemManager?.waterSystem;
      if (!engine || !camera || !threeRenderer || !scene) {
        throw new Error('engine/camera/renderer/scene unavailable');
      }

      const playerPos = typeof playerController?.getPosition === 'function'
        ? playerController.getPosition()
        : null;
      const anchorX = Number.isFinite(p.x) ? p.x : Number(playerPos?.x ?? 0);
      const anchorZ = Number.isFinite(p.z) ? p.z : Number(playerPos?.z ?? 0);

      let terrainY = 0;
      if (terrain && typeof terrain.getHeightAt === 'function') {
        const sampled = Number(terrain.getHeightAt(anchorX, anchorZ));
        terrainY = Number.isFinite(sampled) ? sampled : 0;
      }
      let effectiveTerrainY = terrainY;
      if (terrain && typeof terrain.getEffectiveHeightAt === 'function') {
        const sampled = Number(terrain.getEffectiveHeightAt(anchorX, anchorZ));
        effectiveTerrainY = Number.isFinite(sampled) ? sampled : terrainY;
      }
      const cameraY = terrainY + p.heightAGL;

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

      camera.position.set(anchorX, cameraY, anchorZ);
      camera.rotation.order = 'YXZ';
      camera.rotation.set((p.pitchDeg * Math.PI) / 180, (p.yawDeg * Math.PI) / 180, 0);
      camera.updateMatrixWorld(true);

      terrain?.updatePlayerPosition?.(camera.position);
      for (let i = 0; i < 8; i++) {
        terrain?.update?.(0.016);
        billboards?.update?.(0.016, renderer?.fog ?? null);
      }

      atmosphere?.syncDomePosition?.(camera.position);
      atmosphere?.setTerrainYAtCamera?.(terrainY);
      atmosphere?.update?.(0.5);

      if (post && typeof post.beginFrame === 'function') post.beginFrame();
      threeRenderer.render(scene, camera);
      if (post && typeof post.endFrame === 'function') post.endFrame();

      const cloud = scene.getObjectByName?.('CloudLayer') as any;
      const fog = renderer?.fog;
      const preset = atmosphere?.getCurrentPreset?.();
      const cloudAnchorDebug = atmosphere?.getCloudAnchorDebug?.() ?? null;
      const rendererInfo = typeof (window as any).__rendererInfo === 'function'
        ? (window as any).__rendererInfo()
        : null;
      const waterMetrics = typeof water?.getDebugInfo === 'function'
        ? water.getDebugInfo()
        : null;
      const waterLevel = typeof (waterMetrics as { waterLevel?: unknown } | null)?.waterLevel === 'number'
        ? Number((waterMetrics as { waterLevel: number }).waterLevel)
        : null;
      const waterVisible = Boolean((waterMetrics as { waterVisible?: unknown } | null)?.waterVisible);
      const waterEnabled = Boolean((waterMetrics as { enabled?: unknown } | null)?.enabled);
      const cameraClearanceRaw = camera.position.y - terrainY;
      const cameraClearanceEffective = camera.position.y - effectiveTerrainY;
      const cameraClearanceToWater = waterLevel === null ? null : camera.position.y - waterLevel;
      const cameraBelowTerrain = cameraClearanceRaw < -0.05 || cameraClearanceEffective < -0.05;
      const waterExposedByTerrainClip = waterEnabled && waterVisible && cameraBelowTerrain;
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
          activeTilesSample: typeof terrain.getActiveTilesForDebug === 'function'
            ? terrain.getActiveTilesForDebug().slice(0, 8)
            : null,
          vegetationActiveTotal,
          billboardDebug,
        }
        : null;
      if (p.kind === 'ground-readability') {
        const activeTerrainTiles = Number(terrainMetrics?.activeTerrainTiles ?? 0);
        const hasTerrainAtCamera = terrainMetrics?.hasTerrainAtCamera;
        if (hasTerrainAtCamera === false || activeTerrainTiles <= 0) {
          throw new Error(
            `Terrain visibility contract failed for ${p.kind}: hasTerrainAtCamera=${hasTerrainAtCamera} activeTerrainTiles=${activeTerrainTiles} vegetationActiveTotal=${vegetationActiveTotal}`
          );
        }
      }
      const renderText = typeof (window as any).render_game_to_text === 'function'
        ? (window as any).render_game_to_text()
        : null;

      return {
        view: p.kind,
        anchor: {
          requestedX: p.x,
          requestedZ: p.z,
          playerX: playerPos?.x ?? null,
          playerZ: playerPos?.z ?? null,
        },
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        terrainY,
        effectiveTerrainY,
        clipDiagnostics: {
          cameraClearanceRaw,
          cameraClearanceEffective,
          cameraBelowTerrain,
          waterLevel,
          cameraClearanceToWater,
          waterEnabled,
          waterVisible,
          waterExposedByTerrainClip,
        },
        terrain: terrainMetrics,
        water: waterMetrics,
        atmosphere: {
          scenario: atmosphere?.getCurrentScenario?.() ?? null,
          presetLabel: preset?.label ?? null,
          fogDensity: fog?.density ?? null,
          fogColorHex: fog?.color?.getHexString?.() ?? null,
          cloudCoverage: atmosphere?.getCoverage?.() ?? null,
          cloudScaleMetersPerFeature: preset?.cloudScaleMetersPerFeature ?? null,
          cloudAnchor: cloudAnchorDebug,
        },
        cloud: cloud
          ? {
            visible: Boolean(cloud.visible),
            x: cloud.position.x,
            y: cloud.position.y,
            z: cloud.position.z,
            edgeFade: cloud.material?.uniforms?.uEdgeFade?.value ?? null,
            coverageUniform: cloud.material?.uniforms?.uCoverage?.value ?? null,
            noiseScale: cloud.material?.uniforms?.uNoiseScale?.value ?? null,
          }
          : null,
        rendererInfo,
        renderText,
      };
    },
    { p: view, vp: VIEWPORT }
  );
}

async function cloudFollowCheck(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const engine = (window as any).__engine;
    const renderer = engine?.renderer;
    const scene = renderer?.scene;
    const camera = renderer?.camera;
    const atmosphere = engine?.systemManager?.atmosphereSystem;
    const terrain = engine?.systemManager?.terrainSystem;
    const cloud = scene?.getObjectByName?.('CloudLayer') as any;
    if (!camera || !atmosphere) return { available: false };

    const samples: Array<{
      cameraX: number;
      cameraZ: number;
      anchorX: number | null;
      anchorZ: number | null;
      cloudX: number | null;
      cloudZ: number | null;
      cloudY: number | null;
      model: string | null;
    }> = [];
    const positions = [
      { x: 0, z: 0 },
      { x: 3000, z: 3000 },
    ];

    for (const pos of positions) {
      let terrainY = 0;
      if (terrain && typeof terrain.getHeightAt === 'function') {
        const h = Number(terrain.getHeightAt(pos.x, pos.z));
        terrainY = Number.isFinite(h) ? h : 0;
      }
      camera.position.set(pos.x, terrainY + 500, pos.z);
      camera.updateMatrixWorld(true);
      atmosphere.syncDomePosition?.(camera.position);
      atmosphere.setTerrainYAtCamera?.(terrainY);
      atmosphere.update?.(0);
      const cloudAnchor = atmosphere.getCloudAnchorDebug?.() ?? null;
      samples.push({
        cameraX: camera.position.x,
        cameraZ: camera.position.z,
        anchorX: typeof cloudAnchor?.anchorX === 'number' ? cloudAnchor.anchorX : null,
        anchorZ: typeof cloudAnchor?.anchorZ === 'number' ? cloudAnchor.anchorZ : null,
        cloudX: typeof cloud?.position?.x === 'number' ? cloud.position.x : null,
        cloudZ: typeof cloud?.position?.z === 'number' ? cloud.position.z : null,
        cloudY: typeof cloud?.position?.y === 'number' ? cloud.position.y : null,
        model: typeof cloudAnchor?.model === 'string' ? cloudAnchor.model : null,
      });
    }

    const a = samples[0];
    const b = samples[1];
    const anchorDeltaX = (b.anchorX ?? 0) - (a.anchorX ?? 0);
    const anchorDeltaZ = (b.anchorZ ?? 0) - (a.anchorZ ?? 0);
    const cameraDeltaX = b.cameraX - a.cameraX;
    const cameraDeltaZ = b.cameraZ - a.cameraZ;
    return {
      available: true,
      finiteCloudLayerPresent: Boolean(cloud),
      model: b.model ?? a.model ?? null,
      first: a,
      second: b,
      anchorDeltaX,
      anchorDeltaZ,
      cameraDeltaX,
      cameraDeltaZ,
      anchorTracksCameraXZ: Math.abs(anchorDeltaX - cameraDeltaX) < 0.01
        && Math.abs(anchorDeltaZ - cameraDeltaZ) < 0.01,
    };
  });
}

async function navDiagnostics(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const engine = (window as any).__engine;
    const systems = engine?.systemManager;
    const nav = systems?.navmeshSystem;
    const terrain = systems?.terrainSystem;
    const config = systems?.gameModeManager?.getCurrentConfig?.();
    const mode = systems?.gameModeManager?.getCurrentMode?.() ?? null;
    const zones = Array.isArray(config?.zones) ? config.zones : [];
    if (!nav || !terrain || zones.length === 0) {
      return {
        available: false,
        mode,
        reason: !nav ? 'navmeshSystem missing' : !terrain ? 'terrainSystem missing' : 'zones missing',
      };
    }

    const homeBases = zones.filter((z: any) => Boolean(z?.isHomeBase));
    const representatives = homeBases.length >= 2
      ? homeBases
      : [zones[0], zones[zones.length - 1]].filter(Boolean);
    const repRows = representatives.map((z: any) => {
      const x = Number(z?.position?.x ?? 0);
      const zz = Number(z?.position?.z ?? 0);
      const yRaw = Number(terrain.getHeightAt?.(x, zz) ?? 0);
      const y = Number.isFinite(yRaw) ? yRaw : 0;
      const radius = Math.max(Number(z?.radius ?? 0) + 20, 60);
      const raw = { x, y, z: zz };
      const snapped = nav.findNearestPoint?.(raw, radius) ?? null;
      return {
        id: z?.id ?? null,
        name: z?.name ?? null,
        radius,
        raw,
        snapped: snapped ? { x: snapped.x, y: snapped.y, z: snapped.z } : null,
        snapDistanceHorizontal: snapped ? Math.hypot(snapped.x - x, snapped.z - zz) : null,
      };
    });

    const snappedPoints = repRows
      .map((row) => row.snapped)
      .filter((point): point is { x: number; y: number; z: number } => point !== null);
    const connectivity = typeof nav.validateConnectivity === 'function' && snappedPoints.length >= 2
      ? nav.validateConnectivity(snappedPoints)
      : null;
    const pairs: Array<{
      from: string | null;
      to: string | null;
      pathFound: boolean;
      waypointCount: number;
      horizontalDistance: number;
      pathDistance: number | null;
      maxSegmentDistance: number | null;
    }> = [];
    for (let i = 0; i < snappedPoints.length; i++) {
      for (let j = i + 1; j < snappedPoints.length; j++) {
        const path = nav.queryPath?.(snappedPoints[i], snappedPoints[j]) ?? null;
        let pathDistance = 0;
        let maxSegmentDistance = 0;
        if (Array.isArray(path)) {
          for (let k = 1; k < path.length; k++) {
            const a = path[k - 1];
            const b = path[k];
            const dist = Math.hypot(Number(b.x) - Number(a.x), Number(b.z) - Number(a.z));
            pathDistance += dist;
            maxSegmentDistance = Math.max(maxSegmentDistance, dist);
          }
        }
        pairs.push({
          from: repRows[i]?.name ?? null,
          to: repRows[j]?.name ?? null,
          pathFound: Array.isArray(path) && path.length > 0,
          waypointCount: Array.isArray(path) ? path.length : 0,
          horizontalDistance: Math.hypot(snappedPoints[j].x - snappedPoints[i].x, snappedPoints[j].z - snappedPoints[i].z),
          pathDistance: Array.isArray(path) ? pathDistance : null,
          maxSegmentDistance: Array.isArray(path) ? maxSegmentDistance : null,
        });
      }
    }

    return {
      available: true,
      mode,
      worldSize: config?.worldSize ?? null,
      navReady: Boolean(nav.isReady?.()),
      wasmReady: Boolean(nav.isWasmReady?.()),
      representativeCount: repRows.length,
      snappedRepresentativeCount: snappedPoints.length,
      representatives: repRows,
      connected: connectivity ? Boolean(connectivity.connected) : null,
      islands: connectivity?.islands ?? null,
      pairs,
    };
  });
}

async function snap(page: Page, outFile: string): Promise<void> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(outFile, buffer);
  logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
}

async function captureScenario(page: Page, outputDir: string, plan: ScenarioPlan) {
  await startMode(page, plan.mode);
  await dismissBriefingIfPresent(page);
  await page.waitForTimeout(plan.settleSec * 1000);
  await hideUi(page);

  const shots: Array<{ kind: ViewKind; file: string; metrics: unknown; imageMetrics: unknown }> = [];
  for (const view of plan.views) {
    const metrics = await poseAndRender(page, view);
    const file = join(outputDir, `${plan.key}-${view.kind}.png`);
    await snap(page, file);
    const imageMetrics = await analyzeImage(file);
    shots.push({ kind: view.kind, file, metrics, imageMetrics });
  }

  let follow: unknown;
  try {
    follow = await cloudFollowCheck(page);
  } catch (error) {
    follow = {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const nav = await navDiagnostics(page);
  if (plan.key === 'ashau') {
    const result = nav as {
      navReady?: boolean;
      representativeCount?: number;
      snappedRepresentativeCount?: number;
      connected?: boolean | null;
    };
    if (!result.navReady || (result.representativeCount ?? 0) < 2 || result.snappedRepresentativeCount !== result.representativeCount || result.connected === false) {
      throw new Error(
        `A Shau nav gate failed: ready=${result.navReady} reps=${result.representativeCount} snapped=${result.snappedRepresentativeCount} connected=${result.connected}`
      );
    }
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
    cloudFollowCheck: follow,
    navDiagnostics: nav,
  };
}

async function main(): Promise<void> {
  const outputDir = parseOutputDir();
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const port = parsePort();
  const serverMode = parseServerModeArg(process.argv, 'perf');
  const url = `http://127.0.0.1:${port}/?perf=1&diag=1&uiTransitions=0&logLevel=warn`;
  const summary: CaptureSummary = {
    generatedAt: new Date().toISOString(),
    url,
    serverMode,
    outputDir,
    scenarios: [],
  };

  let server: ServerHandle | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    server = await startServer({
      mode: serverMode,
      port,
      buildIfMissing: true,
      forceBuild: shouldBuild() && serverMode !== 'dev',
      log: logStep,
    });

    browser = await chromium.launch({ headless: true });
    for (const plan of plans()) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      const browserErrors: string[] = [];
      const browserWarnings: string[] = [];
      page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error') {
          browserErrors.push(text);
          console.error(`[browser:${plan.key}] ${text}`);
        } else if (msg.type() === 'warning') {
          browserWarnings.push(text);
          console.warn(`[browser:${plan.key}:warn] ${text}`);
        }
      });
      page.on('pageerror', (err) => {
        browserErrors.push(err.message);
        console.error(`[pageerror:${plan.key}] ${err.message}`);
      });
      try {
        logStep(`Navigating to ${url} for ${plan.key}`);
        await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
        await waitForEngine(page);
        summary.scenarios.push({
          ...await captureScenario(page, outputDir, plan),
          browserErrors,
          browserWarnings,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed scenario ${plan.key}: ${message}`);
        summary.scenarios.push({
          key: plan.key,
          mode: plan.mode,
          description: plan.description,
          shots: [],
          cloudFollowCheck: null,
          browserErrors,
          browserWarnings,
          error: message,
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    const summaryFile = join(outputDir, 'summary.json');
    writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');
    logStep(`Wrote ${summaryFile}`);
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-atmosphere-recovery-shots failed:', err);
  process.exit(1);
});
