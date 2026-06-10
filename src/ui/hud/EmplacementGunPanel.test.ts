/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmplacementGunPanel } from './EmplacementGunPanel';

// CSS-module proxy: each class lookup resolves to its own name, so a
// `classList.contains('countLow')` assertion reads the OBSERVABLE state.
vi.mock('./EmplacementGunPanel.module.css', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

describe('EmplacementGunPanel', () => {
  let panel: EmplacementGunPanel;
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    panel = new EmplacementGunPanel();
    panel.mount(parent);
  });

  afterEach(() => {
    panel.dispose();
    document.body.removeChild(parent);
  });

  const countEl = () =>
    panel.element.querySelector('[data-ref="count"]') as HTMLElement;
  const beltFill = () =>
    panel.element.querySelector('[data-ref="beltFill"]') as HTMLElement;

  describe('belt readout', () => {
    it('shows the live belt count, zero-padded', () => {
      panel.setBelt(250, 250);
      expect(countEl().textContent).toBe('250');

      panel.setBelt(8, 250);
      expect(countEl().textContent).toBe('008');
    });

    it('reads as full (not LOW) on a healthy belt', () => {
      panel.setBelt(250, 250);
      expect(countEl().classList.contains('countLow')).toBe(false);
      expect(countEl().classList.contains('countOk')).toBe(true);
    });

    it('reads as LOW once the belt drops under the threshold', () => {
      panel.setBelt(250, 250);
      expect(countEl().classList.contains('countLow')).toBe(false);

      // Draw the belt down past the LOW line.
      panel.setBelt(12, 250);
      expect(countEl().classList.contains('countLow')).toBe(true);
      expect(countEl().classList.contains('countOk')).toBe(false);
    });

    it('drains the belt bar as the box empties', () => {
      panel.setBelt(250, 250);
      expect(beltFill().style.width).toBe('100%');

      panel.setBelt(125, 250);
      expect(beltFill().style.width).toBe('50%');

      panel.setBelt(0, 250);
      expect(beltFill().style.width).toBe('0%');
    });
  });

  describe('traverse-stop cue', () => {
    function litStops(): string[] {
      const refs = ['stopUp', 'stopDown', 'stopLeft', 'stopRight'];
      return refs.filter((ref) => {
        const el = panel.element.querySelector(`[data-ref="${ref}"]`) as HTMLElement;
        return el.classList.contains('stopActive');
      });
    }

    it('lights no stop by default', () => {
      expect(litStops()).toEqual([]);
      expect(panel.getTraverseStop()).toBeNull();
    });

    it('lights exactly the stop the barrel is pinned against, and clears it', () => {
      panel.setTraverseStop('up');
      expect(litStops()).toEqual(['stopUp']);
      expect(panel.getTraverseStop()).toBe('up');

      panel.setTraverseStop('right');
      expect(litStops()).toEqual(['stopRight']);

      panel.setTraverseStop(null);
      expect(litStops()).toEqual([]);
    });
  });
});
