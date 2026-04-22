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
import { shouldPreserveDrawingBuffer } from './GameRenderer';

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
