/**
 * ViewportManager - singleton that tracks viewport dimensions and emits
 * responsive info to subscribers. Uses ResizeObserver + rAF debounce.
 */

import { breakpoints } from './tokens';

export type ViewportClass = 'phone' | 'tablet' | 'desktop' | 'wide';

export interface ViewportInfo {
  width: number;
  height: number;
  viewportClass: ViewportClass;
  scale: number;
  isPortrait: boolean;
  isTouch: boolean;
}

type ViewportCallback = (info: ViewportInfo) => void;

const SCALE_MAP: Record<ViewportClass, number> = {
  phone: 0.6,
  tablet: 0.75,
  desktop: 0.9,
  wide: 1.0,
};

function classify(width: number): ViewportClass {
  if (width <= breakpoints.phone) return 'phone';
  if (width <= breakpoints.tablet) return 'tablet';
  if (width <= breakpoints.wide) return 'desktop';
  return 'wide';
}

export class ViewportManager {
  private static instance: ViewportManager | null = null;

  private subscribers = new Set<ViewportCallback>();
  private current: ViewportInfo;
  private observer: ResizeObserver;
  private rafId = 0;

  private constructor() {
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    const vc = classify(w);
    this.current = {
      width: w,
      height: h,
      viewportClass: vc,
      scale: SCALE_MAP[vc],
      isPortrait: h > w,
      isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    };

    this.observer = new ResizeObserver(() => {
      if (this.rafId) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        this.measure();
      });
    });
    this.observer.observe(document.documentElement);
  }

  static getInstance(): ViewportManager {
    if (!ViewportManager.instance) {
      ViewportManager.instance = new ViewportManager();
    }
    return ViewportManager.instance;
  }

  /** For testing only */
  static resetForTest(): void {
    if (ViewportManager.instance) {
      ViewportManager.instance.dispose();
      ViewportManager.instance = null;
    }
  }

  get info(): ViewportInfo {
    return this.current;
  }

  subscribe(cb: ViewportCallback): () => void {
    this.subscribers.add(cb);
    cb(this.current);
    return () => this.subscribers.delete(cb);
  }

  private measure(): void {
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    const vc = classify(w);
    this.current = {
      width: w,
      height: h,
      viewportClass: vc,
      scale: SCALE_MAP[vc],
      isPortrait: h > w,
      isTouch: this.current.isTouch,
    };
    for (const cb of this.subscribers) {
      cb(this.current);
    }
  }

  dispose(): void {
    this.observer.disconnect();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.subscribers.clear();
  }
}
