/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for two playtest HUD truths (cycle-2026-06-28):
 *   1. The AGPL attribution notice must NOT sit in the bottom-left corner,
 *      where it overlapped the health pill. It is now bottom-center, still
 *      readable and still pointer-events:none.
 *   2. The scoreboard is hold-Tab, not a toggle, so it read as broken. A tiny
 *      "Hold Tab: scoreboard" discoverability hint now renders and steps aside
 *      while the board is open.
 *
 * These assert observable DOM geometry / presence, not the score-tracking
 * internals (PlayerStatsTracker is correct and tested elsewhere).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPersistentAttribution } from '../AttributionNotice';
import { ScoreboardPanel } from './ScoreboardPanel';
import type { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import type { CombatantSystem } from '../../systems/combat/CombatantSystem';

// The "Hold Tab" hint is a keyboard affordance, so the panel checks
// isTouchDevice(). jsdom presents as a touch device here, so pin the boundary
// to a keyboard device for these tests (mocking one dependency boundary, not
// the score-tracking internals).
vi.mock('../../utils/DeviceDetector', () => ({
  isTouchDevice: () => false,
}));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('attribution notice placement', () => {
  it('does not anchor to the bottom-left corner (where the health pill lives)', () => {
    mountPersistentAttribution();
    const el = document.getElementById('app-attribution-credit');
    expect(el).not.toBeNull();

    // The health pill occupies the bottom-left HUD slot. The notice must not
    // share those pixels: it should be horizontally centered, not left-pinned.
    expect(el!.style.left).not.toBe('6px');
    expect(el!.style.left).toBe('50%');
    expect(el!.style.transform).toContain('translateX(-50%)');
  });

  it('stays a passive, readable overlay (never steals input)', () => {
    mountPersistentAttribution();
    const el = document.getElementById('app-attribution-credit');
    expect(el!.style.pointerEvents).toBe('none');
    // Still shows the copyright + source line required by the AGPL notice.
    expect(el!.textContent).toContain('Matthew Kissinger');
    expect(el!.textContent).toContain('github.com/matthew-kissinger/terror-in-the-jungle');
  });
});

describe('scoreboard discoverability hint', () => {
  function makePanel(): ScoreboardPanel {
    const statsTracker = {
      getStats: () => ({ kills: 0, assists: 0, deaths: 0, zonesCaptured: 0 }),
    } as unknown as PlayerStatsTracker;
    const combatantSystem = {
      getAllCombatants: () => [],
      getTeamKillStats: () => ({ usKills: 0, usDeaths: 0, opforKills: 0, opforDeaths: 0 }),
    } as unknown as CombatantSystem;
    return new ScoreboardPanel(statsTracker, combatantSystem);
  }

  it('renders a "Hold Tab" hint when the panel mounts on a keyboard device', () => {
    const panel = makePanel();
    panel.mount(document.body);

    const hint = document.getElementById('scoreboard-discoverability-hint');
    expect(hint).not.toBeNull();
    expect(hint!.textContent?.toLowerCase()).toContain('tab');
    expect(hint!.textContent?.toLowerCase()).toContain('scoreboard');
    // Passive nudge: it must never intercept gameplay input.
    expect(hint!.style.pointerEvents).toBe('none');
    // Visible while the board is closed.
    expect(hint!.style.display).not.toBe('none');

    panel.dispose();
  });

  it('hides the hint while the scoreboard is open and restores it when closed', () => {
    const panel = makePanel();
    panel.mount(document.body);
    const hint = document.getElementById('scoreboard-discoverability-hint')!;

    panel.toggle(true);
    expect(hint.style.display).toBe('none');

    panel.toggle(false);
    expect(hint.style.display).not.toBe('none');

    panel.dispose();
  });

  it('removes the hint from the DOM when the panel is disposed', () => {
    const panel = makePanel();
    panel.mount(document.body);
    expect(document.getElementById('scoreboard-discoverability-hint')).not.toBeNull();

    panel.dispose();
    expect(document.getElementById('scoreboard-discoverability-hint')).toBeNull();
  });
});
