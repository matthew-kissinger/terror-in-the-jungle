// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { Combatant } from './types';

export type CombatantSimLane = Combatant['simLane'];

export interface SimLaneTransitionStats {
  total: number;
  towardHigherFidelity: number;
  towardLowerFidelity: number;
  toHigh: number;
  toMedium: number;
  toLow: number;
  toCulled: number;
  fromHigh: number;
  fromMedium: number;
  fromLow: number;
  fromCulled: number;
  byTransition: Record<string, number>;
  maxRenderedLagMeters: number;
  maxRenderedHorizontalLagMeters: number;
  maxRenderedVerticalLagMeters: number;
  maxTransitionRenderedLagMeters: number;
  sampledRenderedLagCount: number;
}

export interface CombatantFrameSchedulingStats {
  frameCounter: number;
  intervalScale: number;
  aiBudgetMs: number;
  staggeredSkips: number;
  highFullUpdates: number;
  mediumFullUpdates: number;
  projectedHighFullUpdateDeferrals: number;
  highFullUpdateCostEmaMs: number;
  highFullUpdateCostPeakMs: number;
  maxHighFullUpdatesPerFrame: number;
  maxMediumFullUpdatesPerFrame: number;
  aiBudgetExceededEvents: number;
  aiSevereOverBudgetEvents: number;
  simLaneTransitions: SimLaneTransitionStats;
}

const SIM_LANE_FIDELITY_RANK: Record<CombatantSimLane, number> = {
  high: 3,
  medium: 2,
  low: 1,
  culled: 0,
};

export function createEmptySimLaneTransitionStats(): SimLaneTransitionStats {
  return {
    total: 0,
    towardHigherFidelity: 0,
    towardLowerFidelity: 0,
    toHigh: 0,
    toMedium: 0,
    toLow: 0,
    toCulled: 0,
    fromHigh: 0,
    fromMedium: 0,
    fromLow: 0,
    fromCulled: 0,
    byTransition: {},
    maxRenderedLagMeters: 0,
    maxRenderedHorizontalLagMeters: 0,
    maxRenderedVerticalLagMeters: 0,
    maxTransitionRenderedLagMeters: 0,
    sampledRenderedLagCount: 0,
  };
}

export function cloneSimLaneTransitionStats(stats: SimLaneTransitionStats): SimLaneTransitionStats {
  return {
    ...stats,
    byTransition: { ...stats.byTransition },
  };
}

export function recordSimLaneTransition(
  stats: SimLaneTransitionStats,
  previousLane: CombatantSimLane,
  nextLane: CombatantSimLane,
): void {
  const transition = `${previousLane}->${nextLane}`;
  stats.total++;
  stats.byTransition[transition] = (stats.byTransition[transition] ?? 0) + 1;
  if (SIM_LANE_FIDELITY_RANK[nextLane] > SIM_LANE_FIDELITY_RANK[previousLane]) {
    stats.towardHigherFidelity++;
  } else {
    stats.towardLowerFidelity++;
  }
  incrementLaneCounter(stats, previousLane, 'from');
  incrementLaneCounter(stats, nextLane, 'to');
}

export function recordSimLaneRenderedLag(
  stats: SimLaneTransitionStats,
  combatant: Combatant,
  transitionChanged: boolean,
): void {
  const rendered = combatant.renderedPosition;
  if (!rendered) return;

  const dx = combatant.position.x - rendered.x;
  const dy = combatant.position.y - rendered.y;
  const dz = combatant.position.z - rendered.z;
  const horizontalLag = Math.hypot(dx, dz);
  const verticalLag = Math.abs(dy);
  const totalLag = Math.hypot(horizontalLag, verticalLag);
  if (!Number.isFinite(totalLag)) return;

  stats.sampledRenderedLagCount++;
  stats.maxRenderedLagMeters = Math.max(stats.maxRenderedLagMeters, totalLag);
  stats.maxRenderedHorizontalLagMeters = Math.max(stats.maxRenderedHorizontalLagMeters, horizontalLag);
  stats.maxRenderedVerticalLagMeters = Math.max(stats.maxRenderedVerticalLagMeters, verticalLag);
  if (transitionChanged) {
    stats.maxTransitionRenderedLagMeters = Math.max(stats.maxTransitionRenderedLagMeters, totalLag);
  }
}

export function setCombatantSimLane(
  stats: SimLaneTransitionStats,
  combatant: Combatant,
  nextLane: CombatantSimLane,
): void {
  const previousLane = combatant.simLane;
  const transitionChanged = previousLane !== nextLane;
  recordSimLaneRenderedLag(stats, combatant, transitionChanged);
  if (transitionChanged) {
    recordSimLaneTransition(stats, previousLane, nextLane);
  }
  combatant.simLane = nextLane;
}

function incrementLaneCounter(
  stats: SimLaneTransitionStats,
  lane: CombatantSimLane,
  direction: 'from' | 'to',
): void {
  if (direction === 'from') {
    switch (lane) {
      case 'high':
        stats.fromHigh++;
        break;
      case 'medium':
        stats.fromMedium++;
        break;
      case 'low':
        stats.fromLow++;
        break;
      case 'culled':
        stats.fromCulled++;
        break;
    }
    return;
  }

  switch (lane) {
    case 'high':
      stats.toHigh++;
      break;
    case 'medium':
      stats.toMedium++;
      break;
    case 'low':
      stats.toLow++;
      break;
    case 'culled':
      stats.toCulled++;
      break;
  }
}
