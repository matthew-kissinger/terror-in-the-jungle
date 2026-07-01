// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Combatant, CombatantState } from './types';
import { spatialGridManager } from './SpatialGridManager';
import type { CloseEngagementTelemetry } from './ai/AIStateEngage';
import type { TargetAcquisitionTelemetry } from './ai/AITargetAcquisition';
import type { TargetDistributionTelemetry } from './ClusterManager';
import type { AiUpdateBreakdown, LosCallsiteTelemetry } from './CombatantAI';
import type { BillboardUpdateProfile } from './CombatantCloseModelPolicy';

interface CombatLineOfSightTelemetry {
  hits: number;
  misses: number;
  hitRate: number;
  budgetDenials: number;
  prefilterPasses: number;
  prefilterRejects: number;
  fullEvaluations: number;
  terrainRaycasts: number;
  fullEvaluationClear: number;
  fullEvaluationBlocked: number;
}

interface CloseEngagementProfile {
  engagement: CloseEngagementTelemetry;
  targetAcquisition: TargetAcquisitionTelemetry;
  targetDistribution: TargetDistributionTelemetry;
  lineOfSight: CombatLineOfSightTelemetry;
  losCallsites: LosCallsiteTelemetry;
}

const emptyCloseEngagementProfile = (): CloseEngagementProfile => ({
  engagement: {
    closeRangeFullAutoActivations: 0,
    nearbyEnemyBurstTriggers: 0,
    suppressionTransitions: 0,
    nearbyEnemyCountSamples: 0,
    nearbyEnemyCountTotal: 0,
    nearbyEnemyCountMax: 0,
    suppressionFlankDestinationComputations: 0,
    suppressionFlankCoverSearches: 0,
    suppressionFlankCoverSearchReuseSkips: 0,
    suppressionFlankCoverSearchCapSkips: 0,
    suppressionFlankCoverGridHits: 0,
    suppressionFlankCoverGridMisses: 0,
    targetDistanceBuckets: {
      lt5m: 0,
      m5to10: 0,
      m10to15: 0,
      m15to30: 0,
      gte30: 0
    }
  },
  targetAcquisition: {
    findNearestEnemyCalls: 0,
    potentialTargetsTotal: 0,
    playerTargetCandidates: 0,
    clusterDistributionCalls: 0,
    clusterDistributionPotentialTargets: 0,
    noTargetSelections: 0,
    singleTargetSelections: 0,
    nearestTargetSelections: 0,
    nearbyEnemyCountCalls: 0,
    nearbyEnemyCountTotal: 0,
    nearbyEnemyCountMax: 0,
    clusterDensityCalls: 0,
    clusterDensityTotal: 0,
    spatialQueryCacheHits: 0,
    spatialQueryCacheMisses: 0
  },
  targetDistribution: {
    distributionCalls: 0,
    zeroTargetCalls: 0,
    singleTargetCalls: 0,
    multiTargetCalls: 0,
    potentialTargetsTotal: 0,
    targetCountRebuilds: 0,
    assignments: 0,
    assignmentChurn: 0,
    targeterCountSamples: 0,
    targeterCountTotal: 0,
    targeterCountMax: 0
  },
  lineOfSight: {
    hits: 0,
    misses: 0,
    hitRate: 0,
    budgetDenials: 0,
    prefilterPasses: 0,
    prefilterRejects: 0,
    fullEvaluations: 0,
    terrainRaycasts: 0,
    fullEvaluationClear: 0,
    fullEvaluationBlocked: 0
  },
  losCallsites: {
    patrolDetection: { calls: 0, visible: 0, blocked: 0 },
    alertConfirmation: { calls: 0, visible: 0, blocked: 0 },
    engageSuppressionCheck: { calls: 0, visible: 0, blocked: 0 },
    advancingDetection: { calls: 0, visible: 0, blocked: 0 },
    seekingCoverValidation: { calls: 0, visible: 0, blocked: 0 },
    defendDetection: { calls: 0, visible: 0, blocked: 0 }
  }
});

const emptyBillboardUpdateProfile = (): BillboardUpdateProfile => ({
  walkFrameMs: 0,
  closeModelMs: 0,
  bucketResetMs: 0,
  impostorWriteMs: 0,
  finalizeMs: 0,
  hitboxDebugMs: 0,
  materializationEventsMs: 0,
  shaderUniformMs: 0
});

/**
 * Manages profiling and telemetry for the combat system
 */
export class CombatantProfiler {
  private combatants: Map<string, Combatant>;
  private lodHighCount = 0;
  private lodMediumCount = 0;
  private lodLowCount = 0;
  private lodCulledCount = 0;
  private updateLastMs = 0;
  private updateEmaMs = 0;
  private readonly UPDATE_EMA_ALPHA = 0.1;

  // Detailed profiling for combat bottleneck analysis
  profiling = {
    aiUpdateMs: 0,
    aiStateMs: {} as Record<string, number>,
    aiMethodMs: {} as Record<string, number>,
    aiMethodCounts: {} as Record<string, number>,
    aiMethodTotalCounts: {} as Record<string, number>,
    aiSlowestUpdate: null as AiUpdateBreakdown | null,
    spatialSyncMs: 0,
    billboardUpdateMs: 0,
    billboardProfile: emptyBillboardUpdateProfile(),
    effectPoolsMs: 0,
    influenceMapMs: 0,
    totalMs: 0,
    engagingCount: 0,
    firingCount: 0,
    losCache: {
      hits: 0,
      misses: 0,
      hitRate: 0,
      budgetDenials: 0,
      prefilterPasses: 0,
      prefilterRejects: 0,
      fullEvaluations: 0,
      terrainRaycasts: 0,
      fullEvaluationClear: 0,
      fullEvaluationBlocked: 0
    },
    raycastBudget: {
      maxPerFrame: 0,
      usedThisFrame: 0,
      deniedThisFrame: 0,
      totalExhaustedFrames: 0,
      totalRequested: 0,
      totalDenied: 0,
      saturationRate: 0,
      denialRate: 0
    },
    combatFireRaycastBudget: {
      maxPerFrame: 0,
      usedThisFrame: 0,
      deniedThisFrame: 0,
      terrainBlockedThisFrame: 0,
      totalExhaustedFrames: 0,
      totalRequested: 0,
      totalDenied: 0,
      totalTerrainBlocked: 0,
      aimedTotalRequested: 0,
      aimedTotalDenied: 0,
      aimedTotalTerrainBlocked: 0,
      aimedDenialRate: 0,
      aimedTerrainBlockRate: 0,
      suppressiveTotalRequested: 0,
      suppressiveTotalDenied: 0,
      suppressiveTotalTerrainBlocked: 0,
      suppressiveDenialRate: 0,
      suppressiveTerrainBlockRate: 0,
      saturationRate: 0,
      denialRate: 0,
      terrainBlockRate: 0
    },
    aiScheduling: {
      frameCounter: 0,
      intervalScale: 1,
      aiBudgetMs: 0,
      staggeredSkips: 0,
      highFullUpdates: 0,
      mediumFullUpdates: 0,
      projectedHighFullUpdateDeferrals: 0,
      highFullUpdateCostEmaMs: 0,
      highFullUpdateCostPeakMs: 0,
      maxHighFullUpdatesPerFrame: 0,
      maxMediumFullUpdatesPerFrame: 0,
      aiBudgetExceededEvents: 0,
      aiSevereOverBudgetEvents: 0,
      simLaneTransitions: {
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
        byTransition: {} as Record<string, number>,
        maxRenderedLagMeters: 0,
        maxRenderedHorizontalLagMeters: 0,
        maxRenderedVerticalLagMeters: 0,
        maxTransitionRenderedLagMeters: 0,
        sampledRenderedLagCount: 0
      }
    },
    closeEngagement: emptyCloseEngagementProfile()
  };

  constructor(
    combatants: Map<string, Combatant>
  ) {
    this.combatants = combatants;
  }

  /**
   * Update LOD counts from LOD manager
   */
  setLODCounts(high: number, medium: number, low: number, culled: number): void {
    this.lodHighCount = high;
    this.lodMediumCount = medium;
    this.lodLowCount = low;
    this.lodCulledCount = culled;
  }

  /**
   * Update timing metrics
   */
  updateTiming(duration: number): void {
    this.updateLastMs = duration;
    this.updateEmaMs = this.updateEmaMs * (1 - this.UPDATE_EMA_ALPHA) + duration * this.UPDATE_EMA_ALPHA;
  }

  /**
   * Count engaging and firing combatants
   */
  updateEngagementCounts(): void {
    this.profiling.engagingCount = 0;
    this.profiling.firingCount = 0;
    this.combatants.forEach(c => {
      if (c.state === CombatantState.ENGAGING || c.state === CombatantState.SUPPRESSING) {
        this.profiling.engagingCount++;
      }
    });
  }

  /**
   * Get detailed combat profiling info for debugging performance
   */
  getCombatProfile(): {
    timing: {
      aiUpdateMs: number;
      aiStateMs: Record<string, number>;
      aiMethodMs: Record<string, number>;
      aiMethodCounts: Record<string, number>;
      aiMethodTotalCounts: Record<string, number>;
      aiSlowestUpdate: AiUpdateBreakdown | null;
      spatialSyncMs: number;
      billboardUpdateMs: number;
      billboardProfile: BillboardUpdateProfile;
      effectPoolsMs: number;
      influenceMapMs: number;
      totalMs: number;
      engagingCount: number;
      firingCount: number;
      losCache: {
        hits: number;
        misses: number;
        hitRate: number;
        budgetDenials: number;
        prefilterPasses: number;
        prefilterRejects: number;
        fullEvaluations: number;
        terrainRaycasts: number;
        fullEvaluationClear: number;
        fullEvaluationBlocked: number;
      };
      raycastBudget: {
        maxPerFrame: number;
        usedThisFrame: number;
        deniedThisFrame: number;
        totalExhaustedFrames: number;
        totalRequested: number;
        totalDenied: number;
        saturationRate: number;
        denialRate: number;
      };
      combatFireRaycastBudget: {
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
      };
      aiScheduling: {
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
        simLaneTransitions: {
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
        };
      };
      closeEngagement: CloseEngagementProfile;
    };
    counts: { total: number; high: number; medium: number; low: number; culled: number };
    lod: { engaging: number; firing: number };
  } {
    return {
      timing: { ...this.profiling },
      counts: {
        total: this.combatants.size,
        high: this.lodHighCount,
        medium: this.lodMediumCount,
        low: this.lodLowCount,
        culled: this.lodCulledCount
      },
      lod: {
        engaging: this.profiling.engagingCount,
        firing: this.profiling.firingCount
      }
    };
  }

  /**
   * Get telemetry for performance overlay
   */
  getTelemetry(): {
    lastMs: number;
    emaMs: number;
    lodHigh: number;
    lodMedium: number;
    lodLow: number;
    lodCulled: number;
    combatantCount: number;
    octree: {
      nodes: number;
      maxDepth: number;
      avgEntitiesPerLeaf: number;
    };
  } {
    const octreeStats = spatialGridManager.getOctreeStats() ?? { totalNodes: 0, maxDepth: 0, avgEntitiesPerLeaf: 0 };
    return {
      lastMs: this.updateLastMs,
      emaMs: this.updateEmaMs,
      lodHigh: this.lodHighCount,
      lodMedium: this.lodMediumCount,
      lodLow: this.lodLowCount,
      lodCulled: this.lodCulledCount,
      combatantCount: this.combatants.size,
      octree: {
        nodes: octreeStats.totalNodes,
        maxDepth: octreeStats.maxDepth,
        avgEntitiesPerLeaf: Math.round(octreeStats.avgEntitiesPerLeaf * 10) / 10
      }
    };
  }
}
