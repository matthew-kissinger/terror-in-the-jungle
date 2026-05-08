import { ZoneManager, CaptureZone } from '../../systems/world/ZoneManager';
import {
  MAP_SIZE,
  WORLD_SIZE,
  getZoneColor,
  worldToMap,
  getMapZoneRadius,
  zoneHasSpawnPoint
} from './OpenFrontierRespawnMapUtils';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';

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
    zoneManager?: ZoneManager,
    spawnPoints: RespawnSpawnPoint[] = []
  ): void {
    const size = MAP_SIZE;

    // Clear canvas with dark background
    ctx.fillStyle = '#0a0f0a';
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
    if (zoneManager) {
      const zones = zoneManager.getAllZones();

      // Draw zones in layers for better visibility
      // First pass: draw zone areas
      zones.forEach(zone => this.drawZoneArea(ctx, zone, spawnPoints));

      // Second pass: draw zone borders and icons
      zones.forEach(zone => this.drawZoneBorderAndIcon(ctx, zone, spawnPoints));

      // Third pass: draw zone labels
      zones.forEach(zone => this.drawZoneLabel(ctx, zone, spawnPoints));
    }

    spawnPoints.forEach(spawnPoint => this.drawSpawnPoint(ctx, spawnPoint, state.zoomLevel));

    // Draw selected spawn highlight
    if (state.selectedSpawnPointId) {
      const spawnPoint = spawnPoints.find(point => point.id === state.selectedSpawnPointId);
      if (spawnPoint) {
        this.drawSelectionHighlight(ctx, spawnPoint);
      }
    }

    ctx.restore();

    // Draw minimap overlay
    this.drawMinimap(ctx, state, zoneManager, spawnPoints);

    // Draw controls hint
    this.drawControlsHint(ctx);
  }

  private static drawGrid(ctx: CanvasRenderingContext2D): void {
    const gridSize = 100;
    ctx.strokeStyle = 'rgba(220, 225, 230, 0.025)';
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
    ctx.strokeStyle = 'rgba(220, 225, 230, 0.06)';
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
      ctx.font = 'bold 12px Rajdhani, sans-serif';
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
      ctx.fillStyle = 'rgba(92, 184, 92, 0.9)';
      ctx.font = 'bold 16px Rajdhani, sans-serif';
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
    ctx.font = isSpawnable ? 'bold 11px Rajdhani, sans-serif' : '10px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Text background
    const metrics = ctx.measureText(name);
    const padding = 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(
      x - metrics.width / 2 - padding,
      y - radius - 20 - padding,
      metrics.width + padding * 2,
      14
    );

    // Text
    ctx.fillStyle = isSpawnable ? 'rgba(92, 184, 92, 0.9)' : 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(name, x, y - radius - 8);
  }

  private static drawSpawnPoint(
    ctx: CanvasRenderingContext2D,
    spawnPoint: RespawnSpawnPoint,
    zoomLevel: number
  ): void {
    const { x, y } = worldToMap(spawnPoint.position.x, spawnPoint.position.z);
    const color = spawnPoint.selectionClass === 'direct_insertion'
      ? 'rgba(255, 214, 102, 0.95)'
      : spawnPoint.kind === 'helipad'
        ? 'rgba(111, 196, 255, 0.95)'
        : 'rgba(92, 184, 92, 0.95)';
    const outerRadius = Math.max(11, 16 / Math.sqrt(Math.max(zoomLevel, 0.75)));
    const innerRadius = Math.max(7, 11 / Math.sqrt(Math.max(zoomLevel, 0.75)));

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    const textLabel = `${this.getSpawnPointKindLabel(spawnPoint)} ${spawnPoint.name}`;
    ctx.font = 'bold 11px monospace';
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

    ctx.fillStyle = 'rgba(4, 8, 5, 0.84)';
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

    ctx.strokeStyle = `rgba(92, 184, 92, ${pulse})`;
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
    zoneManager?: ZoneManager,
    spawnPoints: RespawnSpawnPoint[] = []
  ): void {
    const minimapSize = 120;
    const margin = 10;
    const x = MAP_SIZE - minimapSize - margin;
    const y = margin;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, minimapSize, minimapSize);
    ctx.strokeStyle = 'rgba(220, 225, 230, 0.3)';
    ctx.strokeRect(x, y, minimapSize, minimapSize);

    // Draw zones on minimap
    if (zoneManager) {
      const zones = zoneManager.getAllZones();
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
        ? 'rgba(255, 214, 102, 0.95)'
        : 'rgba(92, 184, 92, 0.95)';
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

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewWidth, viewHeight);
  }

  private static drawControlsHint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, MAP_SIZE - 60, 200, 50);

    ctx.fillStyle = 'rgba(220, 225, 230, 0.6)';
    ctx.font = '11px Rajdhani, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Scroll: Zoom', 15, MAP_SIZE - 45);
    ctx.fillText('Drag: Pan', 15, MAP_SIZE - 30);
    ctx.fillText('Click: Select spawn', 15, MAP_SIZE - 15);
  }
}
