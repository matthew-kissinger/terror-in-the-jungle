// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import { zoneOwner, buildMarkerInputs, type SpawnPointLike } from './OrbitalTopoMapHost';
import { ZoneState } from '../../../systems/world/ZoneManager';

describe('orbital topo host marker mapping', () => {
  it('maps zone states onto the marker owner buckets', () => {
    expect(zoneOwner({ state: ZoneState.BLUFOR_CONTROLLED })).toBe('blufor');
    expect(zoneOwner({ state: ZoneState.OPFOR_CONTROLLED })).toBe('opfor');
    expect(zoneOwner({ state: ZoneState.CONTESTED })).toBe('contested');
    expect(zoneOwner({ state: ZoneState.NEUTRAL })).toBe('neutral');
  });

  it('builds capture markers from zones and spawn markers from spawn points', () => {
    const zones = [
      { id: 'hq', name: 'HQ', position: { x: 0, z: 0 }, state: ZoneState.BLUFOR_CONTROLLED, isHomeBase: true },
      { id: 'a', name: 'Alpha', position: { x: 50, z: 10 }, state: ZoneState.OPFOR_CONTROLLED, isHomeBase: false },
    ];
    const spawns: SpawnPointLike[] = [{ id: 's1', name: 'Spawn 1', position: { x: -20, z: 0 } }];
    const markers = buildMarkerInputs(zones, spawns);

    const capture = markers.filter((m) => m.kind === 'capture');
    const spawn = markers.filter((m) => m.kind === 'spawn');
    expect(capture).toHaveLength(2);
    expect(spawn).toHaveLength(1);

    const hq = markers.find((m) => m.id === 'hq')!;
    expect(hq.owner).toBe('blufor');
    expect(hq.isHomeBase).toBe(true);
    expect(hq.worldX).toBe(0);

    const alpha = markers.find((m) => m.id === 'a')!;
    expect(alpha.owner).toBe('opfor');

    expect(spawn[0].worldX).toBe(-20);
  });

  it('reflects a live ownership flip on the next marker build', () => {
    const zone = { id: 'a', name: 'Alpha', position: { x: 0, z: 0 }, isHomeBase: false };
    const neutral = buildMarkerInputs([{ ...zone, state: ZoneState.NEUTRAL }], []);
    const captured = buildMarkerInputs([{ ...zone, state: ZoneState.BLUFOR_CONTROLLED }], []);
    expect(neutral[0].owner).toBe('neutral');
    expect(captured[0].owner).toBe('blufor');
  });
});
