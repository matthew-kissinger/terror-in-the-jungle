/**
 * Per-frame raycast budget tracker.
 * Prevents worst-case frame spikes by capping expensive terrain raycasts.
 */

const DEFAULT_MAX_RAYCASTS = 8;

let maxRaycasts = DEFAULT_MAX_RAYCASTS;
let raycastsThisFrame = 0;
let budgetExhaustedCount = 0;
let totalBudgetExhaustedFrames = 0;

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
  if (raycastsThisFrame >= maxRaycasts) {
    budgetExhaustedCount++;
    return false;
  }
  raycastsThisFrame++;
  return true;
}

/**
 * Get the number of raycasts used this frame.
 */
export function getRaycastsUsedThisFrame(): number {
  return raycastsThisFrame;
}

/**
 * Get how many times the budget was exhausted this frame
 * (i.e., how many raycasts were denied).
 */
export function getBudgetExhaustedCount(): number {
  return budgetExhaustedCount;
}

/**
 * Get the total number of frames where budget was fully exhausted.
 */
export function getTotalBudgetExhaustedFrames(): number {
  return totalBudgetExhaustedFrames;
}

/**
 * Set the maximum raycasts allowed per frame.
 */
export function setMaxRaycastsPerFrame(max: number): void {
  maxRaycasts = max;
}

/**
 * Get the current max raycasts per frame setting.
 */
export function getMaxRaycastsPerFrame(): number {
  return maxRaycasts;
}

/**
 * Get profiling stats for the raycast budget system.
 */
export function getRaycastBudgetStats(): {
  maxPerFrame: number;
  usedThisFrame: number;
  deniedThisFrame: number;
  totalExhaustedFrames: number;
} {
  return {
    maxPerFrame: maxRaycasts,
    usedThisFrame: raycastsThisFrame,
    deniedThisFrame: budgetExhaustedCount,
    totalExhaustedFrames: totalBudgetExhaustedFrames,
  };
}
