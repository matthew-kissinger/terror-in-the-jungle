// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type DebugWaterProofSource = 'none' | 'debug_basin' | 'debug_river';

export interface DebugWaterBasin {
  id: string;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  surfaceY: number;
  bedY: number;
}

export interface DebugWaterRiverSegment {
  id: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  halfWidth: number;
  surfaceY: number;
  bedY: number;
  flowMetersPerSecond: number;
}

export interface DebugWaterProofConfig {
  id: string;
  basins?: readonly DebugWaterBasin[];
  rivers?: readonly DebugWaterRiverSegment[];
}

export interface DebugWaterSample {
  source: DebugWaterProofSource;
  featureId: string | null;
  surfaceY: number | null;
  bedY: number | null;
  depth: number;
  coverage01: number;
  flowX: number;
  flowZ: number;
  debugOnly: true;
  authoritative: false;
}

export interface DebugWaterProof {
  id: string;
  debugOnly: true;
  authoritative: false;
  basins: readonly DebugWaterBasin[];
  rivers: readonly DebugWaterRiverSegment[];
}

const DRY_SAMPLE: DebugWaterSample = Object.freeze({
  source: 'none',
  featureId: null,
  surfaceY: null,
  bedY: null,
  depth: 0,
  coverage01: 0,
  flowX: 0,
  flowZ: 0,
  debugOnly: true,
  authoritative: false,
});

export function createDebugWaterProof(config: DebugWaterProofConfig): DebugWaterProof {
  return {
    id: config.id,
    debugOnly: true,
    authoritative: false,
    basins: [...(config.basins ?? [])],
    rivers: [...(config.rivers ?? [])],
  };
}

export function sampleDebugWaterProof(
  proof: DebugWaterProof,
  x: number,
  z: number,
): DebugWaterSample {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return { ...DRY_SAMPLE };
  }

  let best: DebugWaterSample | null = null;
  for (const basin of proof.basins) {
    const sample = sampleBasin(basin, x, z);
    best = chooseDeeperSample(best, sample);
  }
  for (const river of proof.rivers) {
    const sample = sampleRiver(river, x, z);
    best = chooseDeeperSample(best, sample);
  }

  return best ?? { ...DRY_SAMPLE };
}

function sampleBasin(
  basin: DebugWaterBasin,
  x: number,
  z: number,
): DebugWaterSample | null {
  if (basin.radiusX <= 0 || basin.radiusZ <= 0) return null;

  const nx = (x - basin.centerX) / basin.radiusX;
  const nz = (z - basin.centerZ) / basin.radiusZ;
  const radialDistance = Math.sqrt(nx * nx + nz * nz);
  if (radialDistance > 1) return null;

  return {
    source: 'debug_basin',
    featureId: basin.id,
    surfaceY: basin.surfaceY,
    bedY: basin.bedY,
    depth: Math.max(0, basin.surfaceY - basin.bedY),
    coverage01: clamp01(1 - radialDistance),
    flowX: 0,
    flowZ: 0,
    debugOnly: true,
    authoritative: false,
  };
}

function sampleRiver(
  river: DebugWaterRiverSegment,
  x: number,
  z: number,
): DebugWaterSample | null {
  if (river.halfWidth <= 0) return null;

  const dx = river.endX - river.startX;
  const dz = river.endZ - river.startZ;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0) return null;

  const t = clamp01(((x - river.startX) * dx + (z - river.startZ) * dz) / lengthSq);
  const closestX = river.startX + dx * t;
  const closestZ = river.startZ + dz * t;
  const offsetX = x - closestX;
  const offsetZ = z - closestZ;
  const distance = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
  if (distance > river.halfWidth) return null;

  const length = Math.sqrt(lengthSq);
  const flowScale = river.flowMetersPerSecond / length;

  return {
    source: 'debug_river',
    featureId: river.id,
    surfaceY: river.surfaceY,
    bedY: river.bedY,
    depth: Math.max(0, river.surfaceY - river.bedY),
    coverage01: clamp01(1 - distance / river.halfWidth),
    flowX: dx * flowScale,
    flowZ: dz * flowScale,
    debugOnly: true,
    authoritative: false,
  };
}

function chooseDeeperSample(
  current: DebugWaterSample | null,
  next: DebugWaterSample | null,
): DebugWaterSample | null {
  if (next === null) return current;
  if (current === null) return next;
  if (next.depth > current.depth) return next;
  if (next.depth === current.depth && next.coverage01 > current.coverage01) return next;
  return current;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
