/**
 * Behavior tests for `AmmoManager` focused on the WorldBuilder
 * `infiniteAmmo` wiring (cycle-2026-05-09-doc-decomposition-and-wiring,
 * Phase 1 R2). Per docs/TESTING.md, these assert the observable seam:
 * `consumeRound()` returns true without decrementing the magazine when
 * the dev god-mode flag is set, and behaves normally otherwise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AmmoManager } from './AmmoManager';

const FULL_WB_STATE = {
  invulnerable: false,
  infiniteAmmo: false,
  noClip: false,
  oneShotKills: false,
  shadowsEnabled: true,
  postProcessEnabled: true,
  hudVisible: true,
  ambientAudioEnabled: true,
  npcTickPaused: false,
  forceTimeOfDay: -1,
  active: true,
};

describe('AmmoManager — WorldBuilder infiniteAmmo wiring', () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window ?? {};
  });

  afterEach(() => {
    delete (globalThis as any).window?.__worldBuilder;
  });

  it('decrements the magazine on consumeRound by default', () => {
    const ammo = new AmmoManager(30, 90);
    const before = ammo.getState().currentMagazine;
    expect(ammo.consumeRound()).toBe(true);
    expect(ammo.getState().currentMagazine).toBe(before - 1);
  });

  it('does not decrement when window.__worldBuilder.infiniteAmmo is true', () => {
    (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, infiniteAmmo: true };
    const ammo = new AmmoManager(30, 90);
    const before = ammo.getState().currentMagazine;
    // Fire many rounds — magazine must stay full and shots must keep succeeding.
    for (let i = 0; i < 50; i++) {
      expect(ammo.consumeRound()).toBe(true);
    }
    expect(ammo.getState().currentMagazine).toBe(before);
    expect(ammo.getState().needsReload).toBe(false);
  });

  it('decrements normally when infiniteAmmo flag is false', () => {
    (globalThis as any).window.__worldBuilder = { ...FULL_WB_STATE, infiniteAmmo: false };
    const ammo = new AmmoManager(30, 90);
    const before = ammo.getState().currentMagazine;
    ammo.consumeRound();
    expect(ammo.getState().currentMagazine).toBe(before - 1);
  });
});
