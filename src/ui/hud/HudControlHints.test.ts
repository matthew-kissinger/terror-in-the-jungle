/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HudControlHints } from './HudControlHints';
import type { VehicleCapabilities, VehicleUIContext } from '../layout/types';

const STORAGE_KEY = 'tij.hud.controlHints.visible';

/** Capabilities with everything off — override just the fields a test cares about. */
function caps(overrides: Partial<VehicleCapabilities> = {}): VehicleCapabilities {
  return {
    canExit: true,
    canFirePrimary: false,
    canCycleWeapons: false,
    canFreeLook: false,
    canStabilize: false,
    canDeploySquad: false,
    canOpenMap: false,
    canOpenCommand: false,
    ...overrides,
  };
}

/** Read the seat block text (label + cues + note), or '' when it is hidden. */
function seatText(host: HTMLElement): string {
  const seat = host.querySelector('.hud-control-hints__seat') as HTMLElement | null;
  if (!seat || seat.style.display === 'none') return '';
  return seat.textContent ?? '';
}

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

describe('HudControlHints — seat / fire cues', () => {
  let host: HTMLDivElement;
  let hints: HudControlHints;

  // Realistic VehicleUIContexts mirroring the adapters' createX UI contexts.
  const tankDriver: VehicleUIContext = {
    kind: 'car', role: 'pilot', hudVariant: 'groundVehicle', weaponCount: 0,
    capabilities: caps({ canFreeLook: true }),
  };
  const tankGunner: VehicleUIContext = {
    kind: 'turret', role: 'gunner', hudVariant: 'turret', weaponCount: 1,
    capabilities: caps({ canFirePrimary: true }),
  };
  const jeepDriver: VehicleUIContext = {
    kind: 'car', role: 'driver', hudVariant: 'groundVehicle', weaponCount: 0,
    capabilities: caps({ canFreeLook: true }),
  };
  const gunshipHeli: VehicleUIContext = {
    kind: 'helicopter', role: 'gunship', hudVariant: 'flight', weaponCount: 2,
    capabilities: caps({ canFirePrimary: true }),
  };
  const transportHeli: VehicleUIContext = {
    kind: 'helicopter', role: 'transport', hudVariant: 'flight', weaponCount: 0,
    capabilities: caps({ canDeploySquad: true }),
  };
  const ac47: VehicleUIContext = {
    kind: 'plane', role: 'pilot', hudVariant: 'flight', weaponCount: 1,
    capabilities: caps({ canFirePrimary: true }),
    viewToggle: { inactiveLabel: 'SIDE', activeLabel: 'CHASE', active: false },
  };

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    hints = new HudControlHints();
    hints.mount(host);
  });

  afterEach(() => {
    hints.dispose();
    host.remove();
    document.querySelectorAll('.hud-control-hints').forEach((el) => el.remove());
  });

  it('shows no seat block on foot or in a single-seat unarmed jeep', () => {
    expect(seatText(host)).toBe('');

    hints.setSeatHint(HudControlHints.seatHintFromContext(jeepDriver));
    // A jeep has one seat and no weapon — nothing to teach, so no seat block.
    expect(seatText(host)).toBe('');
  });

  it('names the tank gunner seat and shows both LMB-fire and F-swap cues', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(tankGunner));

    const text = seatText(host);
    expect(text).toContain('GUNNER');
    expect(text).toContain('LMB: fire');
    expect(text).toContain('F: swap seat'); // the owner could not tell F swaps seats
  });

  it('names the tank driver seat with a swap cue but no fire cue (driver is unarmed)', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(tankDriver));

    const text = seatText(host);
    expect(text).toContain('DRIVER');
    expect(text).toContain('F: swap seat');
    expect(text).not.toContain('LMB: fire');
  });

  it('tells the gunship pilot they can swap to the door gun and fire', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(gunshipHeli));

    const text = seatText(host);
    expect(text).toContain('PILOT');
    expect(text).toContain('F: swap seat');
    expect(text.toLowerCase()).toContain('door gun');
    expect(text).toContain('LMB: fire');
  });

  it('shows the AC-47 pilot the fire cue and broadside gun-cam note, with no seat swap', () => {
    // The owner boarded the AC-47, thought he was a stuck gunner, and never
    // found the pilot. The cue must say: you ARE the pilot, LMB fires, RMB is
    // the broadside camera — and there is no second seat to hunt for.
    hints.setSeatHint(HudControlHints.seatHintFromContext(ac47));

    const text = seatText(host);
    expect(text).toContain('PILOT');
    expect(text).toContain('LMB: fire');
    expect(text.toLowerCase()).toContain('broadside');
    expect(text).not.toContain('F: swap seat');
  });

  it('shows a single-seat transport helicopter pilot no fire or swap cue', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(transportHeli));
    // Unarmed transport with no door gun: nothing to surface.
    expect(seatText(host)).toBe('');
  });

  it('clears the seat block when the player leaves the vehicle (null context)', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(tankGunner));
    expect(seatText(host)).toContain('GUNNER');

    hints.setSeatHint(HudControlHints.seatHintFromContext(null));
    expect(seatText(host)).toBe('');
  });
});
