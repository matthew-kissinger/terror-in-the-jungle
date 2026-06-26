/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it } from 'vitest';
import { aircraftArtMode, isAircraftArtLegacy, pickAircraftArt } from './aircraftArt';

function clearOverride(): void {
  delete (window as unknown as { __aircraftArt?: string }).__aircraftArt;
  window.history.replaceState({}, '', '/');
}

describe('aircraftArt kill-switch', () => {
  afterEach(clearOverride);

  it('defaults to Kiln art with no override', () => {
    clearOverride();
    expect(aircraftArtMode()).toBe('kiln');
    expect(isAircraftArtLegacy()).toBe(false);
    expect(pickAircraftArt('kiln-key', 'legacy-key')).toBe('kiln-key');
  });

  it('switches to legacy art when window.__aircraftArt is set', () => {
    (window as unknown as { __aircraftArt?: string }).__aircraftArt = 'legacy';
    expect(aircraftArtMode()).toBe('legacy');
    expect(isAircraftArtLegacy()).toBe(true);
    expect(pickAircraftArt('kiln-key', 'legacy-key')).toBe('legacy-key');
  });

  it('honors an explicit window.__aircraftArt = "kiln" override', () => {
    (window as unknown as { __aircraftArt?: string }).__aircraftArt = 'kiln';
    expect(aircraftArtMode()).toBe('kiln');
  });

  it('switches to legacy art via the ?aircraftArt=legacy URL param', () => {
    window.history.replaceState({}, '', '/?aircraftArt=legacy');
    expect(aircraftArtMode()).toBe('legacy');
    expect(pickAircraftArt('kiln-key', 'legacy-key')).toBe('legacy-key');
  });

  it('ignores an unrelated URL param value', () => {
    window.history.replaceState({}, '', '/?aircraftArt=potato');
    expect(aircraftArtMode()).toBe('kiln');
  });
});
