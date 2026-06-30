// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Resolve the baked coarse topo `.f32` URL for a game mode.
 *
 * These are the downsampled DEMs `scripts/bake-topo-dem.ts` writes (seed 42 per
 * mode). Used as the deploy/pause fallback when the live terrain runtime isn't
 * registered yet; once it is, the live baked heightmap is preferred.
 *
 * A Shau's source DEM is `.gitignored` (large NASADEM binary), so its baked
 * topo may be absent in CI — the deploy mount then simply shows no relief until
 * the live terrain registers, which it does for A Shau mid-match.
 */

import { GameMode } from '../../../config/gameModeTypes';

const TOPO_SIZE = 96;

/** Map a game mode to its baked coarse topo `.f32` URL. Pure. */
export function resolveTopoBakedUrl(mode: GameMode): string {
  const base = '/data/heightmaps';
  switch (mode) {
    case GameMode.OPEN_FRONTIER:
      return `${base}/open_frontier-42-topo-${TOPO_SIZE}.f32`;
    case GameMode.TEAM_DEATHMATCH:
      return `${base}/tdm-42-topo-${TOPO_SIZE}.f32`;
    case GameMode.A_SHAU_VALLEY:
      return `${base}/a-shau-topo-${TOPO_SIZE}.f32`;
    case GameMode.ZONE_CONTROL:
    default:
      return `${base}/zone_control-42-topo-${TOPO_SIZE}.f32`;
  }
}
