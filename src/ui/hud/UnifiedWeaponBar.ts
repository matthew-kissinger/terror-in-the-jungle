/**
 * UnifiedWeaponBar - single weapon bar for all input types.
 *
 * Replaces three separate weapon UIs:
 *   - TouchWeaponBar (touch-only, top-center)
 *   - InventoryManager.createUI() hotbar (desktop, bottom-center)
 *   - WeaponAmmoDisplay (desktop ammo readout)
 *
 * Desktop: shows key hints (1-6), highlights active slot, shows ammo.
 * Touch: same bar with pointer-event tap to switch weapons.
 * Mounts into the 'weapon-bar' grid slot.
 */

interface WeaponSlotEl {
  element: HTMLDivElement;
  index: number;
  label: string;
  keyHint: HTMLSpanElement;
  ammoEl: HTMLSpanElement;
}

export class UnifiedWeaponBar {
  private container: HTMLDivElement;
  private slots: WeaponSlotEl[] = [];
  private activeIndex = 2; // Default: slot 3 (PRIMARY / AR)
  private currentMagazine = 0;
  private currentReserve = 0;

  private onWeaponSelect?: (slotIndex: number) => void;
  private styleEl?: HTMLStyleElement;

  private static readonly SLOT_LABELS = ['SG', 'GRN', 'AR', 'SB', 'SMG', 'PST'];
  private static readonly SLOT_NAMES = ['SHOTGUN', 'GRENADE', 'RIFLE', 'SANDBAG', 'SMG', 'PISTOL'];
  private static readonly STYLE_ID = 'unified-weapon-bar-styles';

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'uwb';
    this.container.style.cssText = `
      display: flex;
      flex-direction: row;
      gap: 4px;
      justify-content: center;
      align-items: flex-end;
      pointer-events: auto;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    `;

    for (let i = 0; i < 6; i++) {
      this.addSlot(i, UnifiedWeaponBar.SLOT_LABELS[i]);
    }

    this.injectStyles();
    this.updateHighlight();
  }

  // --- Public API ---

  setOnWeaponSelect(callback: (slotIndex: number) => void): void {
    this.onWeaponSelect = callback;
  }

  setActiveSlot(index: number): void {
    if (index >= 0 && index < 6 && index !== this.activeIndex) {
      this.activeIndex = index;
      this.updateHighlight();
    }
  }

  updateAmmo(magazine: number, reserve: number): void {
    this.currentMagazine = magazine;
    this.currentReserve = reserve;
    this.updateAmmoDisplay();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  dispose(): void {
    this.container.remove();
    const style = document.getElementById(UnifiedWeaponBar.STYLE_ID);
    if (style) style.remove();
  }

  // --- Internal ---

  private addSlot(index: number, label: string): void {
    const slot = document.createElement('div');
    slot.className = 'uwb-slot';
    slot.dataset.slot = String(index);

    // Key hint (desktop only - hidden on touch via CSS)
    const keyHint = document.createElement('span');
    keyHint.className = 'uwb-key';
    keyHint.textContent = String(index + 1);

    // Icon / label
    const icon = document.createElement('span');
    icon.className = 'uwb-icon';
    icon.textContent = label;

    // Ammo (shown only on active slot)
    const ammoEl = document.createElement('span');
    ammoEl.className = 'uwb-ammo';

    slot.appendChild(keyHint);
    slot.appendChild(icon);
    slot.appendChild(ammoEl);

    // Pointer events for weapon selection
    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof slot.setPointerCapture === 'function') {
        slot.setPointerCapture(e.pointerId);
      }
      slot.classList.add('uwb-slot--pressed');
      this.activeIndex = index;
      this.updateHighlight();
      this.onWeaponSelect?.(index);
    };

    const onPointerUp = (e: PointerEvent): void => {
      e.preventDefault();
      slot.classList.remove('uwb-slot--pressed');
      if (typeof slot.releasePointerCapture === 'function' && slot.hasPointerCapture(e.pointerId)) {
        slot.releasePointerCapture(e.pointerId);
      }
    };

    const onPointerCancel = (e: PointerEvent): void => {
      e.preventDefault();
      slot.classList.remove('uwb-slot--pressed');
      if (typeof slot.releasePointerCapture === 'function' && slot.hasPointerCapture(e.pointerId)) {
        slot.releasePointerCapture(e.pointerId);
      }
    };

    slot.addEventListener('pointerdown', onPointerDown, { passive: false });
    slot.addEventListener('pointerup', onPointerUp, { passive: false });
    slot.addEventListener('pointercancel', onPointerCancel, { passive: false });

    this.slots.push({ element: slot, index, label, keyHint, ammoEl });
    this.container.appendChild(slot);
  }

  private updateHighlight(): void {
    for (const slot of this.slots) {
      if (slot.index === this.activeIndex) {
        slot.element.classList.add('uwb-slot--active');
      } else {
        slot.element.classList.remove('uwb-slot--active');
      }
    }
    this.updateAmmoDisplay();
  }

  private updateAmmoDisplay(): void {
    for (const slot of this.slots) {
      if (slot.index === this.activeIndex) {
        // Show ammo only on active slot (skip grenade/sandbag - they use counts, not magazine)
        if (slot.index === 1 || slot.index === 3) {
          slot.ammoEl.textContent = '';
        } else {
          slot.ammoEl.textContent = `${this.currentMagazine}/${this.currentReserve}`;
        }
        slot.ammoEl.style.display = '';

        // Color-code ammo
        if (this.currentMagazine === 0 && this.currentReserve === 0) {
          slot.ammoEl.classList.add('uwb-ammo--empty');
          slot.ammoEl.classList.remove('uwb-ammo--low');
        } else if (this.currentMagazine === 0 || this.currentMagazine <= 10) {
          slot.ammoEl.classList.add('uwb-ammo--low');
          slot.ammoEl.classList.remove('uwb-ammo--empty');
        } else {
          slot.ammoEl.classList.remove('uwb-ammo--low', 'uwb-ammo--empty');
        }
      } else {
        slot.ammoEl.textContent = '';
        slot.ammoEl.style.display = 'none';
      }
    }
  }

  private injectStyles(): void {
    if (document.getElementById(UnifiedWeaponBar.STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = UnifiedWeaponBar.STYLE_ID;
    style.textContent = `
      .uwb-slot {
        position: relative;
        width: 48px;
        height: 52px;
        background: rgba(10, 10, 14, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
        transition: border-color 0.15s, background 0.15s;
        backdrop-filter: blur(4px);
        gap: 1px;
        cursor: pointer;
        touch-action: none;
        pointer-events: auto;
        box-sizing: border-box;
      }

      .uwb-slot--active {
        border-color: rgba(200, 230, 255, 0.6);
        background: rgba(200, 230, 255, 0.12);
      }

      .uwb-slot--pressed {
        transform: scale(0.92);
      }

      .uwb-key {
        font-size: 9px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.35);
        line-height: 1;
      }

      .uwb-icon {
        font-size: 12px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1;
      }

      .uwb-slot--active .uwb-icon {
        color: rgba(255, 255, 255, 0.95);
      }

      .uwb-ammo {
        font-size: 9px;
        font-weight: 600;
        color: rgba(220, 225, 230, 0.7);
        line-height: 1;
      }

      .uwb-ammo--low {
        color: rgba(212, 163, 68, 0.9);
      }

      .uwb-ammo--empty {
        color: rgba(201, 86, 74, 0.9);
      }

      /* Hide key hints on touch devices */
      [data-device="touch"] .uwb-key {
        display: none;
      }

      /* Responsive scaling */
      @media (max-width: 600px) {
        .uwb-slot {
          width: 40px;
          height: 44px;
        }
        .uwb-icon {
          font-size: 10px;
        }
        .uwb-ammo {
          font-size: 8px;
        }
      }
    `;
    document.head.appendChild(style);
    this.styleEl = style;
  }
}
