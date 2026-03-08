import { ZoneManager, CaptureZone } from '../../systems/world/ZoneManager';
import { GameModeManager } from '../../systems/world/GameModeManager';
import { OpenFrontierRespawnMapRenderer } from './OpenFrontierRespawnMapRenderer';
import {
  MAP_SIZE,
  setMapWorldSize,
  getMaxZoom,
  transformCanvasToMapSpace,
  worldToMap
} from './OpenFrontierRespawnMapUtils';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';

export class OpenFrontierRespawnMap {
  private zoneManager?: ZoneManager;
  private gameModeManager?: GameModeManager;

  // Canvas elements
  private mapCanvas: HTMLCanvasElement;
  private mapContext: CanvasRenderingContext2D;

  // Selection state
  private selectedZoneId?: string;
  private onZoneSelected?: (zoneId: string, zoneName: string) => void;

  // Spawn zones
  private spawnPoints: RespawnSpawnPoint[] = [];

  // Zoom and pan state
  private zoomLevel = 1;
  private panOffset = { x: 0, y: 0 };
  private isPanning = false;
  private isMouseDown = false;
  private mouseStartPos = { x: 0, y: 0 };
  private lastMousePos = { x: 0, y: 0 };
  private static readonly DRAG_THRESHOLD = 5;

  // Touch state
  private touchIdentifier: number | null = null;
  private touchStartPos = { x: 0, y: 0 };
  private lastTouchPos = { x: 0, y: 0 };
  private isTouchPanning = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;

  // Event handler references
  private handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      this.isMouseDown = true;
      this.isPanning = false;
      const rect = this.mapCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (MAP_SIZE / rect.width);
      const y = (e.clientY - rect.top) * (MAP_SIZE / rect.height);
      this.mouseStartPos = { x, y };
      this.lastMousePos = { x, y };
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    const rect = this.mapCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (MAP_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (MAP_SIZE / rect.height);

    if (this.isMouseDown) {
      const dx = x - this.mouseStartPos.x;
      const dy = y - this.mouseStartPos.y;
      const moved = Math.sqrt(dx * dx + dy * dy);

      if (moved > OpenFrontierRespawnMap.DRAG_THRESHOLD || this.isPanning) {
        this.isPanning = true;
        this.mapCanvas.style.cursor = 'move';
        const panDx = x - this.lastMousePos.x;
        const panDy = y - this.lastMousePos.y;
        this.panOffset.x += panDx;
        this.panOffset.y += panDy;
        this.lastMousePos = { x, y };
        this.render();
      }
    } else {
      const spawnPoint = this.getSpawnPointAtPosition(x, y);
      this.mapCanvas.style.cursor = spawnPoint ? 'pointer' : 'default';
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.isMouseDown) return;

    if (!this.isPanning) {
      // Short click - select zone
      const rect = this.mapCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (MAP_SIZE / rect.width);
      const y = (e.clientY - rect.top) * (MAP_SIZE / rect.height);
      this.handleMapClick(x, y);
    }

    this.isMouseDown = false;
    this.isPanning = false;
    this.mapCanvas.style.cursor = 'default';
  };

  private handleMouseLeave = () => {
    this.isMouseDown = false;
    this.isPanning = false;
    this.mapCanvas.style.cursor = 'default';
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoomLevel = Math.max(0.5, Math.min(getMaxZoom(), this.zoomLevel * delta));
    this.render();
  };

  private handleContextMenu = (e: Event) => {
    e.preventDefault();
  };

  // Touch event handlers
  private handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      // Start pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchStartDistance = Math.sqrt(dx * dx + dy * dy);
      this.pinchStartZoom = this.zoomLevel;
      this.isTouchPanning = false;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.touchIdentifier = touch.identifier;
      const rect = this.mapCanvas.getBoundingClientRect();
      const x = (touch.clientX - rect.left) * (MAP_SIZE / rect.width);
      const y = (touch.clientY - rect.top) * (MAP_SIZE / rect.height);
      this.touchStartPos = { x, y };
      this.lastTouchPos = { x, y };
      this.isTouchPanning = false;
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (this.pinchStartDistance > 0) {
        const scale = distance / this.pinchStartDistance;
        this.zoomLevel = Math.max(0.5, Math.min(getMaxZoom(), this.pinchStartZoom * scale));
        this.render();
      }
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = this.mapCanvas.getBoundingClientRect();
      const x = (touch.clientX - rect.left) * (MAP_SIZE / rect.width);
      const y = (touch.clientY - rect.top) * (MAP_SIZE / rect.height);

      const dx = x - this.touchStartPos.x;
      const dy = y - this.touchStartPos.y;
      const moved = Math.sqrt(dx * dx + dy * dy);

      if (moved > OpenFrontierRespawnMap.DRAG_THRESHOLD || this.isTouchPanning) {
        // Pan the map
        this.isTouchPanning = true;
        const panDx = x - this.lastTouchPos.x;
        const panDy = y - this.lastTouchPos.y;
        this.panOffset.x += panDx;
        this.panOffset.y += panDy;
        this.lastTouchPos = { x, y };
        this.render();
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    // If fingers still down (e.g. lifting one finger from pinch), reset state
    if (e.touches.length > 0) {
      this.isTouchPanning = false;
      this.pinchStartDistance = 0;
      return;
    }

    if (!this.isTouchPanning) {
      // Tap - treat as click for spawn selection
      const touch = e.changedTouches[0];
      if (touch) {
        const rect = this.mapCanvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) * (MAP_SIZE / rect.width);
        const y = (touch.clientY - rect.top) * (MAP_SIZE / rect.height);
        this.handleMapClick(x, y);
      }
    }

    this.isTouchPanning = false;
    this.touchIdentifier = null;
    this.pinchStartDistance = 0;
  };

  constructor() {
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = MAP_SIZE;
    this.mapCanvas.height = MAP_SIZE;
    this.mapContext = this.mapCanvas.getContext('2d')!;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.mapCanvas.addEventListener('mousedown', this.handleMouseDown);
    this.mapCanvas.addEventListener('mousemove', this.handleMouseMove);
    this.mapCanvas.addEventListener('mouseup', this.handleMouseUp);
    this.mapCanvas.addEventListener('mouseleave', this.handleMouseLeave);
    this.mapCanvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.mapCanvas.addEventListener('contextmenu', this.handleContextMenu);

    // Touch events for mobile support
    this.mapCanvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.mapCanvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.mapCanvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.mapCanvas.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
  }

  private handleMapClick(canvasX: number, canvasY: number): void {
    const spawnPoint = this.getSpawnPointAtPosition(canvasX, canvasY);

    if (spawnPoint) {
      this.selectedZoneId = spawnPoint.id;

      if (this.onZoneSelected) {
        this.onZoneSelected(spawnPoint.id, spawnPoint.name);
      }

      this.render();
    }
  }

  updateSpawnableZones(): void {}

  render(): void {
    OpenFrontierRespawnMapRenderer.render(
      this.mapContext,
      {
        zoomLevel: this.zoomLevel,
        panOffset: this.panOffset,
        selectedSpawnPointId: this.selectedZoneId
      },
      this.zoneManager,
      this.spawnPoints
    );
  }

  // Public API
  getCanvas(): HTMLCanvasElement {
    return this.mapCanvas;
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
  }

  setWorldSize(size: number): void {
    setMapWorldSize(size);
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
  }

  setZoneSelectedCallback(callback: (zoneId: string, zoneName: string) => void): void {
    this.onZoneSelected = callback;
  }

  setSpawnPoints(spawnPoints: RespawnSpawnPoint[]): void {
    this.spawnPoints = spawnPoints.map(spawnPoint => ({
      ...spawnPoint,
      position: spawnPoint.position.clone()
    }));
    if (this.selectedZoneId && !this.spawnPoints.some(spawnPoint => spawnPoint.id === this.selectedZoneId)) {
      this.selectedZoneId = undefined;
    }
    this.render();
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
    this.mapCanvas.removeEventListener('mousedown', this.handleMouseDown);
    this.mapCanvas.removeEventListener('mousemove', this.handleMouseMove);
    this.mapCanvas.removeEventListener('mouseup', this.handleMouseUp);
    this.mapCanvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.mapCanvas.removeEventListener('wheel', this.handleWheel);
    this.mapCanvas.removeEventListener('contextmenu', this.handleContextMenu);

    // Touch events
    this.mapCanvas.removeEventListener('touchstart', this.handleTouchStart);
    this.mapCanvas.removeEventListener('touchmove', this.handleTouchMove);
    this.mapCanvas.removeEventListener('touchend', this.handleTouchEnd);
    this.mapCanvas.removeEventListener('touchcancel', this.handleTouchEnd);

    if (this.mapCanvas.parentElement) {
      this.mapCanvas.parentElement.removeChild(this.mapCanvas);
    }

    this.onZoneSelected = undefined;
    this.zoneManager = undefined;
    this.gameModeManager = undefined;
  }

  private getSpawnPointAtPosition(canvasX: number, canvasY: number): RespawnSpawnPoint | undefined {
    const adjusted = transformCanvasToMapSpace(canvasX, canvasY, this.zoomLevel, this.panOffset);

    for (const spawnPoint of this.spawnPoints) {
      const { x, y } = worldToMap(spawnPoint.position.x, spawnPoint.position.z);
      const dx = adjusted.x - x;
      const dy = adjusted.y - y;
      if ((dx * dx + dy * dy) <= (20 * 20)) {
        return spawnPoint;
      }
    }

    return undefined;
  }
}
