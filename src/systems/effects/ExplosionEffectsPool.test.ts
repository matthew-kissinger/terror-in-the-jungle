import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPLOSION_EFFECT_REPRESENTATION } from './ExplosionEffectFactory';
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
});
