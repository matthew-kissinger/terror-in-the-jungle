// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createExplosionEffect } from './ExplosionEffectFactory';

function createTexture(): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

describe('createExplosionEffect', () => {
  it('keeps point particle materials textureless for WebGPU geometry compatibility', () => {
    const smokeTexture = createTexture();
    const flashTexture = createTexture();
    const debrisTexture = createTexture();
    const effect = createExplosionEffect(smokeTexture, flashTexture, debrisTexture);

    expect((effect.flashSprite.material as THREE.SpriteMaterial).map).toBe(flashTexture);
    expect((effect.smokeParticles.material as THREE.PointsMaterial).map).toBeNull();
    expect((effect.fireParticles.material as THREE.PointsMaterial).map).toBeNull();
    expect((effect.debrisParticles.material as THREE.PointsMaterial).map).toBeNull();
  });

  it('caches particle position attributes and arrays for pooled update paths', () => {
    const smokeTexture = createTexture();
    const flashTexture = createTexture();
    const debrisTexture = createTexture();
    const effect = createExplosionEffect(smokeTexture, flashTexture, debrisTexture);

    expect(effect.smokePositionAttribute).toBe(effect.smokeParticles.geometry.getAttribute('position'));
    expect(effect.firePositionAttribute).toBe(effect.fireParticles.geometry.getAttribute('position'));
    expect(effect.debrisPositionAttribute).toBe(effect.debrisParticles.geometry.getAttribute('position'));
    expect(effect.smokePositionArray).toBe(effect.smokePositionAttribute.array);
    expect(effect.firePositionArray).toBe(effect.firePositionAttribute.array);
    expect(effect.debrisPositionArray).toBe(effect.debrisPositionAttribute.array);
  });
});
