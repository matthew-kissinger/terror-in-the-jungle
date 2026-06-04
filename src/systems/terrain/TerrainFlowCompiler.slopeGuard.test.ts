// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameMode, type GameModeConfig, type TerrainFlowPolicyConfig } from '../../config/gameModeTypes';
import { Faction } from '../combat/types';
import { compileTerrainFlow } from './TerrainFlowCompiler';

// Behavior tests for the slope-aware drape blend in `appendRouteFlow`.
//
// The slope guard only changes per-capsule radii — every other field of the
// emitted stamp is identical. We assert on the radii because that is the
// caller-observable knob the StampedHeightProvider consumes to decide whether
// a route stamp flattens terrain. We do NOT assert on the slope-sample math
// itself (that is an implementation detail of the guard).

function makeModeConfig(terrainFlow: TerrainFlowPolicyConfig): GameModeConfig {
  // Two zones placed far apart so the planner emits a real multi-capsule
  // route. The route runs roughly along x = 0 through the world center.
  return {
    id: GameMode.A_SHAU_VALLEY,
    name: 'Slope Guard Test',
    description: 'test',
    worldSize: 2000,
    chunkRenderDistance: 4,
    maxTickets: 100,
    matchDuration: 60,
    deathPenalty: 1,
    playerCanSpawnAtZones: true,
    respawnTime: 5,
    spawnProtectionDuration: 2,
    maxCombatants: 20,
    squadSize: { min: 4, max: 6 },
    reinforcementInterval: 30,
    zones: [
      {
        id: 'us_home',
        name: 'US HQ',
        position: new THREE.Vector3(-400, 0, 0),
        radius: 40,
        isHomeBase: true,
        owner: Faction.US,
        ticketBleedRate: 0,
      },
      {
        id: 'objective_a',
        name: 'Objective A',
        position: new THREE.Vector3(400, 0, 0),
        radius: 30,
        isHomeBase: false,
        owner: null,
        ticketBleedRate: 1,
      },
    ],
    captureRadius: 25,
    captureSpeed: 5,
    minimapScale: 400,
    viewDistance: 200,
    terrainFlow,
  };
}

const BASE_POLICY: TerrainFlowPolicyConfig = {
  enabled: true,
  routeStamping: 'full',
  routeWidth: 22,
  routeBlend: 8,
  routeSpacing: 24,
  routeSurface: 'jungle_trail',
  routeGradeStrength: 0.08,
};

const FLAT_HEIGHT = () => 100;

describe('TerrainFlowCompiler slope guard (route-stamp-slope-guard)', () => {
  it('flat-patch regression: enabling the slope guard does not change stamp output', () => {
    // On flat terrain the slope sample is exactly 0 degrees, well below the
    // 15 deg guard. The smoothstep edges sit at [12.5, 17.5], so the blend
    // returns 1.0 and the multiplier on radii is identity. Stamps must be
    // byte-identical to the legacy no-guard config.
    const legacyConfig = makeModeConfig({ ...BASE_POLICY });
    const guardedConfig = makeModeConfig({
      ...BASE_POLICY,
      slopeGuardDegrees: 15,
      slopeGuardSoftnessDegrees: 5,
      routeBlendOnSteepSlope: 0.0,
    });

    const legacy = compileTerrainFlow(legacyConfig, FLAT_HEIGHT);
    const guarded = compileTerrainFlow(guardedConfig, FLAT_HEIGHT);

    expect(guarded.stamps.length).toBe(legacy.stamps.length);
    expect(guarded.stamps.length).toBeGreaterThan(0);
    for (let i = 0; i < legacy.stamps.length; i++) {
      // JSON round-trip catches any structural drift, not just radii.
      expect(JSON.stringify(guarded.stamps[i])).toBe(JSON.stringify(legacy.stamps[i]));
    }
  });

  it('30 deg slope behavior: flatten radii collapse to at most 10% of the legacy value', () => {
    // Synthesize a steep ridge running along the x = 0 axis: height varies
    // only with x via a linear ramp. The 4-tap central difference at the
    // capsule midpoints (also on x = 0) yields ~30 deg.
    const slopeRiseOverRun = Math.tan(30 * Math.PI / 180); // ~0.577
    const ridge = (x: number, _z: number) => slopeRiseOverRun * x;

    const legacyConfig = makeModeConfig({ ...BASE_POLICY });
    const guardedConfig = makeModeConfig({
      ...BASE_POLICY,
      slopeGuardDegrees: 15,
      slopeGuardSoftnessDegrees: 5,
      routeBlendOnSteepSlope: 0.0,
    });

    const legacy = compileTerrainFlow(legacyConfig, ridge);
    const guarded = compileTerrainFlow(guardedConfig, ridge);

    expect(guarded.stamps.length).toBe(legacy.stamps.length);
    expect(legacy.stamps.length).toBeGreaterThan(0);

    // At 30 deg (well above the 17.5 deg high edge), the blend target of 0.0
    // means every capsule radius shrinks to 0 = no flatten effect anywhere.
    // We assert <= 10% of the legacy radius across every capsule.
    const ACCEPTANCE_RATIO = 0.10;
    for (let i = 0; i < legacy.stamps.length; i++) {
      const legacyStamp = legacy.stamps[i];
      const guardedStamp = guarded.stamps[i];
      if (legacyStamp.kind !== 'flatten_capsule' || guardedStamp.kind !== 'flatten_capsule') {
        continue;
      }
      expect(guardedStamp.innerRadius).toBeLessThanOrEqual(legacyStamp.innerRadius * ACCEPTANCE_RATIO);
      expect(guardedStamp.outerRadius).toBeLessThanOrEqual(legacyStamp.outerRadius * ACCEPTANCE_RATIO);
      expect(guardedStamp.gradeRadius).toBeLessThanOrEqual(legacyStamp.gradeRadius * ACCEPTANCE_RATIO);
    }
  });

  it('determinism: compiling twice with the same inputs yields byte-identical stamps', () => {
    // No Math.random anywhere on the guard path. Two compilations of the
    // same config + height function must serialize identically — both on
    // flat terrain and on a steep ridge where the guard is actively
    // interpolating.
    const slopeRiseOverRun = Math.tan(20 * Math.PI / 180); // mid-band: ~20 deg
    const ridge = (x: number, _z: number) => slopeRiseOverRun * x;

    const config = makeModeConfig({
      ...BASE_POLICY,
      slopeGuardDegrees: 15,
      slopeGuardSoftnessDegrees: 5,
      routeBlendOnSteepSlope: 0.0,
    });

    const first = compileTerrainFlow(config, ridge);
    const second = compileTerrainFlow(config, ridge);
    expect(JSON.stringify(second.stamps)).toBe(JSON.stringify(first.stamps));
    expect(JSON.stringify(second.surfacePatches)).toBe(JSON.stringify(first.surfacePatches));
    expect(JSON.stringify(second.flowPaths)).toBe(JSON.stringify(first.flowPaths));
  });
});
