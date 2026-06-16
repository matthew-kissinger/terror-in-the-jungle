// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * L1 transform tests for the shared map projection. These pin the world->map
 * contract that every canvas renderer (minimap, full map, deploy/respawn map,
 * command tactical map) now shares, so a regression shows up here instead of as
 * a marker that lands on the wrong spot on one map but not another.
 */

import { describe, it, expect } from 'vitest';
import {
  worldToNorthUpMap,
  worldToPlayerCenteredMap,
  worldToPlayerCenteredMapInto,
  playerCenteredMapToWorld,
  factionMarkerFill,
} from './MapProjection';
import { Faction } from '../../systems/combat/types';

describe('worldToNorthUpMap (full map / deploy map projection)', () => {
  // FullMapSystem + OpenFrontierRespawnMap parameterization: MAP_SIZE = 800.
  it('places world origin at the map centre', () => {
    expect(worldToNorthUpMap(0, 0, 3200, 800)).toEqual({ x: 400, y: 400 });
  });

  it('flips X so +X world is left of centre and +Z world is above centre', () => {
    // worldSize 400, mapSize 800 -> scale 2.
    // +X -> (200 - 100) * 2 = 200 (left of centre 400). +Z -> same.
    expect(worldToNorthUpMap(100, 100, 400, 800)).toEqual({ x: 200, y: 200 });
    // -X / -Z land on the opposite side of centre, symmetrically.
    expect(worldToNorthUpMap(-100, -100, 400, 800)).toEqual({ x: 600, y: 600 });
  });

  it('matches the deploy-map worldToMap parameterization used in existing tests', () => {
    // OpenFrontierRespawnMapUtils: WORLD_SIZE 3200, scale 0.25.
    // world (400, 0) -> map (300, 400) is asserted in the deploy-map test.
    expect(worldToNorthUpMap(400, 0, 3200, 800)).toEqual({ x: 300, y: 400 });
  });
});

describe('worldToPlayerCenteredMap (minimap / tactical map projection)', () => {
  it('places the player at the canvas centre', () => {
    const scale = 200 / 400; // size 200, worldSize 400
    expect(
      worldToPlayerCenteredMap(10, -5, 10, -5, 0, 200, scale),
    ).toEqual({ x: 100, y: 100 });
  });

  it('with zero rotation, +X world is right of centre and +Z world is below centre', () => {
    const scale = 200 / 400; // 0.5
    // player at origin, marker at (+40, +20). rotatedX = 40, rotatedZ = 20.
    expect(
      worldToPlayerCenteredMap(40, 20, 0, 0, 0, 200, scale),
    ).toEqual({ x: 100 + 20, y: 100 + 10 });
  });

  it('rotates the world under the player by the player heading', () => {
    const scale = 1;
    // 90-degree player heading rotates a marker due-north (+? ) into the screen.
    const p = worldToPlayerCenteredMap(10, 0, 0, 0, Math.PI / 2, 200, scale);
    // rotatedX = dx*cos + dz*sin = 10*0 + 0 = 0; rotatedZ = -dx*sin = -10.
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(90, 6);
  });

  it('can project into a caller-owned point with the same coordinates', () => {
    const out = { x: 999, y: 999 };
    const projected = worldToPlayerCenteredMapInto(out, 37, -12, 5, 8, Math.PI / 3, 320, 320 / 600);
    const allocated = worldToPlayerCenteredMap(37, -12, 5, 8, Math.PI / 3, 320, 320 / 600);

    expect(projected).toBe(out);
    expect(out.x).toBeCloseTo(allocated.x, 6);
    expect(out.y).toBeCloseTo(allocated.y, 6);
  });
});

describe('playerCenteredMapToWorld is the inverse of worldToPlayerCenteredMap', () => {
  it('round-trips world -> map -> world for several headings', () => {
    const cases = [
      { wx: 37, wz: -12, px: 5, pz: 8, rot: 0 },
      { wx: -90, wz: 140, px: -10, pz: 20, rot: Math.PI / 3 },
      { wx: 200, wz: 200, px: 0, pz: 0, rot: -1.1 },
    ];
    const size = 320;
    const scale = size / 600;
    for (const c of cases) {
      const map = worldToPlayerCenteredMap(c.wx, c.wz, c.px, c.pz, c.rot, size, scale);
      const back = playerCenteredMapToWorld(map.x, map.y, c.px, c.pz, c.rot, size, scale);
      expect(back.x).toBeCloseTo(c.wx, 6);
      expect(back.z).toBeCloseTo(c.wz, 6);
    }
  });
});

describe('factionMarkerFill', () => {
  it('uses the US field-green palette for a blufor faction', () => {
    expect(factionMarkerFill(Faction.US, 0.6)).toBe('rgba(79, 107, 58, 0.6)');
  });

  it('uses the OPFOR stamp-red palette for an enemy faction', () => {
    expect(factionMarkerFill(Faction.NVA, 0.85)).toBe('rgba(158, 59, 46, 0.85)');
  });

  it('respects the per-renderer alpha parameter', () => {
    expect(factionMarkerFill(Faction.US, 0.5)).toContain('0.5');
    expect(factionMarkerFill(Faction.US, 0.85)).toContain('0.85');
  });
});
