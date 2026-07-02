// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * VehicleActionBar - contextual action buttons shown during helicopter/vehicle mode.
 * Positioned on the right side above the cyclic joystick.
 *
 * Buttons:
 * - EXIT (red) - exit vehicle
 * - FIRE (red) - vehicle weapon fire (attack/gunship only)
 * - WPN (green) - cycle cockpit weapons (attack/gunship only)
 * - VIEW (green) - context view toggle (AC-47 side/chase)
 * - BOMB (red) - release one dropped bomb (A-1/F-4 with bombs remaining)
 * - SEAT (green) - swap crew station (tank driver<->gunner, gunship pilot<->door gun)
 * - MAP / CMD (green) - full map / squad command (touch parity with infantry action column)
 * - STAB (green) - toggle auto-hover stabilization
 * - LOOK (green) - hold-to-look free camera
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';
import type { VehicleUIContext } from '../layout/types';
import { deriveVehicleClass, vehicleHintEntry, type VehicleTouchVerbs } from '../hud/vehicleHintTable';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';

interface VehicleActionCallbacks {
  onExitVehicle?: () => void;
  onVehicleFireStart?: () => void;
  onVehicleFireStop?: () => void;
  onToggleFlightAssist?: () => void;
  onToggleAutoHover?: () => void;
  onLookDown?: () => void;
  onLookUp?: () => void;
  onMapToggle?: () => void;
  onSquadCommand?: () => void;
  onHelicopterWeaponCycle?: (index: number) => void;
  onViewToggle?: () => void;
  onSeatSwap?: () => void;
  onBombRelease?: () => void;
}

export class VehicleActionBar extends UIComponent {
  private callbacks: VehicleActionCallbacks = {};
  private exitBtn!: HTMLDivElement;
  private fireBtn!: HTMLDivElement;
  private wpnBtn!: HTMLDivElement;
  private viewBtn!: HTMLDivElement;
  private bombBtn!: HTMLDivElement;
  private seatBtn!: HTMLDivElement;
  private mapBtn!: HTMLDivElement;
  private cmdBtn!: HTMLDivElement;
  private hoverBtn!: HTMLDivElement;
  private lookBtn!: HTMLDivElement;
  private autoHoverActive = false;
  private fireActive = false;
  private lookActive = false;
  private vehicleWeaponIndex = 0;
  private vehicleContext: VehicleUIContext | null = null;

  protected build(): void {
    this.root.className = styles.vehicleActionBar;
    this.root.id = 'vehicle-action-bar';
    this.root.style.display = 'none';

    this.exitBtn = this.createButton('EXIT', styles.vehicleExitBtn);
    this.fireBtn = this.createButton('FIRE', styles.vehicleFireBtn);
    this.fireBtn.style.display = 'none';
    this.wpnBtn = this.createButton('WPN', styles.vehicleBtn);
    this.wpnBtn.style.display = 'none';
    this.viewBtn = this.createButton('VIEW', styles.vehicleBtn);
    this.viewBtn.style.display = 'none';
    // BOMB releases one dropped bomb on the A-1 / F-4; shown only while the
    // sortie still carries bombs (touch parity for the desktop RMB release).
    this.bombBtn = this.createButton('BOMB', styles.vehicleFireBtn);
    this.bombBtn.style.display = 'none';
    // SEAT swaps crew stations on craft that carry a second one (tank
    // driver<->gunner, gunship pilot<->door gun). Hidden by default; shown from
    // the context. Without it the door gun is unreachable on touch and the tank
    // gunner seat could only be taken on keyboard.
    this.seatBtn = this.createButton('SEAT', styles.vehicleBtn);
    this.seatBtn.style.display = 'none';
    this.mapBtn = this.createButton('MAP', styles.vehicleBtn);
    this.cmdBtn = this.createButton('CMD', styles.vehicleBtn);
    this.hoverBtn = this.createButton('STAB', styles.vehicleBtn);
    this.lookBtn = this.createButton('LOOK', styles.vehicleBtn);

    // Data-action attributes for CSS targeting
    this.exitBtn.dataset.action = 'exit';
    this.fireBtn.dataset.action = 'fire';
    this.wpnBtn.dataset.action = 'weapon';
    this.viewBtn.dataset.action = 'view';
    this.bombBtn.dataset.action = 'bomb';
    this.seatBtn.dataset.action = 'seat';
    this.mapBtn.dataset.action = 'map';
    this.cmdBtn.dataset.action = 'command';
    this.hoverBtn.dataset.action = 'hover';
    this.lookBtn.dataset.action = 'look';

    this.root.appendChild(this.exitBtn);
    this.root.appendChild(this.fireBtn);
    this.root.appendChild(this.wpnBtn);
    this.root.appendChild(this.viewBtn);
    this.root.appendChild(this.bombBtn);
    this.root.appendChild(this.seatBtn);
    this.root.appendChild(this.mapBtn);
    this.root.appendChild(this.cmdBtn);
    this.root.appendChild(this.hoverBtn);
    this.root.appendChild(this.lookBtn);
  }

  protected onMount(): void {
    this.listen(this.exitBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onExitVehicle?.();
    }, { passive: false });

    this.listen(this.fireBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.fireActive = true;
      this.fireBtn.classList.add(styles.pressed);
      this.callbacks.onVehicleFireStart?.();
    }, { passive: false });

    this.listen(this.fireBtn, 'pointerup', (e: PointerEvent) => {
      e.preventDefault();
      this.fireActive = false;
      this.fireBtn.classList.remove(styles.pressed);
      this.callbacks.onVehicleFireStop?.();
    }, { passive: false });

    this.listen(this.fireBtn, 'pointercancel', (e: PointerEvent) => {
      e.preventDefault();
      this.fireActive = false;
      this.fireBtn.classList.remove(styles.pressed);
      this.callbacks.onVehicleFireStop?.();
    }, { passive: false });

    this.listen(this.wpnBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const weaponCount = Math.max(this.vehicleContext?.weaponCount ?? 2, 1);
      this.vehicleWeaponIndex = (this.vehicleWeaponIndex + 1) % weaponCount;
      this.callbacks.onHelicopterWeaponCycle?.(this.vehicleWeaponIndex);
    }, { passive: false });

    this.listen(this.viewBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onViewToggle?.();
    }, { passive: false });

    this.listen(this.bombBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onBombRelease?.();
    }, { passive: false });

    this.listen(this.seatBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onSeatSwap?.();
    }, { passive: false });

    this.listen(this.mapBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onMapToggle?.();
    }, { passive: false });

    this.listen(this.cmdBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onSquadCommand?.();
    }, { passive: false });

    this.listen(this.hoverBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (this.callbacks.onToggleFlightAssist ?? this.callbacks.onToggleAutoHover)?.();
    }, { passive: false });

    this.listen(this.lookBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.lookActive = true;
      this.lookBtn.classList.add(styles.pressed);
      this.callbacks.onLookDown?.();
    }, { passive: false });

    this.listen(this.lookBtn, 'pointerup', (e: PointerEvent) => {
      e.preventDefault();
      this.lookActive = false;
      this.lookBtn.classList.remove(styles.pressed);
      this.callbacks.onLookUp?.();
    }, { passive: false });

    this.listen(this.lookBtn, 'pointercancel', (e: PointerEvent) => {
      e.preventDefault();
      this.lookActive = false;
      this.lookBtn.classList.remove(styles.pressed);
      this.callbacks.onLookUp?.();
    }, { passive: false });
  }

  setCallbacks(callbacks: VehicleActionCallbacks): void {
    this.callbacks = callbacks;
  }

  setVehicleContext(context: VehicleUIContext | null): void {
    this.vehicleContext = context;
    this.vehicleWeaponIndex = 0;
    // Clear pressed state to prevent stuck visual on context change
    this.fireBtn.classList.remove(styles.pressed);

    // Pull the class's touch-bar ACTION captions from the single declarative
    // table so the button labels can't drift from the desktop legend / seat cues.
    this.applyTouchVerbs(context);

    const capabilities = context?.capabilities;
    this.exitBtn.style.display = capabilities?.canExit ? 'flex' : 'none';
    this.fireBtn.style.display = capabilities?.canFirePrimary ? 'flex' : 'none';
    this.wpnBtn.style.display = capabilities?.canCycleWeapons ? 'flex' : 'none';
    this.viewBtn.style.display = context?.viewToggle ? 'flex' : 'none';
    this.applyViewToggleLabel(context);
    this.bombBtn.style.display = context?.bombsAvailable ? 'flex' : 'none';
    this.seatBtn.style.display = this.hasSeatSwap(context) ? 'flex' : 'none';
    this.mapBtn.style.display = capabilities?.canOpenMap ? 'flex' : 'none';
    this.cmdBtn.style.display = capabilities?.canOpenCommand ? 'flex' : 'none';
    this.hoverBtn.style.display = capabilities?.canStabilize ? 'flex' : 'none';
    this.applyStabilizerLabel(context);
    // LOOK hidden on touch - free-look is handled by the cyclic joystick
    this.lookBtn.style.display = (!shouldUseTouchControls() && capabilities?.canFreeLook) ? 'flex' : 'none';
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    if (this.fireActive) {
      this.fireActive = false;
      this.fireBtn.classList.remove(styles.pressed);
      this.callbacks.onVehicleFireStop?.();
    }
    if (this.lookActive) {
      this.lookActive = false;
      this.lookBtn.classList.remove(styles.pressed);
      this.callbacks.onLookUp?.();
    }
    this.root.style.display = 'none';
  }

  setFireVisible(visible: boolean): void {
    this.fireBtn.style.display = visible ? 'flex' : 'none';
  }

  /** Minigun / rockets etc. — mirrors desktop 1/2 weapon keys. */
  setWeaponCycleVisible(visible: boolean): void {
    this.wpnBtn.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      this.vehicleWeaponIndex = 0;
    }
  }

  setFlightAssistActive(active: boolean): void {
    this.autoHoverActive = active;
    this.hoverBtn.classList.toggle(styles.vehicleBtnActive, active);
  }

  isFlightAssistActive(): boolean {
    return this.autoHoverActive;
  }

  setAutoHoverActive(active: boolean): void {
    this.setFlightAssistActive(active);
  }

  isAutoHoverActive(): boolean {
    return this.isFlightAssistActive();
  }

  private createButton(label: string, className: string): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = className;
    btn.textContent = label;
    btn.setAttribute('aria-label', label);
    btn.style.touchAction = 'none';
    btn.style.pointerEvents = 'auto';
    btn.style.userSelect = 'none';
    return btn;
  }

  /** The class's touch-bar ACTION captions, or null for the on-foot / cleared bar. */
  private touchVerbs(context: VehicleUIContext | null): VehicleTouchVerbs | null {
    if (!context) return null;
    return vehicleHintEntry(deriveVehicleClass(context))?.touchVerbs ?? null;
  }

  /**
   * Stamp the class's ACTION-button captions from the declarative table. The
   * static verbs (EXIT / FIRE / SEAT / BOMB / WPN) are single-sourced so the
   * touch bar can't drift from the legend; VIEW and STAB stay dynamic (VIEW is
   * the airframe view-toggle label, STAB is the class's stabiliser base).
   */
  private applyTouchVerbs(context: VehicleUIContext | null): void {
    const verbs = this.touchVerbs(context);
    if (!verbs) return;
    this.setButtonLabel(this.exitBtn, verbs.exit);
    this.setButtonLabel(this.fireBtn, verbs.fire);
    this.setButtonLabel(this.wpnBtn, verbs.weapon);
    this.setButtonLabel(this.seatBtn, verbs.seat);
    this.setButtonLabel(this.bombBtn, verbs.bomb);
  }

  private setButtonLabel(btn: HTMLDivElement, label: string): void {
    btn.textContent = label;
    btn.setAttribute('aria-label', label);
  }

  /**
   * Whether the current craft can swap crew stations from the SEAT button: the
   * two-seat tank (driver <-> gunner) or the armed door-gun gunship (pilot <->
   * door gun). Reads the swap rule from the class table so the touch SEAT button
   * and the legend's `F: swap seat` cue can never disagree.
   */
  private hasSeatSwap(context: VehicleUIContext | null): boolean {
    if (!context) return false;
    return vehicleHintEntry(deriveVehicleClass(context))?.seatRule.canSwapStations ?? false;
  }

  private applyStabilizerLabel(context: VehicleUIContext | null): void {
    const label = this.touchVerbs(context)?.stabilize ?? 'STAB';
    this.hoverBtn.textContent = label;
    this.hoverBtn.setAttribute('aria-label', label);
  }

  private applyViewToggleLabel(context: VehicleUIContext | null): void {
    const toggle = context?.viewToggle;
    const label = toggle
      ? toggle.active ? toggle.activeLabel : toggle.inactiveLabel
      : 'VIEW';
    this.viewBtn.textContent = label;
    this.viewBtn.setAttribute('aria-label', toggle?.ariaLabel ?? label);
    this.viewBtn.classList.toggle(styles.vehicleBtnActive, toggle?.active ?? false);
  }
}
