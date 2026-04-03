/**
 * FixedWingHUD - Fixed-wing aircraft instruments overlay.
 *
 * Sub-sections:
 * 1. Elevation + airspeed readout (with stall zone coloring)
 * 2. Heading strip (compass direction + degrees)
 * 3. VSI (vertical speed indicator)
 * 4. Throttle bar + auto-level indicator
 * 5. Stall warning (flashing red)
 * 6. Mouse mode indicator (CONTROL / FREE LOOK)
 * 7. Damage bar (health percentage)
 */

import { UIComponent } from '../engine/UIComponent';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { iconHtml } from '../icons/IconRegistry';
import styles from './FixedWingHUD.module.css';

const HEADING_LABELS: readonly string[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function headingToLabel(degrees: number): string {
  const index = Math.round(degrees / 45) % 8;
  return HEADING_LABELS[index];
}

export class FixedWingHUD extends UIComponent {
  // --- Reactive state ---
  private visible = this.signal(false);

  // Elevation
  private elevation = this.signal(0);

  // Flight data
  private airspeed = this.signal(0);
  private heading = this.signal(0);
  private verticalSpeed = this.signal(0);
  private stallSpeed = this.signal(40);

  // Instruments
  private throttle = this.signal(0);
  private autoLevel = this.signal(false);

  // Stall
  private isStalled = this.signal(false);

  // Mouse mode
  private mouseVisible = this.signal(false);
  private controlMode = this.signal(true);

  // Damage
  private healthPercent = this.signal(100);

  private readonly isTouch = isTouchDevice();

  protected build(): void {
    this.root.className = `${styles.container} ${this.isTouch ? styles.touchMode : ''}`;
    this.root.innerHTML = `
      <div data-ref="elevation" class="${styles.panel}">
        <div data-ref="elevValue" class="${styles.elevationValue}">0m</div>
        <div class="${styles.dataLabel}">${iconHtml('icon-altimeter', { width: 12, alt: 'ELEV', css: 'vertical-align:middle;' })}</div>
        <div data-ref="airspeedValue" class="${styles.airspeedValue}">0</div>
        <div class="${styles.dataLabel}">${iconHtml('icon-airspeed', { width: 12, alt: 'SPD', css: 'vertical-align:middle;' })}</div>
      </div>
      <div data-ref="headingPanel" class="${styles.panel} ${styles.headingSection}">
        ${iconHtml('icon-compass-needle', { width: 12, css: 'vertical-align:middle;opacity:0.7;margin-right:2px;' })}
        <div data-ref="headingLabel" class="${styles.headingLabel}">N</div>
        <div data-ref="headingDegrees" class="${styles.headingDegrees}">000</div>
      </div>
      <div data-ref="vsiPanel" class="${styles.panel} ${styles.vsiSection}">
        <div data-ref="vsiArrow" class="${styles.vsiArrow}"></div>
        <div data-ref="vsiValue" class="${styles.vsiValue}">0.0</div>
        <div class="${styles.dataLabel}">VSI</div>
      </div>
      <div data-ref="instruments" class="${styles.panel} ${styles.instrumentsSection}">
        <div class="${styles.instrumentColumn}">
          <div class="${styles.instrumentLabel}">THR</div>
          <div class="${styles.thrustBar}">
            <div data-ref="thrustFill" class="${styles.thrustFill} ${styles.thrustNormal}"></div>
          </div>
        </div>
        <div class="${styles.statusRow}">
          <div data-ref="autoLevelBox" class="${styles.statusBox}">LVL</div>
        </div>
      </div>
      <div data-ref="stallWarning" class="${styles.panel} ${styles.stallWarning}">
        <div class="${styles.stallText}">STALL</div>
      </div>
      <div data-ref="mouse" class="${styles.panel} ${styles.mouseSection}">
        <div data-ref="mouseIcon" class="${styles.mouseIcon}">
          <div class="${styles.mouseWheel}"></div>
        </div>
        <div data-ref="mouseStatus" class="${styles.mouseStatus}">CONTROL</div>
        <div class="${styles.mouseLabel}">RCTRL</div>
      </div>
      <div data-ref="damageBar" class="${styles.panel} ${styles.damageSection}">
        <div class="${styles.instrumentLabel}">${iconHtml('icon-engine-health', { width: 12, alt: 'HP', css: 'vertical-align:middle;' })}</div>
        <div class="${styles.damageBarOuter}">
          <div data-ref="damageFill" class="${styles.damageFill}"></div>
        </div>
        <div data-ref="damageValue" class="${styles.damageValue}">100%</div>
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

    // Effect: airspeed display with stall zone coloring
    this.effect(() => {
      const speed = Math.round(this.airspeed.value);
      const stall = this.stallSpeed.value;
      const el = this.$('[data-ref="airspeedValue"]');
      if (el) {
        el.textContent = String(speed);
        el.classList.remove(styles.airspeedStall, styles.airspeedWarning);
        if (speed < stall) {
          el.classList.add(styles.airspeedStall);
        } else if (speed < stall * 1.2) {
          el.classList.add(styles.airspeedWarning);
        }
      }
    });

    // Effect: heading strip
    this.effect(() => {
      const deg = Math.round(this.heading.value);
      this.text('[data-ref="headingLabel"]', headingToLabel(deg));
      this.text('[data-ref="headingDegrees"]', String(deg).padStart(3, '0'));
    });

    // Effect: VSI
    this.effect(() => {
      const vs = this.verticalSpeed.value;
      const arrow = this.$('[data-ref="vsiArrow"]');
      if (arrow) {
        arrow.classList.remove(styles.vsiUp, styles.vsiDown, styles.vsiNeutral);
        if (vs > 0.5) {
          arrow.classList.add(styles.vsiUp);
        } else if (vs < -0.5) {
          arrow.classList.add(styles.vsiDown);
        } else {
          arrow.classList.add(styles.vsiNeutral);
        }
      }
      this.text('[data-ref="vsiValue"]', `${vs.toFixed(1)}`);
    });

    // Effect: throttle bar
    this.effect(() => {
      const fill = this.$('[data-ref="thrustFill"]');
      if (!fill) return;
      const pct = Math.round(this.throttle.value * 100);
      fill.style.height = `${pct}%`;

      fill.classList.remove(styles.thrustNormal, styles.thrustMedium, styles.thrustHigh);
      if (pct > 80) {
        fill.classList.add(styles.thrustHigh);
      } else if (pct > 50) {
        fill.classList.add(styles.thrustMedium);
      } else {
        fill.classList.add(styles.thrustNormal);
      }
    });

    // Effect: auto-level indicator
    this.effect(() => {
      const el = this.$('[data-ref="autoLevelBox"]');
      if (!el) return;
      if (this.autoLevel.value) {
        el.classList.add(styles.statusBoxActive);
      } else {
        el.classList.remove(styles.statusBoxActive);
      }
    });

    // Effect: stall warning
    this.effect(() => {
      const el = this.$('[data-ref="stallWarning"]');
      if (!el) return;
      if (this.isStalled.value) {
        el.classList.add(styles.stallWarningVisible);
      } else {
        el.classList.remove(styles.stallWarningVisible);
      }
    });

    // Effect: mouse section visibility
    this.effect(() => {
      const el = this.$('[data-ref="mouse"]');
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
      const statusEl = this.$('[data-ref="mouseStatus"]');
      const iconEl = this.$('[data-ref="mouseIcon"]');
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

    // Effect: damage bar
    this.effect(() => {
      const hp = this.healthPercent.value;
      const fill = this.$('[data-ref="damageFill"]');
      if (fill) {
        fill.style.width = `${hp}%`;
        fill.classList.remove(styles.damageGreen, styles.damageAmber, styles.damageRed);
        if (hp > 75) {
          fill.classList.add(styles.damageGreen);
        } else if (hp > 25) {
          fill.classList.add(styles.damageAmber);
        } else {
          fill.classList.add(styles.damageRed);
        }
      }
      this.text('[data-ref="damageValue"]', `${Math.round(hp)}%`);
    });
  }

  // --- Public API ---

  show(): void { this.visible.value = true; }
  hide(): void { this.visible.value = false; }

  setElevation(elevation: number): void { this.elevation.value = elevation; }

  setFlightData(airspeed: number, heading: number, verticalSpeed: number): void {
    this.airspeed.value = airspeed;
    this.heading.value = heading;
    this.verticalSpeed.value = verticalSpeed;
  }

  setStallSpeed(speed: number): void { this.stallSpeed.value = speed; }
  setStallWarning(stalled: boolean): void { this.isStalled.value = stalled; }

  setThrottle(throttle: number): void { this.throttle.value = throttle; }
  setAutoLevel(active: boolean): void { this.autoLevel.value = active; }

  showMouseIndicator(): void { this.mouseVisible.value = true; }
  hideMouseIndicator(): void { this.mouseVisible.value = false; }
  setMouseMode(controlMode: boolean): void { this.controlMode.value = controlMode; }

  setDamage(healthPercent: number): void { this.healthPercent.value = healthPercent; }
}
