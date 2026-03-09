/**
 * ADS (Aim Down Sights) button for mobile touch controls.
 * Supports two modes (persisted in localStorage):
 * - 'toggle': tap to aim, tap again to stop (default)
 * - 'hold': activate on pointerdown, deactivate on pointerup
 *
 * PC/controller ADS remains hold-to-aim (handled by right-click in PlayerInput).
 */

import { BaseTouchButton } from './BaseTouchButton';
import styles from './TouchControls.module.css';

export type ADSBehavior = 'hold' | 'toggle';

const ADS_STORAGE_KEY = 'terror_ads_mode';

function loadADSBehavior(): ADSBehavior {
  try {
    const stored = localStorage.getItem(ADS_STORAGE_KEY);
    if (stored === 'hold' || stored === 'toggle') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'toggle';
}

export class TouchADSButton extends BaseTouchButton {
  private isActive = false;
  private adsBehavior: ADSBehavior = loadADSBehavior();

  private onADSToggle?: (active: boolean) => void;

  protected build(): void {
    this.root.className = styles.adsBtn;
    this.root.id = 'touch-ads-btn';
    this.root.textContent = 'ADS';
  }

  protected onMount(): void {
    this.bindPress(this.root, {
      onDown: () => {
        if (this.adsBehavior === 'hold') {
          this.isActive = true;
          this.updateVisual();
          this.onADSToggle?.(true);
        }
      },
      onUp: () => {
        if (this.adsBehavior === 'toggle') {
          this.isActive = !this.isActive;
          this.updateVisual();
          this.onADSToggle?.(this.isActive);
        } else {
          // hold mode: release
          this.isActive = false;
          this.updateVisual();
          this.onADSToggle?.(false);
        }
      },
      onCancel: () => {
        if (this.adsBehavior === 'hold' && this.isActive) {
          this.isActive = false;
          this.updateVisual();
          this.onADSToggle?.(false);
        }
      },
    });
  }

  setOnADSToggle(callback: (active: boolean) => void): void {
    this.onADSToggle = callback;
  }

  /** Reset ADS state (e.g. on weapon switch) */
  resetADS(): void {
    if (this.isActive) {
      this.isActive = false;
      this.releaseAllPointers();
      this.updateVisual();
      this.onADSToggle?.(false);
    }
  }

  getADSBehavior(): ADSBehavior {
    return this.adsBehavior;
  }

  setADSBehavior(behavior: ADSBehavior): void {
    this.adsBehavior = behavior;
    try {
      localStorage.setItem(ADS_STORAGE_KEY, behavior);
    } catch {
      // localStorage unavailable
    }
    // Reset ADS when switching modes to avoid stuck state
    this.resetADS();
  }

  private updateVisual(): void {
    this.root.classList.toggle(styles.adsActive, this.isActive);
  }

  /** Re-parent into a grid slot. */
  mountTo(parent: HTMLElement): void {
    this.root.classList.add(styles.slotted);
    this.reparentTo(parent);
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.resetADS();
  }
}
