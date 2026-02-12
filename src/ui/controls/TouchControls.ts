/**
 * Orchestrator for all mobile touch controls.
 * Creates and wires up VirtualJoystick, TouchLook, TouchFireButton, and TouchActionButtons.
 * Only instantiated on touch-capable devices.
 */

import { VirtualJoystick } from './VirtualJoystick';
import { TouchLook } from './TouchLook';
import { TouchFireButton } from './TouchFireButton';
import { TouchActionButtons } from './TouchActionButtons';
import { TouchWeaponBar } from './TouchWeaponBar';
import { TouchADSButton } from './TouchADSButton';

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
}

export class TouchControls {
  readonly joystick: VirtualJoystick;
  readonly look: TouchLook;
  readonly fireButton: TouchFireButton;
  readonly actionButtons: TouchActionButtons;
  readonly weaponBar: TouchWeaponBar;
  readonly adsButton: TouchADSButton;

  private visible = false;

  constructor() {
    this.joystick = new VirtualJoystick();
    this.look = new TouchLook();
    this.fireButton = new TouchFireButton();
    this.actionButtons = new TouchActionButtons();
    this.weaponBar = new TouchWeaponBar();
    this.adsButton = new TouchADSButton();

    // Start hidden until game starts
    this.hide();
  }

  /**
   * Wire up callbacks from the game input system.
   */
  setCallbacks(callbacks: TouchControlCallbacks): void {
    this.fireButton.setCallbacks(callbacks.onFireStart, callbacks.onFireStop);

    this.joystick.setSprintCallbacks(callbacks.onSprintStart, callbacks.onSprintStop);

    this.actionButtons.setOnAction((action: string) => {
      switch (action) {
        case 'jump':
          callbacks.onJump();
          break;
        case 'reload':
          callbacks.onReload();
          break;
        case 'grenade':
          callbacks.onGrenade();
          break;
        case 'scoreboard':
          callbacks.onScoreboardTap?.();
          break;
      }
    });

    this.weaponBar.setOnWeaponSelect(callbacks.onWeaponSelect);
    this.adsButton.setOnADSToggle(callbacks.onADSToggle);
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

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.joystick.show();
    this.look.show();
    this.fireButton.show();
    this.actionButtons.show();
    this.weaponBar.show();
    this.adsButton.show();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.joystick.hide();
    this.look.hide();
    this.fireButton.hide();
    this.actionButtons.hide();
    this.weaponBar.hide();
    this.adsButton.hide();
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.joystick.dispose();
    this.look.dispose();
    this.fireButton.dispose();
    this.actionButtons.dispose();
    this.weaponBar.dispose();
    this.adsButton.dispose();
  }
}
