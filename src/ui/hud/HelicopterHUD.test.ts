/**
 * @vitest-environment jsdom
 */
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

  it('shows the weapon row only for attack/gunship roles', () => {
    const weaponRow = () =>
      hud.element.querySelector('[data-ref="weaponRow"]') as HTMLElement;

    hud.setAircraftRole('attack');
    const attackClass = weaponRow().className;
    hud.setAircraftRole('transport');
    const transportClass = weaponRow().className;

    // The weapon row must render differently for an attack role vs transport;
    // we don't pin to a specific class name.
    expect(attackClass).not.toBe(transportClass);
  });

  it('updates weapon name and ammo', () => {
    hud.setWeaponStatus('M134 Minigun', 3500);
    expect(hud.element.querySelector('[data-ref="weaponNameEl"]')?.textContent).toBe('M134 Minigun');
    expect(hud.element.querySelector('[data-ref="weaponAmmoEl"]')?.textContent).toBe('3500');
  });

  it('shows the current damage percent and bar width', () => {
    hud.setDamage(42);
    expect(hud.element.querySelector('[data-ref="damageValue"]')?.textContent).toBe('42%');
    expect((hud.element.querySelector('[data-ref="damageFill"]') as HTMLElement).style.width).toBe('42%');
  });
});
