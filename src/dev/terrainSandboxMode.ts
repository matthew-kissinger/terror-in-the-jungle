/**
 * Terrain sandbox mode entry guard.
 *
 * Activated by `?mode=terrain-sandbox` on the URL. When active, bootstrap
 * skips the normal GameEngine wire-up and runs the isolated
 * TerrainSandboxScene instead so noise / shape / preview parameters can be
 * tuned live without booting combat, AI, atmosphere, audio, HUD, or
 * vehicles.
 *
 * See docs/tasks/terrain-param-sandbox.md.
 */

const TERRAIN_SANDBOX_MODE_PARAM = 'mode';
const TERRAIN_SANDBOX_MODE_VALUE = 'terrain-sandbox';

export function isTerrainSandboxMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get(TERRAIN_SANDBOX_MODE_PARAM) === TERRAIN_SANDBOX_MODE_VALUE;
}
