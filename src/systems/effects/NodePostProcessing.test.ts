/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_POST_ENABLED_DESKTOP,
  isPostEligibleRenderer,
  resolvePostEnabled,
  resolvePostLut,
} from './NodePostProcessing';
import { DEFAULT_COLOR_GRADE_LUT } from './post/ColorGradePass';

type WindowOverride = Window & typeof globalThis & { __postProcessing?: string };

function setOverride(value: string | undefined): void {
  (window as WindowOverride).__postProcessing = value;
}

/**
 * Behavior contract for the post-stack kill-switch + LUT resolution.
 *
 * This is the load-bearing gate the orchestrator flips: with no override the
 * stack follows DEFAULT_POST_ENABLED_DESKTOP (currently OFF) and is mobile-off;
 * an explicit `window.__postProcessing` override force-enables/disables and
 * selects the LUT. We assert the OFF/mobile-off/override behaviors as the gate
 * the campaign relies on — not the constant's value (it flips on proof).
 */
describe('post-processing kill-switch resolution', () => {
  afterEach(() => {
    setOverride(undefined);
  });

  it('follows the desktop default when no override is set (currently off)', () => {
    setOverride(undefined);
    expect(resolvePostEnabled(false)).toBe(DEFAULT_POST_ENABLED_DESKTOP);
  });

  it('stays off on mobile when there is no explicit enable override', () => {
    setOverride(undefined);
    expect(resolvePostEnabled(true)).toBe(false);
  });

  it('force-disables via an off-token override even on desktop', () => {
    for (const token of ['off', '0', 'false', 'none']) {
      setOverride(token);
      expect(resolvePostEnabled(false)).toBe(false);
    }
  });

  it('force-enables via a LUT-name or on-token override, even on mobile', () => {
    for (const token of ['golden', 'neutral', 'overcast', 'on', '1', 'true']) {
      setOverride(token);
      expect(resolvePostEnabled(true)).toBe(true);
    }
  });

  it('resolves the LUT from an override and falls back to the default', () => {
    setOverride('overcast');
    expect(resolvePostLut()).toBe('overcast');
    setOverride('off');
    // An off-token is not a LUT name → default LUT.
    expect(resolvePostLut()).toBe(DEFAULT_COLOR_GRADE_LUT);
    setOverride(undefined);
    expect(resolvePostLut()).toBe(DEFAULT_COLOR_GRADE_LUT);
  });

  it('only treats the unified WebGPU renderer (or its WebGL2 fallback) as eligible', () => {
    expect(isPostEligibleRenderer({ isWebGPURenderer: true } as never)).toBe(true);
    expect(isPostEligibleRenderer({ isWebGPURenderer: false } as never)).toBe(false);
    expect(isPostEligibleRenderer({} as never)).toBe(false);
  });
});
