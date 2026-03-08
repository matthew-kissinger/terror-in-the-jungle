/**
 * Layout system type definitions.
 * Defines grid regions, component interfaces, and UI state for
 * the region-based CSS Grid HUD layout.
 */

/**
 * Named grid regions that components can mount into.
 * Each region corresponds to a CSS grid-area in the layout.
 */
export type HUDRegion =
  // Information displays
  | 'timer'
  | 'tickets'
  | 'game-status'
  | 'compass'
  | 'minimap'
  | 'objectives'
  | 'stats'
  | 'kill-feed'
  | 'ammo'
  | 'weapon-bar'
  | 'center'        // hit markers, damage numbers, grenade meter, mortar indicator
  | 'health'        // future: health bar / player status
  | 'status-bar'    // mobile: merged timer + tickets in one compact line

  // Touch controls (touch devices only)
  | 'joystick'
  | 'fire'
  | 'ads'
  | 'action-btns'
  | 'menu';

/**
 * Device layout mode derived from viewport + input method.
 * Drives which CSS grid template is active.
 */
export type LayoutMode = 'desktop' | 'mobile-landscape' | 'mobile-portrait';

/**
 * UI state that drives visibility via data attributes.
 * Instead of components toggling their own display,
 * the VisibilityManager sets these on #game-hud-root
 * and CSS rules handle the rest.
 */
export interface UIState {
  /** Input device type */
  device: 'desktop' | 'touch';
  /** Current game phase */
  phase: 'menu' | 'loading' | 'playing' | 'paused' | 'ended';
  /** Current vehicle context */
  vehicle: 'infantry' | 'helicopter';
  /** Whether player is aiming down sights */
  ads: boolean;
  /** Layout mode (derived from viewport) */
  layout: LayoutMode;
}

/**
 * Interface that any component must implement to be mounted
 * into the grid layout system.
 */
export interface LayoutComponent {
  /**
   * Mount this component's DOM into the given parent element.
   * The parent is a grid slot div - the component should use
   * relative positioning within it.
   */
  mount(parent: HTMLElement): void;

  /**
   * Remove this component's DOM from its current parent.
   */
  unmount(): void;

  /**
   * Clean up event listeners and DOM.
   */
  dispose(): void;
}

/**
 * Registration entry for a component in the layout system.
 */
export interface LayoutRegistration {
  /** Which grid region this component occupies */
  region: HUDRegion;
  /** The component instance */
  component: LayoutComponent;
  /** Optional: only show on these device types */
  deviceFilter?: ('desktop' | 'touch')[];
  /** Optional: data-show attribute value for CSS visibility */
  showContext?: string;
}
