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

    if (this.mapCanvas.parentElement) {
      this.mapCanvas.parentElement.removeChild(this.mapCanvas);
    }

    this.onZoneSelected = undefined;
    this.zoneManager = undefined;
    this.gameModeManager = undefined;
  }
}
