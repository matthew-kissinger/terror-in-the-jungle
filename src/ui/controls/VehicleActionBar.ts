/**
 * VehicleActionBar - contextual action buttons shown during helicopter/vehicle mode.
 * Positioned on the right side above the cyclic joystick.
 *
 * Buttons:
 * - EXIT (red) - exit vehicle
 * - FIRE (red) - vehicle weapon fire (attack/gunship only)
 * - WPN (green) - cycle cockpit weapons (attack/gunship only)
 * - MAP / CMD (green) - full map / squad command (touch parity with infantry action column)
 * - STAB (green) - toggle auto-hover stabilization
 * - LOOK (green) - hold-to-look free camera
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';
import type { VehicleUIContext } from '../layout/types';

interface VehicleActionCallbacks {
  onExitVehicle?: () => void;
  onVehicleFireStart?: () => void;
  onVehicleFireStop?: () => void;
  onToggleAutoHover?: () => void;
  onLookDown?: () => void;
  onLookUp?: () => void;
  onMapToggle?: () => void;
  onSquadCommand?: () => void;
  onHelicopterWeaponCycle?: (index: number) => void;
}

export class VehicleActionBar extends UIComponent {
  private callbacks: VehicleActionCallbacks = {};
  private exitBtn!: HTMLDivElement;
  private fireBtn!: HTMLDivElement;
  private wpnBtn!: HTMLDivElement;
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
    this.mapBtn = this.createButton('MAP', styles.vehicleBtn);
    this.cmdBtn = this.createButton('CMD', styles.vehicleBtn);
    this.hoverBtn = this.createButton('STAB', styles.vehicleBtn);
    this.lookBtn = this.createButton('LOOK', styles.vehicleBtn);

    this.root.appendChild(this.exitBtn);
    this.root.appendChild(this.fireBtn);
    this.root.appendChild(this.wpnBtn);
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
      this.callbacks.onToggleAutoHover?.();
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

    const capabilities = context?.capabilities;
    this.exitBtn.style.display = capabilities?.canExit ? 'flex' : 'none';
    this.fireBtn.style.display = capabilities?.canFirePrimary ? 'flex' : 'none';
    this.wpnBtn.style.display = capabilities?.canCycleWeapons ? 'flex' : 'none';
    this.mapBtn.style.display = capabilities?.canOpenMap ? 'flex' : 'none';
    this.cmdBtn.style.display = capabilities?.canOpenCommand ? 'flex' : 'none';
    this.hoverBtn.style.display = capabilities?.canStabilize ? 'flex' : 'none';
    this.lookBtn.style.display = capabilities?.canFreeLook ? 'flex' : 'none';
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

  setAutoHoverActive(active: boolean): void {
    this.autoHoverActive = active;
    this.hoverBtn.classList.toggle(styles.vehicleBtnActive, active);
  }

  isAutoHoverActive(): boolean {
    return this.autoHoverActive;
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
}
