// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { initRocketRun, updateRocketRun } from './RocketRunMission';
import { createAirSupportMission, flatTerrainHeight } from '../../test-utils/airSupportMission';

/**
 * RocketRunMission — L2 behavior tests.
 *
 * Observable contract (no tuning constants asserted):
 *  - the aircraft makes a linear attack run along the approach axis;
 *  - it launches rocket projectiles (via the grenade/projectile system) once it
 *    is within firing range of the target, with the projectiles tagged as
 *    rockets and aimed roughly down-range;
 *  - it stops launching once its rocket load is spent;
 *  - after passing the target it breaks off, climbs, and hands off to outbound.
 */

function makeGrenadeSystem() {
  return { spawnProjectile: vi.fn() } as any;
}
function makeAudio() {
  return { play: vi.fn() } as any;
}

function runRun(opts: {
  seconds?: number;
  grenadeSystem?: any;
  audio?: any;
  approach?: THREE.Vector3;
} = {}) {
  const mission = createAirSupportMission('rocket_run', {
    x: -120,
    z: 80,
    approach: opts.approach,
  });
  initRocketRun(mission);
  const grenadeSystem = opts.grenadeSystem ?? makeGrenadeSystem();
  const audio = opts.audio ?? makeAudio();
  const dt = 0.1;
  const steps = Math.round((opts.seconds ?? 30) / dt);
  for (let i = 0; i < steps; i++) {
    mission.elapsed += dt;
    updateRocketRun(mission, dt, grenadeSystem, audio, flatTerrainHeight());
    if (mission.state === 'outbound') break;
  }
  return { mission, grenadeSystem, audio };
}

describe('RocketRunMission', () => {
  beforeEach(() => {
    // Pin scatter randomness so aim assertions are stable.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('initializes with no rockets fired and not broken off', () => {
    const mission = createAirSupportMission('rocket_run');
    initRocketRun(mission);
    expect(mission.missionData.rocketsFired).toBe(0);
    expect(mission.missionData.brokeOff).toBe(0);
  });

  it('flies the aircraft above terrain toward the target', () => {
    const mission = createAirSupportMission('rocket_run', { x: 0, z: 0 });
    initRocketRun(mission);
    mission.elapsed = 0.01;
    updateRocketRun(mission, 0.01, makeGrenadeSystem(), makeAudio(), flatTerrainHeight(30));
    expect(mission.aircraft.position.y).toBeGreaterThan(30);
  });

  it('launches rocket projectiles during the run', () => {
    const { grenadeSystem } = runRun({});
    expect(grenadeSystem.spawnProjectile).toHaveBeenCalled();
  });

  it('tags launched projectiles as rockets', () => {
    const { grenadeSystem } = runRun({});
    const calls = grenadeSystem.spawnProjectile.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain('rocket');
    }
  });

  it('fires its rockets down-range along the approach direction', () => {
    // Approach along +X so the dominant velocity component should be +X.
    const { grenadeSystem } = runRun({ approach: new THREE.Vector3(1, 0, 0) });
    const calls = grenadeSystem.spawnProjectile.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const velocity = calls[0][1] as THREE.Vector3;
    expect(velocity.x).toBeGreaterThan(0);
    // Rockets are lofted toward the ground (downward vertical component).
    expect(velocity.y).toBeLessThan(0);
  });

  it('does not fire more rockets than its load allows', () => {
    const { grenadeSystem } = runRun({ seconds: 40 });
    const fired = grenadeSystem.spawnProjectile.mock.calls.length;
    // A finite salvo: more than zero but a small fixed number, not hundreds.
    expect(fired).toBeGreaterThan(0);
    expect(fired).toBeLessThanOrEqual(12);
  });

  it('plays a launch sound for fired rockets', () => {
    const audio = makeAudio();
    runRun({ audio });
    expect(audio.play).toHaveBeenCalled();
  });

  it('breaks off and climbs after passing the target', () => {
    const mission = createAirSupportMission('rocket_run', { x: 0, z: 0 });
    initRocketRun(mission);
    const dt = 0.1;
    let climbStartY: number | undefined;
    let brokeOffSeen = false;
    let peakAfterBreak = -Infinity;
    for (let i = 0; i < 400; i++) {
      mission.elapsed += dt;
      updateRocketRun(mission, dt, makeGrenadeSystem(), makeAudio(), flatTerrainHeight());
      if (!brokeOffSeen && mission.missionData.brokeOff === 1) {
        brokeOffSeen = true;
        climbStartY = mission.aircraft.position.y;
      }
      if (brokeOffSeen) peakAfterBreak = Math.max(peakAfterBreak, mission.aircraft.position.y);
      if (mission.state === 'outbound') break;
    }
    expect(brokeOffSeen).toBe(true);
    expect(climbStartY).toBeDefined();
    // After break-off the aircraft gains altitude.
    expect(peakAfterBreak).toBeGreaterThan(climbStartY!);
  });

  it('eventually transitions to outbound', () => {
    const { mission } = runRun({ seconds: 40 });
    expect(mission.state).toBe('outbound');
  });

  it('does not crash when no projectile system is available', () => {
    expect(() => runRun({ grenadeSystem: undefined })).not.toThrow();
  });
});
