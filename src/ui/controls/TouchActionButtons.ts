/**
 * Action buttons for mobile: Jump, Reload, and Weapon Cycler.
 * Positioned in a column above the fire button on the right side.
 *
 * The weapon cycler replaces the old grenade button, showing the
 * active weapon label with prev/next chevrons to cycle through slots.
 *
 * Gesture support on weapon cycler:
 * - Horizontal swipe (>40px) cycles next/prev weapon
 * - Double-tap (<300ms) quick-switches to last weapon
 * - Chevron taps still work as before
 *
 * Grenade slot (GRN label tap):
 * - Short tap: switch to grenade (existing)
 * - Long press (500ms+): quick-throw grenade without switching UI
 */

import { UIComponent } from '../engine/UIComponent';
import { icon } from '../icons/IconRegistry';
import styles from './TouchControls.module.css';

const SLOT_LABELS = ['SG', 'GRN', 'AR', 'SB', 'SMG', 'PST'];
const SLOT_COUNT = 6;
const GRENADE_SLOT = 1;

/** Gun-only slot indices for weapon cycling (skip GRENADE=1, SANDBAG=3) */
const GUN_SLOTS = [0, 2, 4, 5]; // SHOTGUN, PRIMARY, SMG, PISTOL

const SWIPE_THRESHOLD = 40; // px
const DOUBLE_TAP_WINDOW = 300; // ms
const LONG_PRESS_DURATION = 500; // ms

interface ActionButton {
  element: HTMLDivElement;
  key: string;
  label: string;
}

export class TouchActionButtons extends UIComponent {
  private buttons: ActionButton[] = [];
  private activeIndex = 2; // Default: AR (slot 2)
  private previousIndex = 0; // Last weapon for quick-switch
  private weaponLabelEl?: HTMLElement;
  private weaponCyclerEl?: HTMLElement;
  private weaponPrevEl?: HTMLElement;
  private weaponNextEl?: HTMLElement;

  private onAction?: (action: string) => void;
  private onWeaponSelect?: (slotIndex: number) => void;
  private onGrenadeQuickThrow?: () => void;

  // Swipe state
  private swipeStartX = 0;
  private swipePointerId: number | null = null;

  // Double-tap state
  private lastTapTime = 0;

  // Long-press state for grenade
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTriggered = false;

  protected build(): void {
    this.root.className = styles.actionContainer;
    this.root.id = 'touch-action-buttons';

    this.addWeaponCycler();
    this.addButton('reload', 'R');
    this.addButton('jump', 'JUMP');
  }

  protected onMount(): void {
    // Wire action buttons (jump, reload)
    for (const { element, key } of this.buttons) {
      this.listen(element, 'pointerdown', (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        element.classList.add(styles.pressed);
        if (typeof element.setPointerCapture === 'function') element.setPointerCapture(e.pointerId);
        this.onAction?.(key);
      }, { passive: false });

      this.listen(element, 'pointerup', (e: PointerEvent) => {
        e.preventDefault();
        element.classList.remove(styles.pressed);
        if (typeof element.releasePointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      }, { passive: false });

      this.listen(element, 'pointercancel', (e: PointerEvent) => {
        e.preventDefault();
        element.classList.remove(styles.pressed);
        if (typeof element.releasePointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      }, { passive: false });
    }

    // Wire weapon cycler chevrons (kept as direct tap targets)
    if (this.weaponPrevEl) {
      this.listen(this.weaponPrevEl, 'pointerdown', (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.cyclePrev();
      }, { passive: false });
    }

    if (this.weaponNextEl) {
      this.listen(this.weaponNextEl, 'pointerdown', (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.cycleNext();
      }, { passive: false });
    }

    // Wire swipe + double-tap + long-press on the weapon cycler label area
    if (this.weaponCyclerEl) {
      this.listen(this.weaponCyclerEl, 'pointerdown', (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // Ignore chevron sub-element taps (handled above)
        if (e.target === this.weaponPrevEl || e.target === this.weaponNextEl) return;

        e.preventDefault();
        e.stopPropagation();
        this.swipeStartX = e.clientX;
        this.swipePointerId = e.pointerId;
        this.longPressTriggered = false;

        if (typeof this.weaponCyclerEl!.setPointerCapture === 'function') {
          this.weaponCyclerEl!.setPointerCapture(e.pointerId);
        }

        // Start long-press timer if current slot is grenade
        if (this.activeIndex === GRENADE_SLOT) {
          this.longPressTimer = setTimeout(() => {
            this.longPressTriggered = true;
            this.onGrenadeQuickThrow?.();
            this.flashSwitch();
          }, LONG_PRESS_DURATION);
        }
      }, { passive: false });

      this.listen(this.weaponCyclerEl, 'pointermove', (e: PointerEvent) => {
        if (e.pointerId !== this.swipePointerId) return;
        e.preventDefault();
        // Cancel long-press if finger moves significantly
        const dx = e.clientX - this.swipeStartX;
        if (Math.abs(dx) > 10 && this.longPressTimer !== null) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      }, { passive: false });

      this.listen(this.weaponCyclerEl, 'pointerup', (e: PointerEvent) => {
        if (e.pointerId !== this.swipePointerId) return;
        e.preventDefault();
        this.swipePointerId = null;

        // Cancel long-press timer
        if (this.longPressTimer !== null) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }

        if (typeof this.weaponCyclerEl!.releasePointerCapture === 'function' && this.weaponCyclerEl!.hasPointerCapture(e.pointerId)) {
          this.weaponCyclerEl!.releasePointerCapture(e.pointerId);
        }

        // If long-press already fired, don't process as tap/swipe
        if (this.longPressTriggered) return;

        const dx = e.clientX - this.swipeStartX;

        if (dx > SWIPE_THRESHOLD) {
          this.cycleNext();
        } else if (dx < -SWIPE_THRESHOLD) {
          this.cyclePrev();
        } else {
          // Tap on label area - check for double-tap
          const now = Date.now();
          if (now - this.lastTapTime < DOUBLE_TAP_WINDOW) {
            this.quickSwitchToLast();
            this.lastTapTime = 0;
          } else {
            this.lastTapTime = now;
          }
        }
      }, { passive: false });

      this.listen(this.weaponCyclerEl, 'pointercancel', (e: PointerEvent) => {
        if (e.pointerId !== this.swipePointerId) return;
        this.swipePointerId = null;
        if (this.longPressTimer !== null) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      }, { passive: false });
    }
  }

  setOnAction(callback: (action: string) => void): void {
    this.onAction = callback;
  }

  setOnWeaponSelect(callback: (slotIndex: number) => void): void {
    this.onWeaponSelect = callback;
  }

  setOnGrenadeQuickThrow(callback: () => void): void {
    this.onGrenadeQuickThrow = callback;
  }

  setActiveSlot(index: number): void {
    if (index >= 0 && index < SLOT_COUNT) {
      if (this.activeIndex !== index) {
        this.previousIndex = this.activeIndex;
      }
      this.activeIndex = index;
      this.updateWeaponLabel();
    }
  }

  private addButton(key: string, label: string): void {
    const btn = document.createElement('div');
    btn.className = styles.actionBtn;
    btn.setAttribute('aria-label', label);

    const iconMap: Record<string, string> = {
      'R': 'icon-reload.png',
      'JUMP': 'icon-jump.png',
    };

    const iconFile = iconMap[label];
    if (iconFile) {
      const iconEl = document.createElement('img');
      iconEl.src = icon(iconFile.replace('.png', ''));
      iconEl.alt = label;
      iconEl.draggable = false;
      iconEl.style.cssText = 'width: 55%; height: 55%; object-fit: contain; pointer-events: none; image-rendering: pixelated;';
      btn.appendChild(iconEl);
    } else {
      btn.textContent = label;
    }

    this.buttons.push({ element: btn, key, label });
    this.root.appendChild(btn);
  }

  private addWeaponCycler(): void {
    const row = document.createElement('div');
    row.className = styles.weaponCycler;

    const prevBtn = document.createElement('div');
    prevBtn.className = styles.weaponCyclerChevron;
    prevBtn.textContent = '\u2039';

    const label = document.createElement('div');
    label.className = styles.weaponCyclerLabel;
    label.textContent = SLOT_LABELS[this.activeIndex];

    const nextBtn = document.createElement('div');
    nextBtn.className = styles.weaponCyclerChevron;
    nextBtn.textContent = '\u203A';

    row.appendChild(prevBtn);
    row.appendChild(label);
    row.appendChild(nextBtn);
    this.root.appendChild(row);

    this.weaponCyclerEl = row;
    this.weaponLabelEl = label;
    this.weaponPrevEl = prevBtn;
    this.weaponNextEl = nextBtn;
  }

  private cycleNext(): void {
    const currentGunIdx = GUN_SLOTS.indexOf(this.activeIndex);
    const nextGunIdx = (currentGunIdx + 1) % GUN_SLOTS.length;
    const next = GUN_SLOTS[nextGunIdx >= 0 ? nextGunIdx : 0];
    this.previousIndex = this.activeIndex;
    this.activeIndex = next;
    this.updateWeaponLabel();
    this.onWeaponSelect?.(next);
    this.flashSwitch();
  }

  private cyclePrev(): void {
    const currentGunIdx = GUN_SLOTS.indexOf(this.activeIndex);
    const prevGunIdx = (currentGunIdx - 1 + GUN_SLOTS.length) % GUN_SLOTS.length;
    const prev = GUN_SLOTS[prevGunIdx >= 0 ? prevGunIdx : 0];
    this.previousIndex = this.activeIndex;
    this.activeIndex = prev;
    this.updateWeaponLabel();
    this.onWeaponSelect?.(prev);
    this.flashSwitch();
  }

  /** Double-tap quick-switch to the previous weapon. */
  private quickSwitchToLast(): void {
    if (this.previousIndex === this.activeIndex) return;
    const target = this.previousIndex;
    this.previousIndex = this.activeIndex;
    this.activeIndex = target;
    this.updateWeaponLabel();
    this.onWeaponSelect?.(target);
    this.flashSwitch();
  }

  private updateWeaponLabel(): void {
    if (this.weaponLabelEl) {
      this.weaponLabelEl.textContent = SLOT_LABELS[this.activeIndex];
    }
  }

  private flashSwitch(): void {
    if (this.weaponCyclerEl) {
      this.weaponCyclerEl.classList.add(styles.weaponCyclerActive);
      setTimeout(() => this.weaponCyclerEl?.classList.remove(styles.weaponCyclerActive), 200);
    }
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
  }
}
