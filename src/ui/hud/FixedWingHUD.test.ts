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
});
