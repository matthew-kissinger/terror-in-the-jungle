// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  | 'control-hints'  // desktop right rail: contextual control legend + situation readout
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

/**
 * The concrete craft archetype a vehicle context describes. One discriminator
 * that drives the declarative control-hint table (`src/ui/hud/vehicleHintTable`):
 * desktop legend rows, seat cues, and touch-bar action verbs. Finer-grained than
 * `kind` (which only distinguishes the HUD bucket) so a broadside gunship
 * (`plane-broadside`) reads differently from a dropped-bomb strike plane
 * (`plane`), and a boat's helm reads differently from a jeep's driver seat.
 *
 * Additive + optional so every context that predates the table still resolves
 * through the legacy `kind`/`role` fallback; adapters set it from what they
 * already know (asset/config), not from new plumbing.
 */
export type VehicleClass =
  | 'jeep'
  | 'truck'
  | 'apc'
  | 'tank'
  | 'boat'
  | 'emplacement'
  | 'heli-transport'
  | 'heli-gunship'
  | 'plane'
  | 'plane-broadside';

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
  /**
   * Optional action-bar view toggle. AC-47 uses this for side-gunner/chase
   * camera parity on touch where RMB is unavailable.
   */
  viewToggle?: {
    inactiveLabel: string;
    activeLabel: string;
    active: boolean;
    ariaLabel?: string;
  };
  /**
   * Optional sight magnification factor for craft with a zoomable sight
   * (1 = 1x, >1 = zoomed). The tank gunner toggles this with RMB. Additive +
   * optional so existing vehicle contexts are unaffected; consumers that don't
   * read it just ignore the zoom step.
   */
  sightMagnification?: number;
  /**
   * Optional per-variant HUD panel descriptor for helicopters: which
   * weapon-state panels the airframe variant mounts (attack pilot weapon panel
   * vs gunship door-gun crew panel vs transport none). Additive + optional so
   * non-helicopter contexts are unaffected; the HelicopterHUD renders the right
   * panels for the variant and the wrong-variant panel never mounts.
   */
  heliPanels?: HeliPanelDescriptor;
  /**
   * This station has a second crew seat swappable with `F` (tank driver <->
   * gunner). Drives the `F: swap seat` legend cue and the touch SEAT button.
   * Set ONLY by the two-seat tank driver/gunner contexts — a single-seat M2HB
   * emplacement, a direct-boarded tank gunner, and boat pilots all report a
   * stable `role` but no second seat, so following `F` on them dismounts rather
   * than swaps. Additive + optional so every other context reads it as absent.
   */
  secondSeat?: boolean;
  /**
   * The seat the player currently crews on a craft that swaps stations without
   * an enter/exit (the door-gun gunship: `'pilot'` <-> `'door-gun'`). Lets the
   * HUD name the live station after a swap that pushes a fresh context.
   * Additive + optional so contexts that never re-push on swap omit it.
   */
  seat?: string;
  /**
   * Dropped-bomb airframe (A-1 / F-4) still has bombs in the sortie load. Drives
   * the touch BOMB button (release one bomb) and could gate a desktop cue.
   * Additive + optional; omitted (falsy) on every craft without a bomb store.
   */
  bombsAvailable?: boolean;
  /**
   * The concrete craft archetype (see {@link VehicleClass}). Drives the
   * declarative control-hint table's legend / seat-cue / touch-verb lookups.
   * Each adapter sets it from what it already knows (asset id / flight config).
   * Additive + optional so contexts that omit it fall back to the legacy
   * `kind`/`role`-keyed resolution; the table never regresses a missing class.
   */
  vehicleClass?: VehicleClass;
}

/**
 * Which weapon-state panels a helicopter variant's HUD mounts. Drives the
 * per-variant panel selection in HelicopterHUD so transport / gunship / attack
 * each get exactly their panels rather than a shared superset.
 */
export interface HeliPanelDescriptor {
  /** Attack pilot weapon/ammo panel (AH-1: gun + rockets). */
  weaponPanel: boolean;
  /** Gunship door-gun crew panel (belt count). */
  crewPanel: boolean;
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
