/**
 * HUDLayout - the CSS Grid container and component mounting system.
 *
 * Creates a single #game-hud-root div that covers the viewport and
 * provides named grid slots for all HUD components. Components mount
 * into their assigned region instead of document.body.
 *
 * Usage:
 *   const layout = new HUDLayout();
 *   layout.init();
 *   layout.getSlot('tickets');  // returns the <div data-region="tickets"> element
 *   layout.dispose();
 */

import type { HUDRegion, LayoutComponent, LayoutRegistration, UIState } from './types';
import { HUD_LAYOUT_STYLES } from './HUDLayoutStyles';
import { VisibilityManager } from './VisibilityManager';

/** All regions that get pre-created grid slots. */
const ALL_REGIONS: HUDRegion[] = [
  'timer',
  'tickets',
  'game-status',
  'compass',
  'minimap',
  'objectives',
  'stats',
  'kill-feed',
  'ammo',
  'weapon-bar',
  'center',
  'health',
  'joystick',
  'fire',
  'ads',
  'action-btns',
  'menu',
];

export class HUDLayout {
  private root: HTMLDivElement;
  private styleEl: HTMLStyleElement;
  private slots = new Map<HUDRegion, HTMLDivElement>();
  private registrations: LayoutRegistration[] = [];
  private visibilityManager: VisibilityManager;
  private mounted = false;

  constructor() {
    // Create root grid container
    this.root = document.createElement('div');
    this.root.id = 'game-hud-root';

    // Create style element
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = HUD_LAYOUT_STYLES;

    // Create all region slots
    for (const region of ALL_REGIONS) {
      const slot = document.createElement('div');
      slot.className = 'hud-slot';
      slot.dataset.region = region;
      this.slots.set(region, slot);
      this.root.appendChild(slot);
    }

    // Initialize visibility manager
    this.visibilityManager = new VisibilityManager(this.root);
  }

  /**
   * Mount the grid layout to the DOM.
   * Should be called once during HUDSystem.init().
   */
  init(): void {
    if (this.mounted) return;

    // Inject styles
    document.head.appendChild(this.styleEl);

    // Append grid to body
    document.body.appendChild(this.root);

    this.mounted = true;
  }

  /**
   * Get the DOM element for a named region.
   * Components mount their content into this element.
   */
  getSlot(region: HUDRegion): HTMLDivElement {
    const slot = this.slots.get(region);
    if (!slot) {
      throw new Error(`HUDLayout: unknown region "${region}"`);
    }
    return slot;
  }

  /**
   * Get the root grid element (for direct access if needed).
   */
  getRoot(): HTMLDivElement {
    return this.root;
  }

  /**
   * Get the VisibilityManager for state control.
   */
  getVisibilityManager(): VisibilityManager {
    return this.visibilityManager;
  }

  /**
   * Register a component into a grid region.
   * The component will be mounted into the slot and tracked for disposal.
   */
  register(registration: LayoutRegistration): void {
    this.registrations.push(registration);
    const slot = this.getSlot(registration.region);

    // Set optional show context for CSS visibility rules
    if (registration.showContext) {
      slot.dataset.show = registration.showContext;
    }

    registration.component.mount(slot);
  }

  /**
   * Unregister and unmount a component.
   */
  unregister(component: LayoutComponent): void {
    const idx = this.registrations.findIndex((r) => r.component === component);
    if (idx !== -1) {
      this.registrations[idx].component.unmount();
      this.registrations.splice(idx, 1);
    }
  }

  /**
   * Update UI state (delegates to VisibilityManager).
   */
  setState(partial: Partial<UIState>): void {
    this.visibilityManager.setState(partial);
  }

  /**
   * Convenience: set game phase.
   */
  setPhase(phase: UIState['phase']): void {
    this.visibilityManager.setPhase(phase);
  }

  /**
   * Clean up everything.
   */
  dispose(): void {
    // Unmount all registered components
    for (const reg of this.registrations) {
      reg.component.unmount();
    }
    this.registrations = [];

    // Remove from DOM
    this.visibilityManager.dispose();
    this.styleEl.remove();
    this.root.remove();
    this.slots.clear();
    this.mounted = false;
  }
}
