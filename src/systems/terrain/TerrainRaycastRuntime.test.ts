// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { TerrainRaycastRuntime } from './TerrainRaycastRuntime';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import type { LOSAccelerator as LOSAcceleratorType } from '../combat/LOSAccelerator';

function createRuntime() {
  const losAccelerator = {
    registerChunk: vi.fn(),
    unregisterChunk: vi.fn(),
    clear: vi.fn(),
  } as unknown as LOSAcceleratorType;

  return {
    runtime: new TerrainRaycastRuntime(losAccelerator),
    losAccelerator: losAccelerator as unknown as {
      registerChunk: ReturnType<typeof vi.fn>;
      unregisterChunk: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
    },
  };
}

// A vertical ray dropped straight down onto the terrain directly under the
// near-field center. "Blocked before the floor" means the terrain surface is
// raised here; "clear to the floor" means it is at ground level. This is a
// pure caller-side observation (LOS result), not an internal-state assertion.
function losThroughTerrain(
  los: LOSAccelerator,
  x: number,
  z: number,
): { clear: boolean; hitY?: number } {
  const origin = new THREE.Vector3(x, 200, z);
  const target = new THREE.Vector3(x, -10, z);
  const maxDistance = origin.distanceTo(target);
  const result = los.checkLineOfSight(origin, target, maxDistance);
  return { clear: result.clear, hitY: result.hitPoint?.y };
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
    const registeredMesh = losAccelerator.registerChunk.mock.calls.at(-1)?.[1] as THREE.Mesh;
    expect(registeredMesh.geometry.boundsTree).toBeDefined();
  });

  it('serves a consistent snapshot to LOS queries while a rebuild is mid-flight, then the new geometry after it completes', () => {
    // Use a real LOSAccelerator so the test observes actual raycast answers
    // (not a mock), which is what fire-authority / AI LOS depend on.
    const los = new LOSAccelerator();
    const runtime = new TerrainRaycastRuntime(los);

    // First terrain: a flat floor at y = 0 centered at the origin.
    const flatFloor = () => 0;
    runtime.forceRebuildNearFieldMesh(new THREE.Vector3(0, 0, 0), 180, flatFloor);

    // The probe point sits well inside the near field of BOTH the original
    // center and the shifted one below, so the same world location is covered
    // before and during the rebuild. Pick a point near a low-z row so the
    // rebuild rewrites it early in the row sweep — that is exactly where an
    // in-place rebuild would expose a half-written (hybrid) surface.
    const probeX = 0;
    const probeZ = -150;

    const beforeRebuild = losThroughTerrain(los, probeX, probeZ);
    // Sanity: the flat floor at y=0 is the only surface; the drop hits near 0.
    expect(beforeRebuild.clear).toBe(false);
    expect(beforeRebuild.hitY).toBeCloseTo(0, 1);

    // Second terrain: nudge the center past the rebuild threshold (the probe
    // point stays comfortably inside the new near field) and raise the whole
    // surface to a plateau at y = 80. A correct double buffer must not let any
    // query observe a half-raised surface mid-rebuild.
    const center2 = new THREE.Vector3(60, 0, 0);
    const plateau = () => 80;

    // Queue the rebuild and process enough row slices that the probe row has
    // been written into the BACK buffer, but the rebuild has NOT completed.
    // An in-place rebuild would now report the raised (or hybrid) surface;
    // the double-buffered one keeps serving the untouched front snapshot.
    runtime.updateNearFieldMesh(center2, 180, 50, plateau, 4);
    runtime.updateNearFieldMesh(center2, 180, 50, plateau, 4);
    runtime.updateNearFieldMesh(center2, 180, 50, plateau, 4);
    expect(runtime.getPendingRowCount()).toBeGreaterThan(0);

    // While mid-rebuild, the query must return exactly the pre-rebuild answer
    // — never a hybrid where some triangles are at y=0 and others at y=80.
    const midRebuild = losThroughTerrain(los, probeX, probeZ);
    expect(midRebuild.clear).toBe(beforeRebuild.clear);
    expect(midRebuild.hitY).toBeCloseTo(beforeRebuild.hitY!, 1);

    // Drain the remaining rows so the rebuild completes and swaps in.
    for (let i = 0; i < 40 && runtime.getPendingRowCount() > 0; i++) {
      runtime.updateNearFieldMesh(center2, 180, 50, plateau, 4);
    }
    expect(runtime.getPendingRowCount()).toBe(0);

    // After the swap, the same probe location sees the raised plateau.
    const afterRebuild = losThroughTerrain(los, probeX, probeZ);
    expect(afterRebuild.clear).toBe(false);
    expect(afterRebuild.hitY).toBeCloseTo(80, 1);
  });
});
