import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NavmeshSystem } from './NavmeshSystem';

// Mock the recast-navigation modules since WASM isn't available in test env
vi.mock('@recast-navigation/core', () => ({
  init: vi.fn().mockRejectedValue(new Error('WASM not available in tests')),
  Crowd: vi.fn(),
}));
vi.mock('@recast-navigation/three', () => ({
  threeToSoloNavMesh: vi.fn(),
  threeToTileCache: vi.fn(),
}));
vi.mock('../../utils/Logger');

describe('NavmeshSystem', () => {
  let system: NavmeshSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    system = new NavmeshSystem();
  });

  it('starts with wasmReady = false', () => {
    expect(system.isWasmReady()).toBe(false);
    expect(system.isReady()).toBe(false);
  });

  it('gracefully degrades when WASM fails to init', async () => {
    await system.init();
    // WASM mock rejects, so should degrade
    expect(system.isWasmReady()).toBe(false);
    expect(system.isReady()).toBe(false);
  });

  it('skips navmesh generation when WASM not ready', async () => {
    await system.generateNavmesh(400);
    expect(system.isReady()).toBe(false);
  });

  it('returns null adapter when navmesh not generated', () => {
    expect(system.getAdapter()).toBeNull();
  });

  it('update is safe when not ready', () => {
    // Should not throw
    system.update(0.016);
  });

  it('dispose is safe when not initialized', () => {
    // Should not throw
    system.dispose();
  });
});
