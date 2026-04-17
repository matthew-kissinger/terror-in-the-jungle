/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { KillFeed } from './KillFeed';
import { Faction } from '../../systems/combat/types';

vi.mock('../../utils/Logger');

/**
 * Behavior-focused tests for KillFeed.
 * Covers: entries appear, kill pairs render, order is preserved, MAX_ENTRIES cap,
 * fade + expiration lifecycle, disposal.
 * Intentionally does NOT assert on: specific weapon icon file paths, faction color
 * RGB values, per-class-name styling, or exact fade timing constants — those are
 * tuning/implementation details.
 */
describe('KillFeed', () => {
  let killFeed: KillFeed;
  let parent: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    killFeed = new KillFeed();
    parent = document.createElement('div');
    document.body.appendChild(parent);
    killFeed.attachToDOM(parent);
  });

  afterEach(() => {
    killFeed.dispose();
    if (parent.parentNode) parent.parentNode.removeChild(parent);
    vi.useRealTimers();
  });

  function entryCount(): number {
    return parent.querySelector('.container')?.children.length ?? 0;
  }

  function feedText(): string {
    return parent.querySelector('.container')?.textContent ?? '';
  }

  it('starts empty', () => {
    expect(entryCount()).toBe(0);
  });

  it('shows killer and victim names when a kill is added', () => {
    killFeed.addKill('Killer', Faction.US, 'Victim', Faction.NVA);

    expect(entryCount()).toBe(1);
    expect(feedText()).toContain('Killer');
    expect(feedText()).toContain('Victim');
  });

  it('preserves order: oldest first, newest last', () => {
    killFeed.addKill('First', Faction.US, 'V1', Faction.NVA);
    vi.advanceTimersByTime(100);
    killFeed.addKill('Second', Faction.US, 'V2', Faction.NVA);
    vi.advanceTimersByTime(100);
    killFeed.addKill('Third', Faction.US, 'V3', Faction.NVA);

    const entries = Array.from(
      parent.querySelector('.container')?.children ?? []
    );
    expect(entries).toHaveLength(3);
    expect(entries[0].textContent).toContain('First');
    expect(entries[1].textContent).toContain('Second');
    expect(entries[2].textContent).toContain('Third');
  });

  it('caps concurrent entries at the feed limit and drops the oldest', () => {
    for (let i = 0; i < 10; i++) {
      killFeed.addKill(`Killer${i}`, Faction.US, `Victim${i}`, Faction.NVA);
      vi.advanceTimersByTime(10);
    }

    expect(entryCount()).toBeLessThan(10);
    expect(feedText()).not.toContain('Killer0');
    expect(feedText()).toContain('Killer9');
  });

  it('renders a headshot indicator when isHeadshot is true', () => {
    killFeed.addKill('K', Faction.US, 'V', Faction.NVA, true);
    const hsImg = parent.querySelector('.container img[alt="Headshot"]');
    expect(hsImg).not.toBeNull();
  });

  it('does not render a headshot indicator on normal kills', () => {
    killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false);
    const hsImg = parent.querySelector('.container img[alt="Headshot"]');
    expect(hsImg).toBeNull();
  });

  it('renders a weapon icon element for known weapons', () => {
    killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'rifle');
    const weaponImg = parent.querySelector('.container img[alt="rifle"]');
    expect(weaponImg).not.toBeNull();
  });

  it('falls back to a placeholder for unknown weapon types', () => {
    killFeed.addKill('K', Faction.US, 'V', Faction.NVA, false, 'unknown');
    expect(feedText()).toContain('--');
  });

  it('entry opacity stays full shortly after a kill and decays later', () => {
    killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
    const entry = parent.querySelector('.container')?.children[0] as HTMLElement;

    killFeed.update(0);
    const initialOpacity = parseFloat(entry.style.opacity || '1');
    expect(initialOpacity).toBe(1);

    // Advance well past fade start but before entry removal
    vi.advanceTimersByTime(4000);
    killFeed.update(0);
    const fadedOpacity = parseFloat(entry.style.opacity || '1');
    expect(fadedOpacity).toBeLessThan(initialOpacity);
    expect(fadedOpacity).toBeGreaterThan(0);
  });

  it('removes entries after they expire', () => {
    killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
    expect(entryCount()).toBe(1);

    // Run well past any reasonable lifetime + slide-out animation
    vi.advanceTimersByTime(10_000);
    killFeed.update(0);
    vi.advanceTimersByTime(1_000);

    expect(entryCount()).toBe(0);
  });

  it('keeps newer entries while older ones expire', () => {
    killFeed.addKill('Old', Faction.US, 'V1', Faction.NVA);
    vi.advanceTimersByTime(3000);
    killFeed.addKill('New', Faction.US, 'V2', Faction.NVA);

    vi.advanceTimersByTime(2500);
    killFeed.update(0);
    vi.advanceTimersByTime(500);

    expect(feedText()).toContain('New');
    expect(feedText()).not.toContain('Old');
  });

  it('assigns a unique identifier to each entry', () => {
    killFeed.addKill('K1', Faction.US, 'V1', Faction.NVA);
    killFeed.addKill('K2', Faction.US, 'V2', Faction.NVA);
    killFeed.addKill('K3', Faction.US, 'V3', Faction.NVA);

    const ids = Array.from(parent.querySelector('.container')?.children ?? [])
      .map((child) => child.getAttribute('data-entry-id'));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not recreate the DOM element when re-rendering an entry', () => {
    killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
    const original = parent.querySelector('.container')?.children[0];

    vi.advanceTimersByTime(3500);
    killFeed.update(0);

    const after = parent.querySelector('.container')?.children[0];
    expect(after).toBe(original);
  });

  it('handles empty names without crashing', () => {
    expect(() => {
      killFeed.addKill('', Faction.US, 'Victim', Faction.NVA);
      killFeed.addKill('Killer', Faction.US, '', Faction.NVA);
    }).not.toThrow();
    expect(entryCount()).toBe(2);
  });

  it('dispose clears the feed from the DOM', () => {
    killFeed.addKill('K', Faction.US, 'V', Faction.NVA);
    killFeed.dispose();
    expect(parent.querySelector('.container')).toBeNull();
  });
});
