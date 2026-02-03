import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { Faction } from '../../systems/combat/types';
import { GameModeManager } from '../../systems/world/GameModeManager';

export const MAP_SIZE = 800;
export const WORLD_SIZE = 3200;

/**
 * Checks if a player can spawn at the given zone
 */
export function isZoneSpawnable(zone: CaptureZone, gameModeManager?: GameModeManager): boolean {
  // Can spawn at US home base
  if (zone.isHomeBase && zone.owner === Faction.US) {
    return true;
  }

  // Can spawn at US controlled zones if game mode allows
  const canSpawnAtZones = gameModeManager?.canPlayerSpawnAtZones() ?? false;
  if (canSpawnAtZones && !zone.isHomeBase && zone.state === ZoneState.US_CONTROLLED) {
    return true;
  }

  return false;
}

/**
 * Returns the color for a zone based on its state and owner
 */
export function getZoneColor(zone: CaptureZone, alpha: number, isSpawnable: boolean): string {
  if (!isSpawnable && zone.owner !== Faction.OPFOR) {
    // Dim non-spawnable friendly zones
    return `rgba(100, 100, 100, ${alpha * 0.5})`;
  }

  if (zone.isHomeBase) {
    if (zone.owner === Faction.US) {
      return `rgba(0, 128, 255, ${alpha})`;
    } else {
      return `rgba(255, 0, 0, ${alpha})`;
    }
  }

  switch (zone.state) {
    case ZoneState.US_CONTROLLED:
      return `rgba(0, 255, 0, ${alpha})`;
    case ZoneState.OPFOR_CONTROLLED:
      return `rgba(255, 0, 0, ${alpha})`;
    case ZoneState.CONTESTED:
      return `rgba(255, 255, 0, ${alpha})`;
    default:
      return `rgba(128, 128, 128, ${alpha})`;
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
export function getZoneAtPosition(
  canvasX: number,
  canvasY: number,
  zoomLevel: number,
  panOffset: { x: number; y: number },
  zoneManager?: ZoneManager
): CaptureZone | undefined {
  if (!zoneManager) return undefined;

  const zones = zoneManager.getAllZones();

  // Account for zoom and pan
  const centerX = MAP_SIZE / 2;
  const centerY = MAP_SIZE / 2;

  // Convert canvas coords to world space accounting for zoom and pan
  const adjustedX = (canvasX - centerX - panOffset.x) / zoomLevel + centerX;
  const adjustedY = (canvasY - centerY - panOffset.y) / zoomLevel + centerY;

  for (const zone of zones) {
    // World to map coordinates
    const { x, y } = worldToMap(zone.position.x, zone.position.z);

    // Zone radius on map - slightly larger for easier clicking
    const radius = Math.max(getMapZoneRadius(zone), 20);

    const dx = adjustedX - x;
    const dy = adjustedY - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= radius) {
      return zone;
    }
  }

  return undefined;
}
