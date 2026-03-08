/**
 * Pure-function slope physics utilities.
 *
 * Shared between PlayerMovement and CombatantMovement to enforce
 * consistent slope behavior. No class, no state.
 */

/** Slope value (1 - normal.y) above which movement is fully blocked (~60 deg). */
export const MAX_WALKABLE_SLOPE = 0.5;

/** Slope value where gentle->crawl transition begins (~45 deg). */
export const CRAWL_SLOPE_THRESHOLD = 0.3;

/** Maximum vertical step the player can climb in one frame (meters). */
export const MAX_STEP_HEIGHT = 0.5;

/** Downhill slide speed when on an unwalkable slope (m/s). */
export const SLOPE_SLIDE_STRENGTH = 8.0;

/**
 * Compute a speed multiplier [0, 1] based on terrain slope.
 *
 * @param slopeValue  Value from HeightQueryCache.getSlopeAt() (0 = flat, 1 = vertical).
 * @returns Speed multiplier: 1.0 on flat, reduced on slopes, 0 when blocked.
 */
export function computeSlopeSpeedMultiplier(slopeValue: number): number {
  const slopeDot = 1 - slopeValue; // dot(normal, UP)
  if (slopeDot >= 0.7) {
    // Gentle slope (0-45 deg): linear penalty
    return slopeDot;
  }
  if (slopeDot >= 0.5) {
    // Crawl zone (45-60 deg): halved penalty
    return slopeDot * 0.5;
  }
  // Blocked (>60 deg)
  return 0;
}

/**
 * Check whether a slope is walkable at all.
 */
export function isWalkableSlope(slopeValue: number): boolean {
  return (1 - slopeValue) >= 0.5;
}

/**
 * Compute a downhill slide velocity from terrain normal XZ components.
 * Used when the player is on an unwalkable slope to push them downhill.
 */
export function computeSlopeSlideVelocity(
  normalX: number,
  normalZ: number,
  slideStrength: number
): { x: number; z: number } {
  const len = Math.sqrt(normalX * normalX + normalZ * normalZ);
  if (len < 0.001) return { x: 0, z: 0 };
  return {
    x: (normalX / len) * slideStrength,
    z: (normalZ / len) * slideStrength
  };
}

/**
 * Check whether the height delta between two positions is a valid step-up.
 */
export function canStepUp(currentHeight: number, targetHeight: number, maxStep: number = MAX_STEP_HEIGHT): boolean {
  return (targetHeight - currentHeight) <= maxStep;
}
