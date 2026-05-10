import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createTslInstancedImposterSlice,
  disposeKonveyerInstancedSlice,
  measureKonveyerInstancedSlice,
  populateKonveyerSliceMatrices,
} from './KonveyerInstancedSlice';

function createTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array([
      255, 255, 255, 255,
      32, 128, 64, 255,
      255, 255, 255, 0,
      64, 32, 16, 255,
    ]),
    2,
    2,
    THREE.RGBAFormat,
  );
  texture.needsUpdate = true;
  return texture;
}

describe('KonveyerInstancedSlice', () => {
  it('creates a single-draw vegetation TSL impostor slice with no GLSL strings', async () => {
    const slice = await createTslInstancedImposterSlice({
      surface: 'vegetation-billboard',
      maxInstances: 128,
      width: 5,
      height: 7,
      texture: createTexture(),
    });

    populateKonveyerSliceMatrices(slice, 64);
    const metrics = measureKonveyerInstancedSlice(slice);

    expect(slice.mesh.name).toBe('konveyer-vegetation-billboard-tsl-slice');
    expect(metrics.surface).toBe('vegetation-billboard');
    expect(metrics.maxInstances).toBe(128);
    expect(metrics.activeInstances).toBe(64);
    expect(metrics.nodeMaterial).toBe(true);
    expect(metrics.shaderStringCount).toBe(0);
    expect(metrics.drawCallUpperBound).toBe(1);
    expect(metrics.estimatedGpuWritableBytes).toBeGreaterThan(metrics.geometryAttributeBytes);

    disposeKonveyerInstancedSlice(slice);
  });
});
