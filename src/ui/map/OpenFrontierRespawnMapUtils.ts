import { CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { Faction, isOpfor } from '../../systems/combat/types';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';

export const MAP_SIZE = 800;

/** Current world size for map coordinate mapping. Set via setMapWorldSize(). */
export let WORLD_SIZE = 3200;

/** Update the world size used by all map coordinate functions. */
export function setMapWorldSize(size: number): void {
  if (size > 0) WORLD_SIZE = size;
}

/** Max zoom scales with world size so zones remain selectable on large maps. */
export function getMaxZoom(): number {
  return Math.max(2, WORLD_SIZE / 1600);
}

export function zoneHasSpawnPoint(zone: CaptureZone, spawnPoints: RespawnSpawnPoint[]): boolean {
  return spawnPoints.some(spawnPoint => spawnPoint.sourceZoneId === zone.id || spawnPoint.id === zone.id);
}

/**
 * Returns the color for a zone based on its state and owner
 */
export function getZoneColor(zone: CaptureZone, alpha: number, isSpawnable: boolean): string {
  // Field Journal: ALLIED = field green, HOSTILE = stamp red, CONTESTED = warn.
  if (!isSpawnable && !(zone.owner !== null && isOpfor(zone.owner))) {
    // Dim non-spawnable friendly zones (ink-faint)
    return `rgba(138, 126, 107, ${alpha * 0.5})`;
  }

  if (zone.isHomeBase) {
    if (zone.owner === Faction.US) {
      return `rgba(79, 107, 58, ${alpha})`;
    } else {
      return `rgba(158, 59, 46, ${alpha})`;
    }
  }

  switch (zone.state) {
    case ZoneState.BLUFOR_CONTROLLED:
      return `rgba(79, 107, 58, ${alpha})`;
    case ZoneState.OPFOR_CONTROLLED:
      return `rgba(158, 59, 46, ${alpha})`;
    case ZoneState.CONTESTED:
      return `rgba(168, 116, 42, ${alpha})`;
    default:
      return `rgba(138, 126, 107, ${alpha})`;
  }
}

/**
 * Converts world coordinates to map canvas coordinates
 */
export function worldToMap(worldX: number, worldZ: number): { x: number; y: number } {
  const scale = MAP_SIZE / WORLD_SIZE;
  return {
    x: (WORLD_SIZE / 2 - worldX) * scale,
    y: (WORLD_SIZE / 2 - worldZ) * scale
  };
}

/**
 * Returns the radius of a zone on the map canvas
 */
export function getMapZoneRadius(zone: CaptureZone): number {
  const scale = MAP_SIZE / WORLD_SIZE;
  return Math.max(zone.radius * scale * 2, 15);
}

/**
 * Returns the zone at the given canvas position, accounting for zoom and pan
 */
export function transformCanvasToMapSpace(
  canvasX: number,
  canvasY: number,
  zoomLevel: number,
  panOffset: { x: number; y: number }
): { x: number; y: number } {
  const centerX = MAP_SIZE / 2;
  const centerY = MAP_SIZE / 2;
  return {
    x: (canvasX - centerX - panOffset.x) / zoomLevel + centerX,
    y: (canvasY - centerY - panOffset.y) / zoomLevel + centerY
  };
}

// Spawn-pick tap target (UX-2). The hit test runs in unzoomed map space, but a
// fixed map-unit radius collapses to a few CSS pixels on a shrunk/zoomed-out
// mobile canvas. These translate a consistent on-screen finger target into
// map-units, clamped so very zoomed-in pins stay pickable and very zoomed-out
// taps never merge adjacent spawns.
const TAP_TARGET_CSS_RADIUS_PX = 22; // ~44px diameter finger target
const MIN_HIT_MAP_UNITS = 14;        // never smaller than the pin glyph
const MAX_HIT_MAP_UNITS = 90;        // never so large adjacent spawns merge

/**
 * Unzoomed-map-unit radius that corresponds to a ~22px on-screen tap target at
 * the current zoom and displayed canvas width. Falls back to the canvas-native
 * width when the live rect is unavailable (headless / pre-layout).
 */
export function computeHitRadiusMapUnits(zoomLevel: number, displayWidthPx: number): number {
  const zoom = zoomLevel > 0 ? zoomLevel : 1;
  const width = displayWidthPx > 0 ? displayWidthPx : MAP_SIZE;
  const mapUnitsPerCssPx = MAP_SIZE / (width * zoom);
  const radius = TAP_TARGET_CSS_RADIUS_PX * mapUnitsPerCssPx;
  return Math.max(MIN_HIT_MAP_UNITS, Math.min(MAX_HIT_MAP_UNITS, radius));
}

/**
 * Nearest spawn point within the hit radius of an unzoomed-map-space point, or
 * undefined when none is in range. Nearest-on-miss makes coarse taps reliable
 * and disambiguates adjacent spawns (closest wins, not first-found).
 */
export function pickNearestSpawnWithinRadius(
  adjustedX: number,
  adjustedY: number,
  spawnPoints: RespawnSpawnPoint[],
  hitRadiusMapUnits: number,
): RespawnSpawnPoint | undefined {
  const radiusSq = hitRadiusMapUnits * hitRadiusMapUnits;
  let best: RespawnSpawnPoint | undefined;
  let bestDistSq = Infinity;
  for (const spawnPoint of spawnPoints) {
    const { x, y } = worldToMap(spawnPoint.position.x, spawnPoint.position.z);
    const dx = adjustedX - x;
    const dy = adjustedY - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq && distSq < bestDistSq) {
      best = spawnPoint;
      bestDistSq = distSq;
    }
  }
  return best;
}
