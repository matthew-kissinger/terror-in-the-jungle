#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import sharp from 'sharp';
import { startServer, stopServer, type ServerHandle } from './preview-server';

type ProbeStatus = 'pass' | 'warn' | 'fail';
type CropSurface = 'vegetation' | 'npc';
type CandidateSurface = CropSurface | 'npc_close_glb';
type MaterializationProfileSource = 'window.npcMaterializationProfile' | 'renderer-private-fallback';

interface ImageMetrics {
  width: number;
  height: number;
  lumaMean: number;
  lumaStdDev: number;
  saturationMean: number;
  overexposedRatio: number;
  greenDominanceRatio: number;
  alphaCoverage: number;
}

interface CandidateInfo {
  surface: CandidateSurface;
  category: string;
  combatantId?: string | null;
  selectionReason?: string | null;
  materialName: string;
  materialType: string;
  objectName: string;
  instanceIndex: number | null;
  worldPosition: { x: number; y: number; z: number };
  approximateRadius: number;
  worldBounds?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  } | null;
}

interface CropResult {
  surface: CropSurface;
  status: ProbeStatus;
  candidate: CandidateInfo | null;
  screenshot: string | null;
  crop: string | null;
  cropRect: { x: number; y: number; width: number; height: number } | null;
  metrics: ImageMetrics | null;
  findings: string[];
}

interface CloseGlbNpcRow {
  id: string;
  distance: number;
  faction: string;
  lod: string;
  renderMode: 'close-glb' | 'impostor' | 'culled';
  clip: string | null;
  hasWeapon: boolean;
  closeFallbackReason: string | null;
  // Slice 4 (MaterializationProfile v2): exposed via window.npcMaterializationProfile().
  reason: string | null;
  inActiveCombat: boolean;
}

interface CloseModelRuntimeStats {
  closeRadiusMeters?: number;
  closeModelActiveCap?: number;
  candidatesWithinCloseRadius?: number;
  renderedCloseModels?: number;
  activeCloseModels?: number;
  fallbackCount?: number;
  fallbackCounts?: Record<string, number>;
  nearestFallbackDistanceMeters?: number | null;
  farthestFallbackDistanceMeters?: number | null;
  poolLoads?: number;
  poolTargets?: Record<string, number>;
  poolAvailable?: Record<string, number>;
  [key: string]: unknown;
}

interface CloseGlbTelemetry {
  lazyLoadAllowed: boolean;
  combatantCount: number;
  materializationProfileSource: MaterializationProfileSource;
  activeCloseModelCount: number;
  closeModelPoolLoads: number;
  closeModelPoolTargets: Record<string, number>;
  closeModelPoolAvailable: Record<string, number>;
  closeModelRuntimeStats: CloseModelRuntimeStats | null;
  closeModelFallbacks: unknown[];
  nearest: CloseGlbNpcRow[];
}

interface CloseGlbReviewPose {
  attempted: boolean;
  reason: string | null;
  targetCombatantId: string | null;
  targetFaction: string | null;
  targetPosition: { x: number; y: number; z: number } | null;
  playerPosition: { x: number; y: number; z: number } | null;
  distanceMeters: number | null;
}

interface DirectedZoneWarp {
  attempted: boolean;
  reason: string | null;
  modeName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  zonePosition: { x: number; y: number; z: number } | null;
  warpedPlayerPosition: { x: number; y: number; z: number } | null;
  liveCombatantsBefore: number;
  liveCombatantsAfter: number;
  combatantsWithinCloseRadiusAfter: number;
  waitMsObserved: number;
}

interface TierEventCapture {
  // Slice 8: empirical tier-transition flow captured during the probe.
  // `available` reflects whether `__materializationTierEvents` is exposed
  // (requires `?diag=1` and KONVEYER slice-6 bus subscription).
  available: boolean;
  totalEvents: number;
  byTransition: Record<string, number>;
  byReason: Record<string, number>;
  inActiveCombatPromotions: number;
  firstObservationToCloseGlb: number;
  sample: Array<{
    combatantId: string;
    fromRender: string | null;
    toRender: string;
    reason: string;
    distanceMeters: number;
  }>;
}

interface MaterializationPerfWindow {
  // Slice 9: falsifiable perf bar for the materialization review pose.
  // The probe drains `window.__metrics` (300-sample ring), waits a fixed
  // window with the steady review pose held, then reads
  // `getSnapshot()`. Percentiles cover the captured window; activeRender*
  // / candidate counts are sampled at end of window.
  attempted: boolean;
  reason: string | null;
  durationMs: number;
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  hitch33Count: number;
  hitch50Count: number;
  hitch100Count: number;
  combatantCount: number;
  firingCount: number;
  engagingCount: number;
  activeCloseModels: number;
  candidatesWithinCloseRadius: number;
  fallbackCount: number;
}

interface CloseGlbComparison {
  visibleNpcCloseGlbCount: number;
  status: ProbeStatus;
  finding: string;
  cropIsolation: string[];
  initialTelemetry: CloseGlbTelemetry;
  startupPrewarmMarks: { name: string; sinceStartMs: number }[];
  tierEvents: TierEventCapture | null;
  directedZoneWarp: DirectedZoneWarp | null;
  reviewPose: CloseGlbReviewPose | null;
  perfWindow: MaterializationPerfWindow | null;
  telemetry: CloseGlbTelemetry;
  candidate: CandidateInfo | null;
  screenshot: string | null;
  crop: string | null;
  cropRect: { x: number; y: number; width: number; height: number } | null;
  metrics: ImageMetrics | null;
}

interface ModeCropResult {
  mode: string;
  status: ProbeStatus;
  url: string;
  resolvedBackend: string | null;
  strictWebGPUReady: boolean;
  startupTerrainFeatureCompileMarks: { name: string; sinceStartMs: number }[];
  crops: CropResult[];
  closeGlbComparison: CloseGlbComparison;
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
}

interface CropProbeReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'konveyer-asset-crop-probe';
  status: ProbeStatus;
  options: {
    modes: string[];
    renderer: string;
    headed: boolean;
    port: number;
    closeModelWaitMs: number;
  };
  output: {
    json: string;
    markdown: string;
  };
  results: ModeCropResult[];
  nonClaims: string[];
}

const HOST = '127.0.0.1';
const DEFAULT_PORT = 9271;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'konveyer-asset-crop-probe';
const VIEWPORT = { width: 1440, height: 900 };
const CLOSE_MODEL_LAZY_LOAD_FLAG = '__TIJ_ALLOW_NPC_CLOSE_MODEL_LAZY_LOAD__';
const MODE_ALIASES: Record<string, string> = {
  combat120: 'ai_sandbox',
  tdm: 'team_deathmatch',
};
const RUNTIME_MODE_BY_PROBE_MODE: Record<string, string> = {
  team_deathmatch: 'tdm',
};

function nowSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseStringFlag(name: string, fallback: string): string {
  const eqArg = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (eqArg) return String(eqArg.split('=')[1] ?? fallback);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function parseNumberFlag(name: string, fallback: number): number {
  const parsed = Number(parseStringFlag(name, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function normalizeModes(raw: string): string[] {
  return raw
    .split(',')
    .map(mode => mode.trim())
    .filter(Boolean)
    .map(mode => MODE_ALIASES[mode] ?? mode)
    .filter((mode, index, all) => all.indexOf(mode) === index);
}

function runtimeModeForProbeMode(mode: string): string {
  return RUNTIME_MODE_BY_PROBE_MODE[mode] ?? mode;
}

async function imageMetrics(path: string): Promise<ImageMetrics> {
  const image = sharp(path).ensureAlpha();
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let lumaSum = 0;
  let lumaSqSum = 0;
  let saturationSum = 0;
  let overexposed = 0;
  let greenDominant = 0;
  let alphaCovered = 0;
  const pixels = Math.max(1, info.width * info.height);
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const a = data[i + 3] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    lumaSum += luma;
    lumaSqSum += luma * luma;
    saturationSum += max > 1e-6 ? (max - min) / max : 0;
    if (luma > 0.92) overexposed++;
    if (g > r * 1.08 && g > b * 1.08) greenDominant++;
    if (a > 0.05) alphaCovered++;
  }
  const mean = lumaSum / pixels;
  const variance = Math.max(0, lumaSqSum / pixels - mean * mean);
  return {
    width: metadata.width ?? info.width,
    height: metadata.height ?? info.height,
    lumaMean: mean,
    lumaStdDev: Math.sqrt(variance),
    saturationMean: saturationSum / pixels,
    overexposedRatio: overexposed / pixels,
    greenDominanceRatio: greenDominant / pixels,
    alphaCoverage: alphaCovered / pixels,
  };
}

async function startMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__engine?.startGameWithMode), null, { timeout: 90_000 });
  await page.evaluate(async (modeName: string) => {
    const engine = (window as any).__engine;
    await engine.startGameWithMode(modeName);
  }, mode);
  await page.waitForFunction(() => Boolean((window as any).__engine?.gameStarted), null, { timeout: 90_000 });
}

async function getCapabilities(page: Page): Promise<{ resolvedBackend: string | null; strictWebGPUReady: boolean }> {
  return page.evaluate(() => {
    const capabilities = (window as any).__rendererBackendCapabilities?.() ?? null;
    const resolvedBackend = capabilities?.resolvedBackend ?? null;
    return {
      resolvedBackend,
      strictWebGPUReady: resolvedBackend === 'webgpu' && capabilities?.initStatus === 'ready',
    };
  });
}

async function selectCandidate(page: Page, surface: CropSurface): Promise<CandidateInfo | null> {
  return page.evaluate((targetSurface: CropSurface) => {
    const renderer = (window as any).__renderer;
    const engine = (window as any).__engine;
    const scene = renderer?.scene ?? engine?.renderer?.scene;
    const camera = renderer?.camera ?? engine?.renderer?.camera;
    if (!scene?.traverse || !camera?.position || !camera?.matrixWorld) return null;
    const Matrix4 = camera.matrixWorld.constructor;
    const Vector3 = camera.position.constructor;
    const Quaternion = camera.quaternion?.constructor;
    if (!Matrix4 || !Vector3 || !Quaternion) return null;

    const materialArray = (material: any) => Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];
    const surfaceFor = (material: any): CropSurface | null => {
      const uniforms = material?.uniforms ?? {};
      if (Object.prototype.hasOwnProperty.call(uniforms, 'vegetationExposure')) return 'vegetation';
      if (Object.prototype.hasOwnProperty.call(uniforms, 'npcExposure')) return 'npc';
      return null;
    };
    const categoryFor = (object: any, material: any): string => {
      let current = object;
      while (current) {
        const category = current.userData?.perfCategory;
        if (typeof category === 'string' && category.length > 0) return category;
        current = current.parent;
      }
      const uniforms = material?.uniforms ?? {};
      if (Object.prototype.hasOwnProperty.call(uniforms, 'vegetationExposure')) return 'vegetation_imposters';
      if (Object.prototype.hasOwnProperty.call(uniforms, 'npcExposure')) return 'npc_imposters';
      return 'unattributed';
    };
    const toPoint = (v: any) => ({ x: Number(v.x), y: Number(v.y), z: Number(v.z) });
    const candidates: CandidateInfo[] = [];
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const quaternion = new Quaternion();

    scene.traverse((object: any) => {
      if (!object?.isMesh || object.visible === false) return;
      for (const material of materialArray(object.material)) {
        const surface = surfaceFor(material);
        if (surface !== targetSurface) continue;
        if (object.isInstancedMesh && typeof object.getMatrixAt === 'function') {
          const count = Math.min(Number(object.count ?? 0), 128);
          for (let i = 0; i < count; i++) {
            object.getMatrixAt(i, matrix);
            matrix.premultiply(object.matrixWorld);
            matrix.decompose(position, quaternion, scale);
            if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) continue;
            candidates.push({
              surface,
              category: categoryFor(object, material),
              materialName: String(material.name ?? '(unnamed)'),
              materialType: String(material.type ?? '(unknown)'),
              objectName: String(object.name ?? '(unnamed)'),
              instanceIndex: i,
              worldPosition: toPoint(position),
              approximateRadius: Math.max(2, scale.length() * 1.5),
            });
          }
        } else {
          const geometry = object.geometry;
          const instancePosition = geometry?.attributes?.instancePosition;
          const instanceScale = geometry?.attributes?.instanceScale;
          if (instancePosition && targetSurface === 'vegetation') {
            const count = Math.min(Number(geometry.instanceCount ?? instancePosition.count ?? 0), 256);
            for (let i = 0; i < count; i++) {
              const x = Number(instancePosition.getX(i));
              const y = Number(instancePosition.getY(i));
              const z = Number(instancePosition.getZ(i));
              if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
              const sx = Number(instanceScale?.getX?.(i) ?? 4);
              const sy = Number(instanceScale?.getY?.(i) ?? 4);
              candidates.push({
                surface,
                category: categoryFor(object, material),
                materialName: String(material.name ?? '(unnamed)'),
                materialType: String(material.type ?? '(unknown)'),
                objectName: String(object.name ?? '(unnamed)'),
                instanceIndex: i,
                worldPosition: { x, y, z },
                approximateRadius: Math.max(3, Math.max(Math.abs(sx), Math.abs(sy)) * 3),
              });
            }
          } else {
            object.getWorldPosition(position);
            candidates.push({
              surface,
              category: categoryFor(object, material),
              materialName: String(material.name ?? '(unnamed)'),
              materialType: String(material.type ?? '(unknown)'),
              objectName: String(object.name ?? '(unnamed)'),
              instanceIndex: null,
              worldPosition: toPoint(position),
              approximateRadius: 4,
            });
          }
        }
      }
    });

    const cameraPos = camera.position ?? { x: 0, y: 0, z: 0 };
    candidates.sort((a, b) => {
      const da = Math.hypot(a.worldPosition.x - cameraPos.x, a.worldPosition.z - cameraPos.z);
      const db = Math.hypot(b.worldPosition.x - cameraPos.x, b.worldPosition.z - cameraPos.z);
      return da - db;
    });
    return candidates[0] ?? null;
  }, surface);
}

async function frameCandidate(page: Page, candidate: CandidateInfo): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((target: CandidateInfo) => {
    const engine = (window as any).__engine;
    const rendererHost = engine?.renderer ?? (window as any).__renderer;
    const camera = rendererHost?.camera ?? (window as any).__renderer?.camera;
    const terrain = engine?.systemManager?.terrainSystem;
    const atmosphere = engine?.systemManager?.atmosphereSystem;
    if (!camera?.clone || !camera?.position || !camera?.matrixWorld) return null;
    const Vector3 = camera.position.constructor;

    const targetPos = new Vector3(target.worldPosition.x, target.worldPosition.y, target.worldPosition.z);
    const radius = Math.max(2, Number(target.approximateRadius ?? 4));
    const offset = new Vector3(radius * 3.5, Math.max(4, radius * 1.4), radius * 5.5);
    const override = camera.clone();
    override.near = 0.1;
    override.far = Math.max(3000, camera.far ?? 3000);
    override.aspect = 1440 / 900;
    override.position.copy(targetPos).add(offset);
    override.lookAt(targetPos.x, targetPos.y + radius * 0.4, targetPos.z);
    override.updateProjectionMatrix?.();
    override.updateMatrixWorld?.(true);
    rendererHost?.setOverrideCamera?.(override);
    terrain?.setRenderCameraOverride?.(override);
    terrain?.updatePlayerPosition?.(override.position);
    terrain?.update?.(0.016);
    atmosphere?.setTerrainYAtCamera?.(Number(terrain?.getHeightAt?.(override.position.x, override.position.z) ?? override.position.y));
    atmosphere?.syncDomePosition?.(override.position);

    const right = new Vector3();
    const up = new Vector3();
    override.matrixWorld.extractBasis(right, up, new Vector3());
    const bounds = target.worldBounds;
    const points = bounds
      ? [
        new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
        new Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
        new Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
        new Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
        new Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
        new Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
        new Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
      ].map(point => point.project(override))
      : [
        targetPos.clone().addScaledVector(right, -radius).addScaledVector(up, -radius),
        targetPos.clone().addScaledVector(right, radius).addScaledVector(up, -radius),
        targetPos.clone().addScaledVector(right, -radius).addScaledVector(up, radius),
        targetPos.clone().addScaledVector(right, radius).addScaledVector(up, radius),
        targetPos.clone(),
      ].map(point => point.project(override));
    const xs = points.map(point => (point.x * 0.5 + 0.5) * 1440);
    const ys = points.map(point => (-point.y * 0.5 + 0.5) * 900);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;
    const pad = Math.max(16, Math.min(80, radius * 6));
    return {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
  }, candidate);
}

async function clearCameraOverride(page: Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window as any).__engine;
    const rendererHost = engine?.renderer ?? (window as any).__renderer;
    const terrain = engine?.systemManager?.terrainSystem;
    rendererHost?.setOverrideCamera?.(null);
    terrain?.setRenderCameraOverride?.(null);
  });
}

async function setVegetationVisibilityForProbe(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((nextVisible: boolean) => {
    const renderer = (window as any).__renderer;
    const engine = (window as any).__engine;
    const scene = renderer?.scene ?? engine?.renderer?.scene;
    if (!scene?.traverse) return;
    const materialArray = (material: any) => Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];
    const isVegetationObject = (object: any): boolean => {
      let current = object;
      while (current) {
        const category = current.userData?.perfCategory;
        if (typeof category === 'string' && category.includes('vegetation')) return true;
        current = current.parent;
      }
      return materialArray(object.material).some((material: any) => (
        Object.prototype.hasOwnProperty.call(material?.uniforms ?? {}, 'vegetationExposure')
      ));
    };
    scene.traverse((object: any) => {
      if (!object || !isVegetationObject(object)) return;
      if (nextVisible) {
        if (Object.prototype.hasOwnProperty.call(object.userData ?? {}, '__konveyerCropPrevVisible')) {
          object.visible = Boolean(object.userData.__konveyerCropPrevVisible);
          delete object.userData.__konveyerCropPrevVisible;
        }
      } else if (!Object.prototype.hasOwnProperty.call(object.userData ?? {}, '__konveyerCropPrevVisible')) {
        object.userData = object.userData ?? {};
        object.userData.__konveyerCropPrevVisible = object.visible !== false;
        object.visible = false;
      }
    });
  }, visible);
}

async function setTerrainVisibilityForProbe(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((nextVisible: boolean) => {
    const renderer = (window as any).__renderer;
    const engine = (window as any).__engine;
    const scene = renderer?.scene ?? engine?.renderer?.scene;
    if (!scene?.traverse) return;
    const materialArray = (material: any) => Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];
    const isTerrainObject = (object: any): boolean => {
      let current = object;
      while (current) {
        const category = String(current.userData?.perfCategory ?? '').toLowerCase();
        if (category.includes('terrain')) return true;
        if (String(current.name ?? '').toLowerCase().includes('terrain')) return true;
        current = current.parent;
      }
      return materialArray(object.material).some((material: any) => (
        Boolean(material?.userData?.terrainUniforms)
      ));
    };
    scene.traverse((object: any) => {
      if (!object || !isTerrainObject(object)) return;
      if (nextVisible) {
        if (Object.prototype.hasOwnProperty.call(object.userData ?? {}, '__konveyerCropPrevTerrainVisible')) {
          object.visible = Boolean(object.userData.__konveyerCropPrevTerrainVisible);
          delete object.userData.__konveyerCropPrevTerrainVisible;
        }
      } else if (!Object.prototype.hasOwnProperty.call(object.userData ?? {}, '__konveyerCropPrevTerrainVisible')) {
        object.userData = object.userData ?? {};
        object.userData.__konveyerCropPrevTerrainVisible = object.visible !== false;
        object.visible = false;
      }
    });
  }, visible);
}

async function pauseRenderLoopForProbe(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const engine = (window as any).__engine;
    if (!engine) return false;
    const wasRunning = Boolean(engine.isLoopRunning);
    engine.isLoopRunning = false;
    if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
      cancelAnimationFrame(engine.animationFrameId);
      engine.animationFrameId = null;
    }
    return wasRunning;
  });
}

async function resumeRenderLoopForProbe(page: Page, wasRunning: boolean): Promise<void> {
  if (!wasRunning) return;
  await page.evaluate(() => {
    const engine = (window as any).__engine;
    engine?.start?.();
  });
}

async function renderStaticProbeFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window as any).__engine;
    if (typeof engine?.renderDiagnosticsFrame === 'function') {
      engine.renderDiagnosticsFrame();
      return;
    }
    const rendererHost = engine?.renderer ?? (window as any).__renderer;
    const renderer = rendererHost?.renderer;
    const scene = rendererHost?.scene;
    const camera = rendererHost?.getActiveCamera?.() ?? rendererHost?.camera;
    if (renderer?.render && scene && camera) {
      renderer.render(scene, camera);
    }
  });
}

async function selectCloseGlbCandidate(page: Page, preferredCombatantId?: string | null): Promise<CandidateInfo | null> {
  return page.evaluate((preferredId: string | null) => {
    const renderer = (window as any).__renderer;
    const engine = (window as any).__engine;
    const combat = engine?.systemManager?.combatantSystem;
    const combatantRenderer = combat?.combatantRenderer ?? combat?.getRenderer?.();
    const scene = renderer?.scene ?? engine?.renderer?.scene;
    const camera = renderer?.camera ?? engine?.renderer?.camera;
    if (!scene?.traverse || !camera?.position) return null;
    const Vector3 = camera.position.constructor;

    const materialArray = (material: any) => Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];
    const modelPathFor = (object: any): string => {
      let current = object;
      while (current) {
        const path = current.userData?.modelPath;
        if (typeof path === 'string' && path.length > 0) return path.toLowerCase();
        current = current.parent;
      }
      return '';
    };
    const isCloseGlb = (object: any): boolean => {
      let current = object;
      while (current) {
        if (current.userData?.perfCategory === 'npc_close_glb') return true;
        current = current.parent;
      }
      return modelPathFor(object).includes('npcs/pixel-forge');
    };
    const toPoint = (v: any) => ({ x: Number(v.x), y: Number(v.y), z: Number(v.z) });
    const createBounds = (): NonNullable<CandidateInfo['worldBounds']> => ({
      min: { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY },
      max: { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY },
    });
    const expandBounds = (
      bounds: NonNullable<CandidateInfo['worldBounds']>,
      center: { x: number; y: number; z: number },
      radius: number,
    ): void => {
      if (![center.x, center.y, center.z, radius].every(Number.isFinite)) return;
      bounds.min.x = Math.min(bounds.min.x, center.x - radius);
      bounds.min.y = Math.min(bounds.min.y, center.y - radius);
      bounds.min.z = Math.min(bounds.min.z, center.z - radius);
      bounds.max.x = Math.max(bounds.max.x, center.x + radius);
      bounds.max.y = Math.max(bounds.max.y, center.y + radius);
      bounds.max.z = Math.max(bounds.max.z, center.z + radius);
    };
    const usableBounds = (bounds: CandidateInfo['worldBounds']): bounds is NonNullable<CandidateInfo['worldBounds']> => {
      if (!bounds) return false;
      return [
        bounds.min.x, bounds.min.y, bounds.min.z,
        bounds.max.x, bounds.max.y, bounds.max.z,
      ].every(Number.isFinite)
        && bounds.max.x > bounds.min.x
        && bounds.max.y > bounds.min.y
        && bounds.max.z > bounds.min.z;
    };
    const centerFromBounds = (bounds: NonNullable<CandidateInfo['worldBounds']>) => ({
      x: (bounds.min.x + bounds.max.x) * 0.5,
      y: (bounds.min.y + bounds.max.y) * 0.5,
      z: (bounds.min.z + bounds.max.z) * 0.5,
    });
    const radiusFromBounds = (bounds: NonNullable<CandidateInfo['worldBounds']>): number => {
      const dx = bounds.max.x - bounds.min.x;
      const dy = bounds.max.y - bounds.min.y;
      const dz = bounds.max.z - bounds.min.z;
      return Math.max(2.4, Math.min(9.0, Math.hypot(dx, dy, dz) * 0.55));
    };
    const meshBoundsFor = (object: any): CandidateInfo['worldBounds'] => {
      if (!object) return null;
      object.updateMatrixWorld?.(true);
      const bounds = createBounds();
      const meshCenter = new Vector3();
      const sphereCenter = new Vector3();
      const meshScale = new Vector3();
      const visit = (child: any): void => {
        if (!child?.isMesh || child.visible === false || !child.geometry) return;
        child.getWorldPosition?.(meshCenter);
        child.getWorldScale?.(meshScale);
        let sphere = child.geometry.boundingSphere;
        if (!sphere && typeof child.geometry.computeBoundingSphere === 'function') {
          try {
            child.geometry.computeBoundingSphere();
            sphere = child.geometry.boundingSphere;
          } catch {
            sphere = null;
          }
        }
        let radius = 0.45;
        if (sphere && Number.isFinite(Number(sphere.radius)) && Number(sphere.radius) > 0) {
          sphereCenter.set(
            Number(sphere.center?.x ?? 0),
            Number(sphere.center?.y ?? 0),
            Number(sphere.center?.z ?? 0),
          );
          child.localToWorld?.(sphereCenter);
          meshCenter.copy?.(sphereCenter);
          const scaleMax = Math.max(Math.abs(meshScale.x), Math.abs(meshScale.y), Math.abs(meshScale.z), 1);
          radius = Math.max(0.25, Number(sphere.radius) * scaleMax);
        }
        expandBounds(bounds, meshCenter, radius);
      };
      if (typeof object.traverse === 'function') {
        object.traverse(visit);
      } else {
        visit(object);
      }
      return usableBounds(bounds) ? bounds : null;
    };
    const candidates: CandidateInfo[] = [];
    let preferredCandidate: CandidateInfo | null = null;
    const position = new Vector3();
    const addObjectCandidate = (object: any, combatantId: string | null, selectionReason: string): void => {
      if (!object || object.visible === false) return;
      object.getWorldPosition(position);
      let radius = 2.4;
      const worldBounds = meshBoundsFor(object);
      if (usableBounds(worldBounds)) {
        const center = centerFromBounds(worldBounds);
        position.set(center.x, center.y, center.z);
        radius = radiusFromBounds(worldBounds);
      }
      let material: any = null;
      object.traverse?.((child: any) => {
        if (material || !child?.isMesh) return;
        material = materialArray(child.material)[0] ?? null;
      });
      if (!material && object.isMesh) material = materialArray(object.material)[0] ?? null;
      const candidate: CandidateInfo = {
        surface: 'npc_close_glb',
        category: 'npc_close_glb',
        combatantId,
        selectionReason,
        materialName: String(material?.name ?? '(unnamed)'),
        materialType: String(material?.type ?? '(unknown)'),
        objectName: String(object.name ?? '(unnamed)'),
        instanceIndex: null,
        worldPosition: toPoint(position),
        approximateRadius: radius,
        worldBounds,
      };
      candidates.push(candidate);
      if (preferredId && combatantId === preferredId) {
        preferredCandidate = candidate;
      }
    };

    if (combatantRenderer?.activeCloseModels instanceof Map) {
      combatantRenderer.activeCloseModels.forEach((instance: any, combatantId: unknown) => {
        const id = String(combatantId);
        addObjectCandidate(
          instance?.root,
          id,
          preferredId && id === preferredId ? 'preferred-active-close-model' : 'active-close-model',
        );
      });
    }

    if (preferredCandidate) return preferredCandidate;

    scene.traverse((object: any) => {
      if (!object?.isMesh || object.visible === false || !isCloseGlb(object)) return;
      if (candidates.length > 0) return;
      object.getWorldPosition(position);
      let radius = 2.4;
      const worldBounds = meshBoundsFor(object);
      if (usableBounds(worldBounds)) {
        const center = centerFromBounds(worldBounds);
        position.set(center.x, center.y, center.z);
        radius = radiusFromBounds(worldBounds);
      }
      const materials = materialArray(object.material);
      const material = materials[0] ?? null;
      candidates.push({
        surface: 'npc_close_glb',
        category: 'npc_close_glb',
        combatantId: null,
        selectionReason: 'scene-close-glb-fallback',
        materialName: String(material?.name ?? '(unnamed)'),
        materialType: String(material?.type ?? '(unknown)'),
        objectName: String(object.name ?? '(unnamed)'),
        instanceIndex: null,
        worldPosition: toPoint(position),
        approximateRadius: Math.min(Math.max(radius, 4.5), 9),
        worldBounds,
      });
    });

    const cameraPos = camera.position ?? { x: 0, y: 0, z: 0 };
    candidates.sort((a, b) => {
      const da = Math.hypot(a.worldPosition.x - cameraPos.x, a.worldPosition.z - cameraPos.z);
      const db = Math.hypot(b.worldPosition.x - cameraPos.x, b.worldPosition.z - cameraPos.z);
      return da - db;
    });
    return candidates[0] ?? null;
  }, preferredCombatantId ?? null);
}

async function closeGlbCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const renderer = (window as any).__renderer;
    const engine = (window as any).__engine;
    const combat = engine?.systemManager?.combatantSystem;
    const combatantRenderer = combat?.combatantRenderer ?? combat?.getRenderer?.();
    if (combatantRenderer?.activeCloseModels instanceof Map) {
      return combatantRenderer.activeCloseModels.size;
    }
    const scene = renderer?.scene ?? engine?.renderer?.scene;
    if (!scene?.traverse) return 0;
    const modelPathFor = (object: any): string => {
      let current = object;
      while (current) {
        const path = current.userData?.modelPath;
        if (typeof path === 'string' && path.length > 0) return path.toLowerCase();
        current = current.parent;
      }
      return '';
    };
    const isCloseGlb = (object: any): boolean => {
      let current = object;
      while (current) {
        if (current.userData?.perfCategory === 'npc_close_glb') return true;
        current = current.parent;
      }
      return modelPathFor(object).includes('npcs/pixel-forge');
    };
    let count = 0;
    scene.traverse((object: any) => {
      if (!object?.isMesh || object.visible === false) return;
      if (isCloseGlb(object)) {
        count++;
      }
    });
    return count;
  });
}

async function getCloseModelTelemetry(page: Page): Promise<CloseGlbTelemetry> {
  return page.evaluate((lazyLoadFlag: string) => {
    const engine = (window as any).__engine;
    const combat = engine?.systemManager?.combatantSystem;
    const renderer = combat?.combatantRenderer ?? combat?.getRenderer?.();
    const playerController = engine?.systemManager?.playerController;
    const camera = engine?.renderer?.camera ?? (window as any).__renderer?.camera;
    const playerPosition = playerController?.getPosition?.()
      ?? combat?.playerPosition
      ?? camera?.position
      ?? { x: 0, y: 0, z: 0 };
    let publicProfile: any = null;
    try {
      publicProfile = typeof (window as any).npcMaterializationProfile === 'function'
        ? (window as any).npcMaterializationProfile(24)
        : null;
    } catch {
      publicProfile = null;
    }
    const copyNumericRecord = (value: any): Record<string, number> => {
      const output: Record<string, number> = {};
      if (!value || typeof value !== 'object') return output;
      Object.entries(value).forEach(([key, recordValue]) => {
        output[String(key)] = Number(recordValue);
      });
      return output;
    };
    const normalizeRenderMode = (value: any): CloseGlbNpcRow['renderMode'] => {
      if (value === 'close-glb' || value === 'impostor' || value === 'culled') return value;
      return 'culled';
    };
    const publicRows = Array.isArray(publicProfile?.rows)
      ? publicProfile.rows.map((row: any) => ({
        id: String(row.combatantId ?? row.id ?? ''),
        distance: Number(row.distanceMeters ?? row.distance ?? 0),
        faction: String(row.faction ?? ''),
        lod: String(row.lodLevel ?? row.lod ?? ''),
        renderMode: normalizeRenderMode(row.renderMode),
        clip: row.clipId == null ? null : String(row.clipId),
        hasWeapon: Boolean(row.hasCloseModelWeapon ?? row.hasWeapon),
        closeFallbackReason: row.closeFallbackReason == null ? null : String(row.closeFallbackReason),
        reason: row.reason == null ? null : String(row.reason),
        inActiveCombat: Boolean(row.inActiveCombat),
      })).sort((a: CloseGlbNpcRow, b: CloseGlbNpcRow) => a.distance - b.distance)
      : null;
    const activeCloseModels = renderer?.activeCloseModels instanceof Map
      ? renderer.activeCloseModels
      : new Map();
    const closeModelPoolTargets: Record<string, number> = {};
    if (renderer?.closeModelPoolTargets instanceof Map) {
      renderer.closeModelPoolTargets.forEach((target: number, key: string) => {
        closeModelPoolTargets[key] = target;
      });
    }
    const closeModelPoolAvailable: Record<string, number> = {};
    if (renderer?.closeModelPools instanceof Map) {
      renderer.closeModelPools.forEach((pool: unknown[], key: string) => {
        closeModelPoolAvailable[key] = pool.length;
      });
    }
    const closeModelPoolLoads = renderer?.closeModelPoolLoads instanceof Map
      ? renderer.closeModelPoolLoads.size
      : 0;
    const closeModelRuntimeStats = typeof renderer?.getCloseModelRuntimeStats === 'function'
      ? renderer.getCloseModelRuntimeStats()
      : null;
    const closeModelFallbacks = typeof renderer?.getCloseModelFallbackRecords === 'function'
      ? renderer.getCloseModelFallbackRecords()
      : [];
    const fallbackById = new Map(
      closeModelFallbacks.map((record: any) => [String(record.combatantId), String(record.reason)]),
    );
    const combatants = combat?.combatants instanceof Map
      ? Array.from(combat.combatants.values())
      : [];
    const fallbackRows: CloseGlbNpcRow[] = combatants.map((combatant: any) => {
      const dx = Number(combatant.position?.x ?? 0) - Number(playerPosition.x ?? 0);
      const dy = Number(combatant.position?.y ?? 0) - Number(playerPosition.y ?? 0);
      const dz = Number(combatant.position?.z ?? 0) - Number(playerPosition.z ?? 0);
      const distance = Math.hypot(dx, dy, dz);
      const closeInstance = activeCloseModels.get(combatant.id);
      const renderMode = closeInstance
        ? 'close-glb'
        : combatant.billboardIndex !== undefined && combatant.billboardIndex >= 0
          ? 'impostor'
          : 'culled';
      return {
        id: String(combatant.id),
        distance,
        faction: String(combatant.faction),
        lod: String(combatant.lodLevel),
        renderMode,
        clip: closeInstance?.activeClip ?? null,
        hasWeapon: Boolean(closeInstance?.hasWeapon),
        closeFallbackReason: fallbackById.get(String(combatant.id)) ?? null,
        // Renderer-private fallback path does not have the v2 fields; leave
        // them as defaults so the artifact shape is uniform with the public
        // profile path.
        reason: null,
        inActiveCombat: false,
      };
    }).sort((a, b) => a.distance - b.distance);
    const materializationProfileSource: MaterializationProfileSource = publicRows
      ? 'window.npcMaterializationProfile'
      : 'renderer-private-fallback';
    const rows = publicRows ?? fallbackRows;
    const publicStats = publicProfile?.closeModelStats ?? null;
    const stats = publicStats ?? closeModelRuntimeStats;
    const statsPoolTargets = copyNumericRecord(stats?.poolTargets);
    const statsPoolAvailable = copyNumericRecord(stats?.poolAvailable);

    return {
      lazyLoadAllowed: (window as unknown as Record<string, unknown>)[lazyLoadFlag] === true,
      combatantCount: combatants.length > 0 ? combatants.length : rows.length,
      materializationProfileSource,
      activeCloseModelCount: Number(stats?.activeCloseModels ?? activeCloseModels.size),
      closeModelPoolLoads: Number(stats?.poolLoads ?? closeModelPoolLoads),
      closeModelPoolTargets: Object.keys(statsPoolTargets).length > 0
        ? statsPoolTargets
        : closeModelPoolTargets,
      closeModelPoolAvailable: Object.keys(statsPoolAvailable).length > 0
        ? statsPoolAvailable
        : closeModelPoolAvailable,
      closeModelRuntimeStats: stats,
      closeModelFallbacks,
      nearest: rows.slice(0, 24),
    };
  }, CLOSE_MODEL_LAZY_LOAD_FLAG);
}

async function getStartupPrewarmMarks(page: Page): Promise<{ name: string; sinceStartMs: number }[]> {
  return getStartupMarksMatching(page, 'npc-close-model-prewarm');
}

async function getStartupTerrainFeatureCompileMarks(page: Page): Promise<{ name: string; sinceStartMs: number }[]> {
  return getStartupMarksMatching(page, 'terrain-features.compile');
}

async function getStartupMarksMatching(page: Page, match: string): Promise<{ name: string; sinceStartMs: number }[]> {
  return page.evaluate((matchText: string) => {
    const startup = (window as any).__startupTelemetry?.getSnapshot?.() ?? null;
    const marks = Array.isArray(startup?.marks) ? startup.marks : [];
    return marks
      .filter((mark: any) => String(mark?.name ?? '').includes(matchText))
      .map((mark: any) => ({
        name: String(mark.name ?? ''),
        sinceStartMs: Number(mark.sinceStartMs ?? 0),
      }));
  }, match);
}

/**
 * Modes whose initial player spawn pose is far from any live action zone (e.g.
 * A Shau Valley's 21km strategic simulation places live combatants near
 * contested zones, not the LZ spawn). Without a directed warp, the crop probe
 * cannot reach the close-NPC materialization path in these modes.
 */
const DIRECTED_WARP_MODES = new Set<string>(['a_shau_valley']);

async function prepareDirectedZoneWarp(
  page: Page,
  probeMode: string,
  waitMs: number,
): Promise<DirectedZoneWarp> {
  if (!DIRECTED_WARP_MODES.has(probeMode)) {
    return {
      attempted: false,
      reason: 'mode-does-not-require-directed-warp',
      modeName: probeMode,
      zoneId: null,
      zoneName: null,
      zonePosition: null,
      warpedPlayerPosition: null,
      liveCombatantsBefore: 0,
      liveCombatantsAfter: 0,
      combatantsWithinCloseRadiusAfter: 0,
      waitMsObserved: 0,
    };
  }

  const warpResult = await page.evaluate(() => {
    const engine = (window as any).__engine;
    const systems = engine?.systemManager;
    const zoneManager = systems?.zoneManager;
    const playerController = systems?.playerController;
    const terrain = systems?.terrainSystem;
    const combat = systems?.combatantSystem;
    const camera = engine?.renderer?.camera ?? (window as any).__renderer?.camera;
    const liveBefore = combat?.getAllCombatants?.().filter((c: any) => c?.state !== 'dead' && Number(c?.health ?? 0) > 0).length
      ?? 0;
    if (!zoneManager?.getAllZones || !playerController?.setPosition || !camera?.position?.constructor) {
      return {
        warped: false,
        reason: 'zone-or-player-controller-unavailable',
        zoneId: null,
        zoneName: null,
        zonePosition: null,
        warpedPlayerPosition: null,
        liveCombatantsBefore: liveBefore,
      };
    }
    const zones = zoneManager.getAllZones() as any[];
    const contestedFirst = zones.find((z: any) => !z.isHomeBase && (z.owner === null || z.owner === undefined));
    const fallbackNonHome = zones.find((z: any) => !z.isHomeBase);
    const target = contestedFirst ?? fallbackNonHome ?? null;
    if (!target?.position) {
      return {
        warped: false,
        reason: 'no-eligible-zone-found',
        zoneId: null,
        zoneName: null,
        zonePosition: null,
        warpedPlayerPosition: null,
        liveCombatantsBefore: liveBefore,
      };
    }
    const Vector3 = camera.position.constructor;
    const zoneX = Number(target.position.x ?? 0);
    const zoneZ = Number(target.position.z ?? 0);
    const terrainY = Number(
      terrain?.getEffectiveHeightAt?.(zoneX, zoneZ)
      ?? terrain?.getHeightAt?.(zoneX, zoneZ)
      ?? target.position.y
      ?? 0,
    );
    const playerY = (Number.isFinite(terrainY) ? terrainY : 0) + 2.2;
    const playerPos = new Vector3(zoneX, playerY, zoneZ);
    playerController.setPosition(playerPos, 'harness.konveyer-a-shau-directed-warp');
    terrain?.updatePlayerPosition?.(playerPos);
    terrain?.update?.(0.016);
    return {
      warped: true,
      reason: null,
      zoneId: String(target.id ?? ''),
      zoneName: String(target.name ?? ''),
      zonePosition: { x: zoneX, y: Number(target.position.y ?? 0), z: zoneZ },
      warpedPlayerPosition: { x: zoneX, y: playerY, z: zoneZ },
      liveCombatantsBefore: liveBefore,
    };
  });

  if (!warpResult.warped) {
    return {
      attempted: false,
      reason: warpResult.reason ?? 'warp-failed',
      modeName: probeMode,
      zoneId: warpResult.zoneId,
      zoneName: warpResult.zoneName,
      zonePosition: warpResult.zonePosition,
      warpedPlayerPosition: warpResult.warpedPlayerPosition,
      liveCombatantsBefore: warpResult.liveCombatantsBefore,
      liveCombatantsAfter: warpResult.liveCombatantsBefore,
      combatantsWithinCloseRadiusAfter: 0,
      waitMsObserved: 0,
    };
  }

  const waitStart = Date.now();
  try {
    await page.waitForFunction(() => {
      const engine = (window as any).__engine;
      const combat = engine?.systemManager?.combatantSystem;
      const renderer = combat?.combatantRenderer ?? combat?.getRenderer?.();
      const stats = typeof renderer?.getCloseModelRuntimeStats === 'function'
        ? renderer.getCloseModelRuntimeStats()
        : null;
      const candidates = Number(stats?.candidatesWithinCloseRadius ?? 0);
      return candidates > 0;
    }, null, { timeout: Math.max(2000, waitMs) });
  } catch {
    // Materialization may simply not happen within the wait window; the
    // telemetry below records the post-wait state for diagnosis.
  }
  const waitMsObserved = Date.now() - waitStart;

  const postState = await page.evaluate(() => {
    const engine = (window as any).__engine;
    const combat = engine?.systemManager?.combatantSystem;
    const renderer = combat?.combatantRenderer ?? combat?.getRenderer?.();
    const live = combat?.getAllCombatants?.().filter((c: any) => c?.state !== 'dead' && Number(c?.health ?? 0) > 0).length
      ?? 0;
    const stats = typeof renderer?.getCloseModelRuntimeStats === 'function'
      ? renderer.getCloseModelRuntimeStats()
      : null;
    return {
      liveCombatantsAfter: live,
      combatantsWithinCloseRadiusAfter: Number(stats?.candidatesWithinCloseRadius ?? 0),
    };
  });

  return {
    attempted: true,
    reason: null,
    modeName: probeMode,
    zoneId: warpResult.zoneId,
    zoneName: warpResult.zoneName,
    zonePosition: warpResult.zonePosition,
    warpedPlayerPosition: warpResult.warpedPlayerPosition,
    liveCombatantsBefore: warpResult.liveCombatantsBefore,
    liveCombatantsAfter: postState.liveCombatantsAfter,
    combatantsWithinCloseRadiusAfter: postState.combatantsWithinCloseRadiusAfter,
    waitMsObserved,
  };
}

async function captureMaterializationPerfWindow(
  page: Page,
  durationMs: number,
): Promise<MaterializationPerfWindow> {
  // Reset the RuntimeMetrics ring so the captured window starts clean.
  const resetOk = await page.evaluate(() => {
    const metrics = (window as any).__metrics;
    if (typeof metrics?.reset !== 'function') return false;
    metrics.reset();
    return true;
  });
  if (!resetOk) {
    return {
      attempted: false,
      reason: 'metrics-not-exposed',
      durationMs: 0,
      frameCount: 0,
      avgFrameMs: 0,
      p95FrameMs: 0,
      p99FrameMs: 0,
      maxFrameMs: 0,
      hitch33Count: 0,
      hitch50Count: 0,
      hitch100Count: 0,
      combatantCount: 0,
      firingCount: 0,
      engagingCount: 0,
      activeCloseModels: 0,
      candidatesWithinCloseRadius: 0,
      fallbackCount: 0,
    };
  }
  await page.waitForTimeout(durationMs);
  // Throttled percentile cache flushes every 500 ms; wait one more interval
  // so the final snapshot reflects the full window rather than the cached
  // value from 500 ms before the end of the sample period.
  await page.waitForTimeout(550);
  return page.evaluate((requestedDurationMs: number) => {
    const metrics = (window as any).__metrics;
    const snapshot = typeof metrics?.getSnapshot === 'function'
      ? metrics.getSnapshot()
      : null;
    const profile = typeof (window as any).npcMaterializationProfile === 'function'
      ? (window as any).npcMaterializationProfile(24)
      : null;
    const stats = profile?.closeModelStats ?? null;
    return {
      attempted: true,
      reason: null,
      durationMs: requestedDurationMs,
      frameCount: Number(snapshot?.frameCount ?? 0),
      avgFrameMs: Number(snapshot?.avgFrameMs ?? 0),
      p95FrameMs: Number(snapshot?.p95FrameMs ?? 0),
      p99FrameMs: Number(snapshot?.p99FrameMs ?? 0),
      maxFrameMs: Number(snapshot?.maxFrameMs ?? 0),
      hitch33Count: Number(snapshot?.hitch33Count ?? 0),
      hitch50Count: Number(snapshot?.hitch50Count ?? 0),
      hitch100Count: Number(snapshot?.hitch100Count ?? 0),
      combatantCount: Number(snapshot?.combatantCount ?? 0),
      firingCount: Number(snapshot?.firingCount ?? 0),
      engagingCount: Number(snapshot?.engagingCount ?? 0),
      activeCloseModels: Number(stats?.activeCloseModels ?? 0),
      candidatesWithinCloseRadius: Number(stats?.candidatesWithinCloseRadius ?? 0),
      fallbackCount: Number(stats?.fallbackCount ?? 0),
    };
  }, durationMs);
}

async function captureTierTransitionEvents(page: Page): Promise<TierEventCapture> {
  return page.evaluate(() => {
    const reader = (window as any).__materializationTierEvents;
    if (typeof reader !== 'function') {
      return {
        available: false,
        totalEvents: 0,
        byTransition: {},
        byReason: {},
        inActiveCombatPromotions: 0,
        firstObservationToCloseGlb: 0,
        sample: [],
      };
    }
    const events = reader({ clear: true });
    const byTransition: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    let firstObservationToCloseGlb = 0;
    for (const event of events) {
      const transitionKey = `${String(event.fromRender ?? 'null')}->${String(event.toRender)}`;
      byTransition[transitionKey] = (byTransition[transitionKey] ?? 0) + 1;
      const reasonKey = String(event.reason ?? 'unknown');
      byReason[reasonKey] = (byReason[reasonKey] ?? 0) + 1;
      if (event.fromRender === null && event.toRender === 'close-glb') {
        firstObservationToCloseGlb += 1;
      }
    }
    // `inActiveCombatPromotions` would require correlating against the
    // current state; from the event payload alone we cannot know whether
    // the combatant was in active combat. The probe records 0 here and
    // leaves this signal to the slice-4 nearest[] view; future probe
    // versions can correlate by id if budget arbiter evidence is needed.
    return {
      available: true,
      totalEvents: events.length,
      byTransition,
      byReason,
      inActiveCombatPromotions: 0,
      firstObservationToCloseGlb,
      sample: events.slice(-12).map((event: any) => ({
        combatantId: String(event.combatantId ?? ''),
        fromRender: event.fromRender == null ? null : String(event.fromRender),
        toRender: String(event.toRender),
        reason: String(event.reason ?? ''),
        distanceMeters: Number(event.distanceMeters ?? 0),
      })),
    };
  });
}

async function prepareCloseGlbReviewPose(page: Page): Promise<CloseGlbReviewPose> {
  return page.evaluate(() => {
    const engine = (window as any).__engine;
    const combat = engine?.systemManager?.combatantSystem;
    const playerController = engine?.systemManager?.playerController;
    const terrain = engine?.systemManager?.terrainSystem;
    const camera = engine?.renderer?.camera ?? (window as any).__renderer?.camera;
    if (!combat?.combatants || !(combat.combatants instanceof Map)) {
      return {
        attempted: false,
        reason: 'combatant-system-unavailable',
        targetCombatantId: null,
        targetFaction: null,
        targetPosition: null,
        playerPosition: null,
        distanceMeters: null,
      };
    }
    if (!playerController?.setPosition || !camera?.position?.constructor) {
      return {
        attempted: false,
        reason: 'player-controller-or-camera-unavailable',
        targetCombatantId: null,
        targetFaction: null,
        targetPosition: null,
        playerPosition: null,
        distanceMeters: null,
      };
    }
    const currentPlayer = playerController.getPosition?.()
      ?? camera.position
      ?? { x: 0, y: 0, z: 0 };
    const combatants = Array.from(combat.combatants.values())
      .filter((combatant: any) => combatant?.position && String(combatant.state) !== 'dead')
      .sort((a: any, b: any) => {
        const da = Math.hypot(
          Number(a.position.x ?? 0) - Number(currentPlayer.x ?? 0),
          Number(a.position.z ?? 0) - Number(currentPlayer.z ?? 0),
        );
        const db = Math.hypot(
          Number(b.position.x ?? 0) - Number(currentPlayer.x ?? 0),
          Number(b.position.z ?? 0) - Number(currentPlayer.z ?? 0),
        );
        return da - db;
      });
    const target = combatants[0];
    if (!target) {
      return {
        attempted: false,
        reason: 'no-combatants-for-close-glb-review',
        targetCombatantId: null,
        targetFaction: null,
        targetPosition: null,
        playerPosition: null,
        distanceMeters: null,
      };
    }
    const Vector3 = camera.position.constructor;
    const targetX = Number(target.position.x ?? 0);
    const targetY = Number(target.position.y ?? 0);
    const targetZ = Number(target.position.z ?? 0);
    let dirX = Number(currentPlayer.x ?? 0) - targetX;
    let dirZ = Number(currentPlayer.z ?? 0) - targetZ;
    const dirLen = Math.hypot(dirX, dirZ);
    if (!Number.isFinite(dirLen) || dirLen < 0.01) {
      dirX = 0.55;
      dirZ = 0.85;
    } else {
      dirX /= dirLen;
      dirZ /= dirLen;
    }
    const distance = 14;
    const playerX = targetX + dirX * distance;
    const playerZ = targetZ + dirZ * distance;
    const terrainY = Number(
      terrain?.getEffectiveHeightAt?.(playerX, playerZ)
      ?? terrain?.getHeightAt?.(playerX, playerZ)
      ?? targetY,
    );
    const playerY = (Number.isFinite(terrainY) ? terrainY : targetY) + 2.2;
    const playerPos = new Vector3(playerX, playerY, playerZ);
    playerController.setPosition(playerPos, 'harness.konveyer-close-glb-review');
    terrain?.updatePlayerPosition?.(playerPos);
    terrain?.update?.(0.016);

    const lookY = targetY + 1.35;
    const vx = targetX - playerX;
    const vy = lookY - playerY;
    const vz = targetZ - playerZ;
    const horizontal = Math.max(0.001, Math.hypot(vx, vz));
    const yaw = Math.atan2(-vx, -vz);
    const pitch = -Math.atan2(vy, horizontal);
    playerController.setViewAngles?.(yaw, pitch);
    camera.position.copy(playerPos);
    camera.lookAt(targetX, lookY, targetZ);
    camera.updateMatrixWorld?.(true);

    return {
      attempted: true,
      reason: null,
      targetCombatantId: String(target.id),
      targetFaction: String(target.faction),
      targetPosition: { x: targetX, y: targetY, z: targetZ },
      playerPosition: { x: playerX, y: playerY, z: playerZ },
      distanceMeters: Math.hypot(vx, vy, vz),
    };
  });
}

async function cropScreenshot(sourcePath: string, cropPath: string, rect: { x: number; y: number; width: number; height: number }): Promise<{ x: number; y: number; width: number; height: number }> {
  const metadata = await sharp(sourcePath).metadata();
  const imageWidth = metadata.width ?? VIEWPORT.width;
  const imageHeight = metadata.height ?? VIEWPORT.height;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const width = Math.max(1, Math.min(imageWidth - x, Math.ceil(rect.width)));
  const height = Math.max(1, Math.min(imageHeight - y, Math.ceil(rect.height)));
  await sharp(sourcePath).extract({ left: x, top: y, width, height }).toFile(cropPath);
  return { x, y, width, height };
}

async function captureSurfaceCrop(page: Page, modeDir: string, surface: CropSurface): Promise<CropResult> {
  const candidate = await selectCandidate(page, surface);
  if (!candidate) {
    return {
      surface,
      status: 'warn',
      candidate: null,
      screenshot: null,
      crop: null,
      cropRect: null,
      metrics: null,
      findings: [`no-${surface}-candidate-found`],
    };
  }
  const rawRect = await frameCandidate(page, candidate);
  if (!rawRect) {
    return {
      surface,
      status: 'warn',
      candidate,
      screenshot: null,
      crop: null,
      cropRect: null,
      metrics: null,
      findings: [`${surface}-candidate-not-projectable`],
    };
  }
  await page.waitForTimeout(450);
  const screenshotPath = join(modeDir, `${surface}-frame.png`);
  const cropPath = join(modeDir, `${surface}-crop.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const cropRect = await cropScreenshot(screenshotPath, cropPath, rawRect);
  const metrics = await imageMetrics(cropPath);
  const findings: string[] = [];
  if (metrics.lumaMean < 0.04) findings.push(`crop-very-dark:luma=${metrics.lumaMean.toFixed(3)}`);
  if (metrics.lumaMean > 0.72) findings.push(`crop-very-bright:luma=${metrics.lumaMean.toFixed(3)}`);
  if (surface === 'vegetation' && metrics.greenDominanceRatio > 0.55) {
    findings.push(`crop-green-dominant:${metrics.greenDominanceRatio.toFixed(3)}`);
  }
  if (surface === 'vegetation' && metrics.saturationMean > 0.62) {
    findings.push(`crop-saturated-vegetation:${metrics.saturationMean.toFixed(3)}`);
  }
  if (surface === 'npc' && metrics.greenDominanceRatio > 0.55) {
    findings.push(`npc-crop-background-dominant:${metrics.greenDominanceRatio.toFixed(3)}`);
  }
  if (metrics.alphaCoverage < 0.05) findings.push(`crop-mostly-empty:${metrics.alphaCoverage.toFixed(3)}`);
  return {
    surface,
    status: findings.length > 0 ? 'warn' : 'pass',
    candidate,
    screenshot: relative(process.cwd(), screenshotPath),
    crop: relative(process.cwd(), cropPath),
    cropRect,
    metrics,
    findings,
  };
}

async function captureCloseGlbComparison(
  page: Page,
  modeDir: string,
  closeModelWaitMs: number,
  probeMode: string,
): Promise<CloseGlbComparison> {
  await clearCameraOverride(page);
  const initialTelemetry = await getCloseModelTelemetry(page);
  const startupPrewarmMarks = await getStartupPrewarmMarks(page);
  try {
    await page.waitForFunction(
      (lazyLoadFlag: string) => (window as unknown as Record<string, unknown>)[lazyLoadFlag] === true,
      CLOSE_MODEL_LAZY_LOAD_FLAG,
      { timeout: Math.max(1000, closeModelWaitMs) },
    );
  } catch {
    // The telemetry below records lazyLoadAllowed=false; keep the proof non-fatal.
  }

  // Slice 8: drain any pre-warp tier-transition events so the post-warp
  // capture window is clean. The directed warp + review pose are the
  // interesting window for materialization flow.
  await captureTierTransitionEvents(page);
  const directedZoneWarp = await prepareDirectedZoneWarp(page, probeMode, closeModelWaitMs);
  const reviewPose = await prepareCloseGlbReviewPose(page);
  if (reviewPose.attempted) {
    try {
      await page.waitForFunction(() => {
        const engine = (window as any).__engine;
        const combat = engine?.systemManager?.combatantSystem;
        const renderer = combat?.combatantRenderer ?? combat?.getRenderer?.();
        const profile = typeof (window as any).npcMaterializationProfile === 'function'
          ? (window as any).npcMaterializationProfile(24)
          : null;
        const active = renderer?.activeCloseModels instanceof Map
          ? renderer.activeCloseModels.size
          : Number(profile?.closeModelStats?.activeCloseModels ?? 0);
        const stats = profile?.closeModelStats ?? (typeof renderer?.getCloseModelRuntimeStats === 'function'
          ? renderer.getCloseModelRuntimeStats()
          : null);
        const candidates = Number(stats?.candidatesWithinCloseRadius ?? 0);
        const poolLoads = Number(stats?.poolLoads ?? 0);
        const poolLoadingFallbacks = Number(stats?.fallbackCounts?.['pool-loading'] ?? 0);
        return candidates === 0 || (active > 0 && poolLoads === 0 && poolLoadingFallbacks === 0);
      }, null, { timeout: Math.max(1000, closeModelWaitMs) });
    } catch {
      // Timeout is a valid blocker; classify from runtime state below.
    }
    await page.waitForTimeout(650);
  }

  const telemetry = await getCloseModelTelemetry(page);
  const visibleNpcCloseGlbCount = await closeGlbCount(page);
  // Slice 9: capture a steady-state perf window at the review pose, with
  // full scene visible (vegetation + terrain still on). Placed here before
  // the candidate-crop block which hides vegetation/terrain and runs a
  // static-frame screenshot path that would skew sample frame times.
  const perfWindow = reviewPose.attempted
    ? await captureMaterializationPerfWindow(page, 4500)
    : null;
  const candidate = visibleNpcCloseGlbCount > 0
    ? await selectCloseGlbCandidate(page, reviewPose.targetCombatantId)
    : null;
  let screenshot: string | null = null;
  let crop: string | null = null;
  let cropRect: { x: number; y: number; width: number; height: number } | null = null;
  let metrics: ImageMetrics | null = null;
  const findings: string[] = [];
  const cropIsolation: string[] = [];

  if (!reviewPose.attempted) {
    findings.push(reviewPose.reason ?? 'close-glb-review-pose-not-attempted');
  }
  if (!telemetry.lazyLoadAllowed) {
    findings.push('close-glb-lazy-load-not-yet-allowed');
  }
  if (telemetry.materializationProfileSource !== 'window.npcMaterializationProfile') {
    findings.push('npc-materialization-profile-fallback');
  }
  if ((telemetry.closeModelRuntimeStats?.candidatesWithinCloseRadius ?? 0) === 0) {
    findings.push('no-close-model-candidates-within-radius');
  }
  if ((telemetry.closeModelRuntimeStats?.fallbackCount ?? 0) > 0) {
    const fallbackCounts = telemetry.closeModelRuntimeStats?.fallbackCounts ?? {};
    const reasons = Object.entries(fallbackCounts)
      .filter(([, count]) => Number(count) > 0)
      .map(([reason, count]) => `${reason}:${count}`)
      .join(',');
    findings.push(`close-glb-fallbacks:${reasons || telemetry.closeModelRuntimeStats?.fallbackCount}`);
  }
  if (telemetry.activeCloseModelCount > 0 && visibleNpcCloseGlbCount === 0) {
    findings.push('active-close-models-unattributed-or-not-visible-in-scene-census');
  }
  if (visibleNpcCloseGlbCount === 0) {
    findings.push('no-visible-npc-close-glb-for-comparison');
  }
  if (candidate && reviewPose.targetCombatantId && candidate.combatantId !== reviewPose.targetCombatantId) {
    findings.push(`close-glb-candidate-mismatch:target=${reviewPose.targetCombatantId},candidate=${candidate.combatantId ?? 'unlinked'}`);
  }

  if (candidate) {
    const rawRect = await frameCandidate(page, candidate);
    if (!rawRect) {
      findings.push('close-glb-candidate-not-projectable');
    } else {
      const loopWasRunning = await pauseRenderLoopForProbe(page);
      cropIsolation.push('vegetation-hidden-for-close-glb-material-crop');
      cropIsolation.push('terrain-hidden-for-close-glb-material-crop');
      await setVegetationVisibilityForProbe(page, false);
      await setTerrainVisibilityForProbe(page, false);
      try {
        await renderStaticProbeFrame(page);
        await page.waitForTimeout(50);
        const screenshotPath = join(modeDir, 'npc-close-glb-frame.png');
        const cropPath = join(modeDir, 'npc-close-glb-crop.png');
        await page.screenshot({ path: screenshotPath, fullPage: false });
        cropRect = await cropScreenshot(screenshotPath, cropPath, rawRect);
        metrics = await imageMetrics(cropPath);
        screenshot = relative(process.cwd(), screenshotPath);
        crop = relative(process.cwd(), cropPath);
        if (metrics.lumaMean < 0.04) findings.push(`close-glb-very-dark:luma=${metrics.lumaMean.toFixed(3)}`);
        if (metrics.lumaMean > 0.72) findings.push(`close-glb-very-bright:luma=${metrics.lumaMean.toFixed(3)}`);
        if (metrics.greenDominanceRatio > 0.65) {
          findings.push(`close-glb-background-dominant:${metrics.greenDominanceRatio.toFixed(3)}`);
        }
      } finally {
        await setTerrainVisibilityForProbe(page, true);
        await setVegetationVisibilityForProbe(page, true);
        await renderStaticProbeFrame(page);
        await resumeRenderLoopForProbe(page, loopWasRunning);
      }
    }
  }

  if (directedZoneWarp.attempted) {
    if (directedZoneWarp.combatantsWithinCloseRadiusAfter === 0) {
      findings.push(`directed-warp-no-materialization:zone=${directedZoneWarp.zoneId},waitMs=${directedZoneWarp.waitMsObserved}`);
    } else {
      findings.push(`directed-warp-materialized:zone=${directedZoneWarp.zoneId},candidates=${directedZoneWarp.combatantsWithinCloseRadiusAfter},waitMs=${directedZoneWarp.waitMsObserved}`);
    }
  }

  // Drain the tier-transition buffer after all the materialization work is
  // done. This window covers directed-warp + lazy-load gate + review pose.
  const tierEvents = await captureTierTransitionEvents(page);
  if (tierEvents.available) {
    findings.push(`tier-events:total=${tierEvents.totalEvents},firstToCloseGlb=${tierEvents.firstObservationToCloseGlb}`);
  } else {
    findings.push('tier-events:not-available-without-diag');
  }

  if (perfWindow?.attempted) {
    findings.push(
      `perf-window:frames=${perfWindow.frameCount},avg=${perfWindow.avgFrameMs.toFixed(1)}ms,p95=${perfWindow.p95FrameMs.toFixed(1)}ms,p99=${perfWindow.p99FrameMs.toFixed(1)}ms,hitch33=${perfWindow.hitch33Count}`,
    );
  } else if (perfWindow) {
    findings.push(`perf-window:not-attempted:${perfWindow.reason ?? 'unknown'}`);
  } else {
    findings.push('perf-window:review-pose-not-attempted');
  }

  const status: ProbeStatus = visibleNpcCloseGlbCount > 0 && findings.length === 0 ? 'pass' : 'warn';
  return {
    visibleNpcCloseGlbCount,
    status,
    finding: findings.join(';') || `visible-npc-close-glb-count:${visibleNpcCloseGlbCount}`,
    cropIsolation,
    initialTelemetry,
    startupPrewarmMarks,
    tierEvents,
    directedZoneWarp,
    reviewPose,
    perfWindow,
    telemetry,
    candidate,
    screenshot,
    crop,
    cropRect,
    metrics,
  };
}

function modeStatus(result: Omit<ModeCropResult, 'status'>): ProbeStatus {
  if (
    !result.strictWebGPUReady ||
    result.consoleErrors.length > 0 ||
    result.pageErrors.length > 0 ||
    result.requestFailures.length > 0
  ) {
    return 'fail';
  }
  if (result.crops.some(crop => crop.status === 'warn') || result.closeGlbComparison.status === 'warn') return 'warn';
  return 'pass';
}

function reportStatus(results: ModeCropResult[]): ProbeStatus {
  if (results.some(result => result.status === 'fail')) return 'fail';
  if (results.some(result => result.status === 'warn')) return 'warn';
  return 'pass';
}

async function runMode(
  page: Page,
  artifactDir: string,
  mode: string,
  renderer: string,
  port: number,
  closeModelWaitMs: number,
): Promise<ModeCropResult> {
  const modeDir = join(artifactDir, mode);
  mkdirSync(modeDir, { recursive: true });
  const url = `http://${HOST}:${port}/?perf=1&diag=1&renderer=${encodeURIComponent(renderer)}&logLevel=warn`;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', error => pageErrors.push(error.message.slice(0, 300)));
  page.on('requestfailed', request => {
    const failure = request.failure();
    requestFailures.push(`${request.method()} ${request.url()} :: ${failure?.errorText ?? 'unknown'}`.slice(0, 500));
  });
  await page.addInitScript({
    content: 'globalThis.__name = globalThis.__name || function(target) { return target; };',
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await startMode(page, runtimeModeForProbeMode(mode));
  await page.waitForTimeout(2500);
  const capabilities = await getCapabilities(page);
  const crops = [
    await captureSurfaceCrop(page, modeDir, 'vegetation'),
    await captureSurfaceCrop(page, modeDir, 'npc'),
  ];
  const closeGlbComparison = await captureCloseGlbComparison(page, modeDir, closeModelWaitMs, mode);
  const startupTerrainFeatureCompileMarks = await getStartupTerrainFeatureCompileMarks(page);
  const partial = {
    mode,
    url,
    resolvedBackend: capabilities.resolvedBackend,
    strictWebGPUReady: capabilities.strictWebGPUReady,
    startupTerrainFeatureCompileMarks,
    crops,
    closeGlbComparison,
    consoleErrors,
    pageErrors,
    requestFailures,
  };
  return {
    ...partial,
    status: modeStatus(partial),
  };
}

function writeMarkdown(report: CropProbeReport): string {
  const lines: string[] = [
    '# KONVEYER Asset Crop Probe',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status}`,
    `Renderer: ${report.options.renderer}`,
    '',
    '## Results',
    '',
    '| Mode | Surface | Status | Crop | Luma | Saturation | Green dominance | Findings |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | --- |',
  ];
  for (const result of report.results) {
    for (const crop of result.crops) {
      lines.push([
        result.mode,
        crop.surface,
        crop.status,
        crop.crop ?? 'missing',
        crop.metrics ? crop.metrics.lumaMean.toFixed(3) : 'n/a',
        crop.metrics ? crop.metrics.saturationMean.toFixed(3) : 'n/a',
        crop.metrics ? crop.metrics.greenDominanceRatio.toFixed(3) : 'n/a',
        crop.findings.join('<br>') || 'none',
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    lines.push([
      result.mode,
      'close-glb',
      result.closeGlbComparison.status,
      result.closeGlbComparison.crop ?? 'missing',
      result.closeGlbComparison.metrics ? result.closeGlbComparison.metrics.lumaMean.toFixed(3) : 'n/a',
      result.closeGlbComparison.metrics ? result.closeGlbComparison.metrics.saturationMean.toFixed(3) : 'n/a',
      result.closeGlbComparison.metrics ? result.closeGlbComparison.metrics.greenDominanceRatio.toFixed(3) : 'n/a',
      result.closeGlbComparison.finding,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push(
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map(nonClaim => `- ${nonClaim}`),
    '',
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const modes = normalizeModes(parseStringFlag('modes', 'open_frontier,a_shau_valley'));
  const renderer = parseStringFlag('renderer', 'webgpu-strict');
  const port = parseNumberFlag('port', DEFAULT_PORT);
  const closeModelWaitMs = parseNumberFlag('close-model-wait-ms', 9000);
  const headed = hasFlag('headed');
  const distPerf = join(process.cwd(), 'dist-perf', 'index.html');
  if (!existsSync(distPerf)) {
    throw new Error('dist-perf missing. Run npm run build:perf before konveyer asset crop probe.');
  }
  const artifactDir = join(ARTIFACT_ROOT, nowSlug(), OUTPUT_NAME);
  mkdirSync(artifactDir, { recursive: true });
  let server: ServerHandle | null = null;
  let browser: Browser | null = null;
  try {
    server = await startServer({
      host: HOST,
      port,
      rootDir: join(process.cwd(), 'dist-perf'),
      label: 'asset-crop',
    });
    browser = await chromium.launch({ headless: !headed });
    const page = await browser.newPage({ viewport: VIEWPORT });
    const results: ModeCropResult[] = [];
    for (const mode of modes) {
      results.push(await runMode(page, artifactDir, mode, renderer, port, closeModelWaitMs));
    }
    const jsonPath = join(artifactDir, 'asset-crop-probe.json');
    const markdownPath = join(artifactDir, 'asset-crop-probe.md');
    const report: CropProbeReport = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitSha(),
      mode: OUTPUT_NAME,
      status: reportStatus(results),
      options: { modes, renderer, headed, port, closeModelWaitMs },
      output: {
        json: relative(process.cwd(), jsonPath),
        markdown: relative(process.cwd(), markdownPath),
      },
      results,
      nonClaims: [
        'This probe does not update perf baselines.',
        'This probe does not accept WebGL fallback evidence.',
        'This probe captures representative final-frame crops only; human visual review and per-faction/animation coverage are still required.',
      ],
    };
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(markdownPath, writeMarkdown(report));
    console.log(`KONVEYER asset crop probe written to ${relative(process.cwd(), markdownPath)}`);
    if (report.status === 'fail') process.exitCode = 1;
  } finally {
    await browser?.close();
    if (server) await stopServer(server);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
