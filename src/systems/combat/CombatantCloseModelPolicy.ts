// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { PixelForgeNpcClipId } from '../../config/pixelForgeAssets';
import {
  getPixelForgeNpcCloseModelDistanceMeters,
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
  type PixelForgeNpcPoolKey,
} from './PixelForgeNpcRuntime';
import type { Combatant, CombatantState, Faction } from './types';

export const CLOSE_MODEL_PROMOTION_BUDGET_PER_FRAME = 2;

export type CloseModelFallbackReason = 'perf-isolation' | 'pool-loading' | 'pool-empty' | 'promotion-budget' | 'total-cap';
export type CombatantMaterializationRenderMode = 'close-glb' | 'impostor' | 'culled';
export type CombatantMaterializationReason = string;

export interface CloseModelCandidate {
  combatant: Combatant;
  distanceSq: number;
  poolKey: PixelForgeNpcPoolKey;
  isOnScreen: boolean;
  recentlyVisible: boolean;
  isPlayerSquad: boolean;
  isInHardNearReserveBubble: boolean;
  isInActiveCombat: boolean;
  priorityScore: number;
}

export function compareCloseModelCandidates(a: CloseModelCandidate, b: CloseModelCandidate): number {
  return b.priorityScore - a.priorityScore
    || a.distanceSq - b.distanceSq
    || a.combatant.id.localeCompare(b.combatant.id);
}

export function selectPreferredCloseModelCandidates(
  candidates: CloseModelCandidate[],
  limit: number,
  target: CloseModelCandidate[] = [],
): CloseModelCandidate[] {
  const boundedLimit = Math.max(0, Math.floor(limit));
  target.length = 0;
  if (boundedLimit === 0 || candidates.length === 0) return target;
  if (candidates.length <= boundedLimit) {
    for (const candidate of candidates) {
      target.push(candidate);
    }
    target.sort(compareCloseModelCandidates);
    return target;
  }

  for (const candidate of candidates) {
    let insertAt = target.length;
    while (
      insertAt > 0
      && compareCloseModelCandidates(candidate, target[insertAt - 1]) < 0
    ) {
      insertAt--;
    }
    if (insertAt >= boundedLimit && target.length >= boundedLimit) continue;

    const nextLength = Math.min(target.length + 1, boundedLimit);
    for (let i = nextLength - 1; i > insertAt; i--) {
      target[i] = target[i - 1];
    }
    target[insertAt] = candidate;
    target.length = nextLength;
  }
  return target;
}

export interface CloseModelFallbackRecord {
  combatantId: string;
  poolKey: PixelForgeNpcPoolKey;
  distanceMeters: number;
  reason: CloseModelFallbackReason;
}

export interface CloseModelRuntimeStats {
  closeRadiusMeters: number;
  closeModelActiveCap: number;
  promotionBudgetPerFrame: number;
  promotionsThisFrame: number;
  replacementsThisFrame: number;
  candidatesWithinCloseRadius: number;
  renderedCloseModels: number;
  activeCloseModels: number;
  fallbackCount: number;
  fallbackCounts: Record<CloseModelFallbackReason, number>;
  nearestFallbackDistanceMeters: number | null;
  farthestFallbackDistanceMeters: number | null;
  poolLoads: number;
  poolTargets: Record<string, number>;
  poolAvailable: Record<string, number>;
  transitionWindow: CloseModelTransitionWindow;
}

export interface CloseModelTransitionWindow {
  total: number;
  firstObservation: number;
  toCloseGlb: number;
  toImpostor: number;
  toCulled: number;
  fromCloseGlb: number;
  byTransition: Record<string, number>;
  byReason: Record<string, number>;
}

export interface CombatantMaterializationRow {
  combatantId: string;
  faction: Faction;
  state: CombatantState;
  simLane: Combatant['simLane'];
  distanceMeters: number;
  position: { x: number; y: number; z: number };
  renderMode: CombatantMaterializationRenderMode;
  clipId: PixelForgeNpcClipId;
  poolKey: PixelForgeNpcPoolKey;
  isPlayerSquad: boolean;
  billboardIndex: number | null;
  hasCloseModelWeapon: boolean;
  closeFallbackReason: CloseModelFallbackReason | null;
  reason: CombatantMaterializationReason;
  inActiveCombat: boolean;
}

export interface CloseModelPrewarmOptions {
  maxActive?: number;
  primeFactionAssets?: boolean;
  seedFullFactionPools?: boolean;
}

export interface CloseModelPrewarmSummary {
  skippedReason: 'none' | 'perf-isolation' | 'no-candidates';
  candidatesWithinCloseRadius: number;
  requestedPoolTargets: Record<string, number>;
  primedAssetPaths: number;
  renderedCloseModels: number;
  fallbackCount: number;
  fallbackCounts: Record<CloseModelFallbackReason, number>;
  poolLoads: number;
  durationMs: number;
}

export interface BillboardUpdateProfile {
  walkFrameMs: number;
  closeModelMs: number;
  bucketResetMs: number;
  impostorWriteMs: number;
  finalizeMs: number;
  hitboxDebugMs: number;
  materializationEventsMs: number;
  shaderUniformMs: number;
}

export function createEmptyBillboardUpdateProfile(): BillboardUpdateProfile {
  return {
    walkFrameMs: 0,
    closeModelMs: 0,
    bucketResetMs: 0,
    impostorWriteMs: 0,
    finalizeMs: 0,
    hitboxDebugMs: 0,
    materializationEventsMs: 0,
    shaderUniformMs: 0,
  };
}

export function createCloseModelFallbackCounts(): Record<CloseModelFallbackReason, number> {
  return {
    'perf-isolation': 0,
    'pool-loading': 0,
    'pool-empty': 0,
    'promotion-budget': 0,
    'total-cap': 0,
  };
}

export function createEmptyCloseModelTransitionWindow(): CloseModelTransitionWindow {
  return {
    total: 0,
    firstObservation: 0,
    toCloseGlb: 0,
    toImpostor: 0,
    toCulled: 0,
    fromCloseGlb: 0,
    byTransition: {},
    byReason: {},
  };
}

export function cloneCloseModelTransitionWindow(window: CloseModelTransitionWindow): CloseModelTransitionWindow {
  return {
    ...window,
    byTransition: { ...window.byTransition },
    byReason: { ...window.byReason },
  };
}

export function recordCloseModelTransitionWindow(
  window: CloseModelTransitionWindow,
  fromRender: CombatantMaterializationRenderMode | null,
  toRender: CombatantMaterializationRenderMode,
  reason: string,
): void {
  const transition = `${fromRender ?? 'null'}->${toRender}`;
  window.total++;
  if (fromRender === null) window.firstObservation++;
  if (fromRender === 'close-glb' && toRender !== 'close-glb') window.fromCloseGlb++;
  if (toRender === 'close-glb') window.toCloseGlb++;
  if (toRender === 'impostor') window.toImpostor++;
  if (toRender === 'culled') window.toCulled++;
  window.byTransition[transition] = (window.byTransition[transition] ?? 0) + 1;
  window.byReason[reason] = (window.byReason[reason] ?? 0) + 1;
}

export function createEmptyCloseModelRuntimeStats(): CloseModelRuntimeStats {
  return {
    closeRadiusMeters: getPixelForgeNpcCloseModelDistanceMeters(),
    closeModelActiveCap: PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
    promotionBudgetPerFrame: CLOSE_MODEL_PROMOTION_BUDGET_PER_FRAME,
    promotionsThisFrame: 0,
    replacementsThisFrame: 0,
    candidatesWithinCloseRadius: 0,
    renderedCloseModels: 0,
    activeCloseModels: 0,
    fallbackCount: 0,
    fallbackCounts: createCloseModelFallbackCounts(),
    nearestFallbackDistanceMeters: null,
    farthestFallbackDistanceMeters: null,
    poolLoads: 0,
    poolTargets: {},
    poolAvailable: {},
    transitionWindow: createEmptyCloseModelTransitionWindow(),
  };
}
