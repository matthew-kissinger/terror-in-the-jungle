// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { initArclight, updateArclight } from './ArclightMission';
import { Faction } from '../combat/types';
import { createAirSupportMission, flatTerrainHeight } from '../../test-utils/airSupportMission';

/**
 * ArclightMission — L2 behavior tests.
 *
 * Observable contract (no tuning constants asserted):
 *  - the bomber flies the approach axis at high altitude, passing over the mark;
 *  - it walks a stick of bombs along the marked heading: many craters strung
 *    out roughly parallel to the approach direction, not a single point;
 *  - bombs are released one-at-a-time over time (not all in one frame), so the
 *    per-frame explosion-spawn count stays bounded;
 *  - every damage application carries the requester faction (friend-or-foe);
 *  - the mission eventually hands off to the 'outbound' phase.
 */

function makeCombatantSystem() {
  return {
    applyExplosionDamage: vi.fn(),
  } as any;
}

function makeAudio() {
  return { play: vi.fn() } as any;
}

interface FlyOptions {
  combatantSystem?: any;
  audio?: any;
  explosionSpawn?: (pos: THREE.Vector3) => void;
  faction?: Faction;
  height?: number;
  maxSeconds?: number;
  approach?: THREE.Vector3;
  target?: { x: number; z: number };
}

/** Drive an Arc Light pass to completion, returning the mission object. */
function flyPass(opts: FlyOptions = {}) {
  const mission = createAirSupportMission('arclight', {
    x: opts.target?.x ?? 200,
    z: opts.target?.z ?? -150,
    approach: opts.approach,
  });
  initArclight(mission);
  const dt = 0.05;
  const maxSeconds = opts.maxSeconds ?? 30;
  const steps = Math.round(maxSeconds / dt);
  for (let i = 0; i < steps; i++) {
    mission.elapsed += dt;
    updateArclight(
      mission,
      dt,
      opts.combatantSystem,
      opts.audio,
      opts.explosionSpawn,
      flatTerrainHeight(opts.height ?? 0),
      opts.faction,
    );
    if (mission.state === 'outbound') break;
  }
  return mission;
}

describe('ArclightMission', () => {
  let combatantSystem: any;

  beforeEach(() => {
    combatantSystem = makeCombatantSystem();
  });

  it('initializes the mission with no bombs released', () => {
    const mission = createAirSupportMission('arclight');
    initArclight(mission);
    expect(mission.missionData.released).toBe(0);
  });

  it('flies the bomber high above terrain on the approach axis', () => {
    const mission = createAirSupportMission('arclight', { x: 0, z: 0 });
    initArclight(mission);
    mission.elapsed = 0.001;
    updateArclight(mission, 0.001, combatantSystem, makeAudio(), undefined, flatTerrainHeight(40));
    // Sits well above terrain (high-altitude run-in, above the engagement ceiling).
    expect(mission.aircraft.position.y).toBeGreaterThan(40 + 200);
  });

  it('flies the bomber through the mark along the approach direction', () => {
    const mission = createAirSupportMission('arclight', { x: 0, z: 0 });
    initArclight(mission);
    // Early: behind the mark (negative z for the default +z approach).
    mission.elapsed = 0.5;
    updateArclight(mission, 0.5, combatantSystem, makeAudio(), undefined, flatTerrainHeight());
    const earlyZ = mission.aircraft.position.z;
    // Late: advanced past the mark.
    mission.elapsed = 6.0;
    updateArclight(mission, 0.5, combatantSystem, makeAudio(), undefined, flatTerrainHeight());
    const lateZ = mission.aircraft.position.z;
    expect(lateZ).toBeGreaterThan(earlyZ);
    expect(earlyZ).toBeLessThan(0);
  });

  it('walks a full stick of bombs (many craters, not a single point)', () => {
    const mission = flyPass({ combatantSystem });
    // The whole stick is released by the end of the pass.
    expect(mission.missionData.released).toBeGreaterThan(1);
    // More than a couple of damage bursts — a walked string, not one bomb.
    expect(combatantSystem.applyExplosionDamage.mock.calls.length).toBeGreaterThan(3);
  });

  it('strings the craters out along the marked heading', () => {
    // Use a +X approach so the walked line spreads along X with ~constant Z.
    const approach = new THREE.Vector3(1, 0, 0);
    flyPass({ combatantSystem, approach, target: { x: 0, z: 0 } });
    const calls = combatantSystem.applyExplosionDamage.mock.calls;
    expect(calls.length).toBeGreaterThan(2);
    const xs = calls.map((c: any[]) => (c[0] as THREE.Vector3).x);
    const zs = calls.map((c: any[]) => (c[0] as THREE.Vector3).z);
    const xSpread = Math.max(...xs) - Math.min(...xs);
    const zSpread = Math.max(...zs) - Math.min(...zs);
    // Craters spread substantially along the heading (X) and stay tight across it (Z).
    expect(xSpread).toBeGreaterThan(50);
    expect(xSpread).toBeGreaterThan(zSpread);
  });

  it('releases bombs over multiple frames, not all in one frame', () => {
    // Count how many explosions spawn on any single update tick.
    const mission = createAirSupportMission('arclight', { x: 0, z: 0 });
    initArclight(mission);
    const dt = 0.05;
    let maxPerTick = 0;
    let total = 0;
    for (let i = 0; i < Math.round(30 / dt); i++) {
      let perTick = 0;
      const explosionSpawn = () => { perTick++; total++; };
      mission.elapsed += dt;
      updateArclight(mission, dt, combatantSystem, undefined, explosionSpawn, flatTerrainHeight());
      maxPerTick = Math.max(maxPerTick, perTick);
      if (mission.state === 'outbound') break;
    }
    expect(total).toBeGreaterThan(1); // a real stick was dropped
    expect(maxPerTick).toBeLessThanOrEqual(1); // bounded: at most one per frame
  });

  it('spawns a shared-pool explosion at each crater', () => {
    const explosionSpawn = vi.fn();
    flyPass({ combatantSystem, explosionSpawn });
    expect(explosionSpawn).toHaveBeenCalled();
    expect(explosionSpawn.mock.calls.length).toBeGreaterThan(1);
  });

  it('tags every damage application as an arclight source', () => {
    flyPass({ combatantSystem });
    const calls = combatantSystem.applyExplosionDamage.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain('arclight');
    }
  });

  it('threads the requester faction into every damage call (friend-or-foe IFF)', () => {
    flyPass({ combatantSystem, faction: Faction.US });
    const calls = combatantSystem.applyExplosionDamage.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // 6th arg is the shooter faction used to spare friendlies.
      expect(call[5]).toBe(Faction.US);
    }
  });

  it('plays an explosion sound for the bomb string', () => {
    const audio = makeAudio();
    flyPass({ combatantSystem, audio });
    expect(audio.play).toHaveBeenCalled();
  });

  it('eventually transitions to outbound after the stick is walked', () => {
    const mission = flyPass({ combatantSystem, maxSeconds: 30 });
    expect(mission.state).toBe('outbound');
  });

  it('does not crash and does no damage without a combatant system', () => {
    expect(() => flyPass({ combatantSystem: undefined })).not.toThrow();
  });
});
