import * as THREE from 'three';

/**
 * Creates procedural textures for explosion effects
 */
export function createSmokeTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Create soft smoke particle
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(100, 100, 100, 0.8)');
  gradient.addColorStop(0.5, 'rgba(80, 80, 80, 0.4)');
  gradient.addColorStop(1, 'rgba(60, 60, 60, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createFlashTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Create bright flash with more intense core
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.1, 'rgba(255, 255, 200, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 200, 100, 0.9)');
  gradient.addColorStop(0.6, 'rgba(255, 120, 0, 0.6)');
  gradient.addColorStop(1, 'rgba(200, 60, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createDebrisTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  // Create dark debris particle
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(40, 30, 20, 1)');
  gradient.addColorStop(0.5, 'rgba(30, 20, 10, 0.8)');
  gradient.addColorStop(1, 'rgba(20, 15, 10, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
