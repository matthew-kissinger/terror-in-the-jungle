/**
 * Gun range mode entry guard.
 *
 * Activated by `?mode=gun-range`. Bootstrap skips the normal GameEngine and
 * runs an isolated Pixel Forge GLB hitbox validation scene with the production
 * combatant hit proxies.
 */

const GUN_RANGE_MODE_PARAM = 'mode';
const GUN_RANGE_MODE_VALUE = 'gun-range';

export function isGunRangeMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get(GUN_RANGE_MODE_PARAM) === GUN_RANGE_MODE_VALUE;
}
