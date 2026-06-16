// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPLOSION_EFFECT_REPRESENTATION, ExplosionEffect } from './ExplosionEffectFactory';
import { ExplosionEffectsPool } from './ExplosionEffectsPool';

describe('ExplosionEffectsPool', () => {
  beforeEach(() => {
    const gradient = { addColorStop: vi.fn() };
    const context = {
      createRadialGradient: vi.fn(() => gradient),
      fillRect: vi.fn(),
      fillStyle: '',
    };

    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => context),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps grenade explosion visuals on the explicit unlit pooled representation path', () => {
    const scene = new THREE.Scene();
    const pool = new ExplosionEffectsPool(scene, 2);

    expect(EXPLOSION_EFFECT_REPRESENTATION.dynamicLights).toBe(false);
    expect(EXPLOSION_EFFECT_REPRESENTATION.legacyFallback).toBe(false);
    expect(scene.children.some((child) => child instanceof THREE.PointLight)).toBe(false);
    expect(scene.children).toHaveLength(10);

    pool.spawn(new THREE.Vector3(1, 2, 3));

    const flash = scene.children.find((child): child is THREE.Sprite => child instanceof THREE.Sprite && child.visible);
    expect(scene.children.some((child) => child instanceof THREE.PointLight)).toBe(false);
    expect(flash?.name).toBe('ExplosionFlashBillboard');
    expect(flash?.userData.representation).toBe(EXPLOSION_EFFECT_REPRESENTATION.flashPrimitive);
    expect(flash?.userData.legacyFallback).toBe(false);

    pool.dispose();
  });

  it('marks bounded particle position ranges when spawning and updating an explosion', () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100);
    const scene = new THREE.Scene();
    const pool = new ExplosionEffectsPool(scene, 1);

    pool.spawn(new THREE.Vector3(1, 2, 3));

    const smoke = scene.children.find((child): child is THREE.Points => child instanceof THREE.Points && child.name === 'ExplosionSmokePoints')!;
    const fire = scene.children.find((child): child is THREE.Points => child instanceof THREE.Points && child.name === 'ExplosionFirePoints')!;
    const debris = scene.children.find((child): child is THREE.Points => child instanceof THREE.Points && child.name === 'ExplosionDebrisPoints')!;
    const effect = (pool as unknown as { active: ExplosionEffect[] }).active[0];
    const smokePositions = effect.smokePositionAttribute;
    const firePositions = effect.firePositionAttribute;
    const debrisPositions = effect.debrisPositionAttribute;
    const initialSmokeVelocity = effect.smokeVelocities[0].clone();
    const initialFireVelocity = effect.fireVelocities[0].clone();
    const initialDebrisVelocity = effect.debrisVelocities[0].clone();

    expect(smokePositions).toBe(smoke.geometry.getAttribute('position'));
    expect(firePositions).toBe(fire.geometry.getAttribute('position'));
    expect(debrisPositions).toBe(debris.geometry.getAttribute('position'));
    expect(effect.smokePositionArray).toBe(smokePositions.array);
    expect(effect.firePositionArray).toBe(firePositions.array);
    expect(effect.debrisPositionArray).toBe(debrisPositions.array);
    expect(smokePositions.updateRanges.at(-1)).toEqual({ start: 0, count: smokePositions.count * 3 });
    expect(firePositions.updateRanges.at(-1)).toEqual({ start: 0, count: firePositions.count * 3 });
    expect(debrisPositions.updateRanges.at(-1)).toEqual({ start: 0, count: debrisPositions.count * 3 });

    const smokeRangeCount = smokePositions.updateRanges.length;
    const fireRangeCount = firePositions.updateRanges.length;
    const debrisRangeCount = debrisPositions.updateRanges.length;

    pool.update(1 / 60);

    expect(effect.fireVelocities[0].x).toBeCloseTo(initialFireVelocity.x);
    expect(effect.fireVelocities[0].y).toBeCloseTo(initialFireVelocity.y - 0.1);
    expect(effect.fireVelocities[0].z).toBeCloseTo(initialFireVelocity.z);
    expect(effect.debrisVelocities[0].x).toBeCloseTo(initialDebrisVelocity.x);
    expect(effect.debrisVelocities[0].y).toBeCloseTo(initialDebrisVelocity.y - 0.15);
    expect(effect.debrisVelocities[0].z).toBeCloseTo(initialDebrisVelocity.z);
    expect(effect.smokeVelocities[0].x).toBeCloseTo(initialSmokeVelocity.x * 0.98);
    expect(effect.smokeVelocities[0].y).toBeCloseTo((initialSmokeVelocity.y * 0.98) + (0.5 / 60));
    expect(effect.smokeVelocities[0].z).toBeCloseTo(initialSmokeVelocity.z * 0.98);
    expect(smokePositions.updateRanges).toHaveLength(smokeRangeCount + 1);
    expect(firePositions.updateRanges).toHaveLength(fireRangeCount + 1);
    expect(debrisPositions.updateRanges).toHaveLength(debrisRangeCount + 1);
    expect(smokePositions.updateRanges.at(-1)).toEqual({ start: 0, count: smokePositions.count * 3 });
    expect(firePositions.updateRanges.at(-1)).toEqual({ start: 0, count: firePositions.count * 3 });
    expect(debrisPositions.updateRanges.at(-1)).toEqual({ start: 0, count: debrisPositions.count * 3 });

    pool.dispose();
  });

  it('does not read the clock on idle update when no explosions are active', () => {
    const scene = new THREE.Scene();
    const pool = new ExplosionEffectsPool(scene, 1);
    const nowSpy = vi.spyOn(performance, 'now');

    try {
      pool.update(1 / 60);

      expect(nowSpy).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
      pool.dispose();
    }
  });
});
