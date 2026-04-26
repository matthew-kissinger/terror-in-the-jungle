/**
 * @vitest-environment jsdom
 *
 * Behavior tests for the gun-range URL guard. The scene is a dev-only hitbox
 * validation route, so the guard should only accept its explicit mode value.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { isGunRangeMode } from './gunRangeMode';

const originalHref = window.location.href;

function setSearch(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

afterEach(() => {
  window.history.replaceState(null, '', originalHref);
});

describe('isGunRangeMode', () => {
  it('returns true when ?mode=gun-range is present', () => {
    setSearch('?mode=gun-range');
    expect(isGunRangeMode()).toBe(true);
  });

  it('returns false when no mode param is present', () => {
    setSearch('');
    expect(isGunRangeMode()).toBe(false);
  });

  it('returns false for unrelated mode values', () => {
    setSearch('?mode=terrain-sandbox');
    expect(isGunRangeMode()).toBe(false);
  });
});
