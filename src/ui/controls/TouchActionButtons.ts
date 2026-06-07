// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

const DEFAULT_SLOT_LABELS = ['SG', 'GRN', 'AR', 'SB', 'SMG', 'PST'];
const SLOT_COUNT = 6;
const GRENADE_SLOT = 1;

const DEFAULT_WEAPON_CYCLE_SLOTS = [2, 0, 4, 5]; // AR, SG, SMG, PST

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
  private activeActionPresses = new Map<HTMLElement, number>();
  private activeIndex = 2; // Default: AR (slot 2)
  private previousIndex = 0; // Last weapon for quick-switch
  private slotLabels = [...DEFAULT_SLOT_LABELS];
  private weaponCycleSlots = [...DEFAULT_WEAPON_CYCLE_SLOTS];
  private weaponLabelEl?: HTMLElement;
  private weaponAmmoEl?: HTMLElement;
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
    this.addButton('command', 'CMD');
    this.addButton('map', 'MAP');
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
        this.activeActionPresses.set(element, e.pointerId);
        try { element.setPointerCapture(e.pointerId); } catch { /* CDP/synthetic events */ }
        this.onAction?.(key);
      }, { passive: false });

      this.listen(element, 'pointerup', (e: PointerEvent) => {
        e.preventDefault();
        element.classList.remove(styles.pressed);
        this.activeActionPresses.delete(element);
        if (typeof element.releasePointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      }, { passive: false });

      this.listen(element, 'pointercancel', (e: PointerEvent) => {
        e.preventDefault();
        element.classList.remove(styles.pressed);
        this.activeActionPresses.delete(element);
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

        try { this.weaponCyclerEl!.setPointerCapture(e.pointerId); } catch { /* CDP/synthetic events */ }

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

    // Listen for ammo updates from HUDSystem via DOM event
    document.addEventListener('hud:ammo', ((e: CustomEvent<{ magazine: number; reserve: number }>) => {
      this.updateAmmo(e.detail.magazine, e.detail.reserve);
    }) as EventListener);

    // Pick up initial ammo if weapon was equipped before this component mounted
    const mag = parseInt(document.documentElement.dataset.ammoMag || '', 10);
    const res = parseInt(document.documentElement.dataset.ammoRes || '', 10);
    if (!isNaN(mag) && !isNaN(res)) this.updateAmmo(mag, res);
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

  cancelActiveGesture(): void {
    this.swipePointerId = null;
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressTriggered = false;

    for (const [element, pointerId] of this.activeActionPresses) {
      element.classList.remove(styles.pressed);
      if (typeof element.releasePointerCapture === 'function' && element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    }
    this.activeActionPresses.clear();
  }

  setActiveSlot(index: number): void {
    if (index >= 0 && index < SLOT_COUNT) {
      if (this.activeIndex !== index) {
        if (this.isWeaponCycleSlot(this.activeIndex)) {
          this.previousIndex = this.activeIndex;
        }
      }
      this.activeIndex = index;
      this.updateWeaponLabel();
    }
  }

  setSlotConfig(labels: readonly string[], weaponCycleSlots: readonly number[]): void {
    this.slotLabels = Array.from({ length: SLOT_COUNT }, (_, index) => labels[index] ?? DEFAULT_SLOT_LABELS[index] ?? '--');
    this.setWeaponCycleSlots(weaponCycleSlots);
    this.updateWeaponLabel();
  }

  setWeaponCycleSlots(slots: readonly number[]): void {
    const sanitized = this.sanitizeWeaponCycleSlots(slots);
    this.weaponCycleSlots = sanitized.length > 0 ? sanitized : [...DEFAULT_WEAPON_CYCLE_SLOTS];
    if (!this.isWeaponCycleSlot(this.previousIndex)) {
      this.previousIndex = this.weaponCycleSlots[0] ?? this.activeIndex;
    }
  }

  private addButton(key: string, label: string): void {
    const btn = document.createElement('div');
    btn.className = styles.actionBtn;
    btn.setAttribute('aria-label', label);
    btn.dataset.action = key;

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
    label.textContent = this.slotLabels[this.activeIndex];

    const ammo = document.createElement('div');
    ammo.className = styles.weaponCyclerAmmo;
    this.weaponAmmoEl = ammo;

    const nextBtn = document.createElement('div');
    nextBtn.className = styles.weaponCyclerChevron;
    nextBtn.textContent = '\u203A';

    row.appendChild(prevBtn);
    row.appendChild(label);
    row.appendChild(ammo);
    row.appendChild(nextBtn);
    this.root.appendChild(row);

    this.weaponCyclerEl = row;
    this.weaponLabelEl = label;
    this.weaponPrevEl = prevBtn;
    this.weaponNextEl = nextBtn;
  }

  private cycleNext(): void {
    this.selectWeaponCycleSlot(this.getAdjacentWeaponSlot(1));
  }

  private cyclePrev(): void {
    this.selectWeaponCycleSlot(this.getAdjacentWeaponSlot(-1));
  }

  /** Double-tap quick-switch to the previous weapon. */
  private quickSwitchToLast(): void {
    if (this.previousIndex === this.activeIndex || !this.isWeaponCycleSlot(this.previousIndex)) return;
    const target = this.previousIndex;
    this.selectWeaponCycleSlot(target);
  }

  private updateWeaponLabel(): void {
    if (this.weaponLabelEl) {
      this.weaponLabelEl.textContent = this.slotLabels[this.activeIndex] ?? '--';
    }
  }

  private getAdjacentWeaponSlot(direction: 1 | -1): number {
    const slots = this.weaponCycleSlots;
    const currentIndex = slots.indexOf(this.activeIndex);
    if (currentIndex < 0) return slots[0] ?? this.activeIndex;
    return slots[(currentIndex + direction + slots.length) % slots.length];
  }

  private selectWeaponCycleSlot(slot: number): void {
    if (slot < 0 || slot >= SLOT_COUNT) return;
    const previous = this.activeIndex;
    if (previous !== slot && this.isWeaponCycleSlot(previous)) {
      this.previousIndex = previous;
    }
    this.activeIndex = slot;
    this.updateWeaponLabel();
    this.onWeaponSelect?.(slot);
    this.flashSwitch();
  }

  private isWeaponCycleSlot(slot: number): boolean {
    return this.weaponCycleSlots.includes(slot);
  }

  private sanitizeWeaponCycleSlots(slots: readonly number[]): number[] {
    const sanitized: number[] = [];
    for (const slot of slots) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT || sanitized.includes(slot)) {
        continue;
      }
      sanitized.push(slot);
    }
    return sanitized;
  }

  private flashSwitch(): void {
    if (this.weaponCyclerEl) {
      this.weaponCyclerEl.classList.add(styles.weaponCyclerActive);
      setTimeout(() => this.weaponCyclerEl?.classList.remove(styles.weaponCyclerActive), 200);
    }
  }

  /** Update the ammo count shown in the weapon cycler. */
  updateAmmo(magazine: number, reserve: number): void {
    if (this.weaponAmmoEl) {
      this.weaponAmmoEl.textContent = `${magazine}/${reserve}`;
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
