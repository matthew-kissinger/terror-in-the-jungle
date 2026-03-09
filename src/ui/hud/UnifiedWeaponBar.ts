/**
 * UnifiedWeaponBar - single weapon bar for all input types.
 *
 * Replaces three separate weapon UIs:
 *   - TouchWeaponBar (touch-only, top-center)
 *   - InventoryManager.createUI() hotbar (desktop, bottom-center)
 *   - WeaponAmmoDisplay (desktop ammo readout)
 *
 * Desktop: shows key hints (1-6) and active slot highlight.
 * Touch: same bar with pointer-event tap to switch weapons.
 * Mounts into the 'weapon-bar' grid slot.
 */

import { icon as iconUrl } from '../icons/IconRegistry';

/** Maps shortLabel -> icon registry name for weapon bar slots */
const SLOT_ICON_MAP: Record<string, string> = {
  SG: 'icon-shotgun',
  GRN: 'icon-grenade',
  FRG: 'icon-grenade',
  AR: 'icon-rifle',
  SB: 'icon-sandbag',
  SMG: 'icon-smg',
  PST: 'icon-pistol',
  LMG: 'icon-lmg',
  LNCR: 'icon-launcher',
};

interface WeaponSlotEl {
  element: HTMLDivElement;
  index: number;
  label: string;
  iconContainer: HTMLDivElement;
  keyHint: HTMLSpanElement;
}

interface WeaponBarSlotConfig {
  enabled: boolean;
  shortLabel: string;
  fullLabel: string;
}

export class UnifiedWeaponBar {
  private container: HTMLDivElement;
  private slots: WeaponSlotEl[] = [];
  private activeIndex = 2; // Default: slot 3 (PRIMARY / AR)

  private onWeaponSelect?: (slotIndex: number) => void;
  private styleEl?: HTMLStyleElement;

  private static readonly STYLE_ID = 'unified-weapon-bar-styles';
  private slotConfig: WeaponBarSlotConfig[] = [
    { enabled: true, shortLabel: 'SG', fullLabel: 'Shotgun' },
    { enabled: true, shortLabel: 'GRN', fullLabel: 'Grenade' },
    { enabled: true, shortLabel: 'AR', fullLabel: 'Rifle' },
    { enabled: true, shortLabel: 'SB', fullLabel: 'Sandbag' },
    { enabled: true, shortLabel: 'SMG', fullLabel: 'SMG' },
    { enabled: true, shortLabel: 'PST', fullLabel: 'Pistol' },
  ];

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
      this.addSlot(i, this.slotConfig[i].shortLabel);
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

  setSlotDefinitions(definitions: WeaponBarSlotConfig[]): void {
    this.slotConfig = Array.from({ length: 6 }, (_, index) => definitions[index] ?? {
      enabled: false,
      shortLabel: '--',
      fullLabel: 'Disabled'
    });

    for (const slot of this.slots) {
      const config = this.slotConfig[slot.index];
      slot.label = config.shortLabel;
      this.setSlotIcon(slot.iconContainer, config.shortLabel);
      slot.element.title = config.fullLabel;
      slot.element.style.display = config.enabled ? 'flex' : 'none';
      slot.element.classList.toggle('uwb-slot--disabled', !config.enabled);
    }

    if (!this.slotConfig[this.activeIndex]?.enabled) {
      const firstEnabled = this.slotConfig.findIndex(config => config.enabled);
      if (firstEnabled >= 0) {
        this.activeIndex = firstEnabled;
      }
    }

    this.updateHighlight();
  }

  /** Ammo is intentionally not rendered in hotkey bar; dedicated AmmoDisplay owns it. */
  updateAmmo(_magazine: number, _reserve: number): void {}

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
    slot.title = this.slotConfig[index]?.fullLabel ?? label;

    // Key hint (desktop only - hidden on touch via CSS)
    const keyHint = document.createElement('span');
    keyHint.className = 'uwb-key';
    keyHint.textContent = String(index + 1);

    // Icon container (img or text fallback)
    const iconContainer = document.createElement('div');
    iconContainer.className = 'uwb-icon';
    this.setSlotIcon(iconContainer, label);

    slot.appendChild(keyHint);
    slot.appendChild(iconContainer);

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
      if (this.slotConfig[index]?.enabled) {
        this.onWeaponSelect?.(index);
      }
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

    this.slots.push({ element: slot, index, label, iconContainer, keyHint });
    this.container.appendChild(slot);
  }

  private setSlotIcon(container: HTMLDivElement, shortLabel: string): void {
    container.innerHTML = '';
    const iconName = SLOT_ICON_MAP[shortLabel];
    if (iconName) {
      const img = document.createElement('img');
      img.src = iconUrl(iconName);
      img.alt = shortLabel;
      img.width = 22;
      img.height = 22;
      img.draggable = false;
      container.appendChild(img);
    } else {
      container.textContent = shortLabel;
    }
  }

  private updateHighlight(): void {
    for (const slot of this.slots) {
      const enabled = this.slotConfig[slot.index]?.enabled ?? false;
      if (slot.index === this.activeIndex && enabled) {
        slot.element.classList.add('uwb-slot--active');
      } else {
        slot.element.classList.remove('uwb-slot--active');
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
        background: rgba(10, 15, 8, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
        backdrop-filter: blur(6px);
        gap: 2px;
        cursor: pointer;
        touch-action: none;
        pointer-events: auto;
        box-sizing: border-box;
      }

      .uwb-slot--active {
        border-color: rgba(217, 119, 6, 0.5);
        background: rgba(217, 119, 6, 0.12);
        box-shadow: 0 0 8px rgba(217, 119, 6, 0.15);
      }

      .uwb-slot--pressed {
        transform: scale(0.92);
      }

      .uwb-slot--disabled {
        opacity: 0.25;
      }

      .uwb-key {
        font-size: 9px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.3);
        line-height: 1;
      }

      .uwb-slot--active .uwb-key {
        color: rgba(217, 160, 80, 0.7);
      }

      .uwb-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.55);
        line-height: 1;
      }

      .uwb-icon img {
        width: 22px;
        height: 22px;
        object-fit: contain;
        image-rendering: pixelated;
        opacity: 0.6;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
        transition: opacity 0.15s;
      }

      .uwb-slot--active .uwb-icon {
        color: rgba(255, 255, 255, 0.95);
      }

      .uwb-slot--active .uwb-icon img {
        opacity: 1;
        filter: drop-shadow(0 0 4px rgba(217, 119, 6, 0.4)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
      }

      /* Hide entire weapon bar on touch - WeaponPill replaces it */
      [data-device="touch"] .uwb {
        display: none !important;
      }

      /* Hide key hints on touch devices (fallback) */
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
        .uwb-icon img {
          width: 18px;
          height: 18px;
        }
      }
    `;
    document.head.appendChild(style);
    this.styleEl = style;
  }
}
