/**
 * Per-frame raycast budget tracker.
 * Prevents worst-case frame spikes by capping expensive terrain raycasts.
 */

const DEFAULT_MAX_RAYCASTS = 8;

let maxRaycasts = DEFAULT_MAX_RAYCASTS;
let raycastsThisFrame = 0;
let budgetExhaustedCount = 0;
let totalBudgetExhaustedFrames = 0;
let totalRequestedRaycasts = 0;
let totalDeniedRaycasts = 0;

/**
 * Reset the budget at the start of each frame.
 * Call this once per frame before any LOS checks.
 */
export function resetRaycastBudget(): void {
  if (raycastsThisFrame >= maxRaycasts) {
    totalBudgetExhaustedFrames++;
  }
  budgetExhaustedCount = 0;
  raycastsThisFrame = 0;
}

/**
 * Try to consume one raycast from the budget.
 * Returns true if the raycast is allowed, false if budget exhausted.
 */
export function tryConsumeRaycast(): boolean {
  totalRequestedRaycasts++;
  if (raycastsThisFrame >= maxRaycasts) {
    budgetExhaustedCount++;
    totalDeniedRaycasts++;
    return false;
  }
  raycastsThisFrame++;
  return true;
}

/**
 * Get profiling stats for the raycast budget system.
 */
export function getRaycastBudgetStats(): {
  maxPerFrame: number;
  usedThisFrame: number;
  deniedThisFrame: number;
  totalExhaustedFrames: number;
  totalRequested: number;
  totalDenied: number;
  saturationRate: number;
  denialRate: number;
} {
  const saturationRate = maxRaycasts > 0 ? raycastsThisFrame / maxRaycasts : 0;
  const denialRate = totalRequestedRaycasts > 0 ? totalDeniedRaycasts / totalRequestedRaycasts : 0;
  return {
    maxPerFrame: maxRaycasts,
    usedThisFrame: raycastsThisFrame,
    deniedThisFrame: budgetExhaustedCount,
    totalExhaustedFrames: totalBudgetExhaustedFrames,
    totalRequested: totalRequestedRaycasts,
    totalDenied: totalDeniedRaycasts,
    saturationRate,
    denialRate,
  };
}
