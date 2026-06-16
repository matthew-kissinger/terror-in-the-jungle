// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FlashbangScreenEffect } from './FlashbangScreenEffect';

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('FlashbangScreenEffect', () => {
  let effect: FlashbangScreenEffect;

  beforeEach(async () => {
    document.body.innerHTML = '';
    effect = new FlashbangScreenEffect();
    await effect.init();
  });

  afterEach(() => {
    effect.dispose();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('rejects out-of-range flashes before exact distance math or overlay updates', () => {
    const sqrtSpy = vi.spyOn(Math, 'sqrt');
    const overlay = document.getElementById('flashbang-overlay') as HTMLDivElement;
    overlay.style.opacity = '0.2';

    effect.triggerFlash(
      new THREE.Vector3(26, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    );

    expect(sqrtSpy).not.toHaveBeenCalled();
    expect(effect.getFlashIntensity()).toBe(0);
    expect(overlay.style.opacity).toBe('0.2');
  });

  it('preserves direct full-range whiteout intensity', () => {
    effect.triggerFlash(
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    );

    expect(effect.getFlashIntensity()).toBeCloseTo(1);
    expect(document.getElementById('flashbang-overlay')?.style.opacity).toBe('1');
  });

  it('preserves partial-range angle-scaled intensity', () => {
    effect.triggerFlash(
      new THREE.Vector3(20, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    );

    expect(effect.getFlashIntensity()).toBeCloseTo(0.5);
    expect(document.getElementById('flashbang-overlay')?.style.opacity).toBe('0.5');
  });

  it('preserves zero-distance half-intensity behavior without normalizing a zero vector', () => {
    const normalizeSpy = vi.spyOn(THREE.Vector3.prototype, 'normalize');

    effect.triggerFlash(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    );

    expect(normalizeSpy).not.toHaveBeenCalled();
    expect(effect.getFlashIntensity()).toBeCloseTo(0.5);
  });

  it('keeps a triggered flash decaying through update', () => {
    effect.triggerFlash(
      new THREE.Vector3(20, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    );

    effect.update(0.75);

    expect(effect.getFlashIntensity()).toBeCloseTo(0.25);
    expect(effect.isFlashed()).toBe(true);
  });
});
