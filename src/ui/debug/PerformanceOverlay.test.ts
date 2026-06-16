/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it } from 'vitest';
import { PerformanceOverlay } from './PerformanceOverlay';

function makeStats(fps: number) {
  return {
    fps,
    frameTimeMs: 1000 / Math.max(1, fps),
    drawCalls: 10,
    triangles: 1000,
    terrainReady: true,
    activeTerrainTiles: 4,
    terrainWorkerQueue: 0,
    terrainBusyWorkers: 0,
    terrainTotalWorkers: 2,
    usCombatants: 5,
    opforCombatants: 5,
    vegetationActive: 10,
    vegetationReserved: 2,
    suppressedLogs: 0,
    geometries: 3,
    textures: 4,
    programs: 1,
    combatLastMs: 1,
    combatEmaMs: 1,
    combatLodHigh: 2,
    combatLodMedium: 2,
    combatLodLow: 1,
    combatLodCulled: 0,
    combatantCount: 5,
  };
}

describe('PerformanceOverlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('displays the rolling average over the latest 60 visible FPS samples', () => {
    const overlay = new PerformanceOverlay();
    overlay.mount(document.body);
    overlay.setVisible(true);

    for (let fps = 1; fps <= 65; fps++) {
      overlay.updateStats(makeStats(fps));
    }

    expect(document.querySelector('.performance-overlay')?.textContent).toContain('FPS: 65 (avg 36)');
  });

  it('does not include hidden updates in the FPS average', () => {
    const overlay = new PerformanceOverlay();
    overlay.mount(document.body);
    overlay.updateStats(makeStats(1));
    overlay.setVisible(true);
    overlay.updateStats(makeStats(30));

    expect(document.querySelector('.performance-overlay')?.textContent).toContain('FPS: 30 (avg 30)');
  });
});
