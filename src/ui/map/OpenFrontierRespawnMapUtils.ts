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
  if (!isSpawnable && !(zone.owner !== null && isOpfor(zone.owner))) {
    // Dim non-spawnable friendly zones
    return `rgba(100, 100, 100, ${alpha * 0.5})`;
  }

  if (zone.isHomeBase) {
    if (zone.owner === Faction.US) {
      return `rgba(91, 140, 201, ${alpha})`;
    } else {
      return `rgba(201, 86, 74, ${alpha})`;
    }
  }

  switch (zone.state) {
    case ZoneState.BLUFOR_CONTROLLED:
      return `rgba(92, 184, 92, ${alpha})`;
    case ZoneState.OPFOR_CONTROLLED:
      return `rgba(201, 86, 74, ${alpha})`;
    case ZoneState.CONTESTED:
      return `rgba(212, 163, 68, ${alpha})`;
    default:
      return `rgba(107, 119, 128, ${alpha})`;
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
