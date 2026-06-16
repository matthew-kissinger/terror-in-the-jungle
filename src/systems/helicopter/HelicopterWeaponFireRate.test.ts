// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelicopterWeaponSystem } from './HelicopterWeaponSystem';
import type { AircraftWeaponMount } from './AircraftConfigs';
import type { CombatantSystem } from '../combat/CombatantSystem';

// Stub the visual-effect pools so no WebGL is required.
vi.mock('../effects/TracerPool', () => ({
  TracerPool: class {
    spawn = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('../effects/MuzzleFlashSystem', () => ({
  MuzzleFlashSystem: class {
    spawnNPC = vi.fn();
    spawnPlayer = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
  },
  MuzzleFlashVariant: { RIFLE: 0 },
}));
vi.mock('../../utils/Logger');

const HELI_ID = 'heli_fr';

// High fire-rate gun with effectively unlimited ammo for the window under test.
const MINIGUN: AircraftWeaponMount = {
  name: 'M134 Minigun',
  type: 'nose_turret',
  firingMode: 'pilot',
  ammoCapacity: 4000,
  localPosition: [0, -0.3, 2.5],
  fireRate: 50, // rounds/sec
  damage: 15,
  spreadDeg: 2.5,
  tracerInterval: 3,
};

function makeCombatantSystem() {
  return {
    handlePlayerShot: vi.fn().mockReturnValue({ hit: false, point: new THREE.Vector3() }),
    impactEffectsPool: { spawn: vi.fn() },
  } as unknown as CombatantSystem;
}

const pos = new THREE.Vector3(100, 50, 200);
const quat = new THREE.Quaternion();

/**
 * The hitscan accumulator must fire the number of rounds that fit in the
 * frame's `dt` budget (dt-accurate), not a single round per `update()` call.
 *
 * This is a pure behavioral contract: hold the trigger across a single large
 * frame and a single tiny frame and assert that the large frame emits strictly
 * more shots. A frame-rate-capped loop (1 round/update regardless of dt) emits
 * the same count for both and fails this test. We deliberately avoid asserting
 * any exact round count so the test does not pin a tuning constant.
 */
describe('HelicopterWeaponSystem hitscan fire-rate is dt-accurate', () => {
  let ws: HelicopterWeaponSystem;
  let cs: ReturnType<typeof makeCombatantSystem>;

  beforeEach(() => {
    ws = new HelicopterWeaponSystem(new THREE.Scene());
    cs = makeCombatantSystem();
    ws.setCombatantSystem(cs as unknown as CombatantSystem);
    ws.initWeapons(HELI_ID, [MINIGUN]);
    ws.startFiring(HELI_ID);
  });

  it('emits more rounds for a larger frame than a tiny frame', () => {
    // Tiny frame: ~one interval at 50rps (0.02s) -> about a single round.
    ws.update(0.02, HELI_ID, pos, quat, false, false);
    const roundsSmall = (cs.handlePlayerShot as any).mock.calls.length;

    // Fresh system for the large frame so counts do not bleed across runs.
    ws.dispose(HELI_ID);
    (cs.handlePlayerShot as any).mockClear();
    ws.initWeapons(HELI_ID, [MINIGUN]);
    ws.startFiring(HELI_ID);

    // Large frame: 0.2s at 50rps should cover roughly ten intervals.
    ws.update(0.2, HELI_ID, pos, quat, false, false);
    const roundsLarge = (cs.handlePlayerShot as any).mock.calls.length;

    // dt-accurate firing: the big frame must emit strictly more shots than the
    // tiny frame. Frame-capped firing emits 1 for both (roundsLarge === 1).
    expect(roundsLarge).toBeGreaterThan(roundsSmall);
    expect(roundsLarge).toBeGreaterThan(1);
  });

  it('reuses one damage resolver across a multi-round frame while preserving damage', () => {
    ws.update(0.2, HELI_ID, pos, quat, false, false);

    const calls = (cs.handlePlayerShot as any).mock.calls as Array<[
      THREE.Ray,
      (distance: number, isHeadshot: boolean) => number,
      string,
    ]>;
    expect(calls.length).toBeGreaterThan(1);
    const resolver = calls[0][1];
    expect(resolver(40, false)).toBe(MINIGUN.damage);
    expect(calls.every(([, damage]) => damage === resolver)).toBe(true);
  });
});
