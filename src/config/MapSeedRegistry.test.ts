import { afterEach, describe, expect, it } from 'vitest';
import { GameMode } from './gameModeTypes';
import { pickRandomVariant } from './MapSeedRegistry';

const originalWindow = globalThis.window;
const originalSessionStorage = globalThis.sessionStorage;

function installSeedSearch(search: string): void {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { search } },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
}

describe('MapSeedRegistry', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage,
    });
  });

  it('honors seed query pins for pre-baked modes', () => {
    installSeedSearch('?seed=42');

    expect(pickRandomVariant(GameMode.OPEN_FRONTIER)).toEqual(expect.objectContaining({
      seed: 42,
      navmeshAsset: '/data/navmesh/open_frontier-42.bin',
      heightmapAsset: '/data/heightmaps/open_frontier-42.f32',
    }));
  });

  it('falls back to registered variants when the requested seed is unavailable', () => {
    installSeedSearch('?seed=999999');

    const variant = pickRandomVariant(GameMode.ZONE_CONTROL);

    expect([42, 137, 2718]).toContain(variant?.seed);
  });
});
