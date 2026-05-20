import { describe, expect, it } from 'vitest';
import { OPEN_FRONTIER_CONFIG } from './OpenFrontierConfig';

/**
 * Mirrors the SystemManager resolution (`SystemManager.ts:200-215`):
 *   waterEnabled            = config.waterEnabled !== false
 *   globalWaterPlaneEnabled = config.globalWaterPlaneEnabled ?? waterEnabled
 *
 * Both values are dispatched into `WaterSystem.setEnabled(...)` and used to
 * decide whether to render the global sea-level plane and the hydrology
 * river ribbon. Tests in this file assert behavior at that dispatch boundary
 * so a future config edit cannot silently disable either surface on Open
 * Frontier without these tests flipping red.
 */
function resolveWaterDispatch(config: {
  waterEnabled?: boolean;
  globalWaterPlaneEnabled?: boolean;
}): { waterEnabled: boolean; globalWaterPlaneEnabled: boolean } {
  const waterEnabled = config.waterEnabled !== false;
  const globalWaterPlaneEnabled = config.globalWaterPlaneEnabled ?? waterEnabled;
  return { waterEnabled, globalWaterPlaneEnabled };
}

describe('OpenFrontierConfig water dispatch', () => {
  it('declares waterEnabled explicitly so the hydrology river surface renders', () => {
    // Explicit (not inherited) so a future agent cannot accidentally disable
    // the OF river render by toggling a project-wide default. The comment
    // adjacent to the field documents intent: the seed-42 noise terrain
    // centers near y=0, so the global plane and the river ribbon coexist.
    expect(OPEN_FRONTIER_CONFIG.waterEnabled).toBe(true);
  });

  it('leaves globalWaterPlaneEnabled inherited so the sea-level plane renders on shore terrain', () => {
    // Inherited default: the resolver in SystemManager (`config.globalWaterPlaneEnabled
    // ?? waterEnabled`) lands on true. A Shau opts out (`false`) because its
    // valley floor is ~580 m; OF terrain centers near y=0 so the plane is visible.
    expect(OPEN_FRONTIER_CONFIG.globalWaterPlaneEnabled).toBeUndefined();
  });

  it('dispatches both the global sea-level plane and the hydrology river surface to WaterSystem', () => {
    const dispatch = resolveWaterDispatch(OPEN_FRONTIER_CONFIG);
    expect(dispatch.waterEnabled).toBe(true);
    expect(dispatch.globalWaterPlaneEnabled).toBe(true);
  });
});
