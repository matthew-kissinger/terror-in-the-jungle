/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HudSituationReadout } from './HudSituationReadout';
import { Alliance, Faction } from '../../systems/combat/types';
import { ZoneState, type CaptureZone } from '../../systems/world/ZoneManager';

/**
 * Build a minimal capturable zone for a snapshot read. Only the fields the
 * situation read consumes (name, position, owner, state) are meaningful; the
 * rest are filled with inert defaults so the test reads as a behavior fixture,
 * not a mirror of CaptureZone's full shape.
 */
function zone(overrides: Partial<CaptureZone> & { name: string; x: number; z: number }): CaptureZone {
  const { name, x, z, ...rest } = overrides;
  return {
    id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    position: new THREE.Vector3(x, 0, z),
    radius: 30,
    height: 0,
    owner: null,
    state: ZoneState.NEUTRAL,
    captureProgress: 0,
    captureSpeed: 1,
    currentFlagHeight: 0,
    isHomeBase: false,
    ticketBleedRate: 1,
    ...rest,
  } as CaptureZone;
}

/** Read the full rendered text of the readout panel (or '' when hidden). */
function readoutText(host: HTMLElement): string {
  const el = host.querySelector('.hud-situation-readout') as HTMLElement | null;
  if (!el || el.style.display === 'none') return '';
  return el.textContent ?? '';
}

function postureText(host: HTMLElement): string {
  return host.querySelector('.hud-situation-readout__posture')?.textContent ?? '';
}

function objectiveText(host: HTMLElement): string {
  return host.querySelector('.hud-situation-readout__objective')?.textContent ?? '';
}

function nudgeEl(host: HTMLElement): HTMLElement | null {
  return host.querySelector('.hud-situation-readout__nudge') as HTMLElement | null;
}

describe('HudSituationReadout', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    document.querySelectorAll('.hud-situation-readout').forEach((el) => el.remove());
  });

  it('renders war posture, the nearest contested objective, and a direction nudge', () => {
    const readout = new HudSituationReadout();
    readout.mount(host);

    // Player at origin. HUE (far, contested) vs A SHAU (near, contested) — the
    // readout should surface the NEAR contested one and point the player at it.
    const snapshot = HudSituationReadout.buildSnapshot({
      capturableZones: [
        zone({ name: 'HUE', x: 0, z: -800, state: ZoneState.CONTESTED }),
        zone({ name: 'A SHAU', x: 100, z: 0, state: ZoneState.CONTESTED, owner: Faction.NVA }),
      ],
      friendlyTickets: 250,
      hostileTickets: 180,
      playerAlliance: Alliance.BLUFOR,
      playerPosition: { x: 0, z: 0 },
    });
    readout.setSituation(snapshot);

    // Posture: the player's side leads on tickets, and the score is shown.
    expect(postureText(host)).toContain('WINNING');
    expect(postureText(host)).toContain('250');
    expect(postureText(host)).toContain('180');

    // Objective: the NEAR contested zone, flagged as contested.
    expect(objectiveText(host)).toContain('A SHAU');
    expect(objectiveText(host).toLowerCase()).toContain('contested');

    // Direction nudge: A SHAU is due East of the player (+x), with a distance.
    const nudge = nudgeEl(host)?.textContent ?? '';
    expect(nudge).toContain('E');
    expect(nudge).toContain('100m');
  });

  it('reads LOSING when the hostile side leads on tickets', () => {
    const readout = new HudSituationReadout();
    readout.mount(host);

    readout.setSituation(HudSituationReadout.buildSnapshot({
      capturableZones: [zone({ name: 'A SHAU', x: 0, z: 50, state: ZoneState.CONTESTED })],
      friendlyTickets: 90,
      hostileTickets: 220,
      playerAlliance: Alliance.BLUFOR,
      playerPosition: { x: 0, z: 0 },
    }));

    expect(postureText(host)).toContain('LOSING');
  });

  it('falls back to the nearest unheld objective when nothing is contested', () => {
    const readout = new HudSituationReadout();
    readout.mount(host);

    // No contested zones: one is already held by the player's side (skipped),
    // the other is enemy-held and should be the nudge target.
    readout.setSituation(HudSituationReadout.buildSnapshot({
      capturableZones: [
        zone({ name: 'FIREBASE', x: 0, z: -20, owner: Faction.US, state: ZoneState.BLUFOR_CONTROLLED }),
        zone({ name: 'RIDGE', x: 0, z: -200, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED }),
      ],
      friendlyTickets: 200,
      hostileTickets: 200,
      playerAlliance: Alliance.BLUFOR,
      playerPosition: { x: 0, z: 0 },
    }));

    // The player's own firebase is not offered as a target; the enemy ridge is.
    expect(objectiveText(host)).toContain('RIDGE');
    expect(objectiveText(host).toLowerCase()).not.toContain('contested');
    // RIDGE is due North of the player (-z).
    expect(nudgeEl(host)?.textContent ?? '').toContain('N');
  });

  it('orients the nudge by world axes (+x East, -z North)', () => {
    const cases: Array<{ x: number; z: number; expected: string }> = [
      { x: 0, z: -100, expected: 'N' },
      { x: 100, z: 0, expected: 'E' },
      { x: 0, z: 100, expected: 'S' },
      { x: -100, z: 0, expected: 'W' },
      { x: 100, z: -100, expected: 'NE' },
    ];
    for (const { x, z, expected } of cases) {
      const snapshot = HudSituationReadout.buildSnapshot({
        capturableZones: [zone({ name: 'OBJ', x, z, state: ZoneState.CONTESTED })],
        friendlyTickets: 100,
        hostileTickets: 100,
        playerAlliance: Alliance.BLUFOR,
        playerPosition: { x: 0, z: 0 },
      });
      expect(snapshot?.objective?.heading).toBe(expected);
    }
  });

  it('reads tickets from the player side regardless of alliance', () => {
    // An OPFOR player should see NVA tickets as friendly and US as hostile.
    const snapshot = HudSituationReadout.buildSnapshot({
      capturableZones: [zone({ name: 'A SHAU', x: 0, z: 10, state: ZoneState.CONTESTED })],
      friendlyTickets: 300, // NVA, from the OPFOR player's perspective
      hostileTickets: 120,
      playerAlliance: Alliance.OPFOR,
      playerPosition: { x: 0, z: 0 },
    });
    expect(snapshot?.posture).toBe('winning');
    expect(snapshot?.friendlyTickets).toBe(300);
    expect(snapshot?.hostileTickets).toBe(120);
  });

  it('hides the readout when there are no capturable objectives', () => {
    const readout = new HudSituationReadout();
    readout.mount(host);

    readout.setSituation(HudSituationReadout.buildSnapshot({
      capturableZones: [],
      friendlyTickets: 100,
      hostileTickets: 100,
      playerAlliance: Alliance.BLUFOR,
      playerPosition: { x: 0, z: 0 },
    }));

    expect(readout.isShown()).toBe(false);
    expect(readoutText(host)).toBe('');
  });

  it('removes its DOM on dispose', () => {
    const readout = new HudSituationReadout();
    readout.mount(host);
    expect(host.querySelector('.hud-situation-readout')).not.toBeNull();

    readout.dispose();
    expect(host.querySelector('.hud-situation-readout')).toBeNull();
  });
});
