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

  describe('visibility', () => {
    it('should show and hide', () => {
      hud.show();
      expect(hud.element.classList.contains('visible')).toBe(true);
      hud.hide();
      expect(hud.element.classList.contains('visible')).toBe(false);
    });
  });

  describe('setElevation()', () => {
    it('should update elevation text', () => {
      hud.setElevation(150);
      const el = hud.element.querySelector('[data-ref="elevValue"]');
      expect(el?.textContent).toBe('150m');
    });
  });

  describe('setInstruments()', () => {
    it('should update collective/rpm/autoHover/boost', () => {
      hud.showInstruments();
      hud.setInstruments(0.7, 0.85, true, false);

      const rpmEl = hud.element.querySelector('[data-ref="rpmValue"]');
      expect(rpmEl?.textContent).toBe('85%');

      const hoverBox = hud.element.querySelector('[data-ref="hoverBox"]');
      expect(hoverBox?.classList.contains('hoverActive')).toBe(true);

      const boostBox = hud.element.querySelector('[data-ref="boostBox"]');
      expect(boostBox?.classList.contains('boostActive')).toBe(false);
    });
  });

  describe('setFlightData()', () => {
    it('should update airspeed display', () => {
      hud.setFlightData(45.7, 90, 2.5);
      const el = hud.element.querySelector('[data-ref="airspeedValue"]');
      expect(el?.textContent).toBe('46');
    });

    it('should update heading strip', () => {
      hud.setFlightData(0, 90, 0);
      const label = hud.element.querySelector('[data-ref="headingLabel"]');
      const degrees = hud.element.querySelector('[data-ref="headingDegrees"]');
      expect(label?.textContent).toBe('E');
      expect(degrees?.textContent).toBe('090');
    });

    it('should show north for heading 0', () => {
      hud.setFlightData(0, 0, 0);
      const label = hud.element.querySelector('[data-ref="headingLabel"]');
      expect(label?.textContent).toBe('N');
    });

    it('should show south for heading 180', () => {
      hud.setFlightData(0, 180, 0);
      const label = hud.element.querySelector('[data-ref="headingLabel"]');
      expect(label?.textContent).toBe('S');
    });

    it('should update VSI with climb arrow', () => {
      hud.setFlightData(0, 0, 3.0);
      const arrow = hud.element.querySelector('[data-ref="vsiArrow"]');
      expect(arrow?.classList.contains('vsiUp')).toBe(true);
    });

    it('should update VSI with descent arrow', () => {
      hud.setFlightData(0, 0, -2.0);
      const arrow = hud.element.querySelector('[data-ref="vsiArrow"]');
      expect(arrow?.classList.contains('vsiDown')).toBe(true);
    });

    it('should update VSI with neutral when near zero', () => {
      hud.setFlightData(0, 0, 0.1);
      const arrow = hud.element.querySelector('[data-ref="vsiArrow"]');
      expect(arrow?.classList.contains('vsiNeutral')).toBe(true);
    });

    it('should show VSI value', () => {
      hud.setFlightData(0, 0, -1.5);
      const el = hud.element.querySelector('[data-ref="vsiValue"]');
      expect(el?.textContent).toBe('-1.5');
    });
  });

  describe('setAircraftRole()', () => {
    it('should show weapon row for attack role', () => {
      hud.setAircraftRole('attack');
      const weaponRow = hud.element.querySelector('[data-ref="weaponRow"]');
      expect(weaponRow?.classList.contains('weaponSectionVisible')).toBe(true);
    });

    it('should show weapon row for gunship role', () => {
      hud.setAircraftRole('gunship');
      const weaponRow = hud.element.querySelector('[data-ref="weaponRow"]');
      expect(weaponRow?.classList.contains('weaponSectionVisible')).toBe(true);
    });

    it('should hide weapon row for transport role', () => {
      hud.setAircraftRole('transport');
      const weaponRow = hud.element.querySelector('[data-ref="weaponRow"]');
      expect(weaponRow?.classList.contains('weaponSectionVisible')).toBe(false);
    });
  });

  describe('setWeaponStatus()', () => {
    it('should update weapon name and ammo', () => {
      hud.setWeaponStatus('M134 Minigun', 3500);
      const name = hud.element.querySelector('[data-ref="weaponNameEl"]');
      const ammo = hud.element.querySelector('[data-ref="weaponAmmoEl"]');
      expect(name?.textContent).toBe('M134 Minigun');
      expect(ammo?.textContent).toBe('3500');
    });
  });

  describe('setDamage()', () => {
    it('should show green for health above 75%', () => {
      hud.setDamage(90);
      const fill = hud.element.querySelector('[data-ref="damageFill"]');
      expect(fill?.classList.contains('damageGreen')).toBe(true);
    });

    it('should show amber for health 26-75%', () => {
      hud.setDamage(50);
      const fill = hud.element.querySelector('[data-ref="damageFill"]');
      expect(fill?.classList.contains('damageAmber')).toBe(true);
    });

    it('should show red for health 25% or below', () => {
      hud.setDamage(20);
      const fill = hud.element.querySelector('[data-ref="damageFill"]');
      expect(fill?.classList.contains('damageRed')).toBe(true);
    });

    it('should update percentage text', () => {
      hud.setDamage(42);
      const el = hud.element.querySelector('[data-ref="damageValue"]');
      expect(el?.textContent).toBe('42%');
    });

    it('should set fill width', () => {
      hud.setDamage(65);
      const fill = hud.element.querySelector('[data-ref="damageFill"]') as HTMLElement;
      expect(fill?.style.width).toBe('65%');
    });
  });
});
