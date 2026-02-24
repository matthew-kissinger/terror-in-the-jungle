/**
 * Input handling, zoom, pan, and touch gesture management for the Full Map System
 */

import { MIN_ZOOM, MAX_ZOOM } from './FullMapStyles';
import { InputContextManager } from '../../systems/input/InputContextManager';

export interface FullMapInputCallbacks {
  onShow: () => void;
  onHide: () => void;
  onRender: () => void;
}

/** Touch gesture state machine */
const enum GestureState {
  IDLE,
  DRAGGING,
  ZOOMING,
}

export class FullMapInput {
  private zoomLevel = 1;
  private defaultZoomLevel = 1;
  private callbacks: FullMapInputCallbacks;
  private isVisible = false;
  private mapCanvas?: HTMLCanvasElement;
  private readonly contextManager = InputContextManager.getInstance();

  // Pan offset (in canvas pixels, applied before zoom)
  private panX = 0;
  private panY = 0;

  // Touch gesture state
  private gestureState: GestureState = GestureState.IDLE;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private initialPinchDistance = 0;
  private initialPinchZoom = 1;
  private activeTouchCount = 0;

  // Mouse drag state
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Bound event handlers (stored to allow cleanup)
  private boundKeyDownHandler: (e: KeyboardEvent) => void;
  private boundKeyUpHandler: (e: KeyboardEvent) => void;
  private boundWheelHandler: (e: WheelEvent) => void;
  private boundMouseDownHandler: (e: MouseEvent) => void;
  private boundMouseMoveHandler: (e: MouseEvent) => void;
  private boundMouseUpHandler: (e: MouseEvent) => void;
  private boundTouchStartHandler: (e: TouchEvent) => void;
  private boundTouchMoveHandler: (e: TouchEvent) => void;
  private boundTouchEndHandler: (e: TouchEvent) => void;

  constructor(callbacks: FullMapInputCallbacks) {
    this.callbacks = callbacks;

    // Bind handlers to allow cleanup
    this.boundKeyDownHandler = this.handleKeyDown.bind(this);
    this.boundKeyUpHandler = this.handleKeyUp.bind(this);
    this.boundWheelHandler = this.handleWheel.bind(this);
    this.boundMouseDownHandler = this.handleMouseDown.bind(this);
    this.boundMouseMoveHandler = this.handleMouseMove.bind(this);
    this.boundMouseUpHandler = this.handleMouseUp.bind(this);
    this.boundTouchStartHandler = this.handleTouchStart.bind(this);
    this.boundTouchMoveHandler = this.handleTouchMove.bind(this);
    this.boundTouchEndHandler = this.handleTouchEnd.bind(this);
  }

  setupEventListeners(mapCanvas: HTMLCanvasElement): void {
    this.mapCanvas = mapCanvas;
    // M key to show/hide
    window.addEventListener('keydown', this.boundKeyDownHandler);
    window.addEventListener('keyup', this.boundKeyUpHandler);

    // Mouse wheel zoom + drag-to-pan
    mapCanvas.addEventListener('wheel', this.boundWheelHandler);
    mapCanvas.addEventListener('mousedown', this.boundMouseDownHandler);
    window.addEventListener('mousemove', this.boundMouseMoveHandler);
    window.addEventListener('mouseup', this.boundMouseUpHandler);

    // Touch gestures (pinch-zoom + drag-pan)
    mapCanvas.addEventListener('touchstart', this.boundTouchStartHandler, { passive: false });
    mapCanvas.addEventListener('touchmove', this.boundTouchMoveHandler, { passive: false });
    mapCanvas.addEventListener('touchend', this.boundTouchEndHandler, { passive: false });
    mapCanvas.addEventListener('touchcancel', this.boundTouchEndHandler, { passive: false });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'm' || e.key === 'M') {
      if (!e.repeat) {
        this.isVisible = true;
        this.contextManager.setContext('map');
        this.callbacks.onShow();
      }
    } else if (e.key === 'Escape' && this.isVisible) {
      this.isVisible = false;
      this.contextManager.setContext('gameplay');
      this.callbacks.onHide();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === 'm' || e.key === 'M') {
      this.isVisible = false;
      this.contextManager.setContext('gameplay');
      this.callbacks.onHide();
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    // Multiplicative zoom: each scroll tick changes by ~15%
    const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoomLevel * factor));
    this.callbacks.onRender();
  }

  // --- Mouse drag-to-pan handlers ---

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Left button only
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.panX += dx;
    this.panY += dy;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.callbacks.onRender();
  }

  private handleMouseUp(_e: MouseEvent): void {
    this.isDragging = false;
  }

  // --- Touch gesture handlers ---

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.activeTouchCount = e.touches.length;

    if (e.touches.length === 2) {
      // Switch to pinch-zoom
      this.gestureState = GestureState.ZOOMING;
      this.initialPinchDistance = this.getTouchDistance(e.touches[0], e.touches[1]);
      this.initialPinchZoom = this.zoomLevel;
      // Track midpoint for combined pan during pinch
      const mid = this.getTouchMidpoint(e.touches[0], e.touches[1]);
      this.lastTouchX = mid.x;
      this.lastTouchY = mid.y;
    } else if (e.touches.length === 1) {
      // Single-finger drag-pan
      this.gestureState = GestureState.DRAGGING;
      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();

    if (this.gestureState === GestureState.ZOOMING && e.touches.length >= 2) {
      // Pinch-to-zoom
      const newDist = this.getTouchDistance(e.touches[0], e.touches[1]);
      if (this.initialPinchDistance > 0) {
        const scale = newDist / this.initialPinchDistance;
        const newZoom = this.initialPinchZoom * scale;
        this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
      }
      // Pan during pinch (follow midpoint)
      const mid = this.getTouchMidpoint(e.touches[0], e.touches[1]);
      const dx = mid.x - this.lastTouchX;
      const dy = mid.y - this.lastTouchY;
      this.panX += dx;
      this.panY += dy;
      this.lastTouchX = mid.x;
      this.lastTouchY = mid.y;
      this.callbacks.onRender();
    } else if (this.gestureState === GestureState.DRAGGING && e.touches.length === 1) {
      // Single-finger drag-pan
      const dx = e.touches[0].clientX - this.lastTouchX;
      const dy = e.touches[0].clientY - this.lastTouchY;
      this.panX += dx;
      this.panY += dy;
      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
      this.callbacks.onRender();
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    this.activeTouchCount = e.touches.length;

    if (e.touches.length === 0) {
      this.gestureState = GestureState.IDLE;
    } else if (e.touches.length === 1 && this.gestureState === GestureState.ZOOMING) {
      // Transitioned from pinch to single finger — start drag from current position
      this.gestureState = GestureState.DRAGGING;
      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
    }
  }

  private getTouchDistance(t1: Touch, t2: Touch): number {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getTouchMidpoint(t1: Touch, t2: Touch): { x: number; y: number } {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }

  // --- Public API ---

  zoom(delta: number): void {
    // Multiplicative zoom for consistent feel at any zoom level
    const factor = delta > 0 ? 1.2 : 1 / 1.2;
    this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoomLevel * factor));
    this.callbacks.onRender();
  }

  resetZoom(): void {
    this.zoomLevel = this.defaultZoomLevel;
    this.panX = 0;
    this.panY = 0;
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

  getPanOffset(): { x: number; y: number } {
    return { x: this.panX, y: this.panY };
  }

  resetPan(): void {
    this.panX = 0;
    this.panY = 0;
  }

  setPanOffset(x: number, y: number): void {
    this.panX = x;
    this.panY = y;
  }

  setIsVisible(visible: boolean): void {
    this.isVisible = visible;
    this.contextManager.setContext(visible ? 'map' : 'gameplay');
    if (!visible) {
      // Reset gesture state when map is hidden
      this.gestureState = GestureState.IDLE;
      this.activeTouchCount = 0;
    }
  }

  /** Toggle map visibility (used by mobile map button) */
  toggle(): void {
    if (this.isVisible) {
      this.isVisible = false;
      this.contextManager.setContext('gameplay');
      this.callbacks.onHide();
    } else {
      this.isVisible = true;
      this.contextManager.setContext('map');
      this.callbacks.onShow();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.boundKeyDownHandler);
    window.removeEventListener('keyup', this.boundKeyUpHandler);
    window.removeEventListener('mousemove', this.boundMouseMoveHandler);
    window.removeEventListener('mouseup', this.boundMouseUpHandler);
    if (this.mapCanvas) {
      this.mapCanvas.removeEventListener('wheel', this.boundWheelHandler);
      this.mapCanvas.removeEventListener('mousedown', this.boundMouseDownHandler);
      this.mapCanvas.removeEventListener('touchstart', this.boundTouchStartHandler);
      this.mapCanvas.removeEventListener('touchmove', this.boundTouchMoveHandler);
      this.mapCanvas.removeEventListener('touchend', this.boundTouchEndHandler);
      this.mapCanvas.removeEventListener('touchcancel', this.boundTouchEndHandler);
    }
  }
}
