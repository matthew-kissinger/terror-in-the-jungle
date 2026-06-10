/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HelicopterHUD } from './HelicopterHUD';

vi.mock('../../utils/DeviceDetector', () => ({
  isTouchDevice: () => false,
}));

vi.mock('./HelicopterHUD.module.css', () => ({
  default: new Proxy({}, {
    get: (_target, prop) => String(prop),
  }),
}));

/**
 * Behavior-focused tests for HelicopterHUD.
 *
 * Intentionally does NOT assert on specific CSS class names used for damage
 * colour buckets or VSI arrow directions — those are visual tuning and will
 * be reshuffled as the HUD is restyled. We assert on user-facing text outputs
 * (airspeed/heading/VSI values, weapon label, damage percent) and show/hide
 * wiring instead.
 */
describe('HelicopterHUD', () => {
  let hud: HelicopterHUD;
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    hud = new HelicopterHUD();
    hud.mount(parent);
  });

  afterEach(() => {
    hud.dispose();
    document.body.removeChild(parent);
  });

  it('show / hide toggle visibility', () => {
    hud.show();
    expect(hud.element.classList.contains('visible')).toBe(true);
    hud.hide();
    expect(hud.element.classList.contains('visible')).toBe(false);
  });

  it('displays elevation in metres', () => {
    hud.setElevation(150);
    expect(hud.element.querySelector('[data-ref="elevValue"]')?.textContent).toBe('150m');
  });

  it('updates airspeed and heading readouts from flight data', () => {
    hud.setFlightData(45.7, 90, 0);
    expect(hud.element.querySelector('[data-ref="airspeedValue"]')?.textContent).toBe('46');
    expect(hud.element.querySelector('[data-ref="headingDegrees"]')?.textContent).toBe('090');
  });

  it('shows cardinal letter for the heading strip', () => {
    hud.setFlightData(0, 0, 0);
    expect(hud.element.querySelector('[data-ref="headingLabel"]')?.textContent).toBe('N');

    hud.setFlightData(0, 180, 0);
    expect(hud.element.querySelector('[data-ref="headingLabel"]')?.textContent).toBe('S');
  });

  it('shows a numeric VSI value', () => {
    hud.setFlightData(0, 0, -1.5);
    expect(hud.element.querySelector('[data-ref="vsiValue"]')?.textContent).toBe('-1.5');
  });

  describe('per-variant weapon-state panels (heli-hud-consolidation)', () => {
    const weaponRow = () => hud.element.querySelector('[data-ref="weaponRow"]') as HTMLElement;
    const crewRow = () => hud.element.querySelector('[data-ref="crewRow"]') as HTMLElement;
    // The visibility classes are added/removed per variant; we read each panel's
    // own "visible" marker class (the css mock returns class names verbatim).
    const weaponShown = () => weaponRow().classList.contains('weaponSectionVisible');
    const crewShown = () => crewRow().classList.contains('crewSectionVisible');

    it('transport mounts no weapon-state panel (unarmed lift ship)', () => {
      hud.setAircraftRole('transport');
      expect(weaponShown()).toBe(false);
      expect(crewShown()).toBe(false);
    });

    it('attack mounts the pilot weapon panel but not the door-gun crew panel', () => {
      hud.setAircraftRole('attack');
      expect(weaponShown()).toBe(true);
      expect(crewShown()).toBe(false);
    });

    it('gunship mounts the door-gun crew panel but not the pilot weapon panel', () => {
      hud.setAircraftRole('gunship');
      expect(crewShown()).toBe(true);
      expect(weaponShown()).toBe(false);
    });

    it('swaps panels cleanly when the variant changes (wrong-variant panel never lingers)', () => {
      hud.setAircraftRole('attack');
      expect(weaponShown()).toBe(true);

      hud.setAircraftRole('gunship');
      // The attack weapon panel retracts, the gunship crew panel comes up.
      expect(weaponShown()).toBe(false);
      expect(crewShown()).toBe(true);

      hud.setAircraftRole('transport');
      // Both retract for the unarmed transport.
      expect(weaponShown()).toBe(false);
      expect(crewShown()).toBe(false);
    });

    it('shows the door-gun belt count in the gunship crew panel', () => {
      hud.setAircraftRole('gunship');
      hud.setWeaponStatus('M60 Door Gun', 480);
      expect(hud.element.querySelector('[data-ref="crewBeltEl"]')?.textContent).toBe('480');
    });
  });

  it('updates weapon name and ammo', () => {
    hud.setWeaponStatus('M134 Minigun', 3500);
    expect(hud.element.querySelector('[data-ref="weaponNameEl"]')?.textContent).toBe('M134 Minigun');
    expect(hud.element.querySelector('[data-ref="weaponAmmoEl"]')?.textContent).toBe('3500');
  });

  it('shows the selected rocket pod with its remaining count on weapon cycle', () => {
    // Cycling from the minigun to the rocket pod swaps the live readout.
    hud.setWeaponStatus('M134 Minigun', 3500);
    hud.setWeaponStatus('Rocket Pod', 14);
    expect(hud.element.querySelector('[data-ref="weaponNameEl"]')?.textContent).toBe('Rocket Pod');
    expect(hud.element.querySelector('[data-ref="weaponAmmoEl"]')?.textContent).toBe('14');
  });

  it('floors a fractional ammo count to whole rounds in the readout', () => {
    // Rocket pods rearm in floating increments; the readout shows whole rounds.
    hud.setWeaponStatus('Rocket Pod', 7.8);
    expect(hud.element.querySelector('[data-ref="weaponAmmoEl"]')?.textContent).toBe('7');
  });

  it('shows the current damage percent and bar width', () => {
    hud.setDamage(42);
    expect(hud.element.querySelector('[data-ref="damageValue"]')?.textContent).toBe('42%');
    expect((hud.element.querySelector('[data-ref="damageFill"]') as HTMLElement).style.width).toBe('42%');
  });
});
