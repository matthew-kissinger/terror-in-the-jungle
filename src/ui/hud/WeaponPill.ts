// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
  private nameEl?: HTMLElement;
  private magazineEl?: HTMLElement;
  private reserveEl?: HTMLElement;
  private ammoBucket: 'normal' | 'low' | 'empty' | 'noAmmo' = 'normal';

  private static readonly SLOT_COUNT = 6;
  private slotLabels = ['SG', 'GRN', 'AR', 'SB', 'SMG', 'PST'];
  private gunSlots = [0, 2, 4, 5];

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
        <span class="${styles.ammo}" data-ref="ammo">
          <span data-ref="ammo-mag">30</span><span class="${styles.ammoSep}">/</span><span data-ref="ammo-reserve">90</span>
        </span>
      </div>
      <button class="${styles.chevron} ${styles.chevronRight}" data-ref="next" aria-label="Next weapon">\u203A</button>
    `;
  }

  protected onMount(): void {
    const prevBtn = this.$('[data-ref="prev"]')!;
    const nextBtn = this.$('[data-ref="next"]')!;
    const infoEl = this.$('[data-ref="info"]')!;
    this.nameEl = this.$('[data-ref="name"]') ?? undefined;
    this.magazineEl = this.$('[data-ref="ammo-mag"]') ?? undefined;
    this.reserveEl = this.$('[data-ref="ammo-reserve"]') ?? undefined;

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
      this.setTextIfChanged(this.nameEl, this.slotLabels[idx] ?? 'WPN');
    });

    // Reactive: ammo display + color coding
    this.effect(() => {
      const mag = this.magazine.value;
      const res = this.reserve.value;
      this.setTextIfChanged(this.magazineEl, String(mag));
      this.setTextIfChanged(this.reserveEl, String(res));

      this.applyAmmoClass(mag, res);
    });
  }

  protected onUnmount(): void {
    this.nameEl = undefined;
    this.magazineEl = undefined;
    this.reserveEl = undefined;
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
    if (this.magazine.value === magazine && this.reserve.value === reserve) return;

    this.magazine.value = magazine;
    this.reserve.value = reserve;
  }

  setSlotConfig(labels: string[], gunSlots: number[]): void {
    this.slotLabels = Array.from({ length: WeaponPill.SLOT_COUNT }, (_, index) => labels[index] ?? '--');
    this.gunSlots = gunSlots.filter(slot => slot >= 0 && slot < WeaponPill.SLOT_COUNT);
    if (!this.gunSlots.includes(this.activeIndex.value) && this.gunSlots.length > 0) {
      this.activeIndex.value = this.gunSlots[0];
    }
  }

  // --- Internal ---

  private cycleNext(): void {
    // Cycle forward through gun slots only (skip equipment slots)
    const guns = this.gunSlots;
    if (guns.length === 0) return;
    const currentGunIdx = guns.indexOf(this.activeIndex.value);
    const nextGunIdx = (currentGunIdx + 1) % guns.length;
    const next = guns[nextGunIdx];
    this.activeIndex.value = next;
    this.onWeaponSelect?.(next);
    this.flashSwitch();
  }

  private cyclePrev(): void {
    // Cycle backward through gun slots only (skip equipment slots)
    const guns = this.gunSlots;
    if (guns.length === 0) return;
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

  private applyAmmoClass(magazine: number, reserve: number): void {
    let nextBucket: typeof this.ammoBucket = 'normal';
    if (magazine === 0 && reserve === 0) {
      nextBucket = 'noAmmo';
    } else if (magazine === 0) {
      nextBucket = 'empty';
    } else if (magazine <= 10) {
      nextBucket = 'low';
    }

    if (nextBucket === this.ammoBucket) return;

    this.root.classList.remove(styles.low, styles.empty, styles.noAmmo);
    if (nextBucket === 'noAmmo') {
      this.root.classList.add(styles.noAmmo);
    } else if (nextBucket === 'empty') {
      this.root.classList.add(styles.empty);
    } else if (nextBucket === 'low') {
      this.root.classList.add(styles.low);
    }
    this.ammoBucket = nextBucket;
  }

  private setTextIfChanged(element: HTMLElement | undefined, text: string): void {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }
}
