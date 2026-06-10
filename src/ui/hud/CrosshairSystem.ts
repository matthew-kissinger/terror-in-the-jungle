// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * CrosshairSystem - Context-sensitive crosshair overlay.
 *
 * Extends UIComponent with mode-driven rendering:
 *   infantry           - tactical crosshair (4 lines, dot, brackets, spread ring)
 *   helicopter_transport - hidden (no pilot weapons)
 *   helicopter_gunship   - hidden (door guns are crew-operated)
 *   helicopter_attack    - forward pipper reticle (circle + center dot)
 *   tank_gunner          - gunner sight: aim cross + horizontal stadia rangefinder + mil drop ticks
 *   emplacement_mg       - open MG cross (M2HB tripod / vehicle mount)
 *
 * The tank_gunner reticle is a real stadia sight (R2 tank-gunner-sight); the
 * emplacement_mg reticle is still placeholder geometry refined by the sibling
 * m2hb-gun-experience task. The stadia / drop ticks are static markings — no
 * live ballistic computation is drawn into them.
 */

import { UIComponent } from '../engine/UIComponent';
import { icon } from '../icons/IconRegistry';
import styles from './CrosshairSystem.module.css';

export type CrosshairMode =
  | 'infantry'
  | 'helicopter_transport'
  | 'helicopter_gunship'
  | 'helicopter_attack'
  | 'tank_gunner'
  | 'emplacement_mg';

export class CrosshairSystem extends UIComponent {
  private mode = this.signal<CrosshairMode>('infantry');
  private spreadRadius = this.signal(15);
  private isVisible = this.signal(true);
  private pipperIconsLoaded = false;

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div data-ref="infantry" class="${styles.tacticalCrosshair}">
        <div class="${styles.dot}"></div>
        <div class="${styles.line} ${styles.lineTop}"></div>
        <div class="${styles.line} ${styles.lineBottom}"></div>
        <div class="${styles.line} ${styles.lineLeft}"></div>
        <div class="${styles.line} ${styles.lineRight}"></div>
        <div class="${styles.bracket} ${styles.bracketTL}"></div>
        <div class="${styles.bracket} ${styles.bracketTR}"></div>
        <div class="${styles.bracket} ${styles.bracketBL}"></div>
        <div class="${styles.bracket} ${styles.bracketBR}"></div>
        <div data-ref="spreadRing" class="${styles.spreadRing}"></div>
      </div>
      <div data-ref="pipper" class="${styles.pipperReticle}" style="display:none">
        <img data-ref="pipperGun" data-icon="reticle-cobra-gun" alt="Gun reticle" width="48" height="48" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);object-fit:contain;image-rendering:pixelated;pointer-events:none;" draggable="false">
        <img data-ref="pipperRocket" data-icon="reticle-rocket" alt="Rocket reticle" width="48" height="48" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);object-fit:contain;image-rendering:pixelated;pointer-events:none;display:none;" draggable="false">
        <div class="${styles.pipperDot}"></div>
      </div>
      <div data-ref="tankGunner" class="${styles.tankGunnerReticle}" style="display:none">
        <!-- Center aim cross (short open arms, gap at the bore). -->
        <div class="${styles.gunnerArm} ${styles.gunnerArmUp}"></div>
        <div class="${styles.gunnerArm} ${styles.gunnerArmDown}"></div>
        <div class="${styles.gunnerArm} ${styles.gunnerArmLeft}"></div>
        <div class="${styles.gunnerArm} ${styles.gunnerArmRight}"></div>
        <div class="${styles.gunnerDot}"></div>
        <!-- Horizontal stadia rangefinder: graduated ticks each side of the
             bore for bracketing a target's width (static markings). -->
        <div class="${styles.stadiaTick} ${styles.stadiaL1}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaL2}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaL3}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaR1}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaR2}"></div>
        <div class="${styles.stadiaTick} ${styles.stadiaR3}"></div>
        <!-- Mil-style drop ticks below the bore (range holdover marks). -->
        <div class="${styles.dropTick} ${styles.drop1}"></div>
        <div class="${styles.dropTick} ${styles.drop2}"></div>
        <div class="${styles.dropTick} ${styles.drop3}"></div>
      </div>
      <div data-ref="emplacementMg" class="${styles.mgReticle}" style="display:none">
        <div class="${styles.mgLine} ${styles.mgLineTop}"></div>
        <div class="${styles.mgLine} ${styles.mgLineBottom}"></div>
        <div class="${styles.mgLine} ${styles.mgLineLeft}"></div>
        <div class="${styles.mgLine} ${styles.mgLineRight}"></div>
        <div class="${styles.mgDot}"></div>
      </div>
    `;
  }

  protected onMount(): void {
    // Effect: mode switching
    this.effect(() => {
      const currentMode = this.mode.value;
      const visible = this.isVisible.value;

      const infantry = this.$('[data-ref="infantry"]');
      const pipper = this.$('[data-ref="pipper"]');
      const tankGunner = this.$('[data-ref="tankGunner"]');
      const emplacementMg = this.$('[data-ref="emplacementMg"]');
      if (!infantry || !pipper || !tankGunner || !emplacementMg) return;

      if (!visible) {
        this.root.classList.add(styles.hidden);
        return;
      }

      this.root.classList.remove(styles.hidden);

      // Exactly one reticle is shown per mode (or none for the crew-only heli
      // modes). Hide everything first, then reveal the active reticle.
      infantry.style.display = 'none';
      pipper.style.display = 'none';
      tankGunner.style.display = 'none';
      emplacementMg.style.display = 'none';

      switch (currentMode) {
        case 'infantry':
          infantry.style.display = '';
          break;
        case 'helicopter_attack':
          pipper.style.display = '';
          this.loadPipperIcons();
          break;
        case 'tank_gunner':
          tankGunner.style.display = '';
          break;
        case 'emplacement_mg':
          emplacementMg.style.display = '';
          break;
        case 'helicopter_transport':
        case 'helicopter_gunship':
          // Crew-operated weapons — no pilot reticle.
          break;
      }
    });

    // Effect: spread ring size
    this.effect(() => {
      const ring = this.$('[data-ref="spreadRing"]');
      if (!ring) return;
      const diameter = this.spreadRadius.value * 2;
      ring.style.width = `${diameter}px`;
      ring.style.height = `${diameter}px`;
    });
  }

  // --- Public API (backward-compatible with CrosshairUI) ---

  showCrosshair(): void {
    this.isVisible.value = true;
  }

  hideCrosshair(): void {
    this.isVisible.value = false;
  }

  showCrosshairAgain(): void {
    this.isVisible.value = true;
  }

  getElement(): HTMLDivElement | undefined {
    return this.root;
  }

  setMode(mode: CrosshairMode): void {
    this.mode.value = mode;
  }

  getMode(): CrosshairMode {
    return this.mode.value;
  }

  setSpread(radius: number): void {
    this.spreadRadius.value = Math.max(0, radius);
  }

  private loadPipperIcons(): void {
    if (this.pipperIconsLoaded) return;
    this.pipperIconsLoaded = true;
    const imgs = this.root.querySelectorAll<HTMLImageElement>('[data-icon]');
    for (const img of imgs) {
      const name = img.getAttribute('data-icon');
      if (name && !img.src) {
        img.src = icon(name);
      }
    }
  }
}
