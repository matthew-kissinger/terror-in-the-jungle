import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('keeps grenade explosion visuals unlit to avoid first-use light program churn', () => {
    const scene = new THREE.Scene();
    const pool = new ExplosionEffectsPool(scene, 2);

    expect(scene.children.some((child) => child instanceof THREE.PointLight)).toBe(false);
    expect(scene.children).toHaveLength(10);

    pool.spawn(new THREE.Vector3(1, 2, 3));

    expect(scene.children.some((child) => child instanceof THREE.PointLight)).toBe(false);
    expect(scene.children.some((child) => child instanceof THREE.Sprite && child.visible)).toBe(true);

    pool.dispose();
  });
});
