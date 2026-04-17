import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { TerrainRaycastRuntime } from './TerrainRaycastRuntime';
import type { LOSAccelerator } from '../combat/LOSAccelerator';

function createRuntime() {
  const losAccelerator = {
    registerChunk: vi.fn(),
    unregisterChunk: vi.fn(),
    clear: vi.fn(),
  } as unknown as LOSAccelerator;

  return {
    runtime: new TerrainRaycastRuntime(losAccelerator),
    losAccelerator: losAccelerator as unknown as {
      registerChunk: ReturnType<typeof vi.fn>;
      unregisterChunk: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
    },
  };
}

describe('TerrainRaycastRuntime', () => {
  it('drains a queued near-field rebuild across multiple ticks and registers the finished mesh', () => {
    const { runtime, losAccelerator } = createRuntime();
    const center = new THREE.Vector3(0, 0, 0);

    runtime.updateNearFieldMesh(center, 180, 50, () => 0, 4);
    const pendingAfterFirstSlice = runtime.getPendingRowCount();

    runtime.updateNearFieldMesh(center, 180, 50, () => 0, 4);
    const pendingAfterSecondSlice = runtime.getPendingRowCount();

    expect(pendingAfterFirstSlice).toBeGreaterThan(0);
    expect(pendingAfterSecondSlice).toBeLessThan(pendingAfterFirstSlice);

    // Drain remaining work; the runtime should eventually flag readiness and
    // hand the resulting mesh off to the LOS accelerator.
    for (let i = 0; i < 20 && runtime.getPendingRowCount() > 0; i++) {
      runtime.updateNearFieldMesh(center, 180, 50, () => 0, 4);
    }

    expect(runtime.getPendingRowCount()).toBe(0);
    expect(runtime.isReadyForPosition(center, 50)).toBe(true);
    expect(losAccelerator.registerChunk).toHaveBeenCalledWith('bvh_nearfield', expect.any(THREE.Mesh));
  });
});
