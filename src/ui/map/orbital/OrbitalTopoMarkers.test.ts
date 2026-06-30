// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  markerColorFor,
  worldToDisplay,
  buildMarkerInstances,
  type TopoMarkerInput,
} from './OrbitalTopoMarkers';

describe('orbital topo markers', () => {
  it('colours blufor and opfor owners with distinct colours', () => {
    const blufor = markerColorFor('blufor');
    const opfor = markerColorFor('opfor');
    expect(blufor).not.toEqual(opfor);
    // Blufor leans green, opfor leans red.
    expect(blufor[1]).toBeGreaterThan(blufor[0]);
    expect(opfor[0]).toBeGreaterThan(opfor[1]);
  });

  it('projects the world origin to the display centre and corners to the footprint edge', () => {
    const centre = worldToDisplay(0, 0, 200, 100);
    expect(centre.x).toBeCloseTo(0);
    expect(centre.z).toBeCloseTo(0);
    const corner = worldToDisplay(100, 100, 200, 100);
    expect(corner.x).toBeCloseTo(50);
    expect(corner.z).toBeCloseTo(50);
  });

  it('gives home-base capture markers the tallest pillar and spawns the shortest', () => {
    const inputs: TopoMarkerInput[] = [
      { id: 'hq', name: 'HQ', worldX: 0, worldZ: 0, kind: 'capture', owner: 'blufor', isHomeBase: true },
      { id: 'out', name: 'Outpost', worldX: 10, worldZ: 0, kind: 'capture', owner: 'opfor' },
      { id: 'spawn', name: 'Spawn', worldX: -10, worldZ: 0, kind: 'spawn', owner: 'neutral' },
    ];
    const instances = buildMarkerInstances(inputs, 200, 100);
    const hq = instances.find((i) => i.id === 'hq')!;
    const outpost = instances.find((i) => i.id === 'out')!;
    const spawn = instances.find((i) => i.id === 'spawn')!;
    expect(hq.height).toBeGreaterThan(outpost.height);
    expect(outpost.height).toBeGreaterThan(spawn.height);
  });

  it('recolours a captured outpost when its owner flips', () => {
    const before = buildMarkerInstances(
      [{ id: 'a', name: 'A', worldX: 0, worldZ: 0, kind: 'capture', owner: 'neutral' }],
      200,
      100,
    );
    const after = buildMarkerInstances(
      [{ id: 'a', name: 'A', worldX: 0, worldZ: 0, kind: 'capture', owner: 'opfor' }],
      200,
      100,
    );
    expect(after[0].color).not.toEqual(before[0].color);
  });
});
