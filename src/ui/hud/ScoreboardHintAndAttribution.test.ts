/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for HUD attribution placement + scoreboard affordance:
 *   1. The AGPL attribution notice must NOT sit in the bottom-left corner,
 *      where it overlapped the health pill. It is now bottom-center, still
 *      readable and still pointer-events:none.
 *   2. The scoreboard's "Hold Tab" affordance was consolidated into the
 *      right-rail control-hints legend (HudControlHints, "TAB · Scoreboard").
 *      ScoreboardPanel no longer mounts a separate floating discoverability
 *      hint, so it can never collide with the control-hints panel.
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

describe('scoreboard affordance (consolidated, no floating hint)', () => {
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

  it('does NOT mount a standalone discoverability hint (it lives in the control-hints legend now)', () => {
    const panel = makePanel();
    panel.mount(document.body);
    // The old floating "Hold Tab: scoreboard" overlay is gone — the affordance
    // is consolidated into the right-rail control-hints legend so it can never
    // collide with that panel.
    expect(document.getElementById('scoreboard-discoverability-hint')).toBeNull();
    panel.dispose();
  });

  it('toggles cleanly without a floating hint', () => {
    const panel = makePanel();
    panel.mount(document.body);
    expect(() => {
      panel.toggle(true);
      panel.toggle(false);
    }).not.toThrow();
    expect(document.getElementById('scoreboard-discoverability-hint')).toBeNull();
    panel.dispose();
  });
});
