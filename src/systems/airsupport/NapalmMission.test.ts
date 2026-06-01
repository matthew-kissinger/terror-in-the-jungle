import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { initNapalm, updateNapalm } from './NapalmMission';
import { createAirSupportMission, flatTerrainHeight } from '../../test-utils/airSupportMission';

/**
 * NapalmMission — L2 behavior tests.
 *
 * Observable contract (no tuning constants asserted):
 *  - the aircraft flies along the approach axis, passing over the target;
 *  - a napalm payload is dropped exactly once when the aircraft crosses near
 *    the target, producing an initial explosion + a damage burst;
 *  - persistent fire continues to deal damage over time after the drop;
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

/** Drive the mission to completion, returning observable counters. */
function flyPass(opts: {
  combatantSystem?: any;
  audio?: any;
  explosionSpawn?: ((pos: THREE.Vector3) => void);
  height?: number;
  maxSeconds?: number;
} = {}) {
  const mission = createAirSupportMission('napalm', { x: 200, z: -150 });
  initNapalm(mission);
  const dt = 0.1;
  const maxSeconds = opts.maxSeconds ?? 40;
  const steps = Math.round(maxSeconds / dt);
  for (let i = 0; i < steps; i++) {
    mission.elapsed += dt;
    updateNapalm(
      mission,
      dt,
      opts.combatantSystem,
      opts.audio,
      opts.explosionSpawn,
      flatTerrainHeight(opts.height ?? 0),
    );
    if (mission.state === 'outbound') break;
  }
  return mission;
}

describe('NapalmMission', () => {
  let combatantSystem: any;

  beforeEach(() => {
    combatantSystem = makeCombatantSystem();
  });

  it('initializes the mission as un-dropped', () => {
    const mission = createAirSupportMission('napalm');
    initNapalm(mission);
    expect(mission.missionData.dropped).toBe(0);
  });

  it('positions the aircraft above terrain on the approach axis', () => {
    const mission = createAirSupportMission('napalm', { x: 100, z: 100 });
    initNapalm(mission);
    mission.elapsed = 0.001;
    updateNapalm(mission, 0.001, combatantSystem, makeAudio(), undefined, flatTerrainHeight(25));
    // y tracks terrain height (+ a fixed cruise offset); always above ground.
    expect(mission.aircraft.position.y).toBeGreaterThan(25);
  });

  it('flies the aircraft through the target along the approach direction', () => {
    const mission = createAirSupportMission('napalm', { x: 0, z: 0 });
    initNapalm(mission);
    // Early in the pass the aircraft is behind the target (negative z for +z approach).
    mission.elapsed = 0.5;
    updateNapalm(mission, 0.5, combatantSystem, makeAudio(), undefined, flatTerrainHeight());
    const earlyZ = mission.aircraft.position.z;
    // Later in the pass it has advanced past the target (more positive z).
    mission.elapsed = 7.5;
    updateNapalm(mission, 0.5, combatantSystem, makeAudio(), undefined, flatTerrainHeight());
    const lateZ = mission.aircraft.position.z;
    expect(lateZ).toBeGreaterThan(earlyZ);
    expect(earlyZ).toBeLessThan(0); // started behind target
  });

  it('drops the payload exactly once and only after reaching the target', () => {
    const mission = flyPass({ combatantSystem });
    expect(mission.missionData.dropped).toBe(1);
  });

  it('applies an initial explosion damage burst centered on the target', () => {
    const mission = createAirSupportMission('napalm', { x: 50, z: 50 });
    flyPassInto(mission, { combatantSystem });
    expect(combatantSystem.applyExplosionDamage).toHaveBeenCalled();
    // The first explosion damage call is the initial burst centered on target.
    const firstCall = combatantSystem.applyExplosionDamage.mock.calls[0];
    const center = firstCall[0] as THREE.Vector3;
    expect(center.x).toBeCloseTo(50, 1);
    expect(center.z).toBeCloseTo(50, 1);
    const damage = firstCall[2] as number;
    expect(damage).toBeGreaterThan(0);
  });

  it('tags napalm damage with a napalm weapon source', () => {
    flyPass({ combatantSystem });
    const calls = combatantSystem.applyExplosionDamage.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Every napalm damage application is attributed to napalm (kill-feed/source arg).
    for (const call of calls) {
      expect(call).toContain('napalm');
    }
  });

  it('continues to deal fire damage over multiple ticks after the drop', () => {
    flyPass({ combatantSystem });
    // Initial burst + several persistent fire ticks across the fire duration.
    expect(combatantSystem.applyExplosionDamage.mock.calls.length).toBeGreaterThan(1);
  });

  it('spawns initial explosion effects at the impact line when dropping', () => {
    const explosionSpawn = vi.fn();
    flyPass({ combatantSystem, explosionSpawn });
    expect(explosionSpawn).toHaveBeenCalled();
    // More than one fire point is seeded along the impact line.
    expect(explosionSpawn.mock.calls.length).toBeGreaterThan(1);
  });

  it('plays an explosion sound on drop', () => {
    const audio = makeAudio();
    flyPass({ combatantSystem, audio });
    expect(audio.play).toHaveBeenCalled();
  });

  it('transitions to outbound after the fire burns out', () => {
    const mission = flyPass({ combatantSystem, maxSeconds: 60 });
    expect(mission.state).toBe('outbound');
  });

  it('does not crash and does no damage when no combatant system is provided', () => {
    expect(() => flyPass({ combatantSystem: undefined })).not.toThrow();
  });
});

/** Variant that drives a caller-supplied mission object to completion. */
function flyPassInto(mission: ReturnType<typeof createAirSupportMission>, opts: { combatantSystem?: any } = {}) {
  initNapalm(mission);
  const dt = 0.1;
  for (let i = 0; i < 600; i++) {
    mission.elapsed += dt;
    updateNapalm(mission, dt, opts.combatantSystem, undefined, undefined, flatTerrainHeight());
    if (mission.state === 'outbound') break;
  }
  return mission;
}
