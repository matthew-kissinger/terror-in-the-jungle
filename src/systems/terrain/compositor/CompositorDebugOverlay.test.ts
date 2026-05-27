import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type {
  FlattenCapsuleTerrainStamp,
  FlattenCircleTerrainStamp,
  TerrainStampConfig,
} from '../TerrainFeatureTypes';
import type { IHeightProvider } from '../IHeightProvider';
import {
  classifyStampColor,
  createCompositorDebugOverlay,
  type CompositorDebugOverlaySource,
  type CompositorOverlayConflict,
} from './CompositorDebugOverlay';
import { stampAABB } from './TerrainStampConflictDetector';
import { HYDROLOGY_TERRAIN_PRIORITY } from '../hydrology/HydrologyTerrainFeatures';

function stubProvider(): IHeightProvider {
  return {
    getHeightAt: () => 100,
    getWorkerConfig: () => ({ type: 'noise', seed: 0 }),
  };
}

function capsule(overrides: Partial<FlattenCapsuleTerrainStamp> = {}): FlattenCapsuleTerrainStamp {
  return {
    kind: 'flatten_capsule',
    startX: 0,
    startZ: 0,
    endX: 30,
    endZ: 0,
    innerRadius: 4,
    outerRadius: 8,
    gradeRadius: 10,
    gradeStrength: 0.4,
    samplingRadius: 6,
    targetHeightMode: 'center',
    heightOffset: 0,
    priority: 40,
    ...overrides,
  };
}

function circle(overrides: Partial<FlattenCircleTerrainStamp> = {}): FlattenCircleTerrainStamp {
  return {
    kind: 'flatten_circle',
    centerX: 0,
    centerZ: 0,
    innerRadius: 10,
    outerRadius: 14,
    gradeRadius: 16,
    gradeStrength: 0.5,
    samplingRadius: 8,
    targetHeightMode: 'center',
    heightOffset: 0,
    priority: 60,
    ...overrides,
  };
}

function findLines(group: THREE.Group, name: string): THREE.LineSegments | undefined {
  return group.children.find(
    (c): c is THREE.LineSegments => c instanceof THREE.LineSegments && c.name === name,
  );
}

describe('CompositorDebugOverlay', () => {
  it('draws one wireframe AABB per stamp in the composed output', () => {
    // A stamp wireframe is a cube of 12 edges (24 verts), regardless of kind.
    // For three stamps we expect 36 line segments = 72 verts on the
    // single batched LineSegments object.
    const stamps: TerrainStampConfig[] = [
      capsule({ priority: 40, startX: -100, endX: -50 }),  // hydrology band
      circle({ priority: 60, centerX: 200, centerZ: 0 }),  // airfield band
      circle({ priority: 100, centerX: 0, centerZ: 300 }), // motor-pool band
    ];

    const overlay = createCompositorDebugOverlay({
      getOutput: () => ({
        stamps,
        conflicts: [],
        composedProvider: stubProvider(),
      }),
    } satisfies CompositorDebugOverlaySource);

    const group = new THREE.Group();
    overlay.mount(group);

    const stampLines = findLines(group, 'compositor-stamp-aabbs');
    expect(stampLines).toBeDefined();
    const positionAttr = stampLines!.geometry.getAttribute('position');
    // 3 stamps × 12 edges × 2 verts = 72 verts.
    expect(positionAttr.count).toBe(72);
    // A second LineSegments object only exists when conflicts > 0.
    expect(findLines(group, 'compositor-conflict-edges')).toBeUndefined();

    overlay.unmount();
  });

  it('draws a conflict edge for every conflict pair reported by the compositor', () => {
    const stamps: TerrainStampConfig[] = [
      capsule({ startX: 0, startZ: 0, endX: 30, endZ: 0 }),
      capsule({ startX: 20, startZ: 0, endX: 60, endZ: 0 }),
      capsule({ startX: 100, startZ: 100, endX: 130, endZ: 100 }),
    ];
    const conflicts: CompositorOverlayConflict[] = [
      {
        stampA: 0,
        stampB: 1,
        overlapAABB: { minX: 12, minZ: -8, maxX: 38, maxZ: 8 },
      },
      {
        stampA: 0,
        stampB: 2,
        overlapAABB: { minX: 80, minZ: 80, maxX: 120, maxZ: 120 },
      },
    ];

    const overlay = createCompositorDebugOverlay({
      getOutput: () => ({ stamps, conflicts, composedProvider: stubProvider() }),
    });

    const group = new THREE.Group();
    overlay.mount(group);

    const conflictLines = findLines(group, 'compositor-conflict-edges');
    expect(conflictLines).toBeDefined();
    const positionAttr = conflictLines!.geometry.getAttribute('position');
    // Each conflict contributes two line segments (center → overlap-mid →
    // center) so the buffer length is 2 conflicts × 2 segs × 2 verts = 8 verts.
    expect(positionAttr.count).toBe(8);

    overlay.unmount();
  });

  it('disposes geometry and material when the overlay is toggled off', () => {
    const stamps: TerrainStampConfig[] = [capsule(), circle({ priority: 110 })];
    const conflicts: CompositorOverlayConflict[] = [
      { stampA: 0, stampB: 1, overlapAABB: stampAABB(stamps[0]) },
    ];

    const overlay = createCompositorDebugOverlay({
      getOutput: () => ({ stamps, conflicts, composedProvider: stubProvider() }),
    });

    const group = new THREE.Group();
    overlay.mount(group);

    const stampLines = findLines(group, 'compositor-stamp-aabbs');
    const conflictLines = findLines(group, 'compositor-conflict-edges');
    expect(stampLines).toBeDefined();
    expect(conflictLines).toBeDefined();

    const stampGeom = stampLines!.geometry;
    const stampMat = stampLines!.material as THREE.Material;
    const conflictGeom = conflictLines!.geometry;
    const conflictMat = conflictLines!.material as THREE.Material;

    let stampGeomDisposed = false;
    let stampMatDisposed = false;
    let conflictGeomDisposed = false;
    let conflictMatDisposed = false;
    stampGeom.addEventListener('dispose', () => { stampGeomDisposed = true; });
    stampMat.addEventListener('dispose', () => { stampMatDisposed = true; });
    conflictGeom.addEventListener('dispose', () => { conflictGeomDisposed = true; });
    conflictMat.addEventListener('dispose', () => { conflictMatDisposed = true; });

    overlay.unmount();

    expect(stampGeomDisposed).toBe(true);
    expect(stampMatDisposed).toBe(true);
    expect(conflictGeomDisposed).toBe(true);
    expect(conflictMatDisposed).toBe(true);
    expect(group.children).not.toContain(stampLines);
    expect(group.children).not.toContain(conflictLines);
  });

  describe('classifyStampColor', () => {
    // The classifier must agree with the detector's envelope heuristic so the
    // overlay's airfield-envelope wireframe matches the AABB the detector and
    // resolver act on. Pin all four branches: envelope, hydrology, other
    // capsule (route / flow), and circle (facility).
    it('classifies envelope-class capsules distinctly from narrow capsules and circles', () => {
      const envelope = capsule({ outerRadius: 8, gradeRadius: 60 });  // ramp 52, envelope-class
      const hydrology = capsule({ outerRadius: 8, gradeRadius: 10, priority: HYDROLOGY_TERRAIN_PRIORITY });
      const route = capsule({ outerRadius: 8, gradeRadius: 10, priority: 56 });
      const facility = circle({ priority: 60 });

      const envelopeColor = classifyStampColor(envelope);
      const hydrologyColor = classifyStampColor(hydrology);
      const routeColor = classifyStampColor(route);
      const facilityColor = classifyStampColor(facility);

      // All four categories must produce distinct colours so reviewers can
      // tell airfield envelopes apart from hydrology channels in the wireframe.
      const colors = new Set([envelopeColor, hydrologyColor, routeColor, facilityColor]);
      expect(colors.size).toBe(4);
    });

    it('treats an OF airfield envelope-style capsule (low priority) as envelope, not hydrology', () => {
      // Regression: airfield envelope stamps ship priority ~30 (basePriority -
      // 20), below the old hydrology priority band. The old priority-band
      // classifier coloured them as hydrology; the new heuristic uses ramp
      // width and classifies them correctly.
      const envelopeAtLowPriority = capsule({
        outerRadius: 30,
        gradeRadius: 78,  // ramp 48 m, matches AIRFIELD_ENVELOPE_GRADE_RAMP_M
        priority: 30,
      });
      const hydrologyAtSamePriorityBand = capsule({
        outerRadius: 8,
        gradeRadius: 10,
        priority: HYDROLOGY_TERRAIN_PRIORITY,
      });
      expect(classifyStampColor(envelopeAtLowPriority)).not.toBe(
        classifyStampColor(hydrologyAtSamePriorityBand),
      );
    });
  });

  it('builds an empty stamp batch and no conflict batch when output is null', () => {
    // Regression: the overlay's first toggle-on can happen before mode startup
    // has cached a TerrainCompositorOutput (e.g. menu screen, mode loading).
    const overlay = createCompositorDebugOverlay({ getOutput: () => null });
    const group = new THREE.Group();
    overlay.mount(group);

    const stampLines = findLines(group, 'compositor-stamp-aabbs');
    expect(stampLines).toBeDefined();
    expect(stampLines!.geometry.getAttribute('position').count).toBe(0);
    expect(findLines(group, 'compositor-conflict-edges')).toBeUndefined();

    overlay.unmount();
  });
});
