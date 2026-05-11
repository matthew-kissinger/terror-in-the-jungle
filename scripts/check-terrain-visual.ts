#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import { A_SHAU_VALLEY_CONFIG } from '../src/config/AShauValleyConfig';
import type { GameModeConfig, MapFeatureDefinition, ZoneConfig } from '../src/config/gameModeTypes';
import { OPEN_FRONTIER_CONFIG } from '../src/config/OpenFrontierConfig';
import { generateAirfieldLayout } from '../src/systems/world/AirfieldLayoutGenerator';
import { AIRFIELD_TEMPLATES } from '../src/systems/world/AirfieldTemplates';
import { startServer, stopServer } from './preview-server';

type CheckStatus = 'pass' | 'warn' | 'fail';
type ShotKind =
  | 'player-ground'
  | 'route-trail'
  | 'river-oblique'
  | 'river-ground'
  | 'airfield-foundation'
  | 'airfield-parking'
  | 'support-foundation';

interface ReviewOptions {
  port: number;
  headless: boolean;
  renderer: string;
}

interface Anchor {
  x: number;
  z: number;
  lookX: number;
  lookZ: number;
}

interface ShotPlan {
  kind: ShotKind;
  description: string;
  anchor: Anchor | null;
  heightAGL: number;
  distanceBack: number;
  requireHydrology: boolean;
  requireFoundation?: boolean;
  heightReference?: 'camera-terrain' | 'target-terrain';
}

interface RendererInfo {
  drawCalls?: number;
  triangles?: number;
  geometries?: number;
  textures?: number;
  programs?: number;
}

interface WaterDebugInfo {
  enabled?: boolean;
  waterVisible?: boolean;
  hydrologyRiverVisible?: boolean;
  hydrologyChannelCount?: number;
  hydrologySegmentCount?: number;
  hydrologyVertexCount?: number;
  hydrologyTotalLengthMeters?: number;
}

interface ShotMetrics {
  camera: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  terrainY: number;
  terrain: {
    hasTerrainAtCamera: boolean | null;
    areaReadyAtCamera: boolean | null;
    activeTerrainTiles: number | null;
    vegetationActiveTotal: number | null;
    billboardDebug: Record<string, unknown> | null;
  };
  worldFeatures: {
    sectors: number;
    visibleSectors: number;
    featureGroups: number;
    visibleFeatureGroups: number;
    forcedVisibleForReview: boolean;
  };
  waterInfo: WaterDebugInfo | null;
  rendererInfo: RendererInfo | null;
  renderText: string | null;
}

interface ImageMetrics {
  width: number;
  height: number;
  lumaMean: number;
  lumaStdDev: number;
  greenDominanceRatio: number;
  overexposedRatio: number;
  edgeContrast: number;
}

interface ReviewShot {
  kind: ShotKind;
  description: string;
  file: string;
  metrics: ShotMetrics;
  imageMetrics: ImageMetrics;
  errors: string[];
}

interface ScenarioResult {
  mode: string;
  status: CheckStatus;
  routeAnchor: Anchor | null;
  shots: ReviewShot[];
  browserErrors: string[];
  pageErrors: string[];
}

interface TerrainVisualReviewReport {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  mode: 'projekt-143-terrain-visual-review';
  status: CheckStatus;
  options: ReviewOptions;
  files: {
    summary: string;
    markdown: string;
    contactSheet: string;
  };
  scenarios: ScenarioResult[];
  checks: Array<{ id: string; status: CheckStatus; value: unknown; message: string }>;
  requiredNextActions: string[];
  nonClaims: string[];
}

interface HarnessWindow extends Window {
  render_game_to_text?: () => string;
  __engine?: {
    gameStarted?: boolean;
    startGameWithMode?: (mode: string) => Promise<unknown>;
    renderer?: {
      scene?: HarnessScene;
      camera?: HarnessCamera;
      threeRenderer?: HarnessThreeRenderer;
      renderer?: HarnessThreeRenderer;
      setOverrideCamera?: (camera: HarnessCamera | null) => void;
    };
    systemManager?: {
      atmosphereSystem?: {
        syncDomePosition?: (position: { x: number; y: number; z: number }) => void;
        setTerrainYAtCamera?: (height: number) => void;
      };
      terrainSystem?: HarnessTerrainSystem;
      globalBillboardSystem?: {
        getDebugInfo?: () => Record<string, unknown>;
      };
      waterSystem?: {
        getDebugInfo?: () => WaterDebugInfo;
      };
    };
  };
}

interface HarnessScene {
  getObjectByName?: (name: string) => HarnessObject | undefined;
  traverse?: (callback: (object: HarnessSceneObject) => void) => void;
}

interface HarnessSceneObject {
  name?: string;
  visible?: boolean;
}

interface HarnessCamera {
  near: number;
  far: number;
  aspect?: number;
  clone(): HarnessCamera;
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  lookAt(x: number, y: number, z: number): void;
  updateProjectionMatrix?: () => void;
  updateMatrixWorld?: (force?: boolean) => void;
}

interface HarnessThreeRenderer {
  info?: {
    render?: { calls?: number; triangles?: number };
    memory?: { geometries?: number; textures?: number };
    programs?: unknown[];
  };
  render?: (scene: HarnessScene, camera: HarnessCamera) => void;
}

interface HarnessObject {
  geometry?: {
    getAttribute?: (name: string) => { count?: number } | undefined;
    computeBoundingBox?: () => void;
    boundingBox?: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    } | null;
  };
}

interface HarnessTerrainSystem {
  getHeightAt?: (x: number, z: number) => number;
  hasTerrainAt?: (x: number, z: number) => boolean;
  isAreaReadyAt?: (x: number, z: number) => boolean;
  getActiveTerrainTileCount?: () => number;
  getBillboardDebugInfo?: () => Record<string, unknown>;
  updatePlayerPosition?: (position: { x: number; y: number; z: number }) => void;
  update?: (dt: number) => void;
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-terrain-visual-review';
const DEFAULT_PORT = 9241;
const VIEWPORT = { width: 1440, height: 900 };
const SCENARIOS = [
  { mode: 'open_frontier', config: OPEN_FRONTIER_CONFIG },
  { mode: 'a_shau_valley', config: A_SHAU_VALLEY_CONFIG },
] as const;
const EMPTY_IMAGE_METRICS: ImageMetrics = {
  width: 0,
  height: 0,
  lumaMean: 0,
  lumaStdDev: 0,
  greenDominanceRatio: 0,
  overexposedRatio: 0,
  edgeContrast: 0,
};

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

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function parseOptions(): ReviewOptions {
  const port = Number(argValue('--port') ?? DEFAULT_PORT);
  const renderer = String(argValue('--renderer') ?? 'default');
  return {
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    headless: !process.argv.includes('--headed'),
    renderer,
  };
}

function assertPerfBuildExists(): void {
  if (!existsSync(join(process.cwd(), 'dist-perf', 'index.html'))) {
    throw new Error('dist-perf/index.html is missing. Run `npm run build:perf` before this visual review.');
  }
}

function distanceSq(a: ZoneConfig, b: ZoneConfig): number {
  const dx = a.position.x - b.position.x;
  const dz = a.position.z - b.position.z;
  return dx * dx + dz * dz;
}

function routeAnchor(config: GameModeConfig): Anchor | null {
  const zones = config.zones ?? [];
  const homes = zones.filter((zone) => zone.isHomeBase);
  const objectives = zones.filter((zone) => !zone.isHomeBase);
  const from = homes[0] ?? zones[0];
  if (!from) return null;
  const to = objectives.slice().sort((a, b) => distanceSq(from, a) - distanceSq(from, b))[0] ?? zones[1];
  if (!to) return null;
  return {
    x: (from.position.x + to.position.x) / 2,
    z: (from.position.z + to.position.z) / 2,
    lookX: to.position.x,
    lookZ: to.position.z,
  };
}

function featureRadius(feature: MapFeatureDefinition): number {
  const footprint = feature.footprint;
  if (!footprint) return 0;
  if (footprint.shape === 'circle') return footprint.radius;
  if (footprint.shape === 'rect' || footprint.shape === 'strip') {
    return Math.hypot(footprint.width, footprint.length) * 0.5;
  }
  return Math.max(0, ...footprint.points.map((point) => Math.hypot(point.x, point.z)));
}

function rotateLocalOffset(feature: MapFeatureDefinition, localX: number, localZ: number): { x: number; z: number } {
  const yaw = feature.placement?.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: feature.position.x + localX * cos + localZ * sin,
    z: feature.position.z - localX * sin + localZ * cos,
  };
}

function featureForwardAnchor(feature: MapFeatureDefinition, offsetBack = 0): Anchor {
  const yaw = feature.placement?.yaw ?? 0;
  const origin = rotateLocalOffset(feature, 0, offsetBack);
  return {
    x: origin.x,
    z: origin.z,
    lookX: origin.x + Math.sin(yaw) * 120,
    lookZ: origin.z + Math.cos(yaw) * 120,
  };
}

function localFeatureAnchor(feature: MapFeatureDefinition, localX: number, localZ: number): Anchor {
  const yaw = feature.placement?.yaw ?? 0;
  const world = rotateLocalOffset(feature, localX, localZ);
  return {
    x: world.x,
    z: world.z,
    lookX: world.x + Math.sin(yaw) * 100,
    lookZ: world.z + Math.cos(yaw) * 100,
  };
}

function mainAirfieldFeature(config: GameModeConfig): MapFeatureDefinition | null {
  return [...(config.features ?? [])]
    .filter((feature) => feature.kind === 'airfield' && Boolean(feature.templateId))
    .sort((a, b) => featureRadius(b) - featureRadius(a))[0] ?? null;
}

function supportFoundationFeature(config: GameModeConfig): MapFeatureDefinition | null {
  const features = config.features ?? [];
  return features.find((feature) => feature.prefabId === 'motor_pool_heavy')
    ?? features.find((feature) => feature.prefabId === 'airfield_support_compound_small')
    ?? features.find((feature) => feature.id.includes('motor_pool'))
    ?? features.find((feature) => feature.kind === 'firebase' && feature.prefabId?.includes('firebase'))
    ?? null;
}

function airfieldParkingAnchor(feature: MapFeatureDefinition | null): Anchor | null {
  if (!feature || feature.kind !== 'airfield' || !feature.templateId) return null;
  const template = AIRFIELD_TEMPLATES[feature.templateId];
  if (!template || template.parkingSpots.length === 0) return featureForwardAnchor(feature);
  const center = template.parkingSpots.reduce(
    (acc, spot) => {
      acc.along += spot.offsetAlongRunway;
      acc.lateral += spot.offsetLateral;
      return acc;
    },
    { along: 0, lateral: 0 },
  );
  center.along /= template.parkingSpots.length;
  center.lateral /= template.parkingSpots.length;
  return localFeatureAnchor(feature, center.lateral, center.along);
}

function airfieldStructureAnchor(feature: MapFeatureDefinition | null): Anchor | null {
  if (!feature || feature.kind !== 'airfield' || !feature.templateId) return null;
  const template = AIRFIELD_TEMPLATES[feature.templateId];
  if (!template) return featureForwardAnchor(feature);
  const structures = generateAirfieldLayout(
    template,
    feature.position,
    feature.placement?.yaw ?? 0,
    feature.seedHint ?? feature.id,
  ).placements.filter((placement) => placement.id?.startsWith('struct'));
  if (structures.length === 0) return featureForwardAnchor(feature);
  const center = structures.reduce(
    (acc, placement) => {
      acc.x += placement.offset.x;
      acc.z += placement.offset.z;
      return acc;
    },
    { x: 0, z: 0 },
  );
  center.x /= structures.length;
  center.z /= structures.length;
  return localFeatureAnchor(feature, center.x, center.z);
}

async function startMode(page: Page, mode: string): Promise<void> {
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
}

function imageMetricCheck(data: Buffer, width: number, height: number): ImageMetrics {
  let lumaTotal = 0;
  let lumaSquaredTotal = 0;
  let greenDominant = 0;
  let overexposed = 0;
  let edgeTotal = 0;
  let edgeSamples = 0;
  const pixels = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaTotal += luma;
    lumaSquaredTotal += luma * luma;
    if (g > r * 1.04 && g > b * 1.04) greenDominant++;
    if (luma > 245) overexposed++;
  }
  for (let y = 0; y < height; y += 8) {
    for (let x = 8; x < width; x += 8) {
      const idx = (y * width + x) * 4;
      const prev = (y * width + x - 8) * 4;
      const luma = 0.2126 * (data[idx] ?? 0) + 0.7152 * (data[idx + 1] ?? 0) + 0.0722 * (data[idx + 2] ?? 0);
      const prevLuma = 0.2126 * (data[prev] ?? 0) + 0.7152 * (data[prev + 1] ?? 0) + 0.0722 * (data[prev + 2] ?? 0);
      edgeTotal += Math.abs(luma - prevLuma);
      edgeSamples++;
    }
  }
  const mean = pixels > 0 ? lumaTotal / pixels : 0;
  const variance = pixels > 0 ? Math.max(0, lumaSquaredTotal / pixels - mean * mean) : 0;
  return {
    width,
    height,
    lumaMean: Number(mean.toFixed(2)),
    lumaStdDev: Number(Math.sqrt(variance).toFixed(2)),
    greenDominanceRatio: pixels > 0 ? Number((greenDominant / pixels).toFixed(4)) : 0,
    overexposedRatio: pixels > 0 ? Number((overexposed / pixels).toFixed(4)) : 0,
    edgeContrast: edgeSamples > 0 ? Number((edgeTotal / edgeSamples).toFixed(2)) : 0,
  };
}

async function imageMetrics(path: string): Promise<ImageMetrics> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return imageMetricCheck(data, info.width, info.height);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function writeContactSheet(scenarios: ScenarioResult[], artifactDir: string): Promise<string> {
  const thumbWidth = 640;
  const thumbHeight = 400;
  const labelHeight = 38;
  const gap = 14;
  const padding = 18;
  const columns = 2;
  const shots = scenarios.flatMap((scenario) => scenario.shots.map((shot) => ({ scenario, shot })));
  const rows = Math.max(1, Math.ceil(shots.length / columns));
  const width = padding * 2 + columns * thumbWidth + (columns - 1) * gap;
  const height = padding * 2 + rows * (thumbHeight + labelHeight) + (rows - 1) * gap;
  const composites: sharp.OverlayOptions[] = [];

  for (const [index, entry] of shots.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = padding + column * (thumbWidth + gap);
    const top = padding + row * (thumbHeight + labelHeight + gap);
    const shotPath = entry.shot.file ? join(process.cwd(), entry.shot.file) : '';
    const passed = shotPassed(entry.shot);
    const label = `${entry.scenario.mode} / ${entry.shot.kind} / ${passed ? 'PASS' : 'WARN'}`;
    const labelSvg = [
      `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">`,
      '<rect width="100%" height="100%" fill="#101316"/>',
      `<rect x="0" y="0" width="8" height="${labelHeight}" fill="${passed ? '#38b970' : '#d39b32'}"/>`,
      `<text x="18" y="25" fill="#edf2f0" font-family="Arial, sans-serif" font-size="18">${escapeXml(label)}</text>`,
      '</svg>',
    ].join('');
    composites.push({ input: Buffer.from(labelSvg), left, top });

    if (shotPath && existsSync(shotPath)) {
      const image = await sharp(shotPath)
        .resize(thumbWidth, thumbHeight, { fit: 'cover' })
        .png()
        .toBuffer();
      composites.push({ input: image, left, top: top + labelHeight });
    }
  }

  const output = join(artifactDir, 'terrain-visual-contact-sheet.png');
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#0b0f12',
    },
  })
    .composite(composites)
    .png()
    .toFile(output);
  return rel(output);
}

async function hydrologyAnchor(page: Page): Promise<Anchor | null> {
  return page.evaluate(() => {
    const engine = (window as HarnessWindow).__engine;
    const scene = engine?.renderer?.scene;
    const geometry = scene?.getObjectByName?.('hydrology-river-surface-mesh')?.geometry;
    geometry?.computeBoundingBox?.();
    const box = geometry?.boundingBox;
    if (!box) return null;
    const centerX = (box.min.x + box.max.x) / 2;
    const centerZ = (box.min.z + box.max.z) / 2;
    return {
      x: centerX,
      z: centerZ,
      lookX: centerX + 90,
      lookZ: centerZ + 90,
    };
  });
}

async function currentPlayerAnchor(page: Page): Promise<Anchor | null> {
  return page.evaluate(() => {
    const raw = typeof (window as HarnessWindow).render_game_to_text === 'function'
      ? (window as HarnessWindow).render_game_to_text?.()
      : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { player?: { x?: number; z?: number } };
    const x = parsed.player?.x;
    const z = parsed.player?.z;
    if (typeof x !== 'number' || typeof z !== 'number') return null;
    return { x, z, lookX: x + 90, lookZ: z - 90 };
  });
}

async function captureShot(page: Page, plan: ShotPlan, mode: string, artifactDir: string): Promise<ReviewShot> {
  const errors: string[] = [];
  const metrics = await page.evaluate(({ shotPlan, viewport }) => {
    const engine = (window as HarnessWindow).__engine;
    const renderer = engine?.renderer;
    const camera = renderer?.camera;
    const scene = renderer?.scene;
    const threeRenderer = renderer?.threeRenderer ?? renderer?.renderer;
    const terrain = engine?.systemManager?.terrainSystem;
    const billboards = engine?.systemManager?.globalBillboardSystem;
    const atmosphere = engine?.systemManager?.atmosphereSystem;
    if (!engine || !camera || !scene || !threeRenderer || !terrain || !shotPlan.anchor) {
      throw new Error('engine/renderer/terrain/anchor unavailable');
    }

    const worldFeatureStats = {
      sectors: 0,
      visibleSectors: 0,
      featureGroups: 0,
      visibleFeatureGroups: 0,
      forcedVisibleForReview: Boolean(shotPlan.requireFoundation),
    };
    scene.traverse?.((object) => {
      const name = object.name ?? '';
      if (name.startsWith('WorldFeatureSector_')) {
        worldFeatureStats.sectors++;
        if (shotPlan.requireFoundation) object.visible = true;
        if (object.visible !== false) worldFeatureStats.visibleSectors++;
      } else if (name.startsWith('WorldFeature_')) {
        worldFeatureStats.featureGroups++;
        if (shotPlan.requireFoundation) object.visible = true;
        if (object.visible !== false) worldFeatureStats.visibleFeatureGroups++;
      }
    });

    const dx = shotPlan.anchor.lookX - shotPlan.anchor.x;
    const dz = shotPlan.anchor.lookZ - shotPlan.anchor.z;
    const length = Math.hypot(dx, dz) || 1;
    const backX = shotPlan.anchor.x - (dx / length) * shotPlan.distanceBack;
    const backZ = shotPlan.anchor.z - (dz / length) * shotPlan.distanceBack;
    const terrainYRaw = terrain.getHeightAt?.(backX, backZ);
    const targetYRaw = terrain.getHeightAt?.(shotPlan.anchor.x, shotPlan.anchor.z);
    const terrainY = Number.isFinite(terrainYRaw) ? Number(terrainYRaw) : 0;
    const targetY = Number.isFinite(targetYRaw) ? Number(targetYRaw) : terrainY;
    const activeCamera = renderer.setOverrideCamera ? camera.clone() : camera;
    const cameraHeightBase = shotPlan.heightReference === 'target-terrain' ? targetY : terrainY;
    activeCamera.position.set(backX, cameraHeightBase + shotPlan.heightAGL, backZ);
    activeCamera.lookAt(shotPlan.anchor.x, targetY + Math.max(1.5, shotPlan.heightAGL * 0.15), shotPlan.anchor.z);
    activeCamera.near = 0.1;
    activeCamera.far = Math.max(activeCamera.far, 4_000);
    if (typeof activeCamera.aspect === 'number') activeCamera.aspect = viewport.width / viewport.height;
    activeCamera.updateProjectionMatrix?.();
    activeCamera.updateMatrixWorld?.(true);
    renderer.setOverrideCamera?.(activeCamera);

    terrain.updatePlayerPosition?.(activeCamera.position);
    for (let i = 0; i < 20; i++) terrain.update?.(0.016);
    atmosphere?.syncDomePosition?.(activeCamera.position);
    atmosphere?.setTerrainYAtCamera?.(terrainY);
    threeRenderer.render?.(scene, activeCamera);

    const billboardDebug = billboards?.getDebugInfo?.() ?? null;
    const vegetationActiveTotal = billboardDebug
      ? Object.entries(billboardDebug).reduce((sum, [key, value]) =>
        key.endsWith('Active') && typeof value === 'number' ? sum + value : sum, 0)
      : null;
    const rendererInfo = threeRenderer.info;
    return {
      camera: { x: activeCamera.position.x, y: activeCamera.position.y, z: activeCamera.position.z },
      target: { x: shotPlan.anchor.x, y: targetY, z: shotPlan.anchor.z },
      terrainY,
      terrain: {
        hasTerrainAtCamera: terrain.hasTerrainAt?.(activeCamera.position.x, activeCamera.position.z) ?? null,
        areaReadyAtCamera: terrain.isAreaReadyAt?.(activeCamera.position.x, activeCamera.position.z) ?? null,
        activeTerrainTiles: terrain.getActiveTerrainTileCount?.() ?? null,
        vegetationActiveTotal,
        billboardDebug,
      },
      worldFeatures: worldFeatureStats,
      waterInfo: engine.systemManager?.waterSystem?.getDebugInfo?.() ?? null,
      rendererInfo: rendererInfo
        ? {
          drawCalls: rendererInfo.render?.calls,
          triangles: rendererInfo.render?.triangles,
          geometries: rendererInfo.memory?.geometries,
          textures: rendererInfo.memory?.textures,
          programs: rendererInfo.programs?.length,
        }
        : null,
      renderText: typeof (window as HarnessWindow).render_game_to_text === 'function'
        ? (window as HarnessWindow).render_game_to_text?.() ?? null
        : null,
    };
  }, { shotPlan: plan, viewport: VIEWPORT });

  await page.waitForTimeout(400);
  const screenshot = join(artifactDir, `${mode}-${plan.kind}.png`);
  await page.screenshot({ path: screenshot, fullPage: false }).catch((error: Error) => {
    errors.push(error.message);
  });
  const capturedFile = existsSync(screenshot) ? rel(screenshot) : '';
  if (!capturedFile) {
    errors.push('screenshot file missing after capture');
  }
  return {
    kind: plan.kind,
    description: plan.description,
    file: capturedFile,
    metrics,
    imageMetrics: capturedFile ? await imageMetrics(screenshot) : { ...EMPTY_IMAGE_METRICS },
    errors,
  };
}

function shotPassed(shot: ReviewShot): boolean {
  return shot.errors.length === 0
    && shot.imageMetrics.lumaStdDev > 3
    && shot.imageMetrics.edgeContrast > 0.35
    && shot.metrics.terrain.hasTerrainAtCamera !== false
    && (shot.metrics.terrain.activeTerrainTiles ?? 0) > 0;
}

function shotHasExposureRisk(shot: ReviewShot): boolean {
  const metrics = shot.imageMetrics;
  return metrics.lumaMean >= 225
    && metrics.greenDominanceRatio < 0.05
    && (metrics.edgeContrast < 4 || metrics.overexposedRatio > 0.45);
}

function shotHasGroundToneRisk(shot: ReviewShot): boolean {
  const metrics = shot.imageMetrics;
  return metrics.lumaMean >= 205
    && metrics.greenDominanceRatio < 0.08
    && metrics.edgeContrast < 3.6;
}

async function runScenario(
  page: Page,
  mode: string,
  config: GameModeConfig,
  artifactDir: string,
  port: number,
  renderer: string,
): Promise<ScenarioResult> {
  const browserErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') browserErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const rendererQuery = renderer === 'default' ? '' : `&renderer=${encodeURIComponent(renderer)}`;
  await page.goto(`http://127.0.0.1:${port}/?perf=1&capture=1&logLevel=error${rendererQuery}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await startMode(page, mode);
  await page.waitForTimeout(mode === 'a_shau_valley' ? 7_000 : 5_000);

  const player = await currentPlayerAnchor(page);
  const route = routeAnchor(config);
  const river = await hydrologyAnchor(page);
  const airfield = mainAirfieldFeature(config);
  const support = supportFoundationFeature(config);
  const plans: ShotPlan[] = [
    { kind: 'player-ground', description: 'player-adjacent ground cover and local vegetation', anchor: player, heightAGL: 2.2, distanceBack: 20, requireHydrology: false },
    { kind: 'route-trail', description: 'terrain-flow route/trail midpoint between home base and objective', anchor: route, heightAGL: 4.5, distanceBack: 34, requireHydrology: false },
    { kind: 'airfield-foundation', description: 'airfield pad, generated structures, and terrain shoulder foundation fit', anchor: airfieldStructureAnchor(airfield), heightAGL: 24, distanceBack: 95, requireHydrology: false, requireFoundation: true, heightReference: 'target-terrain' },
    { kind: 'airfield-parking', description: 'parked aircraft/vehicle stand grounding near the airfield apron', anchor: airfieldParkingAnchor(airfield), heightAGL: 18, distanceBack: 46, requireHydrology: false, requireFoundation: true, heightReference: 'target-terrain' },
    { kind: 'support-foundation', description: 'motor-pool/support-compound prop and vehicle foundation fit on shaped terrain', anchor: support ? featureForwardAnchor(support) : null, heightAGL: 18, distanceBack: 58, requireHydrology: false, requireFoundation: true, heightReference: 'target-terrain' },
    { kind: 'river-oblique', description: 'hydrology river-strip oblique visual review', anchor: river, heightAGL: 70, distanceBack: 115, requireHydrology: true },
    { kind: 'river-ground', description: 'hydrology river-strip ground-level visual review', anchor: river, heightAGL: 5, distanceBack: 40, requireHydrology: true },
  ];
  const shots: ReviewShot[] = [];
  for (const plan of plans) {
    if (!plan.anchor && (plan.requireHydrology || plan.requireFoundation)) {
      shots.push({
        kind: plan.kind,
        description: plan.description,
        file: '',
        metrics: {
          camera: { x: 0, y: 0, z: 0 },
          target: { x: 0, y: 0, z: 0 },
          terrainY: 0,
          terrain: { hasTerrainAtCamera: null, areaReadyAtCamera: null, activeTerrainTiles: null, vegetationActiveTotal: null, billboardDebug: null },
          worldFeatures: { sectors: 0, visibleSectors: 0, featureGroups: 0, visibleFeatureGroups: 0, forcedVisibleForReview: false },
          waterInfo: null,
          rendererInfo: null,
          renderText: null,
        },
        imageMetrics: { ...EMPTY_IMAGE_METRICS },
        errors: [plan.requireHydrology ? 'hydrology anchor unavailable' : 'foundation anchor unavailable'],
      });
      continue;
    }
    if (!plan.anchor) continue;
    shots.push(await captureShot(page, plan, mode, artifactDir));
  }
  const status: CheckStatus = browserErrors.length === 0
    && pageErrors.length === 0
    && shots.length >= 4
    && shots.every(shotPassed)
    && !shots.some(shotHasExposureRisk)
    ? 'pass'
    : 'warn';
  return { mode, status, routeAnchor: route, shots, browserErrors, pageErrors };
}

function check(id: string, passed: boolean, value: unknown, message: string): TerrainVisualReviewReport['checks'][number] {
  return { id, status: passed ? 'pass' : 'warn', value, message };
}

function markdown(report: TerrainVisualReviewReport): string {
  return [
    '# Projekt Objekt-143 Terrain Visual Review',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Headless: ${report.options.headless}`,
    `Renderer: ${report.options.renderer}`,
    `Contact sheet: ${report.files.contactSheet}`,
    '',
    '## Shots',
    '',
    '| Mode | Shot | File | Draw calls | Vegetation active | World features visible | Luma mean | Luma stddev | Overexposed | Edge contrast |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.scenarios.flatMap((scenario) => scenario.shots.map((shot) =>
      `| ${scenario.mode} | ${shot.kind} | ${shot.file || 'missing'} | ${shot.metrics.rendererInfo?.drawCalls ?? 'n/a'} | ${shot.metrics.terrain.vegetationActiveTotal ?? 'n/a'} | ${shot.metrics.worldFeatures.visibleFeatureGroups}/${shot.metrics.worldFeatures.featureGroups} | ${shot.imageMetrics.lumaMean} | ${shot.imageMetrics.lumaStdDev} | ${shot.imageMetrics.overexposedRatio} | ${shot.imageMetrics.edgeContrast} |`
    )),
    '',
    '## Checks',
    '',
    ...report.checks.map((entry) => `- ${entry.status.toUpperCase()} ${entry.id}: ${entry.message} (${String(entry.value)})`),
    '',
    '## Required Next Actions',
    '',
    ...report.requiredNextActions.map((item) => `- ${item}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseOptions();
  assertPerfBuildExists();
  const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
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
    args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
  });

  const scenarios: ScenarioResult[] = [];
  try {
    for (const scenario of SCENARIOS) {
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        scenarios.push(await runScenario(page, scenario.mode, scenario.config, artifactDir, server.port, options.renderer));
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }

  const allShots = scenarios.flatMap((scenario) => scenario.shots);
  const expectedShots = scenarios.length * 7;
  const foundationShots = allShots.filter((shot) =>
    shot.kind === 'airfield-foundation'
    || shot.kind === 'airfield-parking'
    || shot.kind === 'support-foundation'
  );
  const exposureRiskShots = allShots.filter(shotHasExposureRisk);
  const groundToneRiskShots = allShots.filter(shotHasGroundToneRisk);
  const checks = [
    check('expected_screenshots_captured', allShots.length === expectedShots && allShots.every((shot) => Boolean(shot.file)), `${allShots.filter((shot) => Boolean(shot.file)).length}/${expectedShots}`, 'Captured all terrain visual review screenshots.'),
    check('browser_errors_clear', scenarios.every((scenario) => scenario.browserErrors.length === 0 && scenario.pageErrors.length === 0), scenarios.reduce((sum, scenario) => sum + scenario.browserErrors.length + scenario.pageErrors.length, 0), 'Captured zero browser/page errors.'),
    check('nonblank_visual_content', allShots.every(shotPassed), `${allShots.filter(shotPassed).length}/${allShots.length}`, 'Screenshots have nonblank terrain content and basic renderer/terrain metrics.'),
    check('terrain_water_exposure_review', exposureRiskShots.length === 0, exposureRiskShots.map((shot) => `${shot.file}: mean=${shot.imageMetrics.lumaMean}, over=${shot.imageMetrics.overexposedRatio}, green=${shot.imageMetrics.greenDominanceRatio}`).join('; ') || 'none', 'Terrain/water review screenshots are not washed out by sky/water glare.'),
    check('terrain_ground_tone_review', groundToneRiskShots.length === 0, groundToneRiskShots.map((shot) => `${shot.file}: mean=${shot.imageMetrics.lumaMean}, green=${shot.imageMetrics.greenDominanceRatio}, edge=${shot.imageMetrics.edgeContrast}`).join('; ') || 'none', 'Terrain review screenshots retain enough ground tint and readable surface contrast.'),
    check('hydrology_review_shots_present', allShots.filter((shot) => shot.kind.startsWith('river') && Boolean(shot.file)).length === 4, allShots.filter((shot) => shot.kind.startsWith('river') && Boolean(shot.file)).length, 'Captured river oblique and ground-level shots for both large maps.'),
    check('foundation_review_shots_present', foundationShots.length === scenarios.length * 3 && foundationShots.every((shot) => Boolean(shot.file)), `${foundationShots.filter((shot) => Boolean(shot.file)).length}/${scenarios.length * 3}`, 'Captured airfield, parking, and support-foundation shots for both large maps.'),
  ];
  const status: CheckStatus = checks.every((entry) => entry.status === 'pass')
    && scenarios.every((scenario) => scenario.status === 'pass')
    ? 'pass'
    : 'warn';
  const contactSheet = await writeContactSheet(scenarios, artifactDir);
  const report: TerrainVisualReviewReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    sourceGitStatus: gitStatusShort(),
    mode: 'projekt-143-terrain-visual-review',
    status,
    options,
    files: {
      summary: rel(join(artifactDir, 'visual-review.json')),
      markdown: rel(join(artifactDir, 'visual-review.md')),
      contactSheet,
    },
    scenarios,
    checks,
    requiredNextActions: [
      'Owner/human review should inspect these screenshots before any final terrain-art acceptance.',
      'Inspect the airfield, parking, and support-foundation shots specifically for buildings, parked aircraft, and vehicle props hanging off cliff or hill edges.',
      'If terrain_ground_tone_review warns, treat the packet as visually rejected until terrain material, fog, exposure, or biome texture calibration restores readable ground color.',
      'If terrain_water_exposure_review warns, tune global-water reflection/exposure, hydrology strip material, camera review angles, or terrain/water compositing before treating the packet as visually acceptable.',
      'If accepted visually, pair this packet with matched Open Frontier/A Shau perf captures before moving any KB-TERRAIN target toward evidence_complete.',
      'If rejected visually, tune terrain pad stamps, airfield/support placement offsets, foundation kits, hydrology strip material, trail edges, or ground-cover distribution and rerun this packet.',
    ],
    nonClaims: [
      'This packet is visual review evidence only; it does not accept terrain art.',
      'Foundation shots force world-feature review visibility for camera override captures; they prove placement appearance, not runtime culling behavior.',
      'This packet does not prove perf, production parity, pathfinding quality, or gameplay water behavior.',
      'This packet does not import new ground-cover, trail, or tree assets.',
    ],
  };

  writeFileSync(join(artifactDir, 'visual-review.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(artifactDir, 'visual-review.md'), markdown(report), 'utf-8');

  console.log(`Projekt 143 terrain visual review ${report.status.toUpperCase()}: ${report.files.summary}`);
  for (const scenario of scenarios) {
    console.log(`${scenario.mode}: status=${scenario.status} shots=${scenario.shots.length} browserErrors=${scenario.browserErrors.length + scenario.pageErrors.length}`);
  }
  if (report.status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error('projekt-143-terrain-visual-review failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
