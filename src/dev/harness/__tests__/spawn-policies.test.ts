/**
 * Spawn policy behavior tests — pure, no engine.
 */

import { describe, it, expect } from 'vitest';
import { resolveSpawnPoint } from '../spawn-policies';
import type { WorldHostileQuery } from '../spawn-policies';
import { Faction } from '../../../systems/combat/types';

function fakeWorld(hostiles: { x: number; y?: number; z: number }[]): WorldHostileQuery {
  return {
    getPlayerPosition: () => ({ x: 0, y: 0, z: 0 }),
    findCombatants: () => hostiles.map((h) => ({ x: h.x, y: h.y ?? 0, z: h.z })),
  };
}

function seededRng(): () => number {
  let s = 0x1234;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 0) / 0x100000000;
  };
}

describe('resolveSpawnPoint', () => {
  it('at-spawn-point returns the current player position', () => {
    const r = resolveSpawnPoint({ kind: 'at-spawn-point' }, fakeWorld([]), seededRng());
    expect(r.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.source).toBe('at-spawn-point');
  });

  it('coords returns the supplied position', () => {
    const r = resolveSpawnPoint(
      { kind: 'coords', position: { x: 10, y: 1, z: 20 }, yawRad: 1.2 },
      fakeWorld([]),
      seededRng(),
    );
    expect(r.position).toEqual({ x: 10, y: 1, z: 20 });
    expect(r.yawRad).toBeCloseTo(1.2, 4);
  });

  it('within-engagement-range places the player within [min, max] of a hostile', () => {
    const hostiles = [{ x: 100, z: 100 }];
    const r = resolveSpawnPoint(
      { kind: 'within-engagement-range', targetFaction: Faction.NVA, minDistM: 30, maxDistM: 60 },
      fakeWorld(hostiles),
      seededRng(),
    );
    const dist = Math.hypot(r.position.x - 100, r.position.z - 100);
    expect(dist).toBeGreaterThanOrEqual(30 - 0.001);
    expect(dist).toBeLessThanOrEqual(60 + 0.001);
  });

  it('within-engagement-range falls back gracefully when no hostiles exist', () => {
    const r = resolveSpawnPoint(
      { kind: 'within-engagement-range', targetFaction: 'opfor', minDistM: 30, maxDistM: 60 },
      fakeWorld([]),
      seededRng(),
    );
    expect(r.source).toMatch(/fallback/);
  });

  it('within-engagement-range honours string faction-group selectors', () => {
    const r = resolveSpawnPoint(
      { kind: 'within-engagement-range', targetFaction: 'opfor', minDistM: 10, maxDistM: 20 },
      fakeWorld([{ x: 50, z: 0 }]),
      seededRng(),
    );
    const dist = Math.hypot(r.position.x - 50, r.position.z);
    expect(dist).toBeGreaterThanOrEqual(10 - 0.001);
    expect(dist).toBeLessThanOrEqual(20 + 0.001);
  });
});
