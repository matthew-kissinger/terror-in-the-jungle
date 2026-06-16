// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GlobalBillboardSystem } from './GlobalBillboardSystem';
import type { AssetLoader } from '../../assets/AssetLoader';
import type { BillboardInstance } from '../../../types';

function makeInstance(x: number, z: number): BillboardInstance {
  return {
    position: new THREE.Vector3(x, 0, z),
    scale: new THREE.Vector3(1, 1, 1),
    rotation: 0,
    type: 'fern',
  } as BillboardInstance;
}

describe('GlobalBillboardSystem', () => {
  it('filters vegetation exclusion zones with squared-distance boundary checks', () => {
    const system = new GlobalBillboardSystem(
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      {} as AssetLoader,
    );
    const addChunkInstances = vi.fn();
    const clearInstancesInZones = vi.fn();
    (system as any).gpuSystem = {
      addChunkInstances,
      clearInstancesInZones,
    };
    system.setExclusionZones([{ x: 0, z: 0, radius: 5 }]);

    const sqrtSpy = vi.spyOn(Math, 'sqrt');
    const outsideBoundary = makeInstance(5.01, 0);
    const farOutside = makeInstance(9, 0);
    const instances = [
      makeInstance(0, 0),
      makeInstance(3, 4),
      makeInstance(5, 0),
      outsideBoundary,
      farOutside,
    ];

    system.addChunkInstances('chunk-0', new Map([['fern', instances]]));

    expect(sqrtSpy).not.toHaveBeenCalled();
    expect(clearInstancesInZones).toHaveBeenCalledWith([
      { x: 0, z: 0, radius: 5, radiusSq: 25 },
    ]);
    expect(addChunkInstances).toHaveBeenCalledOnce();
    expect(addChunkInstances).toHaveBeenCalledWith('chunk-0', 'fern', [
      outsideBoundary,
      farOutside,
    ]);
  });

  it('reuses the original instance array when exclusion zones remove nothing', () => {
    const system = new GlobalBillboardSystem(
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      {} as AssetLoader,
    );
    const addChunkInstances = vi.fn();
    (system as any).gpuSystem = {
      addChunkInstances,
      clearInstancesInZones: vi.fn(),
    };
    system.setExclusionZones([{ x: 0, z: 0, radius: 5 }]);
    const instances = [makeInstance(6, 0), makeInstance(8, 0)];

    system.addChunkInstances('chunk-1', new Map([['fern', instances]]));

    expect(addChunkInstances).toHaveBeenCalledWith('chunk-1', 'fern', instances);
  });
});
