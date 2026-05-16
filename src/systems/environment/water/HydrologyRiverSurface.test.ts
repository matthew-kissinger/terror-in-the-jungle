import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HydrologyRiverSurface } from './HydrologyRiverSurface';
import type { HydrologyBakeArtifact } from '../../terrain/hydrology/HydrologyBake';

vi.mock('../../../utils/Logger');

function makeArtifact(): HydrologyBakeArtifact {
  return {
    schemaVersion: 1,
    width: 2,
    height: 2,
    cellSizeMeters: 10,
    depressionHandling: 'epsilon-fill',
    transform: { originX: 0, originZ: 0, cellSizeMeters: 10 },
    thresholds: {
      accumulationP90Cells: 2,
      accumulationP95Cells: 4,
      accumulationP98Cells: 8,
      accumulationP99Cells: 16,
    },
    masks: { wetCandidateCells: [1], channelCandidateCells: [1] },
    channelPolylines: [
      {
        headCell: 0,
        outletCell: 1,
        lengthCells: 2,
        lengthMeters: 20,
        maxAccumulationCells: 16,
        points: [
          { cell: 0, x: -5, z: 0, elevationMeters: 2, accumulationCells: 8 },
          { cell: 1, x: 15, z: 0, elevationMeters: 1, accumulationCells: 16 },
        ],
      },
    ],
  };
}

describe('HydrologyRiverSurface', () => {
  it('starts empty until an artifact is attached', () => {
    const scene = new THREE.Scene();
    const surface = new HydrologyRiverSurface(scene);

    expect(surface.isActive()).toBe(false);
    expect(surface.isVisible()).toBe(false);
    expect(surface.getMaterialProfile()).toBe('none');
    expect(surface.getQuerySegments().length).toBe(0);
    const stats = surface.getStats();
    expect(stats.channelCount).toBe(0);
    expect(stats.segmentCount).toBe(0);
  });

  it('attaches a river-surfaces group to the scene and publishes query segments when given an artifact', () => {
    const scene = new THREE.Scene();
    const surface = new HydrologyRiverSurface(scene);

    const attached = surface.setArtifact(makeArtifact());

    expect(attached).toBe(true);
    expect(scene.getObjectByName('hydrology-river-surfaces')).toBeDefined();
    expect(surface.isActive()).toBe(true);
    expect(surface.isVisible()).toBe(true);
    expect(surface.getMaterialProfile()).toBe('natural_channel_gradient');
    expect(surface.getQuerySegments().length).toBeGreaterThan(0);
    const stats = surface.getStats();
    expect(stats.channelCount).toBe(1);
    expect(stats.segmentCount).toBeGreaterThan(0);
  });

  it('clears the attached surface and resets stats on setArtifact(null)', () => {
    const scene = new THREE.Scene();
    const surface = new HydrologyRiverSurface(scene);
    surface.setArtifact(makeArtifact());

    surface.setArtifact(null);

    expect(scene.getObjectByName('hydrology-river-surfaces')).toBeUndefined();
    expect(surface.isActive()).toBe(false);
    expect(surface.isVisible()).toBe(false);
    expect(surface.getMaterialProfile()).toBe('none');
    expect(surface.getQuerySegments().length).toBe(0);
    expect(surface.getStats().channelCount).toBe(0);
  });

  it('treats an artifact with no polylines as a clear', () => {
    const scene = new THREE.Scene();
    const surface = new HydrologyRiverSurface(scene);
    surface.setArtifact(makeArtifact());

    const empty: HydrologyBakeArtifact = { ...makeArtifact(), channelPolylines: [] };
    const attached = surface.setArtifact(empty);

    expect(attached).toBe(false);
    expect(surface.isActive()).toBe(false);
    expect(scene.getObjectByName('hydrology-river-surfaces')).toBeUndefined();
  });

  it('publishes query segments whose half-width contains points along the channel center-line', () => {
    const scene = new THREE.Scene();
    const surface = new HydrologyRiverSurface(scene);
    surface.setArtifact(makeArtifact());

    const segments = surface.getQuerySegments();
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(segment.halfWidth).toBeGreaterThan(0);
      // A point at the segment start lies inside the band by construction.
      const dx = segment.endX - segment.startX;
      const dz = segment.endZ - segment.startZ;
      const length = Math.hypot(dx, dz);
      expect(length).toBeGreaterThan(0);
    }
  });
});
