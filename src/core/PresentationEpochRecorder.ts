// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { isPerfDiagnosticsEnabled, isPerfHarnessEnabled } from './PerfDiagnostics';

type CameraEpochStage =
  | 'before-simulation'
  | 'after-simulation'
  | 'before-render'
  | 'after-render';

type TerrainDebugTileLike = {
  x: number;
  z: number;
  size: number;
  lodLevel: number;
  morphFactor?: number;
  edgeMorphMask?: number;
};

type TerrainDebugSource = {
  getActiveTilesForDebug?: () => ReadonlyArray<TerrainDebugTileLike>;
  getActiveTerrainTileCount?: () => number;
  wasLastTileSelectionSaturated?: () => boolean;
  getHeightAt?: (x: number, z: number) => number;
  getEffectiveHeightAt?: (x: number, z: number) => number;
  hasTerrainAt?: (x: number, z: number) => boolean;
  isAreaReadyAt?: (x: number, z: number) => boolean;
};

type RendererStatsSource = {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
};

export interface PresentationCameraEpoch {
  stage: CameraEpochStage;
  frameCount: number;
  atMs: number;
  cameraSource: string;
  position: { x: number; y: number; z: number };
  rotationDeg: { yaw: number; pitch: number; roll: number };
  quaternion: { x: number; y: number; z: number; w: number };
  deltaFromPrevious?: {
    positionMeters: number;
    yawDeg: number;
    pitchDeg: number;
    rollDeg: number;
  };
}

export interface PresentationTerrainEpoch {
  tileCount: number;
  tileSelectionSaturated?: boolean;
  tileHash: string;
  lodCounts: Record<string, number>;
  morphingTiles: number;
  maxMorphFactor: number;
  edgeMorphTiles: number;
  edgeMorphMaskCounts: Record<string, number>;
  minTileSize: number;
  maxTileSize: number;
  cameraSample?: {
    terrainHeightAtCamera: number | null;
    effectiveHeightAtCamera: number | null;
    clearanceMeters: number | null;
    effectiveClearanceMeters: number | null;
    hasTerrain: boolean | null;
    areaReady: boolean | null;
  };
}

export interface PresentationTerrainSyncEpoch {
  didSync: boolean;
  reason: string;
  selectionRechecked?: boolean;
  poseWasStale?: boolean;
  projectionChanged?: boolean;
  positionDeltaMeters: number;
  rotationDeltaDeg: number;
  tileCount: number;
  tileSelectionSaturated?: boolean;
  terrainBufferSubmitted?: boolean;
  submissionClassification?: string | null;
}

export interface PresentationEpochContext {
  frameCount: number;
  atMs: number;
  cameraEpochs: PresentationCameraEpoch[];
  terrain?: PresentationTerrainEpoch;
  terrainByStage?: Partial<Record<CameraEpochStage, PresentationTerrainEpoch>>;
  terrainSync?: PresentationTerrainSyncEpoch;
  renderer?: RendererStatsSource;
}

type MutablePresentationEpochContext = PresentationEpochContext & {
  cameraEpochRingStart: number;
  cameraEpochRingCount: number;
  latestCameraEpoch?: PresentationCameraEpoch;
};

type PresentationEpochStore = {
  getLatestContext(): PresentationEpochContext | null;
  reset(): void;
  record(input: {
    stage: CameraEpochStage;
    frameCount: number;
    camera: THREE.Camera;
    cameraSource: string;
    terrain?: TerrainDebugSource | null;
    terrainSync?: PresentationTerrainSyncEpoch | null;
    rendererStats?: RendererStatsSource | null;
  }): void;
};

type GlobalWithPresentationEpochs = typeof globalThis & {
  __presentationEpochContext?: PresentationEpochStore;
};

const MAX_CAMERA_EPOCHS_PER_FRAME = 8;
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export function recordPresentationCameraEpoch(input: {
  stage: CameraEpochStage;
  frameCount: number;
  camera: THREE.Camera;
  cameraSource: string;
  terrain?: TerrainDebugSource | null;
  terrainSync?: PresentationTerrainSyncEpoch | null;
  rendererStats?: RendererStatsSource | null;
}): void {
  const store = getPresentationEpochStore();
  if (!store) return;
  store.record(input);
}

export function getPresentationEpochContextForDebug(): PresentationEpochContext | null {
  return getPresentationEpochStore()?.getLatestContext() ?? null;
}

export function resetPresentationEpochContext(): void {
  const globalScope = globalThis as GlobalWithPresentationEpochs;
  globalScope.__presentationEpochContext?.reset();
}

function getPresentationEpochStore(): PresentationEpochStore | null {
  if (!shouldRecordPresentationEpochs()) return null;
  const globalScope = globalThis as GlobalWithPresentationEpochs;
  if (!globalScope.__presentationEpochContext) {
    let latestContext: MutablePresentationEpochContext | null = null;
    globalScope.__presentationEpochContext = {
      getLatestContext(): PresentationEpochContext | null {
        return cloneContext(latestContext);
      },
      reset(): void {
        latestContext = null;
      },
      record(input): void {
        const now = nowMs();
        if (!latestContext || latestContext.frameCount !== input.frameCount) {
          latestContext = {
            frameCount: input.frameCount,
            atMs: now,
            cameraEpochs: [],
            cameraEpochRingStart: 0,
            cameraEpochRingCount: 0,
          };
        }

        const previous = latestContext.latestCameraEpoch;
        const epoch = buildCameraEpoch(input, now, previous);
        appendCameraEpoch(latestContext, epoch);
        if (input.terrain) {
          const terrain = summarizeTerrain(input.terrain, input.camera);
          latestContext.terrain = terrain;
          latestContext.terrainByStage = latestContext.terrainByStage ?? {};
          latestContext.terrainByStage[input.stage] = terrain;
        }
        if (input.terrainSync) {
          latestContext.terrainSync = sanitizeTerrainSync(input.terrainSync);
        }
        if (input.rendererStats) {
          latestContext.renderer = { ...input.rendererStats };
        }
      },
    };
  }
  return globalScope.__presentationEpochContext;
}

function appendCameraEpoch(
  context: MutablePresentationEpochContext,
  epoch: PresentationCameraEpoch,
): void {
  const writeIndex = (context.cameraEpochRingStart + context.cameraEpochRingCount)
    % MAX_CAMERA_EPOCHS_PER_FRAME;
  if (context.cameraEpochRingCount < MAX_CAMERA_EPOCHS_PER_FRAME) {
    context.cameraEpochs[writeIndex] = epoch;
    context.cameraEpochRingCount += 1;
  } else {
    context.cameraEpochs[context.cameraEpochRingStart] = epoch;
    context.cameraEpochRingStart = (context.cameraEpochRingStart + 1) % MAX_CAMERA_EPOCHS_PER_FRAME;
  }
  context.latestCameraEpoch = epoch;
}

function getCameraEpochSnapshot(context: PresentationEpochContext): PresentationCameraEpoch[] {
  const ringContext = context as Partial<MutablePresentationEpochContext>;
  const count = Number.isInteger(ringContext.cameraEpochRingCount)
    ? Number(ringContext.cameraEpochRingCount)
    : context.cameraEpochs.length;
  const start = Number.isInteger(ringContext.cameraEpochRingStart)
    ? Number(ringContext.cameraEpochRingStart)
    : 0;
  const output = new Array<PresentationCameraEpoch>(count);
  for (let index = 0; index < count; index++) {
    output[index] = context.cameraEpochs[(start + index) % MAX_CAMERA_EPOCHS_PER_FRAME];
  }
  return output;
}

function shouldRecordPresentationEpochs(): boolean {
  return (import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1')
    && (isPerfHarnessEnabled() || isPerfDiagnosticsEnabled())
    && typeof performance !== 'undefined'
    && typeof performance.now === 'function';
}

function buildCameraEpoch(
  input: {
    stage: CameraEpochStage;
    frameCount: number;
    camera: THREE.Camera;
    cameraSource: string;
  },
  now: number,
  previous?: PresentationCameraEpoch,
): PresentationCameraEpoch {
  scratchEuler.setFromQuaternion(input.camera.quaternion, 'YXZ');
  const yaw = radiansToDegrees(scratchEuler.y);
  const pitch = radiansToDegrees(scratchEuler.x);
  const roll = radiansToDegrees(scratchEuler.z);
  const epoch: PresentationCameraEpoch = {
    stage: input.stage,
    frameCount: input.frameCount,
    atMs: now,
    cameraSource: input.cameraSource,
    position: {
      x: input.camera.position.x,
      y: input.camera.position.y,
      z: input.camera.position.z,
    },
    rotationDeg: { yaw, pitch, roll },
    quaternion: {
      x: input.camera.quaternion.x,
      y: input.camera.quaternion.y,
      z: input.camera.quaternion.z,
      w: input.camera.quaternion.w,
    },
  };
  if (previous) {
    epoch.deltaFromPrevious = {
      positionMeters: distance(epoch.position, previous.position),
      yawDeg: shortestAngleDegrees(yaw - previous.rotationDeg.yaw),
      pitchDeg: shortestAngleDegrees(pitch - previous.rotationDeg.pitch),
      rollDeg: shortestAngleDegrees(roll - previous.rotationDeg.roll),
    };
  }
  return epoch;
}

function summarizeTerrain(source: TerrainDebugSource, camera: THREE.Camera): PresentationTerrainEpoch {
  const tiles = source.getActiveTilesForDebug?.() ?? [];
  const lodCounts: Record<string, number> = {};
  const edgeMorphMaskCounts: Record<string, number> = {};
  let hash = 2166136261;
  let morphingTiles = 0;
  let maxMorphFactor = 0;
  let edgeMorphTiles = 0;
  let minTileSize = Number.POSITIVE_INFINITY;
  let maxTileSize = 0;

  for (const tile of tiles) {
    const lodKey = String(tile.lodLevel);
    lodCounts[lodKey] = (lodCounts[lodKey] ?? 0) + 1;
    const morphFactor = finiteNumber(tile.morphFactor);
    const edgeMorphMask = finiteNumber(tile.edgeMorphMask);
    if (morphFactor > 0.001) morphingTiles += 1;
    if (edgeMorphMask !== 0) edgeMorphTiles += 1;
    const edgeMorphMaskKey = String(edgeMorphMask);
    edgeMorphMaskCounts[edgeMorphMaskKey] = (edgeMorphMaskCounts[edgeMorphMaskKey] ?? 0) + 1;
    maxMorphFactor = Math.max(maxMorphFactor, morphFactor);
    minTileSize = Math.min(minTileSize, finiteNumber(tile.size));
    maxTileSize = Math.max(maxTileSize, finiteNumber(tile.size));
    hash = hashNumber(hash, Math.round(finiteNumber(tile.x) * 10));
    hash = hashNumber(hash, Math.round(finiteNumber(tile.z) * 10));
    hash = hashNumber(hash, Math.round(finiteNumber(tile.size) * 10));
    hash = hashNumber(hash, finiteNumber(tile.lodLevel));
    hash = hashNumber(hash, Math.round(morphFactor * 1000));
    hash = hashNumber(hash, edgeMorphMask);
  }

  const fallbackCount = finiteNumber(source.getActiveTerrainTileCount?.());
  const tileCount = tiles.length > 0 ? tiles.length : fallbackCount;
  return {
    tileCount,
    tileSelectionSaturated: Boolean(source.wasLastTileSelectionSaturated?.()),
    tileHash: hash.toString(16).padStart(8, '0'),
    lodCounts,
    morphingTiles,
    maxMorphFactor,
    edgeMorphTiles,
    edgeMorphMaskCounts,
    minTileSize: Number.isFinite(minTileSize) ? minTileSize : 0,
    maxTileSize,
    cameraSample: sampleTerrainAtCamera(source, camera),
  };
}

function sampleTerrainAtCamera(
  source: TerrainDebugSource,
  camera: THREE.Camera,
): PresentationTerrainEpoch['cameraSample'] {
  const x = camera.position.x;
  const y = camera.position.y;
  const z = camera.position.z;
  const terrainHeightAtCamera = safeNumber(() => source.getHeightAt?.(x, z));
  const effectiveHeightAtCamera = safeNumber(() => source.getEffectiveHeightAt?.(x, z));
  const hasTerrain = safeBoolean(() => source.hasTerrainAt?.(x, z));
  const areaReady = safeBoolean(() => source.isAreaReadyAt?.(x, z));
  return {
    terrainHeightAtCamera,
    effectiveHeightAtCamera,
    clearanceMeters: terrainHeightAtCamera === null ? null : y - terrainHeightAtCamera,
    effectiveClearanceMeters: effectiveHeightAtCamera === null ? null : y - effectiveHeightAtCamera,
    hasTerrain,
    areaReady,
  };
}

function sanitizeTerrainSync(input: PresentationTerrainSyncEpoch): PresentationTerrainSyncEpoch {
  return {
    didSync: Boolean(input.didSync),
    reason: String(input.reason ?? ''),
    selectionRechecked: Boolean(input.selectionRechecked),
    poseWasStale: Boolean(input.poseWasStale),
    projectionChanged: Boolean(input.projectionChanged),
    positionDeltaMeters: finiteNumber(input.positionDeltaMeters),
    rotationDeltaDeg: finiteNumber(input.rotationDeltaDeg),
    tileCount: finiteNumber(input.tileCount),
    tileSelectionSaturated: Boolean(input.tileSelectionSaturated),
    terrainBufferSubmitted: Boolean(input.terrainBufferSubmitted),
    submissionClassification: input.submissionClassification === null || input.submissionClassification === undefined
      ? null
      : String(input.submissionClassification),
  };
}

function cloneContext(context: PresentationEpochContext | null): PresentationEpochContext | null {
  if (!context) return null;
  const terrainByStage = context.terrainByStage
    ? Object.fromEntries(
        Object.entries(context.terrainByStage)
          .map(([stage, terrain]) => [stage, cloneTerrainEpoch(terrain)])
      ) as Partial<Record<CameraEpochStage, PresentationTerrainEpoch>>
    : undefined;
  return {
    frameCount: context.frameCount,
    atMs: context.atMs,
    cameraEpochs: getCameraEpochSnapshot(context).map((epoch) => ({
      ...epoch,
      position: { ...epoch.position },
      rotationDeg: { ...epoch.rotationDeg },
      quaternion: { ...epoch.quaternion },
      deltaFromPrevious: epoch.deltaFromPrevious
        ? { ...epoch.deltaFromPrevious }
        : undefined,
    })),
    terrain: cloneTerrainEpoch(context.terrain),
    terrainByStage,
    terrainSync: context.terrainSync ? { ...context.terrainSync } : undefined,
    renderer: context.renderer ? { ...context.renderer } : undefined,
  };
}

function cloneTerrainEpoch(terrain: PresentationTerrainEpoch | undefined): PresentationTerrainEpoch | undefined {
  return terrain ? {
    ...terrain,
    lodCounts: { ...terrain.lodCounts },
    edgeMorphMaskCounts: { ...terrain.edgeMorphMaskCounts },
    cameraSample: terrain.cameraSample
      ? { ...terrain.cameraSample }
      : undefined,
  } : undefined;
}

function safeNumber(read: () => number | undefined): number | null {
  try {
    const value = read();
    return Number.isFinite(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

function safeBoolean(read: () => boolean | undefined): boolean | null {
  try {
    const value = read();
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

function hashNumber(hash: number, value: number): number {
  let next = hash ^ (value & 0xff);
  next = Math.imul(next, 16777619);
  next ^= (value >>> 8) & 0xff;
  next = Math.imul(next, 16777619);
  next ^= (value >>> 16) & 0xff;
  next = Math.imul(next, 16777619);
  next ^= (value >>> 24) & 0xff;
  return Math.imul(next, 16777619) >>> 0;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function shortestAngleDegrees(value: number): number {
  let angle = value;
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

function distance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function nowMs(): number {
  return performance.now();
}
