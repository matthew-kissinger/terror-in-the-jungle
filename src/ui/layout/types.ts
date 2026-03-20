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

export type GameplayInputMode = 'keyboardMouse' | 'touch' | 'gamepad';
export type ActorMode = 'infantry' | 'helicopter' | 'plane' | 'car' | 'turret';
export type GameplayOverlay = 'none' | 'map' | 'command' | 'pause' | 'settings';
export type VehicleKind = Exclude<ActorMode, 'infantry'>;

export interface VehicleCapabilities {
  canExit: boolean;
  canFirePrimary: boolean;
  canCycleWeapons: boolean;
  canFreeLook: boolean;
  canStabilize: boolean;
  canDeploySquad: boolean;
  canOpenMap: boolean;
  canOpenCommand: boolean;
}

export interface VehicleUIContext {
  kind: VehicleKind;
  role: string;
  capabilities: VehicleCapabilities;
  hudVariant: 'flight' | 'groundVehicle' | 'turret';
  weaponCount: number;
}

export interface InteractionContext {
  kind: 'none' | 'vehicle-enter' | 'vehicle-exit' | 'squad-deploy' | 'interact';
  promptText: string;
  buttonLabel?: string;
  targetId?: string;
}

/**
 * UI state that drives visibility via data attributes.
 * Instead of components toggling their own display,
 * the VisibilityManager sets these on #game-hud-root
 * and CSS rules handle the rest.
 */
export interface UIState {
  /** Input device type */
  device: 'desktop' | 'touch';
  /** Active input mode */
  inputMode: GameplayInputMode;
  /** Current game phase */
  phase: 'menu' | 'loading' | 'playing' | 'paused' | 'ended';
  /** Current actor context */
  vehicle: ActorMode;
  /** Current actor context (explicit alias for future vehicle work) */
  actorMode: ActorMode;
  /** Active modal overlay */
  overlay: GameplayOverlay;
  /** Whether the scoreboard overlay is visible */
  scoreboardVisible: boolean;
  /** Contextual interaction prompt/button state */
  interaction: InteractionContext | null;
  /** Vehicle-specific HUD and control capabilities */
  vehicleContext: VehicleUIContext | null;
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
  /**
   * When set, `showContext` is applied to this element (not the grid slot),
   * and the component mounts here. The host is removed on unregister.
   * Use when multiple components share one slot with different visibility rules.
   */
  mountParent?: HTMLElement;
}
