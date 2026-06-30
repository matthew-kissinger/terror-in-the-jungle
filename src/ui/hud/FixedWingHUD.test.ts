/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FixedWingHUD } from './FixedWingHUD';

// CSS-module proxy returns the class name verbatim so class lookups resolve and
// we can assert OBSERVABLE state (which class is applied) rather than styling.
vi.mock('./FixedWingHUD.module.css', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

describe('FixedWingHUD — nose-gun ammo readout', () => {
  let hud: FixedWingHUD;
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    hud = new FixedWingHUD();
    hud.mount(parent);
  });

  afterEach(() => {
    hud.dispose();
    document.body.removeChild(parent);
  });

  function ammoText(): string {
    const el = hud.element.querySelector('[data-ref="ammoValue"]') as HTMLElement;
    return el.textContent ?? '';
  }

  function isLow(): boolean {
    const el = hud.element.querySelector('[data-ref="ammoValue"]') as HTMLElement;
    return el.classList.contains('ammoLow');
  }

  function weaponLabel(): string {
    const el = hud.element.querySelector('[data-ref="weaponLabel"]') as HTMLElement;
    return el.textContent ?? '';
  }

  it('shows the rounds remaining and follows the fire path down', () => {
    hud.setAmmo(600, 600);
    expect(ammoText()).toBe('600');

    hud.setAmmo(540, 600);
    expect(ammoText()).toBe('540');

    hud.setAmmo(0, 600);
    expect(ammoText()).toBe('0');
  });

  it('does not flag LOW while plenty of rounds remain', () => {
    hud.setAmmo(600, 600);
    expect(isLow()).toBe(false);

    hud.setAmmo(200, 600); // ~33% — still healthy
    expect(isLow()).toBe(false);
  });

  it('flags LOW once remaining rounds fall under a fifth of the magazine', () => {
    hud.setAmmo(120, 600); // exactly 20% — at the threshold
    expect(isLow()).toBe(true);

    hud.setAmmo(30, 600); // well below
    expect(isLow()).toBe(true);

    hud.setAmmo(0, 600); // empty reads LOW too
    expect(isLow()).toBe(true);
  });

  it('clears the LOW flag when the magazine is reloaded back above the threshold', () => {
    hud.setAmmo(20, 600);
    expect(isLow()).toBe(true);

    hud.setAmmo(600, 600);
    expect(isLow()).toBe(false);
  });

  it('shows the per-airframe weapon name on the gun-panel label', () => {
    hud.setAmmo(1500, 1500, '3x 7.62mm Broadside');
    expect(weaponLabel()).toBe('3x 7.62mm Broadside');

    hud.setAmmo(480, 480, '4x 20mm Wing Cannon');
    expect(weaponLabel()).toBe('4x 20mm Wing Cannon');
  });

  it('keeps the default gun label when no weapon name is supplied', () => {
    expect(weaponLabel()).toBe('GUN');
    hud.setAmmo(540, 600); // legacy 2-arg call
    expect(weaponLabel()).toBe('GUN');
  });
});

describe('FixedWingHUD — seat / fire cue + airborne-gate hint', () => {
  let hud: FixedWingHUD;
  let parent: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    parent = document.createElement('div');
    document.body.appendChild(parent);
    hud = new FixedWingHUD();
    hud.mount(parent);
  });

  afterEach(() => {
    hud.dispose();
    document.body.removeChild(parent);
    vi.useRealTimers();
  });

  function cueShown(ref: string): boolean {
    const el = hud.element.querySelector(`[data-ref="${ref}"]`) as HTMLElement;
    return el.style.display !== 'none';
  }

  function airborneHintShown(): boolean {
    const el = hud.element.querySelector('[data-ref="airborneHint"]') as HTMLElement;
    return el.classList.contains('airborneHintVisible');
  }

  it('always names the pilot seat', () => {
    const seat = hud.element.querySelector('.seatLabel') as HTMLElement;
    expect(seat.textContent).toBe('PILOT');
  });

  it('lights the LMB-fire cue only on an armed airframe', () => {
    hud.setSeatFireCue(false);
    expect(cueShown('seatFireCue')).toBe(false);

    hud.setSeatFireCue(true);
    expect(cueShown('seatFireCue')).toBe(true);
  });

  it('shows the broadside gun-cam note only for the AC-47 broadside airframe', () => {
    hud.setSeatFireCue(true, /* broadside */ false);
    expect(cueShown('seatBroadsideCue')).toBe(false);

    hud.setSeatFireCue(true, /* broadside */ true);
    expect(cueShown('seatBroadsideCue')).toBe(true);
  });

  it('flashes the "Airborne to fire" hint on a ground fire attempt, then fades it', () => {
    expect(airborneHintShown()).toBe(false);

    hud.flashAirborneHint(1500);
    expect(airborneHintShown()).toBe(true);

    // The hint is transient — it clears itself rather than sticking on the HUD.
    vi.advanceTimersByTime(1600);
    expect(airborneHintShown()).toBe(false);
  });
});
