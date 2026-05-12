#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import sharp from 'sharp';
import {
  PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_INSTALL_SOURCE,
  PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_RESET_SOURCE,
  PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE,
} from './audit-archive/scene-attribution';
import { startServer, stopServer, type ServerHandle } from './preview-server';

type CheckStatus = 'pass' | 'warn' | 'fail';
type ProbePoseKind = 'ground' | 'elevated' | 'skyward' | 'finite-edge';

interface RendererCapabilities {
  requestedMode?: string;
  resolvedBackend?: string;
  initStatus?: string;
  strictWebGPU?: boolean;
  error?: string | null;
  notes?: string[];
}

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

interface MaterialProbe {
  surface: 'vegetation' | 'npc';
  name: string;
  type: string;
  objectName: string;
  category: string;
  uniforms: Record<string, unknown>;
  textureMetrics: Record<string, unknown>;
}

interface TerrainLodSummary {
  tileCount: number;
  countsByLod: Record<string, number>;
  areaByLod: Record<string, number>;
  morphByLod: Record<string, { min: number; max: number; avg: number; count: number }>;
  rings: Array<{
    id: string;
    minDistance: number;
    maxDistance: number | null;
    tileCount: number;
    countsByLod: Record<string, number>;
    triangleEstimate: number;
  }>;
  triangleEstimate: number;
  nearestTiles: Array<{ x: number; z: number; size: number; lodLevel: number; morphFactor: number; distance: number }>;
  largestTiles: Array<{ x: number; z: number; size: number; lodLevel: number; morphFactor: number; distance: number }>;
}

interface PoseMetrics {
  pose: ProbePoseKind;
  camera: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  world: {
    playableWorldSize: number | null;
    visualMargin: number | null;
    visualWorldSize: number | null;
    hasTerrainAtCamera: boolean | null;
    hasTerrainAtTarget: boolean | null;
    areaReadyAtCamera: boolean | null;
    activeTerrainTiles: number | null;
    terrainLod: TerrainLodSummary | null;
    horizonRing: Record<string, unknown> | null;
    billboardDebug: Record<string, unknown> | null;
  };
  rendererInfo: {
    calls: number | null;
    triangles: number | null;
    geometries: number | null;
    textures: number | null;
    programs: number | null;
  };
  dome: {
    before: { x: number; y: number; z: number } | null;
    after: { x: number; y: number; z: number } | null;
    followsCamera: boolean | null;
  };
  cloudAnchor: Record<string, unknown> | null;
  renderText: string | null;
}

interface PoseProbe {
  kind: ProbePoseKind;
  screenshot: string;
  imageMetrics: ImageMetrics;
  poseMetrics: PoseMetrics;
  renderSubmissions: Record<string, unknown> | null;
  sceneAttribution: Record<string, unknown>[] | null;
}

interface ModeProbe {
  mode: string;
  status: CheckStatus;
  url: string;
  capabilities: RendererCapabilities | null;
  materialProbes: MaterialProbe[];
  poses: PoseProbe[];
  checks: Array<{ id: string; status: CheckStatus; message: string; value?: unknown }>;
  consoleErrors: string[];
  pageErrors: string[];
}

interface ProbeReport {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  source: string;
  status: CheckStatus;
  options: {
    modes: string[];
    renderer: string;
    headed: boolean;
    port: number;
    forceBuild: boolean;
  };
  files: {
    summary: string;
    markdown: string;
  };
  modes: ModeProbe[];
  decisions: string[];
  blockers: string[];
  nonClaims: string[];
}

const HOST = '127.0.0.1';
const DEFAULT_PORT = 9271;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const VIEWPORT = { width: 1440, height: 900 };
const MODE_SET = new Set(['open_frontier', 'zone_control', 'team_deathmatch', 'ai_sandbox', 'a_shau_valley']);
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

function parseStringFlag(name: string, fallback: string): string {
  const eqArg = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (eqArg) return String(eqArg.split('=')[1] ?? fallback);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function parseNumberFlag(name: string, fallback: number): number {
  const raw = parseStringFlag(name, String(fallback));
  const parsed = Number(raw);
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
    .filter((mode, index, all) => MODE_SET.has(mode) && all.indexOf(mode) === index);
}

function runtimeModeForProbeMode(mode: string): string {
  return RUNTIME_MODE_BY_PROBE_MODE[mode] ?? mode;
}

function gitText(args: string[], fallback: string): string {
  try {
    return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
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
    if (luma > 0.92) overexposed += 1;
    if (g > r * 1.08 && g > b * 1.08) greenDominant += 1;
    if (a > 0.05) alphaCovered += 1;
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

function capabilityCheck(capabilities: RendererCapabilities | null, renderer: string): Array<{ id: string; status: CheckStatus; message: string; value?: unknown }> {
  if (renderer !== 'webgpu-strict') {
    return [{ id: 'renderer-mode', status: 'warn', message: `Probe requested renderer=${renderer}; strict WebGPU is the acceptance mode.`, value: capabilities }];
  }
  const ok = capabilities?.requestedMode === 'webgpu-strict'
    && capabilities?.resolvedBackend === 'webgpu'
    && capabilities?.initStatus === 'ready';
  return [{
    id: 'strict-webgpu-backend',
    status: ok ? 'pass' : 'fail',
    message: ok
      ? 'Strict WebGPU resolved backend=webgpu with initStatus=ready.'
      : 'Strict WebGPU did not resolve a ready WebGPU backend.',
    value: capabilities,
  }];
}

async function collectMaterialProbes(page: Page): Promise<MaterialProbe[]> {
  return page.evaluate(() => {
    const renderer = (window as any).__renderer;
    const engine = (window as any).__engine;
    const scene = renderer?.scene ?? engine?.renderer?.scene;
    if (!scene?.traverse) return [];
    const materialArray = (material: any): any[] => Array.isArray(material) ? material : material ? [material] : [];
    const toPlainValue = (value: any): unknown => {
      if (value === null || value === undefined) return value;
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
      if (value.isColor || (typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number')) {
        return { r: Number(value.r), g: Number(value.g), b: Number(value.b) };
      }
      if (typeof value.x === 'number' && typeof value.y === 'number') {
        const result: Record<string, number> = { x: Number(value.x), y: Number(value.y) };
        if (typeof value.z === 'number') result.z = Number(value.z);
        if (typeof value.w === 'number') result.w = Number(value.w);
        return result;
      }
      if (Array.isArray(value)) return value.slice(0, 16).map(toPlainValue);
      if (value?.isTexture) {
        const image = value.image;
        return {
          texture: true,
          uuid: value.uuid ?? null,
          width: Number(image?.width ?? 0),
          height: Number(image?.height ?? 0),
          source: value.source?.data?.src ?? image?.src ?? null,
        };
      }
      return String(value);
    };
    const serializeUniforms = (uniforms: Record<string, any>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [key, uniform] of Object.entries(uniforms ?? {})) {
        if (
          key.includes('map')
          || key.includes('Map')
          || key.includes('Texture')
          || key === 'tileCropMap'
          || key === 'matrixTexture'
        ) {
          continue;
        }
        out[key] = toPlainValue((uniform as any)?.value ?? uniform);
      }
      return out;
    };
    const sampleTexture = (texture: any): Record<string, unknown> => {
      if (!texture?.image) return { status: 'missing' };
      const image = texture.image;
      const width = Number(image.width ?? 0);
      const height = Number(image.height ?? 0);
      const summarizeBytes = (data: Uint8ClampedArray | Uint8Array | Float32Array, channels: number): Record<string, unknown> => {
        const pixelCount = Math.max(1, Math.floor(data.length / channels));
        const step = Math.max(1, Math.floor(pixelCount / 4096));
        let samples = 0;
        let lumaSum = 0;
        let saturationSum = 0;
        let alphaCovered = 0;
        let overexposed = 0;
        for (let p = 0; p < pixelCount; p += step) {
          const i = p * channels;
          const divisor = data instanceof Float32Array ? 1 : 255;
          const r = Number(data[i] ?? 0) / divisor;
          const g = Number(data[i + 1] ?? r * divisor) / divisor;
          const b = Number(data[i + 2] ?? r * divisor) / divisor;
          const a = channels > 3 ? Number(data[i + 3] ?? divisor) / divisor : 1;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          lumaSum += luma;
          saturationSum += max > 1e-6 ? (max - min) / max : 0;
          if (a > 0.05) alphaCovered += 1;
          if (luma > 0.92) overexposed += 1;
          samples += 1;
        }
        return {
          status: 'sampled-data',
          width,
          height,
          samples,
          lumaMean: lumaSum / Math.max(1, samples),
          saturationMean: saturationSum / Math.max(1, samples),
          alphaCoverage: alphaCovered / Math.max(1, samples),
          overexposedRatio: overexposed / Math.max(1, samples),
        };
      };
      if (image.data && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        const channels = Math.max(1, Math.floor(image.data.length / Math.max(1, width * height)));
        return summarizeBytes(image.data, channels);
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.min(256, width || image.naturalWidth || 1));
        canvas.height = Math.max(1, Math.min(256, height || image.naturalHeight || 1));
        const ctx = canvas.getContext('2d');
        if (!ctx) return { status: 'canvas-unavailable', width, height };
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        return summarizeBytes(data, 4);
      } catch (error) {
        return {
          status: 'sample-failed',
          width,
          height,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
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
    const seen = new Set<string>();
    const probes: MaterialProbe[] = [];
    scene.traverse((object: any) => {
      if (!object?.isMesh) return;
      for (const material of materialArray(object.material)) {
        if (!material) continue;
        const uniforms = material.uniforms ?? {};
        const surface = Object.prototype.hasOwnProperty.call(uniforms, 'vegetationExposure')
          ? 'vegetation'
          : Object.prototype.hasOwnProperty.call(uniforms, 'npcExposure')
            ? 'npc'
            : null;
        if (!surface) continue;
        const key = `${surface}:${material.uuid ?? material.name ?? probes.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const mapTexture = uniforms.map?.value ?? material.map ?? null;
        const normalTexture = uniforms.normalMap?.value ?? material.normalMap ?? null;
        probes.push({
          surface,
          name: String(material.name ?? '(unnamed)'),
          type: String(material.type ?? '(unknown)'),
          objectName: String(object.name ?? '(unnamed)'),
          category: categoryFor(object, material),
          uniforms: serializeUniforms(uniforms),
          textureMetrics: {
            map: sampleTexture(mapTexture),
            normalMap: sampleTexture(normalTexture),
          },
        });
      }
    });
    return probes
      .filter((probe, index, all) => all.findIndex(candidate => candidate.surface === probe.surface && candidate.name === probe.name) === index)
      .slice(0, 32);
  });
}

async function setReviewPose(page: Page, kind: ProbePoseKind): Promise<PoseMetrics> {
  return page.evaluate((poseKind: ProbePoseKind) => {
    const engine = (window as any).__engine;
    const rendererHost = engine?.renderer ?? (window as any).__renderer;
    const scene = rendererHost?.scene ?? rendererHost?.renderer?.scene;
    const camera = rendererHost?.camera ?? (window as any).__renderer?.camera;
    const terrain = engine?.systemManager?.terrainSystem;
    const atmosphere = engine?.systemManager?.atmosphereSystem;
    const billboards = engine?.systemManager?.globalBillboardSystem;
    const threeRenderer = rendererHost?.threeRenderer ?? rendererHost?.renderer ?? rendererHost;
    if (!camera?.clone) throw new Error('camera_unavailable');
    const playableWorldSize = Number(terrain?.getPlayableWorldSize?.() ?? terrain?.getWorldSize?.() ?? NaN);
    const visualMargin = Number(terrain?.getVisualMargin?.() ?? NaN);
    const visualWorldSize = Number(terrain?.getVisualWorldSize?.() ?? NaN);
    const halfWorld = Number.isFinite(playableWorldSize) && playableWorldSize > 0 ? playableWorldSize / 2 : 600;
    const terrainYAt = (x: number, z: number): number => {
      const y = Number(terrain?.getHeightAt?.(x, z) ?? 0);
      return Number.isFinite(y) ? y : 0;
    };
    let cameraX = 0;
    let cameraZ = -180;
    let targetX = 0;
    let targetZ = 0;
    let cameraY = terrainYAt(cameraX, cameraZ) + 4;
    targetZ = -60;
    let targetY = terrainYAt(targetX, targetZ) + 3;
    if (poseKind === 'skyward') {
      cameraX = 0;
      cameraZ = 0;
      cameraY = terrainYAt(cameraX, cameraZ) + 80;
      targetX = 45;
      targetZ = 8;
      targetY = cameraY + 760;
    } else if (poseKind === 'elevated') {
      cameraX = 0;
      cameraZ = -220;
      targetX = 0;
      targetZ = 0;
      cameraY = terrainYAt(cameraX, cameraZ) + 150;
      targetY = terrainYAt(targetX, targetZ) + 18;
    } else if (poseKind === 'finite-edge') {
      const setback = Math.min(Math.max(halfWorld * 0.12, 60), 180);
      const apronLook = Number.isFinite(visualMargin) ? Math.max(visualMargin + 120, 240) : 320;
      cameraX = halfWorld - setback;
      cameraZ = 0;
      targetX = halfWorld + apronLook;
      targetZ = 0;
      cameraY = terrainYAt(cameraX, cameraZ) + 150;
      targetY = terrainYAt(halfWorld - 1, targetZ) + 30;
    }
    const override = camera.clone();
    override.near = 0.1;
    override.far = Math.max(3000, visualWorldSize || playableWorldSize || camera.far || 3000);
    override.aspect = 1440 / 900;
    override.position.set(cameraX, cameraY, cameraZ);
    override.lookAt(targetX, targetY, targetZ);
    override.updateProjectionMatrix?.();
    override.updateMatrixWorld?.(true);
    rendererHost?.setOverrideCamera?.(override);
    terrain?.setRenderCameraOverride?.(override);
    terrain?.updatePlayerPosition?.(override.position);
    terrain?.update?.(0.016);
    const beforeDome = scene?.getObjectByName?.('HosekWilkieSkyDome')?.position?.clone?.() ?? null;
    atmosphere?.setTerrainYAtCamera?.(terrainYAt(cameraX, cameraZ));
    atmosphere?.syncDomePosition?.(override.position);
    const afterDome = scene?.getObjectByName?.('HosekWilkieSkyDome')?.position?.clone?.() ?? null;
    const toPoint = (v: any): { x: number; y: number; z: number } | null => v
      ? { x: Number(v.x ?? 0), y: Number(v.y ?? 0), z: Number(v.z ?? 0) }
      : null;
    const summarizeTerrainLod = (): TerrainLodSummary | null => {
      const tilesRaw = typeof terrain?.getActiveTilesForDebug === 'function'
        ? terrain.getActiveTilesForDebug()
        : null;
      if (!Array.isArray(tilesRaw)) return null;
      const tiles = tilesRaw
        .map((tile: any) => {
          const x = Number(tile.x);
          const z = Number(tile.z);
          const size = Number(tile.size);
          const lodLevel = Number(tile.lodLevel);
          const morphFactor = Number(tile.morphFactor);
          const dx = x - cameraX;
          const dz = z - cameraZ;
          return {
            x,
            z,
            size,
            lodLevel,
            morphFactor: Number.isFinite(morphFactor) ? morphFactor : 0,
            distance: Math.sqrt(dx * dx + dz * dz),
          };
        })
        .filter((tile: any) => (
          Number.isFinite(tile.x)
          && Number.isFinite(tile.z)
          && Number.isFinite(tile.size)
          && Number.isFinite(tile.lodLevel)
          && tile.size > 0
        ));
      const countsByLod: Record<string, number> = {};
      const areaByLod: Record<string, number> = {};
      const morphAccumulator: Record<string, { min: number; max: number; sum: number; count: number }> = {};
      const ringDefinitions = [
        { id: 'near_0_250m', minDistance: 0, maxDistance: 250 },
        { id: 'mid_250_500m', minDistance: 250, maxDistance: 500 },
        { id: 'far_500_1000m', minDistance: 500, maxDistance: 1000 },
        { id: 'horizon_1000m_plus', minDistance: 1000, maxDistance: null },
      ];
      const rings = ringDefinitions.map(ring => ({
        ...ring,
        tileCount: 0,
        countsByLod: {} as Record<string, number>,
        triangleEstimate: 0,
      }));
      const tileResolution = 33;
      const trianglesPerTile = Math.max(
        0,
        (tileResolution - 1) * (tileResolution - 1) * 2
          + (tileResolution - 1) * 4 * 4,
      );
      for (const tile of tiles) {
        const key = String(tile.lodLevel);
        countsByLod[key] = (countsByLod[key] ?? 0) + 1;
        areaByLod[key] = (areaByLod[key] ?? 0) + tile.size * tile.size;
        const morph = morphAccumulator[key] ?? {
          min: Number.POSITIVE_INFINITY,
          max: Number.NEGATIVE_INFINITY,
          sum: 0,
          count: 0,
        };
        morph.min = Math.min(morph.min, tile.morphFactor);
        morph.max = Math.max(morph.max, tile.morphFactor);
        morph.sum += tile.morphFactor;
        morph.count++;
        morphAccumulator[key] = morph;

        const ring = rings.find(candidate =>
          tile.distance >= candidate.minDistance
          && (candidate.maxDistance === null || tile.distance < candidate.maxDistance)
        );
        if (ring) {
          ring.tileCount++;
          ring.countsByLod[key] = (ring.countsByLod[key] ?? 0) + 1;
          ring.triangleEstimate += trianglesPerTile;
        }
      }
      const morphByLod = Object.fromEntries(
        Object.entries(morphAccumulator).map(([key, morph]) => [
          key,
          {
            min: morph.count > 0 ? morph.min : 0,
            max: morph.count > 0 ? morph.max : 0,
            avg: morph.count > 0 ? morph.sum / morph.count : 0,
            count: morph.count,
          },
        ]),
      );
      return {
        tileCount: tiles.length,
        countsByLod,
        areaByLod,
        morphByLod,
        rings,
        triangleEstimate: tiles.length * trianglesPerTile,
        nearestTiles: [...tiles].sort((a, b) => a.distance - b.distance).slice(0, 12),
        largestTiles: [...tiles].sort((a, b) => b.size - a.size).slice(0, 12),
      };
    };
    const afterPoint = toPoint(afterDome);
    const domeFollowsCamera = afterPoint
      ? Math.abs(afterPoint.x - cameraX) < 0.01
        && Math.abs(afterPoint.y - cameraY) < 0.01
        && Math.abs(afterPoint.z - cameraZ) < 0.01
      : null;
    return {
      pose: poseKind,
      camera: { x: cameraX, y: cameraY, z: cameraZ },
      target: { x: targetX, y: targetY, z: targetZ },
      world: {
        playableWorldSize: Number.isFinite(playableWorldSize) ? playableWorldSize : null,
        visualMargin: Number.isFinite(visualMargin) ? visualMargin : null,
        visualWorldSize: Number.isFinite(visualWorldSize) ? visualWorldSize : null,
        hasTerrainAtCamera: typeof terrain?.hasTerrainAt === 'function' ? Boolean(terrain.hasTerrainAt(cameraX, cameraZ)) : null,
        hasTerrainAtTarget: typeof terrain?.hasTerrainAt === 'function' ? Boolean(terrain.hasTerrainAt(targetX, targetZ)) : null,
        areaReadyAtCamera: typeof terrain?.isAreaReadyAt === 'function' ? Boolean(terrain.isAreaReadyAt(cameraX, cameraZ)) : null,
        activeTerrainTiles: typeof terrain?.getActiveTerrainTileCount === 'function' ? Number(terrain.getActiveTerrainTileCount()) : null,
        terrainLod: summarizeTerrainLod(),
        horizonRing: terrain?.getHorizonRingDebugInfo?.() ?? null,
        billboardDebug: billboards?.getDebugInfo?.() ?? terrain?.getBillboardDebugInfo?.() ?? null,
      },
      rendererInfo: {
        calls: Number(threeRenderer?.info?.render?.calls ?? null),
        triangles: Number(threeRenderer?.info?.render?.triangles ?? null),
        geometries: Number(threeRenderer?.info?.memory?.geometries ?? null),
        textures: Number(threeRenderer?.info?.memory?.textures ?? null),
        programs: Array.isArray(threeRenderer?.info?.programs) ? threeRenderer.info.programs.length : null,
      },
      dome: {
        before: toPoint(beforeDome),
        after: afterPoint,
        followsCamera: domeFollowsCamera,
      },
      cloudAnchor: atmosphere?.getCloudAnchorDebug?.() ?? null,
      renderText: typeof (window as any).render_game_to_text === 'function' ? (window as any).render_game_to_text() : null,
    };
  }, kind);
}

async function capturePose(page: Page, modeDir: string, kind: ProbePoseKind): Promise<PoseProbe> {
  const poseMetrics = await setReviewPose(page, kind);
  await page.waitForTimeout(120);
  await page.evaluate(PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_RESET_SOURCE);
  await page.waitForTimeout(kind === 'finite-edge' ? 900 : 650);
  const screenshotPath = join(modeDir, `${kind}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const [renderSubmissions, sceneAttribution, metrics] = await Promise.all([
    page.evaluate(() => (window as any).__projekt143RenderSubmissionAttribution?.drain?.() ?? null),
    page.evaluate(PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE),
    imageMetrics(screenshotPath),
  ]);
  return {
    kind,
    screenshot: relative(process.cwd(), screenshotPath),
    imageMetrics: metrics,
    poseMetrics,
    renderSubmissions,
    sceneAttribution,
  };
}

function modeStatus(checks: ModeProbe['checks']): CheckStatus {
  if (checks.some(check => check.status === 'fail')) return 'fail';
  if (checks.some(check => check.status === 'warn')) return 'warn';
  return 'pass';
}

function summarizeRenderSubmissions(renderSubmissions: Record<string, unknown> | null | undefined): {
  totals: Array<Record<string, unknown>>;
  peakFrame: Record<string, unknown> | null;
  lastFrame: Record<string, unknown> | null;
} {
  const frames = Array.isArray(renderSubmissions?.frames)
    ? renderSubmissions.frames as Array<Record<string, unknown>>
    : [];
  const peakFrame = frames.reduce<Record<string, unknown> | null>((best, frame) => {
    const triangles = Number(frame.triangles ?? 0);
    const bestTriangles = Number(best?.triangles ?? -1);
    return triangles > bestTriangles ? frame : best;
  }, null);
  const lastFrame = frames.length > 0 ? frames[frames.length - 1] : null;
  return {
    totals: Array.isArray(renderSubmissions?.totals)
      ? renderSubmissions.totals as Array<Record<string, unknown>>
      : [],
    peakFrame,
    lastFrame,
  };
}

function topCategoriesForFrame(frame: Record<string, unknown> | null | undefined): Array<Record<string, unknown>> {
  return Array.isArray(frame?.categories)
    ? (frame.categories as Array<Record<string, unknown>>).slice(0, 8)
    : [];
}

async function runModeProbe(page: Page, artifactDir: string, mode: string, renderer: string): Promise<ModeProbe> {
  const modeDir = join(artifactDir, mode);
  mkdirSync(modeDir, { recursive: true });
  const url = `http://${HOST}:${parseNumberFlag('port', DEFAULT_PORT)}/?perf=1&diag=1&renderer=${encodeURIComponent(renderer)}&logLevel=warn`;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', error => pageErrors.push(error.message.slice(0, 300)));
  await page.addInitScript({
    content: 'globalThis.__name = globalThis.__name || function(target) { return target; };',
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.evaluate('globalThis.__name = globalThis.__name || function(target) { return target; };');
  await startMode(page, runtimeModeForProbeMode(mode));
  await page.waitForTimeout(2500);
  await page.evaluate(PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_INSTALL_SOURCE);
  const capabilities = await page.evaluate(() => (window as any).__rendererBackendCapabilities?.() ?? null) as RendererCapabilities | null;
  const materialProbes = await collectMaterialProbes(page);
  const poses: PoseProbe[] = [];
  for (const kind of ['ground', 'elevated', 'skyward', 'finite-edge'] as const) {
    poses.push(await capturePose(page, modeDir, kind));
  }

  const vegetationProbeCount = materialProbes.filter(probe => probe.surface === 'vegetation').length;
  const npcProbeCount = materialProbes.filter(probe => probe.surface === 'npc').length;
  const cdlodPoseEvidence = (['ground', 'elevated', 'skyward'] as const).map(kind => {
    const pose = poses.find(candidate => candidate.kind === kind);
    const terrainLod = pose?.poseMetrics.world.terrainLod ?? null;
    return {
      pose: kind,
      tileCount: terrainLod?.tileCount ?? 0,
      countsByLod: terrainLod?.countsByLod ?? {},
      rings: terrainLod?.rings ?? [],
      triangleEstimate: terrainLod?.triangleEstimate ?? 0,
    };
  });
  const hasCdlodNodeRingEvidence = cdlodPoseEvidence.every(entry =>
    entry.tileCount > 0
    && entry.rings.some(ring => ring.tileCount > 0)
    && Object.keys(entry.countsByLod).length > 0
  );
  const skyward = poses.find(pose => pose.kind === 'skyward');
  const finite = poses.find(pose => pose.kind === 'finite-edge');
  const skywardRenderSummary = summarizeRenderSubmissions(skyward?.renderSubmissions);
  const topSkywardCategories = topCategoriesForFrame(skywardRenderSummary.peakFrame);
  const visualMargin = finite?.poseMetrics.world.visualMargin ?? 0;
  const playableWorldSize = finite?.poseMetrics.world.playableWorldSize ?? 0;
  const horizonRing = finite?.poseMetrics.world.horizonRing as { enabled?: unknown; width?: unknown; triangles?: unknown } | null | undefined;
  const checks: ModeProbe['checks'] = [
    ...capabilityCheck(capabilities, renderer),
    {
      id: 'vegetation-material-probes',
      status: vegetationProbeCount > 0 ? 'pass' : 'warn',
      message: vegetationProbeCount > 0
        ? `Captured ${vegetationProbeCount} vegetation material probe(s).`
        : 'No vegetation material probes were found in the live scene.',
    },
    {
      id: 'npc-material-probes',
      status: npcProbeCount > 0 ? 'pass' : 'warn',
      message: npcProbeCount > 0
        ? `Captured ${npcProbeCount} NPC material probe(s).`
        : 'No NPC material probes were found in the live scene.',
    },
    {
      id: 'cdlod-node-ring-evidence',
      status: hasCdlodNodeRingEvidence ? 'pass' : 'warn',
      message: hasCdlodNodeRingEvidence
        ? 'Captured active CDLOD node counts, LOD distribution, and distance-ring summaries for ground, elevated, and skyward cameras.'
        : 'Missing CDLOD node/ring evidence for one or more required terrain camera poses.',
      value: cdlodPoseEvidence,
    },
    {
      id: 'skyward-render-submissions',
      status: topSkywardCategories.length > 0 ? 'pass' : 'warn',
      message: topSkywardCategories.length > 0
        ? 'Captured skyward render-submission peak-frame categories by pass.'
        : 'Skyward render-submission tracker did not record category totals.',
      value: {
        peakFrame: skywardRenderSummary.peakFrame
          ? {
              frameCount: skywardRenderSummary.peakFrame.frameCount,
              triangles: skywardRenderSummary.peakFrame.triangles,
              drawSubmissions: skywardRenderSummary.peakFrame.drawSubmissions,
              passTypes: skywardRenderSummary.peakFrame.passTypes,
              categories: topSkywardCategories,
            }
          : null,
        lastFrame: skywardRenderSummary.lastFrame
          ? {
              frameCount: skywardRenderSummary.lastFrame.frameCount,
              triangles: skywardRenderSummary.lastFrame.triangles,
              drawSubmissions: skywardRenderSummary.lastFrame.drawSubmissions,
              passTypes: skywardRenderSummary.lastFrame.passTypes,
              categories: topCategoriesForFrame(skywardRenderSummary.lastFrame),
            }
          : null,
      },
    },
    {
      id: 'sky-dome-anchor-model',
      status: skyward?.poseMetrics.dome.followsCamera === true ? 'pass' : 'warn',
      message: skyward?.poseMetrics.dome.followsCamera === true
        ? 'Sky dome follows the active camera; cloud pattern is sampled from a world/altitude cloud deck.'
        : 'Could not prove sky dome follows the active camera.',
      value: {
        dome: skyward?.poseMetrics.dome ?? null,
        cloudAnchor: skyward?.poseMetrics.cloudAnchor ?? null,
      },
    },
    {
      id: 'finite-edge-evidence',
      status: visualMargin > 0 ? 'warn' : 'fail',
      message: visualMargin > 0
        ? `Captured finite-edge evidence with render apron ${visualMargin}m around playable world ${playableWorldSize}m; screenshot review still owns acceptance.`
        : 'Finite map has no measurable visual apron around the playable world.',
      value: {
        world: finite?.poseMetrics.world ?? null,
        horizonRing,
      },
    },
  ];

  return {
    mode,
    status: modeStatus(checks),
    url,
    capabilities,
    materialProbes,
    poses,
    checks,
    consoleErrors,
    pageErrors,
  };
}

function aggregateStatus(modes: ModeProbe[]): CheckStatus {
  if (modes.some(mode => mode.status === 'fail')) return 'fail';
  if (modes.some(mode => mode.status === 'warn')) return 'warn';
  return 'pass';
}

function terrainLodLine(pose: PoseProbe | undefined): string {
  const terrainLod = pose?.poseMetrics.world.terrainLod;
  if (!terrainLod) return 'missing';
  const lods = Object.entries(terrainLod.countsByLod)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([lod, count]) => `L${lod}:${count}`)
    .join('/');
  const rings = terrainLod.rings
    .map(ring => `${ring.id}:${ring.tileCount}`)
    .join('/');
  return `tiles=${terrainLod.tileCount} singleSubmitTri=${terrainLod.triangleEstimate} lods=${lods || 'none'} rings=${rings || 'none'}`;
}

function renderMarkdown(report: ProbeReport): string {
  const lines: string[] = [
    '# KONVEYER Scene Parity Probe',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status}`,
    `Renderer: ${report.options.renderer}`,
    `Git SHA: ${report.sourceGitSha}`,
    '',
    '## Decisions',
    ...report.decisions.map(item => `- ${item}`),
    '',
    '## Mode Results',
  ];
  for (const mode of report.modes) {
    const vegetationCount = mode.materialProbes.filter(probe => probe.surface === 'vegetation').length;
    const npcCount = mode.materialProbes.filter(probe => probe.surface === 'npc').length;
    const ground = mode.poses.find(pose => pose.kind === 'ground');
    const elevated = mode.poses.find(pose => pose.kind === 'elevated');
    const skyward = mode.poses.find(pose => pose.kind === 'skyward');
    const finite = mode.poses.find(pose => pose.kind === 'finite-edge');
    const skywardRenderSummary = summarizeRenderSubmissions(skyward?.renderSubmissions);
    const topSkyward = topCategoriesForFrame(skywardRenderSummary.peakFrame).slice(0, 5);
    lines.push(
      '',
      `### ${mode.mode} (${mode.status})`,
      `- Backend: requested=${mode.capabilities?.requestedMode ?? 'missing'} resolved=${mode.capabilities?.resolvedBackend ?? 'missing'} status=${mode.capabilities?.initStatus ?? 'missing'}`,
      `- Material probes: vegetation=${vegetationCount}, npc=${npcCount}`,
      `- CDLOD ground: ${terrainLodLine(ground)}`,
      `- CDLOD elevated: ${terrainLodLine(elevated)}`,
      `- CDLOD skyward: ${terrainLodLine(skyward)}`,
      `- Skyward screenshot: ${skyward?.screenshot ?? 'missing'}; luma=${skyward?.imageMetrics.lumaMean.toFixed(3) ?? 'n/a'} saturation=${skyward?.imageMetrics.saturationMean.toFixed(3) ?? 'n/a'} overexposed=${skyward?.imageMetrics.overexposedRatio.toFixed(3) ?? 'n/a'}`,
      `- Skyward peak frame: frame=${String(skywardRenderSummary.peakFrame?.frameCount ?? 'missing')} triangles=${String(skywardRenderSummary.peakFrame?.triangles ?? 'missing')} draws=${String(skywardRenderSummary.peakFrame?.drawSubmissions ?? 'missing')}`,
      `- Skyward peak categories: ${topSkyward.map(entry => `${entry.category}:${entry.triangles} (${JSON.stringify(entry.passTypes ?? {})})`).join(', ') || 'missing'}`,
      `- Sky/cloud anchor: domeFollowsCamera=${String(skyward?.poseMetrics.dome.followsCamera ?? null)}; cloud model=${String(skyward?.poseMetrics.cloudAnchor?.model ?? 'missing')}`,
      `- Finite edge screenshot: ${finite?.screenshot ?? 'missing'}; playable=${finite?.poseMetrics.world.playableWorldSize ?? 'n/a'} visualMargin=${finite?.poseMetrics.world.visualMargin ?? 'n/a'} horizonRing=${JSON.stringify(finite?.poseMetrics.world.horizonRing ?? null)} hasTerrainAtTarget=${String(finite?.poseMetrics.world.hasTerrainAtTarget ?? null)}`,
      `- Console errors: ${mode.consoleErrors.length}; page errors: ${mode.pageErrors.length}`,
      '',
      'Checks:',
      ...mode.checks.map(check => `- ${check.status}: ${check.id} - ${check.message}`),
    );
  }
  if (report.blockers.length > 0) {
    lines.push('', '## Blockers', ...report.blockers.map(item => `- ${item}`));
  }
  lines.push('', '## Non-Claims', ...report.nonClaims.map(item => `- ${item}`), '');
  return lines.join('\n');
}

async function main(): Promise<void> {
  if (hasFlag('help')) {
    console.log('Usage: npx tsx scripts/konveyer-scene-parity-probe.ts --modes open_frontier,zone_control --renderer webgpu-strict --headed');
    return;
  }
  const modes = normalizeModes(parseStringFlag('modes', 'open_frontier,zone_control'));
  if (modes.length === 0) throw new Error('No valid modes requested.');
  const renderer = parseStringFlag('renderer', 'webgpu-strict');
  const headed = hasFlag('headed');
  const port = parseNumberFlag('port', DEFAULT_PORT);
  const forceBuild = hasFlag('force-build');
  if (!forceBuild && !existsSync(join(process.cwd(), 'dist-perf', 'index.html'))) {
    throw new Error('dist-perf/index.html not found. Run `npm run build:perf` or pass --force-build.');
  }

  const artifactDir = join(ARTIFACT_ROOT, nowSlug(), 'konveyer-scene-parity');
  mkdirSync(artifactDir, { recursive: true });
  const summaryPath = join(artifactDir, 'scene-parity.json');
  const markdownPath = join(artifactDir, 'scene-parity.md');
  let server: ServerHandle | null = null;
  let browser: Browser | null = null;
  try {
    server = await startServer({
      mode: 'perf',
      port,
      host: HOST,
      buildIfMissing: false,
      forceBuild,
      stdio: 'pipe',
      log: message => console.log(`[scene-parity] ${message}`),
    });
    browser = await chromium.launch({
      headless: !headed,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-position=0,0',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--force-device-scale-factor=1',
        '--enable-unsafe-webgpu',
      ],
    });
    const modeReports: ModeProbe[] = [];
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        modeReports.push(await runModeProbe(page, artifactDir, mode, renderer));
      } catch (error) {
        modeReports.push({
          mode,
          status: 'fail',
          url: `http://${HOST}:${port}/`,
          capabilities: null,
          materialProbes: [],
          poses: [],
          checks: [{
            id: 'mode-probe',
            status: 'fail',
            message: error instanceof Error ? error.message : String(error),
          }],
          consoleErrors: [],
          pageErrors: [],
        });
      } finally {
        await page.close().catch(() => {});
      }
    }

    const blockers = modeReports
      .flatMap(mode => mode.checks
        .filter(check => check.status === 'fail')
        .map(check => `${mode.mode}: ${check.id} - ${check.message}`));
    const report: ProbeReport = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitText(['rev-parse', 'HEAD'], 'unknown'),
      sourceGitStatus: gitText(['status', '--short'], '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean),
      source: 'scripts/konveyer-scene-parity-probe.ts',
      status: aggregateStatus(modeReports),
      options: { modes, renderer, headed, port, forceBuild },
      files: {
        summary: relative(process.cwd(), summaryPath),
        markdown: relative(process.cwd(), markdownPath),
      },
      modes: modeReports,
      decisions: [
        'Sky dome remains camera-followed to avoid clipping in flight; cloud noise is projected through a world/altitude cloud-deck model so weather does not read as player-attached while avoiding the old finite flat-plane seam.',
        'Finite-map presentation strategy is source-backed visual terrain extent separated from playable/gameplay extent; edge screenshots prove whether each mode needs additional DEM collars, atmosphere work, or camera/flight boundaries.',
        'Terrain color is not a WebGL pixel-parity target; source assets that fight the Vietnam jungle palette, such as the former bright-lime tall-grass tile, may be corrected when screenshot review shows they harm the vision.',
      ],
      blockers,
      nonClaims: [
        'This probe does not update perf baselines.',
        'This probe does not accept WebGL fallback evidence.',
        'This probe is scene parity evidence; full gameplay feel still requires human playtest.',
      ],
    };
    writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    writeFileSync(markdownPath, renderMarkdown(report), 'utf8');
    console.log(`KONVEYER scene parity probe written to ${relative(process.cwd(), markdownPath)}`);
    if (report.status === 'fail') process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await stopServer(server).catch(() => {});
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
