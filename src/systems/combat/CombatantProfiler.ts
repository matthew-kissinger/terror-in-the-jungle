import { Combatant, CombatantState } from './types';
import { SpatialOctree } from './SpatialOctree';

/**
 * Manages profiling and telemetry for the combat system
 */
export class CombatantProfiler {
  private combatants: Map<string, Combatant>;
  private spatialGrid: SpatialOctree;
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
    spatialSyncMs: 0,
    billboardUpdateMs: 0,
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
      prefilterRejects: 0
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
      totalExhaustedFrames: 0,
      totalRequested: 0,
      totalDenied: 0,
      saturationRate: 0,
      denialRate: 0
    },
    aiScheduling: {
      frameCounter: 0,
      intervalScale: 1,
      aiBudgetMs: 0,
      staggeredSkips: 0,
      highFullUpdates: 0,
      mediumFullUpdates: 0,
      maxHighFullUpdatesPerFrame: 0,
      maxMediumFullUpdatesPerFrame: 0,
      aiBudgetExceededEvents: 0,
      aiSevereOverBudgetEvents: 0
    }
  };

  constructor(
    combatants: Map<string, Combatant>,
    spatialGrid: SpatialOctree
  ) {
    this.combatants = combatants;
    this.spatialGrid = spatialGrid;
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
      spatialSyncMs: number;
      billboardUpdateMs: number;
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
        totalExhaustedFrames: number;
        totalRequested: number;
        totalDenied: number;
        saturationRate: number;
        denialRate: number;
      };
      aiScheduling: {
        frameCounter: number;
        intervalScale: number;
        aiBudgetMs: number;
        staggeredSkips: number;
        highFullUpdates: number;
        mediumFullUpdates: number;
        maxHighFullUpdatesPerFrame: number;
        maxMediumFullUpdatesPerFrame: number;
        aiBudgetExceededEvents: number;
        aiSevereOverBudgetEvents: number;
      };
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
    const octreeStats = this.spatialGrid.getStats();
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
