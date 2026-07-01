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

  it('shows the on-foot binds by default (non-obvious verbs only)', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    const text = legendText(host);
    // The on-foot legend is trimmed to this game's non-obvious verbs; standard
    // FPS controls (WASD/Move, sprint, jump, reload, weapon-swap) are omitted.
    expect(text).not.toContain('Move');
    expect(text).toContain('Board vehicle');
    // The dominant finding: players could not tell the radio / squad menu exist.
    expect(text).toContain('Air support radio');
    expect(text).toContain('Squad commands');
    expect(text).toContain('Scoreboard');
    hints.dispose();
  });

  it('lists ground-vehicle binds — including seat swap and armed fire — in a ground vehicle', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    hints.setContext('groundVehicle');

    const rows = legendRows(host).join(' | ');
    expect(rows).toContain('Throttle');
    // Exit and seat-swap are surfaced as distinct binds: E exits, F swaps —
    // a conflated single bind hid the dismount on a two-seat tank.
    expect(rows).toContain('Exit vehicle');
    expect(rows).toContain('Swap seat');
    expect(rows.toLowerCase()).toContain('fire');
    // On-foot-only binds should not bleed into the vehicle legend.
    expect(legendText(host)).not.toContain('Board vehicle');
    hints.dispose();
  });

  it('lists airborne-fire and exit binds in a helicopter', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    hints.setContext('helicopter');

    const text = legendText(host);
    // The finding the owner reported: he could not tell that aircraft fire.
    expect(text).toContain('Fire guns');
    expect(text).toContain('Throttle / Altitude');
    expect(text).toContain('Exit aircraft');
    hints.dispose();
  });

  it('surfaces the helicopter-only altitude lock and weapon-cycle keys', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    hints.setContext('helicopter');

    const rows = legendRows(host).join(' | ');
    // Altitude lock (H) and the gun/rocket cycle keys (1/2) were invisible
    // anywhere in the hint UI before — both belong to the rotary craft only.
    expect(rows).toContain('Altitude lock');
    expect(rows.toLowerCase()).toContain('rockets');
    // Space auto-hovers a rotary craft (it does not "flight assist").
    expect(rows).toContain('Auto-hover');
    // Deploy-squad `G` never fires in the plane; it is not a helicopter bind row.
    expect(rows).not.toContain('Deploy squad');
  });

  it('shows fixed-wing flight-assist Space and no dead squad-deploy or altitude-lock rows', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    hints.setContext('fixedWing');

    const rows = legendRows(host).join(' | ');
    expect(rows).toContain('Fire guns');
    expect(rows).toContain('Exit aircraft');
    // A plane arms flight assist on Space (not auto-hover), has no altitude lock,
    // and the `G` deploy-squad key does nothing on it — none of those show.
    expect(rows).toContain('Flight assist');
    expect(rows).not.toContain('Auto-hover');
    expect(rows).not.toContain('Altitude lock');
    expect(rows).not.toContain('Deploy squad');
    hints.dispose();
  });

  it('swaps the legend when context changes back and forth', () => {
    const hints = new HudControlHints();
    hints.mount(host);

    hints.setContext('helicopter');
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

    // Backslash, not KeyH: KeyH is the helicopter altitude-lock bind, so the
    // legend toggle stays clear of it.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash' }));
    expect(hints.isShown()).toBe(false);
    hints.dispose();
  });

  it('does not toggle on KeyH — that key is the helicopter altitude lock', () => {
    const hints = new HudControlHints();
    hints.mount(host);
    expect(hints.isShown()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }));
    // The legend must ignore KeyH so it never fights the altitude-lock bind.
    expect(hints.isShown()).toBe(true);
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
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash' }));
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

describe('HudControlHints — per-airframe legend gating', () => {
  let host: HTMLDivElement;
  let hints: HudControlHints;

  // A broadside-capable plane (AC-47) reports a viewToggle; a plain fighter/attack
  // plane (A-1 / F-4 / armed door path) does not.
  const ac47: VehicleUIContext = {
    kind: 'plane', role: 'pilot', hudVariant: 'flight', weaponCount: 1,
    capabilities: caps({ canFirePrimary: true }),
    viewToggle: { inactiveLabel: 'SIDE', activeLabel: 'CHASE', active: false },
  };
  const strikePlane: VehicleUIContext = {
    kind: 'plane', role: 'pilot', hudVariant: 'flight', weaponCount: 1,
    capabilities: caps({ canFirePrimary: true }),
  };

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    hints = new HudControlHints();
    hints.mount(host);
    hints.setContext('fixedWing');
  });

  afterEach(() => {
    hints.dispose();
    host.remove();
    document.querySelectorAll('.hud-control-hints').forEach((el) => el.remove());
  });

  it('shows the V side/chase-view row for the AC-47 broadside gunship', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(ac47));
    const rows = legendRows(host).join(' | ');
    expect(rows).toContain('Side / chase view');
  });

  it('hides the V view row for a plane with no broadside view', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(strikePlane));
    const rows = legendRows(host).join(' | ');
    // The key does nothing on this airframe, so no dead hint.
    expect(rows).not.toContain('Side / chase view');
  });

  it('drops the V row again when leaving the AC-47 for a non-broadside plane', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(ac47));
    expect(legendRows(host).join(' | ')).toContain('Side / chase view');

    hints.setSeatHint(HudControlHints.seatHintFromContext(strikePlane));
    expect(legendRows(host).join(' | ')).not.toContain('Side / chase view');
  });

  it('never shows the V row in the helicopter legend even with a stale broadside hint', () => {
    hints.setSeatHint(HudControlHints.seatHintFromContext(ac47));
    hints.setContext('helicopter');
    // Broadside view is a fixed-wing concept; the rotary legend never carries it.
    expect(legendRows(host).join(' | ')).not.toContain('Side / chase view');
  });
});

describe('HudControlHints.actorToContext', () => {
  it('maps helicopter and plane to distinct flight buckets', () => {
    expect(HudControlHints.actorToContext('helicopter')).toBe('helicopter');
    expect(HudControlHints.actorToContext('plane')).toBe('fixedWing');
  });

  it('maps ground actors and infantry as before', () => {
    expect(HudControlHints.actorToContext('car')).toBe('groundVehicle');
    expect(HudControlHints.actorToContext('turret')).toBe('groundVehicle');
    expect(HudControlHints.actorToContext('infantry')).toBe('foot');
  });
});
