/**
 * CrosshairSystem - Context-sensitive crosshair overlay.
 *
 * Extends UIComponent with mode-driven rendering:
 *   infantry           - tactical crosshair (4 lines, dot, brackets, spread ring)
 *   helicopter_transport - hidden (no pilot weapons)
 *   helicopter_gunship   - hidden (door guns are crew-operated)
 *   helicopter_attack    - forward pipper reticle (circle + center dot)
 */

import { UIComponent } from '../engine/UIComponent';
import { icon } from '../icons/IconRegistry';
import styles from './CrosshairSystem.module.css';

export type CrosshairMode = 'infantry' | 'helicopter_transport' | 'helicopter_gunship' | 'helicopter_attack';

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
    `;
  }

  protected onMount(): void {
    // Effect: mode switching
    this.effect(() => {
      const currentMode = this.mode.value;
      const visible = this.isVisible.value;

      const infantry = this.$('[data-ref="infantry"]');
      const pipper = this.$('[data-ref="pipper"]');
      if (!infantry || !pipper) return;

      if (!visible) {
        this.root.classList.add(styles.hidden);
        return;
      }

      this.root.classList.remove(styles.hidden);

      switch (currentMode) {
        case 'infantry':
          infantry.style.display = '';
          pipper.style.display = 'none';
          break;
        case 'helicopter_attack':
          infantry.style.display = 'none';
          pipper.style.display = '';
          this.loadPipperIcons();
          break;
        case 'helicopter_transport':
        case 'helicopter_gunship':
          infantry.style.display = 'none';
          pipper.style.display = 'none';
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
