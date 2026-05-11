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
});
