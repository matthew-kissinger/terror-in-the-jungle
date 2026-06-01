import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHydrologyRiverGeometry } from './HydrologyRiverGeometry';
import {
  makeHydrologyArtifact,
  makeChannelPolyline,
  makePolylinePoint,
} from '../../../test-utils';
import type { HydrologyChannelPolyline } from '../../terrain/hydrology/HydrologyBake';

// L1 behavior tests for the pure river-geometry builder. We assert the
// observable mesh/query outputs (attribute presence + internal consistency,
// connectivity, value bounds, determinism) rather than tuning constants
// (colors, alphas, surface offset, channel/segment caps).

describe('buildHydrologyRiverGeometry', () => {
  it('returns null when the artifact has no channels', () => {
    const artifact = makeHydrologyArtifact({ channelPolylines: [] });
    expect(buildHydrologyRiverGeometry(artifact)).toBeNull();
  });

  it('returns null when the only channel is too short to span a segment', () => {
    // A single degenerate point cannot form a >=2-point ribbon.
    const channel = makeChannelPolyline({
      points: [makePolylinePoint({ cell: 0, x: 0, z: 0 })],
    });
    const artifact = makeHydrologyArtifact({ channelPolylines: [channel] });
    expect(buildHydrologyRiverGeometry(artifact)).toBeNull();
  });

  it('builds a triangulated mesh with the attributes the flow shader reads', () => {
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact());
    expect(build).not.toBeNull();
    const geo = build!.geometry;

    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    expect(geo.getAttribute('position').itemSize).toBe(3);
    expect(geo.getAttribute('normal').itemSize).toBe(3);
    expect(geo.getAttribute('uv').itemSize).toBe(2);
    // Vertex color carries a depth-tint alpha, so it is a vec4.
    expect(geo.getAttribute('color').itemSize).toBe(4);
    // Per-vertex flow direction (vec2 world-XZ) + foam mask (float) the
    // onBeforeCompile patch consumes.
    expect(geo.getAttribute('aFlowDir').itemSize).toBe(2);
    expect(geo.getAttribute('aFoamMask').itemSize).toBe(1);
    expect(geo.getIndex()).not.toBeNull();
  });

  it('keeps every per-vertex attribute aligned to the same vertex count', () => {
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact())!;
    const geo = build.geometry;
    const vertexCount = geo.getAttribute('position').count;

    expect(vertexCount).toBeGreaterThan(0);
    expect(geo.getAttribute('normal').count).toBe(vertexCount);
    expect(geo.getAttribute('uv').count).toBe(vertexCount);
    expect(geo.getAttribute('color').count).toBe(vertexCount);
    expect(geo.getAttribute('aFlowDir').count).toBe(vertexCount);
    expect(geo.getAttribute('aFoamMask').count).toBe(vertexCount);
    // Stats report the same vertex count the buffer actually holds.
    expect(build.stats.vertexCount).toBe(vertexCount);
  });

  it('emits indices that all reference real vertices', () => {
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact())!;
    const geo = build.geometry;
    const vertexCount = geo.getAttribute('position').count;
    const index = geo.getIndex()!;

    // Triangles, so the index count is a multiple of 3.
    expect(index.count % 3).toBe(0);
    expect(index.count).toBeGreaterThan(0);
    for (let i = 0; i < index.count; i++) {
      const v = index.getX(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(vertexCount);
    }
  });

  it('produces a finite bounded mesh (no NaN positions)', () => {
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact())!;
    const pos = build.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
    expect(build.geometry.boundingBox).not.toBeNull();
    expect(build.geometry.boundingSphere).not.toBeNull();
  });

  it('reports stats consistent with the emitted query segments', () => {
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact())!;

    expect(build.stats.channelCount).toBe(1);
    expect(build.stats.segmentCount).toBeGreaterThan(0);
    // One query segment is published per rendered ribbon segment.
    expect(build.querySegments.length).toBe(build.stats.segmentCount);
    expect(build.stats.totalLengthMeters).toBeGreaterThan(0);
    expect(build.stats.maxAccumulationCells).toBeGreaterThan(0);
  });

  it('publishes query segments that form a forward-connected polyline with positive width', () => {
    // A longer multi-point channel exercises segment chaining.
    const channel = makeChannelPolyline({
      points: [
        makePolylinePoint({ cell: 0, x: 0, z: 0, elevationMeters: 6, accumulationCells: 8 }),
        makePolylinePoint({ cell: 1, x: 60, z: 0, elevationMeters: 4, accumulationCells: 12 }),
        makePolylinePoint({ cell: 2, x: 120, z: 0, elevationMeters: 2, accumulationCells: 16 }),
      ],
    });
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact({ channelPolylines: [channel] }))!;
    const segments = build.querySegments;

    expect(segments.length).toBeGreaterThan(1);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]!;
      expect(s.halfWidth).toBeGreaterThan(0);
      // Each segment has a real length and a unit-length flow direction.
      const length = Math.hypot(s.endX - s.startX, s.endZ - s.startZ);
      expect(length).toBeGreaterThan(0);
      expect(Math.hypot(s.flowX, s.flowZ)).toBeCloseTo(1, 5);
      expect(s.flowSpeedMetersPerSecond).toBeGreaterThan(0);
      // Consecutive segments are tip-to-tail along the channel.
      if (i > 0) {
        const prev = segments[i - 1]!;
        expect(s.startX).toBeCloseTo(prev.endX, 5);
        expect(s.startZ).toBeCloseTo(prev.endZ, 5);
      }
    }
  });

  it('orients flow direction downstream (a straight +X channel flows toward +X)', () => {
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact())!;
    for (const s of build.querySegments) {
      expect(s.flowX).toBeGreaterThan(0.9);
      expect(Math.abs(s.flowZ)).toBeLessThan(0.1);
    }
    // The baked per-vertex flow attribute agrees with the +X channel too.
    const flow = build.geometry.getAttribute('aFlowDir');
    expect(flow.getX(0)).toBeCloseTo(1, 5);
    expect(flow.getY(0)).toBeCloseTo(0, 5);
  });

  it('bakes a foam mask in the unit interval for every vertex', () => {
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact())!;
    const foam = build.geometry.getAttribute('aFoamMask');
    let sawPositive = false;
    for (let i = 0; i < foam.count; i++) {
      const value = foam.getX(i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (value > 0) sawPositive = true;
    }
    // The default channel has a downstream drop, so some foam is produced.
    expect(sawPositive).toBe(true);
  });

  it('scales flow speed up for higher-drainage channels (more accumulation = faster current)', () => {
    // Two artifacts identical except for channel accumulation. The bigger
    // channel should carry strictly more current at its segments.
    const lowChannel = makeChannelPolyline({
      maxAccumulationCells: 9,
      points: [
        makePolylinePoint({ cell: 0, x: 0, z: 0, elevationMeters: 2, accumulationCells: 9 }),
        makePolylinePoint({ cell: 1, x: 30, z: 0, elevationMeters: 1.9, accumulationCells: 9 }),
      ],
    });
    const highChannel = makeChannelPolyline({
      maxAccumulationCells: 64,
      points: [
        makePolylinePoint({ cell: 0, x: 0, z: 0, elevationMeters: 2, accumulationCells: 64 }),
        makePolylinePoint({ cell: 1, x: 30, z: 0, elevationMeters: 1.9, accumulationCells: 64 }),
      ],
    });
    const thresholds = {
      accumulationP90Cells: 2,
      accumulationP95Cells: 4,
      accumulationP98Cells: 8,
      accumulationP99Cells: 64,
    };

    const low = buildHydrologyRiverGeometry(
      makeHydrologyArtifact({ channelPolylines: [lowChannel], thresholds }),
    )!;
    const high = buildHydrologyRiverGeometry(
      makeHydrologyArtifact({ channelPolylines: [highChannel], thresholds }),
    )!;

    const lowSpeed = low.querySegments[0]!.flowSpeedMetersPerSecond;
    const highSpeed = high.querySegments[0]!.flowSpeedMetersPerSecond;
    expect(highSpeed).toBeGreaterThan(lowSpeed);
    // Wider-drainage channels are also wider on the ground.
    expect(high.querySegments[0]!.halfWidth).toBeGreaterThan(low.querySegments[0]!.halfWidth);
  });

  it('is deterministic: identical artifacts yield byte-identical geometry', () => {
    const a = buildHydrologyRiverGeometry(makeHydrologyArtifact())!;
    const b = buildHydrologyRiverGeometry(makeHydrologyArtifact())!;

    const posA = a.geometry.getAttribute('position').array;
    const posB = b.geometry.getAttribute('position').array;
    expect(posA.length).toBe(posB.length);
    expect(Array.from(posA)).toEqual(Array.from(posB));

    const foamA = a.geometry.getAttribute('aFoamMask').array;
    const foamB = b.geometry.getAttribute('aFoamMask').array;
    expect(Array.from(foamA)).toEqual(Array.from(foamB));

    expect(a.querySegments).toEqual(b.querySegments);
  });

  it('drops the lowest-priority channels when given far more than it can render', () => {
    // Feed many distinct channels; the builder retains a bounded subset.
    const channels: HydrologyChannelPolyline[] = [];
    for (let i = 0; i < 200; i++) {
      const baseZ = i * 40;
      channels.push(
        makeChannelPolyline({
          headCell: i * 2,
          outletCell: i * 2 + 1,
          maxAccumulationCells: 16 + i,
          points: [
            makePolylinePoint({ cell: i * 2, x: 0, z: baseZ, elevationMeters: 5, accumulationCells: 12 }),
            makePolylinePoint({ cell: i * 2 + 1, x: 40, z: baseZ, elevationMeters: 4, accumulationCells: 16 + i }),
          ],
        }),
      );
    }
    const build = buildHydrologyRiverGeometry(makeHydrologyArtifact({ channelPolylines: channels }))!;

    // Capping behavior: it renders some channels, but strictly fewer than the
    // 200 supplied (the exact cap is a tuning constant we don't assert).
    expect(build.stats.channelCount).toBeGreaterThan(0);
    expect(build.stats.channelCount).toBeLessThan(channels.length);
  });

  it('retains the highest-drainage channel when capping (priority by accumulation)', () => {
    // One dominant channel plus many tiny ones; the dominant channel's
    // accumulation must survive into the reported max.
    const channels: HydrologyChannelPolyline[] = [
      makeChannelPolyline({
        headCell: 0,
        outletCell: 1,
        maxAccumulationCells: 9000,
        points: [
          makePolylinePoint({ cell: 0, x: 0, z: 0, elevationMeters: 5, accumulationCells: 4000 }),
          makePolylinePoint({ cell: 1, x: 80, z: 0, elevationMeters: 3, accumulationCells: 9000 }),
        ],
      }),
    ];
    for (let i = 0; i < 100; i++) {
      const baseZ = 200 + i * 30;
      channels.push(
        makeChannelPolyline({
          headCell: 100 + i * 2,
          outletCell: 100 + i * 2 + 1,
          maxAccumulationCells: 17,
          points: [
            makePolylinePoint({ cell: 100 + i * 2, x: 0, z: baseZ, elevationMeters: 4, accumulationCells: 12 }),
            makePolylinePoint({ cell: 100 + i * 2 + 1, x: 30, z: baseZ, elevationMeters: 3.9, accumulationCells: 17 }),
          ],
        }),
      );
    }
    const build = buildHydrologyRiverGeometry(
      makeHydrologyArtifact({
        channelPolylines: channels,
        thresholds: {
          accumulationP90Cells: 2,
          accumulationP95Cells: 4,
          accumulationP98Cells: 8,
          accumulationP99Cells: 9000,
        },
      }),
    )!;

    expect(build.stats.maxAccumulationCells).toBe(9000);
  });
});
