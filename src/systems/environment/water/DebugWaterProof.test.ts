// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  createDebugWaterProof,
  sampleDebugWaterProof,
} from './DebugWaterProof';

describe('DebugWaterProof', () => {
  it('samples an elliptical basin as debug-only, non-authoritative water', () => {
    const proof = createDebugWaterProof({
      id: 'open-frontier-debug-water',
      basins: [{
        id: 'test-basin',
        centerX: 10,
        centerZ: -5,
        radiusX: 20,
        radiusZ: 10,
        surfaceY: 3,
        bedY: -2,
      }],
    });

    const sample = sampleDebugWaterProof(proof, 10, -5);

    expect(proof.debugOnly).toBe(true);
    expect(proof.authoritative).toBe(false);
    expect(sample.source).toBe('debug_basin');
    expect(sample.featureId).toBe('test-basin');
    expect(sample.surfaceY).toBe(3);
    expect(sample.depth).toBe(5);
    expect(sample.coverage01).toBe(1);
    expect(sample.debugOnly).toBe(true);
    expect(sample.authoritative).toBe(false);
  });

  it('returns a dry sample outside all basin and river footprints', () => {
    const proof = createDebugWaterProof({
      id: 'dry-proof',
      basins: [{
        id: 'small-basin',
        centerX: 0,
        centerZ: 0,
        radiusX: 5,
        radiusZ: 5,
        surfaceY: 1,
        bedY: 0,
      }],
    });

    const sample = sampleDebugWaterProof(proof, 100, 100);

    expect(sample.source).toBe('none');
    expect(sample.surfaceY).toBeNull();
    expect(sample.depth).toBe(0);
    expect(sample.flowX).toBe(0);
    expect(sample.flowZ).toBe(0);
    expect(sample.authoritative).toBe(false);
  });

  it('samples river width and downstream flow without enabling runtime water', () => {
    const proof = createDebugWaterProof({
      id: 'a-shau-debug-river',
      rivers: [{
        id: 'test-river',
        startX: 0,
        startZ: 0,
        endX: 0,
        endZ: 100,
        halfWidth: 10,
        surfaceY: 4,
        bedY: 1,
        flowMetersPerSecond: 2,
      }],
    });

    const center = sampleDebugWaterProof(proof, 0, 50);
    const bank = sampleDebugWaterProof(proof, 5, 50);

    expect(center.source).toBe('debug_river');
    expect(center.featureId).toBe('test-river');
    expect(center.depth).toBe(3);
    expect(center.coverage01).toBe(1);
    expect(center.flowX).toBe(0);
    expect(center.flowZ).toBe(2);
    expect(bank.coverage01).toBeCloseTo(0.5);
    expect(center.debugOnly).toBe(true);
    expect(center.authoritative).toBe(false);
  });

  it('chooses the deeper overlapping proof feature for debug visualization', () => {
    const proof = createDebugWaterProof({
      id: 'overlap-proof',
      basins: [{
        id: 'shallow-basin',
        centerX: 0,
        centerZ: 0,
        radiusX: 25,
        radiusZ: 25,
        surfaceY: 2,
        bedY: 0,
      }],
      rivers: [{
        id: 'deep-river',
        startX: -10,
        startZ: 0,
        endX: 10,
        endZ: 0,
        halfWidth: 4,
        surfaceY: 3,
        bedY: -4,
        flowMetersPerSecond: 1,
      }],
    });

    const sample = sampleDebugWaterProof(proof, 0, 0);

    expect(sample.source).toBe('debug_river');
    expect(sample.featureId).toBe('deep-river');
    expect(sample.depth).toBe(7);
  });
});
