import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { Faction } from '../../systems/combat/types';
import { GameModeManager } from '../../systems/world/GameModeManager';

export class RespawnMapView {
  private zoneManager?: ZoneManager;
  private gameModeManager?: GameModeManager;

  // Canvas elements
  private mapCanvas: HTMLCanvasElement;
  private mapContext: CanvasRenderingContext2D;

  // Map settings
  private readonly MAP_SIZE = 600;
  private worldSize = 3200;
  private mapScale = 1; // Dynamic scale for different world sizes
  private readonly BASE_WORLD_SIZE = 400; // Zone Control world size as baseline

  // Selection state
  private selectedZoneId?: string;
  private onZoneSelected?: (zoneId: string, zoneName: string) => void;

  // Spawn zones
  private spawnableZones: CaptureZone[] = [];

  // Event handler references for cleanup
  private handleClick = (e: MouseEvent) => {
    const rect = this.mapCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.MAP_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (this.MAP_SIZE / rect.height);
    this.handleMapClick(x, y);
  };

  private handleMouseMove = (e: MouseEvent) => {
    const rect = this.mapCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.MAP_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (this.MAP_SIZE / rect.height);

    const zone = this.getZoneAtPosition(x, y);
    this.mapCanvas.style.cursor = zone && this.isZoneSpawnable(zone) ? 'pointer' : 'default';
  };

  constructor() {
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.MAP_SIZE;
    this.mapCanvas.height = this.MAP_SIZE;
    this.mapContext = this.mapCanvas.getContext('2d')!;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.mapCanvas.addEventListener('click', this.handleClick);

    // Hover effect
    this.mapCanvas.addEventListener('mousemove', this.handleMouseMove);
  }

  private handleMapClick(canvasX: number, canvasY: number): void {
    const zone = this.getZoneAtPosition(canvasX, canvasY);

    if (zone && this.isZoneSpawnable(zone)) {
      this.selectedZoneId = zone.id;

      if (this.onZoneSelected) {
        this.onZoneSelected(zone.id, zone.name);
      }

      this.render();
    }
  }

  private getZoneAtPosition(canvasX: number, canvasY: number): CaptureZone | undefined {
    if (!this.zoneManager) return undefined;

    const zones = this.zoneManager.getAllZones();

    for (const zone of zones) {
      // Convert world to canvas coordinates (flipped axes for north-up)
      // When mapScale is applied, we need to account for it in click detection
      const baseScale = this.MAP_SIZE / this.worldSize;
      const x = (this.worldSize / 2 - zone.position.x) * baseScale;
      const y = (this.worldSize / 2 - zone.position.z) * baseScale;

      // Transform canvas coordinates to account for scaling
      const centerOffset = this.MAP_SIZE / 2;
      const scaledX = centerOffset + (x - centerOffset) * this.mapScale;
      const scaledY = centerOffset + (y - centerOffset) * this.mapScale;

      // Adjust radius for scale
      const minRadius = this.worldSize > this.BASE_WORLD_SIZE ? 8 * this.mapScale : 15;
      const radius = Math.max(zone.radius * baseScale * 2 * this.mapScale, minRadius);

      const dx = canvasX - scaledX;
      const dy = canvasY - scaledY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= radius) {
        return zone;
      }
    }

    return undefined;
  }

  private isZoneSpawnable(zone: CaptureZone): boolean {
    // Can spawn at US home base
    if (zone.isHomeBase && zone.owner === Faction.US) {
      return true;
    }

    // Can spawn at US controlled zones if game mode allows
    const canSpawnAtZones = this.gameModeManager?.canPlayerSpawnAtZones() ?? false;
    if (canSpawnAtZones && !zone.isHomeBase && zone.state === ZoneState.US_CONTROLLED) {
      return true;
    }

    return false;
  }

  updateSpawnableZones(): void {
    if (!this.zoneManager) {
      this.spawnableZones = [];
      return;
    }

    const canSpawnAtZones = this.gameModeManager?.canPlayerSpawnAtZones() ?? false;

    this.spawnableZones = this.zoneManager.getAllZones().filter(zone => {
      if (zone.isHomeBase && zone.owner === Faction.US) return true;
      if (canSpawnAtZones && !zone.isHomeBase && zone.state === ZoneState.US_CONTROLLED) return true;
      return false;
    });
  }

  render(): void {
    const ctx = this.mapContext;
    const size = this.MAP_SIZE;

    // Clear canvas with tactical background
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, size, size);

    // Apply scaling transformation
    ctx.save();
    const center = size / 2;
    ctx.translate(center, center);
    ctx.scale(this.mapScale, this.mapScale);
    ctx.translate(-center, -center);

    // Draw grid
    this.drawGrid(ctx);

    // Draw zones
    if (this.zoneManager) {
      const zones = this.zoneManager.getAllZones();
      zones.forEach(zone => this.drawZone(ctx, zone));
    }

    // Draw selected zone highlight
    if (this.selectedZoneId && this.zoneManager) {
      const zone = this.zoneManager.getAllZones().find(z => z.id === this.selectedZoneId);
      if (zone) {
        this.drawSelectionHighlight(ctx, zone);
      }
    }

    // Restore transformation
    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const gridSize = 50 / this.mapScale; // Adjust grid size for scale
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.05)';
    ctx.lineWidth = 1 / this.mapScale; // Keep lines thin at any scale

    for (let i = 0; i <= this.MAP_SIZE; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, this.MAP_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(this.MAP_SIZE, i);
      ctx.stroke();
    }
  }

  private drawZone(ctx: CanvasRenderingContext2D, zone: CaptureZone): void {
    const scale = this.MAP_SIZE / this.worldSize;
    // North-up map with flipped axes
    const x = (this.worldSize / 2 - zone.position.x) * scale;
    const y = (this.worldSize / 2 - zone.position.z) * scale;
    // Adjust radius to be visible at different scales
    const minRadius = this.worldSize > this.BASE_WORLD_SIZE ? 8 : 15;
    const radius = Math.max(zone.radius * scale * 2, minRadius);

    const isSpawnable = this.isZoneSpawnable(zone);

    // Zone area
    ctx.fillStyle = this.getZoneColor(zone, 0.3, isSpawnable);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Zone border
    ctx.strokeStyle = this.getZoneColor(zone, 0.8, isSpawnable);
    ctx.lineWidth = (isSpawnable ? 3 : 2) / this.mapScale;
    ctx.stroke();

    // Zone icon
    if (zone.isHomeBase) {
      // HQ square icon
      const iconSize = 12;
      ctx.fillStyle = this.getZoneColor(zone, 1, isSpawnable);
      ctx.fillRect(x - iconSize/2, y - iconSize/2, iconSize, iconSize);

      // HQ text
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HQ', x, y);
    } else {
      // Regular zone dot
      ctx.fillStyle = this.getZoneColor(zone, 0.8, isSpawnable);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Zone name
    ctx.fillStyle = isSpawnable ? '#00ff00' : 'rgba(255, 255, 255, 0.6)';
    const fontSize = this.worldSize > this.BASE_WORLD_SIZE ? 12 : (isSpawnable ? 11 : 10);
    ctx.font = isSpawnable ? `bold ${fontSize}px monospace` : `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(zone.name, x, y - radius - 5);

    // Spawn indicator for spawnable zones
    if (isSpawnable) {
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('◈', x, y + radius + 2);
    }
  }

  private getZoneColor(zone: CaptureZone, alpha: number, isSpawnable: boolean): string {
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

  private drawSelectionHighlight(ctx: CanvasRenderingContext2D, zone: CaptureZone): void {
    const scale = this.MAP_SIZE / this.worldSize;
    const x = (this.worldSize / 2 - zone.position.x) * scale;
    const y = (this.worldSize / 2 - zone.position.z) * scale;
    const radius = Math.max(zone.radius * scale * 2, 15) + 10;

    // Animated selection ring
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 3) * 0.2 + 0.8;

    ctx.strokeStyle = `rgba(0, 255, 0, ${pulse})`;
    ctx.lineWidth = 4 / this.mapScale;
    const dashSize = 5 / this.mapScale;
    ctx.setLineDash([dashSize, dashSize]);
    ctx.lineDashOffset = time * 10;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  // Public API
  getCanvas(): HTMLCanvasElement {
    return this.mapCanvas;
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
    this.updateSpawnableZones();
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
    if (manager) {
      this.worldSize = manager.getWorldSize();
      Logger.info('ui', `📐 RespawnMapView: Setting world size to ${this.worldSize}`);
      this.updateMapScale();
      Logger.info('ui', `📐 RespawnMapView: Map scale set to ${this.mapScale}`);
    }
    this.updateSpawnableZones();
    this.render(); // Re-render with new scale
  }

  private updateMapScale(): void {
    // Calculate optimal scale to show entire world
    // For Zone Control (400 units), we want default scale
    // For Open Frontier (3200 units), we need to zoom out significantly

    if (this.worldSize <= this.BASE_WORLD_SIZE) {
      // Zone Control or smaller - use default scale
      this.mapScale = 1.0;
    } else {
      // For Open Frontier (3200 units vs 400 base), we need 1/8 scale
      // But we want a bit of padding, so use 0.85 of full canvas
      const scaleFactor = this.BASE_WORLD_SIZE / this.worldSize;

      // Apply an additional zoom out factor to ensure all zones are visible
      const paddingFactor = 0.85;

      this.mapScale = scaleFactor * paddingFactor;

      // For Open Frontier specifically, ensure we're zoomed out enough
      if (this.worldSize >= 3200) {
        this.mapScale = Math.min(this.mapScale, 0.15); // Cap at 0.15 for very large worlds
      }
    }
  }

  setZoneSelectedCallback(callback: (zoneId: string, zoneName: string) => void): void {
    this.onZoneSelected = callback;
  }

  clearSelection(): void {
    this.selectedZoneId = undefined;
    this.render();
  }

  getSelectedZoneId(): string | undefined {
    return this.selectedZoneId;
  }

  dispose(): void {
    this.mapCanvas.removeEventListener('click', this.handleClick);
    this.mapCanvas.removeEventListener('mousemove', this.handleMouseMove);

    if (this.mapCanvas.parentElement) {
      this.mapCanvas.parentElement.removeChild(this.mapCanvas);
    }

    this.onZoneSelected = undefined;
    this.zoneManager = undefined;
    this.gameModeManager = undefined;
  }
}