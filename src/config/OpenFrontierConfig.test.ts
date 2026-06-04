// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { OPEN_FRONTIER_CONFIG } from './OpenFrontierConfig';

/**
 * Mirrors the SystemManager resolution (`SystemManager.ts:200-215`):
 *   waterEnabled            = config.waterEnabled === true
 *   globalWaterPlaneEnabled = config.globalWaterPlaneEnabled === true
 *
 * Both values are dispatched into `WaterSystem.setEnabled(...)` and used to
 * decide whether to render the global sea-level plane and the hydrology
 * river ribbon. Tests in this file assert behavior at that dispatch boundary
 * so a future config edit cannot silently re-enable the old global sea-level
 * plane on Open Frontier.
 */
function resolveWaterDispatch(config: {
  waterEnabled?: boolean;
  globalWaterPlaneEnabled?: boolean;
}): { waterEnabled: boolean; globalWaterPlaneEnabled: boolean } {
  const waterEnabled = config.waterEnabled === true;
  const globalWaterPlaneEnabled = config.globalWaterPlaneEnabled === true;
  return { waterEnabled, globalWaterPlaneEnabled };
}

describe('OpenFrontierConfig water dispatch', () => {
  it('declares waterEnabled explicitly so the hydrology river surface renders', () => {
    // Explicit so a future agent cannot accidentally disable the OF river
    // render by toggling a project-wide default.
    expect(OPEN_FRONTIER_CONFIG.waterEnabled).toBe(true);
  });

  it('explicitly disables the legacy global sea-level plane', () => {
    expect(OPEN_FRONTIER_CONFIG.globalWaterPlaneEnabled).toBe(false);
  });

  it('dispatches hydrology water without the global sea-level plane', () => {
    const dispatch = resolveWaterDispatch(OPEN_FRONTIER_CONFIG);
    expect(dispatch.waterEnabled).toBe(true);
    expect(dispatch.globalWaterPlaneEnabled).toBe(false);
  });
});
