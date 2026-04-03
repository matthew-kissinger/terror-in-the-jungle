/**
 * Per-frame cover search budget tracker.
 * Prevents worst-case frame spikes by capping expensive cover finding operations.
 */

const DEFAULT_MAX_COVER_SEARCHES = 6;

let maxCoverSearches = DEFAULT_MAX_COVER_SEARCHES;
let searchesThisFrame = 0;
let deniedThisFrame = 0;
let totalBudgetExhaustedFrames = 0;
let totalRequestedSearches = 0;
let totalDeniedSearches = 0;

/**
 * Reset the budget at the start of each frame.
 * Call this once per frame before any cover searches.
 */
export function resetCoverSearchBudget(): void {
  if (searchesThisFrame >= maxCoverSearches) {
    totalBudgetExhaustedFrames++;
  }
  deniedThisFrame = 0;
  searchesThisFrame = 0;
}

/**
 * Try to consume one cover search from the budget.
 * Returns true if the search is allowed, false if budget exhausted.
 */
export function tryConsumeCoverSearch(): boolean {
  totalRequestedSearches++;
  if (searchesThisFrame >= maxCoverSearches) {
    deniedThisFrame++;
    totalDeniedSearches++;
    return false;
  }
  searchesThisFrame++;
  return true;
}

/**
 * Get profiling stats for the cover search budget system.
 */
export function getCoverSearchBudgetStats(): {
  maxPerFrame: number;
  usedThisFrame: number;
  deniedThisFrame: number;
  totalExhaustedFrames: number;
  totalRequested: number;
  totalDenied: number;
  saturationRate: number;
  denialRate: number;
} {
  const saturationRate = maxCoverSearches > 0 ? searchesThisFrame / maxCoverSearches : 0;
  const denialRate = totalRequestedSearches > 0 ? totalDeniedSearches / totalRequestedSearches : 0;
  return {
    maxPerFrame: maxCoverSearches,
    usedThisFrame: searchesThisFrame,
    deniedThisFrame,
    totalExhaustedFrames: totalBudgetExhaustedFrames,
    totalRequested: totalRequestedSearches,
    totalDenied: totalDeniedSearches,
    saturationRate,
    denialRate,
  };
}
