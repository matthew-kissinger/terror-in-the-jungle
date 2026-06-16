// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameEngine } from './GameEngine';

describe('GameEngine diagnostics stepping', () => {
  it('syncs terrain render selection before the diagnostics frame render', () => {
    const activeCamera = new THREE.PerspectiveCamera();
    const render = vi.fn();
    const syncRenderSelectionForCamera = vi.fn();
    const engine = {
      isInitialized: true,
      gameStarted: true,
      isDisposed: false,
      contextLost: false,
      lastFrameDelta: 0,
      systemManager: {
        updateSystems: vi.fn(),
        atmosphereSystem: {
          syncDomePosition: vi.fn(),
          setTerrainYAtCamera: vi.fn(),
        },
        terrainSystem: {
          getHeightAt: vi.fn(() => 12),
          syncRenderSelectionForCamera,
        },
        mortarSystem: null,
        firstPersonWeapon: null,
        grenadeSystem: null,
        inventoryManager: null,
      },
      freeFlyCamera: null,
      freeFlyInput: {},
      renderer: {
        getActiveCamera: vi.fn(() => activeCamera),
        postProcessing: null,
        renderer: {
          render,
          autoClear: true,
        },
        scene: {},
      },
      renderDiagnosticsFrame: (GameEngine.prototype as unknown as {
        renderDiagnosticsFrame: () => void;
      }).renderDiagnosticsFrame,
    };

    GameEngine.prototype.advanceTime.call(engine as unknown as GameEngine, 16);

    expect(syncRenderSelectionForCamera).toHaveBeenCalledWith(activeCamera);
    expect(syncRenderSelectionForCamera.mock.invocationCallOrder[0])
      .toBeLessThan(render.mock.invocationCallOrder[0]);
    expect(render).toHaveBeenCalledWith(engine.renderer.scene, activeCamera);
  });
});
