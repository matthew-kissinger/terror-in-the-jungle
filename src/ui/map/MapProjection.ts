// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared world->map coordinate transforms and faction marker palette used by
 * every canvas map renderer (minimap, full map, deploy/respawn map, command
 * tactical map).
 *
 * Two projection families live here because the renderers genuinely use two:
 *
 *  1. North-up flipped-axis projection (FullMapSystem, OpenFrontierRespawnMap):
 *     a fixed paper map. -X is screen-right (west on the right), +Z is screen-up
 *     (OPFOR at the top). `x = (worldSize/2 - worldX) * scale`.
 *
 *  2. Player-centered rotating projection (minimap, CommandTacticalMap): the map
 *     spins under a fixed player at the centre, heading-up. Subtract the player,
 *     rotate by player heading, then place at `size/2`.
 *
 * Keeping both in one module means a fix to either transform lands everywhere at
 * once — the marker-divergence bug class (a marker right on the minimap and
 * wrong on the full map) comes from these being copy-pasted per renderer.
 *
 * Glyph *shapes* deliberately stay in each renderer: they differ by zoom context
 * (the minimap draws tiny rounded silhouettes, the full map draws larger
 * faction boxes with tags). Only the faction *palette* is shared here.
 */

import { isBlufor } from '../../systems/combat/types';
import type { Faction } from '../../systems/combat/types';

export interface MapPoint {
  x: number;
  y: number;
}

/**
 * North-up flipped-axis projection. World (x, z) -> map canvas (x, y) where -X
 * maps to the right and +Z maps to the top. `scale` is `mapSize / worldSize`.
 */
export function worldToNorthUpMap(
  worldX: number,
  worldZ: number,
  worldSize: number,
  mapSize: number,
): MapPoint {
  const scale = mapSize / worldSize;
  return {
    x: (worldSize / 2 - worldX) * scale,
    y: (worldSize / 2 - worldZ) * scale,
  };
}

/**
 * Player-centered, heading-up projection. World (x, z) -> map canvas (x, y),
 * rotated so the player's facing points up and the player sits at the canvas
 * centre. `scale` is `size / worldSize`.
 */
export function worldToPlayerCenteredMap(
  worldX: number,
  worldZ: number,
  playerX: number,
  playerZ: number,
  playerRotation: number,
  size: number,
  scale: number,
): MapPoint {
  const dx = worldX - playerX;
  const dz = worldZ - playerZ;
  const cos = Math.cos(playerRotation);
  const sin = Math.sin(playerRotation);
  const rotatedX = dx * cos + dz * sin;
  const rotatedZ = -dx * sin + dz * cos;
  return {
    x: size / 2 + rotatedX * scale,
    y: size / 2 + rotatedZ * scale,
  };
}

/**
 * Inverse of {@link worldToPlayerCenteredMap}: map canvas (x, y) -> world
 * (x, z) offset relative to the player. Used to turn a tap/cursor on the
 * player-centered map back into a world position.
 */
export function playerCenteredMapToWorld(
  localX: number,
  localY: number,
  playerX: number,
  playerZ: number,
  playerRotation: number,
  size: number,
  scale: number,
): { x: number; z: number } {
  const rotatedX = (localX - size / 2) / scale;
  const rotatedZ = (localY - size / 2) / scale;
  const cos = Math.cos(playerRotation);
  const sin = Math.sin(playerRotation);
  const dx = rotatedX * cos - rotatedZ * sin;
  const dz = rotatedX * sin + rotatedZ * cos;
  return {
    x: playerX + dx,
    z: playerZ + dz,
  };
}

/**
 * Faction marker fill palette shared by the vehicle/contact markers across the
 * renderers: US field-green vs OPFOR stamp-red. Each renderer picks its own
 * alpha to suit its backdrop, so the alpha is a parameter rather than baked in.
 */
export function factionMarkerFill(faction: Faction, alpha: number): string {
  return isBlufor(faction)
    ? `rgba(79, 107, 58, ${alpha})`
    : `rgba(158, 59, 46, ${alpha})`;
}
