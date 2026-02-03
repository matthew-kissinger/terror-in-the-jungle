/**
 * Input handling and zoom state management for the Full Map System
 */

import { MIN_ZOOM, MAX_ZOOM } from './FullMapStyles';

export interface FullMapInputCallbacks {
  onShow: () => void;
  onHide: () => void;
  onRender: () => void;
}

export class FullMapInput {
  private zoomLevel = 1;
  private defaultZoomLevel = 1;
  private callbacks: FullMapInputCallbacks;
  private isVisible = false;
  private mapCanvas?: HTMLCanvasElement;

  // Bound event handlers (stored to allow cleanup)
  private boundKeyDownHandler: (e: KeyboardEvent) => void;
  private boundKeyUpHandler: (e: KeyboardEvent) => void;
  private boundWheelHandler: (e: WheelEvent) => void;

  constructor(callbacks: FullMapInputCallbacks) {
    this.callbacks = callbacks;

    // Bind handlers to allow cleanup
    this.boundKeyDownHandler = this.handleKeyDown.bind(this);
    this.boundKeyUpHandler = this.handleKeyUp.bind(this);
    this.boundWheelHandler = this.handleWheel.bind(this);
  }

  setupEventListeners(mapCanvas: HTMLCanvasElement): void {
    this.mapCanvas = mapCanvas;
    // M key to show/hide
    window.addEventListener('keydown', this.boundKeyDownHandler);
    window.addEventListener('keyup', this.boundKeyUpHandler);

    // Mouse wheel zoom
    mapCanvas.addEventListener('wheel', this.boundWheelHandler);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'm' || e.key === 'M') {
      if (!e.repeat) {
        this.isVisible = true;
        this.callbacks.onShow();
      }
    } else if (e.key === 'Escape' && this.isVisible) {
      this.isVisible = false;
      this.callbacks.onHide();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === 'm' || e.key === 'M') {
      this.isVisible = false;
      this.callbacks.onHide();
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.zoom(delta);
  }

  zoom(delta: number): void {
    // Scale zoom speed based on current zoom level for smoother control
    const scaledDelta = delta * Math.sqrt(this.zoomLevel);
    this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoomLevel + scaledDelta));
    this.callbacks.onRender();
  }

  resetZoom(): void {
    this.zoomLevel = this.defaultZoomLevel;
    this.callbacks.onRender();
  }

  getZoomLevel(): number {
    return this.zoomLevel;
  }

  setZoomLevel(level: number): void {
    this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
  }

  getDefaultZoomLevel(): number {
    return this.defaultZoomLevel;
  }

  setDefaultZoomLevel(level: number): void {
    this.defaultZoomLevel = level;
  }

  setIsVisible(visible: boolean): void {
    this.isVisible = visible;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.boundKeyDownHandler);
    window.removeEventListener('keyup', this.boundKeyUpHandler);
    if (this.mapCanvas) {
      this.mapCanvas.removeEventListener('wheel', this.boundWheelHandler);
    }
  }
}
