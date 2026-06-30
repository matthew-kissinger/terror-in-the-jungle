/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HudTaskCard } from './HudTaskCard';
import type { TaskCandidate } from '../../systems/missions/TaskingDirector';

// ---------------------------------------------------------------------------
// HudTaskCard is the presentation surface for the tasking director's single
// offer / active task. These behavior tests drive it the way the director does
// (setView + setHandlers + setRewardDispatcher) and assert OBSERVABLE outcomes:
// the offer is shown with accept/decline affordances, accepting fires the
// handler, an active task offers an abandon affordance, and a reward forwards to
// the dispatcher. We assert rendered text/behavior, not DOM structure snapshots
// or styling tuning.
// ---------------------------------------------------------------------------

function candidate(over: Partial<TaskCandidate> = {}): TaskCandidate {
  return {
    kind: 'capture',
    zoneId: 'a_shau',
    zoneName: 'A SHAU',
    band: 'med',
    x: 50,
    z: 0,
    ...over,
  };
}

function cardEl(host: HTMLElement): HTMLElement | null {
  return host.querySelector('.hud-task-card') as HTMLElement | null;
}

function isVisible(host: HTMLElement): boolean {
  const el = cardEl(host);
  return !!el && el.style.display !== 'none';
}

function bodyText(host: HTMLElement): string {
  return host.querySelector('.hud-task-card__body')?.textContent ?? '';
}

function buttons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('.hud-task-card__btn')) as HTMLButtonElement[];
}

describe('HudTaskCard', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    document.querySelectorAll('.hud-task-card').forEach((el) => el.remove());
  });

  it('is hidden until a non-idle view is applied', () => {
    const card = new HudTaskCard();
    card.mount(host);
    expect(isVisible(host)).toBe(false);

    card.setView({ state: 'offer', task: candidate() });
    expect(isVisible(host)).toBe(true);
    expect(bodyText(host)).toContain('A SHAU');
  });

  it('shows accept + decline affordances for an offer and fires the matching handler', () => {
    const card = new HudTaskCard();
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    card.setHandlers({ onAccept, onDecline, onClear: vi.fn() });
    card.mount(host);
    card.setView({ state: 'offer', task: candidate() });

    const visibleBtns = buttons(host).filter((b) => b.style.display !== 'none');
    expect(visibleBtns).toHaveLength(2);

    visibleBtns[0].click(); // accept
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();

    visibleBtns[1].click(); // decline
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('does not fire accept when there is no offer (active task ignores accept)', () => {
    const card = new HudTaskCard();
    const onAccept = vi.fn();
    const onClear = vi.fn();
    card.setHandlers({ onAccept, onDecline: vi.fn(), onClear });
    card.mount(host);
    card.setView({ state: 'active', task: candidate() });

    // The active state offers an abandon affordance that calls onClear.
    const visibleBtns = buttons(host).filter((b) => b.style.display !== 'none');
    visibleBtns.forEach((b) => b.click());
    expect(onAccept).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('forwards a reward to the dispatcher', () => {
    const card = new HudTaskCard();
    const dispatch = vi.fn();
    card.setRewardDispatcher(dispatch);

    card.dispatchReward('capture', 200, 1.5);
    expect(dispatch).toHaveBeenCalledWith('capture', 200, 1.5);
  });

  it('flashes a completion state then returns to whatever view is set', () => {
    vi.useFakeTimers();
    const card = new HudTaskCard();
    card.mount(host);
    card.setView({ state: 'active', task: candidate() });

    card.showCompleted(candidate());
    expect(cardEl(host)?.classList.contains('is-complete')).toBe(true);

    // The director clears the active task right after; the flash falls back to
    // idle (hidden) once the timer elapses.
    card.setView({ state: 'idle', task: null });
    vi.runAllTimers();
    expect(isVisible(host)).toBe(false);
    vi.useRealTimers();
  });

  it('removes its DOM on dispose', () => {
    const card = new HudTaskCard();
    card.mount(host);
    expect(cardEl(host)).not.toBeNull();
    card.dispose();
    expect(cardEl(host)).toBeNull();
  });

  it('mounts atop existing slot content as a sibling, not nested inside it', () => {
    // The host stands in for a grid slot that already holds the objectives panel.
    // The card must land as the slot's first child (above the panel), never as a
    // descendant of the panel — that nesting was the bug it overlapped.
    const objectivesPanel = document.createElement('div');
    objectivesPanel.className = 'objectives-panel';
    host.appendChild(objectivesPanel);

    const card = new HudTaskCard();
    card.mount(host);

    const el = cardEl(host);
    expect(el).not.toBeNull();
    expect(el?.parentElement).toBe(host);
    expect(objectivesPanel.contains(el)).toBe(false);
    expect(host.firstElementChild).toBe(el);
  });
});
