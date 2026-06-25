// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { computeDamage, createGunplayCore, createShotCommand, type WeaponSpec } from './index';

const spec: WeaponSpec = {
  id: 'rifle',
  rpm: 600,
  baseSpreadDeg: 1,
  bloomPerShotDeg: 0.5,
  recoilPerShotDeg: 1.2,
  recoilHorizontalDeg: 0.4,
  damageNear: 40,
  damageFar: 20,
  falloffStart: 10,
  falloffEnd: 50,
  headshotMultiplier: 2,
};

describe('gunplay-core', () => {
  it('uses injected clock for cooldowns', () => {
    let now = 0;
    const core = createGunplayCore(spec, { clock: { nowMs: () => now }, rng: () => 0.5 });
    expect(core.canFire()).toBe(true);
    core.registerShot();
    expect(core.canFire()).toBe(false);
    now = 100;
    expect(core.canFire()).toBe(true);
  });

  it('tracks bloom and recoil with deterministic RNG', () => {
    const core = createGunplayCore(spec, { clock: { nowMs: () => 0 }, rng: () => 0.5 });
    const command = core.registerShot();
    expect(command.spreadDeg).toBeCloseTo(0.5);
    expect(command.recoil.pitchDeg).toBeGreaterThan(0);
    core.cooldown(1);
    expect(core.getSpreadDeg()).toBe(0);
  });

  it('computes damage falloff and headshots', () => {
    expect(computeDamage(spec, 0, false)).toBe(40);
    expect(computeDamage(spec, 50, false)).toBe(20);
    expect(computeDamage(spec, 0, true)).toBe(80);
  });

  it('validates shot commands', () => {
    expect(() => createShotCommand({
      weaponId: 'bad',
      firedAtMs: Number.NaN,
      spreadDeg: 0,
      recoil: { pitchDeg: 0, yawDeg: 0 },
      pelletCount: 1,
      pelletSpreadDeg: 0,
    })).toThrow();
  });
});