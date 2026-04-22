/**
 * Behavior tests for the terrain-sandbox export helpers. Focus: shape of the
 * MapSeedRegistry entry, JSON round-trip, raw .f32 byte count matching the
 * heightmap size. DOM-dependent helpers (PNG encode, clipboard, downloads)
 * are exercised indirectly via the bundle builder in jsdom.
 * (See docs/TESTING.md.)
 */

import { describe, expect, it } from 'vitest';
import {
  buildParamsJson,
  buildRegistryEntry,
  formatRegistryLiteral,
  heightmapToF32Blob,
} from './heightmapExport';
import {
  DEFAULT_HEIGHTMAP_PARAMS,
  generateHeightmap,
} from './heightmapGenerator';

describe('buildRegistryEntry', () => {
  it('produces a seed + navmeshAsset + heightmapAsset triple', () => {
    const entry = buildRegistryEntry({ ...DEFAULT_HEIGHTMAP_PARAMS, seed: 1234 });
    expect(entry.seed).toBe(1234);
    expect(entry.navmeshAsset).toContain('1234');
    expect(entry.heightmapAsset).toContain('1234');
    expect(entry.heightmapAsset.endsWith('.f32')).toBe(true);
  });

  it('matches MapSeedRegistry field layout', () => {
    const entry = buildRegistryEntry({ ...DEFAULT_HEIGHTMAP_PARAMS, seed: 42 });
    // Must match the three-key shape MapSeedRegistry's MapSeedVariant uses.
    expect(Object.keys(entry).sort()).toEqual(['heightmapAsset', 'navmeshAsset', 'seed']);
  });
});

describe('formatRegistryLiteral', () => {
  it('emits a valid-looking TypeScript object literal with the seed inline', () => {
    const entry = buildRegistryEntry({ ...DEFAULT_HEIGHTMAP_PARAMS, seed: 99 });
    const literal = formatRegistryLiteral(entry);
    expect(literal).toContain('seed: 99');
    expect(literal).toContain("navmeshAsset:");
    expect(literal).toContain("heightmapAsset:");
    expect(literal.trim().endsWith('},')).toBe(true);
  });
});

describe('buildParamsJson', () => {
  it('round-trips through JSON.stringify / parse', () => {
    const heightmap = generateHeightmap({ resolution: 128 });
    const obj = buildParamsJson(heightmap, DEFAULT_HEIGHTMAP_PARAMS);
    const round = JSON.parse(JSON.stringify(obj));
    expect(round.registryEntry.seed).toBe(DEFAULT_HEIGHTMAP_PARAMS.seed);
    expect(round.params.octaves).toBe(DEFAULT_HEIGHTMAP_PARAMS.octaves);
    expect(round.meta.resolution).toBe(128);
    expect(typeof round.meta.exportedAt).toBe('string');
  });
});

describe('heightmapToF32Blob', () => {
  it('emits bytes matching the heightmap element count', () => {
    const heightmap = generateHeightmap({ resolution: 128 });
    const blob = heightmapToF32Blob(heightmap);
    // 128 * 128 floats, 4 bytes each
    expect(blob.size).toBe(128 * 128 * 4);
  });
});

describe('buildParamsJson meta wiring', () => {
  it('reflects heightmap min/max and resolution in the JSON meta block', () => {
    const heightmap = generateHeightmap({ resolution: 128 });
    const obj = buildParamsJson(heightmap, DEFAULT_HEIGHTMAP_PARAMS);
    expect(obj.meta.resolution).toBe(128);
    expect(obj.meta.minHeight).toBe(heightmap.min);
    expect(obj.meta.maxHeight).toBe(heightmap.max);
  });
});
