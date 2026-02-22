/**
 * VisibilityManager - manages UI visibility via data attributes on #game-hud-root.
 *
 * Instead of each component toggling its own display style (which overrides
 * CSS media queries), this manager sets data-* attributes on the root element
 * and CSS rules handle all visibility logic.
 *
 * This solves the core bug: inline styles (`el.style.display = 'flex'`)
 * overriding CSS class-based rules (`@media (pointer: coarse) { display: none }`).
 */

import type { UIState, LayoutMode } from './types';
import { ViewportManager } from '../design/responsive';

function deriveLayoutMode(vp: { isTouch: boolean; isPortrait: boolean }): LayoutMode {
  if (!vp.isTouch) return 'desktop';
  return vp.isPortrait ? 'mobile-portrait' : 'mobile-landscape';
}

export class VisibilityManager {
  private root: HTMLElement;
  private state: UIState;
  private viewportUnsubscribe?: () => void;

  constructor(root: HTMLElement) {
    this.root = root;

    const vp = ViewportManager.getInstance().info;
    const layout = deriveLayoutMode(vp);

    this.state = {
      device: vp.isTouch ? 'touch' : 'desktop',
      phase: 'menu',
      vehicle: 'infantry',
      ads: false,
      layout,
    };

    // Apply initial state
    this.applyAll();

    // Subscribe to viewport changes for layout mode updates
    this.viewportUnsubscribe = ViewportManager.getInstance().subscribe((info) => {
      const newLayout = deriveLayoutMode(info);
      const newDevice = info.isTouch ? 'touch' : 'desktop';
      if (newLayout !== this.state.layout || newDevice !== this.state.device) {
        this.state.layout = newLayout;
        this.state.device = newDevice;
        this.applyAll();
      }
    });
  }

  /** Get the current UI state (read-only snapshot). */
  getState(): Readonly<UIState> {
    return { ...this.state };
  }

  /**
   * Update one or more state fields and apply to DOM.
   * Only changed attributes are written.
   */
  setState(partial: Partial<UIState>): void {
    let changed = false;

    if (partial.device !== undefined && partial.device !== this.state.device) {
      this.state.device = partial.device;
      changed = true;
    }
    if (partial.phase !== undefined && partial.phase !== this.state.phase) {
      this.state.phase = partial.phase;
      changed = true;
    }
    if (partial.vehicle !== undefined && partial.vehicle !== this.state.vehicle) {
      this.state.vehicle = partial.vehicle;
      changed = true;
    }
    if (partial.ads !== undefined && partial.ads !== this.state.ads) {
      this.state.ads = partial.ads;
      changed = true;
    }
    if (partial.layout !== undefined && partial.layout !== this.state.layout) {
      this.state.layout = partial.layout;
      changed = true;
    }

    if (changed) {
      this.applyAll();
    }
  }

  /** Convenience: set game phase. */
  setPhase(phase: UIState['phase']): void {
    this.setState({ phase });
  }

  /** Convenience: set vehicle context. */
  setVehicle(vehicle: UIState['vehicle']): void {
    this.setState({ vehicle });
  }

  /** Convenience: set ADS state. */
  setADS(ads: boolean): void {
    this.setState({ ads });
  }

  /** Apply all state fields as data attributes on the root element. */
  private applyAll(): void {
    this.root.dataset.device = this.state.device;
    this.root.dataset.phase = this.state.phase;
    this.root.dataset.vehicle = this.state.vehicle;
    this.root.dataset.ads = String(this.state.ads);
    this.root.dataset.layout = this.state.layout;
  }

  dispose(): void {
    this.viewportUnsubscribe?.();
  }
}
