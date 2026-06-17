// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function aliasesForStage(stage: 'after-simulation' | 'before-render'): string[] {
  return stage === 'after-simulation'
    ? ['after-simulation', 'afterSimulation']
    : ['before-render', 'beforeRender'];
}

export function terrainStageRecord(
  terrainByStage: unknown,
  stage: 'after-simulation' | 'before-render',
): Record<string, unknown> | null {
  const record = objectOrNull(terrainByStage);
  if (!record) return null;
  for (const key of aliasesForStage(stage)) {
    const stageRecord = objectOrNull(record[key]);
    if (stageRecord) return stageRecord;
  }
  return null;
}

export function terrainStageBufferVisibleChanged(terrainByStage: unknown): boolean {
  const afterSimulation = terrainStageRecord(terrainByStage, 'after-simulation');
  const beforeRender = terrainStageRecord(terrainByStage, 'before-render');
  if (!afterSimulation || !beforeRender) return false;

  const afterIdentityHash = stringOrNull(afterSimulation.tileIdentityHash);
  const beforeIdentityHash = stringOrNull(beforeRender.tileIdentityHash);
  if (
    afterIdentityHash !== null
    && beforeIdentityHash !== null
    && afterIdentityHash !== beforeIdentityHash
  ) {
    return true;
  }

  const afterEdgeMaskHash = stringOrNull(afterSimulation.edgeMaskHash);
  const beforeEdgeMaskHash = stringOrNull(beforeRender.edgeMaskHash);
  if (
    afterEdgeMaskHash !== null
    && beforeEdgeMaskHash !== null
    && afterEdgeMaskHash !== beforeEdgeMaskHash
  ) {
    return true;
  }

  const afterTileCount = numberOrNull(afterSimulation.tileCount);
  const beforeTileCount = numberOrNull(beforeRender.tileCount);
  return afterTileCount !== null
    && beforeTileCount !== null
    && afterTileCount !== beforeTileCount;
}
