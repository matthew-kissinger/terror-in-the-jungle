import { CaptureZone } from '../../systems/world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import {
  MAP_SIZE,
  WORLD_SIZE,
  getZoneColor,
  worldToMap,
  getMapZoneRadius,
  zoneHasSpawnPoint
} from './OpenFrontierRespawnMapUtils';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';
import type { VehicleMarker } from '../minimap/MinimapRenderer';
import { isBlufor } from '../../systems/combat/types';

interface RenderState {
  zoomLevel: number;
  panOffset: { x: number; y: number };
  selectedSpawnPointId?: string;
}

interface SpawnPointLabelPlacement {
  x: number;
  y: number;
  align: CanvasTextAlign;
}

export class OpenFrontierRespawnMapRenderer {
  static render(
    ctx: CanvasRenderingContext2D,
    state: RenderState,
    zoneQuery?: IZoneQuery,
    spawnPoints: RespawnSpawnPoint[] = [],
    vehicleMarkers: VehicleMarker[] = []
  ): void {
    const size = MAP_SIZE;

    // Clear canvas with manila topo background (Field Journal)
    ctx.fillStyle = '#cdba8e';
    ctx.fillRect(0, 0, size, size);

    // Save state for transformations
    ctx.save();

    // Apply zoom and pan transformations
    ctx.translate(size / 2, size / 2);
    ctx.scale(state.zoomLevel, state.zoomLevel);
    ctx.translate(state.panOffset.x / state.zoomLevel, state.panOffset.y / state.zoomLevel);
    ctx.translate(-size / 2, -size / 2);

    // Draw grid
    this.drawGrid(ctx);

    // Draw all zones
    if (zoneQuery) {
      const zones = zoneQuery.getAllZones();

      // Draw zones in layers for better visibility
      // First pass: draw zone areas
      zones.forEach(zone => this.drawZoneArea(ctx, zone, spawnPoints));

      // Second pass: draw zone borders and icons
      zones.forEach(zone => this.drawZoneBorderAndIcon(ctx, zone, spawnPoints));

      // Third pass: draw zone labels
      zones.forEach(zone => this.drawZoneLabel(ctx, zone, spawnPoints));
    }

    spawnPoints.forEach(spawnPoint => this.drawSpawnPoint(ctx, spawnPoint, state.zoomLevel));

    vehicleMarkers.forEach(marker => this.drawVehicleMarker(ctx, marker, state.zoomLevel));

    // Draw selected spawn highlight
    if (state.selectedSpawnPointId) {
      const spawnPoint = spawnPoints.find(point => point.id === state.selectedSpawnPointId);
      if (spawnPoint) {
        this.drawSelectionHighlight(ctx, spawnPoint);
      }
    }

    ctx.restore();

    // Draw minimap overlay
    this.drawMinimap(ctx, state, zoneQuery, spawnPoints);

    // Draw controls hint
    this.drawControlsHint(ctx);
  }

  private static drawGrid(ctx: CanvasRenderingContext2D): void {
    const gridSize = 100;
    ctx.strokeStyle = 'rgba(90, 70, 40, 0.12)';
    ctx.lineWidth = 1;

    for (let i = 0; i <= MAP_SIZE; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, MAP_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(MAP_SIZE, i);
      ctx.stroke();
    }

    // Draw major grid lines
    ctx.strokeStyle = 'rgba(90, 70, 40, 0.28)';
    ctx.lineWidth = 2;

    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(MAP_SIZE / 2, 0);
    ctx.lineTo(MAP_SIZE / 2, MAP_SIZE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, MAP_SIZE / 2);
    ctx.lineTo(MAP_SIZE, MAP_SIZE / 2);
    ctx.stroke();
  }

  private static drawZoneArea(
    ctx: CanvasRenderingContext2D, 
    zone: CaptureZone,
    spawnPoints: RespawnSpawnPoint[]
  ): void {
    const { x, y } = worldToMap(zone.position.x, zone.position.z);
    const radius = getMapZoneRadius(zone);
    const isSpawnable = zoneHasSpawnPoint(zone, spawnPoints);

    // Zone area fill
    ctx.fillStyle = getZoneColor(zone, 0.2, isSpawnable);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private static drawZoneBorderAndIcon(
    ctx: CanvasRenderingContext2D, 
    zone: CaptureZone,
    spawnPoints: RespawnSpawnPoint[]
  ): void {
    const { x, y } = worldToMap(zone.position.x, zone.position.z);
    const radius = getMapZoneRadius(zone);
    const isSpawnable = zoneHasSpawnPoint(zone, spawnPoints);

    // Zone border
    ctx.strokeStyle = getZoneColor(zone, 0.8, isSpawnable);
    ctx.lineWidth = isSpawnable ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Zone icon
    if (zone.isHomeBase) {
      const iconSize = 16;
      ctx.fillStyle = getZoneColor(zone, 1, isSpawnable);
      ctx.fillRect(x - iconSize/2, y - iconSize/2, iconSize, iconSize);

      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px "Courier Prime", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HQ', x, y);
    } else {
      ctx.fillStyle = getZoneColor(zone, 0.9, isSpawnable);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spawn indicator for spawnable zones
    if (isSpawnable) {
      ctx.fillStyle = 'rgba(79, 107, 58, 0.95)';
      ctx.font = 'bold 16px "Courier Prime", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('⬇', x, y + radius + 3);
    }
  }

  private static drawZoneLabel(
    ctx: CanvasRenderingContext2D, 
    zone: CaptureZone,
    spawnPoints: RespawnSpawnPoint[]
  ): void {
    const { x, y } = worldToMap(zone.position.x, zone.position.z);
    const radius = getMapZoneRadius(zone);
    const isSpawnable = zoneHasSpawnPoint(zone, spawnPoints);

    // Zone name with background for better readability
    const name = zone.name.toUpperCase();
    ctx.font = isSpawnable ? 'bold 11px "Courier Prime", monospace' : '10px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Text background
    const metrics = ctx.measureText(name);
    const padding = 4;
    ctx.fillStyle = 'rgba(231, 217, 186, 0.85)';
    ctx.fillRect(
      x - metrics.width / 2 - padding,
      y - radius - 20 - padding,
      metrics.width + padding * 2,
      14
    );

    // Text
    ctx.fillStyle = isSpawnable ? 'rgba(58, 79, 42, 0.95)' : 'rgba(43, 38, 32, 0.8)';
    ctx.fillText(name, x, y - radius - 8);
  }

  private static drawSpawnPoint(
    ctx: CanvasRenderingContext2D,
    spawnPoint: RespawnSpawnPoint,
    zoomLevel: number
  ): void {
    const { x, y } = worldToMap(spawnPoint.position.x, spawnPoint.position.z);
    const color = spawnPoint.selectionClass === 'direct_insertion'
      ? 'rgba(158, 59, 46, 0.95)'
      : spawnPoint.kind === 'helipad'
        ? 'rgba(58, 79, 42, 0.95)'
        : 'rgba(79, 107, 58, 0.95)';
    const outerRadius = Math.max(11, 16 / Math.sqrt(Math.max(zoomLevel, 0.75)));
    const innerRadius = Math.max(7, 11 / Math.sqrt(Math.max(zoomLevel, 0.75)));

    ctx.fillStyle = 'rgba(43, 38, 32, 0.5)';
    ctx.beginPath();
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    const textLabel = `${this.getSpawnPointKindLabel(spawnPoint)} ${spawnPoint.name}`;
    ctx.font = 'bold 11px "Courier Prime", monospace';
    const metrics = ctx.measureText(textLabel);
    const padding = 5;
    const height = 15;
    const placement = this.getSpawnPointLabelPlacement(spawnPoint, x, y, outerRadius, metrics.width, padding);
    const backgroundX = placement.align === 'left'
      ? placement.x - padding
      : placement.align === 'right'
        ? placement.x - metrics.width - padding
        : placement.x - (metrics.width / 2) - padding;

    ctx.strokeStyle = color.replace('0.95', '0.55');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(placement.x, placement.y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(231, 217, 186, 0.85)';
    ctx.fillRect(
      backgroundX,
      placement.y - 11,
      metrics.width + padding * 2,
      height
    );
    ctx.textAlign = placement.align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(textLabel, placement.x, placement.y);
  }

  /**
   * Draws a crewable-vehicle marker (tank / jeep / sampan) so the player
   * can see where vehicles sit before deploying. Ground vehicles read as a
   * faction-colored armored box with a "TANK" tag; watercraft as a diamond;
   * emplacements as an X cross. Mirrors the glyph language used on the
   * minimap / full map.
   */
  private static drawVehicleMarker(
    ctx: CanvasRenderingContext2D,
    marker: VehicleMarker,
    zoomLevel: number
  ): void {
    const { x, y } = worldToMap(marker.worldPos.x, marker.worldPos.z);
    const size = Math.max(7, 11 / Math.sqrt(Math.max(zoomLevel, 0.75)));
    const friendly = isBlufor(marker.faction);
    const fill = friendly ? 'rgba(79, 107, 58, 0.6)' : 'rgba(158, 59, 46, 0.6)';
    const stroke = 'rgba(43, 38, 32, 0.85)';

    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;

    if (marker.category === 'ground') {
      ctx.beginPath();
      ctx.rect(x - size, y - size * 0.7, size * 2, size * 1.4);
      ctx.fill();
      ctx.stroke();
    } else if (marker.category === 'watercraft') {
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.stroke();
    }

    const tag = marker.category === 'ground'
      ? 'TANK'
      : marker.category === 'watercraft' ? 'BOAT' : 'GUN';
    ctx.font = 'bold 9px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = stroke;
    ctx.fillText(tag, x, y + size + 2);

    ctx.restore();
  }

  private static getSpawnPointLabelPlacement(
    spawnPoint: RespawnSpawnPoint,
    x: number,
    y: number,
    outerRadius: number,
    labelWidth: number,
    padding: number
  ): SpawnPointLabelPlacement {
    const horizontalOffset = outerRadius + 16;
    const verticalOffset = outerRadius + 18;
    let placement: SpawnPointLabelPlacement;

    switch (spawnPoint.kind) {
      case 'home_base':
        placement = { x: x + horizontalOffset, y: y - 5, align: 'left' };
        break;
      case 'helipad':
        placement = { x: x + horizontalOffset, y: y - 18, align: 'left' };
        break;
      case 'insertion':
        placement = { x: x + horizontalOffset, y: y + 18, align: 'left' };
        break;
      case 'zone':
      case 'default':
      default:
        placement = { x, y: y + verticalOffset, align: 'center' };
        break;
    }

    return this.clampSpawnPointLabelPlacement(placement, labelWidth, padding);
  }

  private static clampSpawnPointLabelPlacement(
    placement: SpawnPointLabelPlacement,
    labelWidth: number,
    padding: number
  ): SpawnPointLabelPlacement {
    const edgePadding = 8;
    const width = labelWidth + padding * 2;
    const minY = 20;
    const maxY = MAP_SIZE - 12;
    let x = placement.x;
    const y = Math.min(maxY, Math.max(minY, placement.y));

    if (placement.align === 'left' && x + width > MAP_SIZE - edgePadding) {
      x = MAP_SIZE - edgePadding;
      return { x, y, align: 'right' };
    }

    if (placement.align === 'right' && x - width < edgePadding) {
      x = edgePadding;
      return { x, y, align: 'left' };
    }

    if (placement.align === 'center') {
      const halfWidth = width / 2;
      x = Math.min(MAP_SIZE - edgePadding - halfWidth, Math.max(edgePadding + halfWidth, x));
    }

    return { ...placement, x, y };
  }

  private static getSpawnPointKindLabel(spawnPoint: RespawnSpawnPoint): string {
    switch (spawnPoint.kind) {
      case 'home_base':
        return 'BASE';
      case 'zone':
        return 'ZONE';
      case 'helipad':
        return 'HELIPAD';
      case 'insertion':
        return 'INSERT';
      case 'default':
      default:
        return 'DEFAULT';
    }
  }

  private static drawSelectionHighlight(ctx: CanvasRenderingContext2D, spawnPoint: RespawnSpawnPoint): void {
    const { x, y } = worldToMap(spawnPoint.position.x, spawnPoint.position.z);
    const radius = 18;

    // Animated selection ring
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 3) * 0.2 + 0.8;

    ctx.strokeStyle = `rgba(158, 59, 46, ${pulse})`;
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = time * 10;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  private static drawMinimap(
    ctx: CanvasRenderingContext2D,
    state: RenderState,
    zoneQuery?: IZoneQuery,
    spawnPoints: RespawnSpawnPoint[] = []
  ): void {
    const minimapSize = 120;
    const margin = 10;
    const x = MAP_SIZE - minimapSize - margin;
    const y = margin;

    // Background
    ctx.fillStyle = 'rgba(43, 38, 32, 0.78)';
    ctx.fillRect(x, y, minimapSize, minimapSize);
    ctx.strokeStyle = 'rgba(231, 217, 186, 0.4)';
    ctx.strokeRect(x, y, minimapSize, minimapSize);

    // Draw zones on minimap
    if (zoneQuery) {
      const zones = zoneQuery.getAllZones();
      zones.forEach(zone => {
        const scale = minimapSize / WORLD_SIZE;
        const zx = x + (WORLD_SIZE / 2 - zone.position.x) * scale;
        const zy = y + (WORLD_SIZE / 2 - zone.position.z) * scale;

        ctx.fillStyle = getZoneColor(zone, 0.8, false);
        ctx.beginPath();
        ctx.arc(zx, zy, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    spawnPoints.forEach(spawnPoint => {
      const scale = minimapSize / WORLD_SIZE;
      const zx = x + (WORLD_SIZE / 2 - spawnPoint.position.x) * scale;
      const zy = y + (WORLD_SIZE / 2 - spawnPoint.position.z) * scale;
      ctx.fillStyle = spawnPoint.selectionClass === 'direct_insertion'
        ? 'rgba(181, 71, 47, 0.95)'
        : 'rgba(125, 154, 90, 0.95)';
      ctx.beginPath();
      ctx.arc(zx, zy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw viewport rectangle
    const viewScale = minimapSize / MAP_SIZE;
    const viewWidth = minimapSize / state.zoomLevel;
    const viewHeight = minimapSize / state.zoomLevel;
    const viewX = x + minimapSize / 2 - viewWidth / 2 - state.panOffset.x * viewScale;
    const viewY = y + minimapSize / 2 - viewHeight / 2 - state.panOffset.y * viewScale;

    ctx.strokeStyle = 'rgba(231, 217, 186, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewWidth, viewHeight);
  }

  private static drawControlsHint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(43, 38, 32, 0.78)';
    ctx.fillRect(10, MAP_SIZE - 60, 200, 50);

    ctx.fillStyle = 'rgba(231, 217, 186, 0.7)';
    ctx.font = '11px "Courier Prime", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Scroll / Pinch: Zoom', 15, MAP_SIZE - 45);
    ctx.fillText('Drag: Pan', 15, MAP_SIZE - 30);
    ctx.fillText('Tap / Click: Select', 15, MAP_SIZE - 15);
  }
}
