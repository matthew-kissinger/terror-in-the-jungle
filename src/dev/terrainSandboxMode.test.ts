/**
 * @vitest-environment jsdom
 *
 * Behavior tests for the terrain-sandbox URL guard. The guard is a
 * read-only classifier — these tests assert the allowed URL triggers it
 * and unrelated URLs do not. (See docs/TESTING.md.)
 */

import { afterEach, describe, expect, it } from 'vitest';
import { isTerrainSandboxMode } from './terrainSandboxMode';

const originalHref = window.location.href;

function setSearch(search: string): void {
  // jsdom allows href assignment to mutate the location in-place.
  window.history.replaceState(null, '', `/${search}`);
}

afterEach(() => {
  window.history.replaceState(null, '', originalHref);
});

describe('isTerrainSandboxMode', () => {
  it('returns true when ?mode=terrain-sandbox is present', () => {
    setSearch('?mode=terrain-sandbox');
    expect(isTerrainSandboxMode()).toBe(true);
  });

  it('returns false when no mode param is present', () => {
    setSearch('');
    expect(isTerrainSandboxMode()).toBe(false);
  });

  it('returns false for unrelated mode values', () => {
    setSearch('?mode=flight-test');
    expect(isTerrainSandboxMode()).toBe(false);
  });
});
