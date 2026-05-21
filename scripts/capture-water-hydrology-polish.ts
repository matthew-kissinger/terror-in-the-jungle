#!/usr/bin/env tsx
import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9127;
const VIEWPORT = { width: 1280, height: 720 };
const STARTUP_TIMEOUT_MS = 180_000;

interface ShotSpec {
  mode: 'open_frontier' | 'a_shau_valley';
  name: string;
  target: { x: number; z: number };
  distanceMeters: number;
  heightMeters: number;
  bearingDeg: number;
  observer?: boolean;
  fullMap?: boolean;
}

const SHOTS: ShotSpec[] = [
  {
    mode: 'open_frontier',
    name: 'open-frontier-pbr-river-player',
    target: { x: 396, z: 876 },
    distanceMeters: 132,
    heightMeters: 36,
    bearingDeg: 215,
    observer: true,
  },
  {
    mode: 'open_frontier',
    name: 'open-frontier-sampan-river-player',
    target: { x: -324, z: 384 },
    distanceMeters: 82,
    heightMeters: 5.5,
    bearingDeg: 30,
  },
  {
    mode: 'open_frontier',
    name: 'open-frontier-river-oblique',
    target: { x: 396, z: 876 },
    distanceMeters: 180,
    heightMeters: 58,
    bearingDeg: 210,
    observer: true,
  },
  {
    mode: 'open_frontier',
    name: 'open-frontier-full-map-water-boats',
    target: { x: 396, z: 876 },
    distanceMeters: 110,
    heightMeters: 18,
    bearingDeg: 225,
    fullMap: true,
  },
  {
    mode: 'a_shau_valley',
    name: 'ashau-pbr-tributary-player',
    target: { x: 1188.9, z: 1743.72 },
    distanceMeters: 110,
    heightMeters: 8,
    bearingDeg: 225,
  },
  {
    mode: 'a_shau_valley',
    name: 'ashau-sampan-main-river-player',
    target: { x: -6895, z: 4835 },
    distanceMeters: 135,
    heightMeters: 8,
    bearingDeg: 35,
  },
  {
    mode: 'a_shau_valley',
    name: 'ashau-main-river-oblique',
    target: { x: -6895, z: 4835 },
    distanceMeters: 260,
    heightMeters: 96,
    bearingDeg: 30,
    observer: true,
  },
  {
    mode: 'a_shau_valley',
    name: 'ashau-full-map-water-boats',
    target: { x: 1188.9, z: 1743.72 },
    distanceMeters: 140,
    heightMeters: 24,
    bearingDeg: 225,
    fullMap: true,
  },
];

type VectorLike = {
  x: number;
  y: number;
  z: number;
  set?: (x: number, y: number, z: number) => void;
  copy?: (position: VectorLike) => void;
  clone?: () => VectorLike;
};

type CameraLike = {
  near: number;
  far: number;
  aspect?: number;
  position: VectorLike;
  clone?: () => CameraLike;
  lookAt?: (x: number, y: number, z: number) => void;
  updateProjectionMatrix?: () => void;
  updateMatrixWorld?: (force?: boolean) => void;
};

type TerrainSystemLike = {
  getEffectiveHeightAt?: (x: number, z: number) => number;
  getHeightAt?: (x: number, z: number) => number;
  hasTerrainAt?: (x: number, z: number) => boolean;
  isAreaReadyAt?: (x: number, z: number) => boolean;
  getActiveTerrainTileCount?: () => number;
  getActiveTilesForDebug?: () => unknown[];
  getStreamingMetrics?: () => unknown[];
  updatePlayerPosition?: (position: VectorLike) => void;
  setRenderCameraOverride?: (camera: CameraLike | null) => void;
  update?: (dt: number) => void;
};

type WaterSampleLike = {
  source?: string;
  surfaceY?: number | null;
  depth?: number;
  flowVelocity?: { x?: number; y?: number; z?: number };
};

type WaterSystemLike = {
  getWaterSurfaceY?: (position: { x: number; y: number; z: number }) => number | null;
  sampleWaterInteraction?: (
    position: { x: number; y: number; z: number },
    options?: { immersionDepthMeters?: number },
  ) => WaterSampleLike;
  getDebugInfo?: () => unknown;
};

type EngineLike = {
  gameStarted?: boolean;
  startGameWithMode?: (mode: string) => Promise<void>;
  renderer?: {
    camera?: CameraLike;
    setOverrideCamera?: (camera: CameraLike | null) => void;
  };
  systemManager?: {
    playerController?: {
      getPosition?: () => VectorLike;
      teleport?: (position: VectorLike) => void;
      setPosition?: (position: VectorLike, reason?: string) => void;
      setViewAngles?: (yaw: number, pitch?: number) => void;
    };
    terrainSystem?: TerrainSystemLike;
    waterSystem?: WaterSystemLike;
    globalBillboardSystem?: {
      update?: (dt: number) => void;
      getDebugInfo?: () => unknown;
    };
    fullMapSystem?: {
      getIsVisible?: () => boolean;
      toggleVisibility?: () => void;
      update?: (dt: number) => void;
    };
  };
};

interface FrameResult {
  name: string;
  valid: boolean;
  fullMap: boolean;
  camera: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  target: { requestedX: number; requestedZ: number; resolvedX: number; resolvedZ: number; distanceFromRequested: number };
  water: {
    surfaceY: number | null;
    source: string | null;
    flowVelocity: { x: number; y: number; z: number; speed: number };
    debugInfo: unknown;
  };
  terrain: {
    cameraTerrainY: number;
    targetTerrainY: number;
    hasTerrainAtCamera: boolean | null;
    areaReadyAtCamera: boolean | null;
    hasTerrainAtTarget: boolean | null;
    areaReadyAtTarget: boolean | null;
    activeTerrainTiles: number | null;
    activeTilesSample: unknown[];
    streamingMetrics: unknown[];
  };
  vegetation: {
    billboardDebug: unknown;
  };
  invalidReasons: string[];
}

interface ShotResult extends FrameResult {
  mode: ShotSpec['mode'];
  file: string;
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const win = window as unknown as { __engine?: EngineLike };
    return Boolean(win.__engine?.startGameWithMode);
  }, undefined, { timeout: STARTUP_TIMEOUT_MS });
}

async function startMode(page: Page, mode: ShotSpec['mode']): Promise<void> {
  await page.evaluate(async (requestedMode) => {
    const engine = (window as unknown as { __engine?: EngineLike }).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode missing');
    await engine.startGameWithMode(requestedMode);
  }, mode);

  await page.waitForFunction((requestedMode) => {
    const engine = (window as unknown as { __engine?: EngineLike }).__engine;
    return engine?.gameStarted === true && requestedMode;
  }, mode, { timeout: STARTUP_TIMEOUT_MS });
  await page.waitForTimeout(mode === 'a_shau_valley' ? 7_000 : 4_000);
}

async function dismissBriefingIfPresent(page: Page): Promise<void> {
  const beginBtn = page.locator('[data-ref="beginBtn"]');
  try {
    if (await beginBtn.isVisible({ timeout: 1500 })) {
      await beginBtn.click();
      await page.waitForTimeout(400);
    }
  } catch {
    // Briefing is not present in perf capture flows.
  }
}

async function frameShot(page: Page, spec: ShotSpec): Promise<FrameResult> {
  return page.evaluate((shot) => {
    function __name<T>(target: T, _value: string): T {
      return target;
    }

    const engine = (window as unknown as { __engine?: EngineLike }).__engine;
    const camera = engine?.renderer?.camera;
    const player = engine?.systemManager?.playerController;
    const terrain = engine?.systemManager?.terrainSystem;
    const water = engine?.systemManager?.waterSystem;
    const billboards = engine?.systemManager?.globalBillboardSystem;
    if (!engine || !camera || !player || !terrain || !water) {
      throw new Error('engine/player/camera/terrain/water unavailable');
    }

    const sampleWater = (x: number, z: number): {
      x: number;
      z: number;
      surfaceY: number | null;
      source: string | null;
      flowVelocity: { x: number; y: number; z: number; speed: number };
    } | null => {
      const surfaceY = water.getWaterSurfaceY?.({ x, y: 0, z }) ?? null;
      if (!Number.isFinite(surfaceY)) return null;
      const sample = water.sampleWaterInteraction?.(
        { x, y: (surfaceY as number) - 1, z },
        { immersionDepthMeters: 2 },
      ) ?? null;
      const flowX = Number(sample?.flowVelocity?.x ?? 0);
      const flowZ = Number(sample?.flowVelocity?.z ?? 0);
      return {
        x,
        z,
        surfaceY: surfaceY as number,
        source: sample?.source ?? null,
        flowVelocity: {
          x: flowX,
          y: Number(sample?.flowVelocity?.y ?? 0),
          z: flowZ,
          speed: Math.hypot(flowX, flowZ),
        },
      };
    };

    const resolveWetTarget = (): NonNullable<ReturnType<typeof sampleWater>> => {
      const direct = sampleWater(shot.target.x, shot.target.z);
      if (direct?.source === 'hydrology') return direct;

      const candidates: NonNullable<ReturnType<typeof sampleWater>>[] = [];
      for (const radius of [18, 36, 72, 120, 180, 260, 360]) {
        for (let i = 0; i < 24; i++) {
          const theta = (i / 24) * Math.PI * 2;
          const x = shot.target.x + Math.cos(theta) * radius;
          const z = shot.target.z + Math.sin(theta) * radius;
          const sample = sampleWater(x, z);
          if (sample?.source === 'hydrology') candidates.push(sample);
        }
      }
      candidates.sort((a, b) =>
        ((a.x - shot.target.x) ** 2 + (a.z - shot.target.z) ** 2)
        - ((b.x - shot.target.x) ** 2 + (b.z - shot.target.z) ** 2)
      );
      const best = candidates[0];
      if (!best) throw new Error(`No hydrology water sample near ${shot.name}`);
      return best;
    };

    const target = resolveWetTarget();
    const targetTerrainY = Number(
      terrain.getEffectiveHeightAt?.(target.x, target.z)
      ?? terrain.getHeightAt?.(target.x, target.z)
      ?? target.surfaceY
      ?? 0,
    );
    const flow = target.flowVelocity;
    const flowLength = Math.hypot(flow.x, flow.z);
    const lookFlowX = flowLength > 0.001 ? flow.x / flowLength : 0;
    const lookFlowZ = flowLength > 0.001 ? flow.z / flowLength : 1;
    const lookAt = {
      x: target.x + lookFlowX * (shot.fullMap ? 120 : 70),
      y: (target.surfaceY ?? targetTerrainY) + (shot.fullMap ? 4 : 1.5),
      z: target.z + lookFlowZ * (shot.fullMap ? 120 : 70),
    };

    const angleOffsets = [0, -35, 35, -70, 70, 110, -110, 180];
    const distanceOffsets = [0, 28, 58, -18, 92];
    let selected: {
      x: number;
      y: number;
      z: number;
      terrainY: number;
      hasTerrainAtCamera: boolean | null;
      areaReadyAtCamera: boolean | null;
    } | null = null;

    const moveRuntimeAnchor = (x: number, y: number, z: number): void => {
      const position = player.getPosition?.()?.clone?.() ?? camera.position.clone?.();
      if (!position?.set) return;
      position.set(x, y, z);
      if (typeof player.teleport === 'function') {
        player.teleport(position);
      } else {
        player.setPosition?.(position, 'harness.water-hydrology-polish');
      }
      terrain.updatePlayerPosition?.(position);
      for (let i = 0; i < 36; i++) {
        terrain.update?.(0.016);
        billboards?.update?.(0.016);
      }
    };

    for (const angleOffset of angleOffsets) {
      const bearingRad = ((shot.bearingDeg + angleOffset) * Math.PI) / 180;
      for (const distanceOffset of distanceOffsets) {
        const distance = Math.max(36, shot.distanceMeters + distanceOffset);
        const eyeX = target.x + Math.cos(bearingRad) * distance;
        const eyeZ = target.z + Math.sin(bearingRad) * distance;
        const hasTerrain = terrain.hasTerrainAt?.(eyeX, eyeZ) ?? null;
        if (hasTerrain === false) continue;
        const terrainY = Number(
          terrain.getEffectiveHeightAt?.(eyeX, eyeZ)
          ?? terrain.getHeightAt?.(eyeX, eyeZ)
          ?? target.surfaceY
          ?? 0,
        );
        if (!Number.isFinite(terrainY)) continue;
        const eyeWater = sampleWater(eyeX, eyeZ);
        if (!shot.fullMap && eyeWater?.source === 'hydrology') continue;
        const eyeWaterSurface = Number.isFinite(eyeWater?.surfaceY) ? Number(eyeWater?.surfaceY) : -Infinity;
        const targetSurfaceY = Number.isFinite(target.surfaceY) ? Number(target.surfaceY) : targetTerrainY;
        const eyeY = Math.max(
          terrainY + shot.heightMeters,
          eyeWaterSurface + 3.2,
          targetSurfaceY + shot.heightMeters,
        );
        moveRuntimeAnchor(eyeX, eyeY, eyeZ);
        const areaReady = terrain.isAreaReadyAt?.(eyeX, eyeZ) ?? null;
        if (areaReady === false) continue;
        selected = {
          x: eyeX,
          y: eyeY,
          z: eyeZ,
          terrainY,
          hasTerrainAtCamera: hasTerrain,
          areaReadyAtCamera: areaReady,
        };
        break;
      }
      if (selected) break;
    }
    if (!selected) {
      throw new Error(`No loaded terrain camera pose found for ${shot.name}`);
    }

    moveRuntimeAnchor(selected.x, selected.y, selected.z);

    const vx = lookAt.x - selected.x;
    const vy = lookAt.y - selected.y;
    const vz = lookAt.z - selected.z;
    const horizontal = Math.max(0.001, Math.hypot(vx, vz));
    const yaw = Math.atan2(-vx, -vz);
    const pitch = -Math.atan2(vy, horizontal);

    const fullMap = engine.systemManager?.fullMapSystem;
    if (shot.fullMap) {
      if (fullMap?.getIsVisible?.() !== true) fullMap?.toggleVisibility?.();
      fullMap?.update?.(0.016);
    } else if (fullMap?.getIsVisible?.() === true) {
      fullMap.toggleVisibility?.();
    }

    engine.renderer?.setOverrideCamera?.(null);
    terrain.setRenderCameraOverride?.(null);
    if (!shot.fullMap) {
      if (camera.clone && engine.renderer?.setOverrideCamera) {
        const override = camera.clone();
        override.position.set?.(selected.x, selected.y, selected.z);
        override.near = 0.1;
        override.far = Math.max(override.far, 30_000);
        override.lookAt?.(lookAt.x, lookAt.y, lookAt.z);
        override.updateProjectionMatrix?.();
        override.updateMatrixWorld?.(true);
        engine.renderer.setOverrideCamera(override);
        terrain.setRenderCameraOverride?.(override);
      } else {
        player.setViewAngles?.(yaw, pitch);
        const position = player.getPosition?.()?.clone?.() ?? camera.position.clone?.();
        position?.set?.(selected.x, selected.y, selected.z);
        if (position?.set) {
          camera.position.copy?.(position);
        } else {
          camera.position.set?.(selected.x, selected.y, selected.z);
        }
        camera.lookAt?.(lookAt.x, lookAt.y, lookAt.z);
        camera.updateMatrixWorld?.(true);
      }
    } else if (camera.clone && engine.renderer?.setOverrideCamera) {
      const override = camera.clone();
      override.position.set?.(selected.x, selected.y + Math.max(28, shot.heightMeters), selected.z);
      override.near = 0.1;
      override.far = Math.max(override.far, 30_000);
      override.lookAt?.(lookAt.x, lookAt.y, lookAt.z);
      override.updateProjectionMatrix?.();
      override.updateMatrixWorld?.(true);
      engine.renderer.setOverrideCamera(override);
      terrain.setRenderCameraOverride?.(override);
    }

    const hasTerrainAtTarget = terrain.hasTerrainAt?.(target.x, target.z) ?? null;
    const areaReadyAtTarget = terrain.isAreaReadyAt?.(target.x, target.z) ?? null;
    const activeTerrainTiles = terrain.getActiveTerrainTileCount?.() ?? null;
    const invalidReasons: string[] = [];
    if (target.source !== 'hydrology') invalidReasons.push(`water source ${String(target.source)}`);
    if (selected.hasTerrainAtCamera === false) invalidReasons.push('camera outside terrain bounds');
    if (selected.areaReadyAtCamera === false) invalidReasons.push('camera terrain area not ready');
    if (hasTerrainAtTarget === false) invalidReasons.push('target outside terrain bounds');
    if ((activeTerrainTiles ?? 0) <= 0) invalidReasons.push('no active terrain tiles');
    if (selected.y < selected.terrainY + 1.5) invalidReasons.push('camera below terrain clearance');
    if (!shot.fullMap && selected.y < (target.surfaceY ?? targetTerrainY) + 2) {
      invalidReasons.push('camera below target water clearance');
    }

    return {
      name: shot.name,
      valid: invalidReasons.length === 0,
      fullMap: shot.fullMap === true,
      camera: { x: selected.x, y: selected.y, z: selected.z },
      lookAt,
      target: {
        requestedX: shot.target.x,
        requestedZ: shot.target.z,
        resolvedX: target.x,
        resolvedZ: target.z,
        distanceFromRequested: Math.hypot(target.x - shot.target.x, target.z - shot.target.z),
      },
      water: {
        surfaceY: target.surfaceY,
        source: target.source,
        flowVelocity: target.flowVelocity,
        debugInfo: water.getDebugInfo?.() ?? null,
      },
      terrain: {
        cameraTerrainY: selected.terrainY,
        targetTerrainY,
        hasTerrainAtCamera: selected.hasTerrainAtCamera,
        areaReadyAtCamera: selected.areaReadyAtCamera,
        hasTerrainAtTarget,
        areaReadyAtTarget,
        activeTerrainTiles,
        activeTilesSample: terrain.getActiveTilesForDebug?.()?.slice(0, 8) ?? [],
        streamingMetrics: terrain.getStreamingMetrics?.() ?? [],
      },
      vegetation: {
        billboardDebug: billboards?.getDebugInfo?.() ?? null,
      },
      invalidReasons,
    };
  }, spec);
}

async function captureOne(page: Page, outDir: string, spec: ShotSpec): Promise<ShotResult> {
  await frameShot(page, spec);
  await page.waitForTimeout(1_800);
  const proof = await frameShot(page, spec);
  await page.waitForTimeout(900);
  if (!proof.valid) {
    throw new Error(`${spec.name} invalid proof shot: ${proof.invalidReasons.join(', ')}`);
  }
  const file = join(outDir, `${spec.name}.png`);
  const buffer = await page.screenshot({ path: file, fullPage: false, timeout: 120_000 });
  console.log(`Wrote ${file} (${buffer?.byteLength ?? 0} bytes)`);
  return { ...proof, mode: spec.mode, file };
}

async function main(): Promise<void> {
  const outDir = join(process.cwd(), 'artifacts', 'water-hydrology-polish', timestampSlug(), 'loaded-terrain-visual');
  mkdirSync(outDir, { recursive: true });

  let server: ServerHandle | null = null;
  let browser: Browser | null = null;
  const results: ShotResult[] = [];
  try {
    server = await startServer({
      mode: 'perf',
      port: PORT,
      buildIfMissing: false,
      forceBuild: true,
      log: (message) => console.log(`[server] ${message}`),
    });
    browser = await chromium.launch({
      headless: !process.argv.includes('--headed'),
      args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    });

    for (const mode of ['open_frontier', 'a_shau_valley'] as const) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') console.error(`[browser:${mode}] ${msg.text()}`);
      });

      await page.goto(`http://127.0.0.1:${server.port}/?perf=1&capture=1&uiTransitions=0&logLevel=error`, {
        waitUntil: 'domcontentloaded',
        timeout: STARTUP_TIMEOUT_MS,
      });
      await page.evaluate('globalThis.__name = (target) => target');
      await waitForEngine(page);
      await startMode(page, mode);
      await dismissBriefingIfPresent(page);

      for (const shot of SHOTS.filter((candidate) => candidate.mode === mode)) {
        results.push(await captureOne(page, outDir, shot));
      }

      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await stopServer(server).catch(() => {});
  }

  const summary = {
    createdAt: new Date().toISOString(),
    outDir,
    viewport: VIEWPORT,
    results,
  };
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Summary: ${join(outDir, 'summary.json')}`);
}

main().catch((error: unknown) => {
  console.error('capture-water-hydrology-polish failed:', error);
  process.exit(1);
});
