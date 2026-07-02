// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Token-source parity guard.
 *
 * The Field Journal palette + z-index scale exist in TWO hand-synced sources:
 *   - `src/ui/design/tokens.ts` (JS-imported by runtime-built HUD components)
 *   - `src/ui/engine/primitives.css` + `theme.css` (CSS custom properties)
 *
 * They are consistent today but nothing STOPS them drifting. This test parses
 * the CSS custom properties and asserts the values that are duplicated across
 * both sources still match `tokens.ts`, so a divergence fails CI. It does NOT
 * attempt codegen — it only guards the overlap.
 *
 * If you intentionally change a shared value, update BOTH sources and the
 * mapping table below in the same change.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';
import { colors, zIndex } from './tokens';

const here = dirname(fileURLToPath(import.meta.url));
const engineDir = resolve(here, '../engine');

/** Extract `--name: value;` custom-property declarations from a CSS string. */
function parseCssVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;}]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const name = m[1].trim();
    const value = m[2].trim();
    // First declaration wins (media-query overrides come later and are
    // intentionally not part of the base-token parity contract).
    if (!vars.has(name)) vars.set(name, value);
  }
  return vars;
}

const primitives = parseCssVars(
  readFileSync(resolve(engineDir, 'primitives.css'), 'utf8'),
);

describe('design token / CSS parity', () => {
  // Palette hex values duplicated between tokens.ts colors and primitives.css.
  const paletteParity: Array<[string, string]> = [
    ['--red', colors.opfor],
    ['--red', colors.accent],
    ['--red', colors.danger],
    ['--red-dk', colors.opforDark],
    ['--red-dk', colors.critical],
    ['--green', colors.us],
    ['--green', colors.success],
    ['--green-dk', colors.usDark],
    ['--warn', colors.warning],
    ['--warn', colors.headshot],
    ['--ink', colors.primary],
    ['--ink-soft', colors.secondary],
    ['--paper-lt', colors.textPrimary],
  ];

  it.each(paletteParity)(
    'primitives.css %s matches tokens.ts color %s',
    (cssVar, tokenValue) => {
      const cssValue = primitives.get(cssVar);
      expect(cssValue, `${cssVar} missing from primitives.css`).toBeDefined();
      expect(cssValue!.toLowerCase()).toBe(tokenValue.toLowerCase());
    },
  );

  // Z-index tiers duplicated between tokens.ts zIndex and primitives.css.
  const zIndexParity: Array<[string, number]> = [
    ['--z-hud-base', zIndex.hudBase],
    ['--z-modal', zIndex.modal],
    ['--z-modal-overlay', zIndex.modalOverlay],
  ];

  it.each(zIndexParity)(
    'primitives.css %s matches tokens.ts zIndex %d',
    (cssVar, tokenValue) => {
      const cssValue = primitives.get(cssVar);
      expect(cssValue, `${cssVar} missing from primitives.css`).toBeDefined();
      expect(Number(cssValue)).toBe(tokenValue);
    },
  );

  it('parses a non-trivial number of custom properties (guards a broken read)', () => {
    // Sanity: if the regex or file path breaks, this catches it before the
    // parity assertions silently pass on an empty map.
    expect(primitives.size).toBeGreaterThan(20);
  });
});
