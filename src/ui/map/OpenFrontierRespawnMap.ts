// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { IZoneQuery } from '../../types/SystemInterfaces';
import { GameModeManager } from '../../systems/world/GameModeManager';
import { OpenFrontierRespawnMapRenderer } from './OpenFrontierRespawnMapRenderer';
import {
  MAP_SIZE,
  setMapWorldSize,
  getMaxZoom,
  transformCanvasToMapSpace,
  computeHitRadiusMapUnits,
  pickNearestSpawnWithinRadius,
  clampPanToBounds,
  worldToMap
} from './OpenFrontierRespawnMapUtils';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';
import type { VehicleMarker } from '../minimap/MinimapRenderer';

const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.5;
const VIEW_PADDING = 96;
const SINGLE_SPAWN_ZOOM = 2.2;
const ZOOM_BUTTON_STEP = 1.4;

export class OpenFrontierRespawnMap {
  private zoneQuery?: IZoneQuery;
  private gameModeManager?: GameModeManager;

  // Canvas elements
  private mapCanvas: HTMLCanvasElement;
  private mapContext: CanvasRenderingContext2D;

  // Navigation controls overlay (zoom +/-, recenter, prev/next spawn). Built
  // once and self-mounted into the canvas's parent so the deploy screen does
  // not have to wire each button — see ensureControlsMounted().
  private controlsOverlay: HTMLDivElement;
  private controlsMounted = false;

  // Selection state
  private selectedZoneId?: string;
  private onZoneSelected?: (zoneId: string, zoneName: string) => void;
  // Opt-in 3D orbital topo map toggle (deploy screen). Default deploy map is 2D.
  private onToggleOrbital3D?: () => void;

  // Spawn zones
  private spawnPoints: RespawnSpawnPoint[] = [];

  // Crewable-vehicle markers (tank / jeep / sampan) so the player can see
  // where vehicles are before deploying. Shares the VehicleMarker shape
  // used by the minimap and full map.
  private vehicleMarkers: VehicleMarker[] = [];

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
        this.clampPan();
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
    this.zoomLevel = Math.max(MIN_ZOOM, Math.min(getMaxZoom(), this.zoomLevel * delta));
    this.clampPan();
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
        this.zoomLevel = Math.max(MIN_ZOOM, Math.min(getMaxZoom(), this.pinchStartZoom * scale));
        this.clampPan();
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
        this.clampPan();
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
    this.controlsOverlay = this.buildControlsOverlay();

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
    this.ensureControlsMounted();
    OpenFrontierRespawnMapRenderer.render(
      this.mapContext,
      {
        zoomLevel: this.zoomLevel,
        panOffset: this.panOffset,
        selectedSpawnPointId: this.selectedZoneId
      },
      this.zoneQuery,
      this.spawnPoints,
      this.vehicleMarkers
    );
  }

  // Public API
  getCanvas(): HTMLCanvasElement {
    return this.mapCanvas;
  }

  setZoneQuery(query: IZoneQuery): void {
    this.zoneQuery = query;
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

  /** Wire the opt-in 3D orbital-map toggle button (deploy screen). */
  setOrbitalToggleCallback(callback: () => void): void {
    this.onToggleOrbital3D = callback;
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

  setVehicleMarkers(markers: VehicleMarker[]): void {
    this.vehicleMarkers = markers.map(marker => ({
      ...marker,
      worldPos: marker.worldPos.clone()
    }));
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
    this.zoomLevel = DEFAULT_ZOOM;
    this.panOffset = { x: 0, y: 0 };
    this.clampPan();
    this.render();
  }

  /**
   * Recenter the view to a sensible default — frame all spawn points so the
   * player can see every option at once. Wired to the recenter control button.
   */
  recenter(): void {
    this.focusSpawnPoints();
  }

  /**
   * Zoom by a multiplicative factor (>1 zoom in, <1 zoom out), clamped to the
   * world-scaled zoom ceiling, then re-clamp the pan so the zoom-out never
   * leaves the map dragged off into empty space. Wired to the +/- buttons.
   */
  zoomBy(factor: number): void {
    if (!(factor > 0)) return;
    this.zoomLevel = Math.max(MIN_ZOOM, Math.min(getMaxZoom(), this.zoomLevel * factor));
    this.clampPan();
    this.render();
  }

  /**
   * Step the selection to the next/prev spawn point (wraps around) and frame it
   * so the player can walk through spawns without hunting on the canvas.
   * direction > 0 advances, < 0 goes back. Returns the now-selected spawn.
   */
  cycleSpawn(direction: number): RespawnSpawnPoint | undefined {
    if (this.spawnPoints.length === 0) return undefined;
    const step = direction < 0 ? -1 : 1;
    const currentIndex = this.selectedZoneId
      ? this.spawnPoints.findIndex(spawnPoint => spawnPoint.id === this.selectedZoneId)
      : -1;
    const count = this.spawnPoints.length;
    // From "no selection" a forward step lands on the first spawn, a back step
    // on the last — both reachable without a prior pick.
    const nextIndex = currentIndex === -1
      ? (step > 0 ? 0 : count - 1)
      : (currentIndex + step + count) % count;
    const next = this.spawnPoints[nextIndex];
    this.selectedZoneId = next.id;
    if (this.onZoneSelected) {
      this.onZoneSelected(next.id, next.name);
    }
    this.frameSpawnPoint(next);
    return next;
  }

  /**
   * Zoom and pan so a single spawn sits centred and close-up. Unlike
   * focusSpawnPoints (which fits ALL spawns), this drives in on one spawn so
   * cycling actually moves the camera to each pick. Pan is clamped so corner
   * spawns stay on-screen.
   */
  private frameSpawnPoint(spawnPoint: RespawnSpawnPoint): void {
    const point = worldToMap(spawnPoint.position.x, spawnPoint.position.z);
    // Drive in to at least a close-up zoom (capped by the world-scaled ceiling)
    // so a spawn on the 21km canvas fills the view rather than being a speck.
    const targetZoom = Math.min(getMaxZoom(), Math.max(SINGLE_SPAWN_ZOOM, this.zoomLevel));
    this.zoomLevel = targetZoom;
    this.panOffset = {
      x: (MAP_SIZE / 2 - point.x) * this.zoomLevel,
      y: (MAP_SIZE / 2 - point.y) * this.zoomLevel
    };
    this.clampPan();
    this.render();
  }

  setSelectedSpawnPoint(spawnPointId: string | undefined): void {
    this.selectedZoneId = spawnPointId;
    this.render();
  }

  focusSpawnPoints(preferredSpawnPointId?: string): void {
    if (this.spawnPoints.length === 0) {
      this.resetView();
      return;
    }

    if (this.spawnPoints.length === 1) {
      const point = worldToMap(this.spawnPoints[0].position.x, this.spawnPoints[0].position.z);
      this.zoomLevel = Math.min(getMaxZoom(), SINGLE_SPAWN_ZOOM);
      this.panOffset = {
        x: (MAP_SIZE / 2 - point.x) * this.zoomLevel,
        y: (MAP_SIZE / 2 - point.y) * this.zoomLevel
      };
      this.clampPan();
      this.render();
      return;
    }

    const mapPoints = this.spawnPoints.map(spawnPoint => ({
      id: spawnPoint.id,
      ...worldToMap(spawnPoint.position.x, spawnPoint.position.z)
    }));
    const minX = Math.min(...mapPoints.map(point => point.x));
    const maxX = Math.max(...mapPoints.map(point => point.x));
    const minY = Math.min(...mapPoints.map(point => point.y));
    const maxY = Math.max(...mapPoints.map(point => point.y));
    const boundsWidth = Math.max(1, maxX - minX);
    const boundsHeight = Math.max(1, maxY - minY);
    const availableViewSize = Math.max(1, MAP_SIZE - VIEW_PADDING * 2);
    const fitZoom = Math.min(
      getMaxZoom(),
      Math.max(
        DEFAULT_ZOOM,
        Math.min(availableViewSize / boundsWidth, availableViewSize / boundsHeight)
      )
    );

    this.zoomLevel = fitZoom;

    const preferredPoint = preferredSpawnPointId
      ? mapPoints.find(point => point.id === preferredSpawnPointId)
      : undefined;
    const centerPoint = preferredPoint ?? {
      x: (minX + maxX) * 0.5,
      y: (minY + maxY) * 0.5
    };

    this.panOffset = {
      x: (MAP_SIZE / 2 - centerPoint.x) * this.zoomLevel,
      y: (MAP_SIZE / 2 - centerPoint.y) * this.zoomLevel
    };
    this.clampPan();
    this.render();
  }

  private clampPan(): void {
    this.panOffset = clampPanToBounds(this.panOffset, this.zoomLevel);
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
    if (this.controlsOverlay.parentElement) {
      this.controlsOverlay.parentElement.removeChild(this.controlsOverlay);
    }
    this.controlsMounted = false;

    this.onZoneSelected = undefined;
    this.zoneQuery = undefined;
    this.gameModeManager = undefined;
  }

  /**
   * Mount the navigation controls into the canvas's parent the first time the
   * canvas is attached. The deploy screen / controller only ever appends the
   * canvas (getCanvas()), so the map self-mounts its own controls as an overlay
   * sibling — no extra wiring needed on the caller side.
   */
  private ensureControlsMounted(): void {
    const parent = this.mapCanvas.parentElement;
    if (!parent) return;
    if (this.controlsMounted && this.controlsOverlay.parentElement === parent) return;
    // The container must be a positioning context for the absolute overlay.
    if (getComputedStyle(parent).position === 'static') {
      (parent as HTMLElement).style.position = 'relative';
    }
    parent.appendChild(this.controlsOverlay);
    this.controlsMounted = true;
  }

  private buildControlsOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'respawn-map-controls';
    overlay.setAttribute('data-respawn-map-controls', 'true');
    overlay.style.cssText = [
      'position:absolute',
      'top:10px',
      'left:10px',
      'display:flex',
      'flex-direction:column',
      'gap:6px',
      'z-index:5',
      'pointer-events:none',
    ].join(';');

    const zoomGroup = this.buildControlGroup();
    zoomGroup.appendChild(this.buildControlButton('respawn-map-zoom-in', '+', 'Zoom in', () => this.zoomBy(ZOOM_BUTTON_STEP)));
    zoomGroup.appendChild(this.buildControlButton('respawn-map-zoom-out', '−', 'Zoom out', () => this.zoomBy(1 / ZOOM_BUTTON_STEP)));
    zoomGroup.appendChild(this.buildControlButton('respawn-map-recenter', '⌖', 'Recenter', () => this.recenter()));

    const spawnGroup = this.buildControlGroup();
    spawnGroup.appendChild(this.buildControlButton('respawn-map-prev-spawn', '◀', 'Previous spawn', () => this.cycleSpawn(-1)));
    spawnGroup.appendChild(this.buildControlButton('respawn-map-next-spawn', '▶', 'Next spawn', () => this.cycleSpawn(1)));

    const viewGroup = this.buildControlGroup();
    viewGroup.appendChild(this.buildControlButton('respawn-map-3d', '3D', '3D topographic map', () => this.onToggleOrbital3D?.()));

    overlay.appendChild(zoomGroup);
    overlay.appendChild(spawnGroup);
    overlay.appendChild(viewGroup);
    return overlay;
  }

  private buildControlGroup(): HTMLDivElement {
    const group = document.createElement('div');
    group.style.cssText = 'display:flex;flex-direction:column;gap:4px;pointer-events:auto';
    return group;
  }

  private buildControlButton(id: string, glyph: string, title: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.textContent = glyph;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.style.cssText = [
      'width:34px',
      'height:34px',
      'border:1px solid rgba(43, 38, 32, 0.45)',
      'border-radius:6px',
      'background:rgba(231, 217, 186, 0.92)',
      'color:rgba(43, 38, 32, 0.95)',
      'font:bold 18px "Courier Prime", monospace',
      'cursor:pointer',
      'line-height:1',
      'padding:0',
    ].join(';');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onPress();
    });
    return button;
  }

  private getSpawnPointAtPosition(canvasX: number, canvasY: number): RespawnSpawnPoint | undefined {
    const adjusted = transformCanvasToMapSpace(canvasX, canvasY, this.zoomLevel, this.panOffset);
    const rect = this.mapCanvas.getBoundingClientRect();
    const hitRadius = computeHitRadiusMapUnits(this.zoomLevel, rect.width);
    return pickNearestSpawnWithinRadius(adjusted.x, adjusted.y, this.spawnPoints, hitRadius);
  }
}
