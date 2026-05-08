/**
 * @vitest-environment jsdom
 *
 * Behavior tests for the `preserveDrawingBuffer` gate. Per docs/TESTING.md,
 * these assert observable call-time outcomes of the helper across the three
 * meaningful environments (DEV, retail + opt-in URL, retail default) — not
 * the internal structure of the `WebGLRenderer` constructor options.
 *
 * Why this matters: the flag is required by F9 playtest capture
 * (`PlaytestCaptureManager` calls `canvas.toBlob()`), but also retains a
 * back-buffer that cost ~13 MB heap residual in retail R3. The helper is
 * the single policy point deciding whether we pay that cost.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_FOG_COLOR, shouldPreserveDrawingBuffer } from './GameRenderer';

const originalHref = window.location.href;

function setSearch(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  // Default to retail (DEV=false). Individual tests opt into DEV.
  vi.stubEnv('DEV', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', originalHref);
});

describe('shouldPreserveDrawingBuffer', () => {
  it('preserves the buffer in dev builds so F9 capture works out of the box', () => {
    vi.stubEnv('DEV', 'true');
    setSearch('');
    expect(shouldPreserveDrawingBuffer()).toBe(true);
  });

  it('preserves the buffer on retail when the user opts in with ?capture=1', () => {
    setSearch('?capture=1');
    expect(shouldPreserveDrawingBuffer()).toBe(true);
  });

  it('does not preserve the buffer on retail with no capture param (default: retail players skip the heap tax)', () => {
    setSearch('');
    expect(shouldPreserveDrawingBuffer()).toBe(false);
  });

  it('honors ?capture=0 as an explicit opt-out', () => {
    setSearch('?capture=0');
    expect(shouldPreserveDrawingBuffer()).toBe(false);
  });
});

// Clear-colour guardrail (terrain-cdlod-seam): the scene background must
// stay a neutral horizon grey, never pure white. White amplifies any
// sub-pixel CDLOD seam crack at chunk borders into visible streaks. The
// real `HosekWilkieSkyBackend` dome paints over this each frame, so the
// constant only matters for the pre-atmosphere first frame and any
// chunk-boundary slivers that bleed through the dome — but those are the
// exact cases that read as white when the constant ever drifts.
describe('INITIAL_FOG_COLOR', () => {
  it('is not pure white (would amplify CDLOD seam cracks)', () => {
    expect(INITIAL_FOG_COLOR).not.toBe(0xffffff);
  });

  it('is a neutral mid-tone (each channel between 0x40 and 0xc0)', () => {
    const r = (INITIAL_FOG_COLOR >> 16) & 0xff;
    const g = (INITIAL_FOG_COLOR >> 8) & 0xff;
    const b = INITIAL_FOG_COLOR & 0xff;
    for (const c of [r, g, b]) {
      expect(c).toBeGreaterThanOrEqual(0x40);
      expect(c).toBeLessThanOrEqual(0xc0);
    }
  });
});
