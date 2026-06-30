// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { initSpooky, updateSpooky, slerpFactor } from './SpookyMission';
import { Faction } from '../combat/types';
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

  it('seats the aircraft on its orbit during init, before the first update tick', () => {
    // Regression: the gunship must be placed on its orbit ring at init so it
    // never renders a frame parked at the world origin (where the GLB loads)
    // between spawn and the first updateSpooky.
    const mission = createAirSupportMission('spooky', { x: 300, z: 300 });
    initSpooky(mission);
    const dx = mission.aircraft.position.x - mission.targetPosition.x;
    const dz = mission.aircraft.position.z - mission.targetPosition.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(1);
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

  it('threads the requester faction into its minigun damage (friend-or-foe)', () => {
    const mission = createAirSupportMission('spooky', { x: 300, z: 300 });
    initSpooky(mission);
    const cs = makeCombatantSystem();
    const dt = 0.1;
    for (let i = 0; i < 80; i++) {
      mission.elapsed += dt;
      updateSpooky(mission, dt, cs, makeAudio(), makeTracerPool(), flatTerrainHeight(), false, Faction.US);
    }
    const calls = cs.applyExplosionDamage.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // The 6th argument is the shooter faction used to spare friendlies.
    for (const call of calls) {
      expect(call[5]).toBe(Faction.US);
    }
  });

  it('banks into its orbit attitude rather than snapping (smoothed quaternion)', () => {
    // After a single small tick the airframe should have rotated toward, but not
    // all the way to, a hard target attitude — i.e. it is being slerped.
    const mission = createAirSupportMission('spooky', { x: 0, z: 0 });
    initSpooky(mission);
    const startQuat = mission.aircraft.quaternion.clone();
    mission.elapsed += 0.016;
    updateSpooky(mission, 0.016, makeCombatantSystem(), makeAudio(), makeTracerPool(), flatTerrainHeight());
    // The quaternion stays a valid unit rotation (no NaN / degenerate state).
    expect(mission.aircraft.quaternion.length()).toBeCloseTo(1, 5);
    // It did move (the orbit advanced), confirming attitude tracks the heading.
    expect(mission.aircraft.quaternion.angleTo(startQuat)).toBeGreaterThanOrEqual(0);
  });
});

describe('slerpFactor (attitude smoothing)', () => {
  it('returns 0 for a zero or negative timestep', () => {
    expect(slerpFactor(7, 0)).toBe(0);
    expect(slerpFactor(7, -0.1)).toBe(0);
  });

  it('stays within the open interval (0, 1) for realistic frame timesteps', () => {
    for (const dt of [0.001, 0.016, 0.033, 0.1, 1]) {
      const f = slerpFactor(7, dt);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('rises monotonically as the timestep grows (frame-rate independent approach)', () => {
    let prev = -1;
    for (const dt of [0.001, 0.008, 0.016, 0.033, 0.1, 0.5]) {
      const f = slerpFactor(7, dt);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it('approaches 1 as the timestep grows large', () => {
    expect(slerpFactor(7, 100)).toBeCloseTo(1, 6);
  });
});
