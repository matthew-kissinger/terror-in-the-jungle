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
import { VehicleActionBar } from './VehicleActionBar';
import type { HUDLayout } from '../layout/HUDLayout';
import { InputContextManager } from '../../systems/input/InputContextManager';
import type { GameplayPresentationController } from '../layout/GameplayPresentationController';
import type {
  ActorMode,
  GameplayOverlay,
  InteractionContext,
  UIState,
  VehicleUIContext,
} from '../layout/types';

interface TouchControlCallbacks {
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
  onEnterExitVehicle?: () => void;
  onEnterExitHelicopter?: () => void;
  onSandbagRotateLeft: () => void;
  onSandbagRotateRight: () => void;
  onRallyPointPlace: () => void;
  onSquadCommand?: () => void;
  onMapToggle?: () => void;
  onMenuOpen?: () => void;
  onToggleFlightAssist?: () => void;
  onToggleAutoHover?: () => void;
  onVehicleFireStart?: () => void;
  onVehicleFireStop?: () => void;
  onHelicopterWeaponSwitch?: (index: number) => void;
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
  readonly vehicleActionBar: VehicleActionBar;

  private visible = false;
  /** When >0, touch HUD roots use `pointer-events: none` so modals/maps above can receive input. */
  private modalOverlayDepth = 0;
  private readonly contextManager = InputContextManager.getInstance();
  private readonly unsubscribeContext: () => void;
  private unsubscribePresentation?: () => void;
  private actorMode: ActorMode = 'infantry';
  private currentOverlay: GameplayOverlay = 'none';
  private interaction: InteractionContext | null = null;
  private vehicleContext: VehicleUIContext | null = null;
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
    this.vehicleActionBar = new VehicleActionBar();

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
    this.vehicleActionBar.mount(body);

    let prevContext = this.contextManager.getContext();
    this.unsubscribeContext = this.contextManager.onChange((context) => {
      if (context !== prevContext) {
        this.cancelActiveInteractions();
        prevContext = context;
      }
    });

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
        case 'jump':
          callbacks.onJump();
          break;
        case 'reload':
          callbacks.onReload();
          break;
        case 'scoreboard':
          callbacks.onScoreboardTap?.();
          break;
        case 'command':
          callbacks.onSquadCommand?.();
          break;
        case 'map':
          callbacks.onMapToggle?.();
          break;
      }
    });

    // Wire weapon cycling from the action buttons weapon cycler
    this.actionButtons.setOnWeaponSelect((slotIndex: number) => {
      callbacks.onWeaponSelect(slotIndex);
    });

    this.adsButton.setOnADSToggle((active: boolean) => {
      this.look.setADS(active);
      callbacks.onADSToggle(active);
    });
    this.interactionButton.setCallback(callbacks.onEnterExitVehicle ?? callbacks.onEnterExitHelicopter ?? (() => {}));
    this.sandbagButtons.setCallbacks(callbacks.onSandbagRotateLeft, callbacks.onSandbagRotateRight);
    this.rallyPointButton.setCallback(callbacks.onRallyPointPlace);
    this.rallyPointButton.setSquadCommandCallback(() => callbacks.onSquadCommand?.());
    this.menuButton.setOpenCallback?.(() => callbacks.onMenuOpen?.());

    // Wire vehicle action bar
    this.vehicleActionBar.setCallbacks({
      onExitVehicle: () => (callbacks.onEnterExitVehicle ?? callbacks.onEnterExitHelicopter ?? (() => {}))(),
      onVehicleFireStart: () => callbacks.onVehicleFireStart?.(),
      onVehicleFireStop: () => callbacks.onVehicleFireStop?.(),
      onToggleFlightAssist: () => (callbacks.onToggleFlightAssist ?? callbacks.onToggleAutoHover)?.(),
      onLookDown: () => this.look.show(),
      onLookUp: () => {
        if (this.actorMode !== 'infantry') this.look.hide();
      },
      onMapToggle: () => callbacks.onMapToggle?.(),
      onSquadCommand: () => callbacks.onSquadCommand?.(),
      onHelicopterWeaponCycle: (index: number) => callbacks.onHelicopterWeaponSwitch?.(index),
    });
  }

  bindPresentation(controller: GameplayPresentationController): void {
    this.unsubscribePresentation?.();
    this.unsubscribePresentation = controller.onChange((state) => {
      this.applyPresentationState(state);
    });
  }

  /**
   * Squad UI and similar fullscreen layers sit under body-level touch controls (z-index).
   * Suppress touch capture while those layers are open (ref-counted).
   */
  beginModalOverlays(): void {
    if (this.modalOverlayDepth === 0) {
      this.cancelActiveInteractions();
    }
    this.modalOverlayDepth++;
    this.applyModalOverlayPointerPolicy();
  }

  endModalOverlays(): void {
    this.modalOverlayDepth = Math.max(0, this.modalOverlayDepth - 1);
    this.applyModalOverlayPointerPolicy();
  }

  private applyModalOverlayPointerPolicy(): void {
    const block = this.modalOverlayDepth > 0;
    const pe = block ? 'none' : '';
    for (const el of this.modalBlockingRoots()) {
      el.style.pointerEvents = pe;
    }
  }

  private modalBlockingRoots(): HTMLElement[] {
    return [
      this.joystick.element,
      this.look.element,
      this.fireButton.element,
      this.actionButtons.element,
      this.adsButton.element,
      this.interactionButton.element,
      this.sandbagButtons.element,
      this.rallyPointButton.element,
      this.menuButton.element,
      this.mortarButton.element,
      this.helicopterCyclic.element,
      this.vehicleActionBar.element,
    ];
  }

  applyPresentationState(state: Readonly<UIState>): void {
    this.currentOverlay = state.overlay;
    this.interaction = state.interaction;
    this.vehicleContext = state.vehicleContext;
    this.applyActorContext(state.actorMode, state.vehicleContext);
    this.applyInteractionContext(state.interaction);
  }

  /**
   * Re-parent eligible touch controls into grid layout slots.
   * Fire/ADS stay as fixed-position viewport overlays (thumb-arc ergonomics).
   * Joystick and look stay as viewport overlays (need large touch zones).
   */
  mountToLayout(_layout: HUDLayout): void {
    // Fire + ADS are NOT slotted into the grid; they stay fixed-position
    // with thumb-arc CSS positioning for ergonomic reach.

    // Action buttons stay mounted at body level because they render as
    // fixed-position overlays on touch. Reparenting them into the mobile
    // placeholder slot causes the entire action stack to disappear.

    // Menu stays body-level and fixed as well. Reparenting it into the HUD
    // menu slot strips its fixed layer/z-index and lets the action stack
    // intercept taps on short landscape phones.
    // joystick + look stay as overlays
    // contextual buttons (interaction, sandbag, mortar, rally) keep their fixed positioning
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

  private inFlightVehicleMode = false;

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.joystick.show();
    this.menuButton.show();
    this.applyActorContext(this.actorMode, this.vehicleContext);
    this.applyInteractionContext(this.interaction);
    // mortarButton removed from mobile HUD — mortar is desktop-only for now
    // helicopterCyclic is presentation-derived and shown only for flight vehicle contexts.
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
    this.vehicleActionBar.hide();
  }

  cancelActiveInteractions(): void {
    this.joystick.cancelActiveTouch();
    this.look.cancelActiveLook();
    this.fireButton.cancelActivePress();
    this.adsButton.cancelActivePress();
    this.actionButtons.cancelActiveGesture();
    this.rallyPointButton.cancelActivePress();
  }

  /** Whether currently in helicopter dual-joystick mode. */
  isInHelicopterMode(): boolean {
    return this.inFlightVehicleMode;
  }

  /** Whether touch controls are currently in any flight-vehicle mode. */
  isInFlightMode(): boolean {
    return this.inFlightVehicleMode;
  }

  /** Update the weapon cycler's active slot (synced from PlayerController). */
  setActiveWeaponSlot(slot: number): void {
    this.actionButtons.setActiveSlot(slot);
    // Reset ADS when switching weapons to prevent stale ADS visual state
    this.adsButton.resetADS();
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.unsubscribeContext();
    this.unsubscribePresentation?.();
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
    this.vehicleActionBar.dispose();
  }

  private applyActorContext(actorMode: ActorMode, vehicleContext: VehicleUIContext | null): void {
    const effectiveActorMode = vehicleContext?.kind ?? actorMode;
    const hasVehicleContext = vehicleContext !== null;
    const isFlightVehicleContext = vehicleContext?.hudVariant === 'flight';
    this.actorMode = effectiveActorMode;
    this.inFlightVehicleMode = isFlightVehicleContext;
    const showInfantryControls = this.visible && !hasVehicleContext && effectiveActorMode === 'infantry';
    const showVehicleControls = this.visible && hasVehicleContext;

    this.joystick.setHelicopterMode?.(showVehicleControls);

    if (showInfantryControls) {
      this.fireButton.show();
      this.adsButton.show();
      this.actionButtons.show();
      this.sandbagButtons.show();
      this.rallyPointButton.showButton();
      this.look.show();
      this.helicopterCyclic.hide();
      this.vehicleActionBar.hide();
    } else {
      this.fireButton.hide();
      this.adsButton.hide();
      this.actionButtons.hide();
      this.sandbagButtons.hide();
      this.rallyPointButton.hideButton();
      this.look.hide();
      if (showVehicleControls) {
        if (isFlightVehicleContext) {
          this.helicopterCyclic.show();
        } else {
          this.helicopterCyclic.hide();
        }
        this.vehicleActionBar.setVehicleContext(vehicleContext);
        this.vehicleActionBar.show();
      } else {
        this.helicopterCyclic.hide();
        this.vehicleActionBar.hide();
      }
    }
  }

  private applyInteractionContext(interaction: InteractionContext | null): void {
    if (this.actorMode !== 'infantry' || !this.visible || !interaction || this.currentOverlay !== 'none') {
      this.interactionButton.hideButton?.();
      return;
    }

    this.interactionButton.setLabel?.(interaction.buttonLabel ?? 'ENTER');
    this.interactionButton.showButton?.();
  }
}
