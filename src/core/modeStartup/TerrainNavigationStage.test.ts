// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import { GameMode } from '../../config/gameModeTypes';
import { configureTerrainAndNavigation } from './TerrainNavigationStage';

describe('configureTerrainAndNavigation', () => {
  it('forwards finite source height spacing into terrain surface configuration', async () => {
    const configureModeSurface = vi.fn().mockResolvedValue(undefined);
    const engine = {
      renderer: {
        configureForWorldSize: vi.fn(),
      },
      systemManager: {
        navmeshSystem: {
          isReady: vi.fn().mockReturnValue(true),
          isWasmReady: vi.fn().mockReturnValue(false),
        },
        playerController: {
          setWorldSize: vi.fn(),
        },
        terrainSystem: {
          configureModeSurface,
          setFarCanopyTint: vi.fn(),
          getPlayableWorldSize: vi.fn().mockReturnValue(21136),
        },
      },
    } as any;

    await configureTerrainAndNavigation(
      engine,
      {
        id: GameMode.A_SHAU_VALLEY,
        worldSize: 21136,
        visualMargin: 200,
        chunkRenderDistance: 6,
        terrain: { defaultBiome: 'denseJungle' },
        zones: [],
      } as any,
      {
        kind: 'dem',
        heightSampleSpacingMeters: 9,
      },
    );

    expect(configureModeSurface).toHaveBeenCalledWith(expect.objectContaining({
      worldSize: 21136,
      visualMargin: 200,
      heightSampleSpacingMeters: 9,
    }));
  });
});
