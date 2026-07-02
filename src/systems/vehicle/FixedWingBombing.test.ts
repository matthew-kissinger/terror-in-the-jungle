// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  BOMB_GRAVITY,
  FixedWingBombController,
  predictBombImpact,
  solveBombCueOffset,
  type BombAirframe,
  type BombOutputs,
} from './FixedWingBombing';
import type { FixedWingBombConfig } from './FixedWingArmament';
import { Faction } from '../combat/types';

const FLAT_GROUND = () => 0;
const A1_BOMBS: FixedWingBombConfig = { name: 'BOMBS', count: 4, blastRadius: 16, blastDamage: 180 };

/** A simple airframe stub with a fixed pose + velocity + airborne flag. */
function stubAirframe(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  airborne = true,
): BombAirframe {
  return {
    getPosition: (out) => { out.copy(position); return true; },
    getVelocity: (out) => { out.copy(velocity); },
    isAirborne: () => airborne,
  };
}

describe('predictBombImpact (CCIP forward-Euler solver)', () => {
  it('drops the impact point ahead of a level-flight release (inherited forward velocity)', () => {
    // Level flight at 100m, 120 m/s along +Z: the bomb carries forward while it falls.
    const out = new THREE.Vector3();
    const impact = predictBombImpact(
      new THREE.Vector3(0, 100, 0),
      new THREE.Vector3(0, 0, 120),
      FLAT_GROUND,
      { gravity: BOMB_GRAVITY },
      out,
    );
    expect(impact).not.toBeNull();
    // Lands on the ground, well ahead of the release point (nose), not below it.
    expect(impact!.y).toBeCloseTo(0, 5);
    expect(impact!.z).toBeGreaterThan(50);
  });

  it('converges the impact toward boresight as the release dives (steeper = closer under the nose)', () => {
    const level = new THREE.Vector3();
    const dive = new THREE.Vector3();
    // Same start + speed; level flight vs a steep dive (mostly downward velocity).
    predictBombImpact(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, 0, 120), FLAT_GROUND, { gravity: BOMB_GRAVITY }, level);
    predictBombImpact(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, -100, 66), FLAT_GROUND, { gravity: BOMB_GRAVITY }, dive);
    // A dive throws the bomb down sooner and closer — less forward travel than level.
    expect(dive.z).toBeLessThan(level.z);
  });

  it('returns null when the airframe climbs away from terrain (no intersection in the budget)', () => {
    const out = new THREE.Vector3();
    const impact = predictBombImpact(
      new THREE.Vector3(0, 500, 0),
      new THREE.Vector3(0, 400, 0), // strong climb: gravity cannot pull it down in the step budget
      FLAT_GROUND,
      { gravity: BOMB_GRAVITY, maxSteps: 8 },
      out,
    );
    expect(impact).toBeNull();
  });
});

describe('solveBombCueOffset (project impact to a screen pixel offset)', () => {
  function forwardCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
    camera.position.set(0, 100, -60);
    camera.lookAt(0, 0, 200); // looking forward + down over the nose
    camera.updateMatrixWorld(true);
    return camera;
  }

  it('projects a level-flight impact ahead of the nose to an on-screen offset', () => {
    const offset = solveBombCueOffset(
      forwardCamera(),
      new THREE.Vector3(0, 100, 0),
      new THREE.Vector3(0, 0, 120),
      FLAT_GROUND,
      { width: 1920, height: 1080 },
    );
    expect(offset).not.toBeNull();
    expect(Number.isFinite(offset!.x)).toBe(true);
    expect(Number.isFinite(offset!.y)).toBe(true);
  });

  it('hides the cue (null) when the impact is behind the camera', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
    camera.position.set(0, 100, 0);
    camera.lookAt(0, 0, 200); // facing +Z
    camera.updateMatrixWorld(true);
    // Release moving backward (-Z) so the impact is behind the camera.
    const offset = solveBombCueOffset(
      camera,
      new THREE.Vector3(0, 100, 0),
      new THREE.Vector3(0, 0, -120),
      FLAT_GROUND,
      { width: 1920, height: 1080 },
    );
    expect(offset).toBeNull();
  });
});

describe('FixedWingBombController (per-sortie store + release)', () => {
  const outputs = (over: Partial<BombOutputs> = {}): { out: BombOutputs; spawn: ReturnType<typeof vi.fn> } => {
    const spawn = vi.fn();
    return {
      spawn,
      out: { projectiles: { spawnProjectile: spawn }, ...over },
    };
  };

  it('carries the airframe bomb load and reports no bombs for a gun-only craft', () => {
    expect(new FixedWingBombController(A1_BOMBS).getCapacity()).toBe(4);
    expect(new FixedWingBombController(A1_BOMBS).getRemaining()).toBe(4);
    expect(new FixedWingBombController(null).hasBombs()).toBe(false);
  });

  it('releases a bomb with inherited velocity, impact detonation, and the 16/180 blast', () => {
    const controller = new FixedWingBombController(A1_BOMBS);
    const { out, spawn } = outputs();
    const vel = new THREE.Vector3(10, -2, 120);
    const result = controller.tryRelease(stubAirframe(new THREE.Vector3(0, 100, 0), vel), Faction.US, out);

    expect(result).toBe('released');
    expect(controller.getRemaining()).toBe(3);
    const [pos, spawnedVel, , weaponType, faction, opts] = spawn.mock.calls[0];
    expect(pos).toBeInstanceOf(THREE.Vector3);
    // Zero added muzzle speed: the bomb inherits the aircraft velocity exactly.
    expect(spawnedVel.x).toBeCloseTo(10);
    expect(spawnedVel.z).toBeCloseTo(120);
    expect(weaponType).toBe('bomb');
    expect(faction).toBe(Faction.US); // IFF: allies spared
    expect(opts.detonateOnImpact).toBe(true);
    expect(opts.blastRadius).toBe(16);
    expect(opts.blastDamage).toBe(180);
  });

  it('blocks release while grounded and flashes the airborne hint (no bomb spawned)', () => {
    const controller = new FixedWingBombController(A1_BOMBS);
    const flashAirborneHint = vi.fn();
    const { out, spawn } = outputs({ flashAirborneHint });
    const grounded = stubAirframe(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), false);

    const result = controller.tryRelease(grounded, Faction.US, out);

    expect(result).toBe('grounded');
    expect(spawn).not.toHaveBeenCalled();
    expect(controller.getRemaining()).toBe(4); // no bomb consumed
    expect(flashAirborneHint).toHaveBeenCalled();
  });

  it('runs the sortie load dry with no rearm (A5)', () => {
    const controller = new FixedWingBombController(A1_BOMBS);
    const { out } = outputs();
    const airframe = stubAirframe(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, 0, 120));
    for (let i = 0; i < 4; i++) controller.tryRelease(airframe, Faction.US, out);
    expect(controller.getRemaining()).toBe(0);
    expect(controller.tryRelease(airframe, Faction.US, out)).toBe('empty');
  });

  it('updateCue pushes an offset while airborne and clears it when grounded', () => {
    const controller = new FixedWingBombController(A1_BOMBS);
    const setBombCue = vi.fn();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
    camera.position.set(0, 100, -60);
    camera.lookAt(0, 0, 200);
    camera.updateMatrixWorld(true);
    const out: BombOutputs = {
      camera,
      viewport: { width: 1920, height: 1080 },
      getGroundHeight: FLAT_GROUND,
      setBombCue,
    };

    controller.updateCue(stubAirframe(new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, 0, 120), true), out);
    expect(setBombCue).toHaveBeenLastCalledWith(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));

    controller.updateCue(stubAirframe(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), false), out);
    expect(setBombCue).toHaveBeenLastCalledWith(null);
  });
});
