// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TerrainVegetationRuntime } from './TerrainVegetationRuntime';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';

const {
  mockScattererUpdateBudgeted,
  mockScattererPendingCounts,
  mockScattererDebugInfo,
  mockScattererConfigure,
  mockRingConfigure,
  mockRingUpdateBudgeted,
  mockRingPendingCounts,
  mockRingDebugInfo,
  mockRingClear,
} = vi.hoisted(() => ({
  mockScattererUpdateBudgeted: vi.fn().mockReturnValue(false),
  mockScattererPendingCounts: vi.fn().mockReturnValue({ adds: 0, removals: 0 }),
  mockScattererDebugInfo: vi.fn().mockReturnValue({}),
  mockScattererConfigure: vi.fn(),
  mockRingConfigure: vi.fn(),
  mockRingUpdateBudgeted: vi.fn().mockReturnValue(false),
  mockRingPendingCounts: vi.fn().mockReturnValue({ adds: 0, removals: 0 }),
  mockRingDebugInfo: vi.fn().mockReturnValue({}),
  mockRingClear: vi.fn(),
}));

vi.mock('./VegetationScatterer', () => ({
  VegetationScatterer: class {
    configure = mockScattererConfigure;
    setWorldBounds = vi.fn();
    setExclusionZones = vi.fn();
    updateBudgeted = mockScattererUpdateBudgeted;
    getPendingCounts = mockScattererPendingCounts;
    getDebugInfo = mockScattererDebugInfo;
    regenerateAll = vi.fn();
    regenerateAllAsync = vi.fn().mockResolvedValue(undefined);
    dispose = vi.fn();
  },
}));

vi.mock('./JungleGroundRing', () => ({
  JungleGroundRing: class {
    configure = mockRingConfigure;
    setWorldBounds = vi.fn();
    setExclusionZones = vi.fn();
    updateBudgeted = mockRingUpdateBudgeted;
    getPendingCounts = mockRingPendingCounts;
    getDebugInfo = mockRingDebugInfo;
    regenerateAll = vi.fn();
    clear = mockRingClear;
    dispose = vi.fn();
  },
}));

function makeRuntime(): TerrainVegetationRuntime {
  return new TerrainVegetationRuntime({} as GlobalBillboardSystem, 128);
}

describe('TerrainVegetationRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScattererUpdateBudgeted.mockReturnValue(false);
    mockScattererPendingCounts.mockReturnValue({ adds: 0, removals: 0 });
    mockRingUpdateBudgeted.mockReturnValue(false);
    mockRingPendingCounts.mockReturnValue({ adds: 0, removals: 0 });
  });

  it('keeps the near ground ring dormant and preserves the scatterer add budget', () => {
    mockRingUpdateBudgeted.mockReturnValue(true);
    const runtime = makeRuntime();

    const result = runtime.updateBudgeted(new THREE.Vector3(), 1, {
      maxAddsPerFrame: 6,
      maxRemovalsPerFrame: 2,
    });

    expect(result.didWork).toBe(false);
    expect(mockRingUpdateBudgeted).not.toHaveBeenCalled();
    expect(mockScattererUpdateBudgeted).toHaveBeenCalledWith(expect.any(THREE.Vector3), {
      maxAddsPerFrame: 6,
      maxRemovalsPerFrame: 6,
    });
  });

  it('preserves full scatterer add budget when the near ground ring has no work', () => {
    const runtime = makeRuntime();

    runtime.updateBudgeted(new THREE.Vector3(), 1, {
      maxAddsPerFrame: 6,
      maxRemovalsPerFrame: 2,
    });

    expect(mockScattererUpdateBudgeted).toHaveBeenCalledWith(expect.any(THREE.Vector3), {
      maxAddsPerFrame: 6,
      maxRemovalsPerFrame: 6,
    });
    expect(mockRingUpdateBudgeted).not.toHaveBeenCalled();
  });

  it('does not let dormant ring work consume scatterer removals or additions', () => {
    const runtime = makeRuntime();

    runtime.updateBudgeted(new THREE.Vector3(), 1, {
      maxAddsPerFrame: 2,
      maxRemovalsPerFrame: 2,
    });

    expect(mockScattererUpdateBudgeted).toHaveBeenCalledWith(expect.any(THREE.Vector3), {
      maxAddsPerFrame: 2,
      maxRemovalsPerFrame: 6,
    });
    expect(mockRingUpdateBudgeted).not.toHaveBeenCalled();
  });

  it('routes ground cover through the scatterer and clears the dormant ring on configure', () => {
    const runtime = makeRuntime();
    const types = [
      { id: 'fern', tier: 'groundCover' },
      { id: 'fanPalm', tier: 'midLevel' },
    ] as any[];
    const palettes = new Map();

    runtime.configure(types, 'denseJungle', palettes, []);

    expect(mockRingClear).toHaveBeenCalled();
    expect(mockRingConfigure).toHaveBeenCalledWith([], 'denseJungle', palettes, []);
    expect(mockScattererConfigure).toHaveBeenCalledWith(types, 'denseJungle', palettes, []);
  });
});
