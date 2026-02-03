import * as THREE from 'three';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { Faction } from '../../systems/combat/types';
import { GameModeManager } from '../../systems/world/GameModeManager';

export class OpenFrontierRespawnMap {
  private zoneManager?: ZoneManager;
  private gameModeManager?: GameModeManager;

  // Canvas elements
  private mapCanvas: HTMLCanvasElement;
  private mapContext: CanvasRenderingContext2D;

  // Map settings - Larger canvas for better visibility
  private readonly MAP_SIZE = 800; // Increased from 600
  private readonly WORLD_SIZE = 3200; // Open Frontier world size

  // Selection state
  private selectedZoneId?: string;
  private onZoneSelected?: (zoneId: string, zoneName: string) => void;

  // Spawn zones
  private spawnableZones: CaptureZone[] = [];

  // Zoom and pan state for better navigation
  private zoomLevel = 1;
  private panOffset = { x: 0, y: 0 };
  private isPanning = false;
  private lastMousePos = { x: 0, y: 0 };

  // Event handler references for cleanup
  private handleClick = (e: MouseEvent) => {
    if (this.isPanning) return; // Don't select while panning

    const rect = this.mapCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.MAP_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (this.MAP_SIZE / rect.height);
    this.handleMapClick(x, y);
  };

  private handleMouseMove = (e: MouseEvent) => {
    const rect = this.mapCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.MAP_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (this.MAP_SIZE / rect.height);

    if (this.isPanning) {
      const dx = x - this.lastMousePos.x;
      const dy = y - this.lastMousePos.y;
      this.panOffset.x += dx;
      this.panOffset.y += dy;
      this.lastMousePos = { x, y };
      this.render();
    } else {
      const zone = this.getZoneAtPosition(x, y);
      this.mapCanvas.style.cursor = zone && this.isZoneSpawnable(zone) ? 'pointer' : 'default';
    }
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoomLevel = Math.max(0.5, Math.min(2, this.zoomLevel * delta));
    this.render();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) { // Middle mouse or shift+left
      this.isPanning = true;
      const rect = this.mapCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.MAP_SIZE / rect.width);
      const y = (e.clientY - rect.top) * (this.MAP_SIZE / rect.height);
      this.lastMousePos = { x, y };
      this.mapCanvas.style.cursor = 'move';
    }
  };

  private handleMouseUp = () => {
    this.isPanning = false;
    this.mapCanvas.style.cursor = 'default';
  };

  private handleMouseLeave = () => {
    this.isPanning = false;
    this.mapCanvas.style.cursor = 'default';
  };

  constructor() {
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.MAP_SIZE;
    this.mapCanvas.height = this.MAP_SIZE;
    this.mapContext = this.mapCanvas.getContext('2d')!;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Click to select zone
    this.mapCanvas.addEventListener('click', this.handleClick);

    // Hover effect
    this.mapCanvas.addEventListener('mousemove', this.handleMouseMove);

    // Mouse wheel zoom
    this.mapCanvas.addEventListener('wheel', this.handleWheel);

    // Pan controls
    this.mapCanvas.addEventListener('mousedown', this.handleMouseDown);
    this.mapCanvas.addEventListener('mouseup', this.handleMouseUp);
    this.mapCanvas.addEventListener('mouseleave', this.handleMouseLeave);
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

    // Account for zoom and pan
    const centerX = this.MAP_SIZE / 2;
    const centerY = this.MAP_SIZE / 2;

    // Convert canvas coords to world space accounting for zoom and pan
    const adjustedX = (canvasX - centerX - this.panOffset.x) / this.zoomLevel + centerX;
    const adjustedY = (canvasY - centerY - this.panOffset.y) / this.zoomLevel + centerY;

    for (const zone of zones) {
      // World to map coordinates
      const scale = this.MAP_SIZE / this.WORLD_SIZE;
      const x = (this.WORLD_SIZE / 2 - zone.position.x) * scale;
      const y = (this.WORLD_SIZE / 2 - zone.position.z) * scale;

      // Zone radius on map
      const radius = Math.max(zone.radius * scale * 2, 20); // Min clickable area

      const dx = adjustedX - x;
      const dy = adjustedY - y;
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

    // Clear canvas with dark background
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, size, size);

    // Debug: Check if we have zones
    if (this.zoneManager) {
      const zones = this.zoneManager.getAllZones();
      console.log(`🗺️ OpenFrontierRespawnMap: Rendering ${zones.length} zones`);
      if (zones.length > 0) {
        console.log('Zone names:', zones.map(z => z.name).join(', '));
      }
    } else {
      console.log('⚠️ OpenFrontierRespawnMap: No zone manager set');
    }

    // Save state for transformations
    ctx.save();

    // Apply zoom and pan transformations
    ctx.translate(size / 2, size / 2);
    ctx.scale(this.zoomLevel, this.zoomLevel);
    ctx.translate(this.panOffset.x / this.zoomLevel, this.panOffset.y / this.zoomLevel);
    ctx.translate(-size / 2, -size / 2);

    // Draw grid
    this.drawGrid(ctx);

    // Draw all zones
    if (this.zoneManager) {
      const zones = this.zoneManager.getAllZones();

      // Draw zones in layers for better visibility
      // First pass: draw zone areas
      zones.forEach(zone => this.drawZoneArea(ctx, zone));

      // Second pass: draw zone borders and icons
      zones.forEach(zone => this.drawZoneBorderAndIcon(ctx, zone));

      // Third pass: draw zone labels
      zones.forEach(zone => this.drawZoneLabel(ctx, zone));
    }

    // Draw selected zone highlight
    if (this.selectedZoneId && this.zoneManager) {
      const zone = this.zoneManager.getAllZones().find(z => z.id === this.selectedZoneId);
      if (zone) {
        this.drawSelectionHighlight(ctx, zone);
      }
    }

    ctx.restore();

    // Draw minimap overlay
    this.drawMinimap(ctx);

    // Draw controls hint
    this.drawControlsHint(ctx);
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const gridSize = 100; // Larger grid for Open Frontier
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.03)';
    ctx.lineWidth = 1;

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

    // Draw major grid lines
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.08)';
    ctx.lineWidth = 2;

    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(this.MAP_SIZE / 2, 0);
    ctx.lineTo(this.MAP_SIZE / 2, this.MAP_SIZE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, this.MAP_SIZE / 2);
    ctx.lineTo(this.MAP_SIZE, this.MAP_SIZE / 2);
    ctx.stroke();
  }

  private drawZoneArea(ctx: CanvasRenderingContext2D, zone: CaptureZone): void {
    const scale = this.MAP_SIZE / this.WORLD_SIZE;
    const x = (this.WORLD_SIZE / 2 - zone.position.x) * scale;
    const y = (this.WORLD_SIZE / 2 - zone.position.z) * scale;
    const radius = Math.max(zone.radius * scale * 2, 15);

    // Debug first zone
    if (zone.name === 'US Main HQ' || zone.name === 'Crossroads') {
      console.log(`Drawing ${zone.name}: pos(${zone.position.x}, ${zone.position.z}) -> canvas(${x}, ${y}) radius:${radius}`);
    }

    const isSpawnable = this.isZoneSpawnable(zone);

    // Zone area fill
    ctx.fillStyle = this.getZoneColor(zone, 0.2, isSpawnable);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawZoneBorderAndIcon(ctx: CanvasRenderingContext2D, zone: CaptureZone): void {
    const scale = this.MAP_SIZE / this.WORLD_SIZE;
    const x = (this.WORLD_SIZE / 2 - zone.position.x) * scale;
    const y = (this.WORLD_SIZE / 2 - zone.position.z) * scale;
    const radius = Math.max(zone.radius * scale * 2, 15);

    const isSpawnable = this.isZoneSpawnable(zone);

    // Zone border
    ctx.strokeStyle = this.getZoneColor(zone, 0.8, isSpawnable);
    ctx.lineWidth = isSpawnable ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Zone icon
    if (zone.isHomeBase) {
      // HQ icon - larger and more visible
      const iconSize = 16;
      ctx.fillStyle = this.getZoneColor(zone, 1, isSpawnable);
      ctx.fillRect(x - iconSize/2, y - iconSize/2, iconSize, iconSize);

      // HQ text
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HQ', x, y);
    } else {
      // Regular zone dot
      ctx.fillStyle = this.getZoneColor(zone, 0.9, isSpawnable);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spawn indicator for spawnable zones
    if (isSpawnable) {
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('⬇', x, y + radius + 3);
    }
  }

  private drawZoneLabel(ctx: CanvasRenderingContext2D, zone: CaptureZone): void {
    const scale = this.MAP_SIZE / this.WORLD_SIZE;
    const x = (this.WORLD_SIZE / 2 - zone.position.x) * scale;
    const y = (this.WORLD_SIZE / 2 - zone.position.z) * scale;
    const radius = Math.max(zone.radius * scale * 2, 15);

    const isSpawnable = this.isZoneSpawnable(zone);

    // Zone name with background for better readability
    const name = zone.name.toUpperCase();
    ctx.font = isSpawnable ? 'bold 11px monospace' : '10px monospace';
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
    ctx.fillStyle = isSpawnable ? '#00ff00' : 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(name, x, y - radius - 8);
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
    const scale = this.MAP_SIZE / this.WORLD_SIZE;
    const x = (this.WORLD_SIZE / 2 - zone.position.x) * scale;
    const y = (this.WORLD_SIZE / 2 - zone.position.z) * scale;
    const radius = Math.max(zone.radius * scale * 2, 15) + 10;

    // Animated selection ring
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 3) * 0.2 + 0.8;

    ctx.strokeStyle = `rgba(0, 255, 0, ${pulse})`;
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = time * 10;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  private drawMinimap(ctx: CanvasRenderingContext2D): void {
    // Small overview map in corner showing zoom/pan area
    const minimapSize = 120;
    const margin = 10;
    const x = this.MAP_SIZE - minimapSize - margin;
    const y = margin;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, minimapSize, minimapSize);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.strokeRect(x, y, minimapSize, minimapSize);

    // Draw zones on minimap
    if (this.zoneManager) {
      const zones = this.zoneManager.getAllZones();
      zones.forEach(zone => {
        const scale = minimapSize / this.WORLD_SIZE;
        const zx = x + (this.WORLD_SIZE / 2 - zone.position.x) * scale;
        const zy = y + (this.WORLD_SIZE / 2 - zone.position.z) * scale;

        ctx.fillStyle = this.getZoneColor(zone, 0.8, false);
        ctx.beginPath();
        ctx.arc(zx, zy, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw viewport rectangle
    const viewScale = minimapSize / this.MAP_SIZE;
    const viewWidth = minimapSize / this.zoomLevel;
    const viewHeight = minimapSize / this.zoomLevel;
    const viewX = x + minimapSize / 2 - viewWidth / 2 - this.panOffset.x * viewScale;
    const viewY = y + minimapSize / 2 - viewHeight / 2 - this.panOffset.y * viewScale;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewWidth, viewHeight);
  }

  private drawControlsHint(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, this.MAP_SIZE - 60, 200, 50);

    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Scroll: Zoom', 15, this.MAP_SIZE - 45);
    ctx.fillText('Shift+Drag: Pan', 15, this.MAP_SIZE - 30);
    ctx.fillText('Click: Select spawn', 15, this.MAP_SIZE - 15);
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
    this.updateSpawnableZones();
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

  resetView(): void {
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    this.render();
  }

  dispose(): void {
    this.mapCanvas.removeEventListener('click', this.handleClick);
    this.mapCanvas.removeEventListener('mousemove', this.handleMouseMove);
    this.mapCanvas.removeEventListener('wheel', this.handleWheel);
    this.mapCanvas.removeEventListener('mousedown', this.handleMouseDown);
    this.mapCanvas.removeEventListener('mouseup', this.handleMouseUp);
    this.mapCanvas.removeEventListener('mouseleave', this.handleMouseLeave);

    if (this.mapCanvas.parentElement) {
      this.mapCanvas.parentElement.removeChild(this.mapCanvas);
    }

    this.onZoneSelected = undefined;
    this.zoneManager = undefined;
    this.gameModeManager = undefined;
  }
}