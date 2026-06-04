/**
 * @vitest-environment jsdom
 *
 * Behavior tests for WorldBuilderConsole. Per docs/TESTING.md, these assert
 * observable runtime effects of toggles — not Tweakpane DOM layout, button
 * label strings, or internal state-key spellings.
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorldBuilderConsole,
  WORLDBUILDER_GLOBAL_KEY,
  getWorldBuilderState,
  isWorldBuilderFlagActive,
  toneMappingConstant,
  type WorldBuilderState,
} from './WorldBuilderConsole';
import { DebugHudRegistry } from '../../ui/debug/DebugHudRegistry';

interface FakeShadowMap {
  enabled: boolean;
}
interface FakeRenderer {
  shadowMap: FakeShadowMap;
  toneMapping: THREE.ToneMapping;
}
interface FakeGameRenderer {
  renderer: FakeRenderer;
}
interface FakeTimeScale {
  paused: boolean;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  stepOneFrame(): void;
}

function makeMockEngine(): {
  engine: unknown;
  three: FakeRenderer;
  timeScale: FakeTimeScale;
  pauseSpy: ReturnType<typeof vi.fn>;
  resumeSpy: ReturnType<typeof vi.fn>;
  stepSpy: ReturnType<typeof vi.fn>;
} {
  // Pre-seed the mock renderer with AGX so the "applyEffectiveToggles flips
  // the WebGLRenderer tonemap" test starts from the realistic init state.
  const three: FakeRenderer = {
    shadowMap: { enabled: true },
    toneMapping: THREE.AgXToneMapping,
  };
  const gameRenderer: FakeGameRenderer = { renderer: three };

  const pauseSpy = vi.fn();
  const resumeSpy = vi.fn();
  const stepSpy = vi.fn();
  const timeScale: FakeTimeScale = {
    paused: false,
    pause() {
      this.paused = true;
      pauseSpy();
    },
    resume() {
      this.paused = false;
      resumeSpy();
    },
    isPaused() {
      return this.paused;
    },
    stepOneFrame() {
      stepSpy();
    },
  };

  const engine = {
    renderer: gameRenderer,
    timeScale,
    systemManager: {
      // Empty — Heal & Refill is best-effort and tolerates absence.
    },
  };

  return { engine, three, timeScale, pauseSpy, resumeSpy, stepSpy };
}

let registry: DebugHudRegistry;

beforeEach(() => {
  registry = new DebugHudRegistry();
  localStorage.clear();
  delete (window as unknown as Record<string, unknown>)[WORLDBUILDER_GLOBAL_KEY];
});

afterEach(() => {
  registry.dispose();
  document.body.innerHTML = '';
  localStorage.clear();
  delete (window as unknown as Record<string, unknown>)[WORLDBUILDER_GLOBAL_KEY];
});

describe('WorldBuilderConsole lifecycle', () => {
  it('registers with the debug hud and starts hidden', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    expect(registry.getPanel('world-builder')).toBe(panel);
    expect(panel.isVisible()).toBe(false);
    panel.dispose();
  });

  it('Shift+G toggles the panel and reveals master hud when hidden', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    registry.setMasterVisible(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', shiftKey: true }));
    expect(panel.isVisible()).toBe(true);
    expect(registry.isMasterVisible()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', shiftKey: true }));
    expect(panel.isVisible()).toBe(false);
    panel.dispose();
  });

  it('plain G (without shift) does NOT toggle', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    registry.setMasterVisible(true);

    expect(panel.isVisible()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'G' })); // no shift
    expect(panel.isVisible()).toBe(false);
    panel.dispose();
  });

  it('dispose tears down the global window state', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    expect(getWorldBuilderState()).toBeDefined();
    panel.dispose();
    expect(getWorldBuilderState()).toBeUndefined();
  });
});

describe('WorldBuilderConsole state publishing', () => {
  it('publishes state on window.__worldBuilder', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    const published = (window as unknown as Record<string, WorldBuilderState>)[
      WORLDBUILDER_GLOBAL_KEY
    ];
    expect(published).toBeDefined();
    expect(published.invulnerable).toBe(false);
    expect(published.shadowsEnabled).toBe(true);
    expect(published.active).toBe(true);
    panel.dispose();
  });

  it('isWorldBuilderFlagActive reports current flag state', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);

    expect(isWorldBuilderFlagActive('invulnerable')).toBe(false);
    panel.applyState({ invulnerable: true });
    expect(isWorldBuilderFlagActive('invulnerable')).toBe(true);

    expect(isWorldBuilderFlagActive('infiniteAmmo')).toBe(false);
    panel.applyState({ infiniteAmmo: true });
    expect(isWorldBuilderFlagActive('infiniteAmmo')).toBe(true);

    panel.dispose();
  });

  it('without a registered console, isWorldBuilderFlagActive returns false', () => {
    expect(isWorldBuilderFlagActive('invulnerable')).toBe(false);
    expect(isWorldBuilderFlagActive('noClip')).toBe(false);
  });
});

describe('WorldBuilderConsole effective toggles', () => {
  it('shadowsEnabled=false disables WebGLRenderer shadow map', async () => {
    const { engine, three } = makeMockEngine();
    three.shadowMap.enabled = true;
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    expect(three.shadowMap.enabled).toBe(true);

    panel.applyState({ shadowsEnabled: false });
    expect(three.shadowMap.enabled).toBe(false);

    panel.applyState({ shadowsEnabled: true });
    expect(three.shadowMap.enabled).toBe(true);

    panel.dispose();
  });

  it('npcTickPaused toggles drive the timeScale into the matching state', async () => {
    const { engine, timeScale, pauseSpy, resumeSpy } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    pauseSpy.mockClear();
    resumeSpy.mockClear();

    panel.applyState({ npcTickPaused: true });
    expect(timeScale.isPaused()).toBe(true);
    expect(pauseSpy).toHaveBeenCalled();

    panel.applyState({ npcTickPaused: false });
    expect(timeScale.isPaused()).toBe(false);
    expect(resumeSpy).toHaveBeenCalled();

    panel.dispose();
  });

  it('toneMapping defaults to AGX and the toggle flips renderer.toneMapping to ACES and back', async () => {
    const { engine, three } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);

    // Init publishes default state ('agx') — applyEffectiveToggles ran once
    // during register(), so the renderer's tonemap is AGX.
    expect(panel.getState().toneMapping).toBe('agx');
    expect(three.toneMapping).toBe(THREE.AgXToneMapping);

    // Flip to ACES at runtime via the dev console.
    panel.applyState({ toneMapping: 'aces' });
    expect(three.toneMapping).toBe(THREE.ACESFilmicToneMapping);

    // Flip back to AGX.
    panel.applyState({ toneMapping: 'agx' });
    expect(three.toneMapping).toBe(THREE.AgXToneMapping);

    panel.dispose();
  });

  it('hudVisible=false hides elements with [data-hud-root]', async () => {
    const hud = document.createElement('div');
    hud.setAttribute('data-hud-root', '');
    document.body.appendChild(hud);

    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    expect(hud.style.display).toBe('');

    panel.applyState({ hudVisible: false });
    expect(hud.style.display).toBe('none');

    panel.applyState({ hudVisible: true });
    expect(hud.style.display).toBe('');

    panel.dispose();
  });
});

describe('WorldBuilderConsole useAdditiveSunSprite flag', () => {
  it('defaults to false (in-shader sun-disc is the primary path)', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    expect(panel.getState().useAdditiveSunSprite).toBe(false);
    // Published to window so AtmosphereSystem can read it per-frame.
    expect(getWorldBuilderState()?.useAdditiveSunSprite).toBe(false);
    panel.dispose();
  });

  it('applyState flips the flag and republishes it on window.__worldBuilder', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);

    panel.applyState({ useAdditiveSunSprite: true });
    expect(panel.getState().useAdditiveSunSprite).toBe(true);
    expect(getWorldBuilderState()?.useAdditiveSunSprite).toBe(true);

    panel.applyState({ useAdditiveSunSprite: false });
    expect(panel.getState().useAdditiveSunSprite).toBe(false);
    expect(getWorldBuilderState()?.useAdditiveSunSprite).toBe(false);

    panel.dispose();
  });

  it('hydrates a saved useAdditiveSunSprite=true from localStorage', async () => {
    localStorage.setItem(
      'worldBuilder.state.v1',
      JSON.stringify({ useAdditiveSunSprite: true }),
    );
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    expect(panel.getState().useAdditiveSunSprite).toBe(true);
    panel.dispose();
  });
});

describe('toneMappingConstant resolver', () => {
  it('maps the tonemap tokens to their THREE constants', () => {
    expect(toneMappingConstant('agx')).toBe(THREE.AgXToneMapping);
    expect(toneMappingConstant('aces')).toBe(THREE.ACESFilmicToneMapping);
  });
});

describe('WorldBuilderConsole persistence', () => {
  it('persists state to localStorage on applyState', async () => {
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    panel.applyState({ invulnerable: true, infiniteAmmo: true });
    const raw = localStorage.getItem('worldBuilder.state.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as WorldBuilderState;
    expect(parsed.invulnerable).toBe(true);
    expect(parsed.infiniteAmmo).toBe(true);
    panel.dispose();
  });

  it('hydrates from localStorage on register', async () => {
    localStorage.setItem(
      'worldBuilder.state.v1',
      JSON.stringify({ invulnerable: true, shadowsEnabled: false }),
    );
    const { engine, three } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    expect(panel.getState().invulnerable).toBe(true);
    expect(panel.getState().shadowsEnabled).toBe(false);
    expect(three.shadowMap.enabled).toBe(false);
    panel.dispose();
  });

  it('rejects an unknown tonemap token from localStorage and keeps the default', async () => {
    localStorage.setItem(
      'worldBuilder.state.v1',
      JSON.stringify({ toneMapping: 'krypton-glow' }),
    );
    const { engine, three } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    // Garbage value must NOT poison renderer.toneMapping at boot.
    expect(panel.getState().toneMapping).toBe('agx');
    expect(three.toneMapping).toBe(THREE.AgXToneMapping);
    panel.dispose();
  });

  it('hydrates a valid tonemap token from localStorage and applies it on boot', async () => {
    localStorage.setItem(
      'worldBuilder.state.v1',
      JSON.stringify({ toneMapping: 'aces' }),
    );
    const { engine, three } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    expect(panel.getState().toneMapping).toBe('aces');
    expect(three.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    panel.dispose();
  });

  it('dropped legacy keys do not leak in (schema drop)', async () => {
    localStorage.setItem(
      'worldBuilder.state.v1',
      JSON.stringify({ invulnerable: true, legacyDropped: 'x' }),
    );
    const { engine } = makeMockEngine();
    const panel = new WorldBuilderConsole(engine as never);
    await panel.register(registry);
    const state = panel.getState() as Record<string, unknown>;
    expect(state.invulnerable).toBe(true);
    expect(state.legacyDropped).toBeUndefined();
    panel.dispose();
  });
});
