/**
 * HelicopterHUD - Consolidated helicopter instruments overlay.
 *
 * Three sub-sections, each independently toggleable:
 * 1. Elevation readout (altitude in meters)
 * 2. Mouse mode indicator (CONTROL / FREE LOOK)
 * 3. Instruments panel (thrust bar, RPM, hover/boost indicators)
 *
 * Replaces: ElevationSlider, HelicopterMouseIndicator, HelicopterInstrumentsPanel, HelicopterInstruments (wrapper)
 */

import { UIComponent } from '../engine/UIComponent';
import { isTouchDevice } from '../../utils/DeviceDetector';
import styles from './HelicopterHUD.module.css';

export class HelicopterHUD extends UIComponent {
  // --- Reactive state ---
  private visible = this.signal(false);

  // Elevation
  private elevation = this.signal(0);

  // Mouse mode
  private mouseVisible = this.signal(false);
  private controlMode = this.signal(true);

  // Instruments
  private instrumentsVisible = this.signal(false);
  private collective = this.signal(0);
  private rpm = this.signal(0);
  private autoHover = this.signal(false);
  private engineBoost = this.signal(false);

  // Hide mouse indicator on touch devices
  private readonly isTouch = isTouchDevice();

  protected build(): void {
    this.root.className = `${styles.container} ${this.isTouch ? styles.touchMode : ''}`;
    this.root.innerHTML = `
      <div data-ref="elevation" class="${styles.panel}">
        <div data-ref="elevValue" class="${styles.elevationValue}">0m</div>
        <div class="${styles.elevationLabel}">ELEV</div>
      </div>
      <div data-ref="mouse" class="${styles.panel} ${styles.mouseSection}">
        <div data-ref="mouseIcon" class="${styles.mouseIcon}">
          <div class="${styles.mouseWheel}"></div>
        </div>
        <div data-ref="mouseStatus" class="${styles.mouseStatus}">CONTROL</div>
        <div class="${styles.mouseLabel}">RCTRL</div>
      </div>
      <div data-ref="instruments" class="${styles.panel} ${styles.instrumentsSection}">
        <div class="${styles.instrumentColumn}">
          <div class="${styles.instrumentLabel}">THRU</div>
          <div class="${styles.thrustBar}">
            <div data-ref="thrustFill" class="${styles.thrustFill} ${styles.thrustNormal}"></div>
          </div>
        </div>
        <div class="${styles.instrumentColumn}">
          <div class="${styles.instrumentLabel}">RPM</div>
          <div data-ref="rpmValue" class="${styles.rpmValue}">0%</div>
        </div>
        <div class="${styles.statusRow}">
          <div data-ref="hoverBox" class="${styles.statusBox}">H</div>
          <div data-ref="boostBox" class="${styles.statusBox}">B</div>
        </div>
      </div>
    `;
  }

  protected onMount(): void {
    // Effect: container visibility
    this.effect(() => {
      this.toggleClass(styles.visible, this.visible.value);
    });

    // Effect: elevation text
    this.effect(() => {
      this.text('[data-ref="elevValue"]', `${Math.round(this.elevation.value)}m`);
    });

    // Effect: mouse section visibility (hidden on touch)
    this.effect(() => {
      const el = this.root.querySelector('[data-ref="mouse"]') as HTMLElement;
      if (!el || this.isTouch) return;
      if (this.mouseVisible.value) {
        el.classList.add(styles.mouseSectionVisible);
      } else {
        el.classList.remove(styles.mouseSectionVisible);
      }
    });

    // Effect: mouse mode display
    this.effect(() => {
      const isControl = this.controlMode.value;
      const statusEl = this.root.querySelector('[data-ref="mouseStatus"]') as HTMLElement;
      const iconEl = this.root.querySelector('[data-ref="mouseIcon"]') as HTMLElement;
      if (!statusEl || !iconEl) return;

      statusEl.textContent = isControl ? 'CONTROL' : 'FREE LOOK';
      if (isControl) {
        statusEl.classList.remove(styles.mouseStatusFreeLook);
        iconEl.classList.remove(styles.mouseIconFreeLook);
      } else {
        statusEl.classList.add(styles.mouseStatusFreeLook);
        iconEl.classList.add(styles.mouseIconFreeLook);
      }
    });

    // Effect: instruments section visibility
    this.effect(() => {
      const el = this.root.querySelector('[data-ref="instruments"]') as HTMLElement;
      if (!el) return;
      if (this.instrumentsVisible.value) {
        el.classList.add(styles.instrumentsSectionVisible);
      } else {
        el.classList.remove(styles.instrumentsSectionVisible);
      }
    });

    // Effect: thrust bar
    this.effect(() => {
      const fill = this.root.querySelector('[data-ref="thrustFill"]') as HTMLElement;
      if (!fill) return;
      const pct = Math.round(this.collective.value * 100);
      fill.style.height = `${pct}%`;

      // Color coding
      fill.classList.remove(styles.thrustNormal, styles.thrustMedium, styles.thrustHigh);
      if (pct > 80) {
        fill.classList.add(styles.thrustHigh);
      } else if (pct > 50) {
        fill.classList.add(styles.thrustMedium);
      } else {
        fill.classList.add(styles.thrustNormal);
      }
    });

    // Effect: RPM display
    this.effect(() => {
      const el = this.root.querySelector('[data-ref="rpmValue"]') as HTMLElement;
      if (!el) return;
      const pct = Math.round(this.rpm.value * 100);
      el.textContent = `${pct}%`;

      el.classList.remove(styles.rpmLow, styles.rpmHigh);
      if (pct < 30) {
        el.classList.add(styles.rpmLow);
      } else if (pct > 90) {
        el.classList.add(styles.rpmHigh);
      }
    });

    // Effect: hover indicator
    this.effect(() => {
      const el = this.root.querySelector('[data-ref="hoverBox"]') as HTMLElement;
      if (!el) return;
      if (this.autoHover.value) {
        el.classList.add(styles.statusBoxActive, styles.hoverActive);
      } else {
        el.classList.remove(styles.statusBoxActive, styles.hoverActive);
      }
    });

    // Effect: boost indicator
    this.effect(() => {
      const el = this.root.querySelector('[data-ref="boostBox"]') as HTMLElement;
      if (!el) return;
      if (this.engineBoost.value) {
        el.classList.add(styles.statusBoxActive, styles.boostActive);
      } else {
        el.classList.remove(styles.statusBoxActive, styles.boostActive);
      }
    });
  }

  // --- Public API ---

  show(): void {
    this.visible.value = true;
  }

  hide(): void {
    this.visible.value = false;
  }

  setElevation(elevation: number): void {
    this.elevation.value = elevation;
  }

  showMouseIndicator(): void {
    this.mouseVisible.value = true;
  }

  hideMouseIndicator(): void {
    this.mouseVisible.value = false;
  }

  setMouseMode(controlMode: boolean): void {
    this.controlMode.value = controlMode;
  }

  showInstruments(): void {
    this.instrumentsVisible.value = true;
  }

  hideInstruments(): void {
    this.instrumentsVisible.value = false;
  }

  setInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    this.collective.value = collective;
    this.rpm.value = rpm;
    this.autoHover.value = autoHover;
    this.engineBoost.value = engineBoost;
  }
}
