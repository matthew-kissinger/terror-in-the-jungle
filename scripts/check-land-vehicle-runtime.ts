#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Focused live-loop proof for land vehicle owner-acceptance issues:
 * M151/M35/M113/M48 boarding, W-drive displacement, and third-person camera framing.
 *
 * This intentionally uses the current PlayerController public path
 * (`handleBoardNearestVehicle` / `handleExitVehicle`) instead of the stale
 * historical screenshot helpers that probed old dev-only surfaces.
 *
 * Outputs:
 *   artifacts/playtests/land-vehicle-runtime-proof/
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Page } from 'playwright';
import * as THREE from 'three';
import { startServer, stopServer } from './preview-server';

type ModeId = 'open_frontier' | 'a_shau_valley';
type VehicleKind = 'm151' | 'm35' | 'm113' | 'm48';
type CheckStatus = 'pass' | 'warn' | 'fail';

interface Options {
  headless: boolean;
  noBuild: boolean;
  port: number;
  only: string | null;
}

interface PlainPoint {
  x: number;
  y: number;
  z: number;
}

interface VehicleSnapshot {
  id: string;
  category: string;
  faction: string | null;
  position: PlainPoint;
  terrainY: number | null;
}

interface CameraSnapshot {
  position: PlainPoint;
  offset: PlainPoint;
  horizontalDistance: number;
  heightAboveVehicle: number;
  downAngleDeg: number;
}

interface FacingSnapshot {
  forward: PlainPoint;
  right: PlainPoint;
}

interface QuaternionSnapshot {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface SteeringSnapshot {
  before: FacingSnapshot | null;
  afterRight: FacingSnapshot | null;
  beforeLeft: FacingSnapshot | null;
  afterLeft: FacingSnapshot | null;
  rightDelta: number | null;
  leftDelta: number | null;
  framesObserved: number;
  passed: boolean;
}

interface VehicleDebugSnapshot {
  stage: string;
  vehicleId: string;
  position: PlainPoint | null;
  weapon: {
    inAnyVehicle: boolean | null;
    currentRigVisible: boolean | null;
    visibleMeshCount: number | null;
    requestedVisible: boolean | null;
    vehicleSuppressed: boolean | null;
    canRender: boolean | null;
    renderableMeshCount: number | null;
    visibleRootCount: number | null;
  };
  terrain: {
    heightAtCenter: number | null;
    slopeAtCenter: number | null;
    playableWorldSize: number | null;
  };
  physics: {
    controls: unknown;
    state: unknown;
    groundSpeed: number | null;
    forwardSpeed: number | null;
    engineAudio: unknown;
  } | null;
}

interface TargetResult {
  mode: ModeId;
  kind: VehicleKind;
  targetId: string | null;
  boarded: boolean;
  exited: boolean;
  beforePosition: PlainPoint | null;
  afterPosition: PlainPoint | null;
  travelMeters: number | null;
  driveFramesObserved: number;
  steering: SteeringSnapshot | null;
  cameraAfterBoard: CameraSnapshot | null;
  cameraAfterDrive: CameraSnapshot | null;
  debug: VehicleDebugSnapshot[];
  screenshots: string[];
  notes: string[];
}

interface CheckRow {
  id: string;
  status: CheckStatus;
  value: unknown;
  message: string;
}

interface Report {
  createdAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  status: CheckStatus;
  options: Options;
  results: TargetResult[];
  checks: CheckRow[];
  files: {
    summary: string;
    markdown: string;
  };
}

interface HarnessWindow extends Window {
  advanceTime?: (ms: number) => Promise<void> | void;
  __engine?: {
    gameStarted?: boolean;
    startGameWithMode?: (mode: string) => Promise<unknown>;
    startupFlow?: { getState?: () => { phase?: string } };
    renderer?: {
      camera?: {
        position: PlainPoint;
      };
      getRendererBackendCapabilities?: () => { resolvedBackend?: string };
    };
    systemManager?: {
      terrainSystem?: {
        getHeightAt?: (x: number, z: number) => number;
        getSlopeAt?: (x: number, z: number) => number;
        getPlayableWorldSize?: () => number;
      };
      vehicleManager?: {
        getAllVehicles?: () => HarnessVehicle[];
      };
      playerController?: {
        handleBoardNearestVehicle?: () => boolean;
        handleExitVehicle?: () => boolean;
        setPosition?: (position: PlainPoint, reason?: string) => void;
        teleport?: (position: PlainPoint) => void;
        isInAnyVehicle?: () => boolean;
      };
      firstPersonWeapon?: {
        rigManager?: {
          getCurrentRig?: () => {
            visible?: boolean;
            traverse?: (fn: (child: { visible?: boolean; isMesh?: boolean }) => void) => void;
          };
        };
      };
    };
  };
}

interface HarnessVehicle {
  vehicleId?: string;
  category?: string;
  faction?: string;
  getPosition?: () => PlainPoint;
  getQuaternion?: () => { x?: number; y?: number; z?: number; w?: number; _x?: number; _y?: number; _z?: number; _w?: number };
  isDestroyed?: () => boolean;
  setControls?: (...args: unknown[]) => void;
  update?: (dt: number) => void;
  getPhysics?: () => {
    getState?: () => unknown;
    getControls?: () => unknown;
    getGroundSpeed?: () => number;
    getForwardSpeed?: () => number;
    getEngineAudioParams?: () => unknown;
    setPosition?: (position: PlainPoint) => void;
    resetToStable?: (position: PlainPoint) => void;
    setQuaternion?: (quaternion: { x: number; y: number; z: number; w: number }) => void;
  };
}

const VIEWPORT = { width: 1600, height: 900 };
const STARTUP_TIMEOUT_MS = 120_000;
const DEFAULT_PORT = 9146;
const OUT_DIR = join(process.cwd(), 'artifacts', 'playtests', 'land-vehicle-runtime-proof');
const STEERING_PROOF_FRAMES = 10;
const STEERING_RECENTER_FRAMES = 30;
const MIN_STEERING_SIDE_DELTA = 0.01;

const TARGETS: Array<{ mode: ModeId; kind: VehicleKind }> = [
  { mode: 'open_frontier', kind: 'm151' },
  { mode: 'open_frontier', kind: 'm35' },
  { mode: 'open_frontier', kind: 'm113' },
  { mode: 'open_frontier', kind: 'm48' },
  { mode: 'a_shau_valley', kind: 'm151' },
  { mode: 'a_shau_valley', kind: 'm48' },
];

const MIN_TRAVEL_METERS: Record<VehicleKind, number> = {
  m151: 2.0,
  m35: 1.5,
  m113: 1.0,
  m48: 0.75,
};

// Elevated-but-forward band: below min the camera is back at the old
// "mounts under the car / flat rear bumper" bug; above max it points too
// far down at the chassis instead of framing the terrain ahead (owner
// feedback 2026-06-10). Current adapter tuning lands ~29° (m151) / ~27° (m48).
const CAMERA_DOWN_ANGLE_DEG_BAND: Record<VehicleKind, { min: number; max: number }> = {
  m151: { min: 15, max: 40 },
  m35: { min: 12, max: 42 },
  m113: { min: 12, max: 42 },
  m48: { min: 15, max: 40 },
};

function cameraDownAngleInBand(kind: VehicleKind, snapshot: CameraSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  const band = CAMERA_DOWN_ANGLE_DEG_BAND[kind];
  return snapshot.downAngleDeg >= band.min && snapshot.downAngleDeg <= band.max;
}

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
    only: process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1] ?? null,
  };
}

function targetMatchesOnly(target: { mode: ModeId; kind: VehicleKind }, only: string | null): boolean {
  if (!only) return true;
  const normalized = only.toLowerCase();
  return normalized === `${target.mode}:${target.kind}` ||
    normalized === `${target.mode}/${target.kind}` ||
    normalized === target.kind ||
    normalized === target.mode;
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

function pointDistance(a: PlainPoint, b: PlainPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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
    // Not present on every mode/build.
  }
}

async function collectVehicles(page: Page): Promise<VehicleSnapshot[]> {
  return page.evaluate(() => {
    const systems = (window as HarnessWindow).__engine?.systemManager;
    const terrain = systems?.terrainSystem;
    const vehicles = systems?.vehicleManager?.getAllVehicles?.() ?? [];
    return vehicles
      .filter((vehicle) => !vehicle.isDestroyed?.())
      .map((vehicle) => {
        const position = vehicle.getPosition?.() ?? { x: 0, y: 0, z: 0 };
        const terrainY = terrain?.getHeightAt?.(position.x, position.z);
        return {
          id: String(vehicle.vehicleId ?? ''),
          category: String(vehicle.category ?? ''),
          faction: typeof vehicle.faction === 'string' ? vehicle.faction : null,
          position,
          terrainY: Number.isFinite(terrainY) ? Number(terrainY) : null,
        };
      });
  });
}

function pickTarget(vehicles: VehicleSnapshot[], kind: VehicleKind): VehicleSnapshot | null {
  const matches = vehicles.filter((vehicle) => {
    const id = vehicle.id.toLowerCase();
    if (vehicle.category !== 'ground') return false;
    if (kind === 'm35') return id.includes('m35');
    if (kind === 'm113') return id.includes('m113');
    if (kind === 'm48') return id.includes('m48');
    // M151 should be proved by its explicit runtime id. Support trucks/APCs
    // have their own target rows above, so do not let them satisfy this check.
    return id.includes('m151');
  });
  if (kind === 'm48') {
    return matches.find((vehicle) => vehicle.faction === 'US') ?? matches[0] ?? null;
  }
  return matches[0] ?? null;
}

async function waitForTargetVehicle(
  page: Page,
  kind: VehicleKind,
  timeoutMs = 120_000,
): Promise<{ target: VehicleSnapshot | null; vehicles: VehicleSnapshot[] }> {
  const deadline = Date.now() + timeoutMs;
  let vehicles: VehicleSnapshot[] = [];
  while (Date.now() < deadline) {
    vehicles = await collectVehicles(page);
    const target = pickTarget(vehicles, kind);
    if (target) return { target, vehicles };
    await page.waitForTimeout(750);
  }
  vehicles = await collectVehicles(page);
  return { target: pickTarget(vehicles, kind), vehicles };
}

async function teleportNear(page: Page, target: PlainPoint): Promise<boolean> {
  return page.evaluate((position) => {
    const pc = (window as HarnessWindow).__engine?.systemManager?.playerController;
    if (!pc) return false;
    const p = {
      x: position.x,
      y: position.y + 1.6,
      z: position.z + 3,
    };
    try {
      if (typeof pc.teleport === 'function') {
        pc.teleport(p);
        return true;
      }
      if (typeof pc.setPosition === 'function') {
        pc.setPosition(p, 'harness.land-vehicle-proof');
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }, target);
}

async function stageVehicleForSteeringProof(
  page: Page,
  mode: ModeId,
  kind: VehicleKind,
  vehicleId: string,
  notes: string[],
): Promise<boolean> {
  if (mode !== 'open_frontier' || kind !== 'm48') return false;

  const staged = await page.evaluate((id) => {
    const systems = (window as HarnessWindow).__engine?.systemManager;
    const terrain = systems?.terrainSystem;
    const vehicles = systems?.vehicleManager?.getAllVehicles?.() ?? [];
    const vehicle = vehicles.find((candidate) => candidate.vehicleId === id) as HarnessVehicle | undefined;
    const physics = vehicle?.getPhysics?.();
    if (!vehicle || !physics) return false;

    const height = Number(terrain?.getHeightAt?.(365, -1335));
    const position = {
      x: 365,
      y: Number.isFinite(height) ? height + 1.2 : 1.2,
      z: -1335,
    };
    const quaternion = { x: 0, y: 0, z: 0, w: 1 };

    try {
      physics.setPosition?.(position);
      physics.resetToStable?.(position);
      physics.setQuaternion?.(quaternion);
      vehicle.setControls?.(0, 0, false);

      const object = (vehicle as unknown as { object?: {
        position?: { copy?: (value: PlainPoint) => void };
        quaternion?: { copy?: (value: { x: number; y: number; z: number; w: number }) => void };
        updateMatrixWorld?: (force?: boolean) => void;
      } }).object;
      object?.position?.copy?.(position);
      object?.quaternion?.copy?.(quaternion);
      object?.updateMatrixWorld?.(true);

      vehicle.update?.(1 / 60);
      return true;
    } catch {
      return false;
    }
  }, vehicleId);

  if (staged) {
    const note = 'Relocated the Open Frontier M48 to the airfield flat area for the steering-direction check only; board/drive evidence still uses the real motor-pool spawn.';
    if (!notes.includes(note)) notes.push(note);
    const deterministic = await advanceHarnessTime(page, 500);
    if (!deterministic.advanced) await waitForAnimationFrames(page, 30, 5000);
  }
  return staged;
}

async function boardNearest(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const pc = (window as HarnessWindow).__engine?.systemManager?.playerController;
    return pc?.handleBoardNearestVehicle?.() === true;
  });
}

async function exitVehicle(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const pc = (window as HarnessWindow).__engine?.systemManager?.playerController;
    return pc?.handleExitVehicle?.() === true;
  });
}

async function getVehiclePosition(page: Page, vehicleId: string): Promise<PlainPoint | null> {
  return page.evaluate((id) => {
    const vehicles = (window as HarnessWindow).__engine?.systemManager?.vehicleManager?.getAllVehicles?.() ?? [];
    const vehicle = vehicles.find((candidate) => candidate.vehicleId === id);
    return vehicle?.getPosition?.() ?? null;
  }, vehicleId);
}

async function getVehicleFacingSnapshot(page: Page, vehicleId: string): Promise<FacingSnapshot | null> {
  const quat = await page.evaluate((id): QuaternionSnapshot | null => {
    const vehicles = (window as HarnessWindow).__engine?.systemManager?.vehicleManager?.getAllVehicles?.() ?? [];
    const vehicle = vehicles.find((candidate) => candidate.vehicleId === id);
    const q = vehicle?.getQuaternion?.();
    if (!q) return null;
    const quat = {
      x: Number(q.x ?? q._x ?? 0),
      y: Number(q.y ?? q._y ?? 0),
      z: Number(q.z ?? q._z ?? 0),
      w: Number(q.w ?? q._w ?? 1),
    };
    if (![quat.x, quat.y, quat.z, quat.w].every(Number.isFinite)) return null;
    return quat;
  }, vehicleId);
  return quat ? facingFromQuaternion(quat) : null;
}

const _facingQuat = new THREE.Quaternion();
const _facingForward = new THREE.Vector3();
const _facingRight = new THREE.Vector3();

function facingFromQuaternion(quat: QuaternionSnapshot): FacingSnapshot {
  _facingQuat.set(quat.x, quat.y, quat.z, quat.w).normalize();
  return {
    forward: plainPointFromVector(_facingForward.set(0, 0, -1).applyQuaternion(_facingQuat)),
    right: plainPointFromVector(_facingRight.set(1, 0, 0).applyQuaternion(_facingQuat)),
  };
}

function plainPointFromVector(vector: THREE.Vector3): PlainPoint {
  return { x: vector.x, y: vector.y, z: vector.z };
}

async function getCameraSnapshot(page: Page, vehicleId: string): Promise<CameraSnapshot | null> {
  return page.evaluate((id) => {
    const engine = (window as HarnessWindow).__engine;
    const cameraPos = engine?.renderer?.camera?.position;
    const vehicles = engine?.systemManager?.vehicleManager?.getAllVehicles?.() ?? [];
    const vehicle = vehicles.find((candidate) => candidate.vehicleId === id);
    const vehiclePos = vehicle?.getPosition?.();
    if (!cameraPos || !vehiclePos) return null;
    const offset = {
      x: cameraPos.x - vehiclePos.x,
      y: cameraPos.y - vehiclePos.y,
      z: cameraPos.z - vehiclePos.z,
    };
    const horizontalDistance = Math.hypot(offset.x, offset.z);
    const heightAboveVehicle = offset.y;
    const downAngleDeg = Math.atan2(heightAboveVehicle, Math.max(horizontalDistance, 0.001)) * 180 / Math.PI;
    return {
      position: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
      offset,
      horizontalDistance,
      heightAboveVehicle,
      downAngleDeg,
    };
  }, vehicleId);
}

async function getVehicleDebugSnapshot(
  page: Page,
  vehicleId: string,
  stage: string,
): Promise<VehicleDebugSnapshot> {
  return page.evaluate(({ id, snapshotStage }) => {
    const engine = (window as HarnessWindow).__engine;
    const systems = engine?.systemManager;
    const terrain = systems?.terrainSystem;
    const vehicles = systems?.vehicleManager?.getAllVehicles?.() ?? [];
    const vehicle = vehicles.find((candidate) => candidate.vehicleId === id);
    const position = vehicle?.getPosition?.() ?? null;
    const playerController = systems?.playerController as { isInAnyVehicle?: () => boolean } | undefined;
    const firstPersonWeapon = systems?.firstPersonWeapon as {
      getWeaponPresentationState?: () => {
        requestedVisible: boolean;
        vehicleSuppressed: boolean;
        canRender: boolean;
        currentRigVisible: boolean | null;
      };
      model?: {
        getWeaponScene?: () => {
          children?: Array<{ visible?: boolean }>;
          traverse?: (fn: (child: { visible?: boolean; isMesh?: boolean; children?: unknown[] }) => void) => void;
        };
      };
      rigManager?: {
        getCurrentRig?: () => { visible?: boolean; traverse?: (fn: (child: { visible?: boolean; isMesh?: boolean }) => void) => void };
      };
    } | undefined;
    const presentation = firstPersonWeapon?.getWeaponPresentationState?.() ?? null;
    const currentRig = firstPersonWeapon?.rigManager?.getCurrentRig?.() ?? null;
    let visibleMeshCount = 0;
    currentRig?.traverse?.((child) => {
      if (child.isMesh && child.visible !== false) visibleMeshCount += 1;
    });
    const weaponScene = firstPersonWeapon?.model?.getWeaponScene?.() ?? null;
    const visibleRootCount = weaponScene?.children
      ? weaponScene.children.filter((child) => child.visible !== false).length
      : null;
    let renderableMeshCount: number | null = null;
    if (weaponScene) {
      renderableMeshCount = 0;
      const stack = [{ node: weaponScene as any, ancestorsVisible: true }];
      while (stack.length > 0) {
        const entry = stack.pop()!;
        const visible = entry.ancestorsVisible && entry.node.visible !== false;
        if (visible && entry.node.isMesh) {
          renderableMeshCount += 1;
        }
        const children = Array.isArray(entry.node.children) ? entry.node.children : [];
        for (let i = 0; i < children.length; i += 1) {
          stack.push({ node: children[i], ancestorsVisible: visible });
        }
      }
    }
    const heightAtCenter = position && terrain?.getHeightAt
      ? terrain.getHeightAt(position.x, position.z)
      : null;
    const slopeAtCenter = position && terrain?.getSlopeAt
      ? terrain.getSlopeAt(position.x, position.z)
      : null;
    const playableWorldSize = terrain?.getPlayableWorldSize?.() ?? null;
    const physics = vehicle?.getPhysics?.() ?? null;
    return {
      stage: snapshotStage,
      vehicleId: id,
      position,
      weapon: {
        inAnyVehicle: typeof playerController?.isInAnyVehicle === 'function'
          ? playerController.isInAnyVehicle()
          : null,
        currentRigVisible: currentRig
          ? currentRig.visible !== false
          : null,
        visibleMeshCount: currentRig ? visibleMeshCount : null,
        requestedVisible: presentation?.requestedVisible ?? null,
        vehicleSuppressed: presentation?.vehicleSuppressed ?? null,
        canRender: presentation?.canRender ?? null,
        renderableMeshCount,
        visibleRootCount,
      },
      terrain: {
        heightAtCenter: Number.isFinite(heightAtCenter) ? Number(heightAtCenter) : null,
        slopeAtCenter: Number.isFinite(slopeAtCenter) ? Number(slopeAtCenter) : null,
        playableWorldSize: Number.isFinite(playableWorldSize) ? Number(playableWorldSize) : null,
      },
      physics: physics ? {
        controls: physics.getControls?.() ?? null,
        state: physics.getState?.() ?? null,
        groundSpeed: Number.isFinite(physics.getGroundSpeed?.()) ? Number(physics.getGroundSpeed?.()) : null,
        forwardSpeed: Number.isFinite(physics.getForwardSpeed?.()) ? Number(physics.getForwardSpeed?.()) : null,
        engineAudio: physics.getEngineAudioParams?.() ?? null,
      } : null,
    };
  }, { id: vehicleId, snapshotStage: stage });
}

async function screenshot(page: Page, filename: string, notes: string[]): Promise<string | null> {
  const out = join(OUT_DIR, filename);
  try {
    const buffer = await page.screenshot({
      type: 'png',
      fullPage: false,
      timeout: 60_000,
    });
    writeFileSync(out, buffer);
    logStep(`Wrote ${rel(out)} (${buffer.byteLength} bytes)`);
    return rel(out);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notes.push(`screenshot ${filename} failed: ${message}`);
    return null;
  }
}

async function waitForAnimationFrames(page: Page, targetFrames: number, timeoutMs: number): Promise<number> {
  const frames = Math.max(0, Math.floor(targetFrames));
  const timeout = Math.max(0, Math.floor(timeoutMs));
  return page.evaluate(`new Promise((resolve) => {
    let count = 0;
    let finished = false;
    const start = performance.now();
    function finish() {
      if (finished) return;
      finished = true;
      resolve(count);
    }
    function tick() {
      if (finished) return;
      count += 1;
      if (count >= ${frames} || performance.now() - start >= ${timeout}) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })`);
}

async function advanceHarnessTime(page: Page, durationMs: number): Promise<{ advanced: boolean; frames: number }> {
  return page.evaluate(async (ms) => {
    const advance = (window as HarnessWindow).advanceTime;
    if (typeof advance !== 'function') {
      return { advanced: false, frames: 0 };
    }
    await advance(ms);
    return {
      advanced: true,
      frames: Math.max(1, Math.round(ms / (1000 / 60))),
    };
  }, durationMs);
}

async function advanceVehicleInputFrames(page: Page, frames: number): Promise<number> {
  const deterministic = await advanceHarnessTime(page, frames * (1000 / 60));
  if (deterministic.advanced) return deterministic.frames;
  return waitForAnimationFrames(page, frames, Math.max(3000, frames * 250));
}

function pointDot(a: PlainPoint, b: PlainPoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function pointDelta(a: PlainPoint, b: PlainPoint): PlainPoint {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

async function proveSteering(
  page: Page,
  mode: ModeId,
  kind: VehicleKind,
  vehicleId: string,
  notes: string[],
): Promise<SteeringSnapshot> {
  await stageVehicleForSteeringProof(page, mode, kind, vehicleId, notes);
  const before = await getVehicleFacingSnapshot(page, vehicleId);
  let framesObserved = 0;
  let afterRight: FacingSnapshot | null = null;
  let beforeLeft: FacingSnapshot | null = null;
  let afterLeft: FacingSnapshot | null = null;

  try {
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    framesObserved += await advanceVehicleInputFrames(page, STEERING_PROOF_FRAMES);
    afterRight = await getVehicleFacingSnapshot(page, vehicleId);
  } finally {
    await page.keyboard.up('d').catch(() => {});
    await page.keyboard.up('w').catch(() => {});
  }

  if (await stageVehicleForSteeringProof(page, mode, kind, vehicleId, notes)) {
    beforeLeft = await getVehicleFacingSnapshot(page, vehicleId);
  } else {
    try {
      await page.keyboard.down('w');
      framesObserved += await advanceVehicleInputFrames(page, STEERING_RECENTER_FRAMES);
      beforeLeft = await getVehicleFacingSnapshot(page, vehicleId);
    } finally {
      await page.keyboard.up('w').catch(() => {});
    }
  }

  try {
    await page.keyboard.down('w');
    await page.keyboard.down('a');
    framesObserved += await advanceVehicleInputFrames(page, STEERING_PROOF_FRAMES);
    afterLeft = await getVehicleFacingSnapshot(page, vehicleId);
  } finally {
    await page.keyboard.up('a').catch(() => {});
    await page.keyboard.up('w').catch(() => {});
  }

  const rightDelta = before && afterRight
    ? pointDot(pointDelta(afterRight.forward, before.forward), before.right)
    : null;
  const leftDelta = beforeLeft && afterLeft
    ? pointDot(pointDelta(afterLeft.forward, beforeLeft.forward), beforeLeft.right)
    : null;
  const passed = rightDelta !== null
    && leftDelta !== null
    && rightDelta > MIN_STEERING_SIDE_DELTA
    && leftDelta < -MIN_STEERING_SIDE_DELTA;
  if (!passed) {
    notes.push(`Steering response did not pass short-window direction check: rightDelta=${rightDelta}, leftDelta=${leftDelta}.`);
  }

  return {
    before,
    afterRight,
    beforeLeft,
    afterLeft,
    rightDelta,
    leftDelta,
    framesObserved,
    passed,
  };
}

async function proveTarget(page: Page, mode: ModeId, kind: VehicleKind): Promise<TargetResult> {
  const notes: string[] = [];
  const screenshots: string[] = [];
  const debug: VehicleDebugSnapshot[] = [];
  const { target, vehicles } = await waitForTargetVehicle(page, kind);
  if (!target) {
    return {
      mode,
      kind,
      targetId: null,
      boarded: false,
      exited: false,
      beforePosition: null,
      afterPosition: null,
      travelMeters: null,
      driveFramesObserved: 0,
      steering: null,
      cameraAfterBoard: null,
      cameraAfterDrive: null,
      debug,
      screenshots,
      notes: [`No ${kind} ground vehicle found in ${mode}.`, `Vehicles: ${vehicles.map((v) => v.id).join(', ')}`],
    };
  }

  const teleported = await teleportNear(page, target.position);
  if (!teleported) notes.push('Player teleport surface unavailable.');
  await page.waitForTimeout(1200);

  const boarded = await boardNearest(page);
  await page.waitForTimeout(750);
  const beforePosition = await getVehiclePosition(page, target.id);
  const cameraAfterBoard = await getCameraSnapshot(page, target.id);
  debug.push(await getVehicleDebugSnapshot(page, target.id, 'after-board'));
  const boardShot = await screenshot(page, `${mode}-${kind}-after-board.png`, notes);
  if (boardShot) screenshots.push(boardShot);

  let driveFramesObserved = 0;
  if (boarded) {
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    debug.push(await getVehicleDebugSnapshot(page, target.id, 'while-w-held'));
    const requestedFrames = kind === 'm48' || kind === 'm35' || kind === 'm113' ? 240 : 180;
    const frameTimeoutMs = kind === 'm48' || kind === 'm35' || kind === 'm113' ? 30_000 : 24_000;
    const deterministic = await advanceHarnessTime(page, requestedFrames * (1000 / 60));
    if (deterministic.advanced) {
      driveFramesObserved = deterministic.frames;
      notes.push(`Advanced ${deterministic.frames} deterministic perf-harness frames while W was held.`);
    } else {
      driveFramesObserved = await waitForAnimationFrames(page, requestedFrames, frameTimeoutMs);
    }
    await page.keyboard.up('w');
    await page.waitForTimeout(500);
  }

  const afterPosition = await getVehiclePosition(page, target.id);
  const cameraAfterDrive = await getCameraSnapshot(page, target.id);
  debug.push(await getVehicleDebugSnapshot(page, target.id, 'after-drive'));
  const driveShot = await screenshot(page, `${mode}-${kind}-after-drive.png`, notes);
  if (driveShot) screenshots.push(driveShot);

  const steering = boarded ? await proveSteering(page, mode, kind, target.id, notes) : null;
  if (steering) {
    debug.push(await getVehicleDebugSnapshot(page, target.id, 'after-steering'));
  }

  const exited = await exitVehicle(page);
  await page.waitForTimeout(300);

  return {
    mode,
    kind,
    targetId: target.id,
    boarded,
    exited,
    beforePosition,
    afterPosition,
    travelMeters: beforePosition && afterPosition ? pointDistance(beforePosition, afterPosition) : null,
    driveFramesObserved,
    steering,
    cameraAfterBoard,
    cameraAfterDrive,
    debug,
    screenshots,
    notes,
  };
}

function check(id: string, passed: boolean, value: unknown, message: string): CheckRow {
  return { id, status: passed ? 'pass' : 'fail', value, message };
}

function buildChecks(results: TargetResult[], activeTargets = TARGETS): CheckRow[] {
  const byTarget = (mode: ModeId, kind: VehicleKind): TargetResult | undefined =>
    results.find((result) => result.mode === mode && result.kind === kind);
  const hasTarget = (mode: ModeId, kind: VehicleKind): boolean =>
    activeTargets.some((target) => target.mode === mode && target.kind === kind);

  const openFrontierJeep = byTarget('open_frontier', 'm151');
  const openFrontierM35 = byTarget('open_frontier', 'm35');
  const openFrontierM113 = byTarget('open_frontier', 'm113');
  const openFrontierTank = byTarget('open_frontier', 'm48');
  const aShauJeep = byTarget('a_shau_valley', 'm151');
  const aShauTank = byTarget('a_shau_valley', 'm48');

  const driveRows = results.filter((result) => result.boarded && result.travelMeters !== null);
  const cameraRows = results.filter((result) => result.boarded && result.cameraAfterBoard !== null);
  const steeringRows = results.filter((result) => result.boarded && result.steering !== null);
  const weaponRows = results
    .filter((result) => result.boarded)
    .flatMap((result) => result.debug
      .filter((entry) => entry.stage === 'after-board' || entry.stage === 'after-drive')
      .map((entry) => ({
        mode: result.mode,
        kind: result.kind,
        vehicleId: result.targetId,
        stage: entry.stage,
        weapon: entry.weapon,
      })));

  const rows: CheckRow[] = [];
  if (hasTarget('open_frontier', 'm151')) {
    rows.push(
      check('open_frontier_m151_boarded', openFrontierJeep?.boarded === true, openFrontierJeep, 'Open Frontier M151 boards through PlayerController.handleBoardNearestVehicle.'),
      check('open_frontier_m151_drives', (openFrontierJeep?.travelMeters ?? 0) >= MIN_TRAVEL_METERS.m151, openFrontierJeep?.travelMeters, 'Open Frontier M151 moves after holding W in the live loop.'),
      check('open_frontier_m151_camera_framing', cameraDownAngleInBand('m151', openFrontierJeep?.cameraAfterBoard), openFrontierJeep?.cameraAfterBoard, 'Open Frontier M151 follow camera sits in the elevated-but-forward band — neither a flat rear bumper view nor pitched down onto the chassis.'),
    );
  }
  if (hasTarget('open_frontier', 'm48')) {
    rows.push(
      check('open_frontier_m48_boarded', openFrontierTank?.boarded === true, openFrontierTank, 'Open Frontier M48 boards through PlayerController.handleBoardNearestVehicle.'),
      check('open_frontier_m48_drives', (openFrontierTank?.travelMeters ?? 0) >= MIN_TRAVEL_METERS.m48, openFrontierTank?.travelMeters, 'Open Frontier M48 moves after holding W in the live loop.'),
      check('open_frontier_m48_camera_framing', cameraDownAngleInBand('m48', openFrontierTank?.cameraAfterBoard), openFrontierTank?.cameraAfterBoard, 'Open Frontier M48 follow camera sits in the elevated-but-forward band.'),
    );
  }
  if (hasTarget('open_frontier', 'm35')) {
    rows.push(
      check('open_frontier_m35_boarded', openFrontierM35?.boarded === true, openFrontierM35, 'Open Frontier M35 cargo truck boards through PlayerController.handleBoardNearestVehicle.'),
      check('open_frontier_m35_drives', (openFrontierM35?.travelMeters ?? 0) >= MIN_TRAVEL_METERS.m35, openFrontierM35?.travelMeters, 'Open Frontier M35 cargo truck moves after holding W in the live loop.'),
      check('open_frontier_m35_camera_framing', cameraDownAngleInBand('m35', openFrontierM35?.cameraAfterBoard), openFrontierM35?.cameraAfterBoard, 'Open Frontier M35 cargo truck follow camera sits in the elevated-but-forward band.'),
    );
  }
  if (hasTarget('open_frontier', 'm113')) {
    rows.push(
      check('open_frontier_m113_boarded', openFrontierM113?.boarded === true, openFrontierM113, 'Open Frontier M113 APC boards through PlayerController.handleBoardNearestVehicle.'),
      check('open_frontier_m113_drives', (openFrontierM113?.travelMeters ?? 0) >= MIN_TRAVEL_METERS.m113, openFrontierM113?.travelMeters, 'Open Frontier M113 APC moves after holding W in the live loop.'),
      check('open_frontier_m113_camera_framing', cameraDownAngleInBand('m113', openFrontierM113?.cameraAfterBoard), openFrontierM113?.cameraAfterBoard, 'Open Frontier M113 APC follow camera sits in the elevated-but-forward band.'),
    );
  }
  if (hasTarget('a_shau_valley', 'm48')) {
    rows.push(check('a_shau_m48_findable', Boolean(aShauTank?.targetId), aShauTank, 'A Shau exposes a live M48 target for vehicle/tank acceptance.'));
  }
  if (hasTarget('a_shau_valley', 'm151')) {
    rows.push(
      check('a_shau_m151_boarded', aShauJeep?.boarded === true, aShauJeep, 'A Shau M151 boards through PlayerController.handleBoardNearestVehicle.'),
      check('a_shau_m151_drives', (aShauJeep?.travelMeters ?? 0) >= MIN_TRAVEL_METERS.m151, aShauJeep?.travelMeters, 'A Shau M151 moves after holding W in the live loop.'),
      check('a_shau_m151_camera_framing', cameraDownAngleInBand('m151', aShauJeep?.cameraAfterBoard), aShauJeep?.cameraAfterBoard, 'A Shau M151 follow camera sits in the elevated-but-forward band.'),
    );
  }
  rows.push(
    check('exits_cleanly', results.filter((result) => result.boarded).every((result) => result.exited), results.map((result) => ({ mode: result.mode, kind: result.kind, boarded: result.boarded, exited: result.exited })), 'Every successfully boarded land vehicle exits through PlayerController.handleExitVehicle.'),
    check('drive_rows_have_motion', driveRows.every((result) => (result.travelMeters ?? 0) >= MIN_TRAVEL_METERS[result.kind]), driveRows.map((result) => ({ mode: result.mode, kind: result.kind, travelMeters: result.travelMeters })), 'All boarded drive rows clear the movement threshold for their vehicle class.'),
    check('steering_rows_directional', steeringRows.length > 0 && steeringRows.every((result) => result.steering?.passed === true), steeringRows.map((result) => ({ mode: result.mode, kind: result.kind, steering: result.steering })), 'All boarded land vehicles turn right for W+D and left for W+A in a short-window live input check.'),
    check('camera_rows_in_framing_band', cameraRows.every((result) => cameraDownAngleInBand(result.kind, result.cameraAfterBoard)), cameraRows.map((result) => ({ mode: result.mode, kind: result.kind, camera: result.cameraAfterBoard })), 'All boarded land vehicles use elevated-but-forward third-person camera framing.'),
    check('weapon_overlay_hidden_in_vehicles', weaponRows.length > 0 && weaponRows.every((row) =>
      row.weapon.inAnyVehicle === true
      && row.weapon.vehicleSuppressed === true
      && row.weapon.canRender === false
      && row.weapon.currentRigVisible === false
      && row.weapon.renderableMeshCount === 0
    ), weaponRows, 'The first-person infantry weapon overlay is suppressed at the equipment layer and has no renderable meshes while the player is seated.'),
  );
  return rows;
}

function reportStatus(checks: CheckRow[]): CheckStatus {
  if (checks.some((entry) => entry.status === 'fail')) return 'fail';
  if (checks.some((entry) => entry.status === 'warn')) return 'warn';
  return 'pass';
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : value.toFixed(2);
}

function markdown(report: Report): string {
  return [
    '# Land Vehicle Runtime Proof',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Headless: ${report.options.headless}`,
    '',
    '## Checks',
    '',
    ...report.checks.map((entry) => `- ${entry.status.toUpperCase()} ${entry.id}: ${entry.message} (${JSON.stringify(entry.value)})`),
    '',
    '## Runtime Rows',
    '',
    '| Mode | Kind | Vehicle | Boarded | Drive Frames | Travel M | Steer R | Steer L | Camera Height | Camera Angle | Exited |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...report.results.map((result) =>
      `| ${result.mode} | ${result.kind} | ${result.targetId ?? 'n/a'} | ${result.boarded ? 'yes' : 'no'} | ${result.driveFramesObserved} | ${fmt(result.travelMeters)} | ${fmt(result.steering?.rightDelta)} | ${fmt(result.steering?.leftDelta)} | ${fmt(result.cameraAfterBoard?.heightAboveVehicle)} | ${fmt(result.cameraAfterBoard?.downAngleDeg)} | ${result.exited ? 'yes' : 'no'} |`),
    '',
    '## Screenshots',
    '',
    ...report.results.flatMap((result) => result.screenshots.map((shot) => `- ${shot}`)),
    '',
    '## Notes',
    '',
    ...report.results.flatMap((result) => result.notes.map((note) => `- ${result.mode}/${result.kind}: ${note}`)),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const options = parseOptions();
  const activeTargets = TARGETS.filter((target) => targetMatchesOnly(target, options.only));
  if (activeTargets.length === 0) {
    console.error(`No land-vehicle targets matched --only=${options.only}`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const server = await startServer({
    mode: 'perf',
    port: options.port,
    forceBuild: !options.noBuild,
    buildIfMissing: !options.noBuild,
    stdio: 'ignore',
    log: (message) => logStep(`[server] ${message}`),
  });

  const browser = await chromium.launch({
    headless: options.headless,
    args: [
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });

  const browserErrors: string[] = [];
  const pageErrors: string[] = [];

  const results: TargetResult[] = [];
  try {
    for (const mode of ['open_frontier', 'a_shau_valley'] as ModeId[]) {
      const modeTargets = activeTargets.filter((candidate) => candidate.mode === mode);
      if (modeTargets.length === 0) continue;
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      page.on('console', (msg) => {
        if (msg.type() === 'error') browserErrors.push(`[${mode}] ${msg.text()}`);
      });
      page.on('pageerror', (error) => pageErrors.push(`[${mode}] ${error.message}`));
      try {
        await page.goto(`http://127.0.0.1:${server.port}/?perf=1&capture=1&uiTransitions=0&logLevel=error`, {
          waitUntil: 'domcontentloaded',
          timeout: STARTUP_TIMEOUT_MS,
        });
        await waitForEngine(page);
        logStep(`Starting mode ${mode}`);
        await startMode(page, mode);
        await dismissBriefingIfPresent(page);
        await page.waitForTimeout(mode === 'a_shau_valley' ? 7000 : 5000);

        for (const target of modeTargets) {
          logStep(`Proving ${target.mode}/${target.kind}`);
          results.push(await proveTarget(page, target.mode, target.kind));
        }
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }

  if (browserErrors.length || pageErrors.length) {
    results.push({
      mode: 'open_frontier',
      kind: 'm151',
      targetId: null,
      boarded: false,
      exited: false,
      beforePosition: null,
      afterPosition: null,
      travelMeters: null,
      driveFramesObserved: 0,
      steering: null,
      cameraAfterBoard: null,
      cameraAfterDrive: null,
      debug: [],
      screenshots: [],
      notes: [`Browser errors: ${browserErrors.join(' | ')}`, `Page errors: ${pageErrors.join(' | ')}`],
    });
  }

  const checks = buildChecks(results, activeTargets);
  if (browserErrors.length || pageErrors.length) {
    checks.unshift(check('browser_errors_clear', false, { browserErrors, pageErrors }, 'No browser console/page errors during land-vehicle proof.'));
  } else {
    checks.unshift(check('browser_errors_clear', true, [], 'No browser console/page errors during land-vehicle proof.'));
  }
  const status = reportStatus(checks);
  const report: Report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    sourceGitStatus: gitStatusShort(),
    status,
    options,
    results,
    checks,
    files: {
      summary: rel(join(OUT_DIR, 'land-vehicle-runtime-proof.json')),
      markdown: rel(join(OUT_DIR, 'land-vehicle-runtime-proof.md')),
    },
  };

  writeFileSync(join(OUT_DIR, 'land-vehicle-runtime-proof.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(OUT_DIR, 'land-vehicle-runtime-proof.md'), markdown(report), 'utf-8');

  console.log(`Land vehicle runtime proof ${status.toUpperCase()}: ${report.files.summary}`);
  for (const entry of checks) {
    console.log(`${entry.status.toUpperCase()} ${entry.id}`);
  }
  if (status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error('land vehicle runtime proof failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
