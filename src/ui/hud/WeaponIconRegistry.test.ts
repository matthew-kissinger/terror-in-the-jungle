/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { afterEach, describe, it, expect, vi } from 'vitest';
import { getWeaponIconElement, getWeaponIconData, preloadIcons } from '../icons/IconRegistry';

/**
 * Behavior-focused tests for the weapon icon registry.
 *
 * Intentionally does NOT assert on exact icon file names, exact labels, or a
 * per-weapon enumeration — those are catalog data that will churn as weapons
 * are rebalanced/renamed. We assert instead on the registry's contract:
 * known types resolve to an image, unknown types fall back safely, and
 * different types don't collide.
 */
describe('weapon icon registry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a label and icon identifier for known weapon types', () => {
    const rifle = getWeaponIconData('rifle');
    expect(rifle.label.length).toBeGreaterThan(0);
    expect(rifle.iconFile.length).toBeGreaterThan(0);
  });

  it('returns a fallback entry for unknown / empty types', () => {
    expect(getWeaponIconData('not-a-real-weapon').label).toBe('--');
    expect(getWeaponIconData('').label).toBe('--');
  });

  it('returns an <img> element for known weapons', () => {
    const element = getWeaponIconElement('rifle') as HTMLImageElement;
    expect(element.tagName).toBe('IMG');
    expect(element.src.length).toBeGreaterThan(0);
    expect(element.alt).toBe('rifle');
  });

  it('returns a text fallback span for unknown weapons', () => {
    const element = getWeaponIconElement('banana');
    expect(element.tagName).toBe('SPAN');
    expect(element.textContent).toBe('--');
  });

  it('returns different icons for different weapon types', () => {
    const a = getWeaponIconElement('rifle') as HTMLImageElement;
    const b = getWeaponIconElement('shotgun') as HTMLImageElement;
    expect(a.src).not.toBe(b.src);
  });

  it('returns a fresh DOM element on each call (no shared references)', () => {
    const el1 = getWeaponIconElement('rifle');
    const el2 = getWeaponIconElement('rifle');
    expect(el1).not.toBe(el2);
  });

  it('retains preloaded icon images and skips duplicate preload requests', () => {
    const createdImages: Array<{ src: string }> = [];
    vi.stubGlobal('Image', class {
      private _src = '';
      constructor() {
        createdImages.push(this);
      }
      get src() { return this._src; }
      set src(value: string) { this._src = value; }
    });

    preloadIcons(['icon-kill-arrow', 'icon-kill-arrow', 'map-zone-flag']);

    expect(createdImages).toHaveLength(2);
    expect(createdImages[0].src).toContain('icon-kill-arrow.png');
    expect(createdImages[1].src).toContain('map-zone-flag.png');
  });
});
