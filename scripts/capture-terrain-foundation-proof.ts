#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Headed/browser proof for the terrain-vehicle-water-foundation-reset R0/R1
 * handoff. This is intentionally narrower than the perf harness: it verifies
 * the production placement defects directly, then writes screenshots for owner
 * review.
 *
 * Outputs:
 *   artifacts/playtests/terrain-vehicle-water-foundation-reset/
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { GameModeConfig, ZoneConfig } from '../src/config/gameModeTypes';
import { ZONE_CONTROL_CONFIG } from '../src/config/ZoneControlConfig';
import { startServer, stopServer } from './preview-server';

type ModeId = 'open_frontier' | 'a_shau_valley' | 'zone_control';
type CheckStatus = 'pass' | 'warn' | 'fail';

interface Options {
  headless: boolean;
  noBuild: boolean;
  port: number;
}

interface PlainPoint {
  x: number;
  y: number;
  z: number;
}

interface ExpectedZone {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  isHomeBase: boolean;
  validateTerrain: boolean | null;
}

interface HeightSampleSummary {
  sampleRadius: number;
  min: number | null;
  max: number | null;
  span: number | null;
  finite: boolean;
}

interface ZoneRuntimeRow {
  id: string;
  name: string;
  found: boolean;
  isHomeBase: boolean;
  validateTerrain: boolean | null;
  expected: { x: number; z: number };
  actual: PlainPoint | null;
  authoredDriftXZ: number | null;
  terrainY: number | null;
  heightSamples: HeightSampleSummary;
}

interface VehicleRuntimeRow {
  id: string;
  category: string;
  faction: string | null;
  healthPercent: number | null;
  position: PlainPoint;
  terrainY: number | null;
  heightDelta: number | null;
  destroyed: boolean;
}

interface VehicleDamageProbeRow {
  mode: ModeId;
  targetKind: string;
  targetId: string | null;
  beforeHealthPercent: number | null;
  afterHealthPercent: number | null;
  damaged: boolean;
}

interface WaterDebugSnapshot {
  hydrologyRiverVisible: boolean;
  hydrologyChannelCount: number;
  hydrologySegmentCount: number;
  hydrologyTotalLengthMeters: number;
  waterBodyVisible: boolean;
  waterBodyCount: number;
  waterBodySegmentCount: number;
  waterBodyTotalLengthMeters: number;
  waterBodyMinSurfaceY: number | null;
  waterBodyMaxSurfaceY: number | null;
  waterBodyMinDepthMeters: number | null;
  waterBodyMaxDepthMeters: number | null;
}

interface WaterRuntimeSample {
  vehicleId: string;
  terrainY: number | null;
  waterY: number | null;
  depthOverTerrain: number | null;
  source: string | null;
}

interface WaterGroundSectionSample {
  segmentIndex: number;
  x: number;
  z: number;
  halfWidth: number;
  surfaceY: number | null;
  centerTerrainY: number | null;
  centerDepthOverTerrain: number | null;
  innerTerrainAboveWaterMax: number | null;
  innerDepthOverTerrainMax: number | null;
  localTerrainSpan: number | null;
  finite: boolean;
}

interface WaterGroundSectionSummary {
  sampleCount: number;
  finiteCount: number;
  centerDepthMin: number | null;
  centerDepthMax: number | null;
  innerTerrainAboveWaterMax: number | null;
  innerDepthOverTerrainMax: number | null;
  localTerrainSpanMax: number | null;
  worstSamples: WaterGroundSectionSample[];
}

interface WaterRuntimeSummary {
  debug: WaterDebugSnapshot | null;
  samples: WaterRuntimeSample[];
  groundSections: WaterGroundSectionSummary | null;
}

interface ScenarioProof {
  mode: ModeId;
  browserErrors: string[];
  pageErrors: string[];
  vehicles: VehicleRuntimeRow[];
  vehicleDamageProbes: VehicleDamageProbeRow[];
  water: WaterRuntimeSummary | null;
  zones: ZoneRuntimeRow[];
  screenshots: string[];
}

interface CheckRow {
  id: string;
  status: CheckStatus;
  value: unknown;
  message: string;
}

interface ProofReport {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  status: CheckStatus;
  options: Options;
  files: {
    summary: string;
    markdown: string;
  };
  scenarios: ScenarioProof[];
  checks: CheckRow[];
  nonClaims: string[];
}

interface HarnessWindow extends Window {
  __engine?: {
    gameStarted?: boolean;
    startGameWithMode?: (mode: string) => Promise<unknown>;
    startupFlow?: { getState?: () => { phase?: string } };
    renderer?: {
      camera?: HarnessCamera;
      scene?: unknown;
      renderer?: HarnessRenderer;
      threeRenderer?: HarnessRenderer;
      setOverrideCamera?: (camera: HarnessCamera | null) => void;
    };
    systemManager?: {
      atmosphereSystem?: {
        syncDomePosition?: (position: unknown) => void;
        setTerrainYAtCamera?: (height: number) => void;
        update?: (dt: number) => void;
      };
      terrainSystem?: {
        getHeightAt?: (x: number, z: number) => number;
        updatePlayerPosition?: (position: PlainPoint) => void;
        update?: (dt: number) => void;
        setRenderCameraOverride?: (camera: HarnessCamera | null) => void;
      };
      vehicleManager?: {
        getAllVehicles?: () => HarnessVehicle[];
        update?: (dt: number) => void;
      };
      combatantSystem?: {
        applyExplosionDamage?: (
          center: PlainPoint,
          radius: number,
          maxDamage: number,
          attackerId?: string,
          weaponType?: string,
          shooterFaction?: string,
        ) => void;
      };
      waterSystem?: {
        getDebugInfo?: () => {
          hydrologyRiverVisible?: boolean;
          hydrologyChannelCount?: number;
          hydrologySegmentCount?: number;
          hydrologyTotalLengthMeters?: number;
          waterBodyVisible?: boolean;
          waterBodyCount?: number;
          waterBodySegmentCount?: number;
          waterBodyTotalLengthMeters?: number;
          waterBodyMinSurfaceY?: number | null;
          waterBodyMaxSurfaceY?: number | null;
          waterBodyMinDepthMeters?: number | null;
          waterBodyMaxDepthMeters?: number | null;
        };
        getHydrologyQuerySegmentsForDebug?: () => HydrologyQuerySegment[];
        getWaterBodyQuerySegmentsForDebug?: () => HydrologyQuerySegment[];
        getWaterSurfaceY?: (position: PlainPoint) => number | null;
        sampleWaterInteraction?: (position: PlainPoint) => { source?: string; surfaceY?: number | null };
      };
      zoneManager?: {
        getAllZones?: () => HarnessZone[];
        update?: (dt: number) => void;
      };
    };
  };
}

interface HarnessRenderer {
  render?: (scene: unknown, camera: unknown) => void;
}

interface HarnessCamera {
  near: number;
  far: number;
  aspect?: number;
  clone?: () => HarnessCamera;
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  lookAt?: (x: number, y: number, z: number) => void;
  updateProjectionMatrix?: () => void;
  updateMatrixWorld?: (force?: boolean) => void;
}

interface HarnessVehicle {
  vehicleId?: string;
  category?: string;
  faction?: string;
  getPosition?: () => { x: number; y: number; z: number };
  getHealthPercent?: () => number;
  isDestroyed?: () => boolean;
}

interface HydrologyQuerySegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  startSurfaceY: number;
  endSurfaceY: number;
  halfWidth: number;
}

interface HarnessZone {
  id?: string;
  name?: string;
  position?: { x: number; y: number; z: number };
  radius?: number;
  isHomeBase?: boolean;
  validateTerrain?: boolean;
}

const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 120_000;
const DEFAULT_PORT = 9136;
const OUT_DIR = join(
  process.cwd(),
  'artifacts',
  'playtests',
  'terrain-vehicle-water-foundation-reset',
);

function parseOptions(): Options {
  const portFlagIndex = process.argv.findIndex((arg) => arg === '--port');
  const portEquals = process.argv.find((arg) => arg.startsWith('--port='));
  const portRaw = portEquals
    ? portEquals.split('=')[1]
    : portFlagIndex >= 0
      ? process.argv[portFlagIndex + 1]
      : undefined;
  const port = portRaw ? Number(portRaw) : DEFAULT_PORT;
  return {
    headless: !process.argv.includes('--headed'),
    noBuild: process.argv.includes('--no-build'),
    port: Number.isFinite(port) ? port : DEFAULT_PORT,
  };
}

function rel(path: string): string {
  return relative(process.cwd(), path).replace(/\\/g, '/');
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function gitStatusShort(): string[] {
  try {
    return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' })
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function logStep(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function expectedZones(config: GameModeConfig): ExpectedZone[] {
  return config.zones.map((zone: ZoneConfig) => ({
    id: zone.id,
    name: zone.name,
    x: zone.position.x,
    z: zone.position.z,
    radius: zone.radius,
    isHomeBase: zone.isHomeBase,
    validateTerrain: zone.validateTerrain ?? null,
  }));
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as HarnessWindow).__engine?.startGameWithMode),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS },
  );
}

async function startMode(page: Page, mode: ModeId): Promise<void> {
  await page.evaluate(async (requestedMode) => {
    const engine = (window as HarnessWindow).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(requestedMode);
  }, mode);

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const engine = (window as HarnessWindow).__engine;
      return {
        gameStarted: Boolean(engine?.gameStarted),
        phase: String(engine?.startupFlow?.getState?.()?.phase ?? ''),
      };
    });
    if (state.gameStarted || state.phase === 'live') return;
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
    // Briefing is not present on every mode/build.
  }
}

async function hideUiChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `body > *:not(canvas) { display: none !important; }
              canvas { position: fixed !important; inset: 0 !important; }`,
  });
}

async function collectVehicles(page: Page): Promise<VehicleRuntimeRow[]> {
  return page.evaluate(() => {
    const systems = (window as HarnessWindow).__engine?.systemManager;
    const terrain = systems?.terrainSystem;
    const vehicles = systems?.vehicleManager?.getAllVehicles?.() ?? [];
    return vehicles.map((vehicle) => {
      const position = vehicle.getPosition?.() ?? { x: 0, y: 0, z: 0 };
      const terrainY = terrain?.getHeightAt?.(position.x, position.z);
      return {
        id: String(vehicle.vehicleId ?? ''),
        category: String(vehicle.category ?? ''),
        faction: typeof vehicle.faction === 'string' ? vehicle.faction : null,
        healthPercent: typeof vehicle.getHealthPercent === 'function' ? vehicle.getHealthPercent() : null,
        position: { x: position.x, y: position.y, z: position.z },
        terrainY: Number.isFinite(terrainY) ? Number(terrainY) : null,
        heightDelta: Number.isFinite(terrainY) ? position.y - Number(terrainY) : null,
        destroyed: Boolean(vehicle.isDestroyed?.()),
      };
    });
  });
}

async function collectWaterRuntime(page: Page): Promise<WaterRuntimeSummary> {
  return page.evaluate(() => {
    const systems = (window as HarnessWindow).__engine?.systemManager;
    const terrain = systems?.terrainSystem;
    const water = systems?.waterSystem;
    const vehicles = systems?.vehicleManager?.getAllVehicles?.() ?? [];
    const debugInfo = water?.getDebugInfo?.();
    const debug = debugInfo
      ? {
        hydrologyRiverVisible: Boolean(debugInfo.hydrologyRiverVisible),
        hydrologyChannelCount: Number(debugInfo.hydrologyChannelCount ?? 0),
        hydrologySegmentCount: Number(debugInfo.hydrologySegmentCount ?? 0),
        hydrologyTotalLengthMeters: Number(debugInfo.hydrologyTotalLengthMeters ?? 0),
        waterBodyVisible: Boolean(debugInfo.waterBodyVisible),
        waterBodyCount: Number(debugInfo.waterBodyCount ?? 0),
        waterBodySegmentCount: Number(debugInfo.waterBodySegmentCount ?? 0),
        waterBodyTotalLengthMeters: Number(debugInfo.waterBodyTotalLengthMeters ?? 0),
        waterBodyMinSurfaceY: Number.isFinite(debugInfo.waterBodyMinSurfaceY)
          ? Number(debugInfo.waterBodyMinSurfaceY)
          : null,
        waterBodyMaxSurfaceY: Number.isFinite(debugInfo.waterBodyMaxSurfaceY)
          ? Number(debugInfo.waterBodyMaxSurfaceY)
          : null,
        waterBodyMinDepthMeters: Number.isFinite(debugInfo.waterBodyMinDepthMeters)
          ? Number(debugInfo.waterBodyMinDepthMeters)
          : null,
        waterBodyMaxDepthMeters: Number.isFinite(debugInfo.waterBodyMaxDepthMeters)
          ? Number(debugInfo.waterBodyMaxDepthMeters)
          : null,
      }
      : null;

    const samples = vehicles
      .filter((vehicle) => String(vehicle.category ?? '') === 'watercraft')
      .map((vehicle) => {
        const position = vehicle.getPosition?.() ?? { x: 0, y: 0, z: 0 };
        const terrainY = terrain?.getHeightAt?.(position.x, position.z);
        const waterY = water?.getWaterSurfaceY?.(position);
        const interaction = water?.sampleWaterInteraction?.(position);
        const finiteTerrain = Number.isFinite(terrainY) ? Number(terrainY) : null;
        const finiteWater = Number.isFinite(waterY) ? Number(waterY) : null;
        return {
          vehicleId: String(vehicle.vehicleId ?? ''),
          terrainY: finiteTerrain,
          waterY: finiteWater,
          depthOverTerrain: finiteTerrain !== null && finiteWater !== null ? finiteWater - finiteTerrain : null,
          source: typeof interaction?.source === 'string' ? interaction.source : null,
        };
      });

    const groundSections = summarizeWaterBodyGroundSections(
      terrain,
      water?.getWaterBodyQuerySegmentsForDebug?.() ?? [],
    );

    return { debug, samples, groundSections };

    function summarizeWaterBodyGroundSections(
      terrainSystem: typeof terrain,
      segments: HydrologyQuerySegment[],
    ): WaterGroundSectionSummary | null {
      if (!terrainSystem?.getHeightAt || segments.length === 0) return null;
      const rows = segments.map((segment, segmentIndex) => {
        const dx = segment.endX - segment.startX;
        const dz = segment.endZ - segment.startZ;
        const length = Math.hypot(dx, dz);
        const midX = (segment.startX + segment.endX) * 0.5;
        const midZ = (segment.startZ + segment.endZ) * 0.5;
        const normalX = length > 0 ? -dz / length : 0;
        const normalZ = length > 0 ? dx / length : 1;
        const innerOffset = Math.max(1, segment.halfWidth * 0.35);
        const surfaceY = (segment.startSurfaceY + segment.endSurfaceY) * 0.5;
        const centerTerrainY = terrainSystem.getHeightAt(midX, midZ);
        const leftInnerTerrainY = terrainSystem.getHeightAt(midX + normalX * innerOffset, midZ + normalZ * innerOffset);
        const rightInnerTerrainY = terrainSystem.getHeightAt(midX - normalX * innerOffset, midZ - normalZ * innerOffset);
        const terrainValues = [centerTerrainY, leftInnerTerrainY, rightInnerTerrainY]
          .filter((value): value is number => Number.isFinite(value));
        const finite = Number.isFinite(surfaceY) && terrainValues.length === 3;
        const innerTerrainAboveWaterMax = finite
          ? Math.max(leftInnerTerrainY - surfaceY, rightInnerTerrainY - surfaceY)
          : null;
        const innerDepthOverTerrainMax = finite
          ? Math.max(surfaceY - leftInnerTerrainY, surfaceY - rightInnerTerrainY)
          : null;
        const localTerrainSpan = finite ? Math.max(...terrainValues) - Math.min(...terrainValues) : null;
        return {
          segmentIndex,
          x: midX,
          z: midZ,
          halfWidth: segment.halfWidth,
          surfaceY: Number.isFinite(surfaceY) ? surfaceY : null,
          centerTerrainY: Number.isFinite(centerTerrainY) ? centerTerrainY : null,
          centerDepthOverTerrain: Number.isFinite(surfaceY) && Number.isFinite(centerTerrainY)
            ? surfaceY - centerTerrainY
            : null,
          innerTerrainAboveWaterMax,
          innerDepthOverTerrainMax,
          localTerrainSpan,
          finite,
        };
      });
      const finiteRows = rows.filter((row) => row.finite);
      const centerDepths = finiteRows
        .map((row) => row.centerDepthOverTerrain)
        .filter((value): value is number => Number.isFinite(value));
      const innerAbove = finiteRows
        .map((row) => row.innerTerrainAboveWaterMax)
        .filter((value): value is number => Number.isFinite(value));
      const innerDepths = finiteRows
        .map((row) => row.innerDepthOverTerrainMax)
        .filter((value): value is number => Number.isFinite(value));
      const localSpans = finiteRows
        .map((row) => row.localTerrainSpan)
        .filter((value): value is number => Number.isFinite(value));
      const worstSamples = [...rows]
        .sort((a, b) => riverSectionScore(b) - riverSectionScore(a))
        .slice(0, 8);
      return {
        sampleCount: rows.length,
        finiteCount: finiteRows.length,
        centerDepthMin: centerDepths.length ? Math.min(...centerDepths) : null,
        centerDepthMax: centerDepths.length ? Math.max(...centerDepths) : null,
        innerTerrainAboveWaterMax: innerAbove.length ? Math.max(...innerAbove) : null,
        innerDepthOverTerrainMax: innerDepths.length ? Math.max(...innerDepths) : null,
        localTerrainSpanMax: localSpans.length ? Math.max(...localSpans) : null,
        worstSamples,
      };
    }

    function riverSectionScore(row: WaterGroundSectionSample): number {
      if (!row.finite) return Number.POSITIVE_INFINITY;
      return Math.max(
        Math.abs((row.centerDepthOverTerrain ?? 0) - 0.85),
        Math.max(0, row.innerTerrainAboveWaterMax ?? 0),
        Math.max(0, (row.innerDepthOverTerrainMax ?? 0) - 0.85),
      );
    }
  });
}

async function probeVehicleExplosionDamage(
  page: Page,
  mode: ModeId,
  targetKind: 'opfor_m48' | 'ground_non_tank',
): Promise<VehicleDamageProbeRow> {
  return page.evaluate(({ modeId, kind }) => {
    const systems = (window as HarnessWindow).__engine?.systemManager;
    const vehicles = systems?.vehicleManager?.getAllVehicles?.() ?? [];
    const target = vehicles.find((vehicle) => {
      const id = String(vehicle.vehicleId ?? '').toLowerCase();
      if (vehicle.isDestroyed?.()) return false;
      if (kind === 'opfor_m48') {
        return id.includes('m48') && vehicle.faction === 'NVA';
      }
      return String(vehicle.category ?? '') === 'ground' && !id.includes('m48');
    });
    if (!target?.getPosition || typeof target.getHealthPercent !== 'function') {
      return {
        mode: modeId,
        targetKind: kind,
        targetId: null,
        beforeHealthPercent: null,
        afterHealthPercent: null,
        damaged: false,
      };
    }

    const position = target.getPosition();
    const before = target.getHealthPercent();
    const shooterFaction = target.faction === 'US' ? 'NVA' : 'US';
    systems?.combatantSystem?.applyExplosionDamage?.(
      { x: position.x, y: position.y, z: position.z },
      9,
      kind === 'opfor_m48' ? 200 : 125,
      `terrain-foundation-proof-${kind}`,
      'tank_cannon',
      shooterFaction,
    );
    const after = target.getHealthPercent();
    return {
      mode: modeId,
      targetKind: kind,
      targetId: String(target.vehicleId ?? ''),
      beforeHealthPercent: Number.isFinite(before) ? Number(before) : null,
      afterHealthPercent: Number.isFinite(after) ? Number(after) : null,
      damaged: Number.isFinite(before) && Number.isFinite(after) && after < before,
    };
  }, { modeId: mode, kind: targetKind });
}

async function collectZones(page: Page, expected: ExpectedZone[]): Promise<ZoneRuntimeRow[]> {
  return page.evaluate((expectedRows) => {
    const systems = (window as HarnessWindow).__engine?.systemManager;
    const terrain = systems?.terrainSystem;
    const zones = systems?.zoneManager?.getAllZones?.() ?? [];

    return expectedRows.map((expectedZone) => {
      const zone = zones.find((candidate) => candidate.id === expectedZone.id);
      if (!zone?.position) {
        return {
          id: expectedZone.id,
          name: expectedZone.name,
          found: false,
          isHomeBase: expectedZone.isHomeBase,
          validateTerrain: expectedZone.validateTerrain,
          expected: { x: expectedZone.x, z: expectedZone.z },
          actual: null,
          authoredDriftXZ: null,
          terrainY: null,
          heightSamples: { sampleRadius: 0, min: null, max: null, span: null, finite: false },
        };
      }
      const pos = zone.position;
      const sampleRadius = expectedZone.isHomeBase
        ? Math.min(expectedZone.radius * 0.45, 16)
        : Math.min(expectedZone.radius * 0.5, 10);
      const terrainY = terrain?.getHeightAt?.(pos.x, pos.z);
      const samplePoints: Array<{ x: number; z: number }> = [{ x: pos.x, z: pos.z }];
      for (const ringRadius of [sampleRadius * 0.5, sampleRadius]) {
        for (let index = 0; index < 8; index++) {
          const angle = (index / 8) * Math.PI * 2;
          samplePoints.push({
            x: pos.x + Math.cos(angle) * ringRadius,
            z: pos.z + Math.sin(angle) * ringRadius,
          });
        }
      }
      const heights = samplePoints
        .map((point) => terrain?.getHeightAt?.(point.x, point.z))
        .filter((value): value is number => Number.isFinite(value));
      const heightSamples: HeightSampleSummary = heights.length === samplePoints.length && heights.length > 0
        ? {
          sampleRadius,
          min: Math.min(...heights),
          max: Math.max(...heights),
          span: Math.max(...heights) - Math.min(...heights),
          finite: true,
        }
        : { sampleRadius, min: null, max: null, span: null, finite: false };
      return {
        id: expectedZone.id,
        name: String(zone.name ?? expectedZone.name),
        found: true,
        isHomeBase: Boolean(zone.isHomeBase),
        validateTerrain: typeof zone.validateTerrain === 'boolean' ? zone.validateTerrain : expectedZone.validateTerrain,
        expected: { x: expectedZone.x, z: expectedZone.z },
        actual: { x: pos.x, y: pos.y, z: pos.z },
        authoredDriftXZ: Math.hypot(pos.x - expectedZone.x, pos.z - expectedZone.z),
        terrainY: Number.isFinite(terrainY) ? Number(terrainY) : null,
        heightSamples,
      };
    });
  }, expected);
}

async function frameCamera(
  page: Page,
  target: PlainPoint,
  args: { heightAGL: number; distance: number; bearingDeg: number },
): Promise<void> {
  await page.evaluate(({ targetPoint, frameArgs, viewport }) => {
    const engine = (window as HarnessWindow).__engine;
    const renderer = engine?.renderer;
    const systems = engine?.systemManager;
    const terrain = systems?.terrainSystem;
    const sourceCamera = renderer?.camera;
    const scene = renderer?.scene;
    const threeRenderer = renderer?.threeRenderer ?? renderer?.renderer;
    if (!sourceCamera || !scene || !threeRenderer?.render) {
      throw new Error('renderer camera/scene unavailable');
    }

    const terrainY = terrain?.getHeightAt?.(targetPoint.x, targetPoint.z);
    const targetY = Number.isFinite(terrainY) ? Number(terrainY) : targetPoint.y;
    const bearing = (frameArgs.bearingDeg * Math.PI) / 180;
    const cameraX = targetPoint.x + Math.cos(bearing) * frameArgs.distance;
    const cameraZ = targetPoint.z + Math.sin(bearing) * frameArgs.distance;
    const cameraTerrainY = terrain?.getHeightAt?.(cameraX, cameraZ);
    const cameraY = (Number.isFinite(cameraTerrainY) ? Number(cameraTerrainY) : targetY) + frameArgs.heightAGL;
    const activeCamera = renderer?.setOverrideCamera && typeof sourceCamera.clone === 'function'
      ? sourceCamera.clone()
      : sourceCamera;

    terrain?.updatePlayerPosition?.({ x: targetPoint.x, y: targetY, z: targetPoint.z });
    for (let i = 0; i < 12; i++) {
      terrain?.update?.(1 / 30);
    }

    activeCamera.near = 0.1;
    activeCamera.far = Math.max(activeCamera.far ?? 0, 5000);
    if (typeof activeCamera.aspect === 'number') {
      activeCamera.aspect = viewport.width / viewport.height;
      activeCamera.updateProjectionMatrix?.();
    }
    activeCamera.position.set(cameraX, cameraY, cameraZ);
    activeCamera.lookAt?.(targetPoint.x, targetY + 2.2, targetPoint.z);
    activeCamera.updateMatrixWorld?.(true);
    renderer?.setOverrideCamera?.(activeCamera);
    terrain?.setRenderCameraOverride?.(activeCamera);
    systems?.atmosphereSystem?.syncDomePosition?.(activeCamera.position);
    systems?.atmosphereSystem?.setTerrainYAtCamera?.(cameraY - frameArgs.heightAGL);
    systems?.atmosphereSystem?.update?.(1 / 60);
    systems?.vehicleManager?.update?.(1 / 60);
    systems?.zoneManager?.update?.(1 / 60);
    threeRenderer.render(scene, activeCamera);
  }, { targetPoint: target, frameArgs: args, viewport: VIEWPORT });
  await page.waitForTimeout(350);
}

async function screenshot(page: Page, path: string): Promise<string> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(path, buffer);
  logStep(`Wrote ${rel(path)} (${buffer.byteLength} bytes)`);
  return rel(path);
}

function selectWaterVisualTarget(water: WaterRuntimeSummary | null, vehicles: VehicleRuntimeRow[]): PlainPoint | null {
  const watercraft = vehicles.find((vehicle) =>
    vehicle.category === 'watercraft' && vehicle.id.toLowerCase().includes('pbr')
  ) ?? vehicles.find((vehicle) => vehicle.category === 'watercraft');
  if (watercraft) return watercraft.position;

  const section = water?.groundSections?.worstSamples.find((sample) => sample.finite);
  if (section) {
    return {
      x: section.x,
      y: section.surfaceY ?? section.centerTerrainY ?? 0,
      z: section.z,
    };
  }
  return null;
}

async function openModePage(
  port: number,
  mode: ModeId,
  browserErrors: string[],
  pageErrors: string[],
): Promise<Page> {
  const page = await chromiumPage(port, browserErrors, pageErrors);
  await startMode(page, mode);
  await dismissBriefingIfPresent(page);
  await hideUiChrome(page);
  await page.waitForTimeout(mode === 'a_shau_valley' ? 7_000 : 5_000);
  return page;
}

async function chromiumPage(port: number, browserErrors: string[], pageErrors: string[]): Promise<Page> {
  if (!globalBrowser) throw new Error('browser not initialized');
  const page = await globalBrowser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    if (msg.type() === 'error') browserErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/?perf=1&capture=1&uiTransitions=0&logLevel=error`, {
    waitUntil: 'domcontentloaded',
    timeout: STARTUP_TIMEOUT_MS,
  });
  await waitForEngine(page);
  return page;
}

let globalBrowser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

async function captureVehicleScenario(port: number, mode: ModeId): Promise<ScenarioProof> {
  const browserErrors: string[] = [];
  const pageErrors: string[] = [];
  const page = await openModePage(port, mode, browserErrors, pageErrors);
  const screenshots: string[] = [];
  try {
    const vehicles = await collectVehicles(page);
    const water = await collectWaterRuntime(page);
    const m48 = vehicles.find((vehicle) => vehicle.id.toLowerCase().includes('m48'));
    if (m48) {
      await frameCamera(page, m48.position, {
        heightAGL: mode === 'a_shau_valley' ? 16 : 12,
        distance: mode === 'a_shau_valley' ? 42 : 32,
        bearingDeg: mode === 'a_shau_valley' ? 45 : 130,
      });
      screenshots.push(await screenshot(page, join(OUT_DIR, `${mode}-m48-terrain-bind.png`)));
    }
    const waterTarget = selectWaterVisualTarget(water, vehicles);
    if (waterTarget) {
      await frameCamera(page, waterTarget, {
        heightAGL: mode === 'a_shau_valley' ? 90 : 34,
        distance: mode === 'a_shau_valley' ? 210 : 82,
        bearingDeg: mode === 'a_shau_valley' ? -38 : 118,
      });
      screenshots.push(await screenshot(page, join(OUT_DIR, `${mode}-water-body-basin.png`)));
    }
    const vehicleDamageProbes = [
      await probeVehicleExplosionDamage(page, mode, 'opfor_m48'),
      await probeVehicleExplosionDamage(page, mode, 'ground_non_tank'),
    ];
    return {
      mode,
      browserErrors,
      pageErrors,
      vehicles,
      vehicleDamageProbes,
      water,
      zones: [],
      screenshots,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureZoneControlScenario(port: number): Promise<ScenarioProof> {
  const browserErrors: string[] = [];
  const pageErrors: string[] = [];
  const page = await openModePage(port, 'zone_control', browserErrors, pageErrors);
  const screenshots: string[] = [];
  try {
    const zones = await collectZones(page, expectedZones(ZONE_CONTROL_CONFIG));
    for (const id of ['us_base', 'opfor_base']) {
      const row = zones.find((zone) => zone.id === id);
      if (!row?.actual) continue;
      await frameCamera(page, row.actual, { heightAGL: 46, distance: 92, bearingDeg: id === 'us_base' ? -35 : 145 });
      screenshots.push(await screenshot(page, join(OUT_DIR, `zone_control-${id}-pad.png`)));
    }

    await frameCamera(page, { x: -30, y: 0, z: 70 }, { heightAGL: 260, distance: 360, bearingDeg: -62 });
    screenshots.push(await screenshot(page, join(OUT_DIR, 'zone_control-objective-overview.png')));

    return { mode: 'zone_control', browserErrors, pageErrors, vehicles: [], vehicleDamageProbes: [], water: null, zones, screenshots };
  } finally {
    await page.close().catch(() => {});
  }
}

function check(id: string, passed: boolean, value: unknown, message: string): CheckRow {
  return { id, status: passed ? 'pass' : 'fail', value, message };
}

function warn(id: string, warned: boolean, value: unknown, message: string): CheckRow {
  return { id, status: warned ? 'warn' : 'pass', value, message };
}

function buildChecks(scenarios: ScenarioProof[]): CheckRow[] {
  const of = scenarios.find((scenario) => scenario.mode === 'open_frontier');
  const ashau = scenarios.find((scenario) => scenario.mode === 'a_shau_valley');
  const zc = scenarios.find((scenario) => scenario.mode === 'zone_control');
  const vehicleScenarios = [of, ashau].filter((scenario): scenario is ScenarioProof => Boolean(scenario));
  const m48Rows = vehicleScenarios.flatMap((scenario) =>
    scenario.vehicles.filter((vehicle) => vehicle.id.toLowerCase().includes('m48')),
  );
  const zcHomeBases = (zc?.zones ?? []).filter((zone) => zone.isHomeBase);
  const zcCaptureZones = (zc?.zones ?? []).filter((zone) => !zone.isHomeBase);
  const allErrors = scenarios.flatMap((scenario) => [...scenario.browserErrors, ...scenario.pageErrors]);
  const screenshots = scenarios.flatMap((scenario) => scenario.screenshots);
  const waterBodyScreenshots = vehicleScenarios.map((scenario) => `${scenario.mode}-water-body-basin.png`);
  const m48HeightDeltas = m48Rows.map((vehicle) => vehicle.heightDelta);
  const m48FactionCoverage = vehicleScenarios.map((scenario) => {
    const factions = scenario.vehicles
      .filter((vehicle) => vehicle.id.toLowerCase().includes('m48'))
      .map((vehicle) => vehicle.faction)
      .filter((faction): faction is string => typeof faction === 'string');
    return { mode: scenario.mode, factions: Array.from(new Set(factions)).sort() };
  });
  const vehicleDamageProbes = vehicleScenarios.flatMap((scenario) => scenario.vehicleDamageProbes);
  const m48DamageProbes = vehicleDamageProbes.filter((probe) => probe.targetKind === 'opfor_m48');
  const groundDamageProbes = vehicleDamageProbes.filter((probe) => probe.targetKind === 'ground_non_tank');
  const waterSummaries = vehicleScenarios.map((scenario) => ({
    mode: scenario.mode,
    debug: scenario.water?.debug ?? null,
    samples: scenario.water?.samples ?? [],
    groundSections: scenario.water?.groundSections ?? null,
  }));
  const waterSamples = waterSummaries.flatMap((summary) =>
    summary.samples.map((sample) => ({ mode: summary.mode, ...sample })),
  );
  const waterGroundSections = waterSummaries.map((summary) => ({
    mode: summary.mode,
    groundSections: summary.groundSections,
  }));
  const homeDrifts = zcHomeBases.map((zone) => zone.authoredDriftXZ);
  const homeSpans = zcHomeBases.map((zone) => zone.heightSamples.span);
  const captureSpans = zcCaptureZones.map((zone) => ({ id: zone.id, span: zone.heightSamples.span }));

  return [
    check('browser_errors_clear', allErrors.length === 0, allErrors, 'No browser console errors or page errors during proof capture.'),
    check('screenshots_written', screenshots.length >= 7 && screenshots.every((shot) => existsSync(join(process.cwd(), shot))), screenshots, 'Expected M48, water-body basin, ZC base-pad, and ZC overview screenshots were written.'),
    check('water_body_basin_screenshots_written', waterBodyScreenshots.every((filename) =>
      screenshots.some((shot) => shot.endsWith(filename) && existsSync(join(process.cwd(), shot))),
    ), screenshots.filter((shot) => shot.includes('water-body-basin')), 'Open Frontier and A Shau include dedicated level/depth basin water-body screenshots for visual review.'),
    check('m48_registered_in_large_modes', vehicleScenarios.every((scenario) =>
      scenario.vehicles.some((vehicle) => vehicle.id.toLowerCase().includes('m48')),
    ), m48Rows.map((vehicle) => vehicle.id), 'Open Frontier and A Shau each registered a live M48 IVehicle.'),
    check('m48_both_factions_in_large_modes', m48FactionCoverage.every((row) =>
      row.factions.includes('US') && row.factions.includes('NVA'),
    ), m48FactionCoverage, 'Open Frontier and A Shau each field US and NVA M48 tanks.'),
    check('m48_resting_on_terrain', m48Rows.length >= 4 && m48HeightDeltas.every((delta) =>
      delta !== null && delta >= 0.35 && delta <= 1.25,
    ), m48Rows.map((vehicle) => ({ id: vehicle.id, delta: vehicle.heightDelta })), 'M48 world Y is within the expected chassis rest offset above runtime terrain.'),
    check('m48_explosion_damage_routes_to_opfor_tanks', m48DamageProbes.length === 2
      && m48DamageProbes.every((probe) => probe.targetId !== null && probe.damaged),
    m48DamageProbes,
    'Open Frontier and A Shau OPFOR M48s lose health through CombatantSystem.applyExplosionDamage.'),
    check('ground_vehicle_explosion_damage_routes_to_m151_class', groundDamageProbes.length === 2
      && groundDamageProbes.every((probe) => probe.targetId !== null && probe.damaged),
    groundDamageProbes,
    'Open Frontier and A Shau non-tank ground vehicles lose health through the shared explosion route.'),
    check('water_body_runtime_active_in_large_modes', waterSummaries.every((summary) =>
      summary.debug?.waterBodyVisible === true
      && (summary.debug?.waterBodyCount ?? 0) > 0
      && (summary.debug?.waterBodySegmentCount ?? 0) > 0
    ), waterSummaries.map((summary) => ({ mode: summary.mode, debug: summary.debug })),
    'Open Frontier and A Shau publish active authored level/depth water bodies in WaterSystem debug info.'),
    check('water_body_watercraft_samples_on_finite_water', waterSamples.length >= 2 && waterSamples.every((sample) =>
      sample.source === 'water_body'
      && sample.terrainY !== null
      && sample.waterY !== null
      && sample.depthOverTerrain !== null
      && sample.depthOverTerrain > 0
      && sample.depthOverTerrain <= 7
    ), waterSamples,
    'Live watercraft sample authored level/depth water above finite composed terrain with bounded depth.'),
    check('water_body_ground_sections_bounded', waterGroundSections.every((row) => {
      const sections = row.groundSections;
      return sections !== null
        && sections.sampleCount > 0
        && sections.finiteCount === sections.sampleCount
        && sections.centerDepthMin !== null
        && sections.centerDepthMin >= 0.05
        && sections.centerDepthMax !== null
        && sections.centerDepthMax <= 7
        && sections.innerTerrainAboveWaterMax !== null
        && sections.innerTerrainAboveWaterMax <= 2.2
        && sections.innerDepthOverTerrainMax !== null
        && sections.innerDepthOverTerrainMax <= 7;
    }), waterGroundSections,
    'Runtime water-body basin axes and inner banks stay on finite bounded terrain rather than floating, burying, or carving sharp walls.'),
    check('zone_control_home_bases_present', zcHomeBases.length === 2, zcHomeBases.map((zone) => zone.id), 'Zone Control exposes both home-base zones in the live browser runtime.'),
    check('zone_control_home_bases_no_authored_drift', zcHomeBases.length === 2 && homeDrifts.every((drift) =>
      drift !== null && drift <= 0.05,
    ), zcHomeBases.map((zone) => ({ id: zone.id, drift: zone.authoredDriftXZ })), 'validateTerrain:false home bases stayed on authored X/Z pads.'),
    check('zone_control_home_base_flat_cores', zcHomeBases.length === 2 && homeSpans.every((span) =>
      span !== null && span <= 2,
    ), zcHomeBases.map((zone) => ({ id: zone.id, span: zone.heightSamples.span, sampleRadius: zone.heightSamples.sampleRadius })), 'Home-base live terrain cores remain within the 2m placement span sentinel.'),
    check('zone_control_all_zones_finite_terrain', (zc?.zones ?? []).length === ZONE_CONTROL_CONFIG.zones.length
      && (zc?.zones ?? []).every((zone) => zone.found && zone.terrainY !== null && zone.heightSamples.finite),
    (zc?.zones ?? []).map((zone) => ({ id: zone.id, terrainY: zone.terrainY, finite: zone.heightSamples.finite })),
    'Every authored Zone Control zone has finite live terrain samples.'),
    warn('zone_control_capture_zone_span_review', captureSpans.some((row) => row.span !== null && row.span > 4), captureSpans, 'Capture-zone spans above 4m require owner visual review but are not the validateTerrain:false drift regression.'),
  ];
}

function reportStatus(checks: CheckRow[]): CheckStatus {
  if (checks.some((entry) => entry.status === 'fail')) return 'fail';
  if (checks.some((entry) => entry.status === 'warn')) return 'warn';
  return 'pass';
}

function markdown(report: ProofReport): string {
  const vehicleRows = report.scenarios
    .flatMap((scenario) => scenario.vehicles.map((vehicle) => ({ mode: scenario.mode, vehicle })))
    .filter((row) => row.vehicle.id.toLowerCase().includes('m48'));
  const vehicleDamageProbeRows = report.scenarios.flatMap((scenario) => scenario.vehicleDamageProbes);
  const waterRows = report.scenarios.flatMap((scenario) =>
    (scenario.water?.samples ?? []).map((sample) => ({ mode: scenario.mode, sample })),
  );
  const waterGroundRows = report.scenarios
    .filter((scenario) => scenario.water?.groundSections)
    .map((scenario) => ({ mode: scenario.mode, groundSections: scenario.water!.groundSections! }));
  const zoneRows = report.scenarios.find((scenario) => scenario.mode === 'zone_control')?.zones ?? [];
  return [
    '# Terrain Vehicle Water Foundation Proof',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Headless: ${report.options.headless}`,
    '',
    '## Checks',
    '',
    ...report.checks.map((entry) => `- ${entry.status.toUpperCase()} ${entry.id}: ${entry.message} (${JSON.stringify(entry.value)})`),
    '',
    '## M48 Terrain Binding',
    '',
    '| Mode | Vehicle | Faction | Terrain Y | Vehicle Y | Delta | Health |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...vehicleRows.map(({ mode, vehicle }) =>
      `| ${mode} | ${vehicle.id} | ${vehicle.faction ?? 'n/a'} | ${fmt(vehicle.terrainY)} | ${fmt(vehicle.position.y)} | ${fmt(vehicle.heightDelta)} | ${fmt(vehicle.healthPercent)} |`),
    '',
    '## Vehicle Damage Routing',
    '',
    '| Mode | Kind | Target | Before HP | After HP | Damaged |',
    '| --- | --- | --- | ---: | ---: | --- |',
    ...vehicleDamageProbeRows.map((probe) =>
      `| ${probe.mode} | ${probe.targetKind} | ${probe.targetId ?? 'n/a'} | ${fmt(probe.beforeHealthPercent)} | ${fmt(probe.afterHealthPercent)} | ${probe.damaged ? 'yes' : 'no'} |`),
    '',
    '## Water Body Runtime Samples',
    '',
    '| Mode | Vehicle | Source | Terrain Y | Water Y | Depth Over Terrain |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...waterRows.map(({ mode, sample }) =>
      `| ${mode} | ${sample.vehicleId} | ${sample.source ?? 'n/a'} | ${fmt(sample.terrainY)} | ${fmt(sample.waterY)} | ${fmt(sample.depthOverTerrain)} |`),
    '',
    '## Water Body Ground Sections',
    '',
    '| Mode | Samples | Finite | Center Depth Min | Center Depth Max | Inner Terrain Above Water Max | Inner Depth Max | Local Terrain Span Max |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...waterGroundRows.map(({ mode, groundSections }) =>
      `| ${mode} | ${groundSections.sampleCount} | ${groundSections.finiteCount} | ${fmt(groundSections.centerDepthMin)} | ${fmt(groundSections.centerDepthMax)} | ${fmt(groundSections.innerTerrainAboveWaterMax)} | ${fmt(groundSections.innerDepthOverTerrainMax)} | ${fmt(groundSections.localTerrainSpanMax)} |`),
    '',
    '## Zone Control Terrain',
    '',
    '| Zone | Home | Validate Terrain | Drift XZ | Terrain Y | Sample Radius | Height Span |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...zoneRows.map((zone) =>
      `| ${zone.name} | ${zone.isHomeBase ? 'yes' : 'no'} | ${zone.validateTerrain === false ? 'false' : 'default'} | ${fmt(zone.authoredDriftXZ)} | ${fmt(zone.terrainY)} | ${fmt(zone.heightSamples.sampleRadius)} | ${fmt(zone.heightSamples.span)} |`),
    '',
    '## Screenshots',
    '',
    ...report.scenarios.flatMap((scenario) => scenario.screenshots.map((shot) => `- ${shot}`)),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function fmt(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(2);
}

async function main(): Promise<void> {
  const options = parseOptions();
  mkdirSync(OUT_DIR, { recursive: true });

  const server = await startServer({
    mode: 'perf',
    port: options.port,
    forceBuild: !options.noBuild,
    buildIfMissing: !options.noBuild,
    stdio: 'ignore',
    log: (message) => logStep(`[server] ${message}`),
  });

  globalBrowser = await chromium.launch({
    headless: options.headless,
    args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
  });

  const scenarios: ScenarioProof[] = [];
  try {
    scenarios.push(await captureVehicleScenario(server.port, 'open_frontier'));
    scenarios.push(await captureVehicleScenario(server.port, 'a_shau_valley'));
    scenarios.push(await captureZoneControlScenario(server.port));
  } finally {
    await globalBrowser.close().catch(() => {});
    globalBrowser = null;
    await stopServer(server).catch(() => {});
  }

  const checks = buildChecks(scenarios);
  const status = reportStatus(checks);
  const report: ProofReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    sourceGitStatus: gitStatusShort(),
    status,
    options,
    files: {
      summary: rel(join(OUT_DIR, 'terrain-foundation-proof.json')),
      markdown: rel(join(OUT_DIR, 'terrain-foundation-proof.md')),
    },
    scenarios,
    checks,
    nonClaims: [
      'This proof does not close owner-visible river readability or tank combat balance.',
      'This proof does not replace owner playtest for vehicle feel, water readability, or Zone Control gameplay flow.',
      'This proof uses local perf preview, not live Cloudflare Pages production.',
    ],
  };

  writeFileSync(join(OUT_DIR, 'terrain-foundation-proof.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(OUT_DIR, 'terrain-foundation-proof.md'), markdown(report), 'utf-8');

  console.log(`Terrain foundation proof ${status.toUpperCase()}: ${report.files.summary}`);
  for (const entry of checks) {
    console.log(`${entry.status.toUpperCase()} ${entry.id}`);
  }
  if (status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error('terrain foundation proof failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
