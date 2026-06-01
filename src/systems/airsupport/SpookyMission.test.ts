import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { initSpooky, updateSpooky } from './SpookyMission';
import { createAirSupportMission, flatTerrainHeight } from '../../test-utils/airSupportMission';

/**
 * SpookyMission — L2 behavior tests.
 *
 * Observable contract (no tuning constants asserted):
 *  - the gunship orbits the target (stays roughly at a fixed radius, position
 *    changes as it circles) when not under external physics control;
 *  - it fires bursts of tracer rounds at the ground near the target;
 *  - each round applies minigun damage attributed to the spooky gun;
 *  - when physics-controlled, it does NOT move the aircraft itself but still
 *    fires.
 */

function makeCombatantSystem() {
  return { applyExplosionDamage: vi.fn() } as any;
}
function makeAudio() {
  return { play: vi.fn() } as any;
}
function makeTracerPool() {
  return { spawn: vi.fn() } as any;
}

/** Run the gunship for `seconds` of sim time, returning observable spies. */
function runSpooky(opts: {
  seconds?: number;
  physicsControlled?: boolean;
  combatantSystem?: any;
  audio?: any;
  tracerPool?: any;
  height?: number;
} = {}) {
  const mission = createAirSupportMission('spooky', { x: 300, z: 300 });
  initSpooky(mission);
  const combatantSystem = opts.combatantSystem ?? makeCombatantSystem();
  const audio = opts.audio ?? makeAudio();
  const tracerPool = opts.tracerPool ?? makeTracerPool();
  const dt = 0.1;
  const steps = Math.round((opts.seconds ?? 10) / dt);
  for (let i = 0; i < steps; i++) {
    mission.elapsed += dt;
    updateSpooky(
      mission,
      dt,
      combatantSystem,
      audio,
      tracerPool,
      flatTerrainHeight(opts.height ?? 0),
      opts.physicsControlled ?? false,
    );
  }
  return { mission, combatantSystem, audio, tracerPool };
}

describe('SpookyMission', () => {
  beforeEach(() => {
    // Make orbit start angle deterministic where it matters.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('orbits the target at an offset (aircraft is not sitting on the target)', () => {
    const { mission } = runSpooky({ seconds: 0.1 });
    const dx = mission.aircraft.position.x - mission.targetPosition.x;
    const dz = mission.aircraft.position.z - mission.targetPosition.z;
    const radius = Math.sqrt(dx * dx + dz * dz);
    expect(radius).toBeGreaterThan(1); // standing off, not on top of target
  });

  it('keeps a roughly constant orbital radius as it circles', () => {
    const mission = createAirSupportMission('spooky', { x: 0, z: 0 });
    initSpooky(mission);
    const tracerPool = makeTracerPool();
    const cs = makeCombatantSystem();
    const radii: number[] = [];
    const dt = 0.1;
    for (let i = 0; i < 100; i++) {
      mission.elapsed += dt;
      updateSpooky(mission, dt, cs, makeAudio(), tracerPool, flatTerrainHeight());
      const r = Math.hypot(mission.aircraft.position.x, mission.aircraft.position.z);
      radii.push(r);
    }
    const min = Math.min(...radii);
    const max = Math.max(...radii);
    // Radius is stable (orbit, not a spiral): spread is tiny relative to radius.
    expect(max - min).toBeLessThan(max * 0.05);
  });

  it('moves the aircraft around the orbit over time', () => {
    const mission = createAirSupportMission('spooky', { x: 0, z: 0 });
    initSpooky(mission);
    updateSpooky(mission, 0.1, makeCombatantSystem(), makeAudio(), makeTracerPool(), flatTerrainHeight());
    const first = mission.aircraft.position.clone();
    for (let i = 0; i < 50; i++) {
      mission.elapsed += 0.1;
      updateSpooky(mission, 0.1, makeCombatantSystem(), makeAudio(), makeTracerPool(), flatTerrainHeight());
    }
    const later = mission.aircraft.position;
    expect(later.distanceTo(first)).toBeGreaterThan(1);
  });

  it('flies above the terrain surface', () => {
    const { mission } = runSpooky({ seconds: 0.1, height: 40 });
    expect(mission.aircraft.position.y).toBeGreaterThan(40);
  });

  it('fires tracer rounds toward the ground during a burst', () => {
    const { tracerPool } = runSpooky({ seconds: 8 });
    expect(tracerPool.spawn).toHaveBeenCalled();
  });

  it('applies minigun damage to combatants near the impact point', () => {
    const { combatantSystem } = runSpooky({ seconds: 8 });
    expect(combatantSystem.applyExplosionDamage).toHaveBeenCalled();
  });

  it('attributes its damage to the spooky minigun', () => {
    const { combatantSystem } = runSpooky({ seconds: 8 });
    const calls = combatantSystem.applyExplosionDamage.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain('spooky_minigun');
    }
  });

  it('fires its rounds near the target area', () => {
    const { combatantSystem } = runSpooky({ seconds: 8 });
    const calls = combatantSystem.applyExplosionDamage.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Each impact is scattered around the target, but stays within a tight radius.
    for (const call of calls) {
      const pos = call[0] as THREE.Vector3;
      expect(Math.abs(pos.x - 300)).toBeLessThan(50);
      expect(Math.abs(pos.z - 300)).toBeLessThan(50);
    }
  });

  it('does not reposition the aircraft when physics-controlled, but still fires', () => {
    const mission = createAirSupportMission('spooky', { x: 0, z: 0 });
    initSpooky(mission);
    // External controller owns the transform: pin it and confirm Spooky leaves it alone.
    mission.aircraft.position.set(7, 11, 13);
    const tracerPool = makeTracerPool();
    const cs = makeCombatantSystem();
    const dt = 0.1;
    for (let i = 0; i < 80; i++) {
      mission.elapsed += dt;
      updateSpooky(mission, dt, cs, makeAudio(), tracerPool, flatTerrainHeight(), true);
    }
    expect(mission.aircraft.position.x).toBe(7);
    expect(mission.aircraft.position.y).toBe(11);
    expect(mission.aircraft.position.z).toBe(13);
    expect(tracerPool.spawn).toHaveBeenCalled();
  });

  it('does not crash without optional dependencies', () => {
    const mission = createAirSupportMission('spooky');
    initSpooky(mission);
    expect(() => {
      for (let i = 0; i < 80; i++) {
        mission.elapsed += 0.1;
        updateSpooky(mission, 0.1, undefined, undefined, undefined, flatTerrainHeight());
      }
    }).not.toThrow();
  });
});
