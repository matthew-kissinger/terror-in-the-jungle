// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import { resolveStrikeGate, horizontalDistanceXZ } from './StrikeGates';

describe('StrikeGates', () => {
  describe('horizontalDistanceXZ', () => {
    it('ignores the Y axis (planar distance only)', () => {
      expect(horizontalDistanceXZ(0, 0, 3, 4)).toBeCloseTo(5);
      expect(horizontalDistanceXZ(-10, 5, -10, 5)).toBe(0);
    });
  });

  describe('resolveStrikeGate', () => {
    const base = { horizontalDistance: 100, hasGround: true, friendliesInRadius: 0 };

    it('is valid for an in-range ground mark with no friendlies near', () => {
      const r = resolveStrikeGate({ ...base, maxCallRange: 1500 });
      expect(r.status).toBe('valid');
      expect(r.canCommit).toBe(true);
      expect(r.requiresOverride).toBe(false);
    });

    it('reports no_ground when the ray missed terrain, even if in range', () => {
      const r = resolveStrikeGate({ ...base, hasGround: false, maxCallRange: 1500 });
      expect(r.status).toBe('no_ground');
      expect(r.canCommit).toBe(false);
    });

    it('reports out_of_range past the max call range', () => {
      const r = resolveStrikeGate({ ...base, horizontalDistance: 2000, maxCallRange: 1500 });
      expect(r.status).toBe('out_of_range');
      expect(r.canCommit).toBe(false);
    });

    it('treats an undefined max range as unlimited', () => {
      const r = resolveStrikeGate({ ...base, horizontalDistance: 99999, maxCallRange: undefined });
      expect(r.status).toBe('valid');
    });

    it('flags danger_close and requires an override when friendlies are in the envelope', () => {
      const r = resolveStrikeGate({
        ...base,
        maxCallRange: undefined,
        dangerCloseRadius: 180,
        friendliesInRadius: 2,
      });
      expect(r.status).toBe('danger_close');
      expect(r.canCommit).toBe(false);
      expect(r.requiresOverride).toBe(true);
    });

    it('does not flag danger_close when the asset has no danger-close envelope', () => {
      const r = resolveStrikeGate({
        ...base,
        dangerCloseRadius: undefined,
        friendliesInRadius: 5,
      });
      expect(r.status).toBe('valid');
    });

    it('prioritises out_of_range over danger_close', () => {
      const r = resolveStrikeGate({
        horizontalDistance: 3000,
        hasGround: true,
        maxCallRange: 1500,
        dangerCloseRadius: 180,
        friendliesInRadius: 3,
      });
      expect(r.status).toBe('out_of_range');
    });
  });
});
