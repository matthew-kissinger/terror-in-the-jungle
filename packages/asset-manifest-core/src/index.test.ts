// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { resolveAssetUrl, validateAssetManifest } from './index';

describe('asset manifest core', () => {
  it('validates required assets and duplicate ids', () => {
    const result = validateAssetManifest({
      assets: [
        { id: 'hero', url: 'hero.glb', type: 'model' },
        { id: 'hero', url: 'hero-copy.glb', type: 'model' },
      ],
    }, { requiredIds: ['terrain'] });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate asset id: hero');
    expect(result.errors).toContain('Missing required asset: terrain');
  });

  it('resolves relative URLs against manifest or caller base URL', () => {
    const manifest = {
      baseUrl: 'https://cdn.example.test/assets',
      assets: {
        tree: 'models/tree.glb',
        absolute: '/assets/ui.png',
      },
    };

    expect(resolveAssetUrl(manifest, 'tree')).toBe('https://cdn.example.test/assets/models/tree.glb');
    expect(resolveAssetUrl(manifest, 'tree', { baseUrl: 'https://override.test' })).toBe('https://override.test/models/tree.glb');
    expect(resolveAssetUrl(manifest, 'absolute')).toBe('/assets/ui.png');
  });

  it('warns on non-allowed types without failing validation', () => {
    const result = validateAssetManifest({
      assets: [{ id: 'audio', url: 'sound.ogg', type: 'audio' }],
    }, { allowedTypes: ['model'] });

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(['Asset audio has non-allowed type: audio']);
  });
});