/**
 * VehicleActionBar - contextual action buttons shown during helicopter/vehicle mode.
 * Positioned on the right side above the cyclic joystick.
 *
 * Buttons:
 * - EXIT (red) - exit vehicle
 * - FIRE (red) - vehicle weapon fire (attack/gunship only)
 * - STAB (green) - toggle auto-hover stabilization
 * - LOOK (green) - hold-to-look free camera
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

interface VehicleActionCallbacks {
  onExitVehicle?: () => void;
  onVehicleFireStart?: () => void;
  onVehicleFireStop?: () => void;
  onToggleAutoHover?: () => void;
  onLookDown?: () => void;
  onLookUp?: () => void;
}

export class VehicleActionBar extends UIComponent {
  private callbacks: VehicleActionCallbacks = {};
  private exitBtn!: HTMLDivElement;
  private fireBtn!: HTMLDivElement;
  private hoverBtn!: HTMLDivElement;
  private lookBtn!: HTMLDivElement;
  private autoHoverActive = false;

  protected build(): void {
    this.root.className = styles.vehicleActionBar;
    this.root.id = 'vehicle-action-bar';
    this.root.style.display = 'none';

    this.exitBtn = this.createButton('EXIT', styles.vehicleExitBtn);
    this.fireBtn = this.createButton('FIRE', styles.vehicleFireBtn);
    this.fireBtn.style.display = 'none';
    this.hoverBtn = this.createButton('STAB', styles.vehicleBtn);
    this.lookBtn = this.createButton('LOOK', styles.vehicleBtn);

    this.root.appendChild(this.exitBtn);
    this.root.appendChild(this.fireBtn);
    this.root.appendChild(this.hoverBtn);
    this.root.appendChild(this.lookBtn);
  }

  protected onMount(): void {
    // EXIT
    this.listen(this.exitBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onExitVehicle?.();
    }, { passive: false });

    // FIRE (pointerdown/up for hold-to-fire)
    this.listen(this.fireBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.fireBtn.classList.add(styles.pressed);
      this.callbacks.onVehicleFireStart?.();
    }, { passive: false });

    this.listen(this.fireBtn, 'pointerup', (e: PointerEvent) => {
      e.preventDefault();
      this.fireBtn.classList.remove(styles.pressed);
      this.callbacks.onVehicleFireStop?.();
    }, { passive: false });

    this.listen(this.fireBtn, 'pointercancel', (e: PointerEvent) => {
      e.preventDefault();
      this.fireBtn.classList.remove(styles.pressed);
      this.callbacks.onVehicleFireStop?.();
    }, { passive: false });

    // HOVER toggle
    this.listen(this.hoverBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onToggleAutoHover?.();
    }, { passive: false });

    // LOOK (hold-to-look)
    this.listen(this.lookBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.lookBtn.classList.add(styles.pressed);
      this.callbacks.onLookDown?.();
    }, { passive: false });

    this.listen(this.lookBtn, 'pointerup', (e: PointerEvent) => {
      e.preventDefault();
      this.lookBtn.classList.remove(styles.pressed);
      this.callbacks.onLookUp?.();
    }, { passive: false });

    this.listen(this.lookBtn, 'pointercancel', (e: PointerEvent) => {
      e.preventDefault();
      this.lookBtn.classList.remove(styles.pressed);
      this.callbacks.onLookUp?.();
    }, { passive: false });
  }

  setCallbacks(callbacks: VehicleActionCallbacks): void {
    this.callbacks = callbacks;
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  setFireVisible(visible: boolean): void {
    this.fireBtn.style.display = visible ? 'flex' : 'none';
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
