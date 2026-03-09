/**
 * HelicopterHUD - Consolidated helicopter instruments overlay.
 *
 * Sub-sections, each independently toggleable:
 * 1. Elevation + airspeed readout
 * 2. Heading strip (compass direction + degrees)
 * 3. VSI (vertical speed indicator)
 * 4. Mouse mode indicator (CONTROL / FREE LOOK)
 * 5. Instruments panel (thrust bar, RPM, hover/boost indicators)
 * 6. Weapon status row (attack/gunship only)
 * 7. Damage bar (health percentage)
 *
 * Replaces: ElevationSlider, HelicopterMouseIndicator, HelicopterInstrumentsPanel, HelicopterInstruments (wrapper)
 */

import { UIComponent } from '../engine/UIComponent';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { iconHtml } from '../icons/IconRegistry';
import type { AircraftRole } from '../../systems/helicopter/AircraftConfigs';
import styles from './HelicopterHUD.module.css';

const HEADING_LABELS: readonly string[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function headingToLabel(degrees: number): string {
  const index = Math.round(degrees / 45) % 8;
  return HEADING_LABELS[index];
}

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

  // Flight data
  private airspeed = this.signal(0);
  private heading = this.signal(0);
  private verticalSpeed = this.signal(0);

  // Aircraft role
  private aircraftRole = this.signal<AircraftRole>('transport');

  // Weapon status
  private weaponName = this.signal('');
  private weaponAmmo = this.signal(0);

  // Damage
  private healthPercent = this.signal(100);

  // Hide mouse indicator on touch devices
  private readonly isTouch = isTouchDevice();

  protected build(): void {
    this.root.className = `${styles.container} ${this.isTouch ? styles.touchMode : ''}`;
    this.root.innerHTML = `
      <div data-ref="elevation" class="${styles.panel}">
        <div data-ref="elevValue" class="${styles.elevationValue}">0m</div>
        <div class="${styles.elevationLabel}">${iconHtml('icon-altimeter', { width: 12, alt: 'ELEV', css: 'vertical-align:middle;' })}</div>
        <div data-ref="airspeedValue" class="${styles.airspeedValue}">0</div>
        <div class="${styles.elevationLabel}">${iconHtml('icon-airspeed', { width: 12, alt: 'SPD', css: 'vertical-align:middle;' })}</div>
      </div>
      <div data-ref="headingPanel" class="${styles.panel} ${styles.headingSection}">
        ${iconHtml('icon-compass-needle', { width: 12, css: 'vertical-align:middle;opacity:0.7;margin-right:2px;' })}
        <div data-ref="headingLabel" class="${styles.headingLabel}">N</div>
        <div data-ref="headingDegrees" class="${styles.headingDegrees}">000</div>
      </div>
      <div data-ref="vsiPanel" class="${styles.panel} ${styles.vsiSection}">
        <div data-ref="vsiArrow" class="${styles.vsiArrow}"></div>
        <div data-ref="vsiValue" class="${styles.vsiValue}">0.0</div>
        <div class="${styles.elevationLabel}">VSI</div>
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
          <div data-ref="hoverBox" class="${styles.statusBox}">
            ${iconHtml('icon-auto-hover', { width: 10, alt: 'H', css: 'pointer-events:none;opacity:0.7;' })}
          </div>
          <div data-ref="boostBox" class="${styles.statusBox}">
            ${iconHtml('icon-boost', { width: 10, alt: 'B', css: 'pointer-events:none;opacity:0.7;' })}
          </div>
        </div>
      </div>
      <div data-ref="weaponRow" class="${styles.panel} ${styles.weaponSection}">
        <div data-ref="weaponNameEl" class="${styles.weaponName}"></div>
        <div data-ref="weaponAmmoEl" class="${styles.weaponAmmo}">0</div>
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

    // Effect: airspeed display
    this.effect(() => {
      this.text('[data-ref="airspeedValue"]', `${Math.round(this.airspeed.value)}`);
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

    // Effect: weapon row visibility (only for attack/gunship roles)
    this.effect(() => {
      const el = this.$('[data-ref="weaponRow"]');
      if (!el) return;
      const role = this.aircraftRole.value;
      if (role === 'attack' || role === 'gunship') {
        el.classList.add(styles.weaponSectionVisible);
      } else {
        el.classList.remove(styles.weaponSectionVisible);
      }
    });

    // Effect: weapon name + ammo
    this.effect(() => {
      this.text('[data-ref="weaponNameEl"]', this.weaponName.value);
      this.text('[data-ref="weaponAmmoEl"]', String(this.weaponAmmo.value));
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

  setFlightData(airspeed: number, heading: number, verticalSpeed: number): void {
    this.airspeed.value = airspeed;
    this.heading.value = heading;
    this.verticalSpeed.value = verticalSpeed;
  }

  setAircraftRole(role: AircraftRole): void {
    this.aircraftRole.value = role;
  }

  setWeaponStatus(name: string, ammo: number): void {
    this.weaponName.value = name;
    this.weaponAmmo.value = ammo;
  }

  setDamage(healthPercent: number): void {
    this.healthPercent.value = healthPercent;
  }
}
