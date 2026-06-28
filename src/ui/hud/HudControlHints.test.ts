/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HudControlHints } from './HudControlHints';

const STORAGE_KEY = 'tij.hud.controlHints.visible';

/** Read the text of every legend row as "keys → action" strings. */
function legendRows(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('.hud-control-hints__row')).map((row) => {
    const keys = row.querySelector('.hud-control-hints__keys')?.textContent ?? '';
    const action = row.querySelector('.hud-control-hints__action')?.textContent ?? '';
    return `${keys} ${action}`;
  });
}

function legendText(host: HTMLElement): string {
  return host.querySelector('.hud-control-hints')?.textContent ?? '';
}

describe('HudControlHints', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    document.querySelectorAll('.hud-control-hints').forEach((el) => el.remove());
  });

  it('shows the on-foot binds by default', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    const text = legendText(host);
    expect(text).toContain('Move');
    expect(text).toContain('Board vehicle');
    // The dominant finding: players could not tell the radio / squad menu exist.
    expect(text).toContain('Air support radio');
    expect(text).toContain('Squad commands');
    hints.dispose();
  });

  it('lists ground-vehicle binds — including seat swap and armed fire — in a ground vehicle', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    hints.setContext('groundVehicle');

    const rows = legendRows(host).join(' | ');
    expect(rows).toContain('Throttle');
    expect(rows).toContain('Exit / swap seat');
    expect(rows.toLowerCase()).toContain('fire');
    // On-foot-only binds should not bleed into the vehicle legend.
    expect(legendText(host)).not.toContain('Board vehicle');
    hints.dispose();
  });

  it('lists airborne-fire and exit binds in an aircraft', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    hints.setContext('aircraft');

    const text = legendText(host);
    // The finding the owner reported: he could not tell that planes fire.
    expect(text).toContain('Fire guns');
    expect(text).toContain('Throttle / Altitude');
    expect(text).toContain('Exit aircraft');
    hints.dispose();
  });

  it('swaps the legend when context changes back and forth', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    hints.setContext('aircraft');
    expect(legendText(host)).toContain('Fire guns');

    hints.setContext('foot');
    const onFoot = legendText(host);
    expect(onFoot).toContain('Board vehicle');
    expect(onFoot).not.toContain('Fire guns');
    hints.dispose();
  });

  it('hides and re-shows via toggle, persisting the preference', () => {
    const hints = new HudControlHints();
    hints.mount(host);
    expect(hints.isShown()).toBe(true);

    hints.toggle();
    expect(hints.isShown()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');

    hints.toggle();
    expect(hints.isShown()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    hints.dispose();
  });

  it('restores the saved off preference on the next mount (default-on otherwise)', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const hints = new HudControlHints();
    hints.mount(host);
    expect(hints.isShown()).toBe(false);
    hints.dispose();

    localStorage.removeItem(STORAGE_KEY);
    const fresh = new HudControlHints();
    fresh.mount(host);
    expect(fresh.isShown()).toBe(true);
    fresh.dispose();
  });

  it('responds to its default toggle key while mounted', () => {
    const hints = new HudControlHints();
    hints.mount(host);
    expect(hints.isShown()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }));
    expect(hints.isShown()).toBe(false);
    hints.dispose();
  });

  it('is suppressed on touch devices without overwriting the user preference', () => {
    const hints = new HudControlHints();
    hints.mount(host, /* isTouchDevice */ true);
    expect(hints.isShown()).toBe(false);

    // Clearing suppression restores the (default-on) preference.
    hints.setSuppressed(false);
    expect(hints.isShown()).toBe(true);
    hints.dispose();
  });

  it('removes its DOM and stops listening on dispose', () => {
    const hints = new HudControlHints();
    hints.mount(host);
    expect(host.querySelector('.hud-control-hints')).not.toBeNull();

    hints.dispose();
    expect(host.querySelector('.hud-control-hints')).toBeNull();

    // A toggle key after dispose must not throw or re-show anything.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }));
    expect(document.querySelector('.hud-control-hints')).toBeNull();
  });
});
