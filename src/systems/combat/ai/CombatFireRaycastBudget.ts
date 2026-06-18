// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Per-frame budget for terrain raycasts performed by NPC weapon fire validation.
 * This prevents burst firefights from monopolizing a frame in large battles.
 */

const DEFAULT_MAX_FIRE_RAYCASTS = 16;

export type CombatFireRaycastKind = 'aimed' | 'suppressive';

let maxFireRaycasts = DEFAULT_MAX_FIRE_RAYCASTS;
let fireRaycastsThisFrame = 0;
let deniedThisFrame = 0;
let terrainBlockedThisFrame = 0;
let totalRequested = 0;
let totalDenied = 0;
let totalTerrainBlocked = 0;
let totalExhaustedFrames = 0;
let aimedTotalRequested = 0;
let aimedTotalDenied = 0;
let aimedTotalTerrainBlocked = 0;
let suppressiveTotalRequested = 0;
let suppressiveTotalDenied = 0;
let suppressiveTotalTerrainBlocked = 0;

function normalizeKind(kind: CombatFireRaycastKind | undefined): CombatFireRaycastKind {
  return kind === 'suppressive' ? 'suppressive' : 'aimed';
}

export function resetCombatFireRaycastBudget(): void {
  if (fireRaycastsThisFrame >= maxFireRaycasts) {
    totalExhaustedFrames++;
  }
  fireRaycastsThisFrame = 0;
  deniedThisFrame = 0;
  terrainBlockedThisFrame = 0;
}

export function resetCombatFireRaycastBudgetStats(): void {
  fireRaycastsThisFrame = 0;
  deniedThisFrame = 0;
  terrainBlockedThisFrame = 0;
  totalRequested = 0;
  totalDenied = 0;
  totalTerrainBlocked = 0;
  totalExhaustedFrames = 0;
  aimedTotalRequested = 0;
  aimedTotalDenied = 0;
  aimedTotalTerrainBlocked = 0;
  suppressiveTotalRequested = 0;
  suppressiveTotalDenied = 0;
  suppressiveTotalTerrainBlocked = 0;
}

export function tryConsumeCombatFireRaycast(kind?: CombatFireRaycastKind): boolean {
  const normalizedKind = normalizeKind(kind);
  totalRequested++;
  if (normalizedKind === 'suppressive') {
    suppressiveTotalRequested++;
  } else {
    aimedTotalRequested++;
  }
  if (fireRaycastsThisFrame >= maxFireRaycasts) {
    deniedThisFrame++;
    totalDenied++;
    if (normalizedKind === 'suppressive') {
      suppressiveTotalDenied++;
    } else {
      aimedTotalDenied++;
    }
    return false;
  }
  fireRaycastsThisFrame++;
  return true;
}

export function recordCombatFireTerrainBlocked(kind?: CombatFireRaycastKind): void {
  const normalizedKind = normalizeKind(kind);
  terrainBlockedThisFrame++;
  totalTerrainBlocked++;
  if (normalizedKind === 'suppressive') {
    suppressiveTotalTerrainBlocked++;
  } else {
    aimedTotalTerrainBlocked++;
  }
}

export function setMaxCombatFireRaycastsPerFrame(maxPerFrame: number): void {
  maxFireRaycasts = Math.max(1, Math.floor(maxPerFrame));
}

export function getCombatFireRaycastBudgetStats(): {
  maxPerFrame: number;
  usedThisFrame: number;
  deniedThisFrame: number;
  terrainBlockedThisFrame: number;
  totalExhaustedFrames: number;
  totalRequested: number;
  totalDenied: number;
  totalTerrainBlocked: number;
  aimedTotalRequested: number;
  aimedTotalDenied: number;
  aimedTotalTerrainBlocked: number;
  aimedDenialRate: number;
  aimedTerrainBlockRate: number;
  suppressiveTotalRequested: number;
  suppressiveTotalDenied: number;
  suppressiveTotalTerrainBlocked: number;
  suppressiveDenialRate: number;
  suppressiveTerrainBlockRate: number;
  saturationRate: number;
  denialRate: number;
  terrainBlockRate: number;
} {
  const saturationRate = maxFireRaycasts > 0 ? fireRaycastsThisFrame / maxFireRaycasts : 0;
  const denialRate = totalRequested > 0 ? totalDenied / totalRequested : 0;
  const terrainBlockRate = totalRequested > 0 ? totalTerrainBlocked / totalRequested : 0;
  const aimedDenialRate = aimedTotalRequested > 0 ? aimedTotalDenied / aimedTotalRequested : 0;
  const aimedTerrainBlockRate = aimedTotalRequested > 0 ? aimedTotalTerrainBlocked / aimedTotalRequested : 0;
  const suppressiveDenialRate = suppressiveTotalRequested > 0
    ? suppressiveTotalDenied / suppressiveTotalRequested
    : 0;
  const suppressiveTerrainBlockRate = suppressiveTotalRequested > 0
    ? suppressiveTotalTerrainBlocked / suppressiveTotalRequested
    : 0;
  return {
    maxPerFrame: maxFireRaycasts,
    usedThisFrame: fireRaycastsThisFrame,
    deniedThisFrame,
    terrainBlockedThisFrame,
    totalExhaustedFrames,
    totalRequested,
    totalDenied,
    totalTerrainBlocked,
    aimedTotalRequested,
    aimedTotalDenied,
    aimedTotalTerrainBlocked,
    aimedDenialRate,
    aimedTerrainBlockRate,
    suppressiveTotalRequested,
    suppressiveTotalDenied,
    suppressiveTotalTerrainBlocked,
    suppressiveDenialRate,
    suppressiveTerrainBlockRate,
    saturationRate,
    denialRate,
    terrainBlockRate
  };
}
