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
import { TouchInteractionButton } from './TouchInteractionButton';
import { TouchSandbagButtons } from './TouchSandbagButtons';
import { TouchRallyPointButton } from './TouchRallyPointButton';
import { TouchMenuButton } from './TouchMenuButton';
import { TouchMortarButton } from './TouchMortarButton';

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
  readonly weaponBar: TouchWeaponBar;
  readonly adsButton: TouchADSButton;
  readonly interactionButton: TouchInteractionButton;
  readonly sandbagButtons: TouchSandbagButtons;
  readonly rallyPointButton: TouchRallyPointButton;
  readonly menuButton: TouchMenuButton;
  readonly mortarButton: TouchMortarButton;

  private visible = false;

  constructor() {
    this.joystick = new VirtualJoystick();
    this.look = new TouchLook();
    this.fireButton = new TouchFireButton();
    this.actionButtons = new TouchActionButtons();
    this.weaponBar = new TouchWeaponBar();
    this.adsButton = new TouchADSButton();
    this.interactionButton = new TouchInteractionButton();
    this.sandbagButtons = new TouchSandbagButtons();
    this.rallyPointButton = new TouchRallyPointButton();
    this.menuButton = new TouchMenuButton();
    this.mortarButton = new TouchMortarButton();

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
        case 'squad':
          callbacks.onSquadCommand?.();
          break;
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
    this.interactionButton.setCallback(callbacks.onEnterExitHelicopter);
    this.sandbagButtons.setCallbacks(callbacks.onSandbagRotateLeft, callbacks.onSandbagRotateRight);
    this.rallyPointButton.setCallback(callbacks.onRallyPointPlace);
    this.menuButton.setCallbacks(
      () => callbacks.onMenuPause?.(),
      () => callbacks.onMenuResume?.(),
    );
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
    this.interactionButton.show();
    this.sandbagButtons.show();
    this.rallyPointButton.show();
    this.menuButton.show();
    this.mortarButton.show();
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
    this.interactionButton.hide();
    this.sandbagButtons.hide();
    this.rallyPointButton.hide();
    this.menuButton.hide();
    this.mortarButton.hide();
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
    this.interactionButton.dispose();
    this.sandbagButtons.dispose();
    this.rallyPointButton.dispose();
    this.menuButton.dispose();
    this.mortarButton.dispose();
  }
}
