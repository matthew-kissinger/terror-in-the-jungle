/**
 * Per-frame budget for terrain raycasts performed by NPC weapon fire validation.
 * This prevents burst firefights from monopolizing a frame in large battles.
 */

const DEFAULT_MAX_FIRE_RAYCASTS = 16;

let maxFireRaycasts = DEFAULT_MAX_FIRE_RAYCASTS;
let fireRaycastsThisFrame = 0;
let deniedThisFrame = 0;
let totalRequested = 0;
let totalDenied = 0;
let totalExhaustedFrames = 0;

export function resetCombatFireRaycastBudget(): void {
  if (fireRaycastsThisFrame >= maxFireRaycasts) {
    totalExhaustedFrames++;
  }
  fireRaycastsThisFrame = 0;
  deniedThisFrame = 0;
}

export function tryConsumeCombatFireRaycast(): boolean {
  totalRequested++;
  if (fireRaycastsThisFrame >= maxFireRaycasts) {
    deniedThisFrame++;
    totalDenied++;
    return false;
  }
  fireRaycastsThisFrame++;
  return true;
}

export function setMaxCombatFireRaycastsPerFrame(maxPerFrame: number): void {
  maxFireRaycasts = Math.max(1, Math.floor(maxPerFrame));
}

export function getCombatFireRaycastBudgetStats(): {
  maxPerFrame: number;
  usedThisFrame: number;
  deniedThisFrame: number;
  totalExhaustedFrames: number;
  totalRequested: number;
  totalDenied: number;
  saturationRate: number;
  denialRate: number;
} {
  const saturationRate = maxFireRaycasts > 0 ? fireRaycastsThisFrame / maxFireRaycasts : 0;
  const denialRate = totalRequested > 0 ? totalDenied / totalRequested : 0;
  return {
    maxPerFrame: maxFireRaycasts,
    usedThisFrame: fireRaycastsThisFrame,
    deniedThisFrame,
    totalExhaustedFrames,
    totalRequested,
    totalDenied,
    saturationRate,
    denialRate
  };
}
