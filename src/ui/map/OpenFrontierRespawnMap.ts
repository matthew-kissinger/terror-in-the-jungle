import { ZoneManager, CaptureZone } from '../../systems/world/ZoneManager';
import { GameModeManager } from '../../systems/world/GameModeManager';
import { OpenFrontierRespawnMapRenderer } from './OpenFrontierRespawnMapRenderer';
import { 
  MAP_SIZE, 
  isZoneSpawnable, 
  getZoneAtPosition 
} from './OpenFrontierRespawnMapUtils';

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
  private spawnableZones: CaptureZone[] = [];

  // Zoom and pan state
  private zoomLevel = 1;
  private panOffset = { x: 0, y: 0 };
  private isPanning = false;
  private lastMousePos = { x: 0, y: 0 };

  // Touch state
  private touchIdentifier: number | null = null;
  private touchStartPos = { x: 0, y: 0 };
  private lastTouchPos = { x: 0, y: 0 };
  private isTouchPanning = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;

  // Event handler references
  private handleClick = (e: MouseEvent) => {
    if (this.isPanning) return;

    const rect = this.mapCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (MAP_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (MAP_SIZE / rect.height);
    this.handleMapClick(x, y);
  };

  private handleMouseMove = (e: MouseEvent) => {
    const rect = this.mapCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (MAP_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (MAP_SIZE / rect.height);

    if (this.isPanning) {
      const dx = x - this.lastMousePos.x;
      const dy = y - this.lastMousePos.y;
      this.panOffset.x += dx;
      this.panOffset.y += dy;
      this.lastMousePos = { x, y };
      this.render();
    } else {
      const zone = getZoneAtPosition(x, y, this.zoomLevel, this.panOffset, this.zoneManager);
      this.mapCanvas.style.cursor = zone && isZoneSpawnable(zone, this.gameModeManager) ? 'pointer' : 'default';
    }
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoomLevel = Math.max(0.5, Math.min(2, this.zoomLevel * delta));
    this.render();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this.isPanning = true;
      const rect = this.mapCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (MAP_SIZE / rect.width);
      const y = (e.clientY - rect.top) * (MAP_SIZE / rect.height);
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
        this.zoomLevel = Math.max(0.5, Math.min(2, this.pinchStartZoom * scale));
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

      if (moved > 5 || this.isTouchPanning) {
        // Pan the map
        this.isTouchPanning = true;
        const panDx = x - this.lastTouchPos.x;
        const panDy = y - this.lastTouchPos.y;
        this.panOffset.x += panDx;
        this.panOffset.y += panDy;
        this.lastTouchPos = { x, y };
        this.render();
      } else {
        // Hover zone detection
        const zone = getZoneAtPosition(x, y, this.zoomLevel, this.panOffset, this.zoneManager);
        this.mapCanvas.style.cursor = zone && isZoneSpawnable(zone, this.gameModeManager) ? 'pointer' : 'default';
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
      // Tap — treat as click for spawn selection
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
    this.mapCanvas.addEventListener('click', this.handleClick);
    this.mapCanvas.addEventListener('mousemove', this.handleMouseMove);
    this.mapCanvas.addEventListener('wheel', this.handleWheel);
    this.mapCanvas.addEventListener('mousedown', this.handleMouseDown);
    this.mapCanvas.addEventListener('mouseup', this.handleMouseUp);
    this.mapCanvas.addEventListener('mouseleave', this.handleMouseLeave);

    // Touch events for mobile support
    this.mapCanvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.mapCanvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.mapCanvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.mapCanvas.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
  }

  private handleMapClick(canvasX: number, canvasY: number): void {
    const zone = getZoneAtPosition(canvasX, canvasY, this.zoomLevel, this.panOffset, this.zoneManager);

    if (zone && isZoneSpawnable(zone, this.gameModeManager)) {
      this.selectedZoneId = zone.id;

      if (this.onZoneSelected) {
        this.onZoneSelected(zone.id, zone.name);
      }

      this.render();
    }
  }

  updateSpawnableZones(): void {
    if (!this.zoneManager) {
      this.spawnableZones = [];
      return;
    }

    this.spawnableZones = this.zoneManager.getAllZones().filter(zone => {
      return isZoneSpawnable(zone, this.gameModeManager);
    });
  }

  render(): void {
    OpenFrontierRespawnMapRenderer.render(
      this.mapContext,
      {
        zoomLevel: this.zoomLevel,
        panOffset: this.panOffset,
        selectedZoneId: this.selectedZoneId
      },
      this.zoneManager,
      this.gameModeManager
    );
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
}
