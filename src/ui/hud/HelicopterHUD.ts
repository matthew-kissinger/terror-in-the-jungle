// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * HelicopterHUD - Consolidated helicopter instruments overlay.
 *
 * Sub-sections, each independently toggleable:
 * 1. Elevation + airspeed readout
 * 2. Heading strip (compass direction + degrees)
 * 3. VSI (vertical speed indicator)
 * 4. Mouse mode indicator (CONTROL / FREE LOOK)
 * 5. Instruments panel (thrust bar, RPM, hover/boost indicators)
 * 6. Per-variant weapon-state panels: the attack airframe gets the pilot
 *    weapon/ammo row; the gunship gets the door-gun crew panel (belt count);
 *    the transport gets neither. Panel selection is descriptor-driven
 *    (HELI_VARIANT_DESCRIPTORS) — the wrong-variant panel never mounts.
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

/**
 * Per-variant HUD panel descriptor: which weapon-state panels mount for a given
 * airframe role. Replaces the old `role === 'attack' || role === 'gunship'`
 * duck-typed check so each variant gets exactly its panels (the wrong-variant
 * panel never mounts):
 *   - transport: no weapon panels (unarmed UH-1 lift ship);
 *   - gunship:   the door-gun crew panel (belt count) — the guns are
 *                crew-operated, so the pilot sees the door-gun belt, not a
 *                pilot weapon-select;
 *   - attack:    the pilot weapon/ammo panel (AH-1 gun + rocket select, fed by
 *                the gunship-reticle-upgrade weapon-status push).
 */
export interface HeliHudVariantDescriptor {
  /** Pilot weapon/ammo panel (AH-1 attack sight: gun + rockets). */
  readonly showWeaponPanel: boolean;
  /** Door-gun crew panel (gunship: belt count). */
  readonly showCrewPanel: boolean;
}

const HELI_VARIANT_DESCRIPTORS: Record<AircraftRole, HeliHudVariantDescriptor> = {
  transport: { showWeaponPanel: false, showCrewPanel: false },
  gunship: { showWeaponPanel: false, showCrewPanel: true },
  attack: { showWeaponPanel: true, showCrewPanel: false },
};

/** Resolve the panel descriptor for an airframe role (single source of truth). */
export function heliHudVariantDescriptor(role: AircraftRole): HeliHudVariantDescriptor {
  return HELI_VARIANT_DESCRIPTORS[role];
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
  /**
   * Magazine/belt capacity for the active weapon. Drives the LOW-ammo state as a
   * real remaining/capacity ratio rather than a hardcoded per-weapon guess. 0
   * means "capacity unknown" — the LOW state stays off in that case so an
   * airframe that never reports a capacity never falsely flags LOW.
   */
  private weaponCapacity = this.signal(0);

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
      <div data-ref="crewRow" class="${styles.panel} ${styles.crewSection}">
        <div class="${styles.crewState}">DOOR</div>
        <div data-ref="crewBeltEl" class="${styles.crewBelt}">0</div>
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

    // Effect: per-variant weapon/crew panel visibility. The descriptor for the
    // active airframe role decides which panel mounts — the attack airframe gets
    // the pilot weapon panel, the gunship gets the door-gun crew panel, the
    // transport gets neither. The wrong-variant panel is never shown.
    this.effect(() => {
      const descriptor = heliHudVariantDescriptor(this.aircraftRole.value);
      const weaponRow = this.$('[data-ref="weaponRow"]');
      const crewRow = this.$('[data-ref="crewRow"]');
      weaponRow?.classList.toggle(styles.weaponSectionVisible, descriptor.showWeaponPanel);
      crewRow?.classList.toggle(styles.crewSectionVisible, descriptor.showCrewPanel);
    });

    // Effect: pilot weapon name + ammo (attack panel) and the gunship door-gun
    // belt (crew panel). The same weapon-status push feeds both — the attack
    // panel reads it as the pilot weapon, the gunship panel reads the ammo as
    // the door-gun belt count. Only the active variant's panel is visible.
    this.effect(() => {
      const ammo = this.weaponAmmo.value;
      const capacity = this.weaponCapacity.value;
      this.text('[data-ref="weaponNameEl"]', this.weaponName.value);
      this.text('[data-ref="weaponAmmoEl"]', String(ammo));
      this.text('[data-ref="crewBeltEl"]', String(ammo));

      // LOW state lights when the remaining rounds drop under 20% of capacity
      // (empty also reads LOW). Mirrors the FixedWingHUD gun-ammo threshold so
      // the two aircraft classes flag low ammo the same way. A 0 capacity (never
      // reported) leaves the state off. Both the pilot-weapon and door-gun crew
      // readouts share the flag since only one panel is visible per variant.
      const low = capacity > 0 && ammo <= capacity * 0.2;
      const weaponAmmoEl = this.$('[data-ref="weaponAmmoEl"]');
      const crewBeltEl = this.$('[data-ref="crewBeltEl"]');
      weaponAmmoEl?.classList.toggle(styles.ammoLow, low);
      crewBeltEl?.classList.toggle(styles.ammoLow, low);
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

  /**
   * Show the selected pilot weapon name + remaining ammo in the weapon/crew
   * panel. The attack panel reads it as the pilot weapon (gun/rockets); the
   * gunship crew panel reads the ammo as the door-gun belt count. Display-only:
   * the ammo is floored to whole rounds so the readout never shows a fractional
   * count (rocket pods rearm in floating increments; belts are whole rounds).
   *
   * `maxAmmo` (optional) is the weapon's magazine/belt capacity. When supplied
   * it drives the LOW-ammo state (remaining under 20% of capacity). Omitting it
   * (or passing 0) leaves the capacity unknown and the LOW state off, so
   * existing callers that only push name + ammo are unaffected.
   */
  setWeaponStatus(name: string, ammo: number, maxAmmo?: number): void {
    this.weaponName.value = name;
    this.weaponAmmo.value = Math.max(0, Math.floor(ammo));
    if (maxAmmo !== undefined) {
      this.weaponCapacity.value = Math.max(0, Math.floor(maxAmmo));
    }
  }

  setDamage(healthPercent: number): void {
    this.healthPercent.value = healthPercent;
  }
}
