/**
 * Orchestrator for all mobile touch controls.
 * Creates and wires up VirtualJoystick, TouchLook, TouchFireButton, and TouchActionButtons.
 * Only instantiated on touch-capable devices.
 *
 * All sub-components are UIComponents. The orchestrator mounts them to document.body
 * on construction, then mountToLayout() reparents eligible ones into HUD grid slots.
 *
 * Weapon bar is now handled by UnifiedWeaponBar (owned by HUDSystem, not TouchControls).
 */

import { VirtualJoystick } from './VirtualJoystick';
import { TouchLook } from './TouchLook';
import { TouchFireButton } from './TouchFireButton';
import { TouchActionButtons } from './TouchActionButtons';
import { TouchADSButton } from './TouchADSButton';
import { TouchInteractionButton } from './TouchInteractionButton';
import { TouchSandbagButtons } from './TouchSandbagButtons';
import { TouchRallyPointButton } from './TouchRallyPointButton';
import { TouchMenuButton } from './TouchMenuButton';
import { TouchMortarButton } from './TouchMortarButton';
import { TouchHelicopterCyclic } from './TouchHelicopterCyclic';
import type { HUDLayout } from '../layout/HUDLayout';

export interface TouchControlCallbacks {
  onFireStart: () => void;
  onFireStop: () => void;
  onJump: () => void;
  onReload: () => void;
  onGrenade: () => void;
  onSprintStart: () => void;
  onSprintStop: () => void;
  onWeaponSelect: (slotIndex: number) => void;
  onADSToggle: (active: boolean) => void;
  onScoreboardTap?: () => void;
  onEnterExitHelicopter: () => void;
  onSandbagRotateLeft: () => void;
  onSandbagRotateRight: () => void;
  onRallyPointPlace: () => void;
  onSquadCommand?: () => void;
  onMenuPause?: () => void;
  onMenuResume?: () => void;
}

export class TouchControls {
  readonly joystick: VirtualJoystick;
  readonly look: TouchLook;
  readonly fireButton: TouchFireButton;
  readonly actionButtons: TouchActionButtons;
  readonly adsButton: TouchADSButton;
  readonly interactionButton: TouchInteractionButton;
  readonly sandbagButtons: TouchSandbagButtons;
  readonly rallyPointButton: TouchRallyPointButton;
  readonly menuButton: TouchMenuButton;
  readonly mortarButton: TouchMortarButton;
  readonly helicopterCyclic: TouchHelicopterCyclic;

  private visible = false;

  constructor() {
    this.joystick = new VirtualJoystick();
    this.look = new TouchLook();
    this.fireButton = new TouchFireButton();
    this.actionButtons = new TouchActionButtons();
    this.adsButton = new TouchADSButton();
    this.interactionButton = new TouchInteractionButton();
    this.sandbagButtons = new TouchSandbagButtons();
    this.rallyPointButton = new TouchRallyPointButton();
    this.menuButton = new TouchMenuButton();
    this.mortarButton = new TouchMortarButton();
    this.helicopterCyclic = new TouchHelicopterCyclic();

    // Mount all to document.body
    const body = document.body;
    this.joystick.mount(body);
    this.look.mount(body);
    this.fireButton.mount(body);
    this.actionButtons.mount(body);
    this.adsButton.mount(body);
    this.interactionButton.mount(body);
    this.sandbagButtons.mount(body);
    this.rallyPointButton.mount(body);
    this.menuButton.mount(body);
    this.mortarButton.mount(body);
    this.helicopterCyclic.mount(body);

    // Start hidden until game starts
    this.hide();
  }

  /**
   * Wire up callbacks from the game input system.
   * Note: weapon bar callbacks are now wired through HUDSystem, not here.
   */
  setCallbacks(callbacks: TouchControlCallbacks): void {
    this.fireButton.setCallbacks(callbacks.onFireStart, callbacks.onFireStop);

    this.joystick.setSprintCallbacks(callbacks.onSprintStart, callbacks.onSprintStop);

    this.actionButtons.setOnAction((action: string) => {
      switch (action) {
        case 'squad':
          callbacks.onSquadCommand?.();
          break;
        case 'jump':
          callbacks.onJump();
          break;
        case 'reload':
          callbacks.onReload();
          break;
        case 'scoreboard':
          callbacks.onScoreboardTap?.();
          break;
      }
    });

    // Wire weapon cycling from the action buttons weapon cycler
    this.actionButtons.setOnWeaponSelect((slotIndex: number) => {
      callbacks.onWeaponSelect(slotIndex);
    });

    this.adsButton.setOnADSToggle(callbacks.onADSToggle);
    this.interactionButton.setCallback(callbacks.onEnterExitHelicopter);
    this.sandbagButtons.setCallbacks(callbacks.onSandbagRotateLeft, callbacks.onSandbagRotateRight);
    this.rallyPointButton.setCallback(callbacks.onRallyPointPlace);
    this.rallyPointButton.setSquadCommandCallback(() => callbacks.onSquadCommand?.());
    this.menuButton.setCallbacks(
      () => callbacks.onMenuPause?.(),
      () => callbacks.onMenuResume?.(),
    );
    this.menuButton.setSquadCallback(() => callbacks.onSquadCommand?.());
    this.menuButton.setScoreboardCallback(() => callbacks.onScoreboardTap?.());
  }

  /**
   * Re-parent eligible touch controls into grid layout slots.
   * Fire/ADS stay as fixed-position viewport overlays (thumb-arc ergonomics).
   * Joystick and look stay as viewport overlays (need large touch zones).
   */
  mountToLayout(layout: HUDLayout): void {
    // Fire + ADS are NOT slotted into the grid; they stay fixed-position
    // with thumb-arc CSS positioning for ergonomic reach.

    // Action buttons are infantry-only (mortar, rally point, sandbag)
    const actionSlot = layout.getSlot('action-btns');
    actionSlot.dataset.show = 'infantry';
    this.actionButtons.mountTo(actionSlot);

    this.menuButton.mountTo(layout.getSlot('menu'));
    // joystick + look stay as overlays
    // contextual buttons (interaction, sandbag, rally, mortar) keep their positioning for now
  }

  /**
   * Get the current joystick movement vector.
   * x: left/right [-1, 1], z: forward/back [-1, 1]
   */
  getMovementVector(): { x: number; z: number } {
    return this.joystick.output;
  }

  /**
   * Get and clear accumulated look delta.
   */
  consumeLookDelta(): { x: number; y: number } {
    return this.look.consumeDelta();
  }

  private inHelicopterMode = false;

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.joystick.show();
    this.look.show();
    this.fireButton.show();
    this.actionButtons.show();
    this.adsButton.show();
    this.interactionButton.show();
    this.sandbagButtons.show();
    this.rallyPointButton.show();
    this.menuButton.show();
    // mortarButton removed from mobile HUD — mortar is desktop-only for now
    // helicopterCyclic is NOT shown here; it's shown/hidden by enterHelicopterMode/exitHelicopterMode
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.joystick.hide();
    this.look.hide();
    this.fireButton.hide();
    this.actionButtons.hide();
    this.adsButton.hide();
    this.interactionButton.hide();
    this.sandbagButtons.hide();
    this.rallyPointButton.hide();
    this.menuButton.hide();
    this.mortarButton.hide();
    this.helicopterCyclic.hide();
  }

  /**
   * Enter helicopter mode: dual joystick layout.
   * Left joystick = collective (Y) + yaw (X).
   * Right joystick = cyclic pitch (Y) + cyclic roll (X).
   * Hides infantry controls (fire, ADS, action buttons, rally).
   */
  enterHelicopterMode(): void {
    if (this.inHelicopterMode) return;
    this.inHelicopterMode = true;

    // Hide infantry-specific controls
    this.fireButton.hide();
    this.adsButton.hide();
    this.actionButtons.hide();
    this.rallyPointButton.hideButton();
    this.sandbagButtons.hide();
    this.look.hide();

    // Show helicopter cyclic joystick (right side)
    this.helicopterCyclic.show();

    // Set left joystick to helicopter throttle mode
    this.joystick.setHelicopterMode(true);
  }

  /**
   * Exit helicopter mode: restore infantry controls.
   */
  exitHelicopterMode(): void {
    if (!this.inHelicopterMode) return;
    this.inHelicopterMode = false;

    // Hide helicopter controls
    this.helicopterCyclic.hide();

    // Restore infantry controls
    this.fireButton.show();
    this.adsButton.show();
    this.actionButtons.show();
    this.rallyPointButton.showButton();
    this.look.show();

    // Reset left joystick to infantry mode
    this.joystick.setHelicopterMode(false);
  }

  /** Whether currently in helicopter dual-joystick mode. */
  isInHelicopterMode(): boolean {
    return this.inHelicopterMode;
  }

  /** Update the weapon cycler's active slot (synced from PlayerController). */
  setActiveWeaponSlot(slot: number): void {
    this.actionButtons.setActiveSlot(slot);
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.joystick.dispose();
    this.look.dispose();
    this.fireButton.dispose();
    this.actionButtons.dispose();
    this.adsButton.dispose();
    this.interactionButton.dispose();
    this.sandbagButtons.dispose();
    this.rallyPointButton.dispose();
    this.menuButton.dispose();
    this.mortarButton.dispose();
    this.helicopterCyclic.dispose();
  }
}
