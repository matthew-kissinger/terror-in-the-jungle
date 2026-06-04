// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { AICoverSystem } from './AICoverSystem';
import { CombatCoverGridProvider } from './CombatCoverGridProvider';
import { createTestCombatant, mockTerrainRuntime } from '../../../test-utils';
import type { ITerrainRuntime } from '../../../types/SystemInterfaces';

/**
 * Cover-search cost micro-benchmark (DEFEKT-3 / cycle-combat-p99-attribution, L5).
 *
 * The combat-AI-p99 spike (docs/rearch/COMBAT_AI_P99_SPIKE_2026-06-03.md) argues
 * the synchronous cover search is NOT the p99 driver: it is wired through the
 * O(1) `CoverSpatialGrid`, triple-capped (<=2 lookups/suppression, <=8
 * searches/frame, suppression on a 10s cooldown), and already timed in
 * `aiMethodMs`. This bench nails the *upper bound on per-call cost in isolation*
 * so the "is it really cheap?" question is closed empirically, not by argument.
 *
 * It is intentionally coarse (a unit-test runner under jsdom is not a perf lab):
 * the threshold proves an ORDER OF MAGNITUDE, not a precise number. A median
 * per-call cost well under a millisecond means that even at the hard 8-search/
 * frame cap the cover search contributes a small fraction of a 16.67ms frame and
 * structurally cannot anchor a 35ms p99 tail. If this ever regresses by orders
 * of magnitude (e.g. an un-amortized full-scan creeps back in), this fails.
 */

// Terrain with periodic ridges/depressions so AICoverSystem.generateCoverSpots
// finds a realistic density of terrain cover candidates (it keys on local
// height variation > 1.5m), plus a deterministic raycast so the LOS gate runs
// real work without a full terrain mesh.
function ridgeTerrain(): ITerrainRuntime {
  return mockTerrainRuntime({
    getHeightAt: vi.fn((x: number, z: number) => {
      // Sinusoidal ridges in both axes -> frequent >1.5m local variation.
      return 8 + Math.sin(x * 0.35) * 4 + Math.cos(z * 0.35) * 4;
    }),
    // LOS raycast: report a hit beyond the target most of the time (clear LOS),
    // but occasionally short (blocked) so both gate branches are exercised.
    raycastTerrain: vi.fn((origin: THREE.Vector3, _dir: THREE.Vector3, maxDistance: number) => {
      const blocked = (Math.floor(origin.x) + Math.floor(origin.z)) % 5 === 0;
      return blocked
        ? { hit: true, distance: maxDistance * 0.5 }
        : { hit: false, distance: undefined };
    }),
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Coarse ceiling. The spike's example is < 0.05ms; we assert < 0.1ms to stay
// robust against slow/contended CI boxes while still proving the cover search is
// ~2.5 orders of magnitude below a 35ms frame. Both are "cheap" at the same
// order of magnitude; the looser bound just avoids a flaky gate.
const MEDIAN_CALL_CEILING_MS = 0.1;
const SAMPLES = 400;
const WARMUP = 100;

describe('cover-search cost micro-benchmark (DEFEKT-3)', () => {
  it('AICoverSystem.findBestCover median per-call cost is small at realistic density', () => {
    const terrain = ridgeTerrain();
    const cover = new AICoverSystem();
    cover.setTerrainSystem(terrain);

    const threat = new THREE.Vector3(50, 0, 0);
    const all = new Map();
    // Spread query origins over a region so different chunks/cells are touched
    // (realistic: a squad's flankers are not all on one spot).
    const combatants = Array.from({ length: 16 }, (_, i) =>
      createTestCombatant({
        id: `searcher-${i}`,
        position: new THREE.Vector3((i % 4) * 9 - 18, 0, Math.floor(i / 4) * 9 - 18),
      })
    );
    for (const c of combatants) all.set(c.id, c);

    // Warm the JIT + chunk caches.
    for (let i = 0; i < WARMUP; i++) {
      cover.beginFrame();
      cover.findBestCover(combatants[i % combatants.length], threat, all, 30);
    }

    const timings: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const c = combatants[i % combatants.length];
      cover.beginFrame(); // reset the 8/frame budget so every call does real work
      const t0 = performance.now();
      cover.findBestCover(c, threat, all, 30);
      timings.push(performance.now() - t0);
    }

    const med = median(timings);
    // Surface the measured value for the artifact / CI log.
    console.log(`[cover-bench] findBestCover median=${med.toFixed(4)}ms over ${SAMPLES} calls`);
    expect(med).toBeLessThan(MEDIAN_CALL_CEILING_MS);
  });

  it('CombatCoverGridProvider.queryWithLOS median per-call cost is small at realistic density', () => {
    const terrain = ridgeTerrain();
    const cover = new AICoverSystem();
    cover.setTerrainSystem(terrain);
    const provider = new CombatCoverGridProvider(cover, 30);
    provider.setTerrainRuntime(terrain);

    const threat = new THREE.Vector3(50, 0, 0);
    const origins = Array.from({ length: 16 }, (_, i) =>
      new THREE.Vector3((i % 4) * 9 - 18, 0, Math.floor(i / 4) * 9 - 18)
    );

    // Warm up: this also populates the grid (refreshRegion runs on first touch
    // of each region) so the timed loop measures steady-state query cost, not
    // first-fill cost. The 1s region TTL keeps refreshes off the hot path.
    for (let i = 0; i < WARMUP; i++) {
      provider.queryWithLOS(origins[i % origins.length], threat);
    }
    expect(provider.indexedCount).toBeGreaterThan(0);

    const timings: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const origin = origins[i % origins.length];
      const t0 = performance.now();
      provider.queryWithLOS(origin, threat);
      timings.push(performance.now() - t0);
    }

    const med = median(timings);
    console.log(`[cover-bench] queryWithLOS median=${med.toFixed(4)}ms over ${SAMPLES} calls (indexed=${provider.indexedCount})`);
    expect(med).toBeLessThan(MEDIAN_CALL_CEILING_MS);
  });

  it('even at the 8-search/frame cap, the cover search is a small fraction of a 16.67ms frame', () => {
    // The per-frame budget hard-caps findBestCover at MAX_COVER_SEARCHES_PER_FRAME
    // (8). This asserts the *whole frame's* cover-search work stays well under a
    // frame budget — the direct refutation of "cover search anchors the p99 tail".
    const terrain = ridgeTerrain();
    const cover = new AICoverSystem();
    cover.setTerrainSystem(terrain);

    const threat = new THREE.Vector3(50, 0, 0);
    const all = new Map();
    const searchers = Array.from({ length: 8 }, (_, i) =>
      createTestCombatant({
        id: `frame-searcher-${i}`,
        position: new THREE.Vector3((i % 4) * 9 - 18, 0, Math.floor(i / 4) * 9 - 18),
      })
    );
    for (const c of searchers) all.set(c.id, c);

    // Warm up.
    for (let w = 0; w < 50; w++) {
      cover.beginFrame();
      for (const c of searchers) cover.findBestCover(c, threat, all, 30);
    }

    const frameTimings: number[] = [];
    for (let f = 0; f < 200; f++) {
      cover.beginFrame();
      const t0 = performance.now();
      for (const c of searchers) cover.findBestCover(c, threat, all, 30); // 8 searches = full frame budget
      frameTimings.push(performance.now() - t0);
    }

    const medFrame = median(frameTimings);
    console.log(`[cover-bench] full-budget (8 searches) median=${medFrame.toFixed(4)}ms/frame`);
    // 16.67ms is one 60fps frame; the entire frame's cover-search work should be
    // a small fraction of it. Coarse 4ms ceiling = ~24% of a frame, generous for
    // CI noise yet far from "dominating" the 35ms p99 bar.
    expect(medFrame).toBeLessThan(4);
  });
});
