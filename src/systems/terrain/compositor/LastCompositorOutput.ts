import type { TerrainCompositorOutput } from './TerrainCompositorTypes';

/**
 * Tiny module-level cache for the most recent {@link TerrainCompositorOutput}
 * produced by {@link ../../../core/ModeStartupPreparer.compileStartupTerrainFeatures}.
 * Exists as its own file so the dev-only `Shift+\` → `S` compositor overlay
 * (cycle-terrain-compositor R2.3) can read the cached output without
 * statically importing `ModeStartupPreparer.ts` — that module pulls the full
 * terrain / hydrology pipeline into whichever chunk imports it and breaks the
 * `GameEngineInit` dynamic-import code-split.
 */
let cached: TerrainCompositorOutput | null = null;

export function setLastTerrainCompositorOutput(output: TerrainCompositorOutput): void {
  cached = output;
}

export function getLastTerrainCompositorOutput(): TerrainCompositorOutput | null {
  return cached;
}

/** Clear the cache. Tests use this so suite-wide state does not leak. */
export function clearLastTerrainCompositorOutput(): void {
  cached = null;
}
