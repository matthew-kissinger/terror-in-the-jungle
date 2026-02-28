/**
 * Action buttons for mobile: Jump, Reload, and Weapon Cycler.
 * Positioned in a column above the fire button on the right side.
 *
 * The weapon cycler replaces the old grenade button, showing the
 * active weapon label with prev/next chevrons to cycle through slots.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

const SLOT_LABELS = ['SG', 'GRN', 'AR', 'SB', 'SMG', 'PST'];
const SLOT_COUNT = 6;

/** Gun-only slot indices for weapon cycling (skip GRENADE=1, SANDBAG=3) */
const GUN_SLOTS = [0, 2, 4, 5]; // SHOTGUN, PRIMARY, SMG, PISTOL

interface ActionButton {
  element: HTMLDivElement;
  key: string;
  label: string;
}

export class TouchActionButtons extends UIComponent {
  private buttons: ActionButton[] = [];
  private activeIndex = 2; // Default: AR (slot 2)
  private weaponLabelEl?: HTMLElement;
  private weaponCyclerEl?: HTMLElement;
  private weaponPrevEl?: HTMLElement;
  private weaponNextEl?: HTMLElement;

  private onAction?: (action: string) => void;
  private onWeaponSelect?: (slotIndex: number) => void;

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

    // Wire weapon cycler chevrons
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
  }

  setOnAction(callback: (action: string) => void): void {
    this.onAction = callback;
  }

  setOnWeaponSelect(callback: (slotIndex: number) => void): void {
    this.onWeaponSelect = callback;
  }

  setActiveSlot(index: number): void {
    if (index >= 0 && index < SLOT_COUNT) {
      this.activeIndex = index;
      this.updateWeaponLabel();
    }
  }

  private addButton(key: string, label: string): void {
    const btn = document.createElement('div');
    btn.className = styles.actionBtn;
    btn.textContent = label;
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
    // Cycle forward through gun slots only (skip equipment slots)
    const currentGunIdx = GUN_SLOTS.indexOf(this.activeIndex);
    const nextGunIdx = (currentGunIdx + 1) % GUN_SLOTS.length;
    const next = GUN_SLOTS[nextGunIdx >= 0 ? nextGunIdx : 0];
    this.activeIndex = next;
    this.updateWeaponLabel();
    this.onWeaponSelect?.(next);
    this.flashSwitch();
  }

  private cyclePrev(): void {
    // Cycle backward through gun slots only (skip equipment slots)
    const currentGunIdx = GUN_SLOTS.indexOf(this.activeIndex);
    const prevGunIdx = (currentGunIdx - 1 + GUN_SLOTS.length) % GUN_SLOTS.length;
    const prev = GUN_SLOTS[prevGunIdx >= 0 ? prevGunIdx : 0];
    this.activeIndex = prev;
    this.updateWeaponLabel();
    this.onWeaponSelect?.(prev);
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
