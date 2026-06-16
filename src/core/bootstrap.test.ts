// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import { buildTopZoneOccupancy } from './bootstrap';

describe('bootstrap diagnostics helpers', () => {
  it('builds bounded A Shau top-zone occupancy without sorting the full table', () => {
    const zoneDistribution = new Map<string, { us: number; opfor: number }>([
      ['zone-a', { us: 1, opfor: 1 }],
      ['zone-b', { us: 6, opfor: 2 }],
      ['zone-c', { us: 2, opfor: 5 }],
      ['zone-d', { us: 0, opfor: 11 }],
      ['zone-e', { us: 2, opfor: 2 }],
      ['zone-f', { us: 3, opfor: 3 }],
      ['zone-g', { us: 1, opfor: 8 }],
      ['zone-h', { us: 5, opfor: 4 }],
      ['zone-i', { us: 4, opfor: 3 }],
      ['zone-j', { us: 9, opfor: 0 }],
      ['zone-k', { us: 0, opfor: 7 }],
      ['zone-l', { us: 10, opfor: 0 }],
    ]);
    const zones = [
      { id: 'zone-l', name: 'LZ L', owner: 'us', state: 'contested' },
      { id: 'zone-d', name: 'Delta', owner: 'opfor', state: 'held' },
      { id: 'zone-a', name: 'Alpha', owner: null, state: null },
    ];

    const sortSpy = vi.spyOn(Array.prototype, 'sort');
    const topZones = buildTopZoneOccupancy(zoneDistribution, zones, 10);
    const sortCalls = sortSpy.mock.calls.length;
    sortSpy.mockRestore();

    expect(sortCalls).toBe(0);
    expect(topZones).toHaveLength(10);
    expect(topZones.map(zone => zone.zoneId)).toEqual([
      'zone-d',
      'zone-l',
      'zone-g',
      'zone-h',
      'zone-j',
      'zone-b',
      'zone-c',
      'zone-i',
      'zone-k',
      'zone-f',
    ]);
    expect(topZones[0]).toMatchObject({
      zoneId: 'zone-d',
      zoneName: 'Delta',
      owner: 'opfor',
      state: 'held',
      us: 0,
      opfor: 11,
      total: 11,
    });
    expect(topZones[1]).toMatchObject({
      zoneId: 'zone-l',
      zoneName: 'LZ L',
      owner: 'us',
      state: 'contested',
      total: 10,
    });
    expect(topZones[3].zoneId).toBe('zone-h');
    expect(topZones[4].zoneId).toBe('zone-j');
    expect(topZones[8]).toMatchObject({
      zoneId: 'zone-k',
      zoneName: 'zone-k',
      owner: null,
      state: null,
    });
  });
});
