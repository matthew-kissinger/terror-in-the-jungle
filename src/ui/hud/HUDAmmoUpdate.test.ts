/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmmoDisplay } from './AmmoDisplay';
import { HUDSystem } from './HUDSystem';
import { WeaponPill } from './WeaponPill';

describe('HUD ammo update path', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-ammo-mag');
    document.documentElement.removeAttribute('data-ammo-res');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createHUDSystemShell(): HUDSystem {
    const hud = Object.create(HUDSystem.prototype) as HUDSystem;
    (hud as any).elements = {
      updateAmmoDisplay: vi.fn(),
      weaponPill: {
        setAmmo: vi.fn(),
      },
      showWeaponSwitch: vi.fn(),
    };
    return hud;
  }

  it('publishes ammo changes once and skips duplicate firing-path updates', () => {
    const hud = createHUDSystemShell();
    const events: Array<{ magazine: number; reserve: number }> = [];
    document.addEventListener('hud:ammo', ((event: CustomEvent<{ magazine: number; reserve: number }>) => {
      events.push(event.detail);
    }) as EventListener);

    hud.updateAmmoDisplay(30, 90);
    hud.updateAmmoDisplay(30, 90);
    hud.updateAmmoDisplay(29, 90);

    const elements = (hud as any).elements;
    expect(elements.updateAmmoDisplay).toHaveBeenCalledTimes(2);
    expect(elements.weaponPill.setAmmo).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      { magazine: 30, reserve: 90 },
      { magazine: 29, reserve: 90 },
    ]);
    expect(document.documentElement.dataset.ammoMag).toBe('29');
    expect(document.documentElement.dataset.ammoRes).toBe('90');
  });

  it('uses weapon-switch ammo as the mobile bridge only when it changes', () => {
    const hud = createHUDSystemShell();
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

    hud.showWeaponSwitch('Rifle', 'R', '30 / 90');
    hud.showWeaponSwitch('Rifle', 'R', '30 / 90');
    hud.showWeaponSwitch('Rifle', 'R', '28 / 90');

    const elements = (hud as any).elements;
    expect(elements.showWeaponSwitch).toHaveBeenCalledTimes(3);
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.ammoMag).toBe('28');
    expect(document.documentElement.dataset.ammoRes).toBe('90');
  });

  it('updates AmmoDisplay text and status without changing unchanged text nodes', () => {
    const display = new AmmoDisplay();
    const host = document.createElement('div');
    document.body.appendChild(host);
    display.mount(host);

    const magazine = host.querySelector<HTMLElement>('[data-ref="magazine"]');
    const reserve = host.querySelector<HTMLElement>('[data-ref="reserve"]');
    const status = host.querySelector<HTMLElement>('[data-ref="status"]');
    expect(magazine).not.toBeNull();
    expect(reserve).not.toBeNull();
    expect(status).not.toBeNull();

    display.setAmmo(9, 90);
    expect(magazine?.textContent).toBe('9');
    expect(reserve?.textContent).toBe('90');
    expect(status?.textContent).toBe('Low ammo');

    const statusTextNode = status?.firstChild;
    display.setAmmo(9, 90);
    expect(status?.firstChild).toBe(statusTextNode);

    display.setAmmo(0, 0);
    expect(status?.textContent).toBe('No ammo!');

    display.dispose();
  });

  it('keeps AmmoDisplay status DOM stable while the visible status is unchanged', () => {
    const display = new AmmoDisplay();
    const host = document.createElement('div');
    document.body.appendChild(host);
    display.mount(host);

    display.setAmmo(9, 90);
    const status = host.querySelector<HTMLElement>('[data-ref="status"]')!;
    const statusWrites = trackTextWrites(status);
    const statusToggle = vi.spyOn(status.classList, 'toggle');

    display.setAmmo(8, 90);

    expect(statusWrites).toEqual([]);
    expect(statusToggle).not.toHaveBeenCalled();

    display.dispose();
  });

  it('applies one coherent AmmoDisplay status for a logical ammo update', () => {
    const display = new AmmoDisplay();
    const host = document.createElement('div');
    document.body.appendChild(host);
    display.mount(host);

    display.setAmmo(9, 90);
    const status = host.querySelector<HTMLElement>('[data-ref="status"]')!;
    const statusWrites = trackTextWrites(status);

    display.setAmmo(0, 0);

    expect(statusWrites).toEqual(['No ammo!']);
    expect(status.textContent).toBe('No ammo!');

    display.dispose();
  });

  it('updates WeaponPill ammo by reusing stable child nodes', () => {
    const pill = new WeaponPill();
    const host = document.createElement('div');
    document.body.appendChild(host);
    pill.mount(host);

    const ammo = host.querySelector<HTMLElement>('[data-ref="ammo"]');
    const magazine = host.querySelector<HTMLElement>('[data-ref="ammo-mag"]');
    const separator = host.querySelector<HTMLElement>('[class*="ammoSep"]');
    const reserve = host.querySelector<HTMLElement>('[data-ref="ammo-reserve"]');
    expect(ammo).not.toBeNull();
    expect(magazine).not.toBeNull();
    expect(separator).not.toBeNull();
    expect(reserve).not.toBeNull();

    const initialChildren = Array.from(ammo!.childNodes);
    pill.setAmmo(4, 88);

    expect(magazine?.textContent).toBe('4');
    expect(separator?.textContent).toBe('/');
    expect(reserve?.textContent).toBe('88');
    expect(Array.from(ammo!.childNodes)).toEqual(initialChildren);

    pill.dispose();
  });
});

function trackTextWrites(element: HTMLElement): string[] {
  let current = element.textContent ?? '';
  const writes: string[] = [];
  Object.defineProperty(element, 'textContent', {
    configurable: true,
    get: () => current,
    set: (value: string | null) => {
      current = value ?? '';
      writes.push(current);
    },
  });
  return writes;
}
