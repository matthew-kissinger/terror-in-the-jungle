/**
 * WeaponPill - Compact mobile weapon indicator.
 *
 * Replaces the 6-slot UnifiedWeaponBar on touch devices with a minimal pill
 * showing the current weapon name + ammo count with tap-to-cycle chevrons.
 *
 * Layout: [◂] AR 30/90 [▸]
 *
 * Swipe left/right on the pill body to cycle weapons.
 * Tap chevrons to cycle forward/back.
 *
 * Hidden on desktop (CSS rule: [data-device="desktop"] .pill { display: none }).
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './WeaponPill.module.css';

export class WeaponPill extends UIComponent {
  private activeIndex = this.signal(2); // Default: slot 3 (PRIMARY / AR)
  private magazine = this.signal(30);
  private reserve = this.signal(90);

  private static readonly SLOT_LABELS = ['SG', 'GRN', 'AR', 'SB', 'SMG', 'PST'];
  private static readonly SLOT_COUNT = 6;
  /** Gun-only slot indices for weapon cycling (skip GRENADE=1, SANDBAG=3) */
  private static readonly GUN_SLOTS = [0, 2, 4, 5];

  private onWeaponSelect?: (slotIndex: number) => void;

  // Swipe tracking
  private swipeStartX = 0;
  private swiping = false;

  protected build(): void {
    this.root.className = styles.pill;
    this.root.innerHTML = `
      <button class="${styles.chevron} ${styles.chevronLeft}" data-ref="prev" aria-label="Previous weapon">\u2039</button>
      <div class="${styles.info}" data-ref="info">
        <span class="${styles.weaponName}" data-ref="name">AR</span>
        <span class="${styles.ammo}" data-ref="ammo">30<span class="${styles.ammoSep}">/</span>90</span>
      </div>
      <button class="${styles.chevron} ${styles.chevronRight}" data-ref="next" aria-label="Next weapon">\u203A</button>
    `;
  }

  protected onMount(): void {
    const prevBtn = this.$('[data-ref="prev"]')!;
    const nextBtn = this.$('[data-ref="next"]')!;
    const infoEl = this.$('[data-ref="info"]')!;

    // Chevron taps
    this.listen(prevBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.cyclePrev();
    }, { passive: false });

    this.listen(nextBtn, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycleNext();
    }, { passive: false });

    // Swipe on info area
    this.listen(infoEl, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      this.swipeStartX = e.clientX;
      this.swiping = true;
      if (typeof infoEl.setPointerCapture === 'function') {
        (infoEl as HTMLElement).setPointerCapture(e.pointerId);
      }
    }, { passive: false });

    this.listen(infoEl, 'pointerup', (e: PointerEvent) => {
      if (!this.swiping) return;
      this.swiping = false;
      const dx = e.clientX - this.swipeStartX;
      if (Math.abs(dx) > 30) {
        if (dx > 0) this.cyclePrev();
        else this.cycleNext();
      }
      if (typeof (infoEl as HTMLElement).releasePointerCapture === 'function' &&
          (infoEl as HTMLElement).hasPointerCapture(e.pointerId)) {
        (infoEl as HTMLElement).releasePointerCapture(e.pointerId);
      }
    }, { passive: false });

    this.listen(infoEl, 'pointercancel', (e: PointerEvent) => {
      this.swiping = false;
      if (typeof (infoEl as HTMLElement).releasePointerCapture === 'function' &&
          (infoEl as HTMLElement).hasPointerCapture(e.pointerId)) {
        (infoEl as HTMLElement).releasePointerCapture(e.pointerId);
      }
    }, { passive: false });

    // Reactive: weapon name
    this.effect(() => {
      const idx = this.activeIndex.value;
      this.text('[data-ref="name"]', WeaponPill.SLOT_LABELS[idx]);
    });

    // Reactive: ammo display + color coding
    this.effect(() => {
      const mag = this.magazine.value;
      const res = this.reserve.value;
      const ammoEl = this.$('[data-ref="ammo"]');
      if (ammoEl) {
        ammoEl.innerHTML = `${mag}<span class="${styles.ammoSep}">/</span>${res}`;
      }

      this.root.classList.remove(styles.low, styles.empty, styles.noAmmo);
      if (mag === 0 && res === 0) {
        this.root.classList.add(styles.noAmmo);
      } else if (mag === 0) {
        this.root.classList.add(styles.empty);
      } else if (mag <= 10) {
        this.root.classList.add(styles.low);
      }
    });
  }

  // --- Public API ---

  setOnWeaponSelect(callback: (slotIndex: number) => void): void {
    this.onWeaponSelect = callback;
  }

  setActiveSlot(index: number): void {
    if (index >= 0 && index < WeaponPill.SLOT_COUNT) {
      this.activeIndex.value = index;
    }
  }

  setAmmo(magazine: number, reserve: number): void {
    this.magazine.value = magazine;
    this.reserve.value = reserve;
  }

  // --- Internal ---

  private cycleNext(): void {
    // Cycle forward through gun slots only (skip equipment slots)
    const guns = WeaponPill.GUN_SLOTS;
    const currentGunIdx = guns.indexOf(this.activeIndex.value);
    const nextGunIdx = (currentGunIdx + 1) % guns.length;
    const next = guns[nextGunIdx >= 0 ? nextGunIdx : 0];
    this.activeIndex.value = next;
    this.onWeaponSelect?.(next);
    this.flashSwitch();
  }

  private cyclePrev(): void {
    // Cycle backward through gun slots only (skip equipment slots)
    const guns = WeaponPill.GUN_SLOTS;
    const currentGunIdx = guns.indexOf(this.activeIndex.value);
    const prevGunIdx = (currentGunIdx - 1 + guns.length) % guns.length;
    const prev = guns[prevGunIdx >= 0 ? prevGunIdx : 0];
    this.activeIndex.value = prev;
    this.onWeaponSelect?.(prev);
    this.flashSwitch();
  }

  private flashSwitch(): void {
    this.root.classList.add(styles.switching);
    setTimeout(() => this.root.classList.remove(styles.switching), 200);
  }
}
